import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listDmBlacklist, unblockDmUser } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type BlacklistItem = {
  _id: string;
  blockedUserId: {
    _id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  createdAt: string;
};

export default function BlacklistPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<BlacklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listDmBlacklist();
      setItems((res.items || []) as BlacklistItem[]);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUnblock(userId: string) {
    setActionUserId(userId);
    try {
      await unblockDmUser(userId);
      setItems((prev) => prev.filter((it) => it.blockedUserId?._id !== userId));
      toast.success(t("messages.unblockedUser"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setActionUserId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">{t("messages.blacklistManage")}</h1>
        <button
          onClick={load}
          className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200 text-sm"
        >
          {t("notifications.refresh")}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">{t("common.loading")}</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400">{t("messages.blacklistEmpty")}</p>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const u = item.blockedUserId;
          if (!u) return null;
          return (
            <div key={item._id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt={u.username} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white">
                    {u.username?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white font-semibold block truncate">
                    {u.displayName || u.username}
                  </p>
                  <p className="text-xs text-gray-400 truncate">@{u.username}</p>
                </div>
              </div>

              <button
                onClick={() => handleUnblock(u._id)}
                disabled={actionUserId === u._id}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:bg-gray-700 disabled:cursor-not-allowed"
              >
                {actionUserId === u._id ? t("common.loading") : t("messages.unblockDm")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
