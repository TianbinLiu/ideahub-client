import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch, getUserReputation, voteUser, sendMessageRequest, type ReputationStats } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { useTranslation } from "react-i18next";

type UserCardProps = {
  userId: string;
  username: string;
  children: React.ReactNode;
};

type UserProfile = {
  _id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  role: string;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export function UserHoverCard({ userId, children }: UserCardProps) {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [reputation, setReputation] = useState<ReputationStats | null>(null);
  const [myVote, setMyVote] = useState<1 | -1 | null>(null);
  const [showDMModal, setShowDMModal] = useState(false);
  const [dmMessage, setDmMessage] = useState("");
  const [sendingDM, setSendingDM] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isOwnProfile = currentUser?._id === userId || (currentUser as any)?.id === userId;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function loadProfile() {
    if (profile || loading) return;
    setLoading(true);
    try {
      const [profileRes, reputationRes] = await Promise.all([
        apiFetch<{ ok: true; user: UserProfile }>(`/api/users/${userId}`),
        getUserReputation(userId).catch(() => ({ 
          stats: { likes: 0, dislikes: 0, badge: null }, 
          myVote: null 
        })),
      ]);
      setProfile(profileRes.user);
      setFollowing(profileRes.user.isFollowing);
      setReputation(reputationRes.stats);
      setMyVote(reputationRes.myVote);
    } catch (e) {
      console.error("Failed to load profile", e);
    } finally {
      setLoading(false);
    }
  }

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(true);
      loadProfile();
    }, 500);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }

  function handleCardEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function handleCardLeave() {
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentUser) {
      toast.error(t('profile.pleaseLoginToFollow'));
      return;
    }

    try {
      const res = await apiFetch<{ following: boolean }>(`/api/users/${userId}/follow`, {
        method: "POST",
      });
      setFollowing(res.following);
      if (profile) {
        setProfile({
          ...profile,
          followerCount: profile.followerCount + (res.following ? 1 : -1),
          isFollowing: res.following,
        });
      }
      toast.success(res.following ? t('profile.followed') : t('profile.unfollowed'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleVote(vote: 1 | -1) {
    if (!currentUser) {
      toast.error(t('profile.pleaseLoginToVote'));
      return;
    }

    try {
      const res = await voteUser(userId, vote);
      setReputation(res.stats);
      
      if (res.action === "removed") {
        setMyVote(null);
      } else {
        setMyVote(vote);
      }

      const messages = {
        voted: vote === 1 ? t('profile.votedLike') : t('profile.votedDislike'),
        removed: t('profile.voteRemoved'),
        updated: vote === 1 ? t('profile.changedToLike') : t('profile.changedToDislike'),
      };
      toast.success(messages[res.action]);
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleSendDM() {
    if (!currentUser) {
      toast.error(t('auth.pleaseLogin'));
      return;
    }

    if (dmMessage.trim().length === 0) {
      toast.error(t('messages.enterInitialMessage'));
      return;
    }

    setSendingDM(true);
    try {
      await sendMessageRequest(userId, dmMessage);
      toast.success(t('messages.requestSent'));
      setShowDMModal(false);
      setDmMessage("");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSendingDM(false);
    }
  }

  return (
    <div className="relative inline-block">
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer hover:underline"
      >
        {children}
      </span>

      {isOpen && (
        <div
          ref={cardRef}
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleCardLeave}
          className="absolute left-0 top-full mt-2 z-50 w-80 rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

          {!loading && profile && (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                    {profile.username[0].toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <Link
                    to={`/users/${userId}`}
                    className="font-semibold text-white hover:underline block truncate"
                  >
                    {profile.displayName || profile.username}
                  </Link>
                  <p className="text-sm text-gray-400">@{profile.username}</p>
                  
                  {/* Reputation Badge */}
                  {reputation?.badge === "popular" && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-green-900/30 border border-green-600 rounded text-xs text-green-400">
                      ⭐ {t('profile.popularUser')}
                    </span>
                  )}
                  {reputation?.badge === "malicious" && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-red-900/30 border border-red-600 rounded text-xs text-red-400">
                      ⚠️ {t('profile.maliciousUser')}
                    </span>
                  )}
                </div>
              </div>

              {profile.bio && (
                <p className="text-sm text-gray-300 line-clamp-3">{profile.bio}</p>
              )}

              {/* Reputation Stats */}
              {reputation && (reputation.likes > 0 || reputation.dislikes > 0) && (
                <div className="flex gap-3 text-xs text-gray-400">
                  <span>👍 {reputation.likes}</span>
                  <span>👎 {reputation.dislikes}</span>
                </div>
              )}

              <div className="flex gap-4 text-sm">
                <Link to={`/users/${userId}/following`} className="hover:underline">
                  <span className="font-semibold text-white">{profile.followingCount}</span>{" "}
                  <span className="text-gray-400">{t('profile.following')}</span>
                </Link>
                <Link to={`/users/${userId}/followers`} className="hover:underline">
                  <span className="font-semibold text-white">{profile.followerCount}</span>{" "}
                  <span className="text-gray-400">{t('profile.followers')}</span>
                </Link>
              </div>

              {!isOwnProfile && currentUser && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={toggleFollow}
                      className={`flex-1 rounded-lg px-4 py-2 font-semibold text-sm ${
                        following
                          ? "border border-gray-600 text-gray-200 hover:bg-gray-800"
                          : "bg-white text-black hover:bg-gray-200"
                      }`}
                    >
                      {following ? t('profile.following') : t('profile.follow')}
                    </button>
                    <button
                      onClick={() => setShowDMModal(true)}
                      className="flex-1 rounded-lg px-4 py-2 font-semibold text-sm border border-gray-600 text-gray-200 hover:bg-gray-800"
                    >
                      💬 {t('messages.directMessage')}
                    </button>
                  </div>

                  {/* Like/Dislike Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVote(1)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        myVote === 1
                          ? "bg-green-600 text-white"
                          : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      👍 {t('profile.like')}
                    </button>
                    <button
                      onClick={() => handleVote(-1)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        myVote === -1
                          ? "bg-red-600 text-white"
                          : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      👎 {t('profile.dislike')}
                    </button>
                  </div>
                </div>
              )}

              {isOwnProfile && (
                <div className="space-y-2">
                  <Link
                    to="/ideas/new"
                    className="block w-full text-center rounded-lg bg-white text-black px-4 py-2 font-semibold text-sm hover:bg-gray-200"
                  >
                    {t('home.newIdea')}
                  </Link>
                  <Link
                    to="/me"
                    className="block w-full text-center rounded-lg border border-gray-600 px-4 py-2 font-semibold text-sm text-gray-200 hover:bg-gray-800"
                  >
                    {t('profile.editProfile')}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DM Modal */}
      {showDMModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onClick={() => setShowDMModal(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-4">
              {t('messages.directMessage')} - {profile?.displayName || profile?.username}
            </h3>

            <textarea
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              placeholder={t('messages.initialMessagePlaceholder')}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 mb-4 focus:outline-none focus:border-blue-500 resize-none"
              rows={4}
            />

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDMModal(false)}
                className="rounded-lg px-4 py-2 border border-gray-600 text-gray-200 hover:bg-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSendDM}
                disabled={sendingDM || dmMessage.trim().length === 0}
                className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed"
              >
                {sendingDM ? t('common.sending') : t('messages.sendMessage')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
