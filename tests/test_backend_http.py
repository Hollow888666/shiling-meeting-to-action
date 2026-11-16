from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from urllib.parse import quote
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        env = {**os.environ, "SHILING_DB_PATH": str(Path(cls.temp.name) / "api.db"), "SHILING_ACCESS_CODE": "test-code", "SHILING_LLM_BASE_URL": "", "SHILING_LLM_MODEL": ""}
        cls.server = subprocess.Popen([sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(cls.port)], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                if cls.request("/api/health")[0] == 200:
                    return
            except OSError:
                time.sleep(0.1)
        cls.tearDownClass()
        raise RuntimeError("Server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.temp.cleanup()

    @classmethod
    def request(cls, path, method="GET", body=None, authorized=True, headers=None):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        request_headers = {"Content-Type": "application/json", **(headers or {})}
        if authorized:
            request_headers["X-Shiling-Access"] = "test-code"
        req = urllib.request.Request(cls.base + path, data=data, method=method, headers=request_headers)
        try:
            response = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read().decode())

    def test_authentication_and_missing_resources(self):
        self.assertEqual(self.request("/api/state", authorized=False)[0], 401)
        for path in ("/api/state?meetingId=missing", "/api/tasks/missing/comments", "/api/not-found"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request("/api/tasks", "POST", {"title": "x", "meetingId": "missing"})[0], 404)

    def test_invalid_bodies_and_task_fields(self):
        for body in (b"{", b"[]", {"title": ""}, {"title": "x", "due": None}, {"title": "x", "status": "wrong"}):
            with self.subTest(body=body):
                self.assertEqual(self.request("/api/tasks", "POST", body)[0], 400)
        self.assertEqual(self.request("/api/meetings/extract", "POST", {"transcript": "太短"})[0], 400)
        self.assertEqual(self.request("/api/meetings/extract", "POST", {"transcript": ["x"] * 40})[0], 400)

    def test_concurrent_version_conflicts_and_comment_deletion(self):
        status, payload = self.request("/api/tasks", "POST", {"title": "接口测试"})
        self.assertEqual(status, 201)
        task = payload["task"]
        path = f"/api/tasks/{task['id']}"
        self.assertEqual(self.request("/api/tasks/ignored/" + task["id"], "DELETE")[0], 404)
        self.assertEqual(self.request("/api/tasks/ignored/" + task["id"], "PUT", {"title": "wrong route"})[0], 404)
        self.assertEqual(self.request(path + "/comments", "POST", {"body": "跟进"})[0], 201)
        self.assertEqual(self.request(path, "PUT", {"title": "已修改", "version": 1})[0], 200)
        self.assertEqual(self.request(path, "PUT", {"title": "过期修改", "version": 1})[0], 409)
        self.assertEqual(self.request(path, "DELETE", headers={"If-Match": "1"})[0], 409)
        self.assertEqual(self.request(path, "DELETE", headers={"If-Match": "2"})[0], 200)
        self.assertEqual(self.request(path + "/comments")[0], 404)

    def test_meeting_scoped_analytics_search_activity_and_export(self):
        first = self.request("/api/reset", "POST", {})[1]["state"]["meeting"]["id"]
        second = self.request("/api/reset", "POST", {})[1]["state"]["meeting"]["id"]
        task = self.request("/api/tasks", "POST", {"title": "独特会议关键字", "meetingId": first})[1]["task"]
        self.request(f"/api/tasks/{task['id']}/comments", "POST", {"author": "访客", "body": "进展正常"})
        for meeting, count in ((first, 1), (second, 0)):
            suffix = f"meetingId={meeting}"
            self.assertEqual(self.request(f"/api/analytics?{suffix}")[1]["comments"], count)
            found = self.request(f"/api/search?{suffix}&q={quote('独特会议关键字')}")[1]["tasks"]
            self.assertEqual(len(found), count)
            activity = self.request(f"/api/activity?{suffix}")[1]
            self.assertEqual(activity["meetingId"], meeting)
            self.assertEqual(any(item["type"] == "comment.added" for item in activity["activities"]), bool(count))
            self.assertEqual(self.request(f"/api/export/json?{suffix}")[1]["meeting"]["id"], meeting)
        for endpoint in ("analytics", "activity", "search", "export/json"):
            self.assertEqual(self.request(f"/api/{endpoint}?meetingId=missing")[0], 404)
        self.assertEqual(self.request(f"/api/tasks/{task['id']}/comments", "POST", {"body": "a" * 2001})[0], 400)


if __name__ == "__main__":
    unittest.main()
