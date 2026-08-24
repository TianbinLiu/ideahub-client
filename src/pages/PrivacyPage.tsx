/**
 * /privacy —— 隐私政策。
 *
 * ★★ 这一页的内容**必须与代码里真实发生的事一致**，不是一份可以抄来的模板。
 *   写它之前逐条核过了：User 模型里实际存的字段、IP 的三处用法（geoip 判国家 /
 *   限流计数 / 浏览去重时加 pepper 哈希）、出网的第三方清单（方舟、Cloudinary、
 *   Resend、阿里云 PNVS、QQ互联、MiniMax/Runway、Atlas）、注销是软删除+踢登录态。
 *   ⇒ 以后**新增任何一个会拿到用户数据的第三方、或改变 IP 的用法，都要回来改这一页**。
 *   漏改不会有任何报错，但它会让一份对外承诺变成不实陈述。
 *
 * ★ 必须不登录可访问（和 /download 同理）：应用市场与开放平台审核的人没有账号，
 *   挂在 ProtectedRoute 后面等于审核员点开只看到登录页。
 *
 * ★ 正文全部走 i18n：这个站按浏览器语言在中英之间切，隐私政策是最不该只有一种
 *   语言的一页。
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

/** 项目符号列表：第三方清单与权利清单都用它 */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header>
        <h1 className="text-2xl font-bold text-white">{t("privacy.title")}</h1>
        <p className="mt-1 text-sm text-gray-400">{t("privacy.updated")}</p>
      </header>

      <Section title={t("privacy.whoTitle")}>
        <p>{t("privacy.whoBody")}</p>
      </Section>

      <Section title={t("privacy.collectTitle")}>
        <p>{t("privacy.collectIntro")}</p>
        <Bullets
          items={[
            t("privacy.collectAccount"),
            t("privacy.collectOauth"),
            t("privacy.collectContent"),
            t("privacy.collectAuto"),
          ]}
        />
      </Section>

      <Section title={t("privacy.useTitle")}>
        <p>{t("privacy.useBody")}</p>
      </Section>

      <Section title={t("privacy.shareTitle")}>
        <p>{t("privacy.shareIntro")}</p>
        <Bullets
          items={[
            t("privacy.shareArk"),
            t("privacy.shareRealPerson"),
            t("privacy.shareCloudinary"),
            t("privacy.shareEmail"),
            t("privacy.shareSms"),
            t("privacy.shareOauth"),
            t("privacy.shareDb"),
          ]}
        />
        <p>{t("privacy.shareLegal")}</p>
      </Section>

      <Section title={t("privacy.storageTitle")}>
        <p>{t("privacy.storageWhere")}</p>
        <p>{t("privacy.storageHowLong")}</p>
      </Section>

      <Section title={t("privacy.localTitle")}>
        <p>{t("privacy.localBody")}</p>
      </Section>

      <Section title={t("privacy.rightsTitle")}>
        <Bullets
          items={[
            t("privacy.rightsEdit"),
            t("privacy.rightsCache"),
            t("privacy.rightsDeactivate"),
            t("privacy.rightsContact", { email: CONTACT_EMAIL }),
          ]}
        />
      </Section>

      <Section title={t("privacy.minorsTitle")}>
        <p>{t("privacy.minorsBody")}</p>
      </Section>

      <Section title={t("privacy.changesTitle")}>
        <p>{t("privacy.changesBody")}</p>
      </Section>

      <SiteFooter />
    </div>
  );
}
