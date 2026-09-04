/**
 * 站点页脚：运营主体 + 联系方式 + 隐私政策入口。
 *
 * ★ 为什么单独抽一个组件而不是各页各写：这三样是**对外承诺**，而且是应用市场与
 *   开放平台（微信/QQ/Google Play）审核会逐条核对的东西。抄成两份之后，改了一处
 *   漏了另一处，外面看到的就是两个互相矛盾的主体或两个联系地址 —— 而这不会有任何
 *   报错，只会在审核被驳回时才发现。
 *
 * ★ 目前只挂在 /download、/privacy 与 /child-safety 上：这两页是给**站外来的人**看的（应用市场、
 *   开放平台审核、扫二维码进来的人），站内功能页不需要。要加到别处直接引这个组件。
 */
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

/** 联系邮箱只写这一处。隐私政策正文里也引它，改地址时不会漏 */
export const CONTACT_EMAIL = "support@ideahubs.org";

export default function SiteFooter() {
  const { t } = useTranslation();
  // ★ 站在某一页时不再列指向本页的链接 —— 点了什么都不发生，看起来像坏了。
  //   （原来只有隐私政策一条时是写死的布尔；加了儿童安全标准之后收成一张表，
  //   否则每加一页就要多一个 onXxxPage 布尔，而漏掉的表现正是上面那句。）
  const here = useLocation().pathname;
  const LINKS = [
    { to: "/privacy", label: t("siteFooter.privacy") },
    // ★ 这条是 Google Play 对 Social 类应用的硬要求（见 pages/ChildSafetyPage 顶注）。
    //   页脚挂它不只是为了好看：Play 审核就是从站外点进来的，页脚是站内唯一的入口。
    { to: "/child-safety", label: t("siteFooter.childSafety") },
  ].filter((l) => l.to !== here);
  return (
    <footer className="mt-8 border-t border-gray-800 pt-5 text-xs text-gray-500">
      <p>{t("siteFooter.operator")}</p>
      <p className="mt-1">
        {t("siteFooter.contact")}{" "}
        <a className="text-gray-400 underline hover:text-gray-300" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
      {LINKS.length > 0 && (
        <p className="mt-2 space-x-4">
          {LINKS.map((l) => (
            <Link key={l.to} className="text-gray-400 underline hover:text-gray-300" to={l.to}>
              {l.label}
            </Link>
          ))}
        </p>
      )}
    </footer>
  );
}
