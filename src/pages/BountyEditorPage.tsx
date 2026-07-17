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
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { createBounty, getBounty, getMyPoints, updateBounty } from "../api";
import { humanizeError } from "../utils/humanizeError";

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "weibo", label: "微博" },
  { value: "bilibili", label: "哔哩哔哩" },
  { value: "tieba", label: "贴吧" },
  { value: "zhihu", label: "知乎" },
  { value: "douyin", label: "抖音" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "instagram", label: "Instagram" },
  { value: "other", label: "其他" },
];

/** ISO 字符串 -> <input type="date"> 的 value（YYYY-MM-DD） */
function isoToDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function BountyEditorPage() {
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

  async function handleSave() {
    if (!title.trim()) {
      toast.error("请填写任务标题");
      return;
    }
    if (!targetUrl.trim()) {
      toast.error("请填写外部平台评论区链接");
      return;
    }
    if (!rewardValid) {
      toast.error("赏金点数需为不小于 0 的整数");
      return;
    }
    if (notEnough) {
      toast.error("点数不足，无法托管这笔赏金");
      return;
    }

    const body = {
      title: title.trim(),
      description: description.trim(),
      reward: rewardNum,
      platform,
      targetUrl: targetUrl.trim(),
      tags: parsedTags,
      slots: slotsNum,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    };

    try {
      setSaving(true);
      const res = isEdit && id ? await updateBounty(id, body) : await createBounty(body);
      toast.success("已保存");
      navigate(`/arena/bounty/${res.bounty._id}`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link
        to={isEdit && id ? `/arena/bounty/${id}` : "/arena/bounty"}
        className="text-sm text-gray-400 hover:text-white"
      >
        ← 返回{isEdit ? "任务详情" : "悬赏大厅"}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? "编辑悬赏" : "发布悬赏"}</h1>
          <p className="mt-1 text-sm text-gray-400">
            附上外部平台评论区链接，猎人跳转参与对话并提交存证后即可领取赏金点数。
          </p>
        </div>
        <button
          type="button"
          disabled={saving || notEnough}
          title={notEnough ? "点数不足，无法托管这笔赏金" : undefined}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "保存中…" : notEnough ? "点数不足" : isEdit ? "保存修改" : "发布悬赏"}
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
            {isEdit ? "调整后需要补充托管" : "发布将托管"}
            <span className="mx-1.5 font-mono text-amber-200">
              {rewardValid ? `${rewardNum} × ${slotsNum} = ${rewardValid ? rewardNum * slotsNum : 0}` : "—"}
            </span>
            点
            {isEdit && rewardValid ? (
              <span className="ml-1 text-xs text-gray-500">（已托管 {escrowPoints} 点，本次补 {needsPoints} 点）</span>
            ) : null}
          </span>
          <span className="text-sm text-gray-400">
            当前余额{" "}
            <span className={`font-semibold ${notEnough ? "text-rose-300" : "text-amber-200"}`}>
              {points === null ? "…" : points.toLocaleString()}
            </span>{" "}
            点
          </span>
        </div>

        {isEdit && toHold < 0 ? (
          <p className="mt-2 text-xs text-emerald-300">本次调整会退回 {Math.abs(toHold)} 点到你的账上。</p>
        ) : null}

        {notEnough ? (
          <p className="mt-2 text-xs text-rose-300">
            点数不足：还差 {needsPoints - (points ?? 0)} 点。请调低赏金或名额。
          </p>
        ) : null}

        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          托管的点数会先从你的账上扣除，审批通过时发放给猎人；关闭或删除悬赏时，没用完的部分会退回给你。
          点数为<span className="text-gray-400">平台虚拟点数，无现金价值，不可提现或兑换</span>。
        </p>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="任务标题"
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="任务描述：说明希望猎人做什么、发言方向与要求等"
          rows={5}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-gray-300">
            赏金点数（虚拟点数）
            <input
              type="number"
              min={0}
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="如：100"
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-300">
            名额（可通过人数）
            <input
              type="number"
              min={1}
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
              placeholder="默认 1"
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-gray-300">
            平台
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            截止时间（可空）
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm text-gray-300">
          外部平台评论区链接
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <label className="block text-sm text-gray-300">
          标签（逗号分隔）
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="如：热点, 对线, 数码"
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
          赏金为平台虚拟点数（无现金价值，不可提现/兑换）：发布时从你的账上托管，审批通过后入账给该猎人，
          不涉及任何真实货币或转账。
        </p>
      </section>
    </div>
  );
}
