# 公网部署

项目使用 Python 标准库和 SQLite，不需要安装第三方 Python 包。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 云平台自动注入的监听端口 |
| `SHILING_PORT` | 否 | 自定义端口，优先级高于 `PORT` |
| `SHILING_ACCESS_CODE` | 公网必填 | 公网访问码 |
| `SHILING_LLM_BASE_URL` | 否 | OpenAI Chat Completions 兼容地址，例如 `https://provider/v1` |
| `SHILING_LLM_MODEL` | 否 | 模型名称 |
| `SHILING_LLM_API_KEY` | 否 | 模型 API Key |
| `OPENAI_API_KEY` | 录音转写必填 | OpenAI Audio API Key |
| `OPENAI_TRANSCRIBE_MODEL` | 否 | 默认 `gpt-4o-transcribe-diarize` |

## 启动命令

```bash
python server.py --host 0.0.0.0
```

项目中的 `Procfile` 已包含相同命令。

## 推荐平台

### Railway

1. 上传整个源码目录。
2. 设置 `SHILING_ACCESS_CODE`。
3. 添加持久化磁盘，并挂载到 `data` 目录。
4. Railway 会自动注入 `PORT`。

### Render

1. 创建 Python Web Service。
2. Build Command：`pip install -r requirements.txt`
3. Start Command：`python server.py --host 0.0.0.0`
4. 设置 `SHILING_ACCESS_CODE`。

Render 免费实例的本地磁盘不保证持久化；SQLite 数据可能在重新部署后丢失。需要持久化时使用磁盘或 PostgreSQL。

### PythonAnywhere

1. 上传源码。
2. 创建 Python 3.12 Web App。
3. WSGI 入口可转发到 `server.py`，或将本项目的 HTTP Handler 适配为 WSGI。
4. 设置 `SHILING_ACCESS_CODE`。

## 注意

- 不要把 `.public_access_code`、`.public_tunnel.json` 或 `data/*.db` 上传到公开仓库。
- 公网实例必须设置 `SHILING_ACCESS_CODE`。
- 访客链接格式：`https://你的域名/shiling_mobile.html?access=访问码`
- 访问码也会保存在访客浏览器会话中，并通过 `X-Shiling-Access` 请求头校验，减少对第三方 Cookie 的依赖。
