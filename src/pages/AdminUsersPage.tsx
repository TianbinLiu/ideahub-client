import { useEffect, useState } from "react";
import { Link } from "react-router";
import toast from "react-hot-toast";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";
import { apiFetch } from "../api";
import { useTranslation } from "react-i18next";

type AdminUserItem = {
  _id: string;
  username: string;
  email?: string;
  role: "user" | "company" | "admin";
  createdAt?: string;
};

type AdminIdeaItem = {
  _id: string;
  title: string;
  summary?: string;
  tags?: string[];
  visibility?: "public" | "unlisted" | "private";
  createdAt?: string;
  author?: { _id: string; username: string; role: string };
};

type AdminLeaderboardItem = {
  _id: string;
  tags?: string[];
  tagsKey?: string;
  computedAt?: string;
  entriesCount?: number;
  postsCount?: number;
};

type AdminTab = "users" | "ideas" | "leaderboards";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<AdminTab>("users");
  const [q, setQ] = useState("");
  const [userItems, setUserItems] = useState<AdminUserItem[]>([]);
  const [ideaItems, setIdeaItems] = useState<AdminIdeaItem[]>([]);
  const [leaderboardItems, setLeaderboardItems] = useState<AdminLeaderboardItem[]>([]);
  const [loading, setLoading] = useState(false);

  function placeholder() {
    if (tab === "users") return t('admin.searchByUsernameEmail');
    if (tab === "ideas") return t('admin.searchByTitleContent');
    return t('admin.searchByTags');
  }

  async function load() {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      sp.set("page", "1");
      sp.set("limit", "30");

      if (tab === "users") {
        const r = await apiFetch<{ ok: true; items: AdminUserItem[]; total: number; page: number; limit: number }>(
          `/api/admin/users?${sp.toString()}`
        );
        setUserItems(r.items || []);
      } else if (tab === "ideas") {
        const r = await apiFetch<{ ok: true; items: AdminIdeaItem[]; total: number; page: number; limit: number }>(
          `/api/admin/ideas?${sp.toString()}`
        );
        setIdeaItems(r.items || []);
      } else {
        const r = await apiFetch<{ ok: true; items: AdminLeaderboardItem[]; total: number; page: number; limit: number }>(
          `/api/admin/leaderboards?${sp.toString()}`
        );
        setLeaderboardItems(r.items || []);
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isAdmin, tab]);

  async function delUser(u: AdminUserItem) {
    if (!confirm(t('admin.deleteUserConfirm', { username: u.username }))) return;
    try {
      await apiFetch(`/api/admin/users/${u._id}`, { method: "DELETE" });
      toast.success(t('admin.userDeleted'));
      setUserItems((prev) => prev.filter((x) => x._id !== u._id));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function delIdea(i: AdminIdeaItem) {
    if (!confirm(t('admin.deleteIdeaConfirm', { title: i.title }))) return;
    try {
      await apiFetch(`/api/admin/ideas/${i._id}`, { method: "DELETE" });
      toast.success(t('admin.ideaDeleted'));
      setIdeaItems((prev) => prev.filter((x) => x._id !== i._id));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function delLeaderboard(b: AdminLeaderboardItem) {
    const label = b.tags?.join(", ") || b.tagsKey || b._id;
    if (!confirm(t('admin.deleteLeaderboardConfirm', { label }))) return;
    try {
      await apiFetch(`/api/admin/leaderboards/${b._id}`, { method: "DELETE" });
      toast.success(t('admin.leaderboardDeleted'));
      setLeaderboardItems((prev) => prev.filter((x) => x._id !== b._id));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  if (!user) return <div className="max-w-3xl mx-auto p-4 text-gray-300">{t('admin.pleaseLogin')}</div>;
  if (!isAdmin) return <div className="max-w-3xl mx-auto p-4 text-gray-300">{t('admin.adminDisabled')}</div>;

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-xl font-semibold text-white">{t('admin.usersManagement')}</h1>

      <div className="mt-4 flex gap-2 border-b border-gray-800">
        <button
          onClick={() => setTab("users")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "users" ? "text-white border-b-2 border-white" : "text-gray-400"
          }`}
        >
          {t('admin.users')}
        </button>
        <button
          onClick={() => setTab("ideas")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "ideas" ? "text-white border-b-2 border-white" : "text-gray-400"
          }`}
        >
          {t('admin.ideas')}
        </button>
        <button
          onClick={() => setTab("leaderboards")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "leaderboards" ? "text-white border-b-2 border-white" : "text-gray-400"
          }`}
        >
          {t('admin.leaderboards')}
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder()}
          className="flex-1 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-gray-100"
        />
        <button
          onClick={load}
          className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900"
        >
          {t('common.search')}
        </button>
      </div>

      {loading && <div className="text-sm text-gray-400 mt-3">{t('common.loading')}</div>}

      {tab === "users" && (
        <div className="mt-4 space-y-2">
          {userItems.map((u) => (
            <div key={u._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center justify-between">
              <div>
                <div className="text-gray-100 text-sm">
                  {u.username} <span className="text-gray-500">({u.role})</span>
                </div>
                <div className="text-gray-400 text-xs">{u.email || "-"}</div>
              </div>

              <button
                onClick={() => delUser(u)}
                disabled={u.role === "admin"}
                className="text-xs rounded-lg border border-red-800 px-3 py-1.5 text-red-200 hover:bg-red-950 disabled:opacity-40"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}

          {userItems.length === 0 && !loading && (
            <div className="text-sm text-gray-400">{t('admin.noUsersFound')}</div>
          )}
        </div>
      )}

      {tab === "ideas" && (
        <div className="mt-4 space-y-2">
          {ideaItems.map((i) => (
            <div key={i._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-gray-100 text-sm font-semibold">
                  <Link to={`/ideas/${i._id}`} className="hover:underline">
                    {i.title}
                  </Link>
                  {i.visibility && (
                    <span className="ml-2 text-xs text-gray-500">[{i.visibility}]</span>
                  )}
                </div>
                {i.author?.username && (
                  <div className="text-gray-400 text-xs">by {i.author.username}</div>
                )}
                {i.summary && <div className="text-gray-400 text-xs mt-1">{i.summary}</div>}
                {i.tags && i.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {i.tags.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => delIdea(i)}
                className="text-xs rounded-lg border border-red-800 px-3 py-1.5 text-red-200 hover:bg-red-950"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}

          {ideaItems.length === 0 && !loading && (
            <div className="text-sm text-gray-400">{t('admin.noIdeasFound')}</div>
          )}
        </div>
      )}

      {tab === "leaderboards" && (
        <div className="mt-4 space-y-2">
          {leaderboardItems.map((b) => (
            <div key={b._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-gray-100 text-sm font-semibold">
                  <Link to={`/leaderboard/${b._id}`} className="hover:underline">
                    {(b.tags && b.tags.length > 0) ? b.tags.join(", ") : (b.tagsKey || `(${t('admin.noTags')})`)}
                  </Link>
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  {t('admin.entries')}: {b.entriesCount || 0} · {t('admin.posts')}: {b.postsCount || 0}
                </div>
                {b.tagsKey && <div className="text-gray-500 text-xs mt-1">{b.tagsKey}</div>}
              </div>

              <button
                onClick={() => delLeaderboard(b)}
                className="text-xs rounded-lg border border-red-800 px-3 py-1.5 text-red-200 hover:bg-red-950"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}

          {leaderboardItems.length === 0 && !loading && (
            <div className="text-sm text-gray-400">{t('admin.noLeaderboardsFound')}</div>
          )}
        </div>
      )}
    </div>
  );
}
