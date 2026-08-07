/**
 * @file BountyEditorPage.tsx - 赏金猎人 · 发布 / 编辑悬赏
 * @category Page
 * @route /arena/bounty/new, /arena/bounty/:id/edit
 * @i18n none（页面内容以中文为主）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 表单：title / description / reward(点数) / platform / targetUrl(外链) / tags / slots / deadline
 * - 编辑态 getBounty 预填并 updateBounty；否则 createBounty；成功跳转详情
 * - 托管提示：发布时显示「将托管 reward × slots = X 点」与当前余额，余额不够时禁用发布
 *
 * 说明：reward 为平台【虚拟点数】，无现金价值，不可提现/兑换，不涉及任何真实支付/转账。
 *   发布悬赏会把 reward × slots 从发布者账上【托管】起来（后端扣款成功才会建悬赏），
 *   审批通过时从托管付给猎人，关闭/删除时把没用完的退回。
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { apiUploadImage, createBounty, getBounty, getMyPoints, updateBounty } from "../api";
import { humanizeError } from "../utils/humanizeError";

const PLATFORM_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "weibo", labelKey: "platformWeibo" },
  { value: "bilibili", labelKey: "platformBilibili" },
  { value: "tieba", labelKey: "platformTieba" },
  { value: "zhihu", labelKey: "platformZhihu" },
  { value: "douyin", labelKey: "platformDouyin" },
  { value: "xiaohongshu", labelKey: "platformXiaohongshu" },
  { value: "instagram", labelKey: "platformInstagram" },
  { value: "other", labelKey: "platformOther" },
];

/** ISO 字符串 -> <input type="date"> 的 value（YYYY-MM-DD） */
function isoToDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function BountyEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("100");
  const [platform, setPlatform] = useState("weibo");
  const [targetUrl, setTargetUrl] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [slots, setSlots] = useState("1");
  const [deadline, setDeadline] = useState("");
  // 可选封面图（Cloudinary URL；空串 = 无封面）
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);

  // 当前虚拟点数余额（null = 还没拿到）。用于「够不够托管」的前置提示。
  const [points, setPoints] = useState<number | null>(null);
  // 编辑态下已经托管在这个悬赏里的点数：改赏金时只需要补差额，不是重新托管一整份
  const [escrowPoints, setEscrowPoints] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);

  const parsedTags = useMemo(
    () => tagsText.split(/[#,，,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
    [tagsText]
  );

  const rewardNum = Number(reward);
  const slotsNum = Math.max(1, Math.floor(Number(slots) || 1));
  const rewardValid = Number.isFinite(rewardNum) && rewardNum >= 0 && Number.isInteger(rewardNum);

  /**
   * 这次操作实际要从账上扣走多少点。
   * - 新建：托管 reward × slots 一整份。
   * - 编辑：后端按「目标托管 = reward × 剩余名额」重算，只补/退【差额】。
   *   这里同样只算差额，否则编辑一个已托管的悬赏会显示要再扣一整份，吓人且与后端不符。
   * 差额 ≤ 0 表示这次不用再掏点数（可能还会退回）。
   */
  const targetEscrow = rewardValid ? rewardNum * Math.max(0, slotsNum - approvedCount) : 0;
  const toHold = isEdit ? targetEscrow - escrowPoints : rewardValid ? rewardNum * slotsNum : 0;
  const needsPoints = Math.max(0, toHold);
  // 余额还没加载出来时不拦（null）：宁可让后端来判，也不要因为一次请求慢就把发布按钮锁死
  const notEnough = points !== null && rewardValid && needsPoints > points;

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getBounty(id);
        if (!mounted) return;
        const b = res.bounty;
        setTitle(b.title || "");
        setDescription(b.description || "");
        setReward(String(b.reward ?? 0));
        setPlatform(b.platform || "weibo");
        setTargetUrl(b.targetUrl || "");
        setTagsText((b.tags || []).join(", "));
        setSlots(String(b.slots ?? 1));
        setDeadline(isoToDateInput(b.deadline));
        setCoverImageUrl(b.coverImageUrl || "");
        setEscrowPoints(b.escrowPoints ?? 0);
        setApprovedCount(b.approvedCount ?? 0);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isEdit, id]);

  // 当前余额：新建和编辑都要，用来提示「够不够托管」
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getMyPoints();
        if (mounted) setPoints(res.points);
      } catch (e) {
        // 余额拿不到不阻塞发布：真正的余额判断在后端（原子扣款），这里只是提前提示
        if (mounted) toast.error(humanizeError(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /** 可选封面：选文件 → 传 Cloudinary 拿 URL（真正入库的是 URL 字符串） */
  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCoverUploading(true);
      const res = await apiUploadImage(file, "idea");
      setCoverImageUrl(res.imageUrl);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error(t("arena.bountyEditor.errTitleRequired"));
      return;
    }
    if (!targetUrl.trim()) {
      toast.error(t("arena.bountyEditor.errTargetUrlRequired"));
      return;
    }
    if (!rewardValid) {
      toast.error(t("arena.bountyEditor.errRewardInvalid"));
      return;
    }
    if (notEnough) {
      toast.error(t("arena.bountyEditor.errInsufficientEscrow"));
      return;
    }

    const body = {
      title: title.trim(),
      description: description.trim(),
      reward: rewardNum,
      platform,
      targetUrl: targetUrl.trim(),
      coverImageUrl,
      tags: parsedTags,
      slots: slotsNum,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    };

    try {
      setSaving(true);
      const res = isEdit && id ? await updateBounty(id, body) : await createBounty(body);
      toast.success(t("arena.bountyEditor.saved"));
      navigate(`/arena/bounty/${res.bounty._id}`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">{t("arena.bountyEditor.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link
        to={isEdit && id ? `/arena/bounty/${id}` : "/arena/bounty"}
        className="text-sm text-gray-400 hover:text-white"
      >
        ← {isEdit ? t("arena.bountyEditor.backToTaskDetail") : t("arena.bountyEditor.backToBountyHall")}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? t("arena.bountyEditor.editBounty") : t("arena.bountyEditor.publishBounty")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.bountyEditor.subtitle")}
          </p>
        </div>
        <button
          type="button"
          disabled={saving || notEnough}
          title={notEnough ? t("arena.bountyEditor.errInsufficientEscrow") : undefined}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t("arena.bountyEditor.saving") : notEnough ? t("arena.bountyEditor.insufficientPoints") : isEdit ? t("arena.bountyEditor.saveChanges") : t("arena.bountyEditor.publishBounty")}
        </button>
      </div>

      {/* ===== 托管提示：这次要扣多少点、账上还有多少 =====
          ★这里的判断只是提前告知；真正的把关在后端（条件原子扣款），
            所以就算这一段算错/没加载出来，也不可能扣出一个负余额。 */}
      <section
        className={`mt-4 rounded-2xl border p-4 ${
          notEnough ? "border-rose-700/60 bg-rose-950/20" : "border-amber-700/40 bg-amber-950/10"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-300">
            {isEdit ? t("arena.bountyEditor.topUpEscrow") : t("arena.bountyEditor.willEscrow")}
            <span className="mx-1.5 font-mono text-amber-200">
              {rewardValid ? `${rewardNum} × ${slotsNum} = ${rewardValid ? rewardNum * slotsNum : 0}` : "—"}
            </span>
            {t("arena.bountyEditor.pointsUnit")}
            {isEdit && rewardValid ? (
              <span className="ml-1 text-xs text-gray-500">{t("arena.bountyEditor.escrowDetail", { escrow: escrowPoints, needs: needsPoints })}</span>
            ) : null}
          </span>
          <span className="text-sm text-gray-400">
            {t("arena.bountyEditor.currentBalance")}{" "}
            <span className={`font-semibold ${notEnough ? "text-rose-300" : "text-amber-200"}`}>
              {points === null ? "…" : points.toLocaleString()}
            </span>{" "}
            {t("arena.bountyEditor.pointsUnit")}
          </span>
        </div>

        {isEdit && toHold < 0 ? (
          <p className="mt-2 text-xs text-emerald-300">{t("arena.bountyEditor.refundNote", { amount: Math.abs(toHold) })}</p>
        ) : null}

        {notEnough ? (
          <p className="mt-2 text-xs text-rose-300">
            {t("arena.bountyEditor.shortfallNote", { shortfall: needsPoints - (points ?? 0) })}
          </p>
        ) : null}

        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          {t("arena.bountyEditor.escrowNoteIntro")}<span className="text-gray-400">{t("arena.bountyEditor.escrowNoteEmphasis")}</span>{t("arena.bountyEditor.escrowNotePeriod")}
        </p>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("arena.bountyEditor.titlePlaceholder")}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("arena.bountyEditor.descriptionPlaceholder")}
          rows={5}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-gray-300">
            {t("arena.bountyEditor.rewardLabel")}
            <input
              type="number"
              min={0}
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder={t("arena.bountyEditor.rewardPlaceholder")}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-300">
            {t("arena.bountyEditor.slotsLabel")}
            <input
              type="number"
              min={1}
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
              placeholder={t("arena.bountyEditor.slotsPlaceholder")}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-gray-300">
            {t("arena.bountyEditor.platformLabel")}
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(`arena.bountyEditor.${p.labelKey}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            {t("arena.bountyEditor.deadlineLabel")}
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm text-gray-300">
          {t("arena.bountyEditor.targetUrlLabel")}
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        {/* 可选封面：帮悬赏在大厅里更醒目 */}
        <div className="block text-sm text-gray-300">
          {t("arena.bountyEditor.coverLabel")}
          <div className="mt-1 flex items-center gap-3">
            {coverImageUrl ? (
              <div className="relative">
                <img src={coverImageUrl} alt="" className="h-20 w-32 rounded-xl border border-gray-800 object-cover" />
                <button
                  type="button"
                  onClick={() => setCoverImageUrl("")}
                  title={t("arena.bountyEditor.coverRemove")}
                  className="absolute -right-2 -top-2 rounded-full border border-gray-700 bg-gray-900 px-1.5 text-xs text-gray-300 hover:text-white"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex h-20 w-32 cursor-pointer items-center justify-center rounded-xl border border-dashed border-gray-700 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300">
                {coverUploading ? t("arena.bountyEditor.coverUploading") : t("arena.bountyEditor.coverUpload")}
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} disabled={coverUploading} />
              </label>
            )}
            <span className="text-xs text-gray-500">{t("arena.bountyEditor.coverHint")}</span>
          </div>
        </div>

        <label className="block text-sm text-gray-300">
          {t("arena.bountyEditor.tagsLabel")}
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={t("arena.bountyEditor.tagsPlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        {parsedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {parsedTags.map((tag) => (
              <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5 text-xs text-cyan-200">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-500">
          {t("arena.bountyEditor.footerNote")}
        </p>
      </section>
    </div>
  );
}
