# GitHub 发布清单

## 推荐仓库信息

- 仓库名：`shiling-meeting-to-action`
- 可见性：Public
- 描述：`AI 办公会议任务闭环 Demo：从会议原文提取行动项、负责人、截止时间、决策和风险，并同步到 SQLite 任务看板。`
- License：MIT
- Topics：`ai`, `hackathon`, `meeting-notes`, `task-management`, `python`, `sqlite`, `office-automation`, `ai-agent`

## 使用 Git 发布

```bash
git init
git add .
git commit -m "feat: open source Shiling meeting-to-action demo"
git branch -M main
git remote add origin https://github.com/<USER>/shiling-meeting-to-action.git
git push -u origin main
```

## 使用 GitHub CLI 发布

```bash
gh auth login
gh repo create shiling-meeting-to-action --public --source=. --remote=origin --push
```

## 发布前检查

- 确认 `.public_access_code`、`.public_tunnel.json` 和 `data/*.db` 不在仓库中。
- 确认 README 截图只包含演示数据。
- 确认 GitHub Actions 通过。
- 创建 `v0.1.0` Release，并附带 `dist/shiling_source.zip`。
