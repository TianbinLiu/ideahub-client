/**
 * @file PageLoading.tsx - 路由级懒加载的 Suspense 兜底（代码分割 chunk 加载中显示）
 * @category Component
 * @i18n none（仅无障碍读屏文案）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 *
 * 为什么存在：App.tsx 各页面改为 React.lazy 后，首进/切页会有一次 chunk 网络加载。
 * 放在各 layout 的 <Outlet> 外层 Suspense，加载中只在内容区显示这个轻量骨架，
 * 导航栏保持不动（避免整页闪）。也顺带缓解冷启动内容区白屏。
 */
export default function PageLoading() {
  return (
    <div
      className="flex items-center justify-center py-24 text-gray-400"
      role="status"
      aria-live="polite"
    >
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-cyan-400" />
      <span className="sr-only">加载中…</span>
    </div>
  );
}
