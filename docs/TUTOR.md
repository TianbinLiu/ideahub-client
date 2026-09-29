# 老师人格（/tutor，启梦老师）

用自己的教材铸一位 AI 老师，然后在教材上被它带着学：阅读面 + 导学漫游 + 圈选提问 + 自检 + 蒸馏出补丁再点头。
产品与格式的正本在 tutor 仓（`ideahub-tutor`，docs/01–10）；本仓只是它的官网面，**页面与组件从 tutor 仓
`web/src/pages/tutor/` 原样搬来**（2026-09-28，tutor 仓 docs/04 §5 C11–C15），`data-testid` 一个没改 ——
验收用的也是那边的 Playwright 套件（见下）。M2 的三张（发布卡 / 市场 / 详情，2026-09-28）是**直接在本仓写的**（tutor 仓自己的 web 没有市场面），
验收 spec 仍放 tutor 仓、只在官网模式跑。

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `src/pages/tutor/TutorHomePage.tsx` | 落地：课程列表 / 新建 / 导入一位老师；首次进弹成人声明（判定在 `adultGate.ts`：先问 `GET /api/tutor/config`，问不到退 localStorage 缓存） |
| `src/pages/tutor/new/*` | 五步向导（建课 → 教材 → 教学风格 → 生成 → 试教），表单在 `wizardStore`（localStorage，刷新回到同一步） |
| `src/pages/tutor/materials/*` | 拖入教材 + 来源勾选 + 上传状态机（`useUploadEngine`） |
| `src/pages/tutor/TutorCoursePage.tsx` | 课程页：教材 / 扫描目录 / 授权来源下拉 / 发布卡（`PublishCard.tsx`）/ 导出导入卡（`ExportCard.tsx`）；从市场开的课多一行「来自 …」指回详情页，作者出了新版时顶上一条「合并新版」横幅（`source.updateAvailable`，2026-09-29）—— 合并只换课程地图与蒸馏内容、进度与学生画像保留，规则在服务端 `core/publish/merge`，这里只摆按钮与回执（`merge-report`） |
| `src/pages/tutor/PublishCard.tsx` | 「发布到市场」卡（M2）：从市场开出来的课上是「另存为我的人格」（`data-fork=1`，血缘提示：① ② 沿用来源那一版）；五道门清单只是把服务端 422 回包里的 `gate` 画出来（**不自己判**，判定只在 server `core/publish.checkGates` 一处）；表单 = 名字 / 简介 / 标签 ≤6 / 版本备注 / **主动声明含 AI 生成内容**（显式勾选，《标识办法》第十条）；已发布态显示版本、sha256、市场链接、取消分享；被下架态显示原因且不能再发布 |
| `src/pages/tutor/TutorMarketPage.tsx` | 市场列表 `/tutor/market`：scope / sort / q / tag / subject / page 全在 URL 参数里（深链可还原、返回键好使），卡片上的标签点了即筛；游客可逛 |
| `src/pages/tutor/TutorDetailPage.tsx` | 市场详情 `/tutor/market/:id`：教学面 + 课程地图（只读预览，② ④ 正文不给）+ 发布版信息；「开始跟这位老师学」（已在学 → 继续）、举报对话框（`POST /api/reports`，理由含「教授认领 / 要求下架」）、评论（主站 `CommentThread targetType="persona"` 原样）、作者的其它老师；游客可看，动作才跳 `/login?next=`；评分块 `RatingBlock`（2026-09-29）：均分 / 分布 / 我的一票（可改可删）/ 大家怎么说，能不能评只画服务端 `canRate` 的答案（灰着时把原因说出来：先学过一段、作者不能评自己、拉黑） |
| `src/pages/tutor/TutorProfileTabs.tsx` + `src/pages/UserProfilePage.tsx`（主站） | 个人页 `/users/:id` 的两个页签（2026-09-29）：「老师人格」= `GET /api/tutor/market?author=`（谁都能看，卡片复用市场页的 `MarketCardItem`），「在学」= 自己带 `source` 的课（只有本人，行上带可合并 / 来源已不在的角标）。深链 `?tab=tutors` / `?tab=learning` |
| `src/pages/NotificationsPage.tsx`（主站） | 老师人格四类通知的文案与落点（`TUTOR_RATING / TUTOR_COMMENT` → `/tutor/market/:id`，`TUTOR_REVIEW_DUE` → `/tutor/run/:id`，`TUTOR_DOC_UPDATED` → `/tutor/courses/:id`；id 都在 payload 里，不是顶层字段）；未知类型仍走 `typeFallback` |
| `src/pages/tutor/TutorRunPage.tsx` + `reader/*` + `teacher/*` | 学习页：pdf.js 阅读面（`reader/pdf.ts` 是唯一 import pdfjs 的地方）、文字卡、导学漫游、圈选动作条、老师钉子、老师面板 / 手机抽屉、自检、复习卡、蒸馏卡、到期回访横幅 |
| `src/pages/tutor/TutorRevisionsPage.tsx` | 修订审阅页 `/tutor/personas/:id/review` |
| `src/pages/tutor/types.ts` | 与 server 契约同形的类型（TutorDoc / Run / Turn / Revision …） |
| `src/api/tutor.ts` | 请求层（单开，不进 2700 行的 `api.ts`）：`API_BASE` + Bearer；带 token 还 401 走 `notifyAuthExpired`；判「服务器有没有 /api/tutor」看 Content-Type 不看状态码；M2 加 `listMarket / getMarketDetail / publishPersona / unpublishPersona / startLearning / reportPersona`，`ApiError` 带 `gate`（发布被哪一道拒）；M2 后半加 `getRatings / putRating / deleteRating / mergeRelease`，`CourseSummary.source` 多 `latest / updateAvailable / gone` |
| `src/api/tutorUpload.ts` | 教材直传：sha256 预查去重 → `sign` 领票 → 分块 multipart POST 到 Cloudinary（同一个 `X-Unique-Upload-Id` + `Content-Range`，90 秒没传出一个字节就停）→ `confirm` 送浏览器抽好的 pages |
| `src/extract/*` | 浏览器端抽文本：pdf.js legacy / JSZip（pptx）/ mammoth（docx）按格式懒加载 |
| `src/tutor/shared/*` | tutor 仓核心的**逐字副本**（`blocks.js` 切块 + 块 hash、`pptxXml.js`、`demo.js`）。★ 必须与 server `src/tutor/core/` 是同一份切法，块 hash 才对得上、锚点才钉得回去 —— 要改先回 tutor 仓改，再往两边同步 |
| `src/App.tsx` 的 `TutorLayout` | 外壳：桌面主站导航栏，手机（<768px）只留一条小条（主站导航最窄 660px）；学习页 `bare`（它自带顶栏、根是 h-dvh，再压一条导航栏底部输入条就被顶出屏幕） |
| `src/locales/{zh,en}.json` 的 `tutor` 命名空间 | 组件里 `useTranslation(undefined, { keyPrefix: "tutor" })`；新文案两份一起加 |

## 路由

`/tutor`、`/tutor/new`、`/tutor/courses/:id`、`/tutor/run/:id`、`/tutor/personas/:id/review`，全部套 `ProtectedRoute`
（课程与学习过程都是本人的）。Navbar 上一颗 🎓 入口（`sm` 以上显示）。市场两页 `/tutor/market`、`/tutor/market/:id`（2026-09-28 M2）
**不套** `ProtectedRoute`：游客可逛、可看详情，开始学 / 举报 / 评论这些动作才跳 `/login?next=` —— 与主站模型 / 声音市场同一个先例。

## 环境与部署

- `VITE_TUTOR_MATERIAL_MAX_MB`（可选，默认 100）：向导里单份教材的体积提示。真上限是 server 的
  `TUTOR_MATERIAL_MAX_BYTES`，客户端 ≤ 服务端即可（超了服务端是整发 413 不是截断）。
- CSP：`connect-src` 多了 `https://api.cloudinary.com`（教材字节直传、不经 server）。`vercel.json` 与
  `deploy/nginx-security-headers.conf` 都改了，**线上 nginx 那份在服务器上、无版本控制，要人手同步**
  （deploy 用户无 sudo，见 `deploy/README.md`）。
- server 侧要 `TUTOR_ENABLED=true` 才挂 `/api/tutor`；没挂时请求层报「这台服务器还没有老师人格」，不是白屏。

## 验收

tutor 仓的 27 条 Playwright 直接打本仓的 dist（18 条 M1 一条不改 —— 这就是 tutor 仓 docs/04 C11 说的「e2e 改 baseURL 后照跑」；
9 条市场 `web/e2e/zz-market.spec.ts` **只在这个模式跑**：发布 → 市场可见 → 详情 → 开始学 → 评分 → 回访到期通知 → 作者发 v2 / 通知页 / 合并新版 → 另存为我的人格（复刻件、血缘）→ 个人页两个页签 → 举报 → 下架，tutor 仓自己的 web 没有市场页）：

```bash
npm run build                                   # 本仓，VITE_API_BASE 留空 = 同源
cd ../ideahub-tutor && TUTOR_E2E_WEB=../ideahub-client/dist npm run e2e:client
```

参考实现（tutor 仓 `src/server/devServer.mjs`）同一个进程托管 dist 与 `/api/tutor`，带假登录（`--fake-auth`）。
⚠ 它**不鉴权、不连 Cloudinary、没有评论端点**（详情页的评论区在 e2e 里是空的，控制台有一行 404），所以这几处只能在真服务器上验：`reader/pdf.ts` 给 pdf.js 塞 Bearer 去取
`GET /materials/:sha/file`（服务端把 Cloudinary 签名下载流式转发过来、不 302）；`tutorUpload.ts` 的真 Cloudinary 分块直传。一键跑法在 tutor 仓：`npm run e2e:real`（本机起 server + client，走 建课 → 直传 → 取回字节 → 生成 → 阅读面画出第 1 页）。市场那条路在参考实现里的「下架」是测试端点（`--allow-time-travel` 才开），真服务器上是管理端处置举报（server `takedown.service` 的 registry）。

## 踩过的坑

| 坑 | 症状 | 怎么办 |
|---|---|---|
| pdf.js 只给 `url` 装文档，而服务器那条路在 `requireAuth` 后面 | 真服务器上阅读面永远 401、退化成「老师面板念」，e2e 却全绿（参考实现不鉴权） | `loadPdf` 经 `httpHeaders` 带 Bearer；服务端那头改成流式转发、不 302（302 之后那一跳过不过 Cloudinary 的 CORS 没量过）。tutor 仓 `npm run e2e:client` 下参考实现的这条路同样要 Bearer，阅读面画得出第 1 页就是这一行在起作用 |
| `pdfjs-dist` 6 没有 `isEvalSupported` | tutor 仓那份传了它，这里 tsc 直接红 | 删掉即可：5.x 起整个包一处 eval 都没有，CSP 不用放 `'unsafe-eval'` |
| 在渲染里读 ref map 给子组件当 prop（`reader/CardPageView`） | 首帧恒 null，老师钉子要等别的原因触发的重渲染才出现 | 一页一个 `CardPage` 组件、元素走 callback ref 进 state |
| 页面文件顺手导出非组件（成人声明判定、`LICENSES`） | eslint `react-refresh/only-export-components` 红，HMR 整页重载 | 判定单独成 `adultGate.ts`，常量放 `api/tutor.ts` |
