from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
PORT = 8879
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
    temp = tempfile.TemporaryDirectory()
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
        env={**os.environ, "SHILING_DB_PATH": str(Path(temp.name) / "test.db")},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_server()
        request("/api/reset", "POST", {})
        state = request("/api/state")
        assert len(state["tasks"]) == 5

        analytics = request("/api/analytics")
        assert analytics["totalTasks"] == 5
        assert "owners" in analytics

        search = request(f"/api/search?q={quote('知识库')}")
        assert search["tasks"]

        task_id = state["tasks"][0]["id"]
        comment = request(
            f"/api/tasks/{task_id}/comments",
            "POST",
            {"author": "接口测试", "body": "请补充回滚验证。"},
        )
        assert comment["comment"]["body"] == "请补充回滚验证。"
        comments = request(f"/api/tasks/{task_id}/comments")
        assert len(comments["comments"]) == 1

        activity = request("/api/activity?limit=20")
        assert any(item["type"] == "comment.added" for item in activity["activities"])

        extracted = request(
            "/api/meetings/extract",
            "POST",
            {"transcript": state["meeting"]["transcript"]},
        )
        assert extracted["state"]["tasks"]
        assert len(request("/api/meetings")["meetings"]) >= 2
        first_id = state["meeting"]["id"]
        second_id = extracted["state"]["meeting"]["id"]
        request(f"/api/meetings/{first_id}/activate", "POST", {})
        assert request(f"/api/state?meetingId={second_id}")["meeting"]["id"] == second_id
        task = request("/api/tasks", "POST", {"title": "隔离测试", "meetingId": first_id})["task"]
        assert any(item["id"] == task["id"] for item in request(f"/api/state?meetingId={first_id}")["tasks"])
        assert all(item["id"] != task["id"] for item in request(f"/api/state?meetingId={second_id}")["tasks"])
        task_path = f"/api/tasks/{task['id']}"
        updated = request(task_path, "PUT", {"title": "先保存的修改", "version": task["version"]})["task"]
        assert updated["version"] == task["version"] + 1
        try:
            request(task_path, "PUT", {"title": "过期修改", "version": task["version"]})
            raise AssertionError("Stale update was accepted")
        except urllib.error.HTTPError as error:
            assert error.code == 409
        assert any(item["title"] == "先保存的修改" for item in request(f"/api/state?meetingId={first_id}")["tasks"])
        before = len(request("/api/meetings")["meetings"])
        request("/api/reset", "POST", {})
        assert len(request("/api/meetings")["meetings"]) == before + 1
        print("backend_api_test=passed")
    finally:
        try:
            request("/api/reset", "POST", {})
        except Exception:
            pass
        server.terminate()
        server.wait(timeout=5)
        temp.cleanup()


if __name__ == "__main__":
    main()
