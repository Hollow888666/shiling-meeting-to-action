from __future__ import annotations

import re
from datetime import date
from typing import Any


DEFAULT_TITLES = {"", "新建会议", "会议记录", "会议材料汇总"}


def compose_meeting_material(
    *,
    title: str = "",
    meeting_date: str = "",
    participants: list[str] | None = None,
    documents: list[dict[str, Any]] | None = None,
    audio_transcripts: list[dict[str, Any]] | None = None,
    manual_text: str = "",
) -> str:
    documents = documents or []
    audio_transcripts = audio_transcripts or []
    participants = [name for name in (participants or []) if name.strip()]

    if not participants:
        inferred = []
        for audio in audio_transcripts:
            for segment in audio.get("segments") or []:
                speaker = str(segment.get("speaker") or "").strip()
                if speaker and speaker not in {"发言人", "speaker"}:
                    inferred.append(speaker)
        participants = list(dict.fromkeys(inferred))

    header_title = title.strip() or infer_title(documents, audio_transcripts)
    header_date = meeting_date or date.today().isoformat()
    parts = [header_title, f"日期：{header_date}"]
    if participants:
        parts.append(f"参会：{'、'.join(participants)}")
    parts.append("")

    for document in documents:
        parts.append(f"[演示文档：{document.get('filename') or '未命名文档'}]")
        parts.append(str(document.get("text") or "").strip())
        parts.append("")

    for audio in audio_transcripts:
        parts.append(f"[录音转写：{audio.get('filename') or '会议录音'}]")
        parts.append(str(audio.get("text") or "").strip())
        parts.append("")

    if manual_text.strip():
        parts.append("[人工补充]")
        parts.append(manual_text.strip())
        parts.append("")

    return "\n".join(parts).strip()


def infer_title(
    documents: list[dict[str, Any]], audio_transcripts: list[dict[str, Any]]
) -> str:
    candidates = []
    for item in documents + audio_transcripts:
        text = str(item.get("text") or "")
        for line in text.splitlines():
            value = line.strip().strip("#").strip()
            if 4 <= len(value) <= 60 and re.search(r"会|评审|讨论|方案|复盘", value):
                candidates.append(value)
                break
    return candidates[0] if candidates else "会议材料汇总"


def analyze_completeness(state: dict[str, Any]) -> dict[str, Any]:
    meeting = state.get("meeting") or {}
    tasks = state.get("tasks") or []
    decisions = state.get("decisions") or []
    risks = state.get("risks") or []
    missing: list[dict[str, Any]] = []

    title = str(meeting.get("title") or "").strip()
    if title in DEFAULT_TITLES:
        missing.append(
            item("meeting", "current", "title", "required", "缺少会议标题", "补充一个可识别的会议标题。")
        )
    if not str(meeting.get("date") or "").strip():
        missing.append(
            item("meeting", "current", "date", "required", "缺少会议日期", "补充会议日期。")
        )
    participants = meeting.get("participants") or []
    if not participants:
        missing.append(
            item(
                "meeting",
                "current",
                "participants",
                "required",
                "缺少参会人员",
                "补充参会人员姓名，便于识别发言和分配任务。",
            )
        )
    if len(str(meeting.get("transcript") or "").strip()) < 30:
        missing.append(
            item(
                "meeting",
                "current",
                "transcript",
                "required",
                "会议正文过短",
                "增加演示文档、录音转写或人工会议记录。",
            )
        )

    if not tasks:
        missing.append(
            item(
                "meeting",
                "current",
                "tasks",
                "required",
                "没有提取到行动项",
                "确认会议材料中包含明确行动、负责人和截止时间。",
            )
        )

    for index, task in enumerate(tasks, start=1):
        task_id = str(task.get("id") or f"task-{index}")
        task_name = str(task.get("title") or f"任务{index}")
        if not str(task.get("owner") or "").strip():
            missing.append(
                item(
                    "task",
                    task_id,
                    "owner",
                    "required",
                    f"任务“{task_name}”缺少负责人",
                    "分配负责人后才能进入执行。",
                    task_name,
                )
            )
        if not str(task.get("due") or "").strip():
            missing.append(
                item(
                    "task",
                    task_id,
                    "due",
                    "required",
                    f"任务“{task_name}”缺少截止时间",
                    "补充截止日期后才能追踪延期和提醒。",
                    task_name,
                )
            )
        if not str(task.get("source") or "").strip():
            missing.append(
                item(
                    "task",
                    task_id,
                    "source",
                    "recommended",
                    f"任务“{task_name}”缺少会议依据",
                    "关联原文或说明任务来源。",
                    task_name,
                )
            )

    if not decisions:
        missing.append(
            item(
                "meeting",
                "current",
                "decisions",
                "recommended",
                "没有识别到明确决策",
                "如果会议有结论，补充决策内容以避免执行口径不一致。",
            )
        )
    if not risks:
        missing.append(
            item(
                "meeting",
                "current",
                "risks",
                "recommended",
                "没有识别到风险",
                "确认是否确实没有依赖、阻塞或质量风险。",
            )
        )

    required = sum(1 for entry in missing if entry["severity"] == "required")
    recommended = sum(1 for entry in missing if entry["severity"] == "recommended")
    total_checks = max(1, len(tasks) * 3 + 7)
    score = max(0, round(100 - (required * 12 + recommended * 4) / total_checks * 100))
    return {
        "ready": required == 0,
        "score": score,
        "requiredCount": required,
        "recommendedCount": recommended,
        "missing": missing,
        "summary": {
            "tasks": len(tasks),
            "decisions": len(decisions),
            "risks": len(risks),
            "participants": len(participants),
        },
    }


def build_final_document(state: dict[str, Any], completeness: dict[str, Any]) -> str:
    meeting = state["meeting"]
    tasks = state.get("tasks") or []
    decisions = state.get("decisions") or []
    risks = state.get("risks") or []
    participants = "、".join(meeting.get("participants") or []) or "未填写"

    lines = [
        f"# {meeting.get('title') or '会议记录'}",
        "",
        f"- 会议日期：{meeting.get('date') or '未填写'}",
        f"- 参会人员：{participants}",
        f"- 完整度：{completeness.get('score', 0)}%",
        f"- 行动项：{len(tasks)}",
        f"- 决策：{len(decisions)}",
        f"- 风险：{len(risks)}",
        "",
        "## 执行摘要",
        "",
        executive_summary(tasks, decisions, risks),
        "",
        "## 行动项",
        "",
        "| 任务 | 负责人 | 截止时间 | 状态 | 优先级 |",
        "| --- | --- | --- | --- | --- |",
    ]
    if tasks:
        for task in tasks:
            lines.append(
                "| "
                + " | ".join(
                    [
                        escape_pipe(task.get("title") or ""),
                        escape_pipe(task.get("owner") or "待分配"),
                        task.get("due") or "待定",
                        status_label(task.get("status")),
                        priority_label(task.get("priority")),
                    ]
                )
                + " |"
            )
    else:
        lines.append("| 暂无行动项 | - | - | - | - |")

    lines.extend(["", "## 决策结论", ""])
    if decisions:
        lines.extend(f"- {entry.get('text') or ''}" for entry in decisions)
    else:
        lines.append("- 暂未记录明确决策")

    lines.extend(["", "## 风险清单", ""])
    if risks:
        for risk in risks:
            severity = "高风险" if risk.get("severity") == "high" else "中风险"
            lines.append(f"- [{severity}] {risk.get('title') or ''}")
    else:
        lines.append("- 暂未记录风险")

    lines.extend(
        [
            "",
            "## 完整性检查",
            "",
            f"- 必需缺口：{completeness.get('requiredCount', 0)}",
            f"- 建议补充：{completeness.get('recommendedCount', 0)}",
        ]
    )
    for entry in completeness.get("missing") or []:
        marker = "必需" if entry["severity"] == "required" else "建议"
        lines.append(f"- [{marker}] {entry['message']}")
    if not completeness.get("missing"):
        lines.append("- 所有检查项均已完成")

    lines.extend(["", "## 附录：会议原文", "", meeting.get("transcript") or ""])
    return "\n".join(lines).strip() + "\n"


def executive_summary(
    tasks: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    risks: list[dict[str, Any]],
) -> str:
    active = sum(1 for task in tasks if task.get("status") != "done")
    unassigned = sum(1 for task in tasks if not str(task.get("owner") or "").strip())
    no_due = sum(1 for task in tasks if not str(task.get("due") or "").strip())
    high_risks = sum(1 for risk in risks if risk.get("severity") == "high")
    return (
        f"本次会议形成 {len(decisions)} 项决策，拆解出 {len(tasks)} 项行动，"
        f"其中 {active} 项仍待执行；{unassigned} 项未分配负责人，{no_due} 项未设置截止时间。"
        f"当前识别 {len(risks)} 项风险，其中 {high_risks} 项为高风险。"
    )


def status_label(value: str | None) -> str:
    return {
        "backlog": "待确认",
        "todo": "待开始",
        "doing": "进行中",
        "done": "已完成",
    }.get(value or "", "待开始")


def priority_label(value: str | None) -> str:
    return {"high": "高", "medium": "中", "low": "低"}.get(value or "", "中")


def escape_pipe(value: str) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def item(
    entity_type: str,
    entity_id: str,
    field: str,
    severity: str,
    message: str,
    suggested_action: str,
    task_name: str = "",
) -> dict[str, Any]:
    return {
        "id": f"{entity_type}:{entity_id}:{field}",
        "entityType": entity_type,
        "entityId": entity_id,
        "field": field,
        "severity": severity,
        "message": message,
        "suggestedAction": suggested_action,
        "taskName": task_name,
    }
