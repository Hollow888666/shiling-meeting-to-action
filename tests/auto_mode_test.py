from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PORT = 8881
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
        content = """# 客户交付周会
日期：2026-11-20
参会：陈晨、林晓

陈晨：请林晓在11月20日前完成权限清单。
陈晨：决定第一期只开放知识库问答和流程查询。
林晓：上线回滚能力还存在风险，必须在上线前验证。
"""
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
            page.wait_for_timeout(300)

            page.locator("#auto-title").fill("客户交付周会")
            page.locator("#auto-date").fill("2026-11-20")
            page.locator("#auto-participants").fill("陈晨、林晓")
            page.locator("#auto-files").set_input_files(
                {
                    "name": "客户交付周会.md",
                    "mimeType": "text/markdown",
                    "buffer": content.encode("utf-8"),
                }
            )
            page.wait_for_timeout(400)
            expect(page.locator(".auto-view button")).to_have_count(1)
            page.locator(".auto-primary").click()
            expect(page.locator(".auto-primary")).to_have_text(
                "生成最终文档", timeout=30000
            )

            state = request("/api/state")
            assert state["meeting"]["title"] == "客户交付周会"
            assert state["tasks"]
            page.locator(".auto-primary").click()
            expect(page.locator(".auto-document-preview")).to_be_visible(timeout=20000)
            expect(page.locator(".auto-document-preview")).to_contain_text(
                "# 客户交付周会"
            )
            expect(page.locator(".auto-view button")).to_have_count(1)
            assert not errors, errors
            page.wait_for_timeout(900)
            page.screenshot(
                path=str(ROOT / "screenshots" / "auto-mode-final.png"),
                full_page=True,
            )
            browser.close()
        print("auto_mode_test=passed")
    finally:
        try:
            request("/api/reset", "POST", {})
        except Exception:
            pass
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
