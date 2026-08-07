import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router";
import { apiFetch, blockDmUser, getDmBlockStatus, getUserReputation, listUserGroupReferrals, searchUsers, sendMessageRequest, unblockDmUser, voteUser, type GroupReferral, type ReputationStats } from "../api";
import { useAuth } from "../authContext";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { CharCount } from "../components/CharCount";
import { listLocalIdeas } from "../utils/localIdeas";

const LIMITS = {
  DISPLAY_NAME: 50,
  BIO: 500,
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
  ideaType?: "business" | "feedback" | "external" | "daily" | "dynamic";
  groupSlug?: string;
  groupName?: string;
  visibility?: string;
  createdAt: string;
  author?: { username: string; role: string; _id: string };
};

type Leaderboard = {
  _id: string;
  tags: string[];
  computedAt: string;
  entries?: any[];
  author?: { username: string; role: string; _id: string };
};

type UserLeaderboard = {
  _id: string;
  tags?: string[];
  tagsKey?: string;
  computedAt?: string;
  entriesCount?: number;
  postsCount?: number;
};

type Interest = {
  _id: string;
  createdAt: string;
  message: string;
  idea?: { _id: string; title: string };
  companyUser?: { username: string; email: string };
};

type TabType = "home" | "ideas" | "dynamics" | "bookmarks" | "likes" | "leaderboards" | "followers" | "following" | "interests" | "groupReferrals";

const OWN_PROFILE_TABS: TabType[] = ["home", "ideas", "dynamics", "bookmarks", "likes", "leaderboards", "followers", "following", "interests", "groupReferrals"];
const PUBLIC_PROFILE_TABS: TabType[] = ["home", "ideas", "dynamics", "bookmarks", "leaderboards", "followers", "following"];

function resolveInitialTab(tab: string | null, isOwnProfile: boolean): TabType {
  const allowedTabs = isOwnProfile ? OWN_PROFILE_TABS : PUBLIC_PROFILE_TABS;
  if (tab && allowedTabs.includes(tab as TabType)) {
    return tab as TabType;
  }
  return "home";
}

export default function UserProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [reputation, setReputation] = useState<ReputationStats | null>(null);
  const [myVote, setMyVote] = useState<1 | -1 | null>(null);
  const [showDMModal, setShowDMModal] = useState(false);
  const [dmMessage, setDmMessage] = useState("");
  const [sendingDM, setSendingDM] = useState(false);
  const [dmBlocked, setDmBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<Idea[]>([]);
  const [bookmarkedLeaderboards, setBookmarkedLeaderboards] = useState<Leaderboard[]>([]);
  const [userLeaderboards, setUserLeaderboards] = useState<UserLeaderboard[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [followingUsers, setFollowingUsers] = useState<any[]>([]);
  
  // My content (only for own profile)
  const [myIdeas, setMyIdeas] = useState<Idea[]>([]);
  const [profileIdeas, setProfileIdeas] = useState<Idea[]>([]);
  const [localIdeas, setLocalIdeas] = useState<any[]>([]);
  const [likedIdeas, setLikedIdeas] = useState<Idea[]>([]);
  const [receivedInterests, setReceivedInterests] = useState<Interest[]>([]);
  const [groupReferrals, setGroupReferrals] = useState<GroupReferral[]>([]);
  const [publicUsed, setPublicUsed] = useState(0);

  const [activeTab, setActiveTab] = useState<TabType>("home");

  // Search and mutual following
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserFollowing, setCurrentUserFollowing] = useState<any[]>([]);
  
  // Global user search
  const [searchUsersQuery, setSearchUsersQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // 竞态守卫：每次 effect 重跑（含鉴权异步就绪或切换用户）自增，加载完成时比对，丢弃陈旧响应
  const loadSeqRef = useRef(0);
  // 记录已用于初始化 tab 的 (用户id + URL tab 参数)，避免鉴权就绪时误重置用户已选 tab
  const tabInitRef = useRef<string | null>(null);

  const userId = (currentUser as any)?._id || (currentUser as any)?.id;
  const isOwnProfile = userId === id;
  const FREE_PUBLIC_LIMIT = Number((import.meta as any).env?.VITE_FREE_PUBLIC_IDEA_LIMIT) || 5;

  useEffect(() => {
    // 本次运行的请求序号；后续各 loader 以此做竞态守卫
    loadSeqRef.current += 1;

    // 仅在切换用户或 URL tab 参数变化时重置已选 tab；
    // 鉴权异步就绪(isOwnProfile undefined→true)导致 effect 重跑时不再重置，保留用户手动选择
    const tabParam = searchParams.get("tab");
    const tabKey = `${id ?? ""}::${tabParam ?? ""}`;
    if (tabInitRef.current !== tabKey) {
      tabInitRef.current = tabKey;
      setActiveTab(resolveInitialTab(tabParam, isOwnProfile));
    }

    loadProfile();
    loadBookmarks();
    loadUserLeaderboards();
    loadFollowers();
    loadFollowing();
    loadProfileIdeas();
    
    // Load current user's following list for mutual following comparison
    if (userId && !isOwnProfile) {
      loadCurrentUserFollowing();
    }
    
    if (isOwnProfile) {
      loadMyIdeas();
      loadLikes();
      loadReceivedInterests();
      loadGroupReferrals();
      setLocalIdeas(listLocalIdeas());
    }
  }, [id, isOwnProfile, userId, searchParams]);

  const combinedOwnIdeas = useMemo(
    () => [...localIdeas, ...myIdeas].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [localIdeas, myIdeas]
  );

  const visibleIdeas = useMemo(() => (isOwnProfile ? combinedOwnIdeas : profileIdeas), [combinedOwnIdeas, isOwnProfile, profileIdeas]);
  const dynamicIdeas = useMemo(
    () => visibleIdeas.filter((idea) => idea.ideaType === "dynamic"),
    [visibleIdeas]
  );

  async function loadProfile() {
    if (!id) return;
    const seq = loadSeqRef.current; // 记录本次请求序号，用于竞态守卫
    setLoading(true);
    try {
      const [profileRes, reputationRes] = await Promise.all([
        apiFetch<{ ok: true; user: UserProfile }>(`/api/users/${id}`),
        getUserReputation(id).catch(() => ({
          stats: { likes: 0, dislikes: 0, badge: null },
          myVote: null
        })),
      ]);
      if (seq !== loadSeqRef.current) return; // 陈旧响应，丢弃避免覆盖新数据
      setProfile(profileRes.user);
      setFollowing(profileRes.user.isFollowing);
      setDisplayName(profileRes.user.displayName || "");
      setBio(profileRes.user.bio || "");
      setReputation(reputationRes.stats);
      setMyVote(reputationRes.myVote);

      if (!isOwnProfile && currentUser && id) {
        const blockRes = await getDmBlockStatus(id).catch(() => ({ blocked: false } as any));
        if (seq !== loadSeqRef.current) return; // 陈旧响应，丢弃
        setDmBlocked(!!(blockRes as any).blocked);
      }
    } catch (e: any) {
      if (seq !== loadSeqRef.current) return; // 陈旧的失败响应不应清掉新用户的 profile
      // Set profile to null to show the "user not found" message
      setProfile(null);
      // Show error toast for better feedback
      if ((e as any).code === 'USER_NOT_FOUND') {
        toast.error(t('profile.userDeletedOrNotFound'));
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false); // 仅最新请求可结束 loading，避免陈旧响应提前清除
    }
  }

  async function loadBookmarks() {
    if (!id) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ok: true; ideas: Idea[]; leaderboards: Leaderboard[] }>(
        `/api/users/${id}/bookmarks`
      );
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setBookmarkedIdeas(res.ideas || []);
      setBookmarkedLeaderboards(res.leaderboards || []);
    } catch (e) {
      console.error("Failed to load bookmarks", e);
    }
  }

  async function loadUserLeaderboards() {
    if (!id) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ok: true; items: UserLeaderboard[] }>(
        `/api/users/${id}/leaderboards?limit=50`
      );
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setUserLeaderboards(res.items || []);
    } catch (e) {
      console.error("Failed to load user leaderboards", e);
    }
  }

  async function loadFollowers() {
    if (!id) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ok: true; followers: any[] }>(`/api/users/${id}/followers`);
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setFollowers(res.followers || []);
    } catch (e) {
      console.error("Failed to load followers", e);
    }
  }

  async function loadFollowing() {
    if (!id) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ok: true; following: any[] }>(`/api/users/${id}/following`);
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setFollowingUsers(res.following || []);
    } catch (e) {
      console.error("Failed to load following", e);
    }
  }

  async function loadCurrentUserFollowing() {
    if (!userId) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ok: true; following: any[] }>(`/api/users/${userId}/following`);
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setCurrentUserFollowing(res.following || []);
    } catch (e) {
      console.error("Failed to load current user following", e);
    }
  }

  async function handleSearchUsers(query: string) {
    setSearchUsersQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const res = await searchUsers(query, 10);
      setSearchResults(res.users || []);
    } catch (e) {
      console.error("Failed to search users", e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  async function loadMyIdeas() {
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ideas: Idea[] }>("/api/ideas/mine");
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setMyIdeas(res.ideas || []);
      const used = (res.ideas || []).filter((i) => i.visibility === "public").length;
      setPublicUsed(used);
    } catch (e) {
      console.error("Failed to load my ideas", e);
    }
  }

  async function loadProfileIdeas() {
    if (!id) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ideas: Idea[] }>(`/api/users/${id}/ideas`);
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setProfileIdeas(res.ideas || []);
    } catch (e) {
      console.error("Failed to load profile ideas", e);
      if (seq !== loadSeqRef.current) return; // 陈旧失败不应清掉新用户的数据
      setProfileIdeas([]);
    }
  }

  async function loadLikes() {
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ ideas: Idea[] }>("/api/me/likes");
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setLikedIdeas(res.ideas || []);
    } catch (e) {
      console.error("Failed to load likes", e);
    }
  }

  async function loadReceivedInterests() {
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await apiFetch<{ interests: Interest[] }>("/api/me/received-interests");
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setReceivedInterests(res.interests || []);
    } catch (e) {
      console.error("Failed to load interests", e);
    }
  }

  async function loadGroupReferrals() {
    if (!id) return;
    const seq = loadSeqRef.current; // 竞态守卫
    try {
      const res = await listUserGroupReferrals(id);
      if (seq !== loadSeqRef.current) return; // 丢弃陈旧响应
      setGroupReferrals(res.referrals || []);
    } catch (e) {
      console.error("Failed to load group referrals", e);
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

  async function handleVote(vote: 1 | -1) {
    if (!currentUser) {
      toast.error(t('profile.pleaseLoginToVote'));
      return;
    }

    try {
      const res = await voteUser(id!, vote);
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

    if (dmBlocked) {
      toast.error(t('messages.blockedByMeHint'));
      return;
    }

    setSendingDM(true);
    try {
      const res = await sendMessageRequest(id!, dmMessage);
      toast.success(res.direct ? t('messages.messageSent') : t('messages.requestSent'));
      setShowDMModal(false);
      setDmMessage("");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSendingDM(false);
    }
  }

  async function handleToggleBlockDm() {
    if (!currentUser || !id || isOwnProfile) return;
    setBlockLoading(true);
    try {
      if (dmBlocked) {
        await unblockDmUser(id);
        setDmBlocked(false);
        toast.success(t('messages.unblockedUser'));
      } else {
        await blockDmUser(id);
        setDmBlocked(true);
        toast.success(t('messages.blockedUser'));
        navigate('/blacklist');
        return;
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setBlockLoading(false);
    }
  }

  async function handleAvatarClick() {
    if (isOwnProfile && avatarInputRef.current) {
      avatarInputRef.current.click();
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only image files are allowed (jpeg, jpg, png, gif, webp)');
      return;
    }

    // 验证文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const data = await apiFetch<{ ok: true; user: UserProfile }>("/api/me/avatar", {
        method: "POST",
        body: formData,
      });
      setProfile(data.user);
      toast.success('Avatar updated successfully');
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploadingAvatar(false);
      // 重置input以允许上传相同文件
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: true; user: UserProfile }>("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName, bio }),
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
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-red-400">{t('profile.userNotFound')}</p>
      </div>
    );
  }

  // Define available tabs based on whether viewing own profile
  const availableTabs: { key: TabType; label: string }[] = isOwnProfile
    ? [
        { key: "home", label: t('profile.home') },
        { key: "ideas", label: t('profile.myIdeas') },
        { key: "dynamics", label: t('profile.dynamics') },
        { key: "leaderboards", label: t('profile.myLeaderboards') },
        { key: "bookmarks", label: t('profile.bookmarks') },
        { key: "likes", label: t('profile.likes') },
        { key: "interests", label: t('profile.receivedInterests') },
        { key: "groupReferrals", label: t('userProfile.circleInvitations') },
        { key: "followers", label: t('profile.followers') },
        { key: "following", label: t('profile.following') },
      ]
    : [
        { key: "home", label: t('profile.home') },
        { key: "ideas", label: t('profile.ideas') },
        { key: "dynamics", label: t('profile.dynamics') },
        { key: "bookmarks", label: t('profile.bookmarks') },
        { key: "leaderboards", label: t('profile.leaderboards') },
        { key: "followers", label: t('profile.followers') },
        { key: "following", label: t('profile.following') },
      ];

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Global User Search */}
      <div className="mb-6 relative">
        <input
          type="text"
          placeholder={t('profile.searchUsers')}
          value={searchUsersQuery}
          onChange={(e) => handleSearchUsers(e.target.value)}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {isSearching && (
          <div className="absolute right-3 top-2.5 text-gray-400 text-sm">{t('common.loading')}</div>
        )}

        {/* Search Results Dropdown */}
        {searchUsersQuery.trim() && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-40">
            <div className="max-h-96 overflow-y-auto p-2">
              {searchResults.map((user) => (
                <Link
                  key={user._id}
                  to={`/users/${user._id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                  onClick={() => {
                    setSearchUsersQuery("");
                    setSearchResults([]);
                  }}
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm">
                      {user.username[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-white font-semibold">{user.displayName || user.username}</p>
                    <p className="text-xs text-gray-400">@{user.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {searchUsersQuery.trim() && searchResults.length === 0 && !isSearching && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-40">
            <div className="p-4 text-center text-gray-400 text-sm">
              {t('profile.noUsersFound')}
            </div>
          </div>
        )}
      </div>

      {/* Profile Header */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-start gap-6 relative">
          {/* Direct Message Button - Top Right */}
          {!isOwnProfile && currentUser && (
            <button
              onClick={() => setShowDMModal(true)}
              disabled={dmBlocked}
              className="absolute top-0 right-0 rounded-lg px-4 py-2 text-sm font-semibold border border-gray-600 text-gray-200 hover:bg-gray-800 flex items-center gap-2"
            >
              💬 {t('messages.directMessage')}
            </button>
          )}
          {/* Avatar */}
          <div className="relative">
            <div
              onClick={handleAvatarClick}
              className={`relative ${isOwnProfile ? 'cursor-pointer group' : ''}`}
              title={isOwnProfile ? t('profile.clickToChangeAvatar') : ''}
            >
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
              
              {/* Upload overlay */}
              {isOwnProfile && (
                <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? t('profile.uploading') : t('profile.change')}
                  </span>
                </div>
              )}
            </div>
            
            {/* Hidden file input */}
            {isOwnProfile && (
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
                disabled={uploadingAvatar}
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">
              {profile.displayName || profile.username}
            </h1>
            <p className="text-gray-400">@{profile.username}</p>
            {isOwnProfile && currentUser?.email && (
              <p className="text-gray-500 text-sm mt-1">{currentUser.email}</p>
            )}
            {profile.bio && <p className="mt-2 text-gray-300">{profile.bio}</p>}

            <div className="flex gap-4 mt-3 text-sm">
              <button
                onClick={() => {
                  setActiveTab("following");
                  setSearchQuery("");
                }}
                className="hover:underline"
              >
                <span className="font-semibold text-white">{profile.followingCount}</span> <span className="text-gray-400">{t('profile.following')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("followers");
                  setSearchQuery("");
                }}
                className="hover:underline"
              >
                <span className="font-semibold text-white">{profile.followerCount}</span> <span className="text-gray-400">{t('profile.followers')}</span>
              </button>
            </div>

            {/* Reputation Stats */}
            {reputation && (reputation.likes > 0 || reputation.dislikes > 0) && (
              <div className="flex gap-4 mt-3 text-sm text-gray-400">
                <span>👍 <span className="font-semibold text-white">{reputation.likes}</span></span>
                <span>👎 <span className="font-semibold text-white">{reputation.dislikes}</span></span>
                {reputation.badge === "popular" && (
                  <span className="text-green-400">⭐ {t('profile.popularUser')}</span>
                )}
                {reputation.badge === "malicious" && (
                  <span className="text-red-400">⚠️ {t('profile.maliciousUser')}</span>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              {isOwnProfile ? (
                <>
                  <button
                    onClick={() => setEditing(!editing)}
                    className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                  >
                    {editing ? t('profile.cancelEdit') : t('profile.editProfile')}
                  </button>
                  <Link
                    to="/settings"
                    className="rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-900/20"
                  >
                    {t('settings.button')}
                  </Link>
                </>
              ) : currentUser ? (
                <>
                  <button
                    onClick={toggleFollow}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      following
                        ? "border border-gray-600 text-gray-200 hover:bg-gray-800"
                        : "bg-white text-black hover:bg-gray-200"
                    }`}
                  >
                    {following ? t('profile.following') : t('profile.follow')}
                  </button>

                  {/* Like/Dislike Buttons */}
                  <button
                    onClick={() => handleVote(1)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      myVote === 1
                        ? "bg-green-600 text-white"
                        : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    👍 {t('profile.like')}
                  </button>
                  <button
                    onClick={() => handleVote(-1)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      myVote === -1
                        ? "bg-red-600 text-white"
                        : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    👎 {t('profile.dislike')}
                  </button>

                  <button
                    onClick={handleToggleBlockDm}
                    disabled={blockLoading}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      dmBlocked
                        ? "border border-red-600 text-red-300 hover:bg-red-900/20"
                        : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                    } disabled:bg-gray-700 disabled:cursor-not-allowed`}
                  >
                    {blockLoading
                      ? t('common.loading')
                      : dmBlocked
                        ? t('messages.unblockDm')
                        : t('messages.blockDm')}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Public Idea Limit Warning (only for own profile) */}
        {isOwnProfile && currentUser && currentUser.role !== "company" && currentUser.role !== "admin" && (
          <div className="mt-4 p-3 rounded-xl bg-gray-950/50 border border-gray-800 text-sm text-gray-300">
            {t('profile.publicIdeas')}: <span className="text-white font-semibold">{publicUsed}</span> / <span className="text-white font-semibold">{FREE_PUBLIC_LIMIT}</span>
            {publicUsed >= FREE_PUBLIC_LIMIT && (
              <div className="mt-3 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-200">
                <div>{t('profile.publicLimitWarning')}</div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setActiveTab("ideas")}
                    className="rounded-xl border border-red-700 px-3 py-2 text-sm bg-transparent"
                  >
                    Manage ideas
                  </button>
                  <a href="/company" className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold">
                    Upgrade
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit Form */}
        {editing && isOwnProfile && (
          <div className="mt-6 pt-6 border-t border-gray-800 grid gap-3">
            <div>
              <input
                className="w-full rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"
                placeholder={t('profile.displayName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={LIMITS.DISPLAY_NAME}
              />
              <CharCount current={displayName.length} max={LIMITS.DISPLAY_NAME} className="mt-1" />
            </div>

            <div>
              <textarea
                className="w-full rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[100px]"
                placeholder={t('profile.bio')}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={LIMITS.BIO}
              />
              <CharCount current={bio.length} max={LIMITS.BIO} className="mt-1" />
            </div>

            <div className="text-sm text-gray-400">
              💡 Tip: Click on your avatar above to change your profile picture
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="rounded-lg bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {saving ? t('profile.saving') : t('profile.save')}
              </button>
              <button
                onClick={cancelEdit}
                className="rounded-lg border border-gray-600 px-4 py-2 text-gray-200"
              >
                {t('profile.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 border-b border-gray-800 overflow-x-auto no-scrollbar">
        {availableTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-semibold whitespace-nowrap ${
              activeTab === tab.key
                ? "text-white border-b-2 border-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-4">{renderTabContent()}</div>

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

  function renderTabContent() {
    switch (activeTab) {
      case "home":
        return renderProfileHome();
      case "ideas":
        return renderMyIdeas();
      case "dynamics":
        return renderDynamics();
      case "bookmarks":
        return renderBookmarks();
      case "likes":
        return renderLikes();
      case "leaderboards":
        return renderMyLeaderboards();
      case "followers":
        return renderFollowers();
      case "following":
        return renderFollowing();
      case "interests":
        return renderReceivedInterests();
      case "groupReferrals":
        return renderGroupReferrals();
      default:
        return null;
    }
  }

  function renderProfileHome() {
    const sections: Array<{ key: TabType; title: string; items: any[]; empty: string; renderer: (item: any) => React.ReactNode }> = [
      {
        key: "ideas",
        title: isOwnProfile ? t('profile.myIdeas') : t('profile.ideas'),
        items: visibleIdeas,
        empty: t('profile.noIdeasYet'),
        renderer: (idea: Idea) => renderIdeaCard(idea),
      },
      {
        key: "leaderboards",
        title: isOwnProfile ? t('profile.myLeaderboards') : t('profile.leaderboards'),
        items: userLeaderboards,
        empty: t('profile.noLeaderboardsYet'),
        renderer: (board: UserLeaderboard) => renderUserLeaderboardCard(board),
      },
      {
        key: "bookmarks",
        title: t('profile.bookmarks'),
        items: [
          ...bookmarkedIdeas.map((idea) => ({ kind: "idea" as const, item: idea })),
          ...bookmarkedLeaderboards.map((board) => ({ kind: "leaderboard" as const, item: board })),
        ],
        empty: t('profile.noBookmarksYet'),
        renderer: (entry: { kind: "idea" | "leaderboard"; item: Idea | UserLeaderboard | Leaderboard }) =>
          entry.kind === "idea"
            ? renderIdeaCard(entry.item as Idea)
            : renderLeaderboardBookmarkCard(entry.item as Leaderboard),
      },
    ];

    if (isOwnProfile) {
      sections.push({
        key: "likes",
        title: t('profile.likes'),
        items: likedIdeas,
        empty: t('profile.noLikedIdeasYet'),
        renderer: (idea: Idea) => renderIdeaCard(idea),
      });
    }

    return (
      <div className="space-y-6">
        {sections.map((section) => {
          const preview = section.items.slice(0, 8);
          return (
            <section key={section.key} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab(section.key)}
                  className="rounded-full border border-gray-700 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800"
                >
                  {t('profile.viewAll')}
                </button>
              </div>
              {preview.length === 0 ? (
                <p className="text-sm text-gray-400">{section.empty}</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{preview.map((item) => section.renderer(item))}</div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  function renderDynamics() {
    return renderIdeaGrid(dynamicIdeas, t('profile.noDynamicsYet'));
  }

  function renderMyIdeas() {
    return renderIdeaGrid(visibleIdeas, t('profile.noIdeasYet'));
  }

  function renderGroupReferrals() {
    return (
      <div className="grid gap-3">
        {groupReferrals.length === 0 ? <p className="text-gray-400">{t('userProfile.noCircleReferralsYet')}</p> : null}
        {groupReferrals.map((referral) => (
          <div key={referral._id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-white">{referral.invitee?.displayName || referral.invitee?.username || t('userProfile.user')}</div>
                <div className="mt-1 text-sm text-gray-400">{t('userProfile.joinedCircle', { slug: referral.groupSlug })}</div>
              </div>
              <div className="text-xs text-gray-500">{referral.createdAt ? new Date(referral.createdAt).toLocaleString() : ""}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderIdeaGrid(items: Idea[], emptyText: string) {
    return (
      <div className="grid gap-3">
        {items.length === 0 && <p className="text-gray-400">{emptyText}</p>}
        {items.map((idea) => renderIdeaCard(idea))}
      </div>
    );
  }

  function renderIdeaCard(idea: Idea) {
    const isLocalIdea = !idea.author && idea.visibility === "private";
    return (
      <Link
        key={idea._id}
        to={`/ideas/${idea._id}`}
        className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-white font-semibold">{idea.title}</h3>
          <span className="text-xs text-gray-500">{new Date(idea.createdAt).toLocaleString()}</span>
        </div>
        {idea.summary && <p className="mt-1 text-sm text-gray-300">{idea.summary}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          {idea.ideaType ? (
            <span className="rounded-full border border-cyan-700/60 px-2 py-1 text-cyan-200">{t(`idea.createMode${idea.ideaType.charAt(0).toUpperCase()}${idea.ideaType.slice(1)}Title`)}</span>
          ) : null}
          {idea.groupName || idea.groupSlug ? (
            <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">#{idea.groupName || idea.groupSlug}</span>
          ) : null}
          <span className="ml-auto rounded-full border border-gray-700 px-2 py-1 text-gray-300">
            {isLocalIdea ? t('profile.local') : t('profile.server')}
          </span>
        </div>
      </Link>
    );
  }

  function renderUserLeaderboardCard(board: UserLeaderboard) {
    return (
      <Link
        key={board._id}
        to={`/leaderboard/${board._id}`}
        className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
      >
        <div className="flex flex-wrap gap-2">
          {board.tags && board.tags.length > 0 ? board.tags.map((tag) => (
            <span key={tag} className="rounded bg-gray-800 px-2 py-1 text-sm text-gray-300">{tag}</span>
          )) : <span className="text-sm text-gray-400">{t('profile.noTags')}</span>}
        </div>
        <p className="mt-2 text-sm text-gray-400">
          {t('profile.entries')}: {board.entriesCount || 0} · {t('profile.nominations')}: {board.postsCount || 0}
        </p>
      </Link>
    );
  }

  function renderLeaderboardBookmarkCard(board: Leaderboard) {
    return (
      <Link
        key={board._id}
        to={`/leaderboard/${board._id}`}
        className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
      >
        <div className="flex flex-wrap gap-2">
          {(board.tags || []).map((tag) => (
            <span key={tag} className="rounded bg-gray-800 px-2 py-1 text-sm text-gray-300">{tag}</span>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-400">{board.entries?.length || 0} {t('profile.nominations')}</p>
      </Link>
    );
  }

  function renderBookmarks() {
    return (
      <div className="space-y-6">
        {/* Ideas */}
        {bookmarkedIdeas.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">{t('profile.ideas')}</h3>
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
            <h3 className="text-lg font-semibold text-white mb-3">{t('profile.leaderboards')}</h3>
            <div className="grid gap-3">
              {bookmarkedLeaderboards.map((board) => (
                <Link
                  key={board._id}
                  to={`/leaderboard/${board._id}`}
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
                  <p className="text-gray-400 text-sm mt-2">
                    {board.entries?.length || 0} {t('profile.nominations')}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {bookmarkedIdeas.length === 0 && bookmarkedLeaderboards.length === 0 && (
          <p className="text-gray-400">{t('profile.noBookmarksYet')}</p>
        )}
      </div>
    );
  }

  function renderLikes() {
    if (!isOwnProfile) return null;

    return (
      <div className="grid gap-3">
        {likedIdeas.length === 0 && <p className="text-gray-400">{t('profile.noLikedIdeasYet')}</p>}
        {likedIdeas.map((idea) => (
          <Link
            key={idea._id}
            to={`/ideas/${idea._id}`}
            className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <span className="text-white font-semibold">{idea.title}</span>
                {idea.summary && <p className="text-gray-300 mt-1">{idea.summary}</p>}
              </div>
              <span className="text-xs text-gray-500 ml-4">{idea.author?.username || t('profile.unknown')}</span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  function renderMyLeaderboards() {
    return (
      <div className="grid gap-3">
        {userLeaderboards.length === 0 && (
          <p className="text-gray-400">{t('profile.noLeaderboardsYet')}</p>
        )}
        {userLeaderboards.map((b) => (
          <Link
            key={b._id}
            to={`/leaderboard/${b._id}`}
            className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700"
          >
            <div className="flex flex-wrap gap-2">
              {b.tags && b.tags.length > 0 ? (
                b.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm bg-gray-800 text-gray-300 px-2 py-1 rounded"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-400">{t('profile.noTags')}</span>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-2">
              {t('profile.entries')}: {b.entriesCount || 0} · {t('profile.nominations')}: {b.postsCount || 0}
            </p>
          </Link>
        ))}
      </div>
    );
  }

  function renderFollowers() {
    const filtered = followers.filter(
      (f) =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.displayName && f.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Sort: mutual followers first if viewing other's followers
    let sorted = filtered;
    if (!isOwnProfile && currentUserFollowing.length > 0) {
      const mutualIds = new Set(currentUserFollowing.map((u) => u._id));
      sorted = filtered.sort((a, b) => {
        const aIsMutual = mutualIds.has(a._id);
        const bIsMutual = mutualIds.has(b._id);
        return aIsMutual === bIsMutual ? 0 : aIsMutual ? -1 : 1;
      });
    }

    return (
      <div>
        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder={t('profile.searchFollowers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid gap-3">
          {sorted.length === 0 && <p className="text-gray-400">{searchQuery ? t('profile.noFollowersFound') : t('profile.noFollowersYet')}</p>}
          {sorted.map((follower) => {
            const isMutual =
              !isOwnProfile &&
              currentUserFollowing.some((u) => u._id === follower._id);
            return (
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
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">
                      {follower.displayName || follower.username}
                    </p>
                    {isMutual && (
                      <span className="text-xs bg-blue-900/30 border border-blue-600 text-blue-300 px-2 py-0.5 rounded">
                        {t('profile.mutualFollowing')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">@{follower.username}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  function renderFollowing() {
    const filtered = followingUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Sort: mutual following first if viewing other's following
    let sorted = filtered;
    if (!isOwnProfile && currentUserFollowing.length > 0) {
      const mutualIds = new Set(currentUserFollowing.map((u) => u._id));
      sorted = filtered.sort((a, b) => {
        const aIsMutual = mutualIds.has(a._id);
        const bIsMutual = mutualIds.has(b._id);
        return aIsMutual === bIsMutual ? 0 : aIsMutual ? -1 : 1;
      });
    }

    return (
      <div>
        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder={t('profile.searchFollowing')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid gap-3">
          {sorted.length === 0 && <p className="text-gray-400">{searchQuery ? t('profile.noFollowingFound') : t('profile.notFollowingAnyoneYet')}</p>}
          {sorted.map((user) => {
            const isMutual =
              !isOwnProfile &&
              currentUserFollowing.some((u) => u._id === user._id);
            return (
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
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{user.displayName || user.username}</p>
                    {isMutual && (
                      <span className="text-xs bg-blue-900/30 border border-blue-600 text-blue-300 px-2 py-0.5 rounded">
                        {t('profile.mutualFollowing')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">@{user.username}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  function renderReceivedInterests() {
    if (!isOwnProfile) return null;

    return (
      <div className="grid gap-3">
        {receivedInterests.length === 0 && (
          <p className="text-gray-400">{t('profile.noCompanyInterestsYet')}</p>
        )}
        {receivedInterests.map((r) => (
          <div key={r._id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <div className="text-white font-semibold">
                {r.idea ? (
                  <Link to={`/ideas/${r.idea._id}`} className="hover:underline">
                    {t('profile.idea')}: {r.idea.title}
                  </Link>
                ) : (
                  t('profile.ideaUnknown')
                )}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="text-sm text-gray-300 mt-2">
              {t('profile.company')}: <span className="text-white">{r.companyUser?.username || t('profile.unknown')}</span>{" "}
              {r.companyUser?.email && (
                <span className="text-gray-500">({r.companyUser.email})</span>
              )}
            </div>

            {r.message && (
              <pre className="mt-2 text-gray-200 whitespace-pre-wrap font-sans">
                {r.message}
              </pre>
            )}
          </div>
        ))}
      </div>
    );
  }
}
