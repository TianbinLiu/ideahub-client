// 成人声明（tutor 仓 docs/02 1.1，v1 只做成人）。★ 真相在 server 的 User.tutorAdultDeclaredAt（POST /api/tutor/declare-adult），
// localStorage 那份只是离线兜底 / 缓存：换机、重装都不该再问一遍，而只记本地的话每台设备都会问。
// 单独成文件是因为页面文件只准导出组件（react-refresh/only-export-components），TutorHomePage 与 TutorNewPage 都要问它。
import { getTutorConfig } from "../../api/tutor";

export const ADULT_KEY = "tutor.adultDeclaredAt";
/** 本地缓存的那一份（离线兜底）；真相在服务端，见 assertAdultDeclared */
export function adultDeclared() { try { return !!localStorage.getItem(ADULT_KEY); } catch { return true; } }
export function cacheAdult(at: string | null) { try { if (at) localStorage.setItem(ADULT_KEY, at); else localStorage.removeItem(ADULT_KEY); } catch { /* 隐私模式 */ } }
/** 问服务端「声明过没有」；问不到（离线 / 老服务器）就按本地缓存 */
export async function assertAdultDeclared(): Promise<boolean> {
  try { const c = await getTutorConfig(); cacheAdult(c.adultDeclared ? c.adultDeclaredAt || new Date().toISOString() : null); return c.adultDeclared; } catch { return adultDeclared(); }
}
