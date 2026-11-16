from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "shiling_mobile.html"
SCREENSHOT = ROOT / "screenshots" / "mobile-standalone.png"


def main():
    SCREENSHOT.parent.mkdir(exist_ok=True)
    errors = []
    requests = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge" if sys.platform == "win32" else None, headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("request", lambda request: requests.append(request.url))
        page.goto(FILE.as_uri(), wait_until="load")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(600)

        expect(page.locator("h1")).to_have_text("行动任务看板")
        expect(page.locator(".task-card")).to_have_count(5)
        assert page.evaluate("document.body.scrollWidth") == 390
        assert all(url.startswith("file:") or url.startswith("data:") for url in requests), requests

        page.get_by_role("button", name="导入").click()
        page.get_by_role("button", name="载入示例会议").click()
        page.get_by_role("button", name="开始提取").click()
        page.wait_for_timeout(2400)
        expect(page.locator(".task-card")).to_have_count(4)
        page.screenshot(path=str(SCREENSHOT), full_page=True)

        assert not errors, errors
        print("standalone_check=passed")
        print(f"screenshot={SCREENSHOT}")
        browser.close()


if __name__ == "__main__":
    main()
