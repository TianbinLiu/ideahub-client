import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

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

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ idea: { _id: string } }>(`/api/ideas`, {
        method: "POST",
        body: JSON.stringify({ title, summary, content, tags, visibility, isMonetizable, licenseType }),
      });

      const ideaId = res.idea._id;

      if (requestAI) {
        // 可选：这里可以加个 toast/状态提示
        await apiFetch(`/api/ideas/${ideaId}/ai-review`, { method: "POST" });
      }

      nav(`/ideas/${ideaId}`);
      nav(`/ideas/${res.idea._id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Create Idea</h1>
      <p className="text-gray-400 text-sm mt-1">This will be saved under your account.</p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <textarea className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[120px]"
          placeholder="Content" value={content} onChange={(e) => setContent(e.target.value)} />
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />

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
        </div>

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
