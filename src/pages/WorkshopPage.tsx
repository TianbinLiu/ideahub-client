import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getWorkshopTagInsights, listMyWorkshopTemplates, listWorkshopTemplates, type WorkshopHotTag, type WorkshopTemplate } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type SortKey = "for_you" | "new" | "hot";
const WORKSHOP_RECENT_TAGS_KEY = "recentWorkshopSearchTags";

export default function WorkshopPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort = (params.get("sort") || "for_you") as SortKey;
  const q = params.get("q") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10), 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WorkshopTemplate[]>([]);
  const [myTemplates, setMyTemplates] = useState<WorkshopTemplate[]>([]);
  const [hotTags, setHotTags] = useState<WorkshopHotTag[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const recentTags = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORKSHOP_RECENT_TAGS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch {
      return [];
    }
  }, []);

  const visibleHotTags = hotTags.slice(0, 4);

  function updateRecentTagsFromInput(input: string) {
    const parts = input.split(/[#,，,\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return;
    const merged = [...parts, ...recentTags.filter((tag) => !parts.includes(tag))].slice(0, 12);
    try {
      localStorage.setItem(WORKSHOP_RECENT_TAGS_KEY, JSON.stringify(merged));
    } catch {
      // ignore persistence failures
    }
  }

  async function load() {
    try {
      setLoading(true);
      const [marketRes, mineRes, insightsRes] = await Promise.all([
        listWorkshopTemplates({ sort, q, page, limit: 12, recentTags }),
        listMyWorkshopTemplates().catch(() => ({ templates: [] as WorkshopTemplate[] } as any)),
        getWorkshopTagInsights(180).catch(() => ({ hotTags: [] as WorkshopHotTag[] } as any)),
      ]);

      setTemplates(marketRes.templates || []);
      setTotalPages(marketRes.totalPages || 1);
      setMyTemplates(mineRes.templates || []);
      setHotTags(insightsRes.hotTags || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sort, q, page]);

  function updateSort(nextSort: SortKey) {
    const next = new URLSearchParams(params);
    next.set("sort", nextSort);
    next.set("page", "1");
    setParams(next);
  }

  function startGlobalTemplateEditing() {
    localStorage.setItem("siteTemplateEditState", "on");
    localStorage.setItem("siteTemplateEditDraft", JSON.stringify({ pages: {} }));
    navigate("/?siteEdit=1");
  }

  return (
    <div className="max-w-6xl mx-auto p-4 ws-custom">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white ws-title">{t("workshop.title")}</h1>
          <p className="text-sm text-gray-300 mt-1">{t("workshop.subtitle")}</p>
        </div>
        <button type="button" onClick={startGlobalTemplateEditing} className="ws-button rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold">
          {t("workshop.createTemplate")}
        </button>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-3">
        <button type="button" onClick={startGlobalTemplateEditing} className="ws-card text-left rounded-2xl border border-emerald-700/60 bg-emerald-950/30 p-4 hover:bg-emerald-950/40">
          <div className="text-xl">🧩</div>
          <h2 className="mt-2 text-lg font-semibold text-white">{t("workshop.selfCreateTitle")}</h2>
          <p className="mt-1 text-sm text-gray-300">{t("workshop.selfCreateDesc")}</p>
        </button>
        <div className="ws-card rounded-2xl border border-cyan-700/60 bg-cyan-950/20 p-4">
          <div className="text-xl">🌐</div>
          <h2 className="mt-2 text-lg font-semibold text-white">{t("workshop.marketTitle")}</h2>
          <p className="mt-1 text-sm text-gray-300">{t("workshop.marketDesc")}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 ws-card">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => updateSort("for_you")} className={`ws-button rounded-lg border px-3 py-1.5 text-sm ${sort === "for_you" ? "border-white text-white" : "border-gray-700 text-gray-300"}`}>
              {t("workshop.forYou")}
            </button>
            <button onClick={() => updateSort("new")} className={`ws-button rounded-lg border px-3 py-1.5 text-sm ${sort === "new" ? "border-white text-white" : "border-gray-700 text-gray-300"}`}>
              {t("workshop.new")}
            </button>
            <button onClick={() => updateSort("hot")} className={`ws-button rounded-lg border px-3 py-1.5 text-sm ${sort === "hot" ? "border-white text-white" : "border-gray-700 text-gray-300"}`}>
              {t("workshop.hot")}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm"
              placeholder={t("workshop.searchPlaceholder")}
            />
            <div className="flex flex-wrap items-center gap-2">
              {visibleHotTags.length === 0 ? (
                <div className="text-sm text-gray-500">{t("workshop.recentTagsHint")}</div>
              ) : (
                <>
                  {visibleHotTags.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      className="rounded-full border border-gray-700 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800"
                      onClick={() => {
                        setSearchInput((prev) => {
                          const tokens = prev.split(/[#,，,\s]+/).map((value) => value.trim()).filter(Boolean);
                          if (tokens.some((token) => token.toLowerCase() === item.tag.toLowerCase())) return prev;
                          return prev.trim() ? `${prev.trim()}, ${item.tag}` : item.tag;
                        });
                      }}
                    >
                      #{item.tag}
                    </button>
                  ))}
                  <Link
                    to="/workshop/tag-map"
                    className="rounded-full border border-gray-700 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800"
                    aria-label={t("workshop.openTagMap")}
                    title={t("workshop.openTagMap")}
                  >
                    ...
                  </Link>
                </>
              )}
            </div>
            <button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", "1");
                if (searchInput.trim()) {
                  next.set("q", searchInput.trim());
                  updateRecentTagsFromInput(searchInput);
                }
                else next.delete("q");
                setParams(next);
              }}
              className="ws-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm hover:bg-gray-800"
            >
              {t("workshop.search")}
            </button>
          </div>
        </div>

        {loading && <p className="mt-4 text-sm text-gray-400">{t("common.loading")}</p>}
        {!loading && templates.length === 0 && (
          <p className="mt-4 text-sm text-gray-400">{t("workshop.emptyMarket")}</p>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <Link key={tpl._id} to={`/workshop/templates/${tpl._id}`} className="ws-card rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-900/70 overflow-hidden">
              <div className="h-36 bg-gray-800">
                {tpl.previewImageUrl ? (
                  <img src={tpl.previewImageUrl} alt={tpl.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">{t("workshop.noPreview")}</div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-white line-clamp-1">{tpl.title}</h3>
                  {tpl.isDefault && <span className="rounded-full border border-amber-600/70 px-2 py-0.5 text-[10px] text-amber-200">{t("workshop.defaultTemplate")}</span>}
                </div>
                <p className="mt-1 text-xs text-gray-300 line-clamp-2">{tpl.summary || t("workshop.noDescription")}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-300">
                    {t("workshop.version")}: {tpl.templateVersion || "-"}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 ${tpl.isCompatible === false ? "border-rose-700/70 text-rose-200" : "border-emerald-700/70 text-emerald-200"}`}>
                    {tpl.isCompatible === false ? t("workshop.incompatible") : t("workshop.compatible")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-cyan-200">
                  {(tpl.tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5">#{tag}</span>
                  ))}
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  👀 {tpl.stats?.viewCount || 0} · ❤️ {tpl.stats?.likeCount || 0} · 🔖 {tpl.stats?.bookmarkCount || 0}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page - 1));
              setParams(next);
            }}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {t("home.prev")}
          </button>
          <span className="text-sm text-gray-400">{t("home.page")} {page}/{totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page + 1));
              setParams(next);
            }}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {t("home.next")}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 ws-card">
        <h2 className="text-lg font-semibold text-white">{t("workshop.myTemplates")}</h2>
        {myTemplates.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">{t("workshop.emptyMine")}</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {myTemplates.map((tpl) => (
              <div key={tpl._id} className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{tpl.title}</p>
                  <p className="text-xs text-gray-400">{tpl.shared ? t("workshop.shared") : t("workshop.private")} · {t("workshop.version")}: {tpl.templateVersion || "-"}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/workshop/templates/${tpl._id}`} className="ws-button rounded-md border border-gray-700 px-2 py-1 text-xs">{t("workshop.viewDetail")}</Link>
                  <Link to={`/workshop/templates/${tpl._id}/edit`} className="ws-button rounded-md border border-cyan-700 px-2 py-1 text-xs text-cyan-300">{t("workshop.edit")}</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
