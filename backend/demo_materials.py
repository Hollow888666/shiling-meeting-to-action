from __future__ import annotations

from copy import deepcopy
from typing import Any


AUTO_DEMO_MATERIAL = {
    "id": "ai-auto-missing-owner",
    "filename": "客户交付验收评审会_演示材料.txt",
    "mimeType": "text/plain;charset=utf-8",
    "content": """客户交付验收评审会
日期：2026年11月16日
参会：陈晨、林晓、周远

陈晨：请林晓在11月18日前整理客户验收清单，并标出需要客户确认的项目。
林晓：周远在11月19日前完成付费流程回归测试，输出测试结果。
周远：决定本期只开放文档问答、流程查询和付费入口。
陈晨：登录审计日志还存在缺失风险。
待分配：需要在11月20日前完成客户验收脚本，并输出演示口径。""",
    "suggestedTitle": "客户交付验收评审会",
    "suggestedDate": "2026-11-16",
    "suggestedParticipants": ["陈晨", "林晓", "周远"],
}


def get_auto_demo_material() -> dict[str, Any]:
    return deepcopy(AUTO_DEMO_MATERIAL)
