# Contributing

感谢参与拾令 Meeting to Action。

## 开发流程

1. Fork 仓库并创建功能分支。
2. 保持前端视觉语言和后端 API 约定一致。
3. 提交前运行：

```bash
python tests/backend_core_test.py
python tests/smoke_test.py
python tests/standalone_check.py
```

4. 在 Pull Request 中说明改动范围、验证方式和截图。

## 提交规范

- `feat: add ...`
- `fix: correct ...`
- `docs: update ...`
- `test: cover ...`
- `refactor: simplify ...`

## 安全要求

- 不提交数据库、访问码、隧道信息、Cookie、Token 或个人信息。
- 公网部署必须设置 `SHILING_ACCESS_CODE`。
- 涉及权限、数据导出或文件上传的改动需要补充测试。
