import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";

type Idea = {
  _id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  visibility: "public" | "private" | "unlisted" | string;
  isMonetizable: boolean;
  licenseType: string;
  author?: { _id: string; username: string; role: string };
};

export default function EditIdeaPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const userId = (user as any)?._id || (user as any)?.id;
  const isAdmin = user?.role === "admin";

  const [idea, setIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [isMonetizable, setIsMonetizable] = useState(false);
  const [licenseType, setLicenseType] = useState("default");

  const canEdit = useMemo(() => {
    if (!idea || !userId) return false;
    const isOwner = !!idea.author?._id && idea.author._id === userId;
    return isOwner || isAdmin;
  }, [idea, userId, isAdmin]);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: true; idea: Idea }>(`/api/ideas/${id}`);
      const i = res.idea;
      setIdea(i);

      // init form values
      setTitle(i.title || "");
      setSummary(i.summary || "");
      setContent(i.content || "");
      setTags((i.tags || []).join(", "));
      setVisibility((i.visibility as any) || "public");
      setIsMonetizable(!!i.isMonetizable);
      setLicenseType(i.licenseType || "default");
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

  async function onSave() {
    if (!id) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!canEdit) {
      toast.error("Forbidden");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/ideas/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          summary,
          content,
          tags, // 后端已支持 "a,b,c" → toStringArray
          visibility,
          isMonetizable,
          licenseType,
        }),
      });

      toast.success("Idea updated");
      nav(`/ideas/${id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-gray-300">
        Please login to edit ideas.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <Link to={`/ideas/${id}`} className="text-sm text-gray-400 hover:text-white">
        ← Back to idea
      </Link>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h1 className="text-2xl font-bold text-white">Edit Idea</h1>
        {idea?.author?.username && (
          <p className="text-gray-400 text-sm mt-1">
            Author: {idea.author.username} {isAdmin ? "· (admin mode)" : ""}
          </p>
        )}

        {loading && <p className="text-gray-300 mt-4">Loading...</p>}

        {!loading && idea && !canEdit && (
          <p className="text-red-400 text-sm mt-4">
            Forbidden: only the author or admin can edit this idea.
          </p>
        )}

        {!loading && idea && (
          <div className="mt-5 grid gap-3">
            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit || saving}
            />

            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
              placeholder="Summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={!canEdit || saving}
            />

            <textarea
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[120px]"
              placeholder="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!canEdit || saving}
            />

            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
              placeholder="Tags (comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={!canEdit || saving}
            />

            <div className="grid md:grid-cols-3 gap-2">
              <select
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                disabled={!canEdit || saving}
              >
                <option value="public">public</option>
                <option value="unlisted">unlisted</option>
                <option value="private">private</option>
              </select>

              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                placeholder="licenseType"
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
                disabled={!canEdit || saving}
              />

              <label className="flex items-center gap-2 text-sm text-gray-300 px-2">
                <input
                  type="checkbox"
                  checked={isMonetizable}
                  onChange={(e) => setIsMonetizable(e.target.checked)}
                  disabled={!canEdit || saving}
                />
                Monetizable
              </label>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={onSave}
                disabled={saving || !canEdit || !title.trim()}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <Link
                to={`/ideas/${id}`}
                className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900"
              >
                Cancel
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
