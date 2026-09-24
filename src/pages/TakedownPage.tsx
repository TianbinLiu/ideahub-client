/**
 * /takedown —— 非自愿私密影像（NCII）的移除请求。
 *
 * ★★ 这一页是 **TAKE IT DOWN Act（Pub. L. 119-12）§3 的法定要求**，不是一份可选的表态：
 *   §3(a) 要求平台在站上**显著公示**移除流程；§3(b) 要求收到有效请求后 **48 小时内**移除，
 *   并对**已知的相同副本**做合理查找。**2026-05-19 起 FTC 执法、无小企业豁免。**
 *
 * ★★ **必须不登录可访问，而且必须不要求注册。** 需要这条通道的人通常根本不是我们的用户 ——
 *   把表单挡在登录后面，这条通道对她就等于不存在。页面与接口（POST /api/takedown）都免登录。
 *
 * ★★ 正文只写**我们真的会做的事**（与 /child-safety、/privacy 同一条纪律）：
 *   · 我们能删的只有**我们自己托管的内容**，这句必须写明 —— 不写，读起来就像我们能让它从互联网上消失；
 *   · 48 小时是**法定上限**，写成「尽快，最迟 48 小时」，不写成「我们承诺 24 小时」这种做不到的漂亮话。
 *
 * ★ 四个法定要件（§3(b)(1)(A)）在表单里逐项标注，缺一项服务端会 400。
 *   标注不是装饰：填的人知道每一栏为什么要填，才不会把「签名」当成上传手写图片。
 *
 * ★ 涉及未成年人时另走一条更重的流程（/child-safety、依法上报），页面上必须给出指路 ——
 *   把这两件事混成一条流程，是把最紧急的那一类埋进普通队列。
 *
 * ★ 文案全部走 i18n，中英键集必须完全相等（少一个键的表现是页面上显示原始 key，
 *   而这一页可能是 FTC 或律师第一个打开的页面）。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import SiteFooter, { CONTACT_EMAIL } from "../components/SiteFooter";
import { submitTakedownRequest } from "../api";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold text-white">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
    </section>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan-700";

export default function TakedownPage() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; dueAt: string } | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    signature: "",
    onBehalf: "self" as "self" | "authorized",
    contactEmail: "",
    contactPhone: "",
    urls: "",
    locationNote: "",
    statement: "",
    affirmed: false,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // 一行一个链接。★ 在这里拆而不是让用户填 N 个输入框：需要用这张表的人往往手上
    //   有一串链接，逐个加输入框只会让她多点十几下。
    const urls = form.urls
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) {
      setError(t("takedown.errUrls"));
      return;
    }
    if (!form.affirmed) {
      setError(t("takedown.errAffirm"));
      return;
    }
    setBusy(true);
    try {
      const res = await submitTakedownRequest({
        signature: form.signature.trim(),
        onBehalf: form.onBehalf,
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        urls,
        locationNote: form.locationNote.trim(),
        statement: form.statement.trim(),
        affirmedNotConsensual: true,
      });
      setDone({ id: res.id, dueAt: res.dueAt });
    } catch (err) {
      // ★ 失败时把邮箱兜底给出来：这条通道不能因为我们的接口挂了就断掉。
      setError((err as Error)?.message || t("takedown.errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
          <ShieldAlert className="h-5 w-5 text-amber-300" /> {t("takedown.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-400">{t("takedown.updated")}</p>
      </header>

      <Section title={t("takedown.whoTitle")}>
        <p>{t("takedown.whoBody")}</p>
        <p className="text-amber-300">{t("takedown.minorsNote")}</p>
        <p>
          <Link to="/child-safety" className="underline hover:text-gray-100">
            {t("takedown.childSafetyLink")}
          </Link>
        </p>
      </Section>

      <Section title={t("takedown.slaTitle")}>
        <p>{t("takedown.slaBody")}</p>
        <p>{t("takedown.copiesBody")}</p>
        <p className="text-gray-400">{t("takedown.limitsBody")}</p>
      </Section>

      <Section title={t("takedown.needTitle")}>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>{t("takedown.need1")}</li>
          <li>{t("takedown.need2")}</li>
          <li>{t("takedown.need3")}</li>
          <li>{t("takedown.need4")}</li>
        </ul>
      </Section>

      {done ? (
        <div className="mt-6 rounded-2xl border border-emerald-800/70 bg-emerald-950/40 p-4 text-sm text-emerald-100">
          <p className="inline-flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> {t("takedown.doneTitle")}
          </p>
          <p className="mt-2">{t("takedown.doneBody", { id: done.id.slice(-6) })}</p>
          <p className="mt-1">{t("takedown.doneDue", { due: new Date(done.dueAt).toLocaleString() })}</p>
          <p className="mt-1 text-emerald-200/80">{t("takedown.doneContact", { email: CONTACT_EMAIL })}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
          <div>
            <label className="text-sm text-gray-300" htmlFor="td-sig">
              {t("takedown.fSignature")} <span className="text-amber-400">*</span>
            </label>
            <p className="text-xs text-gray-500">{t("takedown.fSignatureHint")}</p>
            <input id="td-sig" className={inputCls} value={form.signature} onChange={(e) => set("signature", e.target.value)} required maxLength={120} />
          </div>

          <fieldset>
            <legend className="text-sm text-gray-300">{t("takedown.fOnBehalf")}</legend>
            <div className="mt-1 flex gap-4 text-sm text-gray-300">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="onBehalf" checked={form.onBehalf === "self"} onChange={() => set("onBehalf", "self")} />
                {t("takedown.fOnBehalfSelf")}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="onBehalf" checked={form.onBehalf === "authorized"} onChange={() => set("onBehalf", "authorized")} />
                {t("takedown.fOnBehalfAuthorized")}
              </label>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-gray-300" htmlFor="td-email">
                {t("takedown.fEmail")} <span className="text-amber-400">*</span>
              </label>
              <input id="td-email" type="email" className={inputCls} value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} required maxLength={200} />
            </div>
            <div>
              <label className="text-sm text-gray-300" htmlFor="td-phone">
                {t("takedown.fPhone")}
              </label>
              <input id="td-phone" className={inputCls} value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} maxLength={40} />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-300" htmlFor="td-urls">
              {t("takedown.fUrls")} <span className="text-amber-400">*</span>
            </label>
            <p className="text-xs text-gray-500">{t("takedown.fUrlsHint")}</p>
            <textarea id="td-urls" rows={4} className={inputCls} value={form.urls} onChange={(e) => set("urls", e.target.value)} required />
          </div>

          <div>
            <label className="text-sm text-gray-300" htmlFor="td-where">
              {t("takedown.fWhere")}
            </label>
            <textarea id="td-where" rows={2} className={inputCls} value={form.locationNote} onChange={(e) => set("locationNote", e.target.value)} maxLength={2000} />
          </div>

          <div>
            <label className="text-sm text-gray-300" htmlFor="td-stmt">
              {t("takedown.fStatement")}
            </label>
            <p className="text-xs text-gray-500">{t("takedown.fStatementHint")}</p>
            <textarea id="td-stmt" rows={3} className={inputCls} value={form.statement} onChange={(e) => set("statement", e.target.value)} maxLength={2000} />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-200">
            <input type="checkbox" className="mt-1" checked={form.affirmed} onChange={(e) => set("affirmed", e.target.checked)} />
            <span>
              {t("takedown.fAffirm")} <span className="text-amber-400">*</span>
            </span>
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-500/25 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-500/40 disabled:opacity-50"
            >
              {busy ? t("takedown.submitting") : t("takedown.submit")}
            </button>
            <p className="text-xs text-gray-500">{t("takedown.orEmail", { email: CONTACT_EMAIL })}</p>
          </div>
        </form>
      )}

      <Section title={t("takedown.afterTitle")}>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>{t("takedown.after1")}</li>
          <li>{t("takedown.after2")}</li>
          <li>{t("takedown.after3")}</li>
        </ul>
      </Section>

      <Section title={t("takedown.falseTitle")}>
        <p>{t("takedown.falseBody")}</p>
      </Section>

      <Section title={t("takedown.privacyTitle")}>
        <p>{t("takedown.privacyBody")}</p>
      </Section>

      <SiteFooter />
    </div>
  );
}
