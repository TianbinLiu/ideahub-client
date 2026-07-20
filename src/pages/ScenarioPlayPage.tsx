import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getScenario, playScenario, type Scenario, type ScenarioComment } from "../api";
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
      setChatMsgs(
        (res.scenario.messages || []).map((m) => ({
          ...m,
          id: m.id || newId(),
          role: "seed" as const,
        }))
      );
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

    try {
      setPending(true);
      const res = await playScenario(id, {
        history,
        userMessage: { text: trimmed, parentId: null, id: userMsg.id },
      });
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

      <div className="mt-4">
        {scenario.sceneKind === "chat" ? (
          // chat：线性对话时间线（聊天壳），发言 = 发一条我方消息
          <PlatformChatView
            platform={scenario.platform}
            participants={scenario.participants || []}
            messages={chatMsgs}
            composer
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
    </div>
  );
}
