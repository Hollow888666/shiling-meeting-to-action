from __future__ import annotations

import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.extraction import extract_meeting
from backend.seed import SAMPLE_TRANSCRIPT
from backend.store import Database


def main():
    extracted = extract_meeting(SAMPLE_TRANSCRIPT)
    assert len(extracted["tasks"]) == 4
    assert len(extracted["decisions"]) == 3
    assert len(extracted["risks"]) == 6
    assert all(task["title"] for task in extracted["tasks"])

    with tempfile.TemporaryDirectory() as directory:
        database = Database(Path(directory) / "test.db")
        state = database.get_state()
        assert len(state["tasks"]) == 5
        created = database.create_task(
            {
                "title": "验证数据库任务",
                "owner": "陈晨",
                "due": "2026-11-20",
                "status": "todo",
            }
        )
        assert created["id"]
        updated = database.update_task(created["id"], {"status": "done"})
        assert updated["status"] == "done"
        database.delete_task(created["id"])
        assert len(database.get_state()["tasks"]) == 5

        extracted_state = database.replace_state(extracted, preserve_history=True)
        assert len(extracted_state["tasks"]) == 4
        assert len(database.list_meetings()["meetings"]) == 2

    print("backend_core_test=passed")


if __name__ == "__main__":
    main()
