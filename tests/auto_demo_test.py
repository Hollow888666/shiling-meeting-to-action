from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PORT = 8883
BASE = f"http://127.0.0.1:{PORT}"


def request(path: str, method: str = "GET", body: dict | None = None):
    data = (
        json.dumps(body, ensure_ascii=False).encode("utf-8")
        if body is not None
        else None
    )
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
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
    database_temp = tempfile.TemporaryDirectory(prefix="shiling-auto-demo-test-")
    environment = os.environ.copy()
    environment["SHILING_DATABASE_PATH"] = str(
        Path(database_temp.name) / "auto-demo-test.db"
    )
    environment["SHILING_LLM_BASE_URL"] = ""
    environment["SHILING_LLM_MODEL"] = ""
    server = subprocess.Popen(
        [sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=ROOT,
        env=environment,
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
            page.goto(BASE, wait_until="load")
            page.evaluate("localStorage.clear()")
            page.reload(wait_until="load")
            page.wait_for_timeout(500)
            page.locator('[data-view="auto"]').first.click()
            page.get_by_role("button", name="载入演示文件").click()

            expect(page.locator(".auto-file-item")).to_contain_text(
                "客户交付验收评审会_演示材料.txt"
            )
            expect(page.locator("#auto-title")).to_have_value("客户交付验收评审会")
            expect(page.locator("#auto-participants")).to_have_value("陈晨、林晓、周远")

            page.locator(".auto-primary").click()
            expect(page.locator(".auto-primary")).to_have_text(
                "补齐并继续", timeout=30000
            )
            owner_input = page.locator('[data-auto-resolution$=":owner"]')
            expect(owner_input).to_have_count(1)
            owner_input.fill("沈禾")
            page.locator(".auto-primary").click()
            expect(page.locator(".auto-primary")).to_have_text(
                "生成最终文档", timeout=20000
            )
            page.locator(".auto-primary").click()
            expect(page.locator(".auto-document-preview")).to_contain_text(
                "沈禾", timeout=20000
            )
            assert request("/api/meetings/completeness")["completeness"]["ready"]
            assert not errors, errors
            page.wait_for_timeout(3000)
            page.screenshot(
                path=str(ROOT / "screenshots" / "auto-demo-final.png"),
                full_page=True,
            )

            mobile = browser.new_page(viewport={"width": 390, "height": 844})
            mobile.on("pageerror", lambda error: errors.append(str(error)))
            mobile.goto(BASE, wait_until="load")
            mobile.evaluate("localStorage.clear()")
            mobile.reload(wait_until="load")
            mobile.wait_for_timeout(500)
            mobile.locator('.mobile-nav [data-view="auto"]').click()
            mobile.get_by_role("button", name="载入演示文件").click()
            expect(mobile.locator(".auto-file-item")).to_be_visible()
            assert mobile.evaluate("document.body.scrollWidth") <= 390
            assert not errors, errors
            mobile.wait_for_timeout(3000)
            mobile.screenshot(
                path=str(ROOT / "screenshots" / "auto-demo-mobile.png"),
                full_page=True,
            )
            browser.close()
        print("auto_demo_test=passed")
    finally:
        try:
            request("/api/reset", "POST", {})
        except Exception:
            pass
        server.terminate()
        server.wait(timeout=5)
        database_temp.cleanup()


if __name__ == "__main__":
    main()
