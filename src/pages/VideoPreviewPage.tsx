/**
 * /v/:id —— 启梦 App 作品的站外预览页。
 *
 * 这是 App 分享链的**落地页**：App 里点「分享 → 复制预览链接 / QQ 分享」发出去的
 * 就是这个地址。收链接的人多半没装 App，所以这一页的两个使命：
 *   ① 让视频真能看（否则链接等于骗人）；
 *   ② 看完把人引去 /download 装 App（弹层 + 顶栏常驻入口，двойная保险）。
 *
 * ★ 必须不登录可访问（与 /download、/privacy 同理）：链接就是发给陌生人的。
 * ★ 作品是**分段**的（segments[] 各带 videoUrl，出自 App 的逐段生成流水线），
 *   这里按段顺播：一段 ended 就切下一段，最后一段放完才弹下载引导。
 *   付费未解锁的段公开接口不给 videoUrl —— 播到断头同样弹引导（「完整版在 App 里」），
 *   这不是缺陷而是转化点。
 * ★ 服务端对私密/下架作品回 404（getVideo 的 readableBy），这里把一切非 2xx 都
 *   当「看不到」处理并照样给下载入口 —— 链接失效的访客也是潜在用户。
 * ★ 微信/QQ 内置浏览器不许自动播放带声视频：不搞 autoplay，封面 + 大播放键等用户点。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Download, Play, RotateCcw } from "lucide-react";
import { API_BASE } from "../config";

interface Segment {
  title?: string;
  videoUrl?: string;
  durationSec?: number;
}

interface PreviewVideo {
  _id: string;
  title: string;
  cover?: string;
  description?: string;
  author?: { displayName?: string; username?: string };
  plays?: number;
  segments: Segment[];
}

type Phase = "loading" | "error" | "poster" | "playing" | "done";

export default function VideoPreviewPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [video, setVideo] = useState<PreviewVideo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [segIdx, setSegIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 只取有真实地址的段：断头（付费锁住）之后的段一律不进列表
  const playable = useMemo(() => {
    const segs = video?.segments ?? [];
    const out: string[] = [];
    for (const s of segs) {
      if (!s.videoUrl) break;
      out.push(s.videoUrl);
    }
    return out;
  }, [video]);
  const truncated = (video?.segments?.length ?? 0) > playable.length;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/branch/videos/${encodeURIComponent(id ?? "")}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!alive) return;
        setVideo(data.video);
        setPhase("poster");
      } catch {
        if (alive) setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  /** 换段之后要显式 load+play：只改 src 的话部分 WebView 停在上一段的最后一帧 */
  useEffect(() => {
    if (phase !== "playing") return;
    const el = videoRef.current;
    if (!el) return;
    el.load();
    void el.play().catch(() => {
      /* 被自动播放策略拦下时退回海报态，等用户再点一次 */
      setPhase("poster");
    });
  }, [phase, segIdx]);

  function start() {
    setSegIdx(0);
    setPhase(playable.length ? "playing" : "done");
  }

  function onEnded() {
    if (segIdx + 1 < playable.length) setSegIdx((i) => i + 1);
    else setPhase("done");
  }

  const author = video?.author?.displayName || video?.author?.username || "";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col p-4">
      {/* 顶栏：品牌 + 常驻下载入口。弹层只在看完出现，顶栏管「没看完就想装」的人 */}
      <header className="mb-3 flex items-center gap-3">
        <img src="/app-icon.png" alt="" className="h-9 w-9 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{t("videoPreview.appName")}</p>
          <p className="truncate text-xs text-gray-400">{t("videoPreview.tagline")}</p>
        </div>
        <Link
          to="/download"
          className="shrink-0 rounded-full bg-cyan-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-400"
        >
          {t("videoPreview.getApp")}
        </Link>
      </header>

      {phase === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">{t("videoPreview.loading")}</div>
      )}

      {phase === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-gray-300">{t("videoPreview.unavailable")}</p>
          <Link to="/download" className="rounded-full bg-cyan-500 px-6 py-2 text-sm font-medium text-white">
            {t("videoPreview.getAppLong")}
          </Link>
        </div>
      )}

      {video && phase !== "loading" && phase !== "error" && (
        <>
          {/* 竖屏画框：9:16，圆角黑底。段间切换靠 key 强制重建 <video>，
              复用同一节点的话 iOS WebView 会带着上一段的 currentTime 起播 */}
          <div className="relative mx-auto w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "9 / 16" }}>
            {phase === "poster" || phase === "done" ? (
              <>
                {video.cover && (
                  <img src={video.cover} alt={video.title} className="absolute inset-0 h-full w-full object-cover" />
                )}
                {phase === "poster" && (
                  <button
                    onClick={start}
                    className="absolute inset-0 flex items-center justify-center bg-black/30"
                    aria-label={t("videoPreview.play")}
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
                      <Play className="ml-1 h-8 w-8 text-gray-900" fill="currentColor" />
                    </span>
                  </button>
                )}
              </>
            ) : (
              <video
                key={segIdx}
                ref={videoRef}
                src={playable[segIdx]}
                className="absolute inset-0 h-full w-full object-contain"
                playsInline
                controls
                onEnded={onEnded}
              />
            )}
            {phase === "playing" && playable.length > 1 && (
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                {segIdx + 1} / {playable.length}
              </span>
            )}

            {/* 看完弹层。盖在画框内而不是全屏 portal：这一页没有 transform 祖先，
                但盖画框视觉上更聚焦，也不挡顶栏那个常驻入口 */}
            {phase === "done" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75 p-6 text-center">
                <img src="/app-icon.png" alt="" className="h-16 w-16 rounded-2xl shadow-lg" />
                <p className="text-base font-semibold text-white">
                  {truncated ? t("videoPreview.doneTruncated") : t("videoPreview.doneTitle")}
                </p>
                <p className="text-sm text-gray-300">{t("videoPreview.doneSub")}</p>
                <Link
                  to="/download"
                  className="flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-400"
                >
                  <Download className="h-4 w-4" /> {t("videoPreview.getAppLong")}
                </Link>
                <button onClick={start} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200">
                  <RotateCcw className="h-3.5 w-3.5" /> {t("videoPreview.replay")}
                </button>
              </div>
            )}
          </div>

          <div className="mt-3">
            <h1 className="text-base font-semibold text-white">{video.title}</h1>
            <p className="mt-0.5 text-xs text-gray-400">
              {author && <>@{author} · </>}
              {t("videoPreview.plays", { count: video.plays ?? 0 })}
            </p>
            {video.description && <p className="mt-2 text-sm leading-relaxed text-gray-300">{video.description}</p>}
          </div>
        </>
      )}
    </div>
  );
}
