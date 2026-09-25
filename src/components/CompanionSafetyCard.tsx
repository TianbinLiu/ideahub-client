/**
 * @file CompanionSafetyCard.tsx - 危机求助卡（聊天框上方的系统卡片）
 * @category Component
 * @i18n_module companion
 *
 * 服务端检测到自伤 / 自杀表达（用户这句，或模型要说的那句）时通过 SSE 的 `safety` 事件推下来。
 * 依据：加州 SB 243（B&P §22602(b)(1)）与纽约 GBL §1701 —— 必须转介危机服务。
 *
 * ★ 它**不是小梦说的话**：不带名字、不走演出队列、**不合成语音**（CompanionChat 收到 safety 时先 stopAll）。
 *   把求助热线念成台词，既轻佻又会盖住用户此刻真正需要读到的号码。
 * ★ 号码按**所在地区**给（服务端定），不按界面语言：人在大陆却给 988 是帮不上忙的。
 * ★ 电话与短信用 tel: / sms: 链接，手机上点一下就能拨；桌面上至少号码是可选中复制的。
 * ★ 可以关掉，但不自动消失 —— 用户可能正需要盯着这几个号码。
 */
import { useTranslation } from "react-i18next";
import { LifeBuoy, X } from "lucide-react";
import type { CompanionSafetyCard as SafetyCard } from "../api";

type Props = { card: SafetyCard; onClose: () => void };

export default function CompanionSafetyCard({ card, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="mb-2 w-fit max-w-xl rounded-2xl border border-amber-700/70 bg-amber-950/80 px-4 py-3 text-sm leading-6 text-amber-50 shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-2">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{card.title}</p>
          <p className="mt-1 text-amber-100/90">{card.body}</p>
          <ul className="mt-2 space-y-1.5">
            {card.resources.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-amber-100">{r.label}</span>
                {r.tel ? (
                  <a className="rounded-full bg-amber-500/25 px-2.5 py-0.5 text-amber-50 hover:bg-amber-500/40" href={`tel:${r.tel}`}>
                    {t("companion.safety.call", { number: r.tel })}
                  </a>
                ) : null}
                {r.sms ? (
                  <a className="rounded-full bg-amber-500/25 px-2.5 py-0.5 text-amber-50 hover:bg-amber-500/40" href={`sms:${r.sms}`}>
                    {t("companion.safety.text", { number: r.sms })}
                  </a>
                ) : null}
                {r.url ? (
                  <a className="underline decoration-amber-400/60 hover:text-white" href={r.url} target="_blank" rel="noreferrer noopener">
                    {t("companion.safety.open")}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <a className="mt-2 inline-block text-[11px] text-amber-200/80 underline hover:text-amber-100" href={card.policyUrl}>
            {t("companion.safety.policyLink")}
          </a>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-amber-200/70 hover:text-white"
          title={t("companion.safety.dismiss")}
          aria-label={t("companion.safety.dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
