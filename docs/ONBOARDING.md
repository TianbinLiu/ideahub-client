# 新成员上手 — ideahub-client

目标：**装好工具 → 克隆 → 能跑起来 → 能提交**。

⛔ 动手前先读 [`../AGENTS.md`](../AGENTS.md)，特别是第一条：
**push 到 `main` 会自动部署到生产**，没有人工审批。不要直接往 main 推。

---

## 1. 装什么

| 工具 | 版本 |
|---|---|
| Node.js | 22（CI 用的就是 22） |
| Claude Code | `npm i -g @anthropic-ai/claude-code`，或用桌面版 |

Claude Code 会自动读取仓库里的 `CLAUDE.md` 与 `AGENTS.md`，
**克隆完直接在仓库里开 `claude` 就带着项目规则**。
Cursor / Copilot 用户同理，`.cursor/rules/` 与 `.github/copilot-instructions.md` 已在仓库里。

## 2. 克隆并安装

```bash
git clone https://github.com/TianbinLiu/ideahub-client.git
cd ideahub-client
npm install
cp .env.example .env
```

## 3. 填 `.env`

`VITE_API_BASE` 是唯一必填项：

- 想连本地后端 → `http://127.0.0.1:4000`（需要另外克隆并起 `ideahub-server`）
- 只调前端 → `https://api.ideahubs.org`

⚠️ 本仓所有 `VITE_` 变量**都会被打进产物**（也就是发给每一个访问者）。
所以 `.env` 里只能放接口地址、外链这类非敏感配置，**任何密钥都不属于这里**。

## 4. 跑起来

```bash
npm run dev
```

## 5. 提交前

```bash
npm run build   # tsc -b && vite build，必须过
npm test        # vitest run，必须全绿
npm run lint
```

按铁律二：用 `git add <具体路径>`，不要 `git add -A`。

## 6. 发布

**开分支 → 自测 → 合并到 `main`。合并那一刻 GitHub Actions 就会构建并部署到生产。**

⚠️ 构建期的 `VITE_API_BASE` 由 workflow 写死为 `https://api.ideahubs.org`，
本地 `.env` 改它**不会**影响线上；要改线上得改 `.github/workflows/deploy.yml`。

线上的安全响应头、真实客户端 IP 在 **nginx** 层，脚本见 [`../deploy/`](../deploy/)。
往仓库里加 `vercel.json` 之类的平台配置是没有用的 —— 线上不过那些平台。

---

## 另外两个仓库

```bash
git clone https://github.com/TianbinLiu/ideahub-server.git   # 后端
git clone https://github.com/TianbinLiu/ideahub-app.git      # 安卓 App
```

三者独立部署、通过 HTTP 契约耦合。改接口相关代码前先看 server 的实际实现。

## 第一天建议读的

1. [`../AGENTS.md`](../AGENTS.md) — 铁律，必读
2. [`../CLAUDE.md`](../CLAUDE.md) — 命令、约定、容易踩的坑
3. [`../deploy/README.md`](../deploy/README.md) — 线上 nginx 是怎么配的

## 卡住了怎么办

先看 `CLAUDE.md` 的「容易踩的坑」表。不在表里而你解决了 ——
**把它补进那张表再提交**，这是铁律九。
