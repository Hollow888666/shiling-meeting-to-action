from __future__ import annotations

import argparse
import hmac
import json
import mimetypes
import os
import re
import socket
import time
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from backend.extraction import extract_meeting
from backend.completeness import (
    analyze_completeness,
    build_final_document,
    compose_meeting_material,
)
from backend.documents import extract_document
from backend.llm import is_configured as llm_is_configured
from backend.llm import try_extract_with_llm
from backend.store import Database
from backend.transcription import (
    TranscriptionNotConfigured,
    engine_name as transcription_engine,
    is_configured as transcription_is_configured,
    transcribe_audio,
)


ROOT = Path(__file__).resolve().parent
DATABASE = Database(ROOT / "data" / "shiling.db")
ACCESS_CODE = os.getenv("SHILING_ACCESS_CODE", "").strip()
STARTED_AT = time.time()

STATIC_EXTENSIONS = {
    ".html",
    ".css",
    ".js",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
    ".webp",
}


class ShilingHandler(BaseHTTPRequestHandler):
    server_version = "ShilingDemo/1.0"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Shiling-Access")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        supplied_code = (query.get("access") or [""])[0]
        self._query_access_ok = False
        if ACCESS_CODE and supplied_code and hmac.compare_digest(supplied_code, ACCESS_CODE):
            self._query_access_ok = True
            if path in {"", "/"}:
                path = "/shiling_mobile.html"
        if not self._authorized():
            if path.startswith("/api/"):
                self._error_json(HTTPStatus.UNAUTHORIZED, "Access code required.")
            else:
                self._serve_login()
            return
        if path == "/api/health":
            self._json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "shiling-api",
                    "engine": "hybrid-semantic-llm"
                    if llm_is_configured()
                    else "local-semantic-rules",
                    "database": "sqlite",
                    "version": "0.3.1",
                    "uptimeSeconds": int(time.time() - STARTED_AT),
                    "features": [
                        "meeting-history",
                        "task-comments",
                        "activity-audit",
                        "analytics",
                        "server-search",
                        "access-code",
                        "optional-llm",
                        "document-extraction",
                        "audio-transcription",
                        "meeting-completeness",
                        "final-document",
                        "guided-auto-mode",
                    ],
                    "transcriptionConfigured": transcription_is_configured(),
                    "transcriptionEngine": transcription_engine(),
                },
            )
            return
        if path == "/api/state":
            self._json(HTTPStatus.OK, DATABASE.get_state())
            return
        if path == "/api/meetings":
            self._json(HTTPStatus.OK, DATABASE.list_meetings())
            return
        if path == "/api/meetings/completeness":
            state = DATABASE.get_state()
            self._json(
                HTTPStatus.OK,
                {
                    "state": state,
                    "completeness": analyze_completeness(state),
                },
            )
            return
        if path == "/api/meetings/final-document":
            state = DATABASE.get_state()
            completeness = analyze_completeness(state)
            self._json(
                HTTPStatus.OK,
                {
                    "completeness": completeness,
                    "document": build_final_document(state, completeness),
                },
            )
            return
        if path == "/api/analytics":
            self._json(HTTPStatus.OK, DATABASE.analytics())
            return
        if path == "/api/activity":
            try:
                limit = int((query.get("limit") or ["50"])[0])
            except ValueError:
                limit = 50
            self._json(HTTPStatus.OK, DATABASE.list_activity(limit))
            return
        if path == "/api/search":
            search_query = (query.get("q") or [""])[0]
            self._json(HTTPStatus.OK, DATABASE.search(search_query))
            return
        comment_match = re.fullmatch(r"/api/tasks/([^/]+)/comments", path)
        if comment_match:
            task_id = unquote(comment_match.group(1))
            self._json(HTTPStatus.OK, DATABASE.list_comments(task_id))
            return
        if path == "/api/export/json":
            self._json(HTTPStatus.OK, DATABASE.get_state())
            return
        if path.startswith("/api/"):
            self._error_json(HTTPStatus.NOT_FOUND, "API endpoint not found.")
            return
        self._serve_static(path, set_cookie=self._query_access_ok)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not self._authorized(api=True):
            return
        try:
            if path == "/api/materials/extract":
                fields, files = self._read_multipart(max_bytes=50 * 1024 * 1024)
                upload = files.get("file")
                if not upload:
                    raise ValueError("请选择一个演示文档文件。")
                result = extract_document(
                    upload["filename"],
                    upload["content"],
                )
                self._json(HTTPStatus.OK, {"material": result})
                return
            if path == "/api/audio/transcribe":
                fields, files = self._read_multipart(max_bytes=50 * 1024 * 1024)
                upload = files.get("file")
                if not upload:
                    raise ValueError("请选择一个录音文件。")
                diarize = str(fields.get("diarize", "true")).lower() not in {
                    "0",
                    "false",
                    "no",
                }
                language = str(fields.get("language") or "zh")
                try:
                    result = transcribe_audio(
                        upload["filename"],
                        upload["content"],
                        upload["contentType"],
                        diarize=diarize,
                        language=language,
                    )
                except TranscriptionNotConfigured as error:
                    self._json(
                        HTTPStatus.SERVICE_UNAVAILABLE,
                        {
                            "error": str(error),
                            "code": "transcription_not_configured",
                            "requiredEnvironment": "OPENAI_API_KEY",
                        },
                    )
                    return
                self._json(HTTPStatus.OK, {"audio": result})
                return

            payload = self._read_json()
            if path == "/api/meetings/extract":
                transcript = str(payload.get("transcript") or "").strip()
                if len(transcript) < 30:
                    raise ValueError("Meeting transcript is too short.")
                local_extracted = extract_meeting(transcript)
                extracted = (
                    try_extract_with_llm(transcript, local_extracted)
                    or local_extracted
                )
                engine = (
                    "hybrid-semantic-llm"
                    if extracted is not local_extracted
                    else "local-semantic-rules"
                )
                state = DATABASE.replace_state(extracted, preserve_history=True)
                self._json(
                    HTTPStatus.CREATED,
                    {
                        "engine": engine,
                        "state": state,
                    },
                )
                return
            if path == "/api/tasks":
                task = DATABASE.create_task(payload)
                self._json(HTTPStatus.CREATED, {"task": task})
                return
            if path == "/api/meetings/compose":
                documents = payload.get("documents") or []
                audio_transcripts = payload.get("audioTranscripts") or []
                if not documents and not audio_transcripts and not str(
                    payload.get("manualText") or ""
                ).strip():
                    raise ValueError("请至少提供会议文档、录音转写或人工记录。")
                transcript = compose_meeting_material(
                    title=str(payload.get("title") or ""),
                    meeting_date=str(payload.get("date") or ""),
                    participants=payload.get("participants") or [],
                    documents=documents,
                    audio_transcripts=audio_transcripts,
                    manual_text=str(payload.get("manualText") or ""),
                )
                local_extracted = extract_meeting(transcript)
                extracted = (
                    try_extract_with_llm(transcript, local_extracted)
                    or local_extracted
                )
                extracted["meeting"]["title"] = (
                    str(payload.get("title") or "").strip()
                    or extracted["meeting"]["title"]
                )
                if payload.get("date"):
                    extracted["meeting"]["date"] = str(payload["date"])
                if payload.get("participants"):
                    extracted["meeting"]["participants"] = [
                        str(name).strip()
                        for name in payload["participants"]
                        if str(name).strip()
                    ]
                extracted["meeting"]["transcript"] = transcript
                state = DATABASE.replace_state(extracted, preserve_history=True)
                self._json(
                    HTTPStatus.CREATED,
                    {
                        "engine": (
                            "hybrid-semantic-llm"
                            if extracted is not local_extracted
                            else "local-semantic-rules"
                        ),
                        "state": state,
                        "completeness": analyze_completeness(state),
                        "sourceStats": {
                            "documents": len(documents),
                            "audio": len(audio_transcripts),
                            "manualText": bool(str(payload.get("manualText") or "").strip()),
                        },
                    },
                )
                return
            comment_match = re.fullmatch(r"/api/tasks/([^/]+)/comments", path)
            if comment_match:
                task_id = unquote(comment_match.group(1))
                comment = DATABASE.add_comment(
                    task_id,
                    str(payload.get("author") or ""),
                    str(payload.get("body") or ""),
                )
                self._json(HTTPStatus.CREATED, {"comment": comment})
                return
            activate_match = re.fullmatch(r"/api/meetings/([^/]+)/activate", path)
            if activate_match:
                meeting_id = unquote(activate_match.group(1))
                state = DATABASE.activate_meeting(meeting_id)
                self._json(HTTPStatus.OK, {"state": state})
                return
            if path == "/api/reset":
                self._json(HTTPStatus.OK, {"state": DATABASE.reset_demo()})
                return
            self._error_json(HTTPStatus.NOT_FOUND, "API endpoint not found.")
        except Exception as error:
            self._handle_error(error)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if not self._authorized(api=True):
            return
        try:
            if path.startswith("/api/tasks/"):
                task_id = unquote(path.rsplit("/", 1)[-1])
                task = DATABASE.update_task(task_id, self._read_json())
                self._json(HTTPStatus.OK, {"task": task})
                return
            if path == "/api/meetings/current":
                state = DATABASE.update_meeting(self._read_json())
                self._json(
                    HTTPStatus.OK,
                    {
                        "state": state,
                        "completeness": analyze_completeness(state),
                    },
                )
                return
            self._error_json(HTTPStatus.NOT_FOUND, "API endpoint not found.")
        except Exception as error:
            self._handle_error(error)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if not self._authorized(api=True):
            return
        try:
            if path.startswith("/api/tasks/"):
                task_id = unquote(path.rsplit("/", 1)[-1])
                DATABASE.delete_task(task_id)
                self._json(HTTPStatus.OK, {"deleted": True, "id": task_id})
                return
            self._error_json(HTTPStatus.NOT_FOUND, "API endpoint not found.")
        except Exception as error:
            self._handle_error(error)

    def _serve_static(self, request_path: str, set_cookie: bool = False) -> None:
        relative = unquote(request_path).lstrip("/")
        if not relative:
            relative = "index.html"
        target = (ROOT / relative).resolve()
        if not self._inside_root(target):
            self._error_json(HTTPStatus.FORBIDDEN, "Path is not allowed.")
            return
        if target.suffix.lower() not in STATIC_EXTENSIONS:
            self._error_json(HTTPStatus.NOT_FOUND, "File not found.")
            return
        if not target.is_file():
            self._error_json(HTTPStatus.NOT_FOUND, "File not found.")
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {
            "application/javascript",
            "application/json",
        }:
            content_type = f"{content_type}; charset=utf-8"
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self._cors_headers()
        if set_cookie:
            self.send_header("Set-Cookie", self._access_cookie())
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self, api: bool = False) -> bool:
        if not ACCESS_CODE:
            return True
        if getattr(self, "_query_access_ok", False):
            return True
        header_value = self.headers.get("X-Shiling-Access", "")
        if header_value and hmac.compare_digest(header_value, ACCESS_CODE):
            return True
        cookie_header = self.headers.get("Cookie", "")
        cookie = SimpleCookie()
        try:
            cookie.load(cookie_header)
        except Exception:
            cookie = SimpleCookie()
        supplied = cookie.get("shiling_access")
        if supplied and hmac.compare_digest(supplied.value, ACCESS_CODE):
            return True
        if api:
            self._error_json(HTTPStatus.UNAUTHORIZED, "Access code required.")
        return False

    def _access_cookie(self) -> str:
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        return f"shiling_access={ACCESS_CODE}; Path=/; HttpOnly; SameSite=Lax{secure}"

    def _serve_login(self) -> None:
        data = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>拾令 · 访问验证</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fa;color:#171a1f;font-family:"Microsoft YaHei UI","Segoe UI",sans-serif}main{width:min(380px,calc(100vw - 32px));padding:28px;border:1px solid #dfe4eb;border-radius:10px;background:#fff;box-shadow:0 18px 48px rgba(18,24,40,.1)}h1{margin:0;font-size:22px}p{margin:7px 0 22px;color:#727b8a;font-size:12px}label{display:block;margin-bottom:7px;font-size:11px;font-weight:700}input{width:100%;height:42px;padding:0 11px;border:1px solid #dfe4eb;border-radius:7px;font:inherit}button{width:100%;height:42px;margin-top:12px;border:0;border-radius:7px;background:#245bff;color:#fff;font:inherit;font-weight:700;cursor:pointer}button:active{transform:scale(.98)}
</style>
</head>
<body>
<main>
  <h1>拾令 Meeting to Action</h1>
  <p>请输入演示访问码</p>
  <form method="get" action="/shiling_mobile.html">
    <label for="access">访问码</label>
    <input id="access" name="access" type="password" autocomplete="off" required>
    <button type="submit">进入演示</button>
  </form>
</main>
</body>
</html>""".encode("utf-8")
        self.send_response(HTTPStatus.UNAUTHORIZED)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def _inside_root(target: Path) -> bool:
        try:
            target.relative_to(ROOT)
            return True
        except ValueError:
            return False

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2 * 1024 * 1024:
            raise ValueError("Request body is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Invalid JSON body.") from error
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object.")
        return payload

    def _read_multipart(
        self, *, max_bytes: int
    ) -> tuple[dict[str, str], dict[str, dict[str, str | bytes]]]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            raise ValueError("Content-Type must be multipart/form-data.")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("Empty upload body.")
        if length > max_bytes:
            raise ValueError(
                f"Upload is too large. Maximum size is {max_bytes // (1024 * 1024)} MB."
            )
        raw = self.rfile.read(length)
        message = BytesParser(policy=policy.default).parsebytes(
            (
                f"Content-Type: {content_type}\r\n"
                "MIME-Version: 1.0\r\n\r\n"
            ).encode("ascii")
            + raw
        )
        if not message.is_multipart():
            raise ValueError("Malformed multipart upload.")

        fields: dict[str, str] = {}
        files: dict[str, dict[str, str | bytes]] = {}
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if not name:
                continue
            filename = part.get_filename()
            payload = part.get_payload(decode=True) or b""
            if filename:
                files[str(name)] = {
                    "filename": filename,
                    "contentType": part.get_content_type(),
                    "content": payload,
                }
            else:
                fields[str(name)] = payload.decode("utf-8", errors="replace")
        return fields, files

    def _handle_error(self, error: Exception) -> None:
        if isinstance(error, KeyError):
            self._error_json(HTTPStatus.NOT_FOUND, "Resource not found.")
        elif isinstance(error, ValueError):
            self._error_json(HTTPStatus.BAD_REQUEST, str(error))
        else:
            self._error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "Internal server error.")

    def _error_json(self, status: HTTPStatus, message: str) -> None:
        self._json(status, {"error": message})

    def _json(self, status: HTTPStatus, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def log_message(self, format: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {format % args}")


def local_addresses(port: int) -> list[str]:
    addresses = {f"http://127.0.0.1:{port}"}
    try:
        for address in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not address.startswith("127."):
                addresses.add(f"http://{address}:{port}")
    except OSError:
        pass
    return sorted(addresses)


def main() -> None:
    parser = argparse.ArgumentParser(description="Shiling Meeting to Action demo server")
    parser.add_argument("--host", default=os.getenv("SHILING_HOST", "0.0.0.0"))
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("SHILING_PORT", os.getenv("PORT", "8765"))),
    )
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), ShilingHandler)
    print(f"Shiling server listening on {args.host}:{args.port}")
    for address in local_addresses(args.port):
        print(f"  {address}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
