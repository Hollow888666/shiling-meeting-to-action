from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

from .seed import DEMO_STATE


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

                CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_id);
                CREATE INDEX IF NOT EXISTS idx_decisions_meeting ON decisions(meeting_id);
                CREATE INDEX IF NOT EXISTS idx_risks_meeting ON risks(meeting_id);
                """
            )

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
                raise RuntimeError("No meeting data available.")
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
        return self.get_state()

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
            connection.execute(
                """
                INSERT INTO settings(key, value) VALUES ('active_meeting_id', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (meeting_id,),
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
        meeting_id = self.current_meeting_id()
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
        }
        with self.connection() as connection:
            self._insert_task(connection, meeting_id, task)
            self._touch_meeting(connection, meeting_id)
        return task

    def update_task(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if row is None:
                raise KeyError(task_id)
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
                    source = ?, notes = ?, tags_json = ?
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
            self._touch_meeting(connection, row["meeting_id"])
        return merged

    def delete_task(self, task_id: str) -> None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT meeting_id FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if row is None:
                raise KeyError(task_id)
            connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            self._touch_meeting(connection, row["meeting_id"])

    def reset_demo(self) -> dict[str, Any]:
        return self.replace_state(DEMO_STATE, preserve_history=False)

    @staticmethod
    def _touch_meeting(connection: sqlite3.Connection, meeting_id: str) -> None:
        connection.execute(
            "UPDATE meetings SET updated_at = ? WHERE id = ?",
            (datetime.now().strftime("%m月%d日 %H:%M"), meeting_id),
        )

    @staticmethod
    def _task_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "owner": row["owner"],
            "due": row["due"],
            "priority": row["priority"],
            "status": row["status"],
            "source": row["source"],
            "notes": row["notes"],
            "tags": json.loads(row["tags_json"] or "[]"),
        }
