from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "screenshots"


def collect_errors(page):
    errors = []
    page.on(
        "console",
        lambda message: errors.append(f"console:{message.type}:{message.text}")
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: errors.append(f"pageerror:{error}"))
    return errors


def run_desktop(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    errors = collect_errors(page)
    page.goto((ROOT / "index.html").as_uri(), wait_until="load")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="load")
    page.wait_for_timeout(500)
    page.get_by_role("button", name="导入会议").click()
    page.wait_for_timeout(350)
    page.screenshot(path=str(OUT / "desktop-import.png"), full_page=True)
    page.get_by_role("button", name="载入示例会议").click()
    page.get_by_role("button", name="开始提取").click()
    page.wait_for_timeout(2600)
    print("tasks_after_extract=", page.locator(".task-card").count())
    print("toast=", page.locator(".toast").last.inner_text() if page.locator(".toast").count() else "none")

    page.get_by_role("button", name="会议记录").click()
    page.wait_for_timeout(450)
    print("meeting_heading=", page.locator("h1").inner_text())
    page.screenshot(path=str(OUT / "desktop-meeting.png"), full_page=True)

    page.get_by_role("button", name="决策风险").click()
    page.wait_for_timeout(450)
    print("risk_heading=", page.locator("h1").inner_text())
    print("risk_entries=", page.locator(".risk-entry").count())
    print("decisions=", page.locator(".decision-entry").count())
    page.screenshot(path=str(OUT / "desktop-risks.png"), full_page=True)
    print("desktop_errors=", errors)
    page.close()


def run_mobile(browser):
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    errors = collect_errors(page)
    page.goto((ROOT / "index.html").as_uri(), wait_until="load")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="load")
    page.wait_for_timeout(500)
    print("mobile_heading=", page.locator("h1").inner_text())
    print(
        "mobile_scroll=",
        page.evaluate("document.body.scrollWidth"),
        "viewport=",
        page.evaluate("window.innerWidth"),
    )
    page.screenshot(path=str(OUT / "mobile-board.png"), full_page=True)
    page.get_by_role("button", name="导入").click()
    page.wait_for_timeout(350)
    page.screenshot(path=str(OUT / "mobile-import.png"), full_page=True)
    print("mobile_errors=", errors)
    page.close()


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        run_desktop(browser)
        browser.close()

        browser = playwright.chromium.launch(channel="msedge", headless=True)
        run_mobile(browser)
        browser.close()


if __name__ == "__main__":
    main()
