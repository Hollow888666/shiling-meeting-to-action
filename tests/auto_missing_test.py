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
PORT = 8882
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


def main():
    database_temp = tempfile.TemporaryDirectory(prefix="shiling-auto-missing-test-")
    environment = os.environ.copy()
    environment["SHILING_DATABASE_PATH"] = str(
        Path(database_temp.name) / "auto-missing-test.db"
    )
    server = subprocess.Popen(
        [sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=ROOT,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(40):
            try:
                if request("/api/health")["ok"]:
                    break
            except Exception:
                time.sleep(0.2)
        request("/api/reset", "POST", {})
        content = """# 客户交付周会
日期：2026-11-20
参会：陈晨、林晓

陈晨：决定第一期只开放知识库问答。
林晓：需要完成权限清单。
陈晨：上线回滚能力还存在风险。
"""
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.goto(BASE, wait_until="load")
            page.evaluate("localStorage.clear()")
            page.reload(wait_until="load")
            page.wait_for_timeout(400)
            page.locator('[data-view="auto"]').first.click()
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
            page.locator(".auto-primary").click()
            expect(page.locator(".auto-primary")).to_have_text(
                "补齐并继续", timeout=30000
            )
            due_input = page.locator('[data-auto-resolution$=":due"]').first
            expect(due_input).to_be_visible()
            due_input.fill("2026-11-21")
            page.locator(".auto-primary").click()
            expect(page.locator(".auto-primary")).to_have_text(
                "生成最终文档", timeout=20000
            )
            completeness = request("/api/meetings/completeness")["completeness"]
            assert completeness["ready"] is True
            browser.close()
        print("auto_missing_test=passed")
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
