/**
 * @file skins/primitives.tsx - 各平台皮肤共用的最小【组件】原语（只放组件，纯函数在 ./helpers.ts）。
 * @category Component
 *
 * ★ 边界（本次重构的核心教训，别越界）：
 *   这里只放【与平台差异无关】的东西。「谁用方头像 / 谁有楼层号 / 操作区放几个键 /
 *   用户名和正文在不在同一行」这类【布局差异】一律【不进来】—— 那正是上一版做成
 *   SKINS 配置表、最后退化成「配色变体」的根因。平台差异 = 各皮肤组件自己的 JSX。
 */
/**
 * 头像。形状/尺寸【不在这里决定】，由调用它的皮肤按自己平台传：
 * 贴吧是方头像（shape="square"）、IG/小红书是小圆头像、B站/微博是大圆头像。
 * 尺寸走 inline style 而不是 Tailwind 类名，因为 `h-${n}` 这类动态类名不会被 JIT 生成。
 */
export function Avatar({
  name,
  url,
  shape,
  size,
  ringClass = "",
}: {
  name: string;
  url?: string;
  shape: "circle" | "square";
  size: number;
  ringClass?: string;
}) {
  const radius = shape === "square" ? "rounded-[4px]" : "rounded-full";
  const box = { width: size, height: size };

  if (url) {
    // alt="" ：用户名就在旁边的文本里，头像纯装饰，避免读屏重复播报。
    return (
      <img
        src={url}
        alt=""
        style={box}
        className={`shrink-0 object-cover ${radius} ${ringClass}`}
      />
    );
  }

  const ch = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden="true"
      style={box}
      className={`flex shrink-0 select-none items-center justify-center bg-gray-700 text-sm font-semibold text-gray-100 ${radius} ${ringClass}`}
    >
      {ch}
    </div>
  );
}

/**
 * play 页 AI 回复的微标。
 * 各皮肤【统一】用这一个样式：这不是平台差异，而是本产品自己的诚实标注
 * （告诉用户「这条是 AI 扮演的」），不该被做成某个平台的风格。
 */
export function AiTag() {
  return (
    <span className="shrink-0 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-purple-200">
      AI
    </span>
  );
}

