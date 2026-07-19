import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// ★ 为什么 test 段写在【这里】而不是单独的 vitest.config.ts：
//   vitest 只会读【一个】配置文件 —— 存在 vitest.config.ts 时它就【不再加载】vite.config.ts，
//   两边的 plugins/resolve 会各写一份、然后慢慢漂移（测试里的 JSX 转换与生产不是同一条链路，
//   测试就失去了「测的是真组件」的意义）。写在这里 = 测试与生产共用同一份 plugins（含 @vitejs/plugin-react）。
//   代价只是 defineConfig 改从 'vitest/config' 导入（它就是 vite 的 defineConfig + test 字段类型），
//   vitest 是 devDependency、且本文件只在构建期被 Node 执行，【不会进生产包】。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_BASE?.trim() || 'http://localhost:4000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      // 皮肤证明要把渲染结果解析成 DOM 再做剥离，需要 DOMParser/Node/NodeFilter。
      // jsdom 自带这些，故【不需要】cheerio 之类的第三方解析器。
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
