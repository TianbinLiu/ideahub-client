import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,   //or import type { NotificationItem } from "../api";
} from "../api";
import { useTranslation } from "react-i18next";

type TabType = "all" | "system" | "mentions" | "likes";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeTab = (searchParams.get("tab") as TabType) || "all";

  const tabs: { key: TabType; label: string }[] = [
    { key: "all", label: t("notifications.tabAll") },
    { key: "system", label: t("notifications.tabSystem") },
    { key: "mentions", label: t("notifications.tabMentions") },
    { key: "likes", label: t("notifications.tabLikes") },
  ];

  function filterByTab(item: NotificationItem, tab: TabType): boolean {
    switch (tab) {
      case "system":
        return ["COMMENT", "BOOKMARK", "INTEREST", "INVITE"].includes(item.type);
      case "mentions":
        return item.type === "MENTION";
      case "likes":
        return ["LIKE", "LIKE_COMMENT", "LIKE_POST"].includes(item.type);
      case "all":
      default:
        return true;
    }
  }

  const filteredItems = items.filter((item) => filterByTab(item, activeTab));

  function renderText(n: NotificationItem) {
    const actor = n.actorId?.username || t('notifications.actorUnknown');
    const title = n.ideaId?.title || t('notifications.ideaUnknown');

    switch (n.type) {
      case "LIKE":
        return t('notifications.like', { actor, title });
      case "COMMENT":
        return t('notifications.comment', { actor, title });
      case "BOOKMARK":
        return t('notifications.bookmark', { actor, title });
      case "INTEREST":
        return t('notifications.interest', { actor, title });
      case "MENTION":
        return t('notifications.mention', { actor, title });
      case "INVITE":
        return t('notifications.invite', { actor, title });
      case "LIKE_COMMENT":
        return t('notifications.likeComment', { actor, title });
      case "LIKE_POST":
        return t('notifications.likePost', { actor, title: n.payload?.postTitle || t('notifications.postUnknown') });
      default:
        return t('notifications.typeFallback', { actor, type: n.type });
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      console.log("[NotificationsPage] Loading notifications...");
      const r = await listNotifications({ page: 1, limit: 50 });
      console.log("[NotificationsPage] Got response:", r);
      setItems(r.items || []);
      if (r.items && r.items.length === 0) {
        console.log("[NotificationsPage] No items returned");
      }
    } catch (e: any) {
      console.error("[NotificationsPage] Error loading notifications:", e);
      setError(t('notifications.errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 5 seconds
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function markOne(id: string) {
    await markNotificationRead(id);
    setItems(prev => prev.map(n => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
  }

  async function markAll() {
    await markAllNotificationsRead();
    setItems(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString() })));
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">{t('notifications.title')}</h1>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200 text-sm">
            ↻ {t('notifications.refresh')}
          </button>
          <button onClick={markAll} className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200">
            {t('notifications.markAllRead')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-800 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSearchParams({ tab: tab.key })}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white hover:bg-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-400 text-sm">{t('common.loading')}</div>}
      {error && <div className="text-red-400 text-sm mb-4">{t('common.error')}: {error}</div>}

      <div className="space-y-2">
        {filteredItems.length === 0 && !loading && <p className="text-gray-400 text-sm">{t('notifications.empty')}</p>}
        {filteredItems.map(n => (
          <div
            key={n._id}
            className={`rounded-lg border border-gray-800 p-3 flex items-center justify-between ${
              n.readAt ? "bg-gray-950" : "bg-gray-900"
            }`}
          >
            <div className="pr-4">
              <div className="text-sm text-gray-100">{renderText(n)}</div>
              {n.ideaId?._id && (
                <Link to={`/ideas/${n.ideaId._id}`} className="text-xs text-blue-400 hover:underline">
                  {t('notifications.openIdea')}
                </Link>
              )}
            </div>

            {!n.readAt && (
              <button onClick={() => markOne(n._id)} className="text-xs rounded-lg border border-gray-700 px-2 py-1 hover:bg-gray-950 text-gray-200">
                {t('notifications.read')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
