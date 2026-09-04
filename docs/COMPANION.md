# 首页看板娘数字人（Live2D 陪聊）

首页左列底层站着一个会说话的 Live2D 看板娘：用户在底部对话框输入 → 服务端 DeepSeek 流式生成 →
按句切分并带上 `[情绪][face:x][action:y]` 标签 → 前端逐句调豆包 TTS → 播放时口型跟着音频包络、
表情/动作按标签切换。

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `src/pages/HomePage.tsx` | 布局：左列（入口/筛选 → 可收起的推荐位 → 舞台留白 → 对话框），右栏（关注动态竖排 + 标签排行单列）；场景背景层 |
| `src/components/CompanionStage.tsx` | Live2D 画布，铺满左列 z-0；模型按"留白 div"定位、跟随鼠标转头 |
| `src/components/CompanionChat.tsx` | 对话框：SSE 流式对话、逐句 TTS、演出队列、字幕、登录门禁、语音开关、场景按钮 |
| `src/components/SceneBackgroundPicker.tsx` | 场景背景弹窗（默认深蓝 / 酒馆 / 卧室 / 书房 / 露台 / 咖啡馆 / 画室） |
| `src/live2d/loader.ts` | 从 CDN 串行加载 Cubism Core → pixi.js 7 → pixi-live2d-display（lipsync 补丁版） |
| `src/live2d/companionModel.ts` | 模型驱动：表情补片 / 动作 / 眨眼 / 口型包络 / 视线，全部挂在 ticker LOW 优先级 |
| `src/companion/protocol.ts` | 9 种 face × 11 种 action 的映射与节奏常量（必须与服务端 `companion.service.js` 一致） |
| `src/companion/sse.ts` | 带缓冲的 SSE 解析器（fetch + ReadableStream，因为要带 Bearer 的 POST） |
| `src/companion/speech.ts` | 播放 TTS Blob，同时用 AnalyserNode 算响度包络喂口型 |
| `src/companion/bus.ts` | 舞台与对话框之间的模块级单例（兄弟组件，不用 context 免得整页重渲染） |
| `src/companion/scenes.ts` | 场景清单 + localStorage 偏好 |
| `src/api.ts` | `getCompanionConfig` / `streamCompanionChat` / `synthesizeSpeech` |
| `public/live2d/mascot/` | 看板娘模型（moc3 + 4096 webp 贴图 + exp3/motion3） |
| `public/backgrounds/` | 场景背景 webp（1920×1080）与缩略图 |

服务端契约见 ideahub-server `src/routes/companion.routes.js`（SSE 事件 `sentence`/`token`/`done`/`error`）
与 `src/routes/tts.routes.js`。

## 模型是怎么来的（要改形象时看这里）

1. 用看板娘设定图喂 Seedream 5.0 生成 Live2D 用的"正面立绘拆分表"，再生成几张表情变体（张嘴/闭眼/笑眼/怒眉）。
2. See-through（HF Space `24yearsold/see-through-demo`）把立绘拆成 16 层 PSD；按 Cubism 命名规范重组成分组 PSD
   （Face / Eye L / Eye R / Eyeball L … + 四个顶层表情补片 Part `ExprSmile/ExprAngry/ExprClosed/ExprMouthOpen`）。
   **每层必须裁到自身 alpha 包围盒**，否则 Cubism 自动生成脸部变形器会失败（"rect is invalid"）。
3. Cubism Editor 5.3（PRO 试用）：导入 PSD → 参数面板「自动生成脸部动作」→ 4096 贴图集 → 以 SDK 4.2 兼容格式导出 moc3。
4. 手写 exp3 / motion3（idle/nod/shake/think/excited），合并进 model3.json 的 FileReferences 与 Groups（EyeBlink/LipSync）。

工作目录在仓库外：`C:/Users/tliu7/live2d-lab/`（脚本、cmo3 工程、验证页 `stage-test/`）。

已知限制：moc3 里嘴/眼还没有形变器，张嘴与眨眼靠补片不透明度；身体/呼吸变形器与头发物理未做。

## 运行时行为速查

- 游客：能看到舞台和对话框，输入框聚焦即弹登录；`GET /api/companion/config.enabled=false` 时输入框禁用并提示。
- 语音开关记在 `localStorage.ideahub-companion-voice`；关掉后按字数合成口型（110ms/字，上限 6s）。
- "停止"= runId 递增 + abort 请求 + 停播放：所有排队中的旧句子自动放弃。
- 移动端（<lg）不挂舞台（省 700KB 运行时），对话框照常。
- 首页不显示右下角的旧 Live2D 挂件（`SiteLive2D` 在 `/` 上主动卸载），其他页面不受影响。
