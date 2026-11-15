from __future__ import annotations

import json
import subprocess
import sys
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


def upload_file(path: str, filename: str, content: bytes, content_type: str):
    boundary = "----ShilingTestBoundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8") + content + (
        f"\r\n--{boundary}--\r\n"
    ).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def upload_text(filename: str, content: str):
    return upload_file(
        "/api/materials/extract",
        filename,
        content.encode("utf-8"),
        "text/markdown; charset=utf-8",
    )


def fake_audio():
    boundary = "----ShilingAudioBoundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="meeting.wav"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
        "RIFF"
        f"\r\n--{boundary}--\r\n"
    ).encode("utf-8")
    req = urllib.request.Request(
        BASE + "/api/audio/transcribe",
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))
    return None, None


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

        health = request("/api/health")
        if not health["transcriptionConfigured"]:
            status, payload = fake_audio()
            assert status == 503
            assert payload["code"] == "transcription_not_configured"

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

        material = upload_text(
            "周会材料.md",
            "# 客户交付周会\n陈晨：请林晓在11月20日前完成权限清单。",
        )["material"]
        assert material["charCount"] > 10
        composed = request(
            "/api/meetings/compose",
            "POST",
            {
                "title": "客户交付周会",
                "participants": ["陈晨", "林晓"],
                "documents": [material],
                "manualText": "补充：上线前完成验收。",
            },
        )
        assert composed["state"]["meeting"]["title"] == "客户交付周会"
        assert "completeness" in composed

        updated_meeting = request(
            "/api/meetings/current",
            "PUT",
            {"participants": ["陈晨", "林晓", "周远"]},
        )
        assert len(updated_meeting["state"]["meeting"]["participants"]) == 3

        final_document = request("/api/meetings/final-document")
        assert "# 客户交付周会" in final_document["document"]

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
