import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type UserCardProps = {
  userId: string;
  username: string; // for fallback display before profile loads
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
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
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
      const res = await apiFetch<{ ok: true; user: UserProfile }>(`/api/users/${userId}`);
      setProfile(res.user);
      setFollowing(res.user.isFollowing);
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
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }

  async function toggleFollow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error("Please login to follow users");
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
      toast.success(res.following ? "Followed" : "Unfollowed");
    } catch (e: any) {
      toast.error(humanizeError(e));
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
          {loading && <p className="text-gray-400 text-sm">Loading...</p>}

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
                </div>
              </div>

              {profile.bio && (
                <p className="text-sm text-gray-300 line-clamp-3">{profile.bio}</p>
              )}

              <div className="flex gap-4 text-sm">
                <Link to={`/users/${userId}/following`} className="hover:underline">
                  <span className="font-semibold text-white">{profile.followingCount}</span>{" "}
                  <span className="text-gray-400">Following</span>
                </Link>
                <Link to={`/users/${userId}/followers`} className="hover:underline">
                  <span className="font-semibold text-white">{profile.followerCount}</span>{" "}
                  <span className="text-gray-400">Followers</span>
                </Link>
              </div>

              {!isOwnProfile && currentUser && (
                <button
                  onClick={toggleFollow}
                  className={`w-full rounded-lg px-4 py-2 font-semibold text-sm ${
                    following
                      ? "border border-gray-600 text-gray-200 hover:bg-gray-800"
                      : "bg-white text-black hover:bg-gray-200"
                  }`}
                >
                  {following ? "Following" : "Follow"}
                </button>
              )}

              {isOwnProfile && (
                <Link
                  to="/me"
                  className="block w-full text-center rounded-lg border border-gray-600 px-4 py-2 font-semibold text-sm text-gray-200 hover:bg-gray-800"
                >
                  Edit Profile
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
