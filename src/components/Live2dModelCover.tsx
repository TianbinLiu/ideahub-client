/**
 * @file Live2dModelCover.tsx - 模型市场封面统一渲染：有封面图显示图片，否则用名字首字的占位块
 * @category Component
 *
 * 与 PersonaCover 同一个思路（展示点多：市场卡片 / 详情页 / 首页「使用中」提示），回退逻辑只写一处。
 * 没有 emoji 可回退（模型没有 coverEmoji 字段），所以占位是渐变底 + 名字首字；图片加载失败同样回退。
 */
import { useState } from "react";

type Props = {
  name: string;
  imageUrl?: string;
  /** 方形边长的 tailwind 尺寸类 */
  sizeClass?: string;
  /** 占位首字的字号类 */
  textClass?: string;
  alt?: string;
};

export default function Live2dModelCover({ name, imageUrl, sizeClass = "h-12 w-12", textClass = "text-xl", alt = "" }: Props) {
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
  // Array.from 按码点取首字：名字以 emoji 开头时不会切出半个代理对
  const initial = Array.from(String(name || "").trim())[0] || "L";
  return (
    <span
      className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-xl border border-gray-800 bg-[linear-gradient(135deg,#0e7490,#1e1b4b)] font-bold uppercase text-white`}
      aria-hidden={!alt}
      title={alt || undefined}
    >
      {initial}
    </span>
  );
}
