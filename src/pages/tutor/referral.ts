// 引流位度量（tutor 仓 docs/06 §5.1「度量（每条都能防刷）」）：各入口带 ?from=，落到 /tutor 那几页时 POST 一行，然后把 from 从地址栏抹掉 ——
// 刷新 / 回退不重复记；同一来源一个会话只发一次（sessionStorage），服务端另按天去重、白名单外不记。**只记不奖励**，失败静默：度量不该挡人上课。
// ★ 唯一实现：TutorHomePage 与 TutorNewPage 都挂它，别在页面里各写一份（两份必然一份漏掉抹参数那一步，回退键就会再记一次）。
import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router";
import { postReferral } from "../../api/tutor";

export function useTutorReferral() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const from = params.get("from");
  useEffect(() => {
    if (!from) return;
    const key = `tutor.referral.${from}`;
    let sent = false;
    try { sent = !!sessionStorage.getItem(key); if (!sent) sessionStorage.setItem(key, "1"); } catch { /* 隐私模式没有 sessionStorage：那就发一次 */ }
    if (!sent) void postReferral(from, `${location.pathname}${location.search}`).catch(() => { /* 只记不奖励，失败不打扰 */ });
    const next = new URLSearchParams(params);
    next.delete("from");
    setParams(next, { replace: true });
  }, [from, params, setParams, location.pathname, location.search]);
}
