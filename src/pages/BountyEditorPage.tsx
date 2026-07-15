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
 *
 * 说明：reward 为平台虚拟点数，非真钱，不涉及任何真实支付/转账。
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { createBounty, getBounty, updateBounty } from "../api";
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

  const parsedTags = useMemo(
    () => tagsText.split(/[#,，,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
    [tagsText]
  );

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

  async function handleSave() {
    if (!title.trim()) {
      toast.error("请填写任务标题");
      return;
    }
    if (!targetUrl.trim()) {
      toast.error("请填写外部平台评论区链接");
      return;
    }
    const rewardNum = Number(reward);
    if (!Number.isFinite(rewardNum) || rewardNum < 0) {
      toast.error("赏金点数需为不小于 0 的数字");
      return;
    }
    const slotsNum = Math.max(1, Math.floor(Number(slots) || 1));

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
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {saving ? "保存中…" : isEdit ? "保存修改" : "发布悬赏"}
        </button>
      </div>

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
          赏金为平台虚拟点数，审批通过即视为该猎人获得对应点数，不涉及任何真实货币或转账。
        </p>
      </section>
    </div>
  );
}
