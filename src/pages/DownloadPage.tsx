/**
 * /download —— 安卓 App「启梦」的安装包下载页。
 *
 * 数据只有一处出处：服务端的 `/api/app/latest.json`（它再从 GitHub Release 转一手，
 * 版本号/大小/sha256 由 App 仓的发版脚本生成）。**这一页不许写死任何版本号** ——
 * 写死的那一刻它就开始过期，而且没有人会发现。
 *
 * ★ 版本信息取不到时**照样给下载按钮**：按钮打的是服务端固定短链，跟清单不是同一条链路。
 *   清单挂了就少显示几行字，不该把人直接挡在门外。
 *
 * public/app-icon.png 是 App 仓 launcher 图标的副本（ideahub-app 的
 * android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png）；换图标时记得两边都换。
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, ShieldCheck, Smartphone } from "lucide-react";
import { APP_DOWNLOAD_URL, getAppLatest, type AppRelease } from "../api";
import { encodeQr, qrSvgPath } from "../utils/qrcode";

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // ★ iPadOS 13 起的 Safari 把自己报成 Macintosh，只能靠触摸点数区分；
  //   判错的后果是给 iPad 用户显示一张"扫码在手机上打开"的二维码，扫了还是这一页
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

/** 微信/QQ 内置浏览器：点下载会被拦下来（它们不放行 apk），必须提示去系统浏览器打开 */
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger|QQ\/|QQBrowser|Weibo|DingTalk/i.test(navigator.userAgent);
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** 扫码要落到这一页本身，而不是直接指向 apk：直连下载在多数扫码器的内置浏览器里会被拦 */
function QrCard({ url, caption }: { url: string; caption: string }) {
  const qr = useMemo(() => {
    try {
      const matrix = encodeQr(url);
      return { size: matrix.length, path: qrSvgPath(matrix) };
    } catch {
      return null; // 网址长到超出编码器上限时宁可不画（正常站内网址不会）
    }
  }, [url]);

  if (!qr) return null;
  const quiet = 4; // 静区：少于 4 个模块，很多扫码器找不到定位图案

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`${-quiet} ${-quiet} ${qr.size + quiet * 2} ${qr.size + quiet * 2}`}
        className="h-44 w-44 rounded-xl"
        shapeRendering="crispEdges"
        role="img"
        aria-label={caption}
      >
        <rect
          x={-quiet}
          y={-quiet}
          width={qr.size + quiet * 2}
          height={qr.size + quiet * 2}
          fill="#ffffff"
        />
        <path d={qr.path} fill="#000000" />
      </svg>
      <p className="text-xs text-gray-400">{caption}</p>
    </div>
  );
}

export default function DownloadPage() {
  const { t } = useTranslation();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [manifestFailed, setManifestFailed] = useState(false);
  const platform = useMemo(() => detectPlatform(), []);
  const inAppBrowser = useMemo(() => isInAppBrowser(), []);
  const pageUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;

  useEffect(() => {
    let alive = true;
    getAppLatest()
      .then((r) => alive && setRelease(r))
      .catch(() => alive && setManifestFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const steps = [t("download.step1"), t("download.step2"), t("download.step3")];

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="flex items-center gap-4">
        <img
          src="/app-icon.png"
          alt=""
          className="h-20 w-20 rounded-2xl border border-gray-800"
          width={80}
          height={80}
        />
        <div>
          <h1 className="text-2xl font-bold text-white">{t("download.title")}</h1>
          <p className="mt-1 text-sm text-gray-400">{t("download.tagline")}</p>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
          <span className="inline-flex items-center gap-1 text-gray-300">
            <Smartphone className="h-4 w-4" /> {t("download.androidOnly")}
          </span>
          {release && (
            <>
              <span aria-hidden>·</span>
              <span>{t("download.version", { version: release.versionName })}</span>
              <span aria-hidden>·</span>
              <span>{formatSize(release.sizeBytes)}</span>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={APP_DOWNLOAD_URL}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-gray-950 hover:bg-cyan-400"
          >
            <Download className="h-5 w-5" />
            {release
              ? t("download.buttonWithSize", { size: formatSize(release.sizeBytes) })
              : t("download.button")}
          </a>
          {platform === "ios" && <p className="text-sm text-amber-300">{t("download.iosNotice")}</p>}
        </div>

        {/* ★ 清单取不到只是少显示几行版本信息，下载按钮照常可用（两者不是同一条链路） */}
        {manifestFailed && <p className="mt-3 text-sm text-gray-500">{t("download.manifestUnavailable")}</p>}

        {inAppBrowser && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t("download.inAppBrowserWarning")}
          </p>
        )}
      </section>

      {release?.notes && (
        <section className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="font-semibold text-white">
            {t("download.notesTitle", { version: release.versionName })}
          </h2>
          {/* 更新说明就是几行短文本（App 仓的 RELEASE_NOTES.md 原样透传）——
              为它把 markdown 渲染器拉进这一页的 chunk 不值得 */}
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{release.notes}</p>
        </section>
      )}

      <section className="mt-4 grid gap-5 rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:grid-cols-[1fr_auto]">
        <div>
          <h2 className="font-semibold text-white">{t("download.howToTitle")}</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-300">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs text-gray-400">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-gray-500">{t("download.reinstallNotice")}</p>
        </div>

        {/* 手机上扫自己没有意义，只在桌面端画 */}
        {platform === "desktop" && pageUrl && (
          <QrCard url={pageUrl} caption={t("download.qrCaption")} />
        )}
      </section>

      {release && (
        <details className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <summary className="cursor-pointer text-sm text-gray-300">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> {t("download.checksumTitle")}
            </span>
          </summary>
          <p className="mt-3 text-xs text-gray-400">{t("download.checksumHint")}</p>
          <code className="mt-2 block break-all rounded-lg bg-gray-950 p-3 font-mono text-xs text-gray-300">
            {release.sha256}
          </code>
        </details>
      )}
    </div>
  );
}
