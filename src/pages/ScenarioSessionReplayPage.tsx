/**
 * @file ScenarioSessionReplayPage.tsx - 情景对局回放：只读查看某用户的一场完整对话 + 点赞。
 * @category Page
 * @route /arena/simulate/:id/session/:sessionId
 * @i18n yes
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 已分享对局对所有人可看；未分享仅本人（server 判权）
 * - 复用 PlatformChatView 皮肤只读渲染：participants 从 session.messages 聚合构造
 *   （senderName+senderAvatar 已随每条消息存快照，用户消息标 isSelf）
 * - 顶部：作者/得分/结束方式徽章/点赞
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  getScenario,
  getScenarioSession,
  toggleScenarioSessionLike,
  type Scenario,
  type ScenarioSessionCard,
  type SessionMessage,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import { formatRelativeTime } from "../utils/relativeTime";
import PlatformChatView, { type ChatViewMessage } from "../components/PlatformChatView";

type ReplaySession = ScenarioSessionCard & { messages: SessionMessage[] };

function sessionAuthorName(u: ReplaySession["user"]) {
  return typeof u === "string" ? "-" : u?.username || "-";
}

export default function ScenarioSessionReplayPage() {
  const { t } = useTranslation();
  const { id, sessionId } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    if (!id || !sessionId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [sc, se] = await Promise.all([getScenario(id), getScenarioSession(id, sessionId)]);
        if (!mounted) return;
        setScenario(sc.scenario);
        setSession(se.session);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, sessionId]);

  /**
   * 回放的花名册与时间线：种子消息用情景原 participants；对局消息按快照聚合。
   * 用户消息 → isSelf 参与者（头像用对局里存的真实头像快照）；AI 消息按 senderName 归并。
   */
  const { participants, messages } = useMemo(() => {
    const scenarioPs = scenario?.participants || [];
    const seedMsgs: ChatViewMessage[] = (scenario?.messages || []).map((m, i) => ({
      id: m.id || `seed_${i}`,
      senderId: m.senderId,
      text: m.text,
    }));

    const ps = scenarioPs.map((p) => ({ ...p }));
    const byName = new Map(ps.map((p) => [p.name, p]));
    const selfP = ps.find((p) => p.isSelf);

    const playMsgs: ChatViewMessage[] = (session?.messages || []).map((m, i) => {
      if (m.isUser) {
        // 用真实头像快照覆盖 self 参与者头像（对局当时的样子）
        if (selfP && m.senderAvatar) selfP.avatar = m.senderAvatar;
        return { id: m.mid || `pm_${i}`, senderId: selfP?.id || m.senderId, text: m.text, isAi: false };
      }
      let p = m.senderId ? ps.find((x) => x.id === m.senderId) : byName.get(m.senderName);
      if (!p) {
        p = { id: `x_${m.senderName}`, name: m.senderName, avatar: m.senderAvatar || "💬", role: "", isSelf: false, goal: "" };
        ps.push(p);
        byName.set(p.name, p);
      }
      return { id: m.mid || `pm_${i}`, senderId: p.id, text: m.text, isAi: true };
    });

    return { participants: ps, messages: [...seedMsgs, ...playMsgs] };
  }, [scenario, session]);

  async function handleLike() {
    if (!id || !sessionId || !session || liking) return;
    if (!user) {
      toast.error(t("arena.sessionReplay.loginRequired"));
      return;
    }
    try {
      setLiking(true);
      const res = await toggleScenarioSessionLike(id, sessionId);
      setSession((prev) => (prev ? { ...prev, liked: res.liked, likeCount: res.likeCount } : prev));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLiking(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">{t("arena.sessionReplay.loading")}</div>;
  }

  if (!scenario || !session) {
    return (
      <div className="mx-auto max-w-3xl p-4 pb-20">
        <Link to="/arena/simulate" className="text-sm text-gray-400 hover:text-white">
          ← {t("arena.sessionReplay.back")}
        </Link>
        <p className="mt-4 text-gray-400">{t("arena.sessionReplay.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link to={`/arena/simulate/${scenario._id}`} className="text-sm text-gray-400 hover:text-white">
        ← {t("arena.sessionReplay.backToScenario")}
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{scenario.title}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.sessionReplay.byUser", { name: sessionAuthorName(session.user) })}
            {session.endedAt ? ` · ${formatRelativeTime(session.endedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              session.endReason === "completed"
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                : session.endReason === "derailed"
                  ? "border-rose-500/60 bg-rose-500/10 text-rose-200"
                  : "border-gray-600 bg-gray-800/50 text-gray-300"
            }`}
          >
            {t(`arena.scenarioPlay.endReason_${session.endReason || "manual"}`)}
          </span>
          {session.evaluation?.score != null && (
            <span className="text-2xl font-bold text-white">
              {session.evaluation.score}
              <span className="ml-0.5 text-xs font-normal text-gray-400">{t("arena.scenarioPlay.scoreUnit")}</span>
            </span>
          )}
          <button
            type="button"
            disabled={liking}
            onClick={handleLike}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 ${
              session.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
            }`}
          >
            ❤️ {session.likeCount}
          </button>
        </div>
      </div>

      {session.evaluation?.comment && (
        <p className="mt-3 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm leading-6 text-gray-300">
          {session.evaluation.comment}
        </p>
      )}

      <div className="mt-4">
        <PlatformChatView platform={scenario.platform} participants={participants} messages={messages} />
      </div>
    </div>
  );
}
