# 老师人格（/tutor，启梦老师）

用自己的教材铸一位 AI 老师，然后在教材上被它带着学：阅读面 + 导学漫游 + 圈选提问 + 自检 + 蒸馏出补丁再点头。
产品与格式的正本在 tutor 仓（`ideahub-tutor`，docs/01–10）；本仓只是它的官网面，**页面与组件从 tutor 仓
`web/src/pages/tutor/` 原样搬来**（2026-09-28，tutor 仓 docs/04 §5 C11–C15），`data-testid` 一个没改 ——
验收用的也是那边的 Playwright 套件（见下）。

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `src/pages/tutor/TutorHomePage.tsx` | 落地：课程列表 / 新建 / 导入一位老师；首次进弹成人声明（判定在 `adultGate.ts`：先问 `GET /api/tutor/config`，问不到退 localStorage 缓存） |
| `src/pages/tutor/new/*` | 五步向导（建课 → 教材 → 教学风格 → 生成 → 试教），表单在 `wizardStore`（localStorage，刷新回到同一步） |
| `src/pages/tutor/materials/*` | 拖入教材 + 来源勾选 + 上传状态机（`useUploadEngine`） |
| `src/pages/tutor/TutorCoursePage.tsx` | 课程页：教材 / 扫描目录 / 授权来源下拉 / 导出导入卡（`ExportCard.tsx`） |
| `src/pages/tutor/TutorRunPage.tsx` + `reader/*` + `teacher/*` | 学习页：pdf.js 阅读面（`reader/pdf.ts` 是唯一 import pdfjs 的地方）、文字卡、导学漫游、圈选动作条、老师钉子、老师面板 / 手机抽屉、自检、复习卡、蒸馏卡、到期回访横幅 |
| `src/pages/tutor/TutorRevisionsPage.tsx` | 修订审阅页 `/tutor/personas/:id/review` |
| `src/pages/tutor/types.ts` | 与 server 契约同形的类型（TutorDoc / Run / Turn / Revision …） |
| `src/api/tutor.ts` | 请求层（单开，不进 2700 行的 `api.ts`）：`API_BASE` + Bearer；带 token 还 401 走 `notifyAuthExpired`；判「服务器有没有 /api/tutor」看 Content-Type 不看状态码 |
| `src/api/tutorUpload.ts` | 教材直传：sha256 预查去重 → `sign` 领票 → 分块 multipart POST 到 Cloudinary（同一个 `X-Unique-Upload-Id` + `Content-Range`，90 秒没传出一个字节就停）→ `confirm` 送浏览器抽好的 pages |
| `src/extract/*` | 浏览器端抽文本：pdf.js legacy / JSZip（pptx）/ mammoth（docx）按格式懒加载 |
| `src/tutor/shared/*` | tutor 仓核心的**逐字副本**（`blocks.js` 切块 + 块 hash、`pptxXml.js`、`demo.js`）。★ 必须与 server `src/tutor/core/` 是同一份切法，块 hash 才对得上、锚点才钉得回去 —— 要改先回 tutor 仓改，再往两边同步 |
| `src/App.tsx` 的 `TutorLayout` | 外壳：桌面主站导航栏，手机（<768px）只留一条小条（主站导航最窄 660px）；学习页 `bare`（它自带顶栏、根是 h-dvh，再压一条导航栏底部输入条就被顶出屏幕） |
| `src/locales/{zh,en}.json` 的 `tutor` 命名空间 | 组件里 `useTranslation(undefined, { keyPrefix: "tutor" })`；新文案两份一起加 |

## 路由

`/tutor`、`/tutor/new`、`/tutor/courses/:id`、`/tutor/run/:id`、`/tutor/personas/:id/review`，全部套 `ProtectedRoute`
（课程与学习过程都是本人的）。Navbar 上一颗 🎓 入口（`sm` 以上显示）。市场页 `/tutor/market*` 是 P2，还没建。

## 环境与部署

- `VITE_TUTOR_MATERIAL_MAX_MB`（可选，默认 100）：向导里单份教材的体积提示。真上限是 server 的
  `TUTOR_MATERIAL_MAX_BYTES`，客户端 ≤ 服务端即可（超了服务端是整发 413 不是截断）。
- CSP：`connect-src` 多了 `https://api.cloudinary.com`（教材字节直传、不经 server）。`vercel.json` 与
  `deploy/nginx-security-headers.conf` 都改了，**线上 nginx 那份在服务器上、无版本控制，要人手同步**
  （deploy 用户无 sudo，见 `deploy/README.md`）。
- server 侧要 `TUTOR_ENABLED=true` 才挂 `/api/tutor`；没挂时请求层报「这台服务器还没有老师人格」，不是白屏。

## 验收

tutor 仓的 18 条 Playwright 直接打本仓的 dist（同一套 spec 一条不改，这就是 tutor 仓 docs/04 C11 说的「e2e 改 baseURL 后照跑」）：

```bash
npm run build                                   # 本仓，VITE_API_BASE 留空 = 同源
cd ../ideahub-tutor && TUTOR_E2E_WEB=../ideahub-client/dist npm run e2e:client
```

参考实现（tutor 仓 `src/server/devServer.mjs`）同一个进程托管 dist 与 `/api/tutor`，带假登录（`--fake-auth`）。
⚠ 它**不鉴权、不连 Cloudinary**，所以两处只能在真服务器上验：`reader/pdf.ts` 给 pdf.js 塞 Bearer 去取
`GET /materials/:sha/file` 的 302 签名地址；`tutorUpload.ts` 的真 Cloudinary 分块直传。

## 踩过的坑

| 坑 | 症状 | 怎么办 |
|---|---|---|
| pdf.js 只给 `url` 装文档，而服务器那条路在 `requireAuth` 后面 | 真服务器上阅读面永远 401、退化成「老师面板念」，e2e 却全绿（参考实现不鉴权） | `loadPdf` 经 `httpHeaders` 带 Bearer；跨源 302 时浏览器按 Fetch 规范剥掉 Authorization，token 不会跟到 Cloudinary |
| `pdfjs-dist` 6 没有 `isEvalSupported` | tutor 仓那份传了它，这里 tsc 直接红 | 删掉即可：5.x 起整个包一处 eval 都没有，CSP 不用放 `'unsafe-eval'` |
| 在渲染里读 ref map 给子组件当 prop（`reader/CardPageView`） | 首帧恒 null，老师钉子要等别的原因触发的重渲染才出现 | 一页一个 `CardPage` 组件、元素走 callback ref 进 state |
| 页面文件顺手导出非组件（成人声明判定、`LICENSES`） | eslint `react-refresh/only-export-components` 红，HMR 整页重载 | 判定单独成 `adultGate.ts`，常量放 `api/tutor.ts` |
