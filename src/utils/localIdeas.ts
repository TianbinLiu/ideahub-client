import { v4 as uuidv4 } from "uuid";

export type LocalComment = { _id: string; content: string; createdAt: string; author?: { username?: string; role?: string } };

export type LocalIdea = {
  _id: string; // id format: local-<uuid>
  title: string;
  summary?: string;
  content?: string;
  imageUrls?: string[];
  tags?: string[];
  visibility?: "private";
  createdAt: string;
  updatedAt: string;
  // preserved social data
  comments?: LocalComment[];
  stats?: { likeCount?: number; commentCount?: number; bookmarkCount?: number };
  liked?: boolean;
  bookmarked?: boolean;
};

const KEY = "ideahub_local_ideas_v1";

function readAll(): LocalIdea[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function writeAll(items: LocalIdea[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function listLocalIdeas(): LocalIdea[] {
  return readAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getLocalIdea(id: string): LocalIdea | null {
  const items = readAll();
  return items.find((i) => i._id === id) || null;
}

export function saveLocalIdea(data: Partial<LocalIdea>): LocalIdea {
  const items = readAll();
  const now = new Date().toISOString();
  const id = data._id || `local-${uuidv4()}`;
  const idea: LocalIdea = {
    _id: id,
    title: data.title || "Untitled",
    summary: data.summary || "",
    content: data.content || "",
    imageUrls: data.imageUrls || [],
    tags: data.tags || [],
    visibility: "private",
    createdAt: data.createdAt || now,
    updatedAt: now,
    comments: data.comments || [],
    stats: data.stats || { likeCount: 0, commentCount: (data.comments || []).length, bookmarkCount: 0 },
    liked: !!data.liked,
    bookmarked: !!data.bookmarked,
  };
  const idx = items.findIndex((i) => i._id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...idea };
  } else {
    items.push(idea);
  }
  writeAll(items);
  return idea;
}

export function deleteLocalIdea(id: string) {
  const items = readAll().filter((i) => i._id !== id);
  writeAll(items);
}

export function updateLocalIdea(id: string, patch: Partial<LocalIdea>) {
  const items = readAll();
  const idx = items.findIndex((i) => i._id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  writeAll(items);
  return items[idx];
}
