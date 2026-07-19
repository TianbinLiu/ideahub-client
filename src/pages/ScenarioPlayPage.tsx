import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getScenario, playScenario, type Scenario, type ScenarioComment } from "../api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import PlatformCommentView from "../components/PlatformCommentView";

type PlayRole = "seed" | "user" | "ai";
// PlatformCommentView 会宽松读取 isAi 字段以显示“AI”微标；不改动契约类型 ScenarioComment。
type PlayComment = ScenarioComment & { role: PlayRole; isAi?: boolean };

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
        {scenario.topic && <p className="mt-1 text-sm text-gray-400">{t("arena.scenarioPlay.debateTopic", { topic: scenario.topic })}</p>}
      </div>

      {aiDisabled && (
        <div className="mt-3 rounded-xl border border-amber-700/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {t("arena.scenarioPlay.aiNotConfiguredBanner")}
        </div>
      )}

      <div className="mt-4">
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
      </div>
    </div>
  );
}
