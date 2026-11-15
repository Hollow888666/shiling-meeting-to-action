from __future__ import annotations

import os
from typing import Any

import requests


class TranscriptionNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def transcribe_audio(
    filename: str,
    content: bytes,
    content_type: str,
    *,
    diarize: bool = True,
    language: str = "zh",
) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise TranscriptionNotConfigured(
            "录音转写尚未配置。请在本机设置 OPENAI_API_KEY 后重启后端。"
        )

    model = os.getenv(
        "OPENAI_TRANSCRIBE_MODEL",
        "gpt-4o-transcribe-diarize" if diarize else "gpt-4o-mini-transcribe",
    ).strip()
    response_format = "diarized_json" if diarize else "json"
    files = {
        "file": (
            filename,
            content,
            content_type or "application/octet-stream",
        )
    }
    data = {
        "model": model,
        "response_format": response_format,
    }
    if language:
        data["language"] = language

    response = requests.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {api_key}"},
        files=files,
        data=data,
        timeout=180,
    )
    if not response.ok:
        message = "录音转写服务返回错误。"
        try:
            payload = response.json()
            message = payload.get("error", {}).get("message") or message
        except ValueError:
            pass
        raise RuntimeError(message)

    payload = response.json()
    segments = payload.get("segments") or []
    if segments:
        lines = []
        for segment in segments:
            speaker = str(segment.get("speaker") or "发言人").strip()
            text = str(segment.get("text") or "").strip()
            if text:
                lines.append(f"{speaker}：{text}")
        text = "\n".join(lines)
        normalized_segments = [
            {
                "speaker": str(segment.get("speaker") or "发言人"),
                "start": segment.get("start"),
                "end": segment.get("end"),
                "text": str(segment.get("text") or "").strip(),
            }
            for segment in segments
            if str(segment.get("text") or "").strip()
        ]
    else:
        text = str(payload.get("text") or "").strip()
        normalized_segments = []

    if not text:
        raise RuntimeError("录音转写没有返回可用文本。")
    return {
        "filename": filename,
        "model": model,
        "text": text,
        "segments": normalized_segments,
        "charCount": len(text),
    }
