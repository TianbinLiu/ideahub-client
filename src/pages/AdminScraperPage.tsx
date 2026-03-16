import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { apiFetch } from "../api";
import { humanizeError } from "../utils/humanizeError";

type PlatformItem = {
  id: string;
  name: string;
  type: string;
  supportsViewThreshold: boolean;
  status: "ready" | "limited";
  note?: string;
};

type CrawlResult = {
  platform: string;
  keywords: string[];
  minViews: number;
  maxPages: number;
  maxCreate: number;
  scanned: number;
  createdCount: number;
  skipped: {
    belowThreshold: number;
    existing: number;
    invalid: number;
    overCreateLimit: number;
  };
  created: Array<{
    _id: string;
    title: string;
    url: string;
    views: number;
    tags: string[];
  }>;
};

type CrawlHistoryItem = {
  _id: string;
  platform: string;
  status: "running" | "success" | "failed";
  params?: {
    keywords?: string[];
    minViews?: number;
    limit?: number;
    maxPages?: number;
    maxCreate?: number;
  };
  stats?: {
    scanned?: number;
    createdCount?: number;
    skippedBelowThreshold?: number;
    skippedExisting?: number;
    skippedInvalid?: number;
    skippedOverCreateLimit?: number;
  };
  triggeredBy?: { _id: string; username: string };
  errorMessage?: string;
  createdAt?: string;
  finishedAt?: string;
};

const VIEW_THRESHOLDS = [0, 100000, 300000, 500000, 1000000];

export default function AdminScraperPage() {
  const { t } = useTranslation();
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [platform, setPlatform] = useState("bilibili");
  const [keywordsInput, setKeywordsInput] = useState("热门\n科技\n游戏");
  const [minViews, setMinViews] = useState(100000);
  const [limit, setLimit] = useState(80);
  const [maxPages, setMaxPages] = useState(8);
  const [maxCreate, setMaxCreate] = useState(40);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [history, setHistory] = useState<CrawlHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      const res = await apiFetch<{ jobs: CrawlHistoryItem[] }>("/api/scraper/admin/history?limit=20");
      setHistory(res.jobs || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    async function loadPlatforms() {
      try {
        setLoadingPlatforms(true);
        const res = await apiFetch<{ platforms: PlatformItem[] }>("/api/scraper/admin/platforms");
        const list = res.platforms || [];
        setPlatforms(list);
        if (list.length > 0 && !list.find((p) => p.id === platform)) {
          setPlatform(list[0].id);
        }
      } catch (e: any) {
        toast.error(humanizeError(e));
      } finally {
        setLoadingPlatforms(false);
      }
    }

    loadPlatforms();
    loadHistory();
  }, []);

  async function runCrawler() {
    try {
      setRunning(true);
      setResult(null);
      
      console.log('[Crawler] Starting crawl with params:', {
        platform,
        keywords: keywordsInput,
        minViews,
        limit,
        maxPages,
        maxCreate,
      });
      
      const res = await apiFetch<CrawlResult>("/api/scraper/admin/crawl", {
        method: "POST",
        body: JSON.stringify({
          platform,
          keywords: keywordsInput,
          minViews,
          limit,
          maxPages,
          maxCreate,
        }),
      });
      
      console.log('[Crawler] Success:', res);
      setResult(res);
      toast.success(t("scraperAdmin.runSuccess"));
      loadHistory();
    } catch (e: any) {
      console.error('[Crawler] Error:', e);
      console.error('[Crawler] Error status:', e.status);
      console.error('[Crawler] Error code:', e.code);
      console.error('[Crawler] Error message:', e.message);

      if (e.status === 401) {
        toast.error('未授权 (401): 请重新登录');
      } else if (e.status === 403) {
        toast.error('权限不足 (403): 需要管理员权限');
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setRunning(false);
    }
  }

  const selectedPlatform = platforms.find((p) => p.id === platform);

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">{t("scraperAdmin.title")}</h1>
      <p className="text-sm text-gray-400 mt-1">{t("scraperAdmin.subtitle")}</p>

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("scraperAdmin.platform")}</label>
            <select
              className="w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              disabled={loadingPlatforms || running}
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selectedPlatform?.note && (
              <p className="text-xs text-amber-300 mt-1">{selectedPlatform.note}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("scraperAdmin.keywords")}</label>
            <textarea
              rows={4}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              disabled={running}
              placeholder={t("scraperAdmin.keywordsPlaceholder")}
            />
            <p className="text-xs text-gray-500 mt-1">{t("scraperAdmin.keywordsHint")}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("scraperAdmin.minViews")}</label>
            <select
              className="w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2"
              value={String(minViews)}
              onChange={(e) => setMinViews(parseInt(e.target.value, 10) || 0)}
              disabled={running || !selectedPlatform?.supportsViewThreshold}
            >
              {VIEW_THRESHOLDS.map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? t("scraperAdmin.noThreshold") : t("scraperAdmin.viewsFormat", { count: v })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("scraperAdmin.limit")}</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
              disabled={running}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("scraperAdmin.maxPages")}</label>
            <input
              type="number"
              min={1}
              max={20}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2"
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
              disabled={running}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("scraperAdmin.maxCreate")}</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2"
              value={maxCreate}
              onChange={(e) => setMaxCreate(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
              disabled={running}
            />
          </div>
        </div>

        <button
          onClick={runCrawler}
          disabled={running || loadingPlatforms || !platform}
          className="rounded-xl bg-blue-600 text-white px-4 py-2 font-semibold disabled:opacity-50"
        >
          {running ? t("scraperAdmin.running") : t("scraperAdmin.run")}
        </button>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-lg text-white">{t("scraperAdmin.resultTitle")}</h2>

          {/* 全部低于播放量阈值时的警告 */}
          {result.createdCount === 0 && result.scanned > 0 && result.skipped?.belowThreshold === result.scanned && (
            <div className="mt-3 rounded-xl border border-amber-600/60 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
              ⚠️ 扫描到的 {result.scanned} 个视频播放量均低于 {minViews.toLocaleString()}，没有创建任何 Idea。<br />
              <span className="text-amber-400 font-medium">建议：</span> 降低「最低播放量」阈值，或换用热门关键词重新运行。
            </div>
          )}

          {/* 创意为空但原因不是阈值 */}
          {result.createdCount === 0 && result.scanned > 0 && result.skipped?.belowThreshold !== result.scanned && (
            <div className="mt-3 rounded-xl border border-gray-600/60 bg-gray-800/40 px-4 py-3 text-sm text-gray-300">
              本次未创建任何 Idea。请检查关键词和参数设置。
            </div>
          )}

          <div className="mt-2 grid gap-2 text-sm text-gray-300 md:grid-cols-2">
            <div>{t("scraperAdmin.scanned")}: {result.scanned}</div>
            <div>{t("scraperAdmin.created")}: {result.createdCount}</div>
            <div>{t("scraperAdmin.pages")}: {result.maxPages}</div>
            <div>{t("scraperAdmin.keywordsUsed")}: {result.keywords?.length || 0}</div>
            <div>{t("scraperAdmin.skippedBelow")}: {result.skipped?.belowThreshold || 0}</div>
            <div>{t("scraperAdmin.skippedExisting")}: {result.skipped?.existing || 0}</div>
            <div>{t("scraperAdmin.skippedOverCreate")}: {result.skipped?.overCreateLimit || 0}</div>
          </div>

          {result.created?.length > 0 && (
            <div className="mt-4 space-y-2">
              {result.created.slice(0, 20).map((it) => (
                <div key={it._id} className="rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                  <div className="text-white text-sm font-semibold">{it.title}</div>
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:underline">
                    {it.url}
                  </a>
                  <div className="text-xs text-gray-400 mt-1">views: {it.views} · tags: {it.tags.join(", ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg text-white">{t("scraperAdmin.historyTitle")}</h2>
          <button
            onClick={loadHistory}
            className="text-xs rounded-lg border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800"
            disabled={loadingHistory}
          >
            {t("scraperAdmin.refreshHistory")}
          </button>
        </div>

        {loadingHistory && <div className="text-sm text-gray-400 mt-2">{t("common.loading")}</div>}

        {!loadingHistory && history.length === 0 && (
          <div className="text-sm text-gray-400 mt-2">{t("scraperAdmin.noHistory")}</div>
        )}

        {!loadingHistory && history.length > 0 && (
          <div className="mt-3 space-y-2">
            {history.map((job) => (
              <div key={job._id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="text-white font-semibold">{job.platform} · {job.status}</div>
                  <div className="text-gray-500">{job.createdAt ? new Date(job.createdAt).toLocaleString() : ""}</div>
                </div>

                <div className="mt-1 text-xs text-gray-400">
                  {t("scraperAdmin.keywordsUsed")}: {job.params?.keywords?.length || 0}
                  {" · "}{t("scraperAdmin.minViews")}: {job.params?.minViews || 0}
                  {" · "}{t("scraperAdmin.pages")}: {job.params?.maxPages || 0}
                </div>

                <div className="mt-1 text-xs text-gray-400">
                  {t("scraperAdmin.scanned")}: {job.stats?.scanned || 0}
                  {" · "}{t("scraperAdmin.created")}: {job.stats?.createdCount || 0}
                  {" · "}{t("scraperAdmin.skippedExisting")}: {job.stats?.skippedExisting || 0}
                </div>

                {!!job.errorMessage && (
                  <div className="mt-1 text-xs text-red-400">{job.errorMessage}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
