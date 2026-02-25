import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { saveLocalIdea } from "../utils/localIdeas";
import { MentionTextarea } from "../components/MentionTextarea";
import { CharCount } from "../components/CharCount";

const LIMITS = {
  TITLE: 150,
  SUMMARY: 500,
  CONTENT: 10000,
  TAGS: 200,
};

export default function NewIdeaPage() {
  const nav = useNavigate();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("demo,phase4");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [isMonetizable, setIsMonetizable] = useState(false);
  const [licenseType, setLicenseType] = useState("default");
  const [requestAI, setRequestAI] = useState(false);
  const [isFeedback, setIsFeedback] = useState(false);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    try {
      setErr("");
      setLoading(true);
      if (visibility === "private") {
        const local = saveLocalIdea({ title, summary, content, tags: tags.split(",").map((s) => s.trim()).filter(Boolean) });
        toast.success("Saved locally (private)");
        nav(`/ideas/${local._id}`);
        return;
      }

      const res = await apiFetch<{ idea: { _id: string } }>(`/api/ideas`, {
        method: "POST",
        body: JSON.stringify({ title, summary, content, tags, visibility, isMonetizable, licenseType, isFeedback }),
      });

      const ideaId = res.idea._id;

      if (requestAI) {
        const r = await apiFetch<{ ok: true; jobId: string; status: string }>(`/api/ideas/${ideaId}/ai-review`, { method: "POST" });
        toast.success("AI review queued");
        nav(`/ideas/${ideaId}?aiJob=${r.jobId}`);
        return;
      }
      nav(`/ideas/${ideaId}`);
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选：保留页面内红字
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Create Idea</h1>
      <p className="text-gray-400 text-sm mt-1">This will be saved under your account.</p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
            placeholder="Title" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.TITLE} />
          <CharCount current={title.length} max={LIMITS.TITLE} className="mt-1" />
        </div>

        <div>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
            placeholder="Summary" 
            value={summary} 
            onChange={(e) => setSummary(e.target.value)}
            maxLength={LIMITS.SUMMARY} />
          <CharCount current={summary.length} max={LIMITS.SUMMARY} className="mt-1" />
        </div>

        <div>
          <MentionTextarea
            value={content}
            onChange={setContent}
            placeholder="Content (use @username to invite users)"
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[220px] w-full text-gray-200"
            maxLength={LIMITS.CONTENT}
          />
          <CharCount current={content.length} max={LIMITS.CONTENT} className="mt-1" />
        </div>

        <div>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
            placeholder="Tags (comma-separated)" 
            value={tags} 
            onChange={(e) => setTags(e.target.value)}
            maxLength={LIMITS.TAGS} />
          <CharCount current={tags.length} max={LIMITS.TAGS} className="mt-1" />
        </div>

        <div className="grid md:grid-cols-3 gap-2">
          <select className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
            <option value="public">public</option>
            <option value="unlisted">unlisted</option>
            <option value="private">private</option>
          </select>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="licenseType" value={licenseType} onChange={(e) => setLicenseType(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-gray-300 px-2">
            <input type="checkbox" checked={isMonetizable} onChange={(e) => setIsMonetizable(e.target.checked)} />
            Monetizable
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 px-2">
            <input
              type="checkbox"
              checked={requestAI}
              onChange={(e) => setRequestAI(e.target.checked)}
            />
            Request AI review
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 px-2">
            <input
              type="checkbox"
              checked={isFeedback}
              onChange={(e) => setIsFeedback(e.target.checked)}
            />
            反馈网站问题或建议
          </label>
        </div>

        {isFeedback && (
          <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-3 text-sm text-blue-200">
            <p className="font-semibold mb-1">📋 提交反馈</p>
            <p>您正在提交网站bug报告或功能建议。AI将验证内容并自动分类。请详细描述问题或建议。</p>
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !title.trim()}
          className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
        >
          {loading ? "Saving..." : "Create"}
        </button>

        {err && <p className="text-red-400 text-sm">Error: {err}</p>}
      </div>
    </div>
  );
}
