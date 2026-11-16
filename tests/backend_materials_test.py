from __future__ import annotations

import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.completeness import (
    analyze_completeness,
    build_final_document,
    compose_meeting_material,
)
from backend.demo_materials import get_auto_demo_material
from backend.documents import extract_document
from backend.extraction import extract_meeting


def main():
    text_result = extract_document(
        "meeting.md",
        "# 产品评审会议\n\n陈晨：请林晓在11月20日前完成权限清单。".encode("utf-8"),
    )
    assert "产品评审会议" in text_result["text"]

    from docx import Document

    doc = Document()
    doc.add_heading("客户交付评审", level=1)
    doc.add_paragraph("周远负责在11月21日前完成异常回滚。")
    docx_buffer = io.BytesIO()
    doc.save(docx_buffer)
    docx_result = extract_document("review.docx", docx_buffer.getvalue())
    assert "客户交付评审" in docx_result["text"]

    from pptx import Presentation

    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[1])
    slide.shapes.title.text = "办公自动化方案评审"
    slide.placeholders[1].text = "决定第一期开放知识库问答"
    pptx_buffer = io.BytesIO()
    presentation.save(pptx_buffer)
    pptx_result = extract_document("review.pptx", pptx_buffer.getvalue())
    assert "办公自动化方案评审" in pptx_result["text"]

    audio = {
        "filename": "meeting.mp3",
        "text": "陈晨：请林晓在11月20日前完成权限清单。",
        "segments": [{"speaker": "陈晨", "text": "请林晓在11月20日前完成权限清单。"}],
    }
    transcript = compose_meeting_material(
        title="产品评审会议",
        participants=["陈晨", "林晓"],
        documents=[text_result],
        audio_transcripts=[audio],
        manual_text="补充：上线前完成验收。",
    )
    assert "[演示文档：" in transcript
    assert "[录音转写：" in transcript
    assert "参会：陈晨、林晓" in transcript

    state = {
        "meeting": {
            "id": "m_test",
            "title": "产品评审会议",
            "date": "2026-11-15",
            "participants": ["陈晨", "林晓"],
            "transcript": transcript,
        },
        "tasks": [
            {
                "id": "t1",
                "title": "完成权限清单",
                "owner": "",
                "due": "",
                "priority": "high",
                "status": "todo",
                "source": "请林晓完成权限清单。",
            }
        ],
        "decisions": [{"id": "d1", "text": "第一期开放知识库问答"}],
        "risks": [],
    }
    completeness = analyze_completeness(state)
    assert completeness["ready"] is False
    assert completeness["requiredCount"] == 2
    final_document = build_final_document(state, completeness)
    assert "# 产品评审会议" in final_document
    assert "## 行动项" in final_document
    assert "完整性检查" in final_document

    demo = get_auto_demo_material()
    demo_state = extract_meeting(demo["content"])
    demo_completeness = analyze_completeness(demo_state)
    required = [
        entry
        for entry in demo_completeness["missing"]
        if entry["severity"] == "required"
    ]
    assert demo_state["meeting"]["title"] == "客户交付验收评审会"
    assert len(demo_state["tasks"]) == 3
    assert len(required) == 1
    assert required[0]["field"] == "owner"
    print("backend_materials_test=passed")


if __name__ == "__main__":
    main()
