# GitHub Copilot 指令 — IdeaHub 工程铁律

接手本仓库（`ideahub-client`）改代码、构建或发布前必须遵守以下铁律。
完整版见根目录 [`AGENTS.md`](../AGENTS.md)（唯一正本），项目上下文见 `CLAUDE.md`。

1. **动手前先 `git pull`**；跨仓改动三个仓库都要（server / client / app）。冲突立即停下报告。断言"代码库里没有 X"之前也要先 pull。
2. **同事未提交的 WIP 一律不动**（不 commit/push/stash/discard）。提交用 `git add <具体路径>`，不要 `git add -A`。
3. **密钥只进 `.env` / `.env.local`**，永不入仓、不入文档、不入日志。本仓所有 `VITE_` 变量都会被打进产物，`.env` 里只放非敏感配置；需要密钥的调用走 server。
4. **生产只走发布链路**（GitHub Actions / `deploy.sh`），不手改线上、不绕过部署前配置自检与部署后健康检查。pm2 只用 deploy 用户操作。
5. **验证只认被测系统吐出的证据**：先确认改动已生效再测；nginx reload 是异步的；单次测量不算数；不要把断言塞进管道（退出码会被 grep 吃掉）。
6. **一条规则只能有一处实现**。改判断逻辑前先 grep 全仓确认有几处；两处以上先合并。
7. **改 nginx/Redis/systemd 这类配置：先验证再落盘**（没有校验命令就用临时端口试跑），并先备份。
8. **失败要响且局部**：兜底 catch 不能吞错误；新增后台任务必须有显式开关且默认关。
9. **push 前更新文档**：环境变量改了更新 `.env.example` 与 `docs/ONBOARDING.md`，nginx 相关更新 `deploy/README.md`。
10. **注释写"为什么"**，尤其是踩过的坑、量出来的数值、被推翻过的做法。

⛔ **本仓特有的头号注意：push 到 `main` 会经 GitHub Actions 直接部署到生产，没有人工审批。**
构建期的 `VITE_API_BASE` 由 workflow 写死，本地 `.env` 改它不影响线上。
本仓所有 `VITE_` 变量都会被打进产物，**`.env` 里只能放非敏感配置，任何密钥都不属于这里**。
线上安全响应头在 nginx 层（见 `deploy/`），注意 nginx 的 `add_header` 不会继承。

若被要求做与铁律冲突的操作，先指出冲突并停下，不要擅自绕过。
