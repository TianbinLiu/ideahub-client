// 阅读面对外的把手（漫游 / 老师回答里的 [[pN]] / 复习卡都经它跳页与高亮），两种页面视图（PDF / 文字卡）各实现一份同样的形状。
import type { Anchor } from "../types";

export type HighlightResult = { found: boolean; rect?: { top: number; left: number; width: number; height: number } };
export type ReaderApi = {
  pageCount: number;
  /** 滚到某页（page 从 1 起） */
  jumpTo(page: number): void;
  /** 跳到锚点所在页并高亮短引；rect 是相对阅读面滚动容器内容的坐标（给旁注定位）。找不到 → found:false，页不跳 */
  highlight(anchor: Anchor, name?: string): Promise<HighlightResult>;
  clear(name?: string): void;
};
