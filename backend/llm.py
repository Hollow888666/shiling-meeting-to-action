from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
import uuid
from datetime import date
from typing import Any


def is_configured() -> bool:
    return bool(
        os.getenv("SHILING_LLM_BASE_URL", "").strip()
        and os.getenv("SHILING_LLM_MODEL", "").strip()
    )


def try_extract_with_llm(
    transcript: str, fallback: dict[str, Any]
) -> dict[str, Any] | None:
    if not is_configured():
        return None
    # Never silently omit the end of a meeting from model extraction.
    if len(transcript) > 12000:
        return None

    base_url = os.getenv("SHILING_LLM_BASE_URL", "").strip().rstrip("/")
    endpoint = (
        f"{base_url}/chat/completions"
        if base_url.endswith("/v1")
        else f"{base_url}/v1/chat/completions"
    )
    model = os.getenv("SHILING_LLM_MODEL", "").strip()
    api_key = os.getenv("SHILING_LLM_API_KEY", "").strip()
    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 1800,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是企业会议行动项提取器。只输出合法 JSON，不要输出 Markdown。"
                    "JSON 结构："
                    '{"tasks":[{"title":"","owner":"","due":"YYYY-MM-DD或空字符串",'
                    '"priority":"high|medium|low","status":"backlog|todo|doing|done",'
                    '"source":"","notes":"","tags":[]}],'
                    '"decisions":[{"text":"","source":""}],'
                    '"risks":[{"title":"","severity":"high|medium","source":""}]}。'
                    "不要虚构原文中不存在的负责人或日期。"
                ),
            },
            {"role": "user", "content": transcript},
        ],
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=True).encode("ascii"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
        content = raw["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(
                item.get("text", "") for item in content if isinstance(item, dict)
            )
        content = str(content).strip()
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        parsed = json.loads(content)
    except (OSError, KeyError, IndexError, TypeError, ValueError, urllib.error.URLError):
        return None

    if not isinstance(parsed, dict):
        return None
    try:
        tasks = normalize_tasks(parsed.get("tasks"))
    except (TypeError, ValueError):
        return None
    if not tasks:
        return None
    return {
        "meeting": fallback["meeting"],
        "tasks": tasks,
        "decisions": normalize_decisions(parsed.get("decisions")),
        "risks": normalize_risks(parsed.get("risks")),
    }


def normalize_tasks(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    tasks = []
    for item in value:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        priority = str(item.get("priority") or "medium").lower()
        status = str(item.get("status") or "todo").lower()
        due = str(item.get("due") or "").strip()
        try:
            due = date.fromisoformat(due).isoformat() if due else ""
        except ValueError:
            due = ""
        if not isinstance(item.get("tags", []), list):
            raise ValueError("Invalid model tags")
        tasks.append(
            {
                "id": f"t_{uuid.uuid4().hex[:12]}",
                "title": title[:120],
                "owner": str(item.get("owner") or "").strip()[:30],
                "due": due,
                "priority": priority if priority in {"high", "medium", "low"} else "medium",
                "status": status
                if status in {"backlog", "todo", "doing", "done"}
                else "todo",
                "source": str(item.get("source") or "").strip()[:1000],
                "notes": str(item.get("notes") or "").strip()[:2000],
                "tags": [
                    str(tag).strip()[:30]
                    for tag in (item.get("tags") or [])
                    if str(tag).strip()
                ][:8],
            }
        )
    return tasks


def normalize_decisions(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if text:
            result.append(
                {
                    "id": f"d_{uuid.uuid4().hex[:12]}",
                    "text": text[:300],
                    "source": str(item.get("source") or "").strip()[:1000],
                }
            )
    return result


def normalize_risks(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if title:
            severity = str(item.get("severity") or "medium").lower()
            result.append(
                {
                    "id": f"r_{uuid.uuid4().hex[:12]}",
                    "title": title[:300],
                    "severity": severity if severity in {"high", "medium"} else "medium",
                    "source": str(item.get("source") or "").strip()[:1000],
                }
            )
    return result
