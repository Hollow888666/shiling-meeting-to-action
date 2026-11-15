from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PORT = 8878
BASE_URL = f"http://127.0.0.1:{PORT}"


def request(path: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body or {}, ensure_ascii=False).encode("utf-8") if body is not None else None
    request_value = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method=method,
    )
    with urllib.request.urlopen(request_value, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_server():
    for _ in range(40):
        try:
            if request("/api/health")["ok"]:
                return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("Backend did not start.")


def main():
    server = subprocess.Popen(
        [
            sys.executable,
            "server.py",
            "--host",
            "127.0.0.1",
            "--port",
            str(PORT),
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    errors = []
    try:
        wait_for_server()
        request("/api/reset", "POST", {})

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "console",
                lambda message: errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.goto(BASE_URL, wait_until="load")
            page.evaluate("localStorage.clear()")
            page.reload(wait_until="load")
            page.wait_for_timeout(600)

            expect(page.locator("#engine-name")).to_have_text("后端已连接")
            expect(page.locator(".task-card")).to_have_count(5)

            page.get_by_role("button", name="导入会议").click()
            page.get_by_role("button", name="载入示例会议").click()
            page.get_by_role("button", name="开始提取").click()
            page.wait_for_timeout(2600)
            expect(page.locator(".task-card")).to_have_count(4)

            page.reload(wait_until="load")
            page.wait_for_timeout(600)
            expect(page.locator(".task-card")).to_have_count(4)

            meetings = request("/api/meetings")
            assert len(meetings["meetings"]) >= 2

            page.locator("#meeting-switcher").click()
            page.wait_for_timeout(450)
            expect(page.locator(".meeting-option")).to_have_count(len(meetings["meetings"]))
            page.locator(".meeting-option").nth(1).click()
            page.wait_for_timeout(650)
            expect(page.locator(".task-card")).to_have_count(5)

            page.locator("#meeting-switcher").click()
            page.wait_for_timeout(450)
            page.locator(".meeting-option").nth(0).click()
            page.wait_for_timeout(650)
            expect(page.locator(".task-card")).to_have_count(4)

            page.locator(".task-card").first.click()
            page.locator("#task-title").fill("后端持久化任务验证")
            page.get_by_role("button", name="保存任务").click()
            page.wait_for_timeout(700)

            state = request("/api/state")
            assert any(task["title"] == "后端持久化任务验证" for task in state["tasks"])
            assert not errors, errors
            page.screenshot(path=str(ROOT / "screenshots" / "desktop-backend.png"), full_page=True)
            browser.close()
        print("backend_ui_test=passed")
    finally:
        try:
            request("/api/reset", "POST", {})
        except Exception:
            pass
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
