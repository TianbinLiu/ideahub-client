/**
 * /child-safety —— 儿童安全标准（CSAE）。
 *
 * ★★ 这一页是 **Google Play 的硬门禁**，不是一份可选的表态文档。
 *   Play 对 Social / Dating / 匿名随机聊天类应用要求「published standards against
 *   child sexual abuse and exploitation」，并在 Play Console 里逐条核这份网页资源：
 *   ① 打得开、不报错；② 内容真的在讲 CSAE / 儿童安全；③ **出现应用名或开发者名，
 *   且要与商店条目上的写法一致**。第三条最容易漏 —— 我们的商店名是「启梦」
 *   （android/app/src/main/res/values/strings.xml 的 app_name），网站品牌却是
 *   「启梦创作」，所以正文（childSafety.scopeBody）里**两个名字都写了**。
 *   改任何一个名字之前先看 app 仓 memory `qimeng-brand-names` 那张对照表。
 *
 * ★★ 正文只写**已经在做的事**（与 PrivacyPage 同一条纪律，也与 app 仓
 *   data/agreements.tsx 的 ★ 同源）：这是一份对监管与用户的陈述，写上一件没做的事
 *   就是不实陈述，而且是在最不能含糊的题目上。所以 `detectHonest` 那一段**明写我们
 *   没有做全量哈希比对**（PhotoDNA / CSAI Match）—— 不写这句，"我们怎么发现"读起来
 *   就像有自动化检测。⇒ 以后真接了哈希比对、或接了任何新的检测/上报链路，回来改这一页。
 *
 * ★ 必须不登录可访问（与 /privacy、/download 同理）：Play 审核的人没有账号，
 *   挂在 ProtectedRoute 后面等于他点开只看到登录页 —— 而"打得开"正是三条判据之一。
 *
 * ★ 正文全部走 i18n（中英各一份，键集必须完全相等）：少一个键的表现是页面上直接
 *   显示出原始 key，而这一页是给审核的人看的。
 *
 * ★ 邮箱只走 CONTACT_EMAIL 一处（SiteFooter 导出的那份），别在正文里硬写地址：
 *   儿童安全联系人是 Play Console 里要单独登记的一项，两处不一致时对外是两个联系人。
 */
import { useTranslation } from "react-i18next";
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

export default function ChildSafetyPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header>
        <h1 className="text-2xl font-bold text-white">{t("childSafety.title")}</h1>
        <p className="mt-1 text-sm text-gray-400">{t("childSafety.updated")}</p>
      </header>

      <Section title={t("childSafety.scopeTitle")}>
        <p>{t("childSafety.scopeBody")}</p>
      </Section>

      <Section title={t("childSafety.stanceTitle")}>
        <p>{t("childSafety.stanceBody")}</p>
      </Section>

      <Section title={t("childSafety.bannedTitle")}>
        <Bullets
          items={[
            t("childSafety.banned1"),
            t("childSafety.banned2"),
            t("childSafety.banned3"),
            t("childSafety.banned4"),
            t("childSafety.banned5"),
          ]}
        />
      </Section>

      <Section title={t("childSafety.detectTitle")}>
        <p>{t("childSafety.detectGen")}</p>
        <p>{t("childSafety.detectReport")}</p>
        <p>{t("childSafety.detectHonest")}</p>
      </Section>

      {/* ★ 举报那一节是 Play 要核的第二项「in-app mechanism for user feedback」的对外说明。
          正文里写的三个入口（作品 / 评论 / 弹幕）与 app 仓 ReportButton 的实际挂载点
          一一对应；哪天少挂一处，这里也要跟着改。 */}
      <Section title={t("childSafety.reportTitle")}>
        <p>{t("childSafety.reportInApp")}</p>
        <p>{t("childSafety.reportEmail", { email: CONTACT_EMAIL })}</p>
        <p className="text-white">{t("childSafety.reportContact", { email: CONTACT_EMAIL })}</p>
        {/* 紧迫危险那句用醒目色：这是全页唯一一条"别等我们"的指引 */}
        <p className="text-amber-300">{t("childSafety.reportUrgent")}</p>
      </Section>

      <Section title={t("childSafety.actTitle")}>
        <Bullets
          items={[
            t("childSafety.act1"),
            t("childSafety.act2"),
            t("childSafety.act3"),
            t("childSafety.act4"),
          ]}
        />
      </Section>

      <Section title={t("childSafety.lawTitle")}>
        <p>{t("childSafety.lawBody")}</p>
      </Section>

      <Section title={t("childSafety.minorsTitle")}>
        <p>{t("childSafety.minorsBody")}</p>
      </Section>

      <Section title={t("childSafety.changesTitle")}>
        <p>{t("childSafety.changesBody")}</p>
      </Section>

      <SiteFooter />
    </div>
  );
}
