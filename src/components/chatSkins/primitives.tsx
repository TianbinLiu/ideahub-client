/**
 * @file chatSkins/primitives.tsx - 各聊天皮肤共用的最小组件原语。
 * @category Component
 *
 * 边界同 ../skins/primitives.tsx：只放【与平台差异无关】的东西。
 * 「头像是圆是方 / 气泡什么色 / 发送者名显不显示」是布局差异，一律留在各皮肤的 JSX 里。
 */

/** avatar 字段是 url 还是 emoji：约定 url 必以协议或 / 开头，其余一律按 emoji/文本渲染。 */
function isAvatarUrl(avatar: string): boolean {
  return /^(https?:\/\/|data:|blob:|\/)/i.test(avatar);
}

/**
 * 聊天头像：支持 emoji（AI 生成的花名册用 emoji 当头像）或图片 url，两者都没有则用首字符占位。
 * 形状/尺寸由调用它的皮肤按自己平台传（微信=圆角方块、QQ=正圆）。
 * 尺寸走 inline style：`h-${n}` 这类动态类名不会被 Tailwind JIT 生成。
 */
export function ChatAvatar({
  name,
  avatar,
  shape,
  size,
}: {
  name: string;
  avatar?: string;
  shape: "circle" | "rounded";
  size: number;
}) {
  const radius = shape === "circle" ? "rounded-full" : "rounded-[6px]";
  const box = { width: size, height: size };
  const a = (avatar || "").trim();

  if (a && isAvatarUrl(a)) {
    // alt=""：发送者名就在气泡旁的文本里，头像纯装饰，避免读屏重复播报。
    return <img src={a} alt="" style={box} className={`shrink-0 object-cover ${radius} bg-gray-200`} />;
  }

  if (a) {
    // emoji 头像：给一个中性浅底，emoji 本身携带色彩
    return (
      <div
        aria-hidden="true"
        style={{ ...box, fontSize: Math.round(size * 0.58) }}
        className={`flex shrink-0 select-none items-center justify-center bg-gray-200 ${radius}`}
      >
        {a}
      </div>
    );
  }

  const ch = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden="true"
      style={box}
      className={`flex shrink-0 select-none items-center justify-center bg-gray-400 text-sm font-semibold text-white ${radius}`}
    >
      {ch}
    </div>
  );
}
