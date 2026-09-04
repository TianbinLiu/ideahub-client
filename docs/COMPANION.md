# 首页看板娘数字人（Live2D 陪聊）

首页左列底层站着一个会说话的 Live2D 看板娘：用户在底部对话框输入 → 服务端 DeepSeek 流式生成 →
按句切分并带上 `[情绪][face:x][action:y]` 标签 → 前端逐句调豆包 TTS → 播放时口型跟着音频包络、
表情/动作按标签切换。

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `src/pages/HomePage.tsx` | 布局：左列（入口/筛选 → 可收起的推荐位 → 舞台留白 → 对话框），右栏（关注动态竖排 + 标签排行单列）；场景背景层 |
| `src/components/CompanionStage.tsx` | Live2D 画布，铺满左列 z-0；模型按"留白 div"定位、跟随鼠标转头；登录用户按设置加载市场模型 |
| `src/components/CompanionChat.tsx` | 对话框：SSE 流式对话、逐句 TTS（按合并后的音色）、演出队列、字幕、登录门禁、语音开关、场景 / 人格 / 换装按钮 |
| `src/components/SceneBackgroundPicker.tsx` | 场景背景弹窗（默认深蓝 / 酒馆 / 卧室 / 书房 / 露台 / 咖啡馆 / 画室） |
| `src/components/VoiceSettingsFields.tsx` | 「音频」表单块（单音色 / 混音 / 声音市场模板 三种模式 + 语速 / 音调 / 语调指令 / 情感模式 / 试听），人格编辑器、模型编辑器、首页声音面板共用 |
| `src/components/VoiceSliders.tsx` | 语速 / 音调滑杆（带「跟随」态），音频表单与模板编辑器共用 |
| `src/components/VoiceMixer.tsx` | 混音器：1～3 味 1.0 音色 × 权重滑杆，显示归一后的百分比，带试听 |
| `src/components/VoiceSummary.tsx` | 一组音频设置的只读摘要（人格详情 / 模型详情）：混音显示配方，来自模板显示来源链接 |
| `src/components/VoiceTemplateCard.tsx` | 声音模板卡片（配方摘要 / 语速音调 / ⬆ ❤ / 试听 / 主动作），市场列表、首页面板、选择器共用 |
| `src/components/VoiceTemplateBrowser.tsx` | 模板紧凑浏览器（搜索 + 全部/我的 + 最热/最新），首页声音面板与选择器弹窗共用 |
| `src/components/VoiceTemplatePickerModal.tsx` | 「声音市场模板」选择器弹窗（音频表单用） |
| `src/components/CompanionVoiceModal.tsx` | 首页对话框「声音」面板：当前生效的声音 + 模板市场 tab + 自定义 tab（保存 / 恢复跟随） |
| `src/pages/VoiceMarketPage.tsx` | 声音市场列表 `/voices/market`：设为我的声音 / 点赞 / 试听 |
| `src/pages/VoiceTemplateDetailPage.tsx` | 模板详情 `/voices/market/:id`：配方表 / 语速音调 / 统计 / 作者编辑删除 |
| `src/pages/VoiceTemplateEditorPage.tsx` | 创建 / 编辑模板 `/voices/market/new`、`/voices/market/:id/edit` |
| `src/companion/voiceMix.ts` | 混音纯函数：权重归一 / 百分比（最大余数法）/ 配方文案 / `buildTtsRequest`（VoiceSettings → /api/tts 请求体的唯一实现）/ 服务端人话透传 |
| `src/companion/voiceTemplates.ts` | 模板公共小件：作者名 / 错误文案 / 模板名缓存 hook / 试听句子 / 模板 → VoiceSettings 快照 |
| `src/hooks/useAudioPreview.ts` | 所有「试听」按钮共用的播放逻辑（object URL 的 revoke、全站同时只放一段、过期结果丢弃） |
| `src/components/Live2dModelCover.tsx` | 模型封面（无图时名字首字占位） |
| `src/pages/Live2dMarketPage.tsx` | 模型市场列表 `/live2d/market`：使用 / 收藏 / 点赞 |
| `src/pages/Live2dModelDetailPage.tsx` | 模型详情 `/live2d/market/:id`：模型信息 / 推荐人格 / 推荐音色 |
| `src/pages/Live2dModelEditorPage.tsx` | 上传 / 编辑模型 `/live2d/market/new`、`/live2d/market/:id/edit` |
| `src/hooks/useCompanionSettings.ts` | 读 `GET /api/companion/settings`，并监听 `ideahub:companion-updated` 刷新 |
| `src/companion/modelSource.ts` | 「该加载哪个 model3.json」的唯一实现（官方内置 vs 市场模型） |
| `src/companion/ttsVoices.ts` | 音色目录（`GET /api/tts/voices`：2.0 单音色 `voices` + 1.0 混音原料 `mixable`）缓存 + hook + id 校验 |
| `src/companion/live2dUploadError.ts` | 把服务端解包失败的英文报错翻成 i18n key |
| `src/live2d/loader.ts` | 从 CDN 串行加载 Cubism Core → pixi.js 7 → pixi-live2d-display（lipsync 补丁版） |
| `src/live2d/companionModel.ts` | 模型驱动：表情补片 / 动作 / 眨眼 / 口型包络 / 视线，全部挂在 ticker LOW 优先级；换 url 销毁重建 |
| `src/companion/protocol.ts` | 9 种 face × 11 种 action 的映射与节奏常量（必须与服务端 `companion.service.js` 一致） |
| `src/companion/sse.ts` | 带缓冲的 SSE 解析器（fetch + ReadableStream，因为要带 Bearer 的 POST） |
| `src/companion/speech.ts` | 播放 TTS Blob，同时用 AnalyserNode 算响度包络喂口型 |
| `src/companion/bus.ts` | 舞台与对话框之间的模块级单例（兄弟组件，不用 context 免得整页重渲染） |
| `src/companion/scenes.ts` | 场景清单 + localStorage 偏好 |
| `src/api.ts` | `getCompanionConfig` / `streamCompanionChat` / `synthesizeSpeech`；`getCompanionSettings` / `updateCompanionSettings`；`listLive2dModels` 等模型市场接口；`listVoiceTemplates` 等声音市场接口 |
| `public/live2d/mascot/` | 官方看板娘模型（moc3 + 4096 webp 贴图 + exp3/motion3） |
| `public/backgrounds/` | 场景背景 webp（1920×1080）与缩略图 |

服务端契约见 ideahub-server `src/routes/companion.routes.js`（SSE 事件 `sentence`/`token`/`done`/`error`）
与 `src/routes/tts.routes.js`；人格 / 音频 / 模型市场见下面那节。

## 模型是怎么来的（要改形象时看这里）

1. 用看板娘设定图喂 Seedream 5.0 生成 Live2D 用的"正面立绘拆分表"，再生成几张表情变体（张嘴/闭眼/笑眼/怒眉）。
2. See-through（HF Space `24yearsold/see-through-demo`）把立绘拆成 16 层 PSD；按 Cubism 命名规范重组成分组 PSD
   （Face / Eye L / Eye R / Eyeball L … + 四个顶层表情补片 Part `ExprSmile/ExprAngry/ExprClosed/ExprMouthOpen`）。
   **每层必须裁到自身 alpha 包围盒**，否则 Cubism 自动生成脸部变形器会失败（"rect is invalid"）。
3. Cubism Editor 5.3（PRO 试用）：导入 PSD → 参数面板「自动生成脸部动作」→ 4096 贴图集 → 以 SDK 4.2 兼容格式导出 moc3。
4. 手写 exp3 / motion3（idle/nod/shake/think/excited），合并进 model3.json 的 FileReferences 与 Groups（EyeBlink/LipSync）。

工作目录在仓库外：`C:/Users/tliu7/live2d-lab/`（脚本、cmo3 工程、验证页 `stage-test/`）。

5. （mascot8，2026-09-04）在 Cubism 里补的形变：`Mouth Open Warp`（ParamMouthOpenY 0→1 从一条线连续张到全开）、
   `Mouth Warp` 的 ParamMouthForm（-1 窄 / 1 宽）、`Eye L/R Warp` 的 ParamEyeL/ROpen（1→0 整组眼睛压扁到睫毛线，
   闭眼补片 `eyes_closed_L/R` 的不透明度也钉在同一参数上），以及披风(550)>双臂(500)、前发/头饰(600) 的绘制顺序。
   运行时因此改成参数驱动：`ExprClosed/ExprMouthOpen` 两个 Part 常开，眨眼是 70/40/120ms 的曲线，口型 = 包络^0.7 × 0.85。

已知限制：`ExprSmile/ExprAngry` 仍是整块补片（笑眼/怒目盖在真眼上）；头发物理未做；贴图 4096 一张。

## 人格 / 音频 / 模型市场

数字人由三层叠加而成，每一层都能单独换、也都能「不设置」让下一层生效：

| 层 | 决定什么 | 从哪来 | 前端入口 |
| --- | --- | --- | --- |
| 人格（persona） | 说话的口吻与人设（服务端提示词自动带上） | 用户自己选的 → 模型作者推荐的 → 默认人设 | 人格详情页「设为我的数字人人格」、首页对话框「人格」按钮（PersonaPickerModal） |
| 音频（voice） | 豆包 TTS 参数：音色 / 语速 / 音调 / 语调指令 / 情感模式 | 用户覆盖 > 人格自带（`Persona.voice`）> 模型推荐（`Live2dModel.voice`）> 服务端默认 | 人格编辑器「音频（可选）」、模型编辑器「③ 音频」（都用 `VoiceSettingsFields`） |
| 模型（model） | 长什么样（Live2D 包） | 用户在市场「使用」的模型 → 官方内置 `official-mascot` | `/live2d/market`、首页对话框「换装」按钮 |

- 服务端负责合并：`GET /api/companion/config` 登录时多带 `voiceSettings`（合并结果，直接展开进 `/api/tts`）、
  `persona` / `personaSource`（`user` | `model` | `""`）、`model`（null = 官方内置）。老字段 `voice` 仍在，= `voiceSettings.voiceId`。
- `GET/PUT /api/companion/settings`：用户自己的三个选择 `{ personaId, modelId, voice }`，缺省不动、null 清掉，
  `modelId: "official-mascot"` 等价 null。选不能用的人格 → 403 `{ code: "FORBIDDEN", details: { reason: "private" | "unpaid" } }`
  （`companionForbiddenReason()` 取原因）；付费人格要先在人格详情页购买。
- **「使用」≠「收藏」**：使用 = `PUT settings { modelId }`；收藏（`POST /:id/install`）只是书签 + 下载计数，官方条目不能收藏。
- 官方模型的 `modelJsonUrl` 是空串：`resolveCompanionModelUrl()` 回落到本地打包的 `/live2d/mascot/mascot.model3.json`。
  市场模型加载失败时舞台也回落到官方模型（不让舞台整个消失）。
- TTS 每句的参数：`voice / rate / pitch / expressive` 来自 `voiceSettings`，`emotion / instruct` 来自 `sentence.tts`
  （`instruct` 已是「人设语调；情绪语调」合并后的串）。老服务端没有 `voiceSettings` 时回落到 `voice` + `expressive: true`。
- 上传模型：`POST /api/live2d-models`（multipart：`bundle` zip ≤25MB、`name`、`description`、`coverImageUrl`、`tags` 逗号分隔、
  `shared`、`personaId`、`voice` JSON 字符串）。只支持 Cubism 3/4；服务端解包失败的英文 message 由
  `live2dUploadErrorKey()` 翻成中文（Cubism 2 / 缺贴图 / 缺 moc3 / 没有 model3.json / 包太大），不认识的原样显示。

### `ideahub:companion-updated` 事件

设置一改，首页舞台（换模型要销毁重建）、对话框（人格 chip、音色）、市场页（「使用中」徽标）都得知道，
而这些组件分布在不同路由、不共享 state。所以 `updateCompanionSettings()` 成功后在 `window` 上广播
`ideahub:companion-updated`（常量 `COMPANION_UPDATED_EVENT`），`useCompanionSettings` 与 `CompanionChat` 监听它重拉。
删除自己正在用的模型时详情页也会补发一次。★ 事件只在 `updateCompanionSettings` 里发一处，不要在调用方各自 dispatch。

## 声音市场（混音模板）

服务端契约：ideahub-server PR #49（`/api/voice-templates`、`GET /api/tts/voices` 的 `mixable` / `maxMixVoices`、`POST /api/tts` 的 `mix`）。
一个「声音模板」= 1～3 味豆包 **1.0** 基础音色按比例调和 + 语速 + 音高，可以公开分享，别人一键换上。

### `VoiceSettings` 的三种形态

| 形态 | 字段 | 表单里叫什么 | TTS 怎么发 |
| --- | --- | --- | --- |
| 单音色 | `voiceId`（+ `instruct` / `expressive`） | 「单音色」：目录下拉 / 自定义 ID | `{ voice, rate, pitch, expressive, emotion, instruct }` |
| 混音 | `mix: [{ voiceId, weight }] × 1～3`，`voiceId` 服务端清空 | 「混音」：`VoiceMixer` | `{ mix, rate, pitch }` —— **不传** voice / instruct / expressive / emotion |
| 来自模板 | `mix` + `templateId` | 「声音市场模板」：选择器 → chip「来自模板：xx」 | 同混音 |

- **只有 1.0 音色能混**（`*_moon_bigtts` / `*_mars_bigtts`）。目录里 2.0 单音色（`voices`，支持语调指令 / 情感模式）与
  1.0 混音原料（`mixable`）分开给：单音色下拉只列前者，混音器只列后者。2.0 id 进配方服务端 400，message 是中文人话，
  `voiceErrorMessage()` 原样展示（`humanizeError` 会把 VALIDATION_ERROR 翻成笼统的「请检查输入」，所以要先过 `serverHumanMessage`）。
- **语调指令 / 情感模式对混音无效**：混音模式下指令框禁用、情感模式不显示；`buildTtsRequest()` 也不会把它们发出去。
- **权重**：滑杆 0.05～1（step 0.05），UI 显示归一后的百分比（`mixPercentages` 最大余数法，三味等权是 34/33/33 而不是 33/33/33=99%）；
  请求体用 `normalizeMixWeights` 归一到和为 1（3 位小数），服务端会再归一一遍。
- **`templateId` 是快照标记**：「使用」模板 = `PUT /api/companion/settings { voice: { templateId } }`（服务端展开成整份 VoiceSettings）
  + `POST /api/voice-templates/:id/use` 计数（计数失败不影响设置，只 `console.warn`）。之后模板被作者改了、删了，用户的声音**不变**，
  只是各处不再显示「使用中」、摘要里显示「模板已不存在」。人格 / 模型的 `voice` 同样可以带 `mix` / `templateId`。
- **模式切换即改 value**（`VoiceSettingsFields`）：模式从 value 推导（`templateId` → 模板；`mix` 非空 → 混音；否则单音色），
  切到「单音色」清掉 `mix` / `templateId`；切到「混音」清掉 `templateId`（配方复制成自己的，chip 消失）；
  「声音市场模板」那个 tab 是按钮，点开选择器，选中才切过去。
- **试听句子统一**：「你好，我是{数字人名}，这是我的新声音。」（`usePreviewSentence`，首页面板用 `config.name`，其它地方用默认名）。
- **首页入口**：对话框「声音」按钮 → `CompanionVoiceModal`：顶部是合并结果（`config.voiceSettings`）+ 来源；「模板市场」tab 一键设为；
  「自定义」tab 绑定 `settings.settings.voice`（用户覆盖那一层，**不是**合并结果，否则人格自带的音色会被当成用户改过的存回去），
  「恢复跟随人格 / 模型」= `{ voice: null }`。
- 路由 `/voices/market`、`/voices/market/:id`（游客可看可试听）、`/voices/market/new`、`/voices/market/:id/edit`（`ProtectedRoute`）。

## 运行时行为速查

- 游客：能看到舞台和对话框，输入框聚焦即弹登录；`GET /api/companion/config.enabled=false` 时输入框禁用并提示。
  游客永远看官方模型（设置接口要登录，不打）。
- 登录用户：舞台等 `/api/companion/settings` 回来再第一次加载模型，避免先加载官方模型再销毁重建。
- 语音开关记在 `localStorage.ideahub-companion-voice`；关掉后按字数合成口型（110ms/字，上限 6s）。
- "停止"= runId 递增 + abort 请求 + 停播放：所有排队中的旧句子自动放弃。
- 移动端（<lg）不挂舞台（省 700KB 运行时），对话框照常。
- 首页不显示右下角的旧 Live2D 挂件（`SiteLive2D` 在 `/` 上主动卸载），其他页面不受影响。
- 模型市场路由不在 `/arena` 下（那一片有浏览器插件门禁），游客也能逛；new / edit 走 `ProtectedRoute`。
