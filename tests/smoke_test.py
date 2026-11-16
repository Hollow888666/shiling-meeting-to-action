from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def main():
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge" if sys.platform == "win32" else None, headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.goto((ROOT / "index.html").as_uri(), wait_until="load")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(400)

        expect(page.locator(".auto-view")).to_be_visible()
        page.locator('.sidebar [data-view="board"]').click()
        page.wait_for_timeout(300)
        expect(page.locator(".task-card")).to_have_count(5)

        search = page.locator("#task-search")
        search.fill("权限")
        page.wait_for_timeout(250)
        expect(page.locator(".task-card")).to_have_count(1)
        search.fill("")
        page.wait_for_timeout(250)

        page.locator('[data-owner-filter="林晓"]').click()
        page.wait_for_timeout(250)
        expect(page.locator(".task-card")).to_have_count(1)
        page.locator('[data-owner-filter="all"]').click()
        page.wait_for_timeout(250)

        page.locator('[data-task-id="t1"]').click()
        page.locator("#task-title").fill("整理知识库权限清单并标记审批场景 v2")
        page.get_by_role("button", name="保存任务").click()
        page.wait_for_timeout(350)
        expect(page.get_by_text("整理知识库权限清单并标记审批场景 v2")).to_be_visible()

        page.locator('[data-add-status="backlog"]').click()
        page.locator("#task-title").fill("准备客户验收演示脚本")
        page.locator("#task-owner").fill("陈晨")
        page.locator("#task-due").fill("2026-11-20")
        page.locator("#task-priority").select_option("medium")
        page.get_by_role("button", name="保存任务").click()
        page.wait_for_timeout(350)
        expect(page.get_by_text("准备客户验收演示脚本")).to_be_visible()

        source_card = page.locator('.board-column[data-status="backlog"] .task-card').first
        target_column = page.locator('.board-column[data-status="done"]')
        source_card.drag_to(target_column)
        page.wait_for_timeout(450)
        expect(page.locator('.board-column[data-status="done"] .task-card')).to_have_count(1)

        before = page.locator(".task-card").count()
        page.get_by_role("button", name="决策风险").click()
        page.wait_for_timeout(350)
        page.locator('[data-convert-type="risk"]').first.click()
        page.wait_for_timeout(350)
        page.get_by_role("button", name="任务看板").click()
        page.wait_for_timeout(350)
        expect(page.locator(".task-card")).to_have_count(before + 1)

        with page.expect_download() as download_info:
            page.locator("#export-md-btn").click()
        download = download_info.value
        assert download.suggested_filename.endswith(".md")

        assert not errors, errors
        print("smoke_test=passed")
        browser.close()


if __name__ == "__main__":
    main()
