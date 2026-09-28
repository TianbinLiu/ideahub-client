// /tutor/market：老师人格市场（tutor 仓 docs/02 §7）。逻辑照搬官网 PersonaGalleryPage（scope / sort 页签、tag 可点即筛、分页、全部参数走 URLSearchParams：深链 / 后退可还原），
// 换成 /api/tutor/market（不借 /api/personas?kind=，监管若停陪聊线不连坐）、tutor 命名空间与浅色主题。游客可逛（路由不套 ProtectedRoute），登录后多「我下载的 / 我发布的」两个页签。
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, Search, Star } from "lucide-react";
import { listMarket, type MarketCard, type MarketScope, type MarketSort } from "../../api/tutor";
import { useAuth } from "../../authContext";

const SORTS: MarketSort[] = ["new", "hot", "rating"];
const SCOPES: { key: MarketScope; auth?: boolean }[] = [{ key: "all" }, { key: "installed", auth: true }, { key: "mine", auth: true }];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Card({ p, onTag }: { p: MarketCard; onTag: (tag: string) => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const href = `/tutor/market/${encodeURIComponent(p.id)}`;
  return (
    <li data-testid={`market-card-${p.id}`} className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-zinc-100 text-2xl">{p.coverEmoji}</div>
        <div className="min-w-0 flex-1">
          <Link to={href} data-testid="market-open" className="line-clamp-1 font-semibold hover:underline">{p.name}</Link>
          <div className="text-xs text-zinc-500">{p.subject}{p.version ? ` · ${t("market.version", { v: p.version })}` : ""} · {t("market.by", { name: p.author.username || "—" })}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] font-semibold">
          {p.installed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{t("market.installed")}</span>}
          {p.isOwner && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-cyan-800">{t("market.mine")}</span>}
        </div>
      </div>
      {p.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-600">{p.description}</p>}
      {p.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.tags.slice(0, 4).map((x) => <button key={x} type="button" data-testid="market-tag" onClick={() => onTag(x)} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-200">#{x}</button>)}</div>}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1"><Download size={12} />{t("market.downloads", { n: p.stats.downloadCount })}</span>
        <span className="flex items-center gap-1"><Star size={12} />{p.stats.ratingCount ? t("market.rating", { avg: p.stats.ratingAvg.toFixed(1), n: p.stats.ratingCount }) : t("market.noRating")}</span>
        <Link to={href} className="ml-auto rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-white">{t("market.view")}</Link>
      </div>
    </li>
  );
}

export function TutorMarketPage() {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawScope = params.get("scope") || "all";
  const scope: MarketScope = SCOPES.some((s) => s.key === rawScope) && (user || rawScope === "all") ? (rawScope as MarketScope) : "all";
  const rawSort = params.get("sort") || "new";
  const sort: MarketSort = (SORTS as string[]).includes(rawSort) ? (rawSort as MarketSort) : "new";
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const subject = params.get("subject") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);
  const key = [scope, sort, q, tag, subject, page].join("|");
  const [data, setData] = useState<{ key: string; items: MarketCard[]; totalPages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    listMarket({ scope, sort, q, tag, subject, page, limit: 12 })
      .then((r) => { if (alive) { setData({ key, items: r.items, totalPages: r.totalPages, total: r.total }); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(msg(e)); });
    return () => { alive = false; };
  }, [scope, sort, q, tag, subject, page, key]);
  const view = data && data.key === key ? data : null; // 参数变了、新数据没到之前不画旧列表（否则 ?q=xxx 深链会先闪一下上一页的卡）
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!("page" in patch)) next.set("page", "1");
    setParams(next);
  };
  const submit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("q") || "").trim(); set({ q: v || null }); };
  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900" data-testid="market-page">
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <Link to="/tutor" className="flex items-center gap-1 text-xs text-zinc-600"><ArrowLeft size={14} />{t("market.back")}</Link>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{t("market.title")}</div>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{t("app.aiBadge")}</span>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">
        <p className="mb-3 text-xs text-zinc-500">{t("market.subtitle")}</p>
        <form onSubmit={submit} className="mb-3 flex gap-2">
          <input key={q} name="q" defaultValue={q} placeholder={t("market.search")} data-testid="market-search" className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-cyan-500" />
          <button type="submit" data-testid="market-search-go" className="flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white"><Search size={14} />{t("market.go")}</button>
        </form>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {SCOPES.filter((s) => !s.auth || user).map((s) => <button key={s.key} type="button" data-testid={`market-scope-${s.key}`} onClick={() => set({ scope: s.key })} className={`rounded-full px-3 py-1 ${scope === s.key ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}>{t(`market.scope_${s.key}`)}</button>)}
          <span className="mx-1 h-4 w-px bg-zinc-300" />
          {SORTS.map((s) => <button key={s} type="button" data-testid={`market-sort-${s}`} onClick={() => set({ sort: s })} className={`rounded-full px-3 py-1 ${sort === s ? "bg-cyan-600 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}>{t(`market.sort_${s}`)}</button>)}
          {tag && <button type="button" data-testid="market-tag-clear" onClick={() => set({ tag: null })} className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">{t("market.tagFilter", { tag })} ✕</button>}
          {subject && <button type="button" onClick={() => set({ subject: null })} className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">{t("market.subjectFilter", { subject })} ✕</button>}
        </div>
        {error && <p className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{t("app.error", { message: error })}</p>}
        {!view && !error && <p className="text-sm text-zinc-500">{t("market.loading")}</p>}
        {view && view.items.length === 0 && <p data-testid="market-empty" className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">{t("market.empty")}</p>}
        <ul data-testid="market-list" data-loaded={view ? "1" : "0"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(view?.items || []).map((p) => <Card key={p.id} p={p} onTag={(x) => set({ tag: x })} />)}
        </ul>
        {view && view.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-xs">
            <button type="button" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-40">{t("market.prev")}</button>
            <span className="text-zinc-500">{t("market.page", { page, total: view.totalPages })}</span>
            <button type="button" disabled={page >= view.totalPages} onClick={() => set({ page: String(page + 1) })} className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-40">{t("market.next")}</button>
          </div>
        )}
        <p className="mt-6 text-center text-[11px] text-zinc-400">{t("market.publishHint")}</p>
      </main>
    </div>
  );
}
