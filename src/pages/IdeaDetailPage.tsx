import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, apiUploadImage } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { getLocalIdea, deleteLocalIdea, saveLocalIdea } from "../utils/localIdeas";
import { MentionTextarea } from "../components/MentionTextarea";
import { CharCount } from "../components/CharCount";
import { UserHoverCard } from "../components/UserHoverCard";
import { getPlatformIcon } from "../utils/platformConfig";

const LIMITS = {
  COMMENT: 2000,
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp";


type Idea = {
  _id: string;
  title: string;
  summary: string;
  content: string;
  imageUrls?: string[];
  tags: string[];
  visibility: string;
  isMonetizable: boolean;
  licenseType: string;
  createdAt: string;
  updatedAt: string;
  author?: { _id: string; username: string; role: string };
  stats?: { likeCount: number; commentCount: number; bookmarkCount: number; viewCount: number };
  aiReview?: {
    feasibilityScore: number;
    profitPotentialScore: number;
    analysisText: string;
    model?: string;
    createdAt?: string;
  };
  isFeedback?: boolean;
  feedbackType?: string;
  feedbackStatus?: string;
  aiSummary?: string;
  externalSource?: {
    platform?: string;
    url?: string;
    originalAuthor?: string;
    sourceCreatedAt?: string;
  };
};

type Comment = {
  _id: string;
  content: string;
  imageUrls?: string[];
  createdAt: string;
  author?: { _id: string; username: string; role: string };
  likes?: string[];
  likesCount?: number;
  parentCommentId?: string | null;
  replyCount?: number;
  externalLinkNote?: {
    noteId?: string;
    x?: number;
    y?: number;
  };
};

type LinkNote = {
  _id: string;
  x: number;
  y: number;
  content: string;
  screenshotUrl?: string;
  panelY?: number;
  createdAt: string;
  updatedAt?: string;
  user?: { _id: string; username: string; role: string };
};

export default function IdeaDetailPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentImageUrls, setCommentImageUrls] = useState<string[]>([]);
  const [uploadingCommentImages, setUploadingCommentImages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyImageUrls, setReplyImageUrls] = useState<string[]>([]);
  const [uploadingReplyImages, setUploadingReplyImages] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replies, setReplies] = useState<{ [commentId: string]: Comment[] }>({});

  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const linkWidgetRef = useRef<HTMLDivElement | null>(null);
  const noteFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [linkNotes, setLinkNotes] = useState<LinkNote[]>([]);
  const [linkNotesLoading, setLinkNotesLoading] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [flashingNoteId, setFlashingNoteId] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [pendingScreenshotUrl, setPendingScreenshotUrl] = useState("");
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelPositions, setPanelPositions] = useState<Record<string, number>>({});
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const dragOffsetRef = useRef(0);
  
  // Screenshot region selection state
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [capturedStream, setCapturedStream] = useState<MediaStream | null>(null);

  const isCompany = user?.role === "company";
  const [interestMsg, setInterestMsg] = useState("");
  const [interested, setInterested] = useState(false);


  async function loadComments() {
    const res = await apiFetch<{ comments: Comment[] }>(`/api/ideas/${id}/comments`);
    setComments(res.comments || []);
  }

  function validateImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files are allowed");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      throw new Error("Image size must be <= 5MB");
    }
  }

  async function uploadLocalImages(files: FileList | null, target: "comment" | "reply") {
    if (!files || files.length === 0) return;
    if (target === "comment") setUploadingCommentImages(true);
    if (target === "reply") setUploadingReplyImages(true);

    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 4)) {
        validateImageFile(file);
        const uploaded = await apiUploadImage(file, "comment");
        urls.push(uploaded.imageUrl);
      }

      if (target === "comment") {
        setCommentImageUrls((prev) => [...prev, ...urls].slice(0, 8));
      } else {
        setReplyImageUrls((prev) => [...prev, ...urls].slice(0, 8));
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      if (target === "comment") setUploadingCommentImages(false);
      if (target === "reply") setUploadingReplyImages(false);
    }
  }

  async function startScreenCapture() {
    if (!isFullscreen) {
      toast.error(t("idea.linkWidgetFullscreenRequired"));
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error(t("idea.linkWidgetCaptureUnsupported"));
      return;
    }

    try {
      setCapturingScreenshot(true);
      // Let user choose what to capture (tab, window, or screen)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setCapturedStream(stream);
      setIsSelectingRegion(true);
      setSelectionStart(null);
      setSelectionEnd(null);
      toast.success(t("idea.linkWidgetSelectRegion"));
    } catch (e: any) {
      toast.error(humanizeError(e));
      setCapturingScreenshot(false);
    }
  }

  async function captureSelectedRegion() {
    if (!capturedStream || !selectionStart || !selectionEnd) return;

    try {
      const video = document.createElement("video");
      video.srcObject = capturedStream;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Calculate selection rectangle in screen coordinates
      const previewRect = previewRef.current?.getBoundingClientRect();
      if (!previewRect) throw new Error("Preview element not found");

      const x1 = Math.min(selectionStart.x, selectionEnd.x);
      const y1 = Math.min(selectionStart.y, selectionEnd.y);
      const x2 = Math.max(selectionStart.x, selectionEnd.x);
      const y2 = Math.max(selectionStart.y, selectionEnd.y);
      const width = x2 - x1;
      const height = y2 - y1;

      if (width < 10 || height < 10) {
        throw new Error(t("idea.linkWidgetRegionTooSmall"));
      }

      // Map preview coordinates to video coordinates
      const scaleX = video.videoWidth / previewRect.width;
      const scaleY = video.videoHeight / previewRect.height;

      const sourceX = Math.round(x1 * scaleX);
      const sourceY = Math.round(y1 * scaleY);
      const sourceW = Math.round(width * scaleX);
      const sourceH = Math.round(height * scaleY);

      const canvas = document.createElement("canvas");
      canvas.width = sourceW;
      canvas.height = sourceH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to capture screenshot");
      ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
      if (!blob) throw new Error("Failed to export screenshot");
      if (blob.size > IMAGE_MAX_BYTES) throw new Error("Image size must be <= 5MB");

      const file = new File([blob], `annotation-${Date.now()}.png`, { type: "image/png" });
      const uploaded = await apiUploadImage(file, "annotation");
      setPendingScreenshotUrl(uploaded.imageUrl);
      
      // Set pending point to center of selection
      const centerX = ((x1 + x2) / 2 / previewRect.width) * 100;
      const centerY = ((y1 + y2) / 2 / previewRect.height) * 100;
      setPendingPoint({ x: centerX, y: centerY });
      
      toast.success(t("idea.linkWidgetCaptureSuccess"));
      
      // Clean up
      capturedStream.getTracks().forEach((track) => track.stop());
      setCapturedStream(null);
      setIsSelectingRegion(false);
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setCapturingScreenshot(false);
    }
  }

  async function submitComment() {
    if (!commentText.trim() && commentImageUrls.length === 0) return;
    try {
      setBusy(true);
      const res = await apiFetch<{ comment: Comment; commentCount: number }>(`/api/ideas/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentText || "[image]", imageUrls: commentImageUrls }),
      });
      setCommentText("");
      setCommentImageUrls([]);
      setComments((prev) => [res.comment, ...prev]);
      setIdea((prev) =>
        prev ? { ...prev, stats: { ...prev.stats, commentCount: res.commentCount } as any } : prev
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(parentCommentId: string) {
    if (!replyText.trim() && replyImageUrls.length === 0) return;
    try {
      setBusy(true);
      await apiFetch<{ comment: Comment }>(`/api/ideas/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: replyText || "[image]", imageUrls: replyImageUrls, parentCommentId }),
      });
      setReplyText("");
      setReplyImageUrls([]);
      setReplyingTo(null);
      
      setComments((prev) =>
        prev.map((c) =>
          c._id === parentCommentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c
        )
      );

      try {
        const repliesRes = await apiFetch<{ replies: Comment[] }>(`/api/ideas/${id}/comments/${parentCommentId}/replies`);
        setReplies((prev) => ({ ...prev, [parentCommentId]: repliesRes.replies || [] }));
        setExpandedReplies((prev) => new Set([...prev, parentCommentId]));
      } catch (e: any) {
        console.error("Failed to load replies after submission:", e);
      }
    } catch (e: any) {
      toast.error("Failed to submit reply: " + humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadReplies(commentId: string) {
    try {
      const res = await apiFetch<{ replies: Comment[] }>(`/api/ideas/${id}/comments/${commentId}/replies`);
      setReplies((prev) => ({ ...prev, [commentId]: res.replies || [] }));
      setExpandedReplies((prev) => new Set([...prev, commentId]));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  function toggleReplies(commentId: string) {
    if (expandedReplies.has(commentId)) {
      setExpandedReplies((prev) => {
        const newSet = new Set(prev);
        newSet.delete(commentId);
        return newSet;
      });
    } else {
      loadReplies(commentId);
    }
  }

  async function toggleCommentLike(commentId: string) {
    if (!id || !userId) return;
    try {
      const res = await apiFetch<{ liked: boolean; likesCount: number }>(
        `/api/ideas/${id}/comments/${commentId}/like`,
        { method: "POST" }
      );
      setComments((prev) =>
        prev.map((c) =>
          c._id === commentId
            ? { ...c, likesCount: res.likesCount, likes: res.liked ? [...(c.likes || []), userId] : (c.likes || []).filter((uid: string) => uid !== userId) }
            : c
        )
      );
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function loadLinkNotes(ideaId: string) {
    try {
      setLinkNotesLoading(true);
      const res = await apiFetch<{ ok: true; notes: LinkNote[] }>(`/api/ideas/${ideaId}/link-notes`);
      const notes = res.notes || [];
      setLinkNotes(notes);
      setPanelPositions(
        notes.reduce<Record<string, number>>((acc, note, idx) => {
          acc[note._id] = Number(note.panelY || idx * 110);
          return acc;
        }, {})
      );
    } catch (e: any) {
      // If the idea has no external source URL, backend can reject. Keep UI usable.
      setLinkNotes([]);
      setPanelPositions({});
    } finally {
      setLinkNotesLoading(false);
    }
  }

  async function submitLinkNote() {
    if (!id || !pendingPoint || !noteContent.trim()) return;
    if (!pendingScreenshotUrl) {
      toast.error(t("idea.linkWidgetCaptureRequired"));
      return;
    }
    try {
      setSubmittingNote(true);
      const res = await apiFetch<{
        ok: true;
        note: LinkNote;
        count: number;
        comment?: Comment;
        commentCount?: number;
      }>(`/api/ideas/${id}/link-notes`, {
        method: "POST",
        body: JSON.stringify({
          x: pendingPoint.x,
          y: pendingPoint.y,
          screenshotUrl: pendingScreenshotUrl,
          panelY: Math.max(0, linkNotes.length * 110),
          content: noteContent,
        }),
      });
      setLinkNotes((prev) => [...prev, res.note]);
      setPanelPositions((prev) => ({ ...prev, [res.note._id]: Number(res.note.panelY || linkNotes.length * 110) }));
      if (res.comment) {
        setComments((prev) => [res.comment as Comment, ...prev]);
      }
      if (typeof res.commentCount === "number") {
        setIdea((prev) =>
          prev ? { ...prev, stats: { ...prev.stats, commentCount: res.commentCount } as any } : prev
        );
      }
      setActiveNoteId(res.note._id);
      setPendingPoint(null);
      setPendingScreenshotUrl("");
      setNoteContent("");
      toast.success(t("idea.linkWidgetNoteSaved"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSubmittingNote(false);
    }
  }

  function handleRegionMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (!isSelectingRegion || !isFullscreen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });
  }

  function handleRegionMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!isSelectingRegion || !selectionStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionEnd({ x, y });
  }

  function handleRegionMouseUp() {
    if (!isSelectingRegion || !selectionStart || !selectionEnd) return;
    // Show confirmation UI
  }

  function handlePreviewClick(e: MouseEvent<HTMLDivElement>) {
    if (!annotateMode || !isFullscreen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPoint({
      x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
    });
    setActiveNoteId(null);
  }

  async function togglePreviewFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await previewRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleAnnotateToggle() {
    // If not in fullscreen, enter fullscreen first
    if (!document.fullscreenElement && previewRef.current) {
      try {
        await previewRef.current.requestFullscreen();
        setIsFullscreen(true);
        // Wait for fullscreen transition
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error('Failed to enter fullscreen:', e);
        return; // Don't toggle annotate mode if fullscreen failed
      }
    }
    
    // Toggle annotate mode
    setAnnotateMode((v) => {
      const next = !v;
      if (next) {
        setPendingPoint({ x: 50, y: 50 });
      } else {
        setPendingPoint(null);
        setPendingScreenshotUrl("");
      }
      return next;
    });
  }

  async function focusLinkNote(noteId?: string, x?: number, y?: number) {
    if (!noteId && (x === undefined || y === undefined)) return;
    let resolvedNoteId: string | undefined;
    let noteFound = false;

    // First verify the note exists in our current linkNotes state
    if (noteId) {
      const note = linkNotes.find((n) => n._id === noteId);
      if (note) {
        setActiveNoteId(noteId);
        resolvedNoteId = noteId;
        noteFound = true;
      } else {
        // Note not found, try to reload linkNotes
        if (id) {
          try {
            const res = await apiFetch<{ ok: true; notes: LinkNote[] }>(`/api/ideas/${id}/link-notes`);
            const reloadedNotes = res.notes || [];
            const reloadedNote = reloadedNotes.find((n) => n._id === noteId);
            if (reloadedNote) {
              setLinkNotes(reloadedNotes);
              setActiveNoteId(noteId);
              resolvedNoteId = noteId;
              noteFound = true;
            } else {
              toast.error(t("idea.linkWidgetNoteNotFound"));
              return;
            }
          } catch (e) {
            toast.error(t("idea.linkWidgetNoteNotFound"));
            return;
          }
        } else {
          toast.error(t("idea.linkWidgetNoteNotFound"));
          return;
        }
      }
    }

    if (!noteFound && x !== undefined && y !== undefined) {
      const fallback = linkNotes.find((n) => Math.abs(n.x - x) < 0.01 && Math.abs(n.y - y) < 0.01);
      if (fallback) {
        setActiveNoteId(fallback._id);
        resolvedNoteId = fallback._id;
        noteFound = true;
      } else {
        toast.error(t("idea.linkWidgetNoteNotFound"));
        return;
      }
    }

    if (!noteFound) {
      toast.error(t("idea.linkWidgetNoteNotFound"));
      return;
    }

    // Enter fullscreen first if not already in fullscreen
    if (!document.fullscreenElement && previewRef.current) {
      try {
        await previewRef.current.requestFullscreen();
        setIsFullscreen(true);
        // Wait a bit for fullscreen transition to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error('Failed to enter fullscreen:', e);
        toast.error(t("idea.linkWidgetFullscreenFailed"));
        return;
      }
    }

    if (resolvedNoteId) {
      if (noteFlashTimerRef.current) {
        clearTimeout(noteFlashTimerRef.current);
      }
      setFlashingNoteId(resolvedNoteId);
      noteFlashTimerRef.current = setTimeout(() => {
        setFlashingNoteId((current) => (current === resolvedNoteId ? null : current));
      }, 1600);
    }

    // Use setTimeout to ensure DOM is ready after fullscreen transition
    setTimeout(() => {
      linkWidgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  async function persistPanelPosition(noteId: string, panelY: number) {
    if (!id) return;
    try {
      await apiFetch(`/api/ideas/${id}/link-notes/${noteId}/position`, {
        method: "PATCH",
        body: JSON.stringify({ panelY: Math.max(0, panelY) }),
      });
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  function startDragNote(noteId: string, e: MouseEvent<HTMLDivElement>) {
    const currentTop = panelPositions[noteId] ?? 0;
    dragOffsetRef.current = e.clientY - currentTop;
    setDraggingNoteId(noteId);
  }

  useEffect(() => {
    return () => {
      if (noteFlashTimerRef.current) {
        clearTimeout(noteFlashTimerRef.current);
      }
      // Clean up captured stream on unmount
      if (capturedStream) {
        capturedStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [capturedStream]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);
      
      // Exit annotate mode and clear pending point when exiting fullscreen
      if (!inFullscreen) {
        setAnnotateMode(false);
        setPendingPoint(null);
        setPendingScreenshotUrl("");
        setActiveNoteId(null);
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!draggingNoteId) return;

    const onMove = (event: globalThis.MouseEvent) => {
      const nextY = Math.max(0, event.clientY - dragOffsetRef.current);
      setPanelPositions((prev) => ({ ...prev, [draggingNoteId]: nextY }));
    };

    const onUp = async () => {
      const noteId = draggingNoteId;
      const y = panelPositions[noteId] ?? 0;
      setDraggingNoteId(null);
      await persistPanelPosition(noteId, y);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingNoteId, panelPositions]);

  async function onDeleteIdea() {
    if (!id) return;
    if (!confirm("Delete this idea? This cannot be undone.")) return;

    try {
      await apiFetch(`/api/ideas/${id}`, { method: "DELETE" });
      toast.success("Idea deleted");
      nav("/");
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function load() {
    try {
      setErr("");
      setLoading(true);
      if (id && id.startsWith("local-")) {
        const li = getLocalIdea(id);
        if (!li) {
          setErr("Local idea not found");
          return;
        }
        // map to Idea shape partially
        setIdea({
          _id: li._id,
          title: li.title,
          summary: li.summary || "",
          content: li.content || "",
          imageUrls: li.imageUrls || [],
          tags: li.tags || [],
          visibility: "private",
          isMonetizable: false,
          licenseType: "default",
          createdAt: li.createdAt,
          updatedAt: li.updatedAt,
        } as any);
        setLiked(false);
        setBookmarked(false);
        setLinkNotes([]);
        return;
      }

      const res = await apiFetch<{ idea: Idea; liked?: boolean; bookmarked?: boolean }>(`/api/ideas/${id}`);
      setIdea(res.idea);
      setLiked(!!res.liked);
      setBookmarked(!!res.bookmarked);
      if (res.idea?.externalSource?.url && id) {
        await loadLinkNotes(id);
      } else {
        setLinkNotes([]);
      }
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg);

    } finally {
      setLoading(false);
    }
  }

  async function onToggleLike() {
    const res = await apiFetch<{ liked: boolean; likeCount: number }>(`/api/ideas/${id}/like`, { method: "POST" });
    setLiked(res.liked);
    setIdea((prev) => prev ? { ...prev, stats: { ...prev.stats, likeCount: res.likeCount } as any } : prev);
  }

  async function onToggleBookmark() {
    const res = await apiFetch<{ bookmarked: boolean; bookmarkCount: number }>(`/api/ideas/${id}/bookmark`, { method: "POST" });
    setBookmarked(res.bookmarked);
    setIdea((prev) => prev ? { ...prev, stats: { ...prev.stats, bookmarkCount: res.bookmarkCount } as any } : prev);
  }

  async function onToggleInterest() {
    const res = await apiFetch<{ interested: boolean }>(`/api/ideas/${id}/interest`, {
      method: "POST",
      body: JSON.stringify({ message: interestMsg }),
    });
    setInterested(res.interested);
  }


  useEffect(() => {
    (async () => {
      await load();
      await loadComments();
    })();
  }, [id]);

  // migration handler: confirm modal -> fetch full data -> save locally -> delete server
  async function confirmMoveToLocal() {
    if (!id) return;
    try {
      setLoading(true);
      // fetch latest idea (with liked/bookmarked) and comments
      const resIdea = await apiFetch<{ idea: Idea; liked?: boolean; bookmarked?: boolean }>(`/api/ideas/${id}`);
      const resComments = await apiFetch<{ comments: Comment[] }>(`/api/ideas/${id}/comments`);

      const payload: any = {
        _id: undefined,
        title: resIdea.idea.title,
        summary: resIdea.idea.summary,
        content: resIdea.idea.content,
        tags: resIdea.idea.tags,
        createdAt: resIdea.idea.createdAt,
        comments: resComments.comments || [],
        stats: resIdea.idea.stats || {},
        liked: !!resIdea.liked,
        bookmarked: !!resIdea.bookmarked,
      };

      const local = saveLocalIdea(payload);

      // delete server idea (owner only)
      await apiFetch(`/api/ideas/${id}`, { method: "DELETE" });

      // navigate to local idea view
      deleteLocalIdea(local._id); // ensure duplication doesn't occur, then re-save with full data
      saveLocalIdea({ ...local, ...payload, _id: local._id });

      toast.success(t('idea.movedToLocal'));
      setShowMoveConfirm(false);
      nav(`/ideas/${local._id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  const userId = (user as any)?._id || (user as any)?.id;
  const isOwner = !!idea?.author?._id && !!userId && idea.author._id === userId;
  const isAdmin = user?.role === "admin";
  const canManageIdea = isOwner || isAdmin;
  const isLocal = !!idea && String(idea._id).startsWith("local-");

  return (
    <div className="max-w-3xl mx-auto p-4">
      {showMoveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold text-white">{t('idea.moveToPrivate')}</h3>
            <p className="text-sm text-gray-400 mt-2">{t('idea.moveToPrivateConfirmMsg')}</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowMoveConfirm(false)} className="rounded-xl border border-gray-700 px-3 py-2 text-sm">{t('common.cancel')}</button>
              <button onClick={confirmMoveToLocal} className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold">{t('idea.confirmMove')}</button>
            </div>
          </div>
        </div>
      )}
      <Link to="/" className="text-sm text-gray-400 hover:text-white">{t('common.back')}</Link>

      {loading && <p className="text-gray-300 mt-6">{t('common.loading')}</p>}
      {err && <p className="text-red-400 mt-6">{t('common.error')}: {err}</p>}

      {idea && (

        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{idea.title}</h1>
              <p className="text-gray-400 text-sm mt-1">
                {idea.externalSource ? (
                  <>
                    <span className="text-purple-400">{getPlatformIcon(idea.externalSource.platform)} {idea.externalSource.platform}</span>
                    {" · "}
                    <a
                      href={idea.externalSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {t('idea.viewOriginal')}
                    </a>
                    {idea.externalSource.originalAuthor && (
                      <span className="text-gray-500"> · {t('idea.originalAuthor')}: {idea.externalSource.originalAuthor}</span>
                    )}
                  </>
                ) : (
                  <>
                    {t('idea.by')}{" "}
                    {idea.author?._id ? (
                      <UserHoverCard userId={idea.author._id} username={idea.author.username}>
                        <span className="text-white">{idea.author.username}</span>
                      </UserHoverCard>
                    ) : (
                      <span>{t('home.unknownAuthor')}</span>
                    )}
                  </>
                )}{" "}
                · {new Date(idea.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="text-right text-xs text-gray-400">
              <div>{t('idea.visibilityLabel')}: {idea.visibility}</div>
              <div>{t('idea.licenseLabel')}: {idea.licenseType}</div>
            </div>

            {canManageIdea && (
              <div className="flex flex-col gap-2 items-end">
                <Link
                  to={`/ideas/${idea._id}/edit`}
                  className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200"
                >
                  {t('common.edit')}
                </Link>

                {!isLocal && (
                  <button
                    onClick={async () => {
                      if (!confirm(t('idea.moveToPrivateConfirm'))) return;
                      try {
                        setLoading(true);
                        // save locally first
                        const local = saveLocalIdea({
                          title: idea.title,
                          summary: idea.summary,
                          content: idea.content,
                          tags: idea.tags,
                          createdAt: idea.createdAt,
                        });
                        // delete on server
                        await apiFetch(`/api/ideas/${idea._id}`, { method: "DELETE" });
                        toast.success(t('idea.movedToLocal'));
                        nav(`/ideas/${local._id}`);
                      } catch (e: any) {
                        toast.error(humanizeError(e));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="text-xs rounded-lg border border-yellow-700 px-3 py-1.5 hover:bg-yellow-950 text-yellow-200"
                  >
                    {t('idea.moveToPrivate')}
                  </button>
                )}

                <button
                  onClick={onDeleteIdea}
                  className="text-xs rounded-lg border border-red-800 px-3 py-1.5 hover:bg-red-950 text-red-200"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}

            {isLocal && (
              <div className="flex flex-col gap-2 items-end">
                <button
                  onClick={async () => {
                    // publish local idea -> POST to server
                    try {
                      setLoading(true);
                      const payload = {
                        title: idea.title,
                        summary: idea.summary,
                        content: idea.content,
                        tags: idea.tags,
                        visibility: "public",
                      };
                      const res = await apiFetch(`/api/ideas`, { method: "POST", body: JSON.stringify(payload) });
                      // on success, remove local and navigate to server idea
                      deleteLocalIdea(idea._id);
                      toast.success(t('idea.publishSuccess'));
                      nav(`/ideas/${res.idea._id}`);
                    } catch (e: any) {
                      toast.error(humanizeError(e));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="text-xs rounded-lg border border-green-700 px-3 py-1.5 hover:bg-green-950 text-green-200"
                >
                  {t('idea.publishToPublic')}
                </button>

                <button
                  onClick={() => {
                    if (!confirm(t('idea.deleteLocalConfirm'))) return;
                    deleteLocalIdea(idea._id);
                    toast.success(t('idea.localDeleted'));
                    nav("/me");
                  }}
                  className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200"
                >
                  {t('idea.deleteLocal')}
                </button>
              </div>
            )}

          </div>

          {idea.isFeedback && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                idea.feedbackType === "bug" 
                  ? "bg-red-900/30 border border-red-800 text-red-200" 
                  : "bg-blue-900/30 border border-blue-800 text-blue-200"
              }`}>
                {idea.feedbackType === "bug" ? t('idea.feedbackBug') : t('idea.feedbackSuggestion')}
              </span>
              
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                idea.feedbackStatus === "pending" ? "bg-yellow-900/30 border border-yellow-800 text-yellow-200" :
                idea.feedbackStatus === "under_review" ? "bg-purple-900/30 border border-purple-800 text-purple-200" :
                idea.feedbackStatus === "adopted" ? "bg-green-900/30 border border-green-800 text-green-200" :
                idea.feedbackStatus === "resolved" ? "bg-teal-900/30 border border-teal-800 text-teal-200" :
                idea.feedbackStatus === "rejected" ? "bg-gray-900/30 border border-gray-700 text-gray-400" :
                "bg-gray-900/30 border border-gray-700 text-gray-300"
              }`}>
                 {idea.feedbackStatus === "pending" ? t('idea.feedbackPending') :
                  idea.feedbackStatus === "under_review" ? t('idea.feedbackUnderReview') :
                  idea.feedbackStatus === "adopted" ? t('idea.feedbackAdopted') :
                  idea.feedbackStatus === "resolved" ? t('idea.feedbackResolved') :
                  idea.feedbackStatus === "rejected" ? t('idea.feedbackRejected') :
                 t('idea.statusUnknown')}
              </span>

              {isAdmin && !isLocal && (
                <div className="flex gap-1 ml-auto">
                  <select
                    className="text-xs rounded-lg bg-gray-950/50 border border-gray-700 px-2 py-1 text-gray-200"
                    value={idea.feedbackStatus || "pending"}
                    onChange={async (e) => {
                      try {
                        await apiFetch(`/api/admin/ideas/${idea._id}/feedback-status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: e.target.value }),
                        });
                        toast.success(t('idea.statusUpdated'));
                        await load();
                      } catch (err: any) {
                        toast.error(humanizeError(err));
                      }
                    }}
                  >
                    <option value="pending">{t('idea.feedbackPending')}</option>
                    <option value="under_review">{t('idea.feedbackUnderReview')}</option>
                    <option value="adopted">{t('idea.feedbackAdopted')}</option>
                    <option value="resolved">{t('idea.feedbackResolved')}</option>
                    <option value="rejected">{t('idea.feedbackRejected')}</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {idea.aiSummary && (
            <div className="mt-4 rounded-2xl border border-blue-800 bg-blue-950/20 p-3">
              <h4 className="text-sm font-semibold text-blue-200">{t('idea.aiSummary')}</h4>
              <p className="text-sm text-blue-100 mt-1">{idea.aiSummary}</p>
            </div>
          )}

          {idea.summary && <p className="text-gray-200 mt-4">{idea.summary}</p>}

          {!!idea.imageUrls?.length && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
              {idea.imageUrls.map((url) => (
                <img key={url} src={url} alt="idea" className="w-full h-32 rounded-lg border border-gray-800 object-cover" />
              ))}
            </div>
          )}

          {idea.externalSource?.url && (
            <div ref={linkWidgetRef} className="mt-5 rounded-2xl border border-purple-800 bg-purple-950/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-purple-200">{t("idea.linkWidgetTitle")}</h3>
                  <p className="text-xs text-purple-300/80 mt-1">{t("idea.linkWidgetSubtitle")}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                      annotateMode
                        ? "border-purple-300 text-purple-50 bg-purple-800/60"
                        : "border-gray-700 text-gray-300 bg-gray-900/60"
                    }`}
                  >
                    {annotateMode ? t("idea.linkWidgetAnnotateOn") : t("idea.linkWidgetAnnotateOff")}
                  </span>

                  <button
                    type="button"
                    onClick={togglePreviewFullscreen}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-900"
                  >
                    {t("idea.linkWidgetFullscreen")}
                  </button>

                  <a
                    href={idea.externalSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-blue-700 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-950/40"
                  >
                    {t("idea.linkWidgetOpenSite")}
                  </a>
                </div>
              </div>

              <div
                ref={previewRef}
                className="relative mt-3 overflow-hidden rounded-xl border border-purple-900 bg-gray-950"
              >
                {isFullscreen && (
                  <button
                    type="button"
                    onClick={handleAnnotateToggle}
                    className={`absolute right-3 top-3 z-20 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      annotateMode
                        ? "border-purple-300 text-purple-50 bg-purple-800/80"
                        : "border-purple-500/80 text-purple-100 bg-purple-900/60 hover:bg-purple-900/80"
                    }`}
                  >
                    {annotateMode ? t("idea.linkWidgetAnnotateOn") : t("idea.linkWidgetAnnotateOff")}
                  </button>
                )}

                <iframe
                  title="external-link-preview"
                  src={idea.externalSource.url}
                  className={`w-full bg-white ${isFullscreen ? 'h-screen' : 'h-[360px]'}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />

                <div
                  className={`absolute inset-0 z-10 ${
                    isSelectingRegion 
                      ? "cursor-crosshair" 
                      : annotateMode && isFullscreen 
                      ? "cursor-crosshair" 
                      : "pointer-events-none"
                  }`}
                  onClick={!isSelectingRegion ? handlePreviewClick : undefined}
                  onMouseDown={isSelectingRegion ? handleRegionMouseDown : undefined}
                  onMouseMove={isSelectingRegion ? handleRegionMouseMove : undefined}
                  onMouseUp={isSelectingRegion ? handleRegionMouseUp : undefined}
                >
                  {/* Selection rectangle visualization */}
                  {isSelectingRegion && selectionStart && selectionEnd && (
                    <div
                      className="absolute border-2 border-blue-500 bg-blue-500/20"
                      style={{
                        left: `${Math.min(selectionStart.x, selectionEnd.x)}px`,
                        top: `${Math.min(selectionStart.y, selectionEnd.y)}px`,
                        width: `${Math.abs(selectionEnd.x - selectionStart.x)}px`,
                        height: `${Math.abs(selectionEnd.y - selectionStart.y)}px`,
                      }}
                    />
                  )}
                  {isFullscreen && linkNotes.map((note, idx) => (
                    <button
                      key={note._id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveNoteId((cur) => (cur === note._id ? null : note._id));
                      }}
                      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-purple-600 text-[10px] text-white shadow ${
                        flashingNoteId === note._id ? "animate-pulse ring-4 ring-yellow-300/80 ring-offset-2 ring-offset-gray-900" : ""
                      }`}
                      style={{ left: `${note.x}%`, top: `${note.y}%`, width: "20px", height: "20px" }}
                      title={note.content}
                    >
                      {idx + 1}
                    </button>
                  ))}

                  {isFullscreen && pendingPoint && (
                    <span
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-yellow-500"
                      style={{ left: `${pendingPoint.x}%`, top: `${pendingPoint.y}%`, width: "14px", height: "14px" }}
                    />
                  )}
                </div>

                {isFullscreen && (
                  <div className="absolute inset-x-0 bottom-0 z-30 p-3 pointer-events-none">
                    <div className="pointer-events-auto rounded-xl border border-gray-800 bg-gray-950/85 p-3 backdrop-blur max-h-[45vh] overflow-y-auto">
                      {annotateMode && (
                        <p className="text-xs text-yellow-300">{t("idea.linkWidgetClickToPlace")}</p>
                      )}

                      {!user && (
                        <p className="text-xs text-gray-400 mt-2">{t("idea.linkWidgetLoginToAnnotate")}</p>
                      )}

                      {pendingPoint && user && (
                        <div className="mt-2 rounded-xl border border-purple-800/80 bg-gray-950/70 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={startScreenCapture}
                              disabled={capturingScreenshot || isSelectingRegion}
                              className="rounded-lg border border-purple-600 px-3 py-1 text-xs text-purple-100 disabled:opacity-50"
                            >
                              {capturingScreenshot || isSelectingRegion ? t("comment.posting") : t("idea.linkWidgetCaptureScreenshot")}
                            </button>
                            {isSelectingRegion && selectionStart && selectionEnd && (
                              <button
                                type="button"
                                onClick={captureSelectedRegion}
                                className="rounded-lg border border-green-600 px-3 py-1 text-xs text-green-100"
                              >
                                {t("idea.linkWidgetConfirmCapture")}
                              </button>
                            )}
                            {isSelectingRegion && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (capturedStream) {
                                    capturedStream.getTracks().forEach((track) => track.stop());
                                    setCapturedStream(null);
                                  }
                                  setIsSelectingRegion(false);
                                  setSelectionStart(null);
                                  setSelectionEnd(null);
                                  setCapturingScreenshot(false);
                                }}
                                className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300"
                              >
                                {t("common.cancel")}
                              </button>
                            )}
                            {pendingScreenshotUrl && <span className="text-xs text-green-300">{t("idea.linkWidgetScreenshotReady")}</span>}
                          </div>
                          {pendingScreenshotUrl && (
                            <img src={pendingScreenshotUrl} alt="annotation capture" className="mb-2 max-h-28 rounded border border-gray-800" />
                          )}
                          <p className="text-xs text-gray-400 mb-2">
                            {t("idea.linkWidgetPointLabel", {
                              x: pendingPoint.x.toFixed(1),
                              y: pendingPoint.y.toFixed(1),
                            })}
                          </p>
                          <textarea
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                            rows={3}
                            placeholder={t("idea.linkWidgetNotePlaceholder")}
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            maxLength={500}
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingPoint(null);
                                  setPendingScreenshotUrl("");
                                  setNoteContent("");
                                }}
                                className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300"
                              >
                                {t("common.cancel")}
                              </button>
                              <button
                                type="button"
                                onClick={submitLinkNote}
                                disabled={submittingNote || !noteContent.trim()}
                                className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {submittingNote ? t("comment.posting") : t("idea.linkWidgetSubmitNote")}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {linkNotesLoading && <p className="text-xs text-gray-400 mt-2">{t("common.loading")}</p>}
                    </div>
                  </div>
                )}

                {isFullscreen && (
                  <div className="absolute right-3 top-12 bottom-3 z-40 w-[320px] pointer-events-none">
                    <div className="relative h-full rounded-xl border border-purple-800/60 bg-gray-950/50 backdrop-blur pointer-events-auto overflow-hidden">
                      <div className="px-3 py-2 border-b border-purple-900/50 text-xs text-purple-200">
                        {t("idea.linkWidgetNotes")} ({linkNotes.length})
                      </div>
                      <div className="relative h-[calc(100%-40px)]">
                        {linkNotesLoading && (
                          <p className="px-3 py-2 text-xs text-gray-400">{t("common.loading")}</p>
                        )}
                        {!linkNotesLoading && linkNotes.length === 0 && (
                          <p className="px-3 py-2 text-xs text-gray-400">{t("idea.linkWidgetNoNotes")}</p>
                        )}
                        {linkNotes
                          .slice()
                          .sort((a, b) => (panelPositions[a._id] ?? Number(a.panelY || 0)) - (panelPositions[b._id] ?? Number(b.panelY || 0)))
                          .map((note, idx) => (
                            <div
                              key={note._id}
                              onMouseDown={(e) => startDragNote(note._id, e)}
                              onClick={() => setActiveNoteId(note._id)}
                              className={`absolute left-2 right-2 cursor-move rounded-lg border p-2 text-xs ${
                                activeNoteId === note._id ? "border-purple-500 bg-purple-950/70" : "border-gray-800 bg-gray-900/70"
                              } ${flashingNoteId === note._id ? "ring-2 ring-yellow-300/70" : ""}`}
                              style={{ top: `${panelPositions[note._id] ?? idx * 110}px` }}
                            >
                              <div className="text-gray-300">#{idx + 1}</div>
                              {note.screenshotUrl && (
                                <img src={note.screenshotUrl} alt="annotation" className="mt-1 max-h-20 w-full rounded object-cover" />
                              )}
                              <p className="text-gray-200 mt-1 whitespace-pre-wrap">{note.content}</p>
                              <p className="text-gray-500 mt-1">
                                {t("idea.linkWidgetPinnedBy", { user: note.user?.username || t("home.unknownAuthor") })}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-2 text-xs text-purple-300/80">{t("idea.linkWidgetFrameHint")}</p>

              {!isFullscreen && (
                <p className="mt-2 text-xs text-yellow-300">{t("idea.linkWidgetFullscreenRequired")}</p>
              )}


            </div>
          )}

          {idea.content && <pre className="text-gray-200 mt-4 whitespace-pre-wrap font-sans">{idea.content}</pre>}

          {idea.aiReview?.analysisText && (
            <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
              <h3 className="font-semibold text-white">{t('aiReview.title')}</h3>

              <div className="mt-2 text-sm text-gray-300">
                <div>{t('aiReview.feasibility')}: <span className="text-white font-semibold">{idea.aiReview.feasibilityScore}</span> / 100</div>
                <div>{t('aiReview.profitPotential')}: <span className="text-white font-semibold">{idea.aiReview.profitPotentialScore}</span> / 100</div>
                <div className="text-xs text-gray-500 mt-1">
                  {t('aiReview.model')}: {idea.aiReview.model || t('home.unknownAuthor')} · {idea.aiReview.createdAt ? new Date(idea.aiReview.createdAt).toLocaleString() : ""}
                </div>
              </div>

              <pre className="mt-3 text-gray-200 whitespace-pre-wrap font-sans">
                {idea.aiReview.analysisText}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4 text-xs text-gray-400">
            {(idea.tags || []).map((t) => (
              <span key={t} className="px-2 py-1 rounded-full border border-gray-800">
                #{t}
              </span>
            ))}
            <span className="ml-auto text-gray-500">
              L {idea.stats?.likeCount ?? 0} · C {idea.stats?.commentCount ?? 0} · B {idea.stats?.bookmarkCount ?? 0} · V {idea.stats?.viewCount ?? 0}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-900 ${liked ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={onToggleLike}
              disabled={!user}
            >
              {liked ? `${t('idea.liked')}` : `${t('idea.like')}`}
            </button>

            <button
              className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-900 ${bookmarked ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={onToggleBookmark}
              disabled={!user}
            >
              {bookmarked ? `${t('idea.bookmarked')}` : `${t('idea.bookmark')}`}
            </button>

            {isCompany && (
              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                <h3 className="font-semibold text-white">{t('company.interest')}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t('company.interestDescription')}
                </p>

                <textarea
                  className="mt-3 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[90px] w-full"
                  placeholder={t('company.messagePlaceholder')}
                  value={interestMsg}
                  onChange={(e) => setInterestMsg(e.target.value)}
                />

                <button
                  className={`mt-3 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-900 ${interested ? "border-white text-white" : "border-gray-700 text-gray-300"
                    }`}
                  onClick={onToggleInterest}
                >
                  {interested ? `${t('company.interested')}` : `${t('company.markInterested')}`}
                </button>
              </div>
            )}

            {!user && <span className="text-xs text-gray-500 self-center">{t('idea.loginToInteract')}</span>}
          </div>

          <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
            <h3 className="font-semibold text-white">{t('comment.title')}</h3>

            {user ? (
              <div className="mt-3 grid gap-2">
                <div>
                  <MentionTextarea
                    value={commentText}
                    onChange={setCommentText}
                    placeholder={t('comment.placeholder')}
                    className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[90px] w-full text-gray-200"
                    maxLength={LIMITS.COMMENT}
                  />
                  <CharCount current={commentText.length} max={LIMITS.COMMENT} className="mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 cursor-pointer hover:bg-gray-900">
                    + Image
                    <input
                      type="file"
                      accept={IMAGE_ACCEPT}
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        uploadLocalImages(e.target.files, "comment");
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {uploadingCommentImages && <span className="text-xs text-gray-400">Uploading...</span>}
                </div>
                {commentImageUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {commentImageUrls.map((url) => (
                      <div key={url} className="relative">
                        <img src={url} alt="comment upload" className="h-20 w-full rounded border border-gray-800 object-cover" />
                        <button
                          type="button"
                          className="absolute top-1 right-1 rounded bg-black/60 px-1 text-xs"
                          onClick={() => setCommentImageUrls((prev) => prev.filter((item) => item !== url))}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
                  onClick={submitComment}
                  disabled={busy || (!commentText.trim() && commentImageUrls.length === 0)}
                >
                  {busy ? t('comment.posting') : t('comment.submit')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-2">{t('idea.loginToComment')}</p>
            )}

            <div className="mt-4 space-y-3">
              {comments.length === 0 && <p className="text-gray-400 text-sm">{t('comment.empty')}</p>}
              {comments.map((c) => {
                const isCommentLiked = c.likes?.includes(userId);
                const hasReplies = (c.replyCount || 0) > 0;
                const isExpanded = expandedReplies.has(c._id);
                const commentReplies = replies[c._id] || [];
                
                return (
                  <div key={c._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>
                        {c.author?._id ? (
                          <UserHoverCard userId={c.author._id} username={c.author.username}>
                            <span className="text-white">{c.author.username}</span>
                          </UserHoverCard>
                        ) : (
                          <span>{t('home.unknownAuthor')}</span>
                        )}
                      </span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-200 mt-2 whitespace-pre-wrap">{c.content}</p>
                    {!!c.imageUrls?.length && (
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                        {c.imageUrls.map((url) => (
                          <img key={url} src={url} alt="comment" className="h-24 w-full rounded border border-gray-800 object-cover" />
                        ))}
                      </div>
                    )}
                    {c.externalLinkNote && (
                      <button
                        type="button"
                        onClick={() =>
                          focusLinkNote(
                            c.externalLinkNote?.noteId,
                            c.externalLinkNote?.x,
                            c.externalLinkNote?.y
                          )
                        }
                        className="mt-2 text-xs text-purple-300 underline underline-offset-2 hover:text-purple-200"
                      >
                        {t("comment.jumpToLinkNote")}
                      </button>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      {user && (
                        <>
                          <button
                            onClick={() => toggleCommentLike(c._id)}
                            className={`text-xs px-2 py-1 rounded border ${
                              isCommentLiked
                                ? "border-white text-white"
                                : "border-gray-700 text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {isCommentLiked ? "liked" : "like"} {c.likesCount || 0}
                          </button>
                          
                          <button
                            onClick={() => setReplyingTo(replyingTo === c._id ? null : c._id)}
                            className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                          >
                            {t('comment.reply')}
                          </button>
                        </>
                      )}
                      
                      {hasReplies && (
                        <button
                          onClick={() => toggleReplies(c._id)}
                          className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300"
                        >
                          {isExpanded ? 'v' : '>'} {c.replyCount} {t('comment.replies')}
                        </button>
                      )}
                    </div>

                    {/* Reply editor */}
                    {replyingTo === c._id && (
                      <div className="mt-3 pl-4 border-l-2 border-gray-700">
                        <textarea
                          className="w-full rounded-lg bg-gray-800 border border-gray-700 p-2 text-sm text-white resize-none"
                          rows={2}
                          placeholder={t('comment.replyPlaceholder')}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          maxLength={LIMITS.COMMENT}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <CharCount current={replyText.length} max={LIMITS.COMMENT} className="" />
                          <div className="flex gap-2">
                            <label className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 cursor-pointer hover:bg-gray-700/40">
                              + Image
                              <input
                                type="file"
                                accept={IMAGE_ACCEPT}
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  uploadLocalImages(e.target.files, "reply");
                                  e.currentTarget.value = "";
                                }}
                              />
                            </label>
                            <button
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyText("");
                                setReplyImageUrls([]);
                              }}
                              className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              onClick={() => submitReply(c._id)}
                              disabled={busy || (!replyText.trim() && replyImageUrls.length === 0)}
                              className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
                            >
                              {busy ? t('comment.posting') : t('comment.submit')}
                            </button>
                          </div>
                        </div>
                        {uploadingReplyImages && <p className="mt-1 text-xs text-gray-400">Uploading...</p>}
                        {replyImageUrls.length > 0 && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {replyImageUrls.map((url) => (
                              <div key={url} className="relative">
                                <img src={url} alt="reply upload" className="h-16 w-full rounded border border-gray-700 object-cover" />
                                <button
                                  type="button"
                                  className="absolute top-1 right-1 rounded bg-black/60 px-1 text-xs"
                                  onClick={() => setReplyImageUrls((prev) => prev.filter((item) => item !== url))}
                                >
                                  x
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reply list */}
                    {isExpanded && commentReplies.length > 0 && (
                      <div className="mt-3 pl-4 space-y-2 border-l-2 border-gray-700">
                        {commentReplies.map((reply) => {
                          const isReplyLiked = reply.likes?.includes(userId);
                          return (
                            <div key={reply._id} className="rounded-lg bg-gray-800 p-2">
                              <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>
                                  {reply.author?._id ? (
                                    <UserHoverCard userId={reply.author._id} username={reply.author.username}>
                                      <span className="text-white">{reply.author.username}</span>
                                    </UserHoverCard>
                                  ) : (
                                    <span>{t('home.unknownAuthor')}</span>
                                  )}
                                </span>
                                <span>{new Date(reply.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="text-gray-200 mt-1 text-sm whitespace-pre-wrap">{reply.content}</p>
                              {!!reply.imageUrls?.length && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  {reply.imageUrls.map((url) => (
                                    <img key={url} src={url} alt="reply" className="h-20 w-full rounded border border-gray-700 object-cover" />
                                  ))}
                                </div>
                              )}
                              {user && (
                                <button
                                  onClick={() => toggleCommentLike(reply._id)}
                                  className={`mt-1 text-xs px-2 py-0.5 rounded border ${
                                    isReplyLiked
                                      ? "border-white text-white"
                                      : "border-gray-700 text-gray-400 hover:text-gray-200"
                                  }`}
                                >
                                  {isReplyLiked ? "liked" : "like"} {reply.likesCount || 0}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>


          {isOwner && (
            <p className="text-sm text-green-400 mt-4">
              {t('idea.authorNote')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
