import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createArenaComment,
  endScenarioSession,
  getActiveScenarioSession,
  getScenario,
  playScenario,
  shareScenarioSession,
  type Scenario,
  type ScenarioComment,
  type SessionEvaluation,
} from "../api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import PlatformCommentView from "../components/PlatformCommentView";
import PlatformChatView, { type ChatViewMessage } from "../components/PlatformChatView";

type PlayRole = "seed" | "user" | "ai";
// PlatformCommentView 会宽松读取 isAi 字段以显示“AI”微标；不改动契约类型 ScenarioComment。
type PlayComment = ScenarioComment & { role: PlayRole; isAi?: boolean };
// chat 场景的时间线一项：壳层入参消息 + play 角色（喂给 /play 的 history 用）
type PlayChatMessage = ChatViewMessage & { role: PlayRole };

const HISTORY_LIMIT = 24;

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScenarioPlayPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [comments, setComments] = useState<PlayComment[]>([]);
  // chat 场景的对话时间线（comment 场景恒为空；两条时间线互不相干）
  const [chatMsgs, setChatMsgs] = useState<PlayChatMessage[]>([]);
  const [replyingTo, setReplyingTo] = useState<ScenarioComment | null>(null);
  const [pending, setPending] = useState(false);
  const [aiDisabled, setAiDisabled] = useState(false);

  // ── 对局（chat 场景）：结束状态与复盘 ──
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [endReason, setEndReason] = useState<"" | "manual" | "derailed" | "completed">("");
  const [evaluation, setEvaluation] = useState<SessionEvaluation | null>(null);
  const [ending, setEnding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedDone, setSharedDone] = useState(false);
  // 对局纪元（评审实锤）：结束/重开后递增——迟到的 /play 响应发现纪元变了就整体丢弃，
  // 否则上一局的 AI 回复会污染新开局的时间线/把复盘卡指回旧局
  const playEpochRef = useRef(0);

  // 用户在情景里的发言显示【真实头像】：把 isSelf 参与者的头像换成账号头像（有图才换）
  const participantsForView = useMemo(() => {
    const ps = scenario?.participants || [];
    if (!user?.avatarUrl) return ps;
    return ps.map((p) => (p.isSelf ? { ...p, avatar: user.avatarUrl! } : p));
  }, [scenario?.participants, user?.avatarUrl]);

  async function load() {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getScenario(id);
      setScenario(res.scenario);
      setComments(
        (res.scenario.comments || []).map((c) => ({
          ...c,
          id: c.id || newId(),
          role: "seed" as const,
        }))
      );
      const seeds: PlayChatMessage[] = (res.scenario.messages || []).map((m) => ({
        ...m,
        id: m.id || newId(),
        role: "seed" as const,
      }));

      // 恢复进行中的对局（chat 场景）：把上次的对话消息拼回时间线继续玩——
      // 不恢复的话会出现「看不见却存在」的幽灵对局（结束时评的是看不见的对话）
      let restored: PlayChatMessage[] = [];
      if (res.scenario.sceneKind === "chat") {
        try {
          const act = await getActiveScenarioSession(res.scenario._id);
          if (act.session) {
            setSessionId(act.session._id);
            const selfId = (res.scenario.participants || []).find((p) => p.isSelf)?.id || "";
            restored = (act.session.messages || []).map((m) => ({
              id: m.mid || newId(),
              senderId: m.isUser ? selfId : m.senderId || undefined,
              senderName: m.senderName,
              senderAvatar: m.senderAvatar,
              text: m.text,
              role: (m.isUser ? "user" : "ai") as PlayRole,
              isAi: m.isAi,
            }));
          }
        } catch {
          // 恢复失败不阻塞（未登录/网络问题）：从种子开始
        }
      }

      setChatMsgs([...seeds, ...restored]);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(text: string, parentId: string | null) {
    const trimmed = text.trim();
    if (!trimmed || !id) return;

    const base = comments;
    const userComment: PlayComment = {
      id: newId(),
      authorName: user?.username || t("arena.scenarioPlay.me"),
      text: trimmed,
      parentId: parentId ?? null,
      role: "user",
    };

    setComments([...base, userComment]);
    setReplyingTo(null);

    // AI 未配置时仅做本地发言，不再请求
    if (aiDisabled) return;

    const history = base.slice(-HISTORY_LIMIT).map((c) => ({
      authorName: c.authorName,
      text: c.text,
      role: c.role,
      parentId: c.parentId ?? null,
    }));

    try {
      setPending(true);
      const res = await playScenario(id, {
        history,
        userMessage: { text: trimmed, parentId: parentId ?? null, id: userComment.id },
      });
      const replies: PlayComment[] = (res.replies || []).map((r) => ({
        id: r.id || newId(),
        authorName: r.authorName,
        authorAvatar: r.authorAvatar,
        text: r.text,
        parentId: r.parentId ?? null,
        role: "ai" as const,
        isAi: true,
      }));
      if (replies.length > 0) {
        setComments((prev) => [...prev, ...replies]);
      }
    } catch (e: any) {
      if (e?.status === 501) {
        setAiDisabled(true);
        toast.error(t("arena.scenarioPlay.aiNotConfiguredToast"));
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setPending(false);
    }
  }

  /**
   * chat 场景的发言：线性追加我方消息 → /play → AI 以固定角色回消息。
   * 后端 generateRolePlayReplies 已按 scenario.sceneKind==='chat' 分派到 generateChatReplies，
   * 回复形状仍是 {authorName, authorAvatar, text}；这里映射成聊天消息（senderName 由
   * PlatformChatView 按花名册回查头像/isSelf），parentId 概念对 chat 不存在、恒传 null。
   */
  async function handleChatSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !id || !scenario) return;

    const ps = scenario.participants || [];
    const selfP = ps.find((p) => p.isSelf);
    const senderNameOf = (m: PlayChatMessage) =>
      (m.senderId ? ps.find((p) => p.id === m.senderId)?.name : undefined) || m.senderName || "";

    const base = chatMsgs;
    const userMsg: PlayChatMessage = {
      id: newId(),
      senderId: selfP?.id || "",
      senderName: selfP?.name || user?.username || t("arena.scenarioPlay.me"),
      text: trimmed,
      role: "user",
    };
    setChatMsgs([...base, userMsg]);

    // AI 未配置时仅做本地发言，不再请求
    if (aiDisabled) return;

    const history = base.slice(-HISTORY_LIMIT).map((m) => ({
      authorName: senderNameOf(m),
      text: m.text,
      role: m.role,
      parentId: null,
    }));

    const epoch = playEpochRef.current;
    try {
      setPending(true);
      const res = await playScenario(id, {
        history,
        userMessage: { text: trimmed, parentId: null, id: userMsg.id },
      });
      // 纪元校验：请求在途时用户结束/重开了对局 → 这份迟到响应整体丢弃
      if (playEpochRef.current !== epoch) return;
      const replies: PlayChatMessage[] = (res.replies || []).map((r) => ({
        id: r.id || newId(),
        senderName: r.authorName,
        senderAvatar: r.authorAvatar,
        text: r.text,
        role: "ai" as const,
        isAi: true,
      }));
      if (replies.length > 0) {
        setChatMsgs((prev) => [...prev, ...replies]);
      }

      // 对局走向：AI 判定 derailed（发言脱离情景被拒续）/ completed（情景演完）→ 自动结束 + 复盘卡
      const s = res.session;
      if (s) {
        setSessionId(s.sessionId);
        if (s.ended) {
          setSessionEnded(true);
          setEndReason(s.endReason || "");
          setEvaluation(s.evaluation || null);
        }
      }
    } catch (e: any) {
      if (e?.status === 501) {
        setAiDisabled(true);
        toast.error(t("arena.scenarioPlay.aiNotConfiguredToast"));
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setPending(false);
    }
  }

  /** 手动结束对局：AI 复盘评分 → 展示复盘卡 */
  async function handleEndSession() {
    if (!id || sessionEnded || ending || pending) return;
    playEpochRef.current += 1; // 在途 /play 响应作废
    try {
      setEnding(true);
      const res = await endScenarioSession(id);
      setSessionId(res.session._id);
      setSessionEnded(true);
      setEndReason("manual");
      setEvaluation(res.evaluation || null);
    } catch (e: any) {
      // 还没发过言就点结束：没有 active 对局（404）——直接当作无事发生
      if (e?.status === 404) {
        toast.error(t("arena.scenarioPlay.noActiveSession"));
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setEnding(false);
    }
  }

  /** 分享对局：公开回放 + 自动发一条带回放链接的情景评论 */
  async function handleShareSession() {
    if (!id || !sessionId || sharing || sharedDone) return;
    try {
      setSharing(true);
      await shareScenarioSession(id, sessionId);
      const replayUrl = `${window.location.origin}/arena/simulate/${id}/session/${sessionId}`;
      const scoreText = evaluation?.score != null ? t("arena.scenarioPlay.shareScore", { score: evaluation.score }) : "";
      await createArenaComment("scenario", id, {
        content: t("arena.scenarioPlay.shareCommentText", { score: scoreText, url: replayUrl }),
      });
      setSharedDone(true);
      toast.success(t("arena.scenarioPlay.sharedToast"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSharing(false);
    }
  }

  /** 再来一局：清空对话回到种子（server 端上一局已 ended，下次发言自动开新局） */
  function handleRestart() {
    playEpochRef.current += 1; // 在途 /play 响应作废
    setSessionEnded(false);
    setEndReason("");
    setEvaluation(null);
    setSessionId(null);
    setSharedDone(false);
    setChatMsgs(
      (scenario?.messages || []).map((m) => ({
        ...m,
        id: m.id || newId(),
        role: "seed" as const,
      }))
    );
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto p-4 pb-20 text-gray-400">{t("arena.scenarioPlay.loading")}</div>;
  }

  if (!scenario) {
    return (
      <div className="max-w-3xl mx-auto p-4 pb-20">
        <Link to="/arena/simulate" className="text-sm text-gray-400 hover:text-white">
          ← {t("arena.scenarioPlay.backToScenarioSimulation")}
        </Link>
        <p className="mt-4 text-gray-400">{t("arena.scenarioPlay.scenarioNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">
      <Link to={`/arena/simulate/${scenario._id}`} className="text-sm text-gray-400 hover:text-white">
        ← {t("arena.scenarioPlay.backToScenarioIntro")}
      </Link>

      <div className="mt-2">
        <h1 className="text-2xl font-bold text-white">{scenario.title}</h1>
        {scenario.topic && (
          <p className="mt-1 text-sm text-gray-400">
            {t(
              scenario.sceneKind === "chat" ? "arena.scenarioPlay.sceneBackground" : "arena.scenarioPlay.debateTopic",
              { topic: scenario.topic }
            )}
          </p>
        )}
      </div>

      {aiDisabled && (
        <div className="mt-3 rounded-xl border border-amber-700/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {t("arena.scenarioPlay.aiNotConfiguredBanner")}
        </div>
      )}

      {/* chat 场景：结束对局入口（对局中才显示） */}
      {scenario.sceneKind === "chat" && !sessionEnded && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={ending || pending}
            onClick={handleEndSession}
            className="rounded-xl border border-rose-800/70 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950/30 disabled:opacity-50"
          >
            {ending ? t("arena.scenarioPlay.endingSession") : t("arena.scenarioPlay.endSession")}
          </button>
        </div>
      )}

      <div className="mt-4">
        {scenario.sceneKind === "chat" ? (
          // chat：线性对话时间线（聊天壳），发言 = 发一条我方消息；
          // isSelf 参与者的头像已替换为用户真实头像（participantsForView）
          <PlatformChatView
            platform={scenario.platform}
            participants={participantsForView}
            messages={chatMsgs}
            composer={!sessionEnded}
            onSubmit={handleChatSubmit}
            pending={pending}
          />
        ) : (
          // comment：评论区（历史行为不变），发言 = 顶楼发言或回复某条
          <PlatformCommentView
            platform={scenario.platform}
            comments={comments}
            topic={scenario.topic}
            composer
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onReplyTo={(c) => setReplyingTo(c)}
            onSubmit={handleSubmit}
            pending={pending}
          />
        )}
      </div>

      {/* 对局复盘卡：结束（手动/自动）后展示评分评语 + 行动按钮 */}
      {sessionEnded && (
        <div className="mt-4 rounded-2xl border border-cyan-800/60 bg-cyan-950/15 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                endReason === "completed"
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                  : endReason === "derailed"
                    ? "border-rose-500/60 bg-rose-500/10 text-rose-200"
                    : "border-gray-600 bg-gray-800/50 text-gray-300"
              }`}
            >
              {t(`arena.scenarioPlay.endReason_${endReason || "manual"}`)}
            </span>
            {evaluation?.score != null && (
              <span className="text-3xl font-bold text-white">
                {evaluation.score}
                <span className="ml-1 text-sm font-normal text-gray-400">{t("arena.scenarioPlay.scoreUnit")}</span>
              </span>
            )}
          </div>
          {evaluation?.comment ? (
            <p className="mt-3 text-sm leading-6 text-gray-200">{evaluation.comment}</p>
          ) : (
            <p className="mt-3 text-sm text-gray-400">{t("arena.scenarioPlay.noEvaluation")}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {sessionId && (
              <button
                type="button"
                disabled={sharing || sharedDone}
                onClick={handleShareSession}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {sharedDone
                  ? t("arena.scenarioPlay.sharedDone")
                  : sharing
                    ? t("arena.scenarioPlay.sharing")
                    : t("arena.scenarioPlay.shareSession")}
              </button>
            )}
            <button
              type="button"
              onClick={handleRestart}
              className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("arena.scenarioPlay.restartSession")}
            </button>
            <Link
              to={`/arena/simulate/${scenario._id}#sessions`}
              className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("arena.scenarioPlay.viewOthers")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
