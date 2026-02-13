import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";
import { apiFetch } from "../api";

type AdminUserItem = {
  _id: string;
  username: string;
  email?: string;
  role: "user" | "company" | "admin";
  createdAt?: string;
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      sp.set("page", "1");
      sp.set("limit", "30");

      const r = await apiFetch<{ ok: true; items: AdminUserItem[]; total: number; page: number; limit: number }>(
        `/api/admin/users?${sp.toString()}`
      );
      setItems(r.items || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [isAdmin]);

  async function del(u: AdminUserItem) {
    if (!confirm(`Delete user "${u.username}"? This will remove their ideas and related data.`)) return;
    try {
      await apiFetch(`/api/admin/users/${u._id}`, { method: "DELETE" });
      toast.success("User deleted");
      setItems(prev => prev.filter(x => x._id !== u._id));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  if (!user) return <div className="max-w-3xl mx-auto p-4 text-gray-300">Please login.</div>;
  if (!isAdmin) return <div className="max-w-3xl mx-auto p-4 text-gray-300">Admin only.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-xl font-semibold text-white">Admin — Users</h1>

      <div className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or email..."
          className="flex-1 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-gray-100"
        />
        <button
          onClick={load}
          className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900"
        >
          Search
        </button>
      </div>

      {loading && <div className="text-sm text-gray-400 mt-3">Loading...</div>}

      <div className="mt-4 space-y-2">
        {items.map(u => (
          <div key={u._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center justify-between">
            <div>
              <div className="text-gray-100 text-sm">
                {u.username} <span className="text-gray-500">({u.role})</span>
              </div>
              <div className="text-gray-400 text-xs">{u.email || "-"}</div>
            </div>

            <button
              onClick={() => del(u)}
              disabled={u.role === "admin"}
              className="text-xs rounded-lg border border-red-800 px-3 py-1.5 text-red-200 hover:bg-red-950 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        ))}

        {items.length === 0 && !loading && (
          <div className="text-sm text-gray-400">No users found.</div>
        )}
      </div>
    </div>
  );
}
