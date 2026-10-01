# `src/tutor/shared/` —— 与 tutor 仓 / server 同一份的纯函数（verbatim 拷贝，别手改）

`materials/blocks.js`（切块 / 块 hash / 找短引）、`materials/pptxXml.js`（PPTX 幻灯 XML → 块）、`format/normalize.js`、`format/constants.js`、`generate/demo.js`（化名提示 / 风格预设）
逐字来自 tutor 仓 `src/` 的同名文件（目录结构也照搬，所以它们之间的相对 import 原样成立）。

- **为什么必须同一份**：浏览器抽文本切出来的块 hash 要与服务端存的逐块相同，锚点才钉得回去（tutor 仓 docs/05 §4.2）。
- **改规则只改 tutor 仓**，再在那边跑 `npm run port:client -- <本仓路径>` 同步过来；这里手改一行，下一次同步就被覆盖、两边从此分叉。
- `.d.ts` 是本仓自己写的类型声明（同名放在 .js 旁），只声明用到的导出。
