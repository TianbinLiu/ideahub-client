import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, changePassword, getOauthLinks, logoutAllSessions, setPassword, startOauthLink, unlinkOauthProvider, type OauthLinks, type OauthProvider } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { listLocalIdeas } from "../utils/localIdeas";

type Idea = {
  _id: string;
  title: string;
  summary: string;
  visibility: string;
  createdAt: string;
};

export default function MePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user, loginWithToken, logout } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [localIdeas, setLocalIdeas] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [likedIdeas, setLikedIdeas] = useState<any[]>([]);
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<any[]>([]);
  const [bookmarkedLeaderboards, setBookmarkedLeaderboards] = useState<any[]>([]);
  const [receivedInterests, setReceivedInterests] = useState<any[]>([]);
  const [publicUsed, setPublicUsed] = useState(0);
  const [oauthLinks, setOauthLinks] = useState<OauthLinks | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<OauthProvider | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<OauthProvider | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const FREE_PUBLIC_LIMIT = Number((import.meta as any).env?.VITE_FREE_PUBLIC_IDEA_LIMIT) || 5;

  async function loadOauthLinks() {
    try {
      const res = await getOauthLinks();
      setOauthLinks(res);
    } catch {
      setOauthLinks(null);
    }
  }

  async function load() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ ideas: Idea[] }>("/api/ideas/mine");
      setIdeas(res.ideas || []);
      const used = (res.ideas || []).filter((i) => i.visibility === "public").length;
      setPublicUsed(used);
      // load local private ideas from browser
      setLocalIdeas(listLocalIdeas());
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const a = await apiFetch<{ ideas: any[] }>("/api/me/likes");
        setLikedIdeas(a.ideas || []);
        const b = await apiFetch<{ ideas: any[]; leaderboards: any[] }>("/api/me/bookmarks");
        setBookmarkedIdeas(b.ideas || []);
        setBookmarkedLeaderboards(b.leaderboards || []);
      } catch (e: any) {
        // 你也可以把错误显示出来，这里先忽略
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ interests: any[] }>("/api/me/received-interests");
        setReceivedInterests(res.interests || []);
      } catch { }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadOauthLinks();
  }, [user?._id]);

  async function handleLinkProvider(provider: OauthProvider) {
    try {
      setLinkingProvider(provider);
      const res = await startOauthLink(provider, "/me");
      window.location.assign(res.redirectUrl);
    } catch (e: any) {
      toast.error(humanizeError(e));
      setLinkingProvider(null);
    }
  }

  async function handleUnlinkProvider(provider: OauthProvider) {
    try {
      setUnlinkingProvider(provider);
      const res = await unlinkOauthProvider(provider);
      setOauthLinks(res);
      toast.success(
        t('me.oauthUnlinkedSuccess', {
          provider: provider === "google" ? t('auth.providerGoogle') : t('auth.providerGitHub'),
        })
      );
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUnlinkingProvider(null);
    }
  }

  async function handleSetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }

    try {
      setSettingPassword(true);
      const res = await setPassword(newPassword);
      await loginWithToken(res.token);
      await loadOauthLinks();
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t('auth.passwordSetSuccess'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSettingPassword(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!currentPassword) {
      toast.error(t('auth.currentPasswordRequired'));
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }

    try {
      setChangingPassword(true);
      const res = await changePassword(currentPassword, newPassword);
      await loginWithToken(res.token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t('auth.passwordChangedSuccess'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogoutAllSessions() {
    if (!window.confirm(t('me.logoutAllSessionsConfirm'))) {
      return;
    }

    try {
      setLoggingOutAll(true);
      await logoutAllSessions();
      logout();
      toast.success(t('me.logoutAllSessionsSuccess'));
      nav('/', { replace: true });
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoggingOutAll(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">{t('me.pageTitle')}</h1>
      <p className="text-gray-400 text-sm mt-1">{user?.email}</p>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-lg font-semibold text-white">{t('me.linkedAccounts')}</h2>
        <p className="mt-1 text-sm text-gray-400">{t('me.linkedAccountsDescription')}</p>

        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-100">{t('me.passwordLogin')}</div>
              <div className="mt-1 text-xs text-gray-400">
                {user?.hasPassword ? t('me.passwordLoginEnabled') : t('me.passwordLoginNotSet')}
              </div>
            </div>
            <span className={`rounded-full border px-2 py-1 text-xs ${user?.hasPassword ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300'}`}>
              {user?.hasPassword ? t('me.passwordLoginEnabled') : t('me.passwordLoginNotSet')}
            </span>
          </div>

          {user?.hasPassword ? (
            <>
              <p className="mt-3 text-sm text-gray-400">{t('me.passwordLoginReady')}</p>
              <form className="mt-4 grid gap-3" onSubmit={handleChangePassword}>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t('auth.currentPassword')}
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-white"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('auth.newPassword')}
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-white"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirmPassword')}
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-white"
                />
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50"
                >
                  {changingPassword ? t('me.changingPassword') : t('me.changePassword')}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-amber-300">{t('me.setPasswordToUnlinkLastOauth')}</p>
              <form className="mt-4 grid gap-3" onSubmit={handleSetPassword}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('auth.newPassword')}
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-white"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirmPassword')}
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-white"
                />
                <button
                  type="submit"
                  disabled={settingPassword}
                  className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
                >
                  {settingPassword ? t('me.settingPassword') : t('me.setPassword')}
                </button>
              </form>
            </>
          )}

          <div className="mt-4 border-t border-gray-800 pt-4">
            <div className="text-sm font-semibold text-red-200">{t('me.sessionSecurity')}</div>
            <p className="mt-1 text-xs text-gray-400">{t('me.logoutAllSessionsDescription')}</p>
            <button
              type="button"
              disabled={loggingOutAll}
              onClick={handleLogoutAllSessions}
              className="mt-3 rounded-xl border border-red-800 px-4 py-2 text-red-200 hover:bg-red-950 disabled:opacity-50"
            >
              {loggingOutAll ? t('me.loggingOutAllSessions') : t('me.logoutAllSessions')}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(["google", "github"] as OauthProvider[]).map((provider) => {
            const available = oauthLinks?.availableProviders?.includes(provider);
            const linked = oauthLinks?.linkedProviders?.[provider] || false;
            const canUnlink = oauthLinks?.canUnlink?.[provider] || false;
            const linking = linkingProvider === provider;
            const unlinking = unlinkingProvider === provider;
            const providerLabel = provider === "google" ? t('auth.providerGoogle') : t('auth.providerGitHub');

            return (
              <div key={provider} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-100">{providerLabel}</div>
                    <div className="mt-1 text-xs text-gray-400">
                      {linked ? t('me.oauthLinked') : t('me.oauthNotLinked')}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs ${linked ? 'border-emerald-700 text-emerald-300' : 'border-gray-700 text-gray-400'}`}>
                    {linked ? t('me.oauthLinked') : t('me.oauthNotLinked')}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!available || linked || Boolean(linkingProvider) || Boolean(unlinkingProvider)}
                  onClick={() => handleLinkProvider(provider)}
                  className="mt-4 w-full rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50"
                >
                  {linking ? t('me.oauthLinking') : t('me.linkOauthAccount', { provider: providerLabel })}
                </button>

                {linked && (
                  <button
                    type="button"
                    disabled={!canUnlink || Boolean(linkingProvider) || Boolean(unlinkingProvider)}
                    onClick={() => handleUnlinkProvider(provider)}
                    className="mt-2 w-full rounded-xl border border-red-800 px-4 py-2 text-red-200 hover:bg-red-950 disabled:opacity-50"
                  >
                    {unlinking ? t('me.oauthUnlinking') : t('me.unlinkOauthAccount', { provider: providerLabel })}
                  </button>
                )}

                {!available && (
                  <p className="mt-2 text-xs text-gray-500">{t('me.oauthProviderUnavailable')}</p>
                )}

                {linked && !canUnlink && (
                  <p className="mt-2 text-xs text-amber-300">
                    {oauthLinks?.hasPassword ? t('me.oauthCannotUnlinkLastMethod') : t('me.setPasswordToUnlinkLastOauth')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {user && user.role !== "company" && user.role !== "admin" && (
        <div className="mt-3 p-3 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-300">
          {t('me.publicIdeasUsage', { used: publicUsed, limit: FREE_PUBLIC_LIMIT })}
          {publicUsed >= FREE_PUBLIC_LIMIT && (
            <div className="mt-3 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-200 flex items-center justify-between">
              <div>
                {t('me.publicIdeasLimitExceeded')}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const el = document.getElementById("my-ideas");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="rounded-xl border border-red-700 px-3 py-2 text-sm bg-transparent"
                >
                  {t('me.manageIdeas')}
                </button>
                <a href="/company" className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold">{t('me.upgrade')}</a>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-gray-300 mt-6">{t('common.loading')}</p>}
      {err && <p className="text-red-400 mt-6">{t('common.error')}: {err}</p>}

      {/* ================= 我的 Ideas ================= */}
      <h2 id="my-ideas" className="text-xl font-semibold text-white mt-6">{t('me.myIdeas')}</h2>

      <div className="mt-3 grid gap-3">
        {localIdeas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{it.title}</h3>
              <span className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">{t('me.visibility')}: {t('me.privateLocal')}</p>
              <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">{t('me.localBadge')}</span>
            </div>
          </Link>
        ))}

        {ideas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{it.title}</h3>
              <span className="text-xs text-gray-500">
                {new Date(it.createdAt).toLocaleString()}
              </span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">{t('me.visibility')}: {it.visibility}</p>
              <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">{t('me.serverBadge')}</span>
            </div>
          </Link>
        ))}

        {!loading && ideas.length === 0 && (
          <p className="text-gray-400">{t('me.noIdeasYet')}</p>
        )}
      </div>

      {/* ================= My Likes ================= */}
      <h2 className="text-xl font-semibold text-white mt-10">{t('me.myLikes')}</h2>

      <div className="mt-3 grid gap-3">
        {likedIdeas.length === 0 && (
          <p className="text-gray-400">{t('me.noLikedIdeas')}</p>
        )}

        {likedIdeas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex justify-between">
              <span className="text-white font-semibold">{it.title}</span>
              <span className="text-xs text-gray-500">
                {it.author?.username || "unknown"}
              </span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
          </Link>
        ))}
      </div>

      {/* ================= My Bookmarks ================= */}
      <h2 className="text-xl font-semibold text-white mt-10">{t('me.myBookmarks')}</h2>

      <h3 className="text-lg font-semibold text-white mt-4">{t('me.bookmarkIdeas')}</h3>
      <div className="mt-3 grid gap-3">
        {bookmarkedIdeas.length === 0 && (
          <p className="text-gray-400">{t('me.noIdeaBookmarks')}</p>
        )}

        {bookmarkedIdeas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex justify-between">
              <span className="text-white font-semibold">{it.title}</span>
              <span className="text-xs text-gray-500">
                {it.author?.username || t('me.unknown')}
              </span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
          </Link>
        ))}
      </div>

      <h3 className="text-lg font-semibold text-white mt-6">{t('me.bookmarkLeaderboards')}</h3>
      <div className="mt-3 grid gap-3">
        {bookmarkedLeaderboards.length === 0 && (
          <p className="text-gray-400">{t('me.noLeaderboardBookmarks')}</p>
        )}

        {bookmarkedLeaderboards.map((lb) => (
          <Link
            key={lb._id}
            to={`/leaderboard/${lb._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex justify-between">
              <span className="text-white font-semibold">
                {lb.tags?.join(", ") || t('nav.tagRank')}
              </span>
              <span className="text-xs text-gray-500">
                {lb.author?.username || t('me.unknown')}
              </span>
            </div>
            <p className="text-gray-300 mt-1 text-sm">
              {lb.entries?.length || 0} {t('me.nominations')}
            </p>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-white mt-10">{t('me.receivedInterests')}</h2>
      <div className="mt-3 grid gap-3">
        {receivedInterests.length === 0 && (
          <p className="text-gray-400">{t('me.noCompanyInterests')}</p>
        )}

        {receivedInterests.map((r) => (
          <div key={r._id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <div className="text-white font-semibold">
                {t('me.ideaLabel')}: {r.idea?.title || t('me.unknown')}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="text-sm text-gray-300 mt-2">
              {t('me.companyLabel')}: <span className="text-white">{r.companyUser?.username}</span>{" "}
              <span className="text-gray-500">({r.companyUser?.email})</span>
            </div>

            {r.message && (
              <pre className="mt-2 text-gray-200 whitespace-pre-wrap font-sans">
                {r.message}
              </pre>
            )}
          </div>
        ))}
      </div>

    </div>
  );

}
