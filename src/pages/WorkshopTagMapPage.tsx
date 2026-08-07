import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getWorkshopTagInsights, type WorkshopTemplate } from "../api";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type DotPoint = {
  id: string;
  x: number;
  y: number;
  clusterKey: string;
  template: WorkshopTemplate;
};

type Cluster = {
  key: string;
  cx: number;
  cy: number;
  r: number;
  count: number;
  relatedTags: string[];
  templates: WorkshopTemplate[];
};

const MAP_CENTER = { x: 50, y: 50 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function pickClusterTag(tags: string[], globalTagCount: Map<string, number>) {
  if (!tags.length) return "untagged";
  const sorted = [...tags].sort((a, b) => {
    const ca = globalTagCount.get(a) || 0;
    const cb = globalTagCount.get(b) || 0;
    if (cb !== ca) return cb - ca;
    return a.localeCompare(b);
  });
  return sorted[0] || "untagged";
}

export default function WorkshopTagMapPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [templates, setTemplates] = useState<WorkshopTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErr("");
        const res = await getWorkshopTagInsights(240);
        setTemplates((res.templates || []).filter((item) => !item.isDefault));
      } catch (e: any) {
        const msg = humanizeError(e);
        setErr(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const { points, clusters } = useMemo(() => {
    if (!templates.length) return { points: [] as DotPoint[], clusters: [] as Cluster[] };

    const normalized = templates.map((tpl) => ({
      ...tpl,
      normalizedTags: (tpl.tags || []).map((x) => x.trim().toLowerCase()).filter(Boolean),
      ts: new Date(tpl.createdAt || 0).getTime() || 0,
    }));

    const globalTagCount = new Map<string, number>();
    normalized.forEach((tpl) => {
      const uniq = new Set(tpl.normalizedTags);
      uniq.forEach((tag) => globalTagCount.set(tag, (globalTagCount.get(tag) || 0) + 1));
    });

    const byCluster = new Map<string, typeof normalized>();
    normalized.forEach((tpl) => {
      const key = pickClusterTag(tpl.normalizedTags, globalTagCount);
      const arr = byCluster.get(key) || [];
      arr.push(tpl);
      byCluster.set(key, arr);
    });

    const clusterKeys = [...byCluster.keys()].sort((a, b) => {
      const c1 = byCluster.get(a)?.length || 0;
      const c2 = byCluster.get(b)?.length || 0;
      if (c2 !== c1) return c2 - c1;
      return a.localeCompare(b);
    }).slice(0, 18);

    const nextClusters: Cluster[] = clusterKeys.map((key, idx) => {
      const members = byCluster.get(key) || [];
      const angle = (Math.PI * 2 * idx) / Math.max(1, clusterKeys.length);
      const ring = 18 + (idx % 4) * 7 + Math.floor(idx / 4) * 4;
      const center = {
        x: MAP_CENTER.x + Math.cos(angle) * ring,
        y: MAP_CENTER.y + Math.sin(angle) * ring,
      };
      const tagCount = new Map<string, number>();
      members.forEach((tpl) => tpl.normalizedTags.forEach((tag) => tagCount.set(tag, (tagCount.get(tag) || 0) + 1)));
      const relatedTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag);
      return {
        key,
        cx: center.x,
        cy: center.y,
        r: clamp(5 + Math.sqrt(members.length) * 1.8, 5, 14),
        count: members.length,
        relatedTags,
        templates: members,
      };
    });

    const nextPoints: DotPoint[] = normalized.map((tpl) => {
      const clusterKey = pickClusterTag(tpl.normalizedTags, globalTagCount);
      const cluster = nextClusters.find((item) => item.key === clusterKey);
      const seed = hashString(tpl._id);
      const angle = ((seed % 360) * Math.PI) / 180;
      const radius = 5 + ((seed % 100) / 100) * 8;
      return {
        id: tpl._id,
        x: clamp((cluster?.cx || MAP_CENTER.x) + Math.cos(angle) * radius, 3, 97),
        y: clamp((cluster?.cy || MAP_CENTER.y) + Math.sin(angle) * radius, 4, 96),
        clusterKey,
        template: tpl,
      };
    });

    return { points: nextPoints, clusters: nextClusters };
  }, [templates]);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("workshop.tagMapTitle")}</h1>
          <p className="mt-1 text-sm text-gray-300">{t("workshop.tagMapSubtitle")}</p>
        </div>
        <Link to="/workshop" className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-900">{t("workshop.backToMarket")}</Link>
      </div>

      <div className="mt-4 rounded-3xl border border-gray-800 bg-gray-900/80 p-4">
        <p className="text-xs text-gray-400">{t("workshop.tagMapHint")}</p>
        {loading && <p className="mt-6 text-gray-300">{t("common.loading")}</p>}
        {err && <p className="mt-6 text-red-400">{t("common.error")}: {err}</p>}
        {!loading && !err && templates.length === 0 && <p className="mt-6 text-gray-400">{t("workshop.emptyMarket")}</p>}

        {!loading && !err && templates.length > 0 && (
          <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-[32px] border border-gray-800 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.18),transparent_25%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(180deg,rgba(2,6,23,0.95),rgba(3,7,18,1))]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:6%_6%]" />

            {clusters.map((cluster) => (
              <div
                key={cluster.key}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-400/10 text-center backdrop-blur-sm"
                style={{ left: `${cluster.cx}%`, top: `${cluster.cy}%`, width: `${cluster.r * 2}%`, height: `${cluster.r * 2}%` }}
              >
                <div className="px-2 text-xs font-semibold text-cyan-100">#{cluster.key}</div>
                <div className="text-[10px] text-cyan-200/80">{cluster.count}</div>
              </div>
            ))}

            {points.map((point) => (
              <button
                key={point.id}
                type="button"
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-white/90 shadow-[0_0_18px_rgba(255,255,255,0.35)] transition hover:scale-125"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                title={`${point.template.title} · #${(point.template.tags || []).slice(0, 3).join(" #")}`}
                onClick={() => nav(`/workshop/templates/${point.template._id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}