from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path
from typing import Any

import requests


class TranscriptionNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip()) or local_is_available()


def local_is_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


def engine_name() -> str:
    if os.getenv("OPENAI_API_KEY", "").strip():
        return "openai-audio"
    if local_is_available():
        return "local-faster-whisper"
    return "none"


_local_model = None
_local_model_lock = threading.Lock()


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
        return transcribe_audio_local(filename, content, language=language)

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

    try:
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files=files,
            data=data,
            timeout=180,
        )
    except requests.RequestException:
        return transcribe_audio_local(filename, content, language=language)
    if not response.ok:
        return transcribe_audio_local(filename, content, language=language)

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


def transcribe_audio_local(
    filename: str,
    content: bytes,
    *,
    language: str = "zh",
) -> dict[str, Any]:
    if not local_is_available():
        raise TranscriptionNotConfigured(
            "录音转写尚未配置。请设置 OPENAI_API_KEY，或安装 faster-whisper。"
        )
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise TranscriptionNotConfigured(
            "录音转写尚未配置。请设置 OPENAI_API_KEY，或安装 faster-whisper。"
        ) from error

    model_name = os.getenv("SHILING_LOCAL_WHISPER_MODEL", "small").strip()
    model_dir = os.getenv(
        "SHILING_WHISPER_MODEL_DIR",
        r"D:\软件\whisper_models",
    ).strip()
    with _local_model_lock:
        global _local_model
        if _local_model is None:
            _local_model = WhisperModel(
                model_name,
                device="cpu",
                compute_type="int8",
                download_root=model_dir,
            )
        model = _local_model

    suffix = Path(filename).suffix or ".audio"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(content)
            temp_path = temp.name
        segments_iter, info = model.transcribe(
            temp_path,
            language=language or "zh",
            vad_filter=True,
            beam_size=5,
        )
        segments = []
        for segment in segments_iter:
            text = str(segment.text or "").strip()
            if not text:
                continue
            segments.append(
                {
                    "speaker": "发言人",
                    "start": round(float(segment.start), 2),
                    "end": round(float(segment.end), 2),
                    "text": text,
                }
            )
        text = "\n".join(
            f"[{format_timestamp(segment['start'])}] {segment['text']}"
            for segment in segments
        )
        if not text:
            raise RuntimeError("本地 Whisper 没有识别到可用语音。")
        return {
            "filename": filename,
            "model": f"local:faster-whisper-{model_name}",
            "text": text,
            "segments": segments,
            "charCount": len(text),
            "language": getattr(info, "language", language),
            "diarized": False,
        }
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def format_timestamp(seconds: float) -> str:
    seconds = max(0, int(float(seconds)))
    minutes, second = divmod(seconds, 60)
    hour, minute = divmod(minutes, 60)
    if hour:
        return f"{hour:02d}:{minute:02d}:{second:02d}"
    return f"{minute:02d}:{second:02d}"
