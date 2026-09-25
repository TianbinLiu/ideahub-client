/**
 * /safety/ai-chat —— AI 聊天的安全说明（自伤危机协议的公开版本）。
 *
 * ★★ 这一页是**法定要求**，不是一份可选的表态：加州 SB 243（B&P §22602(b)(2)）要求
 *   「shall publish details on the protocol ... on the operator's internet website」。
 *   §22602(b)(1) 要求这套协议同时防止产出自伤内容并转介危机服务；§22604 要求提示
 *   「陪伴类机器人可能不适合部分未成年人」。纽约 GBL §1701/§1702 要求转介与 AI 身份告知。
 *
 * ★★ 正文只写**已经在做的事**（与 ChildSafetyPage、PrivacyPage 同一条纪律）：这是对监管与用户的陈述，
 *   写上一件没做的事就是不实陈述。所以 `limits` 那一段明写「会漏判也会误判、没有人工实时监看、
 *   不会替你报警」—— 不写这句，"我们怎么检测"读起来就像有 24 小时值守。
 *   ⇒ 以后真加了人工复核、分类模型或自动报警，回来改这一页和 chatSafety.service 的 PROTOCOL_VERSION。
 *
 * ★ 必须不登录可访问（与 /privacy、/child-safety 同理）：出事的时候没人会先去登录，
 *   而且监管与应用商店审核的人也没有账号。
 *
 * ★ 页面显示的**协议版本**取自服务端 /api/companion/config 的 safety.version（与 chatSafety.PROTOCOL_VERSION
 *   同源）。拿不到（老服务端 / 断网）就不显示版本号，不写死一个可能对不上的值。
 *
 * ★ 热线按**访问者所在地区**给：服务端按 Cloudflare 的国家码判定（US 988 / 大陆 12356 / 其它 findahelpline）。
 *   拿不到配置时退回一份静态清单，宁可多给一个号码，也不能让这一页空着。
 *
 * ★ 正文全部走 i18n，中英键集必须完全相等；「启梦」与「启梦创作」两个名字都要出现（与 ChildSafetyPage 同因）。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { getCompanionConfig, type CompanionSafetyConfig } from "../api";
import SiteFooter, { CONTACT_EMAIL } from "../components/SiteFooter";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold text-white">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

export default function AiSafetyPage() {
  const { t, i18n } = useTranslation();
  const [safety, setSafety] = useState<CompanionSafetyConfig | null>(null);

  useEffect(() => {
    let mounted = true;
    // ★ 带上界面语言：不带的话服务端按 zh 给，英文页面上会冒出整段中文热线
    getCompanionConfig(i18n.language?.startsWith("en") ? "en" : "zh")
      .then((cfg) => {
        if (mounted && cfg.safety) setSafety(cfg.safety);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
    // 同上：切语言要重拉，否则热线标签停在上一门语言
  }, [i18n.language]);

  const resources = safety?.resources?.length
    ? safety.resources.map((r) => `${r.label}${r.tel ? `（${r.tel}）` : ""}${r.url ? `：${r.url}` : ""}`)
    : (t("aiSafety.resourcesFallback", { returnObjects: true }) as string[]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header>
        <h1 className="text-2xl font-bold text-white">{t("aiSafety.title")}</h1>
        <p className="mt-1 text-sm text-gray-400">
          {t("aiSafety.updated")}
          {safety?.version ? ` · ${t("aiSafety.version", { version: safety.version })}` : ""}
        </p>
      </header>

      <Section title={t("aiSafety.scopeTitle")}>
        <p>{t("aiSafety.scopeBody")}</p>
      </Section>

      <Section title={t("aiSafety.detectTitle")}>
        <p>{t("aiSafety.detectBody")}</p>
        <Bullets items={t("aiSafety.detectItems", { returnObjects: true }) as string[]} />
      </Section>

      <Section title={t("aiSafety.responseTitle")}>
        <Bullets items={t("aiSafety.responseItems", { returnObjects: true }) as string[]} />
        <p className="mt-2 font-medium text-gray-200">{t("aiSafety.resourcesTitle")}</p>
        <Bullets items={resources} />
      </Section>

      <Section title={t("aiSafety.limitsTitle")}>
        <Bullets items={t("aiSafety.limitsItems", { returnObjects: true }) as string[]} />
      </Section>

      <Section title={t("aiSafety.disclosureTitle")}>
        <Bullets items={t("aiSafety.disclosureItems", { returnObjects: true }) as string[]} />
      </Section>

      <Section title={t("aiSafety.minorsTitle")}>
        <p>{t("aiSafety.minorsBody")}</p>
      </Section>

      <Section title={t("aiSafety.dataTitle")}>
        <Bullets items={t("aiSafety.dataItems", { returnObjects: true }) as string[]} />
        <p className="text-xs text-gray-400">
          <Link to="/privacy" className="underline hover:text-gray-300">
            {t("aiSafety.privacyLink")}
          </Link>
        </p>
      </Section>

      <Section title={t("aiSafety.contactTitle")}>
        <p>
          {t("aiSafety.contactBody")}{" "}
          <a className="underline hover:text-gray-300" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>

      <SiteFooter />
    </div>
  );
}
