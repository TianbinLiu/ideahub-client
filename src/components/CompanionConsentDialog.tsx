/**
 * @file CompanionConsentDialog.tsx - 第一次和小梦聊天前的告知与同意
 * @category Component
 * @requires_auth true（游客点输入框先弹登录框，轮不到这里）
 * @i18n_module companion
 *
 * 加州 SB 243：§22602(a) 要求清楚告知对方是 AI；§22604 要求提示「陪伴类机器人可能不适合部分未成年人」。
 * 纽约 GBL §1702 要求交互开始时告知。这一页把这些话一次说清，用户**必须主动点「我已了解」**才继续。
 *
 * ★ 同意记在服务端（PUT /api/companion/consent），不是 localStorage：换设备、换浏览器都要算数，
 *   而且这是我们履行告知义务的证据。版本变了（chatSafety.PROTOCOL_VERSION）要重新同意。
 * ★ 老服务端没有这个路由 → 404。这时**不挡用户**：把弹窗关掉照常聊（服务端那边也没开强制开关）。
 * ★ 求助热线在这里也列一次：第一次打开就知道出事了该找谁，而不是等到危机发生。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LifeBuoy, ShieldAlert } from "lucide-react";
import { acceptCompanionConsent, type CompanionSafetyConfig } from "../api";

type Props = {
  open: boolean;
  name: string;
  safety?: CompanionSafetyConfig;
  /** 同意（或老服务端没有这个路由）后继续；调用方据此把暂存的那句话发出去 */
  onAccepted: () => void;
  onCancel: () => void;
};

export default function CompanionConsentDialog({ open, name, safety, onAccepted, onCancel }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function accept() {
    setBusy(true);
    try {
      await acceptCompanionConsent();
    } catch {
      // 老服务端没有这个路由，或网络抖动：不因为记录失败挡住用户
    } finally {
      setBusy(false);
      onAccepted();
    }
  }

  const policyUrl = safety?.policyUrl || "/safety/ai-chat";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t("companion.consent.title")}>
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-white">
          <ShieldAlert className="h-4 w-4 text-cyan-300" /> {t("companion.consent.title", { name })}
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
          <li>· {t("companion.consent.isAi", { name })}</li>
          <li>· {t("companion.consent.mayErr")}</li>
          <li>· {t("companion.consent.minors")}</li>
          <li>· {t("companion.consent.data")}</li>
        </ul>

        {safety?.resources?.length ? (
          <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs leading-5 text-amber-100">
            <p className="inline-flex items-center gap-1.5 font-medium">
              <LifeBuoy className="h-3.5 w-3.5" /> {t("companion.consent.crisisTitle")}
            </p>
            <p className="mt-1 text-amber-100/90">
              {safety.resources.map((r) => `${r.label}${r.tel ? ` ${r.tel}` : ""}`).join("；")}
            </p>
          </div>
        ) : null}

        <p className="mt-3 text-[11px] text-gray-500">
          <Link to={policyUrl} className="underline hover:text-gray-300">
            {t("companion.consent.policyLink")}
          </Link>
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500">
            {t("companion.consent.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void accept()}
            disabled={busy}
            className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
          >
            {busy ? t("companion.consent.accepting") : t("companion.consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
