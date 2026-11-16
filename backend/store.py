from __future__ import annotations

import json
import copy
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator

from .seed import DEMO_STATE


class ConflictError(Exception):
    pass


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.init_schema()
        self.seed_if_empty()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def init_schema(self) -> None:
        with self.connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS meetings (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    date TEXT NOT NULL,
                    participants_json TEXT NOT NULL,
                    transcript TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    owner TEXT NOT NULL DEFAULT '',
                    due TEXT NOT NULL DEFAULT '',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'todo',
                    source TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    tags_json TEXT NOT NULL DEFAULT '[]'
                );

                CREATE TABLE IF NOT EXISTS decisions (
                    id TEXT PRIMARY KEY,
                    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS risks (
                    id TEXT PRIMARY KEY,
                    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'medium',
                    source TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS activities (
                    id TEXT PRIMARY KEY,
                    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                    event_type TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL DEFAULT '',
                    message TEXT NOT NULL,
                    detail_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS comments (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    author TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_id);
                CREATE INDEX IF NOT EXISTS idx_decisions_meeting ON decisions(meeting_id);
                CREATE INDEX IF NOT EXISTS idx_risks_meeting ON risks(meeting_id);
                CREATE INDEX IF NOT EXISTS idx_activities_meeting ON activities(meeting_id);
                CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(tasks)")}
            if "version" not in columns:
                connection.execute("ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1")

    def seed_if_empty(self) -> None:
        with self.connection() as connection:
            count = connection.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
        if count == 0:
            self.replace_state(DEMO_STATE)

    def current_meeting_id(self) -> str:
        with self.connection() as connection:
            active = connection.execute(
                "SELECT value FROM settings WHERE key = 'active_meeting_id'"
            ).fetchone()
            if active:
                valid = connection.execute(
                    "SELECT id FROM meetings WHERE id = ?", (active["value"],)
                ).fetchone()
                if valid:
                    return str(valid["id"])
            row = connection.execute(
                "SELECT id FROM meetings ORDER BY rowid DESC LIMIT 1"
            ).fetchone()
        if row is None:
            raise RuntimeError("No meeting data available.")
        with self.connection() as connection:
            connection.execute(
                """
                INSERT INTO settings(key, value) VALUES ('active_meeting_id', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (row["id"],),
            )
        return str(row["id"])

    def get_state(self, meeting_id: str | None = None) -> dict[str, Any]:
        meeting_id = meeting_id or self.current_meeting_id()
        with self.connection() as connection:
            meeting = connection.execute(
                "SELECT * FROM meetings WHERE id = ?",
                (meeting_id,),
            ).fetchone()
            if meeting is None:
                raise KeyError(meeting_id)
            tasks = connection.execute(
                """
                SELECT * FROM tasks
                WHERE meeting_id = ?
                ORDER BY CASE status
                    WHEN 'doing' THEN 1
                    WHEN 'todo' THEN 2
                    WHEN 'backlog' THEN 3
                    ELSE 4
                END, due IS '', due
                """,
                (meeting_id,),
            ).fetchall()
            decisions = connection.execute(
                "SELECT * FROM decisions WHERE meeting_id = ? ORDER BY rowid",
                (meeting_id,),
            ).fetchall()
            risks = connection.execute(
                "SELECT * FROM risks WHERE meeting_id = ? ORDER BY rowid",
                (meeting_id,),
            ).fetchall()
        return {
            "meeting": {
                "id": meeting["id"],
                "title": meeting["title"],
                "date": meeting["date"],
                "participants": json.loads(meeting["participants_json"]),
                "transcript": meeting["transcript"],
                "updatedAt": meeting["updated_at"],
            },
            "tasks": [self._task_row(row) for row in tasks],
            "decisions": [dict(row) for row in decisions],
            "risks": [dict(row) for row in risks],
        }

    def replace_state(
        self, state: dict[str, Any], preserve_history: bool = False
    ) -> dict[str, Any]:
        meeting = state["meeting"]
        meeting_id = meeting.get("id") or f"m_{uuid.uuid4().hex[:12]}"
        updated_at = meeting.get("updatedAt") or datetime.now().strftime("%m月%d日 %H:%M")
        with self.connection() as connection:
            if not preserve_history:
                connection.execute("DELETE FROM meetings")
                connection.execute("DELETE FROM settings")
            connection.execute(
                """
                INSERT INTO meetings(id, title, date, participants_json, transcript, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    meeting_id,
                    meeting.get("title") or "新建会议",
                    meeting.get("date") or datetime.now().date().isoformat(),
                    json.dumps(meeting.get("participants") or [], ensure_ascii=False),
                    meeting.get("transcript") or "",
                    updated_at,
                ),
            )
            for task in state.get("tasks", []):
                self._insert_task(connection, meeting_id, task)
            for decision in state.get("decisions", []):
                connection.execute(
                    "INSERT INTO decisions(id, meeting_id, text, source) VALUES (?, ?, ?, ?)",
                    (
                        decision.get("id") or f"d_{uuid.uuid4().hex[:12]}",
                        meeting_id,
                        decision.get("text") or "",
                        decision.get("source") or "",
                    ),
                )
            for risk in state.get("risks", []):
                connection.execute(
                    "INSERT INTO risks(id, meeting_id, title, severity, source) VALUES (?, ?, ?, ?, ?)",
                    (
                        risk.get("id") or f"r_{uuid.uuid4().hex[:12]}",
                        meeting_id,
                        risk.get("title") or "",
                        risk.get("severity") or "medium",
                        risk.get("source") or "",
                    ),
                )
            connection.execute(
                """
                INSERT INTO settings(key, value) VALUES ('active_meeting_id', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (meeting_id,),
            )
            self._log_activity(
                connection,
                meeting_id,
                "meeting.extracted",
                "meeting",
                meeting_id,
                f"导入会议：{meeting.get('title') or '新建会议'}",
                {
                    "tasks": len(state.get("tasks", [])),
                    "decisions": len(state.get("decisions", [])),
                    "risks": len(state.get("risks", [])),
                },
            )
        return self.get_state(meeting_id)

    def list_meetings(self) -> dict[str, Any]:
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT
                    m.id,
                    m.title,
                    m.date,
                    m.updated_at,
                    COUNT(t.id) AS task_count
                FROM meetings m
                LEFT JOIN tasks t ON t.meeting_id = m.id
                GROUP BY m.id
                ORDER BY m.rowid DESC
                """
            ).fetchall()
        active_id = self.current_meeting_id()
        return {
            "activeId": active_id,
            "meetings": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "date": row["date"],
                    "updatedAt": row["updated_at"],
                    "taskCount": row["task_count"],
                }
                for row in rows
            ],
        }

    def activate_meeting(self, meeting_id: str) -> dict[str, Any]:
        with self.connection() as connection:
            valid = connection.execute(
                "SELECT id FROM meetings WHERE id = ?", (meeting_id,)
            ).fetchone()
            if valid is None:
                raise KeyError(meeting_id)
            self._log_activity(
                connection,
                meeting_id,
                "meeting.activated",
                "meeting",
                meeting_id,
                "切换当前会议",
            )
        return self.get_state(meeting_id)

    def update_meeting(
        self,
        payload: dict[str, Any],
        meeting_id: str | None = None,
    ) -> dict[str, Any]:
        meeting_id = meeting_id or self.current_meeting_id()
        with self.connection() as connection:
            row = connection.execute(
                "SELECT * FROM meetings WHERE id = ?", (meeting_id,)
            ).fetchone()
            if row is None:
                raise KeyError(meeting_id)
            title = str(payload.get("title", row["title"]) or "").strip()
            meeting_date = str(payload.get("date", row["date"]) or "").strip()
            participants = payload.get("participants")
            if participants is None:
                participants = json.loads(row["participants_json"])
            transcript = str(payload.get("transcript", row["transcript"]) or "")
            connection.execute(
                """
                UPDATE meetings
                SET title = ?, date = ?, participants_json = ?, transcript = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    title,
                    meeting_date,
                    json.dumps(
                        [
                            str(name).strip()
                            for name in participants
                            if str(name).strip()
                        ],
                        ensure_ascii=False,
                    ),
                    transcript,
                    datetime.now().strftime("%m月%d日 %H:%M"),
                    meeting_id,
                ),
            )
            self._log_activity(
                connection,
                meeting_id,
                "meeting.updated",
                "meeting",
                meeting_id,
                "更新会议信息",
                {"fields": sorted(payload.keys())},
            )
        return self.get_state(meeting_id)

    def _insert_task(
        self, connection: sqlite3.Connection, meeting_id: str, task: dict[str, Any]
    ) -> None:
        connection.execute(
            """
            INSERT INTO tasks(
                id, meeting_id, title, owner, due, priority, status, source, notes, tags_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task.get("id") or f"t_{uuid.uuid4().hex[:12]}",
                meeting_id,
                task.get("title") or "",
                task.get("owner") or "",
                task.get("due") or "",
                task.get("priority") or "medium",
                task.get("status") or "todo",
                task.get("source") or "",
                task.get("notes") or "",
                json.dumps(task.get("tags") or [], ensure_ascii=False),
            ),
        )

    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        meeting_id = payload.get("meetingId") or self.current_meeting_id()
        self.get_state(meeting_id)
        self._validate_task(payload, creating=True)
        task = {
            "id": payload.get("id") or f"t_{uuid.uuid4().hex[:12]}",
            "title": payload.get("title") or "未命名任务",
            "owner": payload.get("owner") or "",
            "due": payload.get("due") or "",
            "priority": payload.get("priority") or "medium",
            "status": payload.get("status") or "todo",
            "source": payload.get("source") or "手动创建",
            "notes": payload.get("notes") or "",
            "tags": payload.get("tags") or ["手动创建"],
            "version": 1,
        }
        with self.connection() as connection:
            self._insert_task(connection, meeting_id, task)
            self._touch_meeting(connection, meeting_id)
            self._log_activity(
                connection,
                meeting_id,
                "task.created",
                "task",
                task["id"],
                f"新建任务：{task['title']}",
            )
        return task

    def update_task(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._validate_task(payload)
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if row is None:
                raise KeyError(task_id)
            if "version" in payload and payload["version"] != row["version"]:
                raise ConflictError("Task was changed by another user.")
            merged = {
                **self._task_row(row),
                **{
                    key: payload[key]
                    for key in (
                        "title",
                        "owner",
                        "due",
                        "priority",
                        "status",
                        "source",
                        "notes",
                        "tags",
                    )
                    if key in payload
                },
            }
            connection.execute(
                """
                UPDATE tasks
                SET title = ?, owner = ?, due = ?, priority = ?, status = ?,
                    source = ?, notes = ?, tags_json = ?, version = version + 1
                WHERE id = ?
                """,
                (
                    merged["title"],
                    merged["owner"],
                    merged["due"],
                    merged["priority"],
                    merged["status"],
                    merged["source"],
                    merged["notes"],
                    json.dumps(merged.get("tags") or [], ensure_ascii=False),
                    task_id,
                ),
            )
            merged["version"] = row["version"] + 1
            self._touch_meeting(connection, row["meeting_id"])
            changed = [key for key in payload if key in merged and payload[key] != self._task_row(row).get(key)]
            self._log_activity(
                connection,
                row["meeting_id"],
                "task.updated",
                "task",
                task_id,
                f"更新任务：{merged['title']}",
                {"fields": changed, "status": merged["status"]},
            )
        return merged

    @staticmethod
    def _validate_task(payload: dict[str, Any], creating: bool = False) -> None:
        for key, limit in (("title", 120), ("owner", 30), ("notes", 2000), ("source", 1000)):
            if key in payload and (not isinstance(payload[key], str) or len(payload[key]) > limit):
                raise ValueError(f"Invalid {key}.")
        if (creating or "title" in payload) and not str(payload.get("title") or "").strip():
            raise ValueError("Task title is required.")
        for key, choices in (("status", {"backlog", "todo", "doing", "done"}), ("priority", {"high", "medium", "low"})):
            if key in payload and (not isinstance(payload[key], str) or payload[key] not in choices):
                raise ValueError(f"Invalid {key}.")
        if "version" in payload and (type(payload["version"]) is not int or payload["version"] < 1):
            raise ValueError("Invalid version.")
        if "due" in payload and not isinstance(payload["due"], str):
            raise ValueError("Invalid due date.")
        if "due" in payload and payload["due"]:
            try:
                if date.fromisoformat(payload["due"]).isoformat() != payload["due"]:
                    raise ValueError
            except (TypeError, ValueError):
                raise ValueError("Invalid due date.") from None
        if "tags" in payload and (not isinstance(payload["tags"], list) or len(payload["tags"]) > 20 or any(not isinstance(tag, str) or len(tag) > 30 for tag in payload["tags"])):
            raise ValueError("Invalid tags.")

    def delete_task(self, task_id: str, version: int | None = None) -> None:
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT meeting_id, version FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if row is None:
                raise KeyError(task_id)
            if version is not None and version != row["version"]:
                raise ConflictError("Task was changed by another user.")
            title = connection.execute(
                "SELECT title FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()["title"]
            connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            self._touch_meeting(connection, row["meeting_id"])
            self._log_activity(
                connection,
                row["meeting_id"],
                "task.deleted",
                "task",
                task_id,
                f"删除任务：{title}",
            )

    def reset_demo(self) -> dict[str, Any]:
        demo = copy.deepcopy(DEMO_STATE)
        demo["meeting"]["id"] = f"m_{uuid.uuid4().hex[:12]}"
        for kind, prefix in (("tasks", "t"), ("decisions", "d"), ("risks", "r")):
            for item in demo[kind]:
                item["id"] = f"{prefix}_{uuid.uuid4().hex[:12]}"
        return self.replace_state(demo, preserve_history=True)

    def list_activity(self, limit: int = 50, meeting_id: str | None = None) -> dict[str, Any]:
        meeting_id = self.get_state(meeting_id)["meeting"]["id"]
        limit = max(1, min(int(limit), 200))
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM activities
                WHERE meeting_id = ?
                ORDER BY created_at DESC, rowid DESC
                LIMIT ?
                """,
                (meeting_id, limit),
            ).fetchall()
        return {
            "meetingId": meeting_id,
            "activities": [
                {
                    "id": row["id"],
                    "type": row["event_type"],
                    "entityType": row["entity_type"],
                    "entityId": row["entity_id"],
                    "message": row["message"],
                    "detail": json.loads(row["detail_json"] or "{}"),
                    "createdAt": row["created_at"],
                }
                for row in rows
            ],
        }

    def add_comment(
        self, task_id: str, author: str, body: str
    ) -> dict[str, Any]:
        body = body.strip()
        if not body:
            raise ValueError("Comment body is required.")
        if len(body) > 2000 or len(author) > 30:
            raise ValueError("Comment is too long.")
        with self.connection() as connection:
            task = connection.execute(
                "SELECT meeting_id, title FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if task is None:
                raise KeyError(task_id)
            comment = {
                "id": f"c_{uuid.uuid4().hex[:12]}",
                "taskId": task_id,
                "author": author.strip() or "匿名",
                "body": body,
                "createdAt": datetime.now().isoformat(timespec="seconds"),
            }
            connection.execute(
                """
                INSERT INTO comments(id, task_id, author, body, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    comment["id"],
                    task_id,
                    comment["author"],
                    comment["body"],
                    comment["createdAt"],
                ),
            )
            self._touch_meeting(connection, task["meeting_id"])
            self._log_activity(
                connection,
                task["meeting_id"],
                "comment.added",
                "task",
                task_id,
                f"{comment['author']} 评论：{task['title']}",
                {"commentId": comment["id"]},
            )
        return comment

    def list_comments(self, task_id: str) -> dict[str, Any]:
        with self.connection() as connection:
            task = connection.execute(
                "SELECT id FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if task is None:
                raise KeyError(task_id)
            rows = connection.execute(
                """
                SELECT * FROM comments
                WHERE task_id = ?
                ORDER BY created_at, rowid
                """,
                (task_id,),
            ).fetchall()
        return {
            "taskId": task_id,
            "comments": [dict(row) for row in rows],
        }

    def analytics(self, meeting_id: str | None = None) -> dict[str, Any]:
        state = self.get_state(meeting_id)
        tasks = state["tasks"]
        today = date.today()
        soon = today + timedelta(days=3)

        def parse_date(value: str) -> date | None:
            try:
                return date.fromisoformat(value)
            except (TypeError, ValueError):
                return None

        status = {"backlog": 0, "todo": 0, "doing": 0, "done": 0}
        priority = {"high": 0, "medium": 0, "low": 0}
        owners: dict[str, dict[str, Any]] = {}
        overdue = 0
        due_soon = 0
        for task in tasks:
            status[task["status"]] = status.get(task["status"], 0) + 1
            priority[task["priority"]] = priority.get(task["priority"], 0) + 1
            due = parse_date(task["due"])
            is_active = task["status"] != "done"
            if is_active and due and due < today:
                overdue += 1
            if is_active and due and today <= due <= soon:
                due_soon += 1
            owner = task["owner"] or "待分配"
            bucket = owners.setdefault(
                owner,
                {"owner": owner, "total": 0, "active": 0, "done": 0, "highPriority": 0},
            )
            bucket["total"] += 1
            if task["status"] == "done":
                bucket["done"] += 1
            else:
                bucket["active"] += 1
            if task["priority"] == "high" and task["status"] != "done":
                bucket["highPriority"] += 1

        with self.connection() as connection:
            comment_count = connection.execute(
                """
                SELECT COUNT(*) FROM comments c
                JOIN tasks t ON t.id = c.task_id
                WHERE t.meeting_id = ?
                """,
                (state["meeting"]["id"],),
            ).fetchone()[0]
        total = len(tasks)
        return {
            "meetingId": state["meeting"]["id"],
            "totalTasks": total,
            "completionRate": round((status["done"] / total) * 100, 1) if total else 0,
            "status": status,
            "priority": priority,
            "overdue": overdue,
            "dueSoon": due_soon,
            "owners": sorted(
                owners.values(),
                key=lambda item: (-item["active"], item["owner"]),
            ),
            "decisions": len(state["decisions"]),
            "risks": {
                "total": len(state["risks"]),
                "high": sum(1 for risk in state["risks"] if risk["severity"] == "high"),
            },
            "comments": comment_count,
        }

    def search(self, query: str, limit: int = 50, meeting_id: str | None = None) -> dict[str, Any]:
        state = self.get_state(meeting_id)
        query = query.strip().lower()
        if not query:
            return {"query": query, "tasks": [], "decisions": [], "risks": []}
        tasks = [
            task
            for task in state["tasks"]
            if query in f"{task['title']} {task['owner']} {task['notes']}".lower()
        ][:limit]
        decisions = [
            item for item in state["decisions"] if query in f"{item['text']} {item['source']}".lower()
        ][:limit]
        risks = [
            item for item in state["risks"] if query in f"{item['title']} {item['source']}".lower()
        ][:limit]
        return {
            "query": query,
            "tasks": tasks,
            "decisions": decisions,
            "risks": risks,
        }

    @staticmethod
    def _touch_meeting(connection: sqlite3.Connection, meeting_id: str) -> None:
        connection.execute(
            "UPDATE meetings SET updated_at = ? WHERE id = ?",
            (datetime.now().strftime("%m月%d日 %H:%M"), meeting_id),
        )

    @staticmethod
    def _log_activity(
        connection: sqlite3.Connection,
        meeting_id: str,
        event_type: str,
        entity_type: str,
        entity_id: str,
        message: str,
        detail: dict[str, Any] | None = None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO activities(
                id, meeting_id, event_type, entity_type, entity_id,
                message, detail_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"a_{uuid.uuid4().hex[:12]}",
                meeting_id,
                event_type,
                entity_type,
                entity_id or "",
                message,
                json.dumps(detail or {}, ensure_ascii=False),
                datetime.now().isoformat(timespec="seconds"),
            ),
        )

    @staticmethod
    def _task_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "version": row["version"],
            "title": row["title"],
            "owner": row["owner"],
            "due": row["due"],
            "priority": row["priority"],
            "status": row["status"],
            "source": row["source"],
            "notes": row["notes"],
            "tags": json.loads(row["tags_json"] or "[]"),
        }
