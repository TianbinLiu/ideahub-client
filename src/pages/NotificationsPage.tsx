import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,   //or import type { NotificationItem } from "../api";
} from "../api";

function renderText(n: NotificationItem) {
  const actor = n.actorId?.username || "Someone";
  const title = n.ideaId?.title || "your idea";

  switch (n.type) {
    case "LIKE": return `${actor} liked "${title}"`;
    case "COMMENT": return `${actor} commented on "${title}"`;
    case "BOOKMARK": return `${actor} bookmarked "${title}"`;
    case "INTEREST": return `${actor} showed interest in "${title}"`;
    default: return "New notification";
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listNotifications({ page: 1, limit: 50 });
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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
        <h1 className="text-xl font-semibold text-white">Notifications</h1>
        <button onClick={markAll} className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200">
          Mark all read
        </button>
      </div>

      {loading && <div className="text-gray-400 text-sm">Loading...</div>}

      <div className="space-y-2">
        {items.map(n => (
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
                  Open idea
                </Link>
              )}
            </div>

            {!n.readAt && (
              <button onClick={() => markOne(n._id)} className="text-xs rounded-lg border border-gray-700 px-2 py-1 hover:bg-gray-950 text-gray-200">
                Read
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
