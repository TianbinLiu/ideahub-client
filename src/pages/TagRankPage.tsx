import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { useTranslation } from "react-i18next";

export default function TagRankPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const query = params.get("q") || "";

  const [tagsInput, setTagsInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Discovery section state
  const [discoverySort, setDiscoverySort] = useState<"recent" | "hottest">(
    "recent"
  );
  const [discoveryBoards, setDiscoveryBoards] = useState<any[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);

  // Search results state
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Fetch tag suggestions
  async function fetchSuggestions(q: string) {
    try {
      if (!q.trim()) return setSuggestions([]);
      const res = await apiFetch(
        `/api/tag-rank/suggest?q=${encodeURIComponent(q)}`
      );
      setSuggestions(res.tags || []);
    } catch {}
  }

  // Load discovery leaderboards
  async function loadDiscovery() {
    try {
      setDiscoveryLoading(true);
      const sort = discoverySort === "hottest" ? "hottest" : "recent";
      const res = await apiFetch(
        `/api/tag-rank/leaderboards?sort=${sort}&limit=6`
      );
      setDiscoveryBoards(res.boards || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setDiscoveryLoading(false);
    }
  }

  // Search for leaderboards
  async function handleSearch(inputOverride?: string, skipParamSync: boolean = false) {
    try {
      const rawInput = inputOverride ?? tagsInput;
      const tagsArr = rawInput
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.toLowerCase());

      if (tagsArr.length === 0) {
        return toast.error(t('tagRank.enterTag'));
      }

      setSearchLoading(true);
      setSearchResults(null);

      if (!skipParamSync) {
        const next = new URLSearchParams(params);
        next.set("q", tagsArr.join(","));
        setParams(next, { replace: true });
      }

      const res = await apiFetch(
        `/api/tag-rank/search?q=${encodeURIComponent(tagsArr.join(","))}`
      );

      // Show search results (including exact match if found)
      setSearchResults(res);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSearchLoading(false);
    }
  }

  // Create new leaderboard
  async function createNewLeaderboard() {
    try {
      const tagsArr = tagsInput
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.toLowerCase());

      if (tagsArr.length === 0) {
        return toast.error(t('tagRank.enterTag'));
      }

      const res = await apiFetch(`/api/tag-rank/leaderboard`, {
        method: "POST",
        body: JSON.stringify({ tags: tagsArr }),
      });

      nav(`/leaderboard/${res._id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  // Initial load of discovery
  useEffect(() => {
    loadDiscovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when sort changes
  useEffect(() => {
    loadDiscovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverySort]);

  useEffect(() => {
    setTagsInput(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    void handleSearch(query, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">{t('nav.tagRank')}</h1>
      <p className="text-gray-400 text-sm mt-1">
        {t('tagRank.subtitle')}
      </p>

      {/* Search Section */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-lg text-white mb-3">{t('tagRank.searchLeaderboards')}</h2>

        <div className="grid gap-3">
          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder={t('tagRank.tagsPlaceholder')}
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              fetchSuggestions(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />

          {suggestions.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setTagsInput((prev) => (prev ? `${prev},${s}` : s));
                    setSuggestions([]);
                  }}
                  className="text-sm px-2 py-1 rounded-full border border-gray-700 text-gray-300 hover:border-gray-500"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="rounded-xl bg-white text-black px-3 py-2 font-semibold disabled:opacity-50"
            >
              {searchLoading ? t('tagRank.searching') : t('common.search')}
            </button>
            <button
              onClick={() => {
                setTagsInput("");
                setSuggestions([]);
                setSearchResults(null);
              }}
              className="rounded-xl border border-gray-700 px-3 py-2"
            >
              {t('tagRank.clear')}
            </button>
          </div>
        </div>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-lg text-white mb-3">{t('tagRank.searchResults')}</h2>

          {/* Exact Match */}
          {searchResults.exact && (
            <div className="mb-4">
              <p className="text-sm text-green-400 mb-2">
                {t('tagRank.foundExact')}
              </p>
              <div
                className="rounded-xl border-2 border-green-700 bg-gray-950/50 p-3 cursor-pointer hover:bg-gray-950"
                onClick={() => nav(`/leaderboard/${searchResults.exact._id}`)}
              >
                <div className="text-white font-semibold">
                  {searchResults.exact.tags?.join(", ")}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {searchResults.exact.postsCount || 0} {t('leaderboard.nominations')}
                </div>
              </div>
            </div>
          )}

          {/* Related Leaderboards */}
          {!searchResults.exact && searchResults.related && searchResults.related.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">
                {t('tagRank.noExact')}
              </p>
              <div className="grid gap-2">
                {searchResults.related.map((board: any) => (
                  <div
                    key={board._id}
                    className="rounded-xl border border-gray-800 bg-gray-950/50 p-3 cursor-pointer hover:bg-gray-950"
                    onClick={() => nav(`/leaderboard/${board._id}`)}
                  >
                    <div className="text-white font-semibold">
                      {board.tags?.join(", ")}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {board.postsCount || 0} {t('leaderboard.nominations')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Match Found */}
          {!searchResults.exact && (!searchResults.related || searchResults.related.length === 0) && (
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">
                {t('tagRank.noMatches')}
              </p>
            </div>
          )}

          {/* Create Button - only show when no exact match */}
          {!searchResults.exact && (
            <div className="border-t border-gray-800 pt-3">
              <p className="text-sm text-gray-400 mb-3">
                {t('tagRank.createPrompt', { tags: tagsInput })}
              </p>
              <button
                onClick={createNewLeaderboard}
                className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700"
              >
                {t('leaderboard.createNew')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Discovery Section */}
      {!searchResults && (
        <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-white">{t('tagRank.discoverLeaderboards')}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setDiscoverySort("recent")}
                className={`px-3 py-1 rounded-full text-sm ${
                  discoverySort === "recent"
                    ? "bg-white text-black font-semibold"
                    : "border border-gray-700 text-gray-300"
                }`}
              >
                {t('leaderboard.recent')}
              </button>
              <button
                onClick={() => setDiscoverySort("hottest")}
                className={`px-3 py-1 rounded-full text-sm ${
                  discoverySort === "hottest"
                    ? "bg-white text-black font-semibold"
                    : "border border-gray-700 text-gray-300"
                }`}
              >
                {t('leaderboard.hottest')}
              </button>
            </div>
          </div>

          {discoveryLoading ? (
            <p className="text-gray-400">{t('tagRank.loadingLeaderboards')}</p>
          ) : (
            <div className="grid gap-3">
              {discoveryBoards.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  {t('tagRank.noLeaderboards')}
                </p>
              ) : (
                discoveryBoards.map((board: any) => (
                  <div
                    key={board._id}
                    className="rounded-xl border border-gray-800 bg-gray-950/50 p-3 cursor-pointer hover:bg-gray-950 transition"
                    onClick={() => nav(`/leaderboard/${board._id}`)}
                  >
                    <div className="text-white font-semibold">
                      {board.tags?.join(", ")}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {board.postsCount || 0} {t('leaderboard.nominations')} ·{" "}
                      {new Date(board.computedAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {board.entries
                        ?.slice(0, 3)
                        .map((e: any) => e.idea?.title || "")
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
