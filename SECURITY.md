# Security Policy

## Supported Versions

当前主分支和最新 Release 接受安全修复。

## Reporting

请不要在公开 Issue 中披露访问码、Token、数据库或可复现的攻击细节。请通过 GitHub Security Advisory 或私下联系维护者。

## Deployment Baseline

- 公网部署必须设置 `SHILING_ACCESS_CODE`。
- 公开实例不应挂载包含真实企业数据的数据库。
- 使用 HTTPS 反向代理。
- 定期备份 `data/shiling.db`，并限制文件权限。
- 对外分享访问码时，应能够随时更换。
