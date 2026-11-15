from __future__ import annotations

import json
import subprocess
import sys
import time
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
        print("backend_api_test=passed")
    finally:
        try:
            request("/api/reset", "POST", {})
        except Exception:
            pass
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
