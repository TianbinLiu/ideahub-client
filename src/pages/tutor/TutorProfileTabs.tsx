// 个人页（主站 /users/:id）的两个老师人格页签（tutor 仓 docs/06 §4.1「个人主页」）：
// 「老师人格」= 这个人发布到市场的老师（GET /api/tutor/market?author=，谁都能看）；「在学」= 我从市场开出来的课（GET /api/tutor/courses 里带 source 的，只有本人）。
// 只摆列表，不自己判规则：卡片复用市场页的 MarketCardItem，「在学」那一行的可合并 / 来源已不在都读课程 summary 的 source。
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { listCourses, listMarket, type CourseSummary, type MarketCard } from "../../api/tutor";
import { MarketCardItem } from "./TutorMarketPage";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function TutorTeachersTab({ authorId }: { authorId: string }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const nav = useNavigate();
  const [items, setItems] = useState<MarketCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let alive = true; listMarket({ author: authorId, limit: 40 }).then((r) => { if (alive) setItems(r.items); }).catch((e: unknown) => { if (alive) setError(msg(e)); }); return () => { alive = false; }; }, [authorId]);
  return (
    <div data-testid="profile-tutors" className="text-zinc-100">
      {error && <p className="text-sm text-rose-300">{t("app.error", { message: error })}</p>}
      {!error && !items && <p className="text-sm text-gray-400">{t("app.loading")}</p>}
      {items && items.length === 0 && <p className="text-sm text-gray-400">{t("profileTabs.noTeachers")} <Link to="/tutor/market" className="underline underline-offset-2">{t("profileTabs.goMarket")}</Link></p>}
      {items && items.length > 0 && <ul className="grid gap-3 text-zinc-900 sm:grid-cols-2">{items.map((p) => <MarketCardItem key={p.id} p={p} onTag={(tag) => nav(`/tutor/market?tag=${encodeURIComponent(tag)}`)} />)}</ul>}
    </div>
  );
}

export function TutorLearningTab() {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let alive = true; listCourses().then((r) => { if (alive) setCourses(r.courses.filter((c) => !!c.source)); }).catch((e: unknown) => { if (alive) setError(msg(e)); }); return () => { alive = false; }; }, []);
  return (
    <div data-testid="profile-learning">
      {error && <p className="text-sm text-rose-300">{t("app.error", { message: error })}</p>}
      {!error && !courses && <p className="text-sm text-gray-400">{t("app.loading")}</p>}
      {courses && courses.length === 0 && <p className="text-sm text-gray-400">{t("profileTabs.noLearning")} <Link to="/tutor/market" className="underline underline-offset-2">{t("profileTabs.goMarket")}</Link></p>}
      {courses && courses.length > 0 && (
        <ul className="space-y-2">
          {courses.map((c) => (
            <li key={c.id} data-testid={`learning-${c.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100">
              <span className="font-semibold">{c.persona?.name || c.title}</span>
              <span className="text-xs text-gray-400">{c.subject}</span>
              {c.source && <span className="text-xs text-gray-400">{t("course.source", { v: c.source.version })}</span>}
              {c.source?.updateAvailable && <span className="rounded-full bg-cyan-900/60 px-2 py-0.5 text-[10px] text-cyan-200">{t("profileTabs.updateAvailable", { v: c.source.latest })}</span>}
              {c.source?.gone && <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">{t("profileTabs.sourceGone")}</span>}
              {c.run && <span className="text-xs text-gray-400">{c.run.status === "done" ? t("profileTabs.done") : t("profileTabs.at", { stage: c.run.currentStage || "—" })}</span>}
              <span className="ml-auto flex gap-2">
                <Link to={`/tutor/courses/${encodeURIComponent(c.id)}`} className="rounded-full border border-gray-700 px-3 py-1 text-xs">{t("profileTabs.course")}</Link>
                <Link to={`/tutor/run/${encodeURIComponent(c.id)}`} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">{t("course.learn")}</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
