/**
 * @file PersonaCover.tsx - 人格封面统一渲染：有图片封面显示图片，否则显示 emoji。
 * @category Component
 *
 * 人格封面有两种来源（Persona.coverImageUrl 优先于 coverEmoji），展示点有四处
 * （画廊卡片 / 详情页 / 选择器行 / 情景详情人格卡）——集中在这一个组件里，
 * 新增展示点或调整回退逻辑只改这里。图片加载失败自动回退 emoji（onError latch）。
 */
import { useState } from "react";

type PersonaCoverProps = {
  emoji?: string;
  imageUrl?: string;
  /** 方形边长的 tailwind 尺寸类；emoji 模式时作为字号容器 */
  sizeClass?: string;
  /** emoji 模式下的字号类 */
  emojiClass?: string;
  alt?: string;
};

export default function PersonaCover({
  emoji,
  imageUrl,
  sizeClass = "h-10 w-10",
  emojiClass = "text-3xl",
  alt = "",
}: PersonaCoverProps) {
  const [broken, setBroken] = useState(false);
  const url = (imageUrl || "").trim();

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={alt}
        onError={() => setBroken(true)}
        className={`${sizeClass} shrink-0 rounded-xl border border-gray-800 object-cover`}
      />
    );
  }
  return (
    <span className={`${emojiClass} shrink-0 leading-none`} aria-hidden={!alt}>
      {emoji || "🎭"}
    </span>
  );
}
