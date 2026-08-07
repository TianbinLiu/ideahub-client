/**
 * @file BountyDetailPage.tsx - 赏金猎人 · 任务详情 / 去完成 / 提交 / 审批 / 讨论
 * @category Page
 * @route /arena/bounty/:id
 * @i18n none（页面内容以中文为主）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 任务信息（标题/描述/💰reward/平台/状态/deadline/stats）+ 作者可编辑/改状态/删除
 * - 外链区：显示 targetUrl + 「去完成任务」——写入 localStorage.lbw_active_bounty 供插件读取，并 window.open 外链
 * - 提交区（登录且非作者）：发言文本 + 截图（apiUploadImage 或来自插件的 dataURL）+ note，调 submitBounty
 * - 插件交接：mount 时读 localStorage.lbw_pending_submission 预填发言与截图（dataURL -> File -> apiUploadImage）
 * - 作者视角：listBountySubmissions 展示全部提交 + 通过/拒绝（reviewBountySubmission）
 * - 讨论评论区：<CommentThread targetType="bounty">（与情景/人格详情页共用，自取数据；
 *   文字 + 配图 + 一层楼中楼 + 删除；本页只通过 onCountChange 同步头部 💬 计数）
 *
 * 说明：赏金为平台虚拟点数，审批通过即视为该猎人获得对应点数，不涉及真实支付/转账。
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import toast from "react-hot-toast";
import { Check, ExternalLink, ImagePlus, Pencil, Send, Trash2, X } from "lucide-react";
import {
  apiUploadImage,
  deleteBounty,
  getBounty,
  listBountySubmissions,
  reviewBountySubmission,
  setBountyStatus,
  submitBounty,
  type Bounty,
  type BountySubmission,
} from "../api";
import CommentThread from "../components/CommentThread";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import { useTranslation } from "react-i18next";

type Translate = ReturnType<typeof useTranslation>["t"];

const PLATFORM_META: Record<string, { labelKey: string; className: string }> = {
  weibo: { labelKey: "platformWeibo", className: "border-orange-600/60 bg-orange-950/30 text-orange-200" },
  bilibili: { labelKey: "platformBilibili", className: "border-pink-600/60 bg-pink-950/30 text-pink-200" },
  tieba: { labelKey: "platformTieba", className: "border-blue-600/60 bg-blue-950/30 text-blue-200" },
  zhihu: { labelKey: "platformZhihu", className: "border-sky-600/60 bg-sky-950/30 text-sky-200" },
  douyin: { labelKey: "platformDouyin", className: "border-neutral-500/60 bg-neutral-900 text-neutral-200" },
  xiaohongshu: { labelKey: "platformXiaohongshu", className: "border-rose-600/60 bg-rose-950/30 text-rose-200" },
  instagram: { labelKey: "platformInstagram", className: "border-fuchsia-600/60 bg-fuchsia-950/30 text-fuchsia-200" },
  other: { labelKey: "platformOther", className: "border-gray-600/60 bg-gray-900 text-gray-300" },
};

const STATUS_META: Record<string, { labelKey: string; className: string }> = {
  open: { labelKey: "statusOpen", className: "border-emerald-600/60 bg-emerald-950/30 text-emerald-200" },
  closed: { labelKey: "statusClosed", className: "border-gray-600/60 bg-gray-900 text-gray-300" },
  completed: { labelKey: "statusCompleted", className: "border-cyan-600/60 bg-cyan-950/30 text-cyan-200" },
};

const SUBMISSION_STATUS_META: Record<string, { labelKey: string; className: string }> = {
  pending: { labelKey: "submissionStatusPending", className: "border-amber-600/60 bg-amber-950/30 text-amber-200" },
  approved: { labelKey: "submissionStatusApproved", className: "border-emerald-600/60 bg-emerald-950/30 text-emerald-200" },
  rejected: { labelKey: "submissionStatusRejected", className: "border-rose-600/60 bg-rose-950/30 text-rose-200" },
};

type Person = { _id: string; username: string } | string | undefined;

function personName(p: Person, t: Translate) {
  if (!p) return t("arena.bountyDetail.anonymousUser");
  return typeof p === "string" ? t("arena.bountyDetail.user") : p.username || t("arena.bountyDetail.user");
}

function personId(p: Person) {
  if (!p) return "";
  return typeof p === "string" ? p : p._id;
}

function platformMeta(platform: string) {
  return PLATFORM_META[platform] || PLATFORM_META.other;
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/** dataURL -> File，供插件截图（dataURL）转成文件后走 apiUploadImage */
async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

export default function BountyDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bounty, setBounty] = useState<Bounty | null>(null);

  // 提交区
  const [speechText, setSpeechText] = useState("");
  const [note, setNote] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadingShot, setUploadingShot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingShot, setPendingShot] = useState<string | null>(null);

  // 作者审批
  const [submissions, setSubmissions] = useState<BountySubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // 讨论评论区已抽到 <CommentThread targetType="bounty">，自取数据，这里不再持有其状态

  const isOwner = Boolean(bounty && (bounty.isOwner || (user && personId(bounty.author) === user._id)));

  // 加载悬赏详情（GET /:id 会 $inc viewCount，只调用一次）
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getBounty(id);
        if (mounted) setBounty(res.bounty);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // 作者加载全部提交
  useEffect(() => {
    if (!id || !isOwner) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingSubs(true);
        const res = await listBountySubmissions(id, { page: 1, limit: 50 });
        if (mounted) setSubmissions(res.submissions || []);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoadingSubs(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, isOwner]);

  // 插件交接：读取并消费 lbw_pending_submission，预填发言，暂存截图 dataURL 待上传
  // 仅在登录态消费——未登录时不读取/不清除，保证 /login 往返后数据仍在（避免发言/截图丢失）
  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem("lbw_pending_submission");
    if (!raw) return;
    localStorage.removeItem("lbw_pending_submission");
    try {
      const pending = JSON.parse(raw) as { speechText?: string; screenshotDataUrl?: string };
      if (pending.speechText) setSpeechText(pending.speechText);
      if (pending.screenshotDataUrl) setPendingShot(pending.screenshotDataUrl);
      else if (pending.speechText) toast.success(t("arena.bountyDetail.importedSpeechFromPlugin"));
    } catch {
      // 忽略损坏的数据
    }
  }, [id, user]);

  // 待上传的插件截图：拿到登录态后转成 File 上传，得到 screenshotUrl
  // ★别在 effect 里 setPendingShot(null)——那会改自身依赖，立刻触发【本次 effect 的 cleanup】
  //   把 mounted 置 false；等上传异步返回时 setScreenshotUrl / 清 uploadingShot 全被 mounted 守卫跳过，
  //   结果截图静默丢失 + 提交按钮永久卡「上传中」。改用 ref 去重，并把「消费(清 pendingShot)」放到上传之后。
  const processingShotRef = useRef(false);
  useEffect(() => {
    if (!pendingShot || !user) return;
    if (processingShotRef.current) return; // 已在上传，别重入（[user] 变化等导致的重跑）
    processingShotRef.current = true;
    const dataUrl = pendingShot;
    let mounted = true;
    (async () => {
      try {
        setUploadingShot(true);
        const file = await dataUrlToFile(dataUrl, "bounty-proof.png");
        const res = await apiUploadImage(file, "comment");
        if (mounted) {
          setScreenshotUrl(res.imageUrl);
          toast.success(t("arena.bountyDetail.importedSpeechAndScreenshot"));
        }
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setUploadingShot(false);
        processingShotRef.current = false;
        if (mounted) setPendingShot(null); // 消费掉——放最后，此时不再触发本次 effect 的过早 cleanup
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pendingShot, user]);

  function requireLogin() {
    toast.error(t("arena.bountyDetail.pleaseLoginFirst"));
    navigate(`/login?next=/arena/bounty/${id}`);
  }

  function handleGoTask() {
    if (!bounty) return;
    try {
      localStorage.setItem(
        "lbw_active_bounty",
        JSON.stringify({
          bountyId: bounty._id,
          title: bounty.title,
          targetUrl: bounty.targetUrl,
          taskPageUrl: window.location.href,
          reward: bounty.reward,
          platform: bounty.platform,
          webOrigin: window.location.origin,
        })
      );
    } catch {
      // localStorage 不可用时忽略，仍打开外链
    }
    window.open(bounty.targetUrl, "_blank", "noreferrer");
  }

  async function handleShotUpload(file: File | null) {
    if (!file) return;
    try {
      setUploadingShot(true);
      const res = await apiUploadImage(file, "comment");
      setScreenshotUrl(res.imageUrl);
      toast.success(t("arena.bountyDetail.screenshotUploaded"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setUploadingShot(false);
    }
  }

  async function handleSubmit() {
    if (!id || !bounty) return;
    if (!user) return requireLogin();
    if (!speechText.trim()) {
      toast.error(t("arena.bountyDetail.enterSpeechContent"));
      return;
    }
    if (uploadingShot) {
      toast.error(t("arena.bountyDetail.screenshotUploadingWait"));
      return;
    }
    try {
      setSubmitting(true);
      const res = await submitBounty(id, {
        speechText: speechText.trim(),
        screenshotUrl: screenshotUrl || undefined,
        note: note.trim() || undefined,
      });
      setBounty((b) => (b ? { ...b, mySubmission: res.submission } : b));
      toast.success(t("arena.bountyDetail.submittedWaitingReview"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(sub: BountySubmission, status: "approved" | "rejected") {
    if (!id) return;
    const wasApproved = sub.status === "approved";
    try {
      setReviewingId(sub._id);
      const res = await reviewBountySubmission(id, sub._id, status);
      setSubmissions((prev) => prev.map((s) => (s._id === sub._id ? res.submission : s)));
      if (status === "approved" && !wasApproved) {
        // 入账金额以服务端返回的 awardedPoints 为准（账本真值），不要自己拿 reward 算
        const awarded = res.submission.awardedPoints;
        setBounty((b) => {
          if (!b) return b;
          const approvedCount = b.approvedCount + 1;
          const nextStatus = approvedCount >= b.slots ? "completed" : b.status;
          // 托管同步减掉这次发出去的点数，否则页面上的「剩余托管」会一直显示旧值
          const escrowPoints = Math.max(0, (b.escrowPoints ?? 0) - awarded);
          return { ...b, approvedCount, status: nextStatus, escrowPoints };
        });
        toast.success(t("arena.bountyDetail.approvedPointsAwarded", { points: awarded }));
      } else if (status === "rejected") {
        toast.success(t("arena.bountyDetail.submissionRejectedToast"));
      }
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setReviewingId(null);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm(t("arena.bountyDetail.confirmDeleteBounty"))) return;
    try {
      await deleteBounty(id);
      toast.success(t("arena.bountyDetail.deleted"));
      navigate("/arena/bounty");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  async function handleSetStatus(status: "open" | "closed" | "completed") {
    if (!id) return;
    try {
      const res = await setBountyStatus(id, status);
      setBounty(res.bounty);
      toast.success(t("arena.bountyDetail.statusUpdated"));
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-5xl p-4 text-gray-300">{t("arena.bountyDetail.loading")}</div>;
  if (!bounty)
    return (
      <div className="mx-auto max-w-5xl p-4">
        <p className="text-gray-400">{t("arena.bountyDetail.bountyNotFound")}</p>
        <Link to="/arena/bounty" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("arena.bountyDetail.backToBountyHall")}
        </Link>
      </div>
    );

  const pm = platformMeta(bounty.platform);
  const sm = STATUS_META[bounty.status] || STATUS_META.open;
  const mySubmission = bounty.mySubmission || null;
  const submissionClosed = bounty.status !== "open";

  return (
    <div className="mx-auto max-w-5xl p-4 pb-20">
      <Link to="/arena/bounty" className="text-sm text-gray-400 hover:text-white">
        ← {t("arena.bountyDetail.backToBountyHall")}
      </Link>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
        {/* 左列：任务信息 + 外链 + 提交/审批 */}
        <div className="space-y-4">
          {/* 任务信息 */}
          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
            {bounty.coverImageUrl && (
              <img src={bounty.coverImageUrl} alt="" className="max-h-64 w-full object-cover" />
            )}
            <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-white">{bounty.title}</h1>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${sm.className}`}>
                {t(`arena.bountyDetail.${sm.labelKey}`)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-600/50 bg-amber-500/10 px-3 py-1.5 text-base font-bold text-amber-200">
                💰 {t("arena.bountyDetail.rewardPoints", { reward: bounty.reward })}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${pm.className}`}>
                {t(`arena.bountyDetail.${pm.labelKey}`)}
              </span>
              <span className="text-xs text-gray-400">
                {t("arena.bountyDetail.slotsApproved", { approved: bounty.approvedCount, total: bounty.slots })}
              </span>
            </div>
            {/* 文案红线：虚拟点数，无现金价值，不可提现/兑换。不得暗示任何真实收益。 */}
            <p className="mt-1.5 text-[11px] text-gray-500">{t("arena.bountyDetail.rewardDisclaimer")}</p>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
              {bounty.description || t("arena.bountyDetail.noDescription")}
            </p>

            <p className="mt-3 text-sm text-gray-400">
              {t("arena.bountyDetail.publisher", { name: personName(bounty.author, t) })}
            </p>
            {bounty.deadline && (
              <p className="mt-1 text-sm text-gray-400">
                {t("arena.bountyDetail.deadline", { date: formatDate(bounty.deadline) })}
              </p>
            )}

            {(bounty.tags || []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-200">
                {(bounty.tags || []).map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-1">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <span>👀 {bounty.stats.viewCount}</span>
              <span>✍ {bounty.stats.submissionCount}</span>
              <span>💬 {bounty.stats.commentCount}</span>
            </div>

            {isOwner && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={`/arena/bounty/${bounty._id}/edit`}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-950/30"
                >
                  <Pencil className="h-4 w-4" /> {t("arena.bountyDetail.edit")}
                </Link>
                {bounty.status !== "open" && (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("open")}
                    className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    {t("arena.bountyDetail.setToOpen")}
                  </button>
                )}
                {bounty.status !== "closed" && (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("closed")}
                    className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    {t("arena.bountyDetail.close")}
                  </button>
                )}
                {bounty.status !== "completed" && (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("completed")}
                    className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    {t("arena.bountyDetail.markCompleted")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-800 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950/30"
                >
                  <Trash2 className="h-4 w-4" /> {t("arena.bountyDetail.delete")}
                </button>
              </div>
            )}
            </div>
          </section>

          {/* 外链区 */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-base font-semibold text-white">{t("arena.bountyDetail.joinOnExternalPlatform")}</h2>
            <p className="mt-1 text-sm text-gray-400">
              {t("arena.bountyDetail.externalPlatformHint")}
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2">
              <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate text-sm text-gray-300">{bounty.targetUrl}</span>
            </div>
            <button
              type="button"
              onClick={handleGoTask}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
            >
              <ExternalLink className="h-4 w-4" /> {t("arena.bountyDetail.goDoTask")}
            </button>
          </section>

          {/* 提交区（登录且非作者） */}
          {!isOwner && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-base font-semibold text-white">{t("arena.bountyDetail.submitEvidenceForReward")}</h2>

              {mySubmission && (
                <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{t("arena.bountyDetail.mySubmission")}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        (SUBMISSION_STATUS_META[mySubmission.status] || SUBMISSION_STATUS_META.pending).className
                      }`}
                    >
                      {t(
                        `arena.bountyDetail.${
                          (SUBMISSION_STATUS_META[mySubmission.status] || SUBMISSION_STATUS_META.pending).labelKey
                        }`
                      )}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{mySubmission.speechText}</p>
                  {mySubmission.screenshotUrl && (
                    <img
                      src={mySubmission.screenshotUrl}
                      alt={t("arena.bountyDetail.evidenceScreenshotAlt")}
                      className="mt-2 max-h-56 rounded-lg border border-gray-800 object-contain"
                    />
                  )}
                  {/* ★入账金额只能用 awardedPoints（审批那一刻记进账本的真值），
                      不能用 bounty.reward —— reward 事后可被发布者改，用它就是对猎人报一个假数。
                      文案也不得暗示这是真钱收益：是虚拟点数，无现金价值。 */}
                  {mySubmission.status === "approved" && (
                    <p className="mt-2 text-sm text-emerald-300">
                      {t("arena.bountyDetail.approvedCreditedNotice", { points: mySubmission.awardedPoints })}
                    </p>
                  )}
                </div>
              )}

              {!user ? (
                <button
                  type="button"
                  onClick={requireLogin}
                  className="mt-3 rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
                >
                  {t("arena.bountyDetail.loginToSubmit")}
                </button>
              ) : mySubmission?.status === "approved" ? null : (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={speechText}
                    onChange={(e) => setSpeechText(e.target.value)}
                    placeholder={t("arena.bountyDetail.speechPlaceholder")}
                    rows={4}
                    className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("arena.bountyDetail.notePlaceholder")}
                    rows={2}
                    className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                      <ImagePlus className="h-4 w-4" />
                      {uploadingShot ? t("arena.bountyDetail.uploading") : t("arena.bountyDetail.uploadScreenshotEvidence")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingShot}
                        onChange={(e) => handleShotUpload(e.target.files?.[0] || null)}
                      />
                    </label>
                    {screenshotUrl && (
                      <button
                        type="button"
                        onClick={() => setScreenshotUrl("")}
                        className="text-xs text-rose-300 hover:text-rose-200"
                      >
                        {t("arena.bountyDetail.removeScreenshot")}
                      </button>
                    )}
                  </div>

                  {screenshotUrl && (
                    <img
                      src={screenshotUrl}
                      alt={t("arena.bountyDetail.evidenceScreenshotAlt")}
                      className="max-h-56 rounded-lg border border-gray-800 object-contain"
                    />
                  )}

                  <button
                    type="button"
                    disabled={submitting || submissionClosed || uploadingShot}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {submitting
                      ? t("arena.bountyDetail.submitting")
                      : submissionClosed
                        ? t("arena.bountyDetail.submissionsClosed")
                        : mySubmission?.status === "pending"
                          ? t("arena.bountyDetail.updateSubmission")
                          : t("arena.bountyDetail.submitEvidence")}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 作者审批区 */}
          {isOwner && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">{t("arena.bountyDetail.receivedSubmissions")}</h2>
                {/* ★这里【不能】写「累计发放 = approvedCount × reward」：reward 事后可改，
                    改完这个乘积就和账本对不上，等于对发布者报一个编造的数字。
                    改为显示服务端给的「剩余托管」——那是权威值。发放明细看各条提交的已入账点数。 */}
                <span className="text-xs text-gray-500">
                  {t("arena.bountyDetail.approvedAndEscrow", {
                    approved: bounty.approvedCount,
                    total: bounty.slots,
                    escrow: bounty.escrowPoints ?? 0,
                  })}
                </span>
              </div>

              {loadingSubs && <p className="mt-3 text-sm text-gray-400">{t("arena.bountyDetail.loading")}</p>}
              {!loadingSubs && submissions.length === 0 && (
                <p className="mt-3 text-sm text-gray-400">{t("arena.bountyDetail.noHunterSubmissions")}</p>
              )}

              {!loadingSubs && submissions.length > 0 && (
                <div className="mt-3 space-y-3">
                  {submissions.map((s) => {
                    const ssm = SUBMISSION_STATUS_META[s.status] || SUBMISSION_STATUS_META.pending;
                    return (
                      <div key={s._id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-200">{personName(s.hunter, t)}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ssm.className}`}>
                            {t(`arena.bountyDetail.${ssm.labelKey}`)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{s.speechText}</p>
                        {s.status === "approved" && (
                          <p className="mt-1 text-xs text-emerald-300">
                            {t("arena.bountyDetail.creditedToHunter", { points: s.awardedPoints })}
                          </p>
                        )}
                        {s.note && (
                          <p className="mt-1 text-xs text-gray-500">
                            {t("arena.bountyDetail.noteLabel", { note: s.note })}
                          </p>
                        )}
                        {s.screenshotUrl && (
                          <a href={s.screenshotUrl} target="_blank" rel="noreferrer">
                            <img
                              src={s.screenshotUrl}
                              alt={t("arena.bountyDetail.evidenceScreenshotAlt")}
                              className="mt-2 max-h-56 rounded-lg border border-gray-800 object-contain"
                            />
                          </a>
                        )}
                        <p className="mt-1 text-[11px] text-gray-600">{formatDate(s.createdAt)}</p>
                        {s.status === "pending" && (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={reviewingId === s._id}
                              onClick={() => handleReview(s, "approved")}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> {t("arena.bountyDetail.approve")}
                            </button>
                            <button
                              type="button"
                              disabled={reviewingId === s._id}
                              onClick={() => handleReview(s, "rejected")}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-800 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950/30 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" /> {t("arena.bountyDetail.reject")}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        {/* 右列：讨论评论区（与情景/人格详情页共用 CommentThread：文字+配图+楼中楼+删除） */}
        <div className="space-y-4">
          <CommentThread
            targetType="bounty"
            targetId={bounty._id}
            canModerate={isOwner}
            onCountChange={(delta) =>
              setBounty((b) =>
                b
                  ? { ...b, stats: { ...b.stats, commentCount: Math.max(0, b.stats.commentCount + delta) } }
                  : b
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
