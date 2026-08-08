# CLAUDE.md — ideahub-client

Claude Code 会自动读取本文件。**工程铁律在 [`AGENTS.md`](AGENTS.md)，先读那份**，
尤其是开头那条：**push 到 `main` 会经 GitHub Actions 直接部署到生产**。

新成员从零上手看 [`docs/ONBOARDING.md`](docs/ONBOARDING.md)。

---

## 这是什么

IdeaHub 官网：React + TypeScript + Vite。创意浏览与发布、AI 评审、社交互动、
标签排行榜、Creative Workshop 模板市场、后台管理页。

线上部署在阿里云 ECS，由 **nginx 静态托管**（不是 Vercel/Netlify —— 这点很重要，
见 `AGENTS.md` 本仓小节里那条踩过的坑）。

三仓关系见 [`AGENTS.md`](AGENTS.md)。

## 跑起来

```bash
npm install
cp .env.example .env      # 填 VITE_API_BASE
npm run dev
```

`VITE_API_BASE` 填 `http://127.0.0.1:4000` 需要本地起 server；
只调前端可以直接填 `https://api.ideahubs.org`。

## 提交前

```bash
npm run build    # tsc -b && vite build，必须过
npm test         # vitest run，必须全绿
npm run lint
```

## 约定

- **注释写"为什么"**，尤其是踩过的坑、量出来的数值、被推翻过的做法。
- **一条规则只有一处实现**。改判断逻辑前先 grep 全仓。
- 本仓所有 `VITE_` 变量都会被打进产物 —— **`.env` 里只能放非敏感配置**，
  任何密钥都不属于这里，需要密钥的调用走 server。

## 容易踩的坑

| 坑 | 说明 |
|---|---|
| 以为改本地 `.env` 能改线上接口地址 | 构建期 `VITE_API_BASE` 由 workflow 写死，要改线上得改 workflow |
| 给前端仓加平台配置文件（`vercel.json` 等） | 线上是 ECS 上的 nginx，那些文件不会被任何人读 |
| 加了安全响应头但子路径不生效 | nginx 的 `add_header` 不继承，子 location 有任何一条就会覆盖父级全部 |
| 把密钥放进 `VITE_` 变量 | 会被打进产物发给每个访问者 |

## 相关文档

- [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — 从零到能跑
- [`deploy/README.md`](deploy/README.md) — nginx 安全响应头与 real_ip 的配置脚本
