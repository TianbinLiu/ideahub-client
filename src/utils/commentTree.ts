/**
 * @file commentTree.ts - 讨论区楼中楼建树（防环）
 * @category Utility
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 *
 * 职责:
 * - 把扁平评论数组按 parentId 组织成【两层】森林：顶楼 + 每个顶楼下的回复
 *
 * ⚠️ 为什么不用朴素递归：parentId 是后端存的裸 id，可能指向
 *   (a) 不存在的评论（父级已被删）
 *   (b) 自己
 *   (c) 一条最终指回自己的评论（脏数据 / 有人手搓请求）
 *   朴素递归遇到 (c) 会无限循环；「只渲染 parentId==null 的顶楼」这种写法遇到 (a)(b)(c)
 *   会把评论【静默丢掉】——用户发了却看不见，最难查。PlatformCommentView 上已经踩过一次。
 *
 * 本实现：沿父链上溯到顶楼祖先，全程带 visited 集合，命中环立刻停；
 *   父级找不到 / 命中环 / 超过一层的，一律【降级为顶楼展示】而不是丢弃。
 *   保证：每条评论恰好出现一次，且函数一定终止。
 */

/** 建树只需要 id 与 parentId，故对元素形状做最小约束（便于复用与单测）。 */
export type ThreadNode = { _id: string; parentId?: string | null };

export type CommentTree<T extends ThreadNode> = {
  /** 顶楼（含所有降级上来的孤儿/环/超深评论），保持入参顺序 */
  topLevel: T[];
  /** 顶楼 id -> 其下所有回复（含原本挂在回复上的第三层，已重挂到顶楼），保持入参顺序 */
  repliesByParent: Map<string, T[]>;
};

export function buildCommentTree<T extends ThreadNode>(comments: T[]): CommentTree<T> {
  const byId = new Map<string, T>();
  for (const c of comments) byId.set(c._id, c);

  /** 直接父级；父不存在或自引用一律视为“无父” */
  const directParent = (c: T | undefined): string | null => {
    if (!c) return null;
    const pid = c.parentId ?? null;
    return pid != null && pid !== c._id && byId.has(pid) ? pid : null;
  };

  /**
   * 上溯到顶楼祖先的 id；若 c 本身就是顶楼、或父链成环 -> null（降级为顶楼）。
   * visited 每轮必新增一个 id，而 id 数量有限，故循环必然终止。
   */
  const rootOf = (c: T): string | null => {
    let cur = directParent(c);
    if (cur == null) return null;

    const visited = new Set<string>([c._id]);
    for (;;) {
      if (visited.has(cur)) return null; // 命中环 -> 降级为顶楼
      visited.add(cur);
      const next = directParent(byId.get(cur));
      if (next == null) return cur; // cur 没有父级 = 顶楼祖先
      cur = next;
    }
  };

  const topLevel: T[] = [];
  const repliesByParent = new Map<string, T[]>();

  for (const c of comments) {
    const root = rootOf(c);
    if (root == null) {
      topLevel.push(c);
    } else {
      const arr = repliesByParent.get(root);
      if (arr) arr.push(c);
      else repliesByParent.set(root, [c]);
    }
  }

  return { topLevel, repliesByParent };
}
