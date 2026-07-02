import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  apiFetch,
  createGroupChat,
  createGroupInvite,
  getGroup,
  joinGroup,
  listGroupChats,
  listGroupMembers,
  removeGroupMember,
  updateGroupMemberRole,
  type Group,
  type GroupChat,
  type GroupInvite,
  type GroupMember,
  type Idea,
} from "../api";
import { humanizeError } from "../utils/humanizeError";

type TabKey = "posts" | "chats" | "settings";

function visibilityLabel(value?: string) {
  if (value === "private") return "私有";
  if (value === "unlisted") return "非公开";
  return "公开";
}

export default function GroupDetailPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const joinToken = params.get("joinToken") || "";
  const inviteCode = params.get("inviteCode") || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [chats, setChats] = useState<GroupChat[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [tab, setTab] = useState<TabKey>("posts");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatName, setChatName] = useState("");
  const [chatDescription, setChatDescription] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);

  const shareUrl = useMemo(() => {
    if (!invite) return "";
    return `${window.location.origin}${invite.sharePath}`;
  }, [invite]);

  async function loadGroup() {
    if (!slug) return;
    const res = await getGroup(slug);
    setGroup(res.group);
  }

  async function loadPosts() {
    if (!slug) return;
    const qs = new URLSearchParams({ group: slug, sort: "recommended", page: "1", limit: "30" });
    const res = await apiFetch<{ ok: true; ideas: Idea[] }>(`/api/ideas?${qs.toString()}`);
    setIdeas(res.ideas || []);
  }

  async function loadChats(q = chatSearch) {
    if (!slug) return;
    const res = await listGroupChats(slug, q.trim() || undefined);
    setChats(res.chats || []);
  }

  async function loadMembers() {
    if (!slug) return;
    setSettingsLoading(true);
    try {
      const res = await listGroupMembers(slug);
      setMembers(res.members || []);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadAll() {
    try {
      setLoading(true);
      await loadGroup();
      await Promise.all([loadPosts(), loadChats("")]);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [slug]);

  useEffect(() => {
    if (group?.canManage && tab === "settings") void loadMembers();
  }, [group?.canManage, tab]);

  useEffect(() => {
    if (!slug || (!joinToken && !inviteCode) || group?.joined) return;
    void handleJoin({ inviteToken: joinToken || undefined, inviteCode: inviteCode || undefined });
  }, [slug, joinToken, inviteCode, group?.joined]);

  async function handleJoin(payload?: { code?: string; inviteToken?: string; inviteCode?: string }) {
    if (!slug) return;
    setJoining(true);
    try {
      await joinGroup(slug, payload || { code: joinCode.trim() || undefined });
      toast.success("已加入圈子");
      setJoinCode("");
      await loadAll();
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setJoining(false);
    }
  }

  async function handleCreateChat() {
    if (!slug || !chatName.trim()) return;
    try {
      await createGroupChat(slug, { name: chatName.trim(), description: chatDescription.trim() });
      setChatName("");
      setChatDescription("");
      toast.success("聊天群已创建");
      await loadChats("");
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleCreateInvite() {
    if (!slug) return;
    try {
      const res = await createGroupInvite(slug);
      setInvite(res.invite);
      toast.success("邀请链接已生成");
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleCopyInvite() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("邀请链接已复制");
    } catch {
      toast.error("复制失败，请手动复制链接");
    }
  }

  async function handleRole(member: GroupMember, role: "member" | "admin") {
    try {
      await updateGroupMemberRole(slug, member._id, role);
      await loadMembers();
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleKick(member: GroupMember) {
    if (!window.confirm(`移出 ${member.username}？`)) return;
    try {
      await removeGroupMember(slug, member._id);
      await loadMembers();
      await loadGroup();
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto p-4 text-gray-400">加载中...</div>;
  }

  if (!group) {
    return <div className="max-w-5xl mx-auto p-4 text-red-300">圈子不存在或不可见。</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5" data-tour="group-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-white">{group.name}</h1>
              <span className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-300">#{group.slug}</span>
              <span className="rounded-full border border-cyan-700/70 bg-cyan-950/30 px-2 py-1 text-xs text-cyan-100">{visibilityLabel(group.visibility)}</span>
              {group.joined ? <span className="rounded-full border border-emerald-700/70 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-100">已加入</span> : null}
            </div>
            {group.description ? <p className="mt-3 text-sm text-gray-300">{group.description}</p> : null}
            <p className="mt-3 text-xs text-gray-500">成员 {group.memberCount ?? "全部用户"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/ideas/new/dynamic?group=${encodeURIComponent(group.slug)}`} data-tour="group-post-action" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200">
              发帖
            </Link>
            {!group.joined && !group.isWorld ? (
              <div className="flex gap-2">
                {group.visibility === "private" || group.visibility === "unlisted" ? (
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="口令"
                    className="w-32 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                  />
                ) : null}
                <button type="button" disabled={joining} onClick={() => handleJoin()} className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-60">
                  {joining ? "加入中..." : "加入"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-800 overflow-x-auto" data-tour="group-tabs">
        {(["posts", "chats", ...(group.canManage ? ["settings"] : [])] as TabKey[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-4 py-2 text-sm font-semibold ${tab === item ? "border-b-2 border-white text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            {item === "posts" ? "帖子" : item === "chats" ? "聊天群" : "设置"}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        <div className="grid gap-3" data-tour="group-content">
          {ideas.length === 0 ? <p className="text-gray-400">还没有帖子。</p> : null}
          {ideas.map((idea) => (
            <Link key={idea._id} to={`/ideas/${idea._id}`} className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-white">{idea.title}</h2>
                <span className="text-xs text-gray-500">{idea.createdAt ? new Date(idea.createdAt).toLocaleString() : ""}</span>
              </div>
              {idea.summary ? <p className="mt-1 text-sm text-gray-300">{idea.summary}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
                <span className="rounded-full border border-gray-700 px-2 py-1">{idea.author?.username || "unknown"}</span>
                {(idea.tags || []).slice(0, 6).map((tag) => <span key={tag} className="rounded-full border border-gray-700 px-2 py-1">#{tag}</span>)}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {tab === "chats" ? (
        <div className="space-y-4" data-tour="group-content">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input value={chatName} onChange={(e) => setChatName(e.target.value)} placeholder="聊天群名称" className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2" />
              <input value={chatDescription} onChange={(e) => setChatDescription(e.target.value)} placeholder="简介" className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2" />
              <button type="button" disabled={!group.joined || !chatName.trim()} onClick={handleCreateChat} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
                新建
              </button>
            </div>
          </section>
          <div className="flex gap-2">
            <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void loadChats(); }} placeholder="搜索聊天群" className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm" />
            <button type="button" onClick={() => loadChats()} className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">搜索</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {chats.map((chat) => (
              <div key={chat._id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <h3 className="font-semibold text-white">{chat.name}</h3>
                {chat.description ? <p className="mt-1 text-sm text-gray-300">{chat.description}</p> : null}
                <p className="mt-3 text-xs text-gray-500">成员 {chat.memberCount || 1}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "settings" && group.canManage ? (
        <div className="space-y-4" data-tour="group-content">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">邀请</h2>
                {group.joinCode ? <p className="mt-1 text-sm text-gray-300">圈子口令：{group.joinCode}</p> : null}
              </div>
              <button type="button" onClick={handleCreateInvite} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200">
                生成我的邀请链接
              </button>
            </div>
            {invite ? (
              <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-sm text-gray-200">
                <div>口令：{invite.code}</div>
                <div className="mt-1 break-all">链接：{shareUrl}</div>
                <button type="button" onClick={handleCopyInvite} className="mt-3 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">
                  复制邀请链接
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">成员管理</h2>
              <button type="button" onClick={loadMembers} className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">刷新</button>
            </div>
            {settingsLoading ? <p className="text-gray-400">加载中...</p> : null}
            <div className="grid gap-2">
              {members.map((member) => (
                <div key={member._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                  <div>
                    <div className="font-semibold text-white">{member.displayName || member.username}</div>
                    <div className="text-xs text-gray-500">{member.groupRole === "creator" ? "创建者" : member.groupRole === "admin" ? "管理员" : "成员"}</div>
                  </div>
                  {member.groupRole !== "creator" ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleRole(member, member.groupRole === "admin" ? "member" : "admin")} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">
                        {member.groupRole === "admin" ? "取消管理员" : "设为管理员"}
                      </button>
                      <button type="button" onClick={() => handleKick(member)} className="rounded-lg border border-rose-700 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40">
                        移出
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}