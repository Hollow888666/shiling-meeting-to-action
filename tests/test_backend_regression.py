from __future__ import annotations

import concurrent.futures
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.extraction import extract_meeting, extract_due_date
from backend.llm import try_extract_with_llm
from backend.seed import SAMPLE_TRANSCRIPT
from backend.store import ConflictError, Database


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "test.db"
        self.db = Database(self.path)
        self.meeting = self.db.get_state()["meeting"]["id"]

    def test_restart_preserves_tasks_comments_and_history(self):
        task = self.db.create_task({"title": "持久化测试", "meetingId": self.meeting})
        self.db.add_comment(task["id"], "小王", "请确认")
        self.db.reset_demo()
        reopened = Database(self.path)
        self.assertIn(task["id"], [t["id"] for t in reopened.get_state(self.meeting)["tasks"]])
        self.assertEqual(reopened.list_comments(task["id"])["comments"][0]["body"], "请确认")
        self.assertEqual(len(reopened.list_meetings()["meetings"]), 2)

    def test_existing_database_migrates_task_version(self):
        original = self.db.get_state()
        connection = sqlite3.connect(self.path)
        try:
            connection.execute("ALTER TABLE tasks DROP COLUMN version")
            connection.commit()
        finally:
            connection.close()
        migrated = Database(self.path)
        state = migrated.get_state(self.meeting)
        self.assertEqual(len(state["tasks"]), len(original["tasks"]))
        self.assertTrue(all(task["version"] == 1 for task in state["tasks"]))
        updated = migrated.update_task(state["tasks"][0]["id"], {"status": "done", "version": 1})
        self.assertEqual(updated["version"], 2)

    def test_meeting_scoped_tasks_and_switching(self):
        second = self.db.reset_demo()["meeting"]["id"]
        task = self.db.create_task({"title": "只属于第一个会议", "meetingId": self.meeting})
        self.db.activate_meeting(self.meeting)
        self.assertIn(task["id"], [t["id"] for t in self.db.get_state(self.meeting)["tasks"]])
        self.assertNotIn(task["id"], [t["id"] for t in self.db.get_state(second)["tasks"]])
        self.assertEqual(self.db.current_meeting_id(), second)

    def test_failed_transaction_rolls_back_whole_meeting(self):
        before = self.db.list_meetings()
        state = extract_meeting(SAMPLE_TRANSCRIPT)
        state["tasks"].append(dict(state["tasks"][0]))
        with self.assertRaises(Exception):
            self.db.replace_state(state, preserve_history=True)
        self.assertEqual(self.db.list_meetings(), before)

    def test_two_concurrent_updates_only_one_succeeds(self):
        task = self.db.create_task({"title": "并发测试"})
        barrier = threading.Barrier(2)
        def update(title):
            barrier.wait(timeout=5)
            try:
                return self.db.update_task(task["id"], {"title": title, "version": 1})["title"]
            except ConflictError:
                return "conflict"
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(update, ["甲", "乙"]))
        self.assertEqual(results.count("conflict"), 1)
        saved = next(t for t in self.db.get_state()["tasks"] if t["id"] == task["id"])
        self.assertEqual(saved["version"], 2)
        self.assertIn(saved["title"], {"甲", "乙"})
        with self.assertRaises(ConflictError):
            self.db.delete_task(task["id"], 1)

    def test_task_validation_and_atomicity(self):
        task = self.db.create_task({"title": "原始任务"})
        invalid = [
            {"title": " "}, {"status": "invalid"}, {"priority": "urgent"},
            {"due": "2026-02-30"}, {"due": "20260201"}, {"due": None}, {"tags": "not a list"},
            {"notes": None}, {"version": True},
        ]
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.db.update_task(task["id"], payload)
        actual = next(t for t in self.db.get_state()["tasks"] if t["id"] == task["id"])
        self.assertEqual(actual["title"], "原始任务")
        self.assertEqual(actual["version"], 1)

    def test_analytics_dates_and_done_tasks(self):
        demo = self.db.get_state()
        for task in demo["tasks"]:
            self.db.delete_task(task["id"])
        today = date.today()
        for title, day, status in [
            ("overdue", today - timedelta(days=1), "todo"),
            ("today", today, "doing"),
            ("soon", today + timedelta(days=3), "todo"),
            ("later", today + timedelta(days=4), "todo"),
            ("done", today - timedelta(days=1), "done"),
        ]:
            self.db.create_task({"title": title, "due": day.isoformat(), "status": status})
        summary = self.db.analytics()
        self.assertEqual((summary["totalTasks"], summary["overdue"], summary["dueSoon"]), (5, 1, 2))
        self.assertEqual(summary["completionRate"], 20.0)

    def test_comment_lifecycle_and_missing_task(self):
        task = self.db.create_task({"title": "评论测试"})
        with self.assertRaises(ValueError):
            self.db.add_comment(task["id"], "", "  ")
        self.db.add_comment(task["id"], "  ", " first ")
        self.assertEqual(self.db.list_comments(task["id"])["comments"][0]["author"], "匿名")
        self.db.delete_task(task["id"])
        with self.assertRaises(KeyError):
            self.db.list_comments(task["id"])

    def test_search_and_activity_follow_changes(self):
        task = self.db.create_task({"title": "回归独特关键词", "owner": "测试员"})
        self.assertEqual(self.db.search("回归独特关键词")["tasks"][0]["id"], task["id"])
        self.db.update_task(task["id"], {"title": "已替换的标题", "version": 1})
        self.assertEqual(self.db.search("回归独特关键词")["tasks"], [])
        self.db.delete_task(task["id"], version=2)
        types = [entry["type"] for entry in self.db.list_activity()["activities"]]
        self.assertEqual(types[:3], ["task.deleted", "task.updated", "task.created"])


class ExtractionTests(unittest.TestCase):
    def test_dates_and_sample(self):
        self.assertEqual(extract_due_date("明天完成", "2026-12-31"), "2027-01-01")
        self.assertEqual(extract_due_date("2月30日前完成", "2026-02-01"), "")
        self.assertEqual(extract_due_date("2月29日前完成", "2024-02-01"), "2024-02-29")
        invalid_date = extract_meeting("日期：2026年2月30日\n小王：请小李在2月30日前完成任务。", today=date(2026, 2, 1))
        self.assertEqual(invalid_date["meeting"]["date"], "2026-02-01")
        self.assertTrue(all(task["due"] == "" for task in invalid_date["tasks"]))
        result = extract_meeting(SAMPLE_TRANSCRIPT)
        self.assertTrue(result["tasks"])
        self.assertTrue(all(task["source"] for task in result["tasks"]))

    def test_invalid_model_responses_fall_back(self):
        fallback = extract_meeting(SAMPLE_TRANSCRIPT)
        class Response:
            def __init__(self, content): self.content = content
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self):
                return json.dumps({"choices": [{"message": {"content": self.content}}]}).encode()
        with patch.dict(os.environ, {"SHILING_LLM_BASE_URL": "https://example.test/v1", "SHILING_LLM_MODEL": "test"}):
            for content in ("[]", "null", "invalid json", '{"tasks":[{"title":"任务","tags":123}]}'):
                with self.subTest(content=content), patch("urllib.request.urlopen", return_value=Response(content)):
                    self.assertIsNone(try_extract_with_llm(SAMPLE_TRANSCRIPT, fallback))
            with patch("urllib.request.urlopen", side_effect=OSError("offline")):
                self.assertIsNone(try_extract_with_llm(SAMPLE_TRANSCRIPT, fallback))
            valid = '{"tasks":[{"title":"完成测试","due":"2026-02-30","tags":[]}],"risks":[],"decisions":[]}'
            with patch("urllib.request.urlopen", return_value=Response(valid)):
                result = try_extract_with_llm(SAMPLE_TRANSCRIPT, fallback)
                self.assertEqual(result["tasks"][0]["due"], "")
                self.assertEqual(result["meeting"], fallback["meeting"])
            with patch("urllib.request.urlopen") as call:
                self.assertIsNone(try_extract_with_llm("长" * 12001, fallback))
                call.assert_not_called()
        with patch.dict(os.environ, {"SHILING_LLM_BASE_URL": "invalid endpoint", "SHILING_LLM_MODEL": "test"}):
            self.assertIsNone(try_extract_with_llm(SAMPLE_TRANSCRIPT, fallback))


if __name__ == "__main__":
    unittest.main()
