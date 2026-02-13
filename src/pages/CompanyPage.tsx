import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

export default function CompanyPage() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ ideas: any[] }>("/api/company/interests");
        setIdeas(res.ideas || []);
      } catch (e: any) {
        const msg = humanizeError(e);
        toast.error(msg);
        setErr(msg); // 可选

      }
    })();
  }, []);

  if (user?.role !== "company") {
    return <div className="max-w-3xl mx-auto p-4 text-gray-300">Company account required.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Company</h1>
      <p className="text-gray-400 text-sm mt-1">Ideas you marked as interested.</p>

      {err && <p className="text-red-400 mt-6">Error: {err}</p>}

      <div className="mt-6 grid gap-3">
        {ideas.length === 0 && <p className="text-gray-400">No interests yet.</p>}
        {ideas.map((it) => (
          <Link key={it._id} to={`/ideas/${it._id}`} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">{it.title}</span>
              <span className="text-xs text-gray-500">{it.author?.username || "unknown"}</span>
            </div>
            {it.interestMessage && <p className="text-gray-300 mt-2">{it.interestMessage}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
