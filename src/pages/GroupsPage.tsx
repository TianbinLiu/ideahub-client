import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { createGroup, joinGroup, leaveGroup, listGroups, type Group } from "../api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { humanizeError } from "../utils/humanizeError";

function toSlugPreview(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export default function GroupsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [joinCode, setJoinCode] = useState("");
  const [search, setSearch] = useState("");
  const [codeBySlug, setCodeBySlug] = useState<Record<string, string>>({});
  const [actionSlug, setActionSlug] = useState<string | null>(null);

  const slugPreview = useMemo(() => toSlugPreview(name), [name]);

  async function load() {
    try {
      setLoading(true);
      const res = await listGroups({ q: search.trim() || undefined });
      setGroups(res.groups || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateGroup() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createGroup({ name: name.trim(), description: description.trim(), visibility, joinCode: joinCode.trim() || undefined });
      toast.success(t("groups.created"));
      setName("");
      setDescription("");
      setJoinCode("");
      setVisibility("public");
      await load();
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMembership(group: Group) {
    if (group.isWorld) return;
    setActionSlug(group.slug);
    try {
      if (group.joined) {
        await leaveGroup(group.slug);
        toast.success(t("groups.left"));
      } else {
        await joinGroup(group.slug, { code: codeBySlug[group.slug]?.trim() || undefined });
        toast.success(t("groups.joined"));
      }
      await load();
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setActionSlug(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">{t("groups.title")}</h1>
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4" data-tour="groups-create">
        <div>
          <h2 className="text-xl font-semibold text-white">{t("groups.createTitle")}</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("groups.namePlaceholder")}
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          />
          <div className="rounded-xl border border-dashed border-gray-700 px-3 py-2 text-sm text-gray-400">
            slug: <span className="text-white">{slugPreview || t("groups.slugPreviewEmpty")}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as any)}
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          >
            <option value="public">{t("groupsPage.visibilityPublic")}</option>
            <option value="private">{t("groupsPage.visibilityPrivate")}</option>
            <option value="unlisted">{t("groupsPage.visibilityUnlisted")}</option>
          </select>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t("groupsPage.joinCodePlaceholder")}
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("groups.descriptionPlaceholder")}
          className="min-h-[96px] w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
        />

        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={handleCreateGroup}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {saving ? t("groupsPage.saving") : t("groups.createAction")}
        </button>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4" data-tour="groups-discover">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">{t("groupsPage.discoverTitle")}</h2>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load();
              }}
              placeholder={t("groupsPage.searchPlaceholder")}
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
            />
            <button type="button" onClick={load} className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
              {t("groupsPage.searchAction")}
            </button>
          </div>
        </div>

        {loading ? <p className="text-gray-400">{t("groupsPage.loading")}</p> : null}

        <div className="grid gap-3 md:grid-cols-2" data-tour="groups-list">
          {groups.map((group) => (
            <div key={group.slug} className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/groups/${group.slug}`} className="text-lg font-semibold text-white hover:underline">{group.name}</Link>
                    <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">#{group.slug}</span>
                    <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
                      {group.visibility === "private" ? t("groupsPage.visibilityPrivate") : group.visibility === "unlisted" ? t("groupsPage.visibilityUnlisted") : t("groupsPage.visibilityPublic")}
                    </span>
                    {group.isWorld ? (
                      <span className="rounded-full border border-emerald-600/70 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">{t("groupsPage.worldBadge")}</span>
                    ) : null}
                    {group.joined ? (
                      <span className="rounded-full border border-cyan-600/70 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">{t("groups.joinedBadge")}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{group.description || t("groups.noDescription")}</p>
                </div>
              </div>
              {!group.joined && !group.isWorld && (group.visibility === "private" || group.visibility === "unlisted") ? (
                <input
                  value={codeBySlug[group.slug] || ""}
                  onChange={(e) => setCodeBySlug((prev) => ({ ...prev, [group.slug]: e.target.value }))}
                  placeholder={t("groupsPage.joinCodeInputPlaceholder")}
                  className="mt-3 w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                />
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {group.memberCount == null ? t("groupsPage.worldMemberHint") : t("groups.memberCount", { count: group.memberCount })}
                </div>
                <button
                  type="button"
                  disabled={Boolean(group.isWorld) || actionSlug === group.slug}
                  onClick={() => handleToggleMembership(group)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${group.joined ? "border border-gray-600 text-gray-200 hover:bg-gray-800" : "bg-white text-black hover:bg-gray-200"} disabled:opacity-60`}
                >
                  {actionSlug === group.slug
                    ? t("groupsPage.processing")
                    : group.isWorld
                      ? t("groups.worldAlwaysJoined")
                      : group.joined
                        ? t("groups.leaveAction")
                        : t("groups.joinAction")}
                </button>
              </div>
              {group.joined && !group.isWorld ? (
                <button type="button" onClick={() => navigate(`/groups/${group.slug}`)} className="mt-3 text-xs text-cyan-300 hover:underline">
                  {t("groupsPage.enterGroup")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}