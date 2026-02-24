import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { CharCount } from "../components/CharCount";

const LIMITS = {
  DISPLAY_NAME: 50,
  BIO: 500,
  AVATAR_URL: 500,
};

type UserProfile = {
  _id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  role: string;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

type Idea = {
  _id: string;
  title: string;
  summary: string;
  tags: string[];
  createdAt: string;
};

type Leaderboard = {
  _id: string;
  tags: string[];
  computedAt: string;
};

export default function UserProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<Idea[]>([]);
  const [bookmarkedLeaderboards, setBookmarkedLeaderboards] = useState<Leaderboard[]>([]);

  const [followers, setFollowers] = useState<any[]>([]);
  const [followingUsers, setFollowingUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"bookmarks" | "followers" | "following">("bookmarks");

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const userId = (currentUser as any)?._id || (currentUser as any)?.id;
  const isOwnProfile = userId === id;

  useEffect(() => {
    loadProfile();
    loadBookmarks();
    loadFollowers();
    loadFollowing();
  }, [id]);

  async function loadProfile() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: true; user: UserProfile }>(`/api/users/${id}`);
      setProfile(res.user);
      setFollowing(res.user.isFollowing);
      setDisplayName(res.user.displayName || "");
      setBio(res.user.bio || "");
      setAvatarUrl(res.user.avatarUrl || "");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadBookmarks() {
    if (!id) return;
    try {
      const res = await apiFetch<{ ok: true; ideas: Idea[]; leaderboards: Leaderboard[] }>(
        `/api/users/${id}/bookmarks`
      );
      setBookmarkedIdeas(res.ideas || []);
      setBookmarkedLeaderboards(res.leaderboards || []);
    } catch (e) {
      console.error("Failed to load bookmarks", e);
    }
  }

  async function loadFollowers() {
    if (!id) return;
    try {
      const res = await apiFetch<{ ok: true; followers: any[] }>(`/api/users/${id}/followers`);
      setFollowers(res.followers || []);
    } catch (e) {
      console.error("Failed to load followers", e);
    }
  }

  async function loadFollowing() {
    if (!id) return;
    try {
      const res = await apiFetch<{ ok: true; following: any[] }>(`/api/users/${id}/following`);
      setFollowingUsers(res.following || []);
    } catch (e) {
      console.error("Failed to load following", e);
    }
  }

  async function toggleFollow() {
    if (!currentUser) {
      toast.error("Please login to follow users");
      return;
    }

    try {
      const res = await apiFetch<{ following: boolean }>(`/api/users/${id}/follow`, {
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
      loadFollowers();
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: true; user: UserProfile }>("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName, bio, avatarUrl }),
      });
      setProfile(res.user);
      setEditing(false);
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    if (profile) {
      setDisplayName(profile.displayName || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatarUrl || "");
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-red-400">User not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Profile Header */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div>
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-white text-3xl font-bold">
                {profile.username[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">
              {profile.displayName || profile.username}
            </h1>
            <p className="text-gray-400">@{profile.username}</p>
            {profile.bio && <p className="mt-2 text-gray-300">{profile.bio}</p>}

            <div className="flex gap-4 mt-3 text-sm">
              <button
                onClick={() => setActiveTab("following")}
                className="hover:underline"
              >
                <span className="font-semibold text-white">{profile.followingCount}</span>{" "}
                <span className="text-gray-400">Following</span>
              </button>
              <button
                onClick={() => setActiveTab("followers")}
                className="hover:underline"
              >
                <span className="font-semibold text-white">{profile.followerCount}</span>{" "}
                <span className="text-gray-400">Followers</span>
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              {isOwnProfile ? (
                <button
                  onClick={() => setEditing(!editing)}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                >
                  {editing ? "Cancel Edit" : "Edit Profile"}
                </button>
              ) : currentUser ? (
                <button
                  onClick={toggleFollow}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    following
                      ? "border border-gray-600 text-gray-200 hover:bg-gray-800"
                      : "bg-white text-black hover:bg-gray-200"
                  }`}
                >
                  {following ? "Following" : "Follow"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Edit Form */}
        {editing && isOwnProfile && (
          <div className="mt-6 pt-6 border-t border-gray-800 grid gap-3">
            <div>
              <input
                className="w-full rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={LIMITS.DISPLAY_NAME}
              />
              <CharCount current={displayName.length} max={LIMITS.DISPLAY_NAME} className="mt-1" />
            </div>

            <div>
              <textarea
                className="w-full rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[100px]"
                placeholder="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={LIMITS.BIO}
              />
              <CharCount current={bio.length} max={LIMITS.BIO} className="mt-1" />
            </div>

            <div>
              <input
                className="w-full rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"
                placeholder="Avatar URL"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                maxLength={LIMITS.AVATAR_URL}
              />
              <CharCount current={avatarUrl.length} max={LIMITS.AVATAR_URL} className="mt-1" />
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="rounded-lg bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                className="rounded-lg border border-gray-600 px-4 py-2 text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 border-b border-gray-800">
        <button
          onClick={() => setActiveTab("bookmarks")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "bookmarks"
              ? "text-white border-b-2 border-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Bookmarks
        </button>
        <button
          onClick={() => setActiveTab("followers")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "followers"
              ? "text-white border-b-2 border-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Followers
        </button>
        <button
          onClick={() => setActiveTab("following")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "following"
              ? "text-white border-b-2 border-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Following
        </button>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === "bookmarks" && (
          <div className="space-y-6">
            {/* Ideas */}
            {bookmarkedIdeas.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Ideas</h3>
                <div className="grid gap-3">
                  {bookmarkedIdeas.map((idea) => (
                    <Link
                      key={idea._id}
                      to={`/ideas/${idea._id}`}
                      className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
                    >
                      <h4 className="font-semibold text-white">{idea.title}</h4>
                      <p className="text-sm text-gray-400 mt-1">{idea.summary}</p>
                      <div className="flex gap-2 mt-2">
                        {idea.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboards */}
            {bookmarkedLeaderboards.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Leaderboards</h3>
                <div className="grid gap-3">
                  {bookmarkedLeaderboards.map((board) => (
                    <Link
                      key={board._id}
                      to={`/tag-rank/leaderboard/${board._id}`}
                      className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
                    >
                      <div className="flex gap-2">
                        {board.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-sm bg-gray-800 text-gray-300 px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {bookmarkedIdeas.length === 0 && bookmarkedLeaderboards.length === 0 && (
              <p className="text-gray-400">No bookmarks yet</p>
            )}
          </div>
        )}

        {activeTab === "followers" && (
          <div className="grid gap-3">
            {followers.length === 0 && <p className="text-gray-400">No followers yet</p>}
            {followers.map((follower) => (
              <Link
                key={follower._id}
                to={`/users/${follower._id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
              >
                {follower.avatarUrl ? (
                  <img
                    src={follower.avatarUrl}
                    alt={follower.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                    {follower.username[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-white">
                    {follower.displayName || follower.username}
                  </p>
                  <p className="text-sm text-gray-400">@{follower.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {activeTab === "following" && (
          <div className="grid gap-3">
            {followingUsers.length === 0 && <p className="text-gray-400">Not following anyone yet</p>}
            {followingUsers.map((user) => (
              <Link
                key={user._id}
                to={`/users/${user._id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                    {user.username[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-white">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-sm text-gray-400">@{user.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
