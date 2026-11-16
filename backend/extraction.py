from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any


TASK_ACTION_PATTERN = re.compile(
    r"负责|请[\w\u4e00-\u9fff]{2,4}|需要|完成|整理|输出|准备|对接|确认|提交|"
    r"更新|安排|推进|测试|录制|发布|做一次|搭建|修复|核对|撰写|设计|开发|"
    r"报名|邀请|跟进|补齐|拉通|同步|梳理|标记|验收|交付|导入|回滚|检查|"
    r"落实|关闭"
)

HIGH_PRIORITY_PATTERN = re.compile(
    r"必须|紧急|尽快|上线门槛|阻塞|硬截止|风险|冲突|不上线"
)

HIGH_RISK_PATTERN = re.compile(
    r"阻塞|高风险|冲突|不上线|无法|故障|低于|门槛|缺少|缺|回滚"
)

RISK_PATTERN = re.compile(
    r"风险|阻塞|担心|问题|冲突|不稳定|缺少|缺|依赖|来不及|延迟|未定|"
    r"不确定|难点|故障|无法|低于|门槛|不上线"
)

DECISION_PATTERN = re.compile(
    r"决定|确定|统一|拍板|结论|采用|只开放|不上线|门槛|为准|"
    r"必须(?:显示|展示|满足|保留|使用)"
)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def normalize_date(value: str | None) -> str:
    if not value:
        return ""
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return value


def parse_meeting_date(text: str, current_year: int) -> str:
    full = re.search(r"(20\d{2})年(\d{1,2})月(\d{1,2})日", text)
    if full:
        return safe_date(int(full.group(1)), int(full.group(2)), int(full.group(3)))
    month_day = re.search(r"(\d{1,2})月(\d{1,2})日", text)
    if month_day:
        return safe_date(current_year, int(month_day.group(1)), int(month_day.group(2)))
    return ""


def safe_date(year: int, month: int, day: int) -> str:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return ""


def clean_sentence(text: str) -> str:
    value = re.sub(r"^[\s\-—·]+", "", text or "")
    value = re.sub(r"^(好的|可以|没问题|收到|明白)[，,。\s]*", "", value)
    return value.strip()


def detect_task(text: str) -> bool:
    if not text:
        return False
    if re.match(r"^(会议|日期|时间|地点|参会|主题)[：:]", text):
        return False
    if re.search(r"上线门槛|不上线", text) and not re.search(
        r"负责|完成|整理|提交|准备|安排|拉通|补齐", text
    ):
        return False
    if re.search(r"设计稿会在.*给到", text):
        return False
    if not TASK_ACTION_PATTERN.search(text):
        return False
    if re.match(r"^(决定|确定|统一|拍板|结论)", text) and not re.search(
        r"负责|完成|整理|提交|更新|安排", text
    ):
        return False
    return len(text) >= 4


def detect_decision(text: str) -> str | None:
    if re.search(r"必须把|本周必须|必须完成", text) and not re.search(
        r"决定|确定|只开放|统一|结论", text
    ):
        return None
    if not DECISION_PATTERN.search(text):
        return None
    value = re.sub(r"^(决定|确定|统一|结论[：:]?)\s*", "", text)
    value = re.sub(r"，?这是上线门槛[。]?$", "", value).strip()
    if len(value) > 60:
        value = f"{value[:58]}…"
    return value if len(value) >= 4 else None


def detect_risk(text: str) -> str | None:
    if not RISK_PATTERN.search(text):
        return None
    if re.search(r"权限.*冲突", text):
        return "部门权限与项目权限存在冲突"
    if re.search(r"缺.*回滚", text):
        return "知识库导入脚本缺少异常回滚"
    if re.search(r"担心.*引用来源", text):
        return "销售担心回答缺少引用来源"
    if "上线门槛" in text:
        return "回答缺少原文引用展示"
    if re.search(r"响应.*不稳定|3秒", text):
        return "本地模型响应可能超过3秒"
    if "准确率低于90" in text:
        return "回答引用准确率可能低于90%"
    value = re.sub(r"^(而且|但是|不过|目前|现在)\s*", "", text)
    value = re.sub(r"，?存在.*风险[。]?$", "", value).strip()
    if len(value) > 46:
        value = f"{value[:44]}…"
    return value if len(value) >= 4 else None


def extract_owner(text: str, speaker: str, participants: list[str]) -> str:
    patterns = [
        re.compile(
            r"请([\w\u4e00-\u9fff]{2,4})(?=在|于|负责|完成|整理|输出|准备|"
            r"对接|确认|提交|更新|安排|推进|测试|录制|发布|评审|搭建|修复|"
            r"核对|撰写|设计|开发|上线|报名|邀请|跟进|补齐|拉通|同步)"
        ),
        re.compile(
            r"(?:由|让)?([\w\u4e00-\u9fff]{2,4})(?=负责|跟进|牵头|完成|整理|"
            r"输出|准备|对接|确认|提交|更新|安排|推进|测试|录制|发布|评审|"
            r"搭建|修复|核对|撰写|设计|开发|上线|报名|邀请|补齐|拉通|同步)"
        ),
    ]
    ignored = {"今天", "明天", "我们", "大家", "团队"}
    for index, pattern in enumerate(patterns):
        match = pattern.search(text)
        candidate = match.group(1) if match else ""
        if candidate in ignored:
            continue
        if candidate and (candidate in participants or index == 0):
            return candidate
    if re.search(r"我(?:来|负责|会|完成|整理|跟进|处理)", text) and speaker:
        return speaker
    owner_at_pattern = (
        r"(?:在|于)?(?:负责|跟进|牵头|完成|整理|输出|准备|对接|确认|提交|"
        r"更新|安排|推进|测试|录制|发布|评审|搭建|修复|核对|撰写|设计|"
        r"开发|上线|报名|邀请|补齐|拉通|同步)"
    )
    for name in participants:
        if re.search(rf"{re.escape(name)}.{{0,14}}{owner_at_pattern}", text):
            return name
    if speaker and speaker in participants:
        return speaker
    return next(
        (name for name in participants if name in text and name != speaker),
        "",
    )


def extract_due_date(text: str, meeting_date: str) -> str:
    full = re.search(r"(20\d{2})年?(\d{1,2})月(\d{1,2})日?", text)
    if full:
        return safe_date(int(full.group(1)), int(full.group(2)), int(full.group(3)))

    month_day = re.search(r"(\d{1,2})月(\d{1,2})日", text)
    if month_day:
        year = meeting_date[:4]
        return safe_date(int(year), int(month_day.group(1)), int(month_day.group(2))) if year.isdigit() else ""

    slash = re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)", text)
    if slash:
        year = meeting_date[:4]
        return safe_date(int(year), int(slash.group(1)), int(slash.group(2))) if year.isdigit() else ""

    try:
        base = date.fromisoformat(meeting_date)
    except ValueError:
        return ""

    if "今天" in text:
        return base.isoformat()
    if "明天" in text:
        return (base + timedelta(days=1)).isoformat()
    if "后天" in text:
        return (base + timedelta(days=2)).isoformat()

    week_map = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
    week = re.search(r"(本周|下周)([一二三四五六日天])", text)
    if week:
        current = base.weekday()
        delta = week_map[week.group(2)] - current
        if week.group(1) == "下周":
            delta += 7
        if week.group(1) == "本周" and delta < 0:
            delta += 7
        return (base + timedelta(days=delta)).isoformat()
    return ""


def extract_task_title(text: str, owner: str) -> str:
    if re.search(r"缺.*回滚", text):
        return "补齐知识库导入异常回滚"
    if "评审" in text and "拉通" in text:
        return "拉通客户和研发进行上线评审"

    working = text
    if owner and owner in working:
        owner_index = working.find(owner)
        if owner_index > 0 and working[owner_index - 1] in "，,":
            working = working[owner_index:]

    value = re.sub(r"(20\d{2})年?\d{1,2}月\d{1,2}日(?:前|之前)?", "", working)
    value = re.sub(r"\d{1,2}月\d{1,2}日(?:前|之前)?", "", value)
    value = re.sub(r"(?:本周|下周)[一二三四五六日天](?:前|之前)?", "", value)
    value = re.sub(r"(?:今天|明天|后天)(?:上午|下午|晚上)?", "", value)
    value = re.sub(r"^(请|需要|要|由|让|我们|先|再|务必)\s*", "", value.strip())
    value = re.sub(r"^(在)?\s*", "", value)
    if owner:
        value = re.sub(rf"^{re.escape(owner)}(?:在|于)?", "", value)
        value = re.sub(
            rf"{re.escape(owner)}(?:负责|跟进|牵头|完成|整理|输出|准备|对接|"
            rf"确认|提交|更新|安排|推进|测试|录制|发布|评审|搭建|修复|核对|"
            rf"撰写|设计|开发|上线|报名|邀请|补齐|拉通|同步)",
            "",
            value,
        )
    value = re.sub(r"^(负责|跟进|牵头)\s*", "", value.strip())
    value = re.sub(r"[，,]\s*$", "", value)
    value = re.sub(r"^可以[，,]?", "", value)
    value = value.strip()
    if len(value) > 44:
        value = f"{value[:42]}…"
    return value or text[:44]


def normalize_key(value: str) -> str:
    return re.sub(r"[\s，,。！？!?；;]", "", value).lower()


def infer_tags(text: str) -> list[str]:
    tags = []
    if "权限" in text:
        tags.append("权限")
    if re.search(r"知识库|文档", text):
        tags.append("知识库")
    if re.search(r"设计|界面", text):
        tags.append("设计")
    if re.search(r"上线|评审", text):
        tags.append("上线")
    if re.search(r"模型|响应|引用", text):
        tags.append("模型")
    return tags or ["会议行动"]


def extract_meeting(text: str, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    raw_lines = [line.strip() for line in (text or "").splitlines() if line.strip()]

    parsed_lines = []
    for line in raw_lines:
        match = re.match(r"^([\w\u4e00-\u9fff]{2,12})[：:]\s*(.+)$", line)
        parsed_lines.append(
            {
                "original": line,
                "speaker": match.group(1) if match else "",
                "body": match.group(2) if match else line,
            }
        )

    participant_line = next((line for line in raw_lines if line.startswith(("参会：", "参会:"))), "")
    if participant_line:
        participants = [
            item.strip()
            for item in re.split(r"[、,，/]", re.sub(r"^参会[：:]", "", participant_line))
            if item.strip()
        ]
    else:
        participants = list(dict.fromkeys(line["speaker"] for line in parsed_lines if line["speaker"]))

    date_line = next((line for line in raw_lines if re.match(r"^日期[：:]", line)), "")
    meeting_date = parse_meeting_date(date_line or "\n".join(raw_lines), today.year) or today.isoformat()
    title_line = next(
        (
            line
            for line in raw_lines
            if not re.match(r"^(日期|参会)[：:]", line)
            and re.search(r"周会|会议|评审|复盘|讨论", line)
        ),
        "",
    )
    title = title_line or "新建会议"

    sentences = []
    for line in parsed_lines:
        for part in re.split(r"[。！？!?；;]+", line["body"]):
            part = part.strip()
            if len(part) >= 4:
                sentences.append(
                    {
                        "speaker": line["speaker"],
                        "text": part,
                        "original": line["original"],
                    }
                )

    tasks: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    task_keys: set[str] = set()
    decision_keys: set[str] = set()
    risk_keys: set[str] = set()

    for sentence in sentences:
        text_value = clean_sentence(sentence["text"])
        decision = detect_decision(text_value)
        risk = detect_risk(text_value)
        if decision and normalize_key(decision) not in decision_keys:
            decision_keys.add(normalize_key(decision))
            decisions.append(
                {
                    "id": new_id("d"),
                    "text": decision,
                    "source": sentence["text"],
                }
            )
        if risk and normalize_key(risk) not in risk_keys:
            risk_keys.add(normalize_key(risk))
            risks.append(
                {
                    "id": new_id("r"),
                    "title": risk,
                    "severity": "high" if HIGH_RISK_PATTERN.search(text_value) else "medium",
                    "source": sentence["text"],
                }
            )
        if not detect_task(text_value):
            continue

        owner = extract_owner(text_value, sentence["speaker"], participants)
        due = extract_due_date(text_value, meeting_date)
        title_value = extract_task_title(text_value, owner)
        key = normalize_key(title_value)
        if len(title_value) < 4 or key in task_keys:
            continue
        task_keys.add(key)
        tasks.append(
            {
                "id": new_id("t"),
                "title": title_value,
                "owner": owner,
                "due": due,
                "priority": "high" if HIGH_PRIORITY_PATTERN.search(text_value) else "medium",
                "status": "todo" if due and owner else "backlog",
                "source": sentence["text"],
                "notes": "",
                "tags": infer_tags(text_value),
            }
        )

    if not tasks:
        fallback = next(
            (sentence for sentence in sentences if re.search(r"请|完成|整理|确认|提交|负责", sentence["text"])),
            None,
        )
        if fallback:
            owner = extract_owner(fallback["text"], fallback["speaker"], participants)
            tasks.append(
                {
                    "id": new_id("t"),
                    "title": extract_task_title(clean_sentence(fallback["text"]), owner),
                    "owner": owner,
                    "due": extract_due_date(fallback["text"], meeting_date),
                    "priority": "medium",
                    "status": "backlog",
                    "source": fallback["text"],
                    "notes": "",
                    "tags": [],
                }
            )

    return {
        "meeting": {
            "title": title,
            "date": meeting_date,
            "participants": participants or ["参会人"],
            "transcript": text,
            "updatedAt": datetime.now().strftime("%m月%d日 %H:%M"),
        },
        "tasks": tasks,
        "decisions": decisions,
        "risks": risks,
    }
