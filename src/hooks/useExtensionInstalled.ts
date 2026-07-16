/**
 * @file useExtensionInstalled.ts - 卢本伟广场 · 浏览器插件安装探测
 * @category Hook
 * @i18n none（仅返回状态，文案由调用方负责）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 的 hooks 章节
 *
 * 职责:
 * - 用 PING/PONG 探测「本页是否有卢本伟广场插件在跑」，供门禁（ArenaGate）与炸弹入口判断
 * - 只在 mount 与 recheck() 时【各探一次】：★不做轮询。插件装没装是低频事件，
 *   为它每秒发一次 postMessage 会白占 CPU、还把每个页面变成消息噪音源
 *
 * ===== 插件探测协议（冻结契约，勿改） =====
 *   网页发：{ __lbw:true, kind:"PING", reqId }                      , location.origin
 *   插件回：{ __lbw:true, kind:"PONG", reqId, ok:true, version }    , location.origin
 *
 *   ★PING 与 GET_SETTINGS 共用同一套 origin 门禁：插件只在可信站点应答。
 *     不可信站点 → 插件【完全不回包】（而非回 ok:false）——回了就等于向任意网站承认
 *     「此人装了卢本伟广场插件」，那是一条指纹/追踪通道。
 *   ★因此网页这侧：超时 = missing，这是唯一的判定方式，别指望拿到失败回包。
 *
 * 被使用于:
 * @used_in ../components/ArenaGate.tsx - /arena 路由守卫
 * @used_in ../components/Navbar.tsx - 炸弹入口点击前的判断
 */

import { useCallback, useEffect, useState } from "react";

/** checking = 探测中（含 recheck 重探）；installed = 收到 PONG；missing = 超时未回 */
export type ExtensionStatus = "checking" | "installed" | "missing";

export type UseExtensionInstalledResult = {
  status: ExtensionStatus;
  /** 插件自报版本号；未安装 / 未回包时为 "" */
  version: string;
  /** 重新探测一次（例如用户点了「我已装好，重新检测」） */
  recheck: () => void;
};

/** 契约要求：PING 后 1.5s 无回应 = 未安装 */
const PING_TIMEOUT_MS = 1500;

function newReqId() {
  return `lbw-ping-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useExtensionInstalled(): UseExtensionInstalledResult {
  // 自增即触发一次探测：mount 时跑一次，recheck() 每调一次多跑一次。没有 interval。
  const [probeId, setProbeId] = useState(0);
  const [status, setStatus] = useState<ExtensionStatus>("checking");
  const [version, setVersion] = useState("");

  useEffect(() => {
    const reqId = newReqId();
    const origin = window.location.origin;
    // settled 防止「超时判 missing」与「迟到的 PONG」互相覆盖
    let settled = false;

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent) {
      if (settled) return;
      // 与设置桥同款过滤：只认本页、同源、本协议、且 reqId 对得上的回包
      if (event.source !== window) return;
      if (event.origin !== origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;
      if (data.__lbw !== true) return;
      if (data.kind !== "PONG") return;
      if (data.reqId !== reqId) return;
      if (data.ok !== true) return;

      settled = true;
      cleanup();
      setVersion(typeof data.version === "string" ? data.version : "");
      setStatus("installed");
    }

    function settleAsMissing() {
      if (settled) return;
      settled = true;
      cleanup();
      setVersion("");
      setStatus("missing");
    }

    const timer = window.setTimeout(settleAsMissing, PING_TIMEOUT_MS);
    window.addEventListener("message", onMessage);

    try {
      window.postMessage({ __lbw: true, kind: "PING", reqId }, origin);
    } catch (e) {
      // postMessage 理论上不该抛（对象可结构化克隆、origin 合法），真抛了说明页面环境已经不正常，
      // 此时等超时没意义，直接判 missing；但别静默吞掉原因
      if (import.meta.env.DEV) console.warn("[useExtensionInstalled] PING 发送失败：", e);
      settleAsMissing();
    }

    // 卸载 / 下一次探测前：摘监听 + 清定时器，避免泄漏与 setState-after-unmount
    return cleanup;
  }, [probeId]);

  // 「回到 checking」放在 recheck 里而不是 effect body 里：状态重置是这个点击事件的直接后果，
  // 写在事件里就是一次渲染；写进 effect 就变成「渲染→effect→再设状态→再渲染」的级联。
  // 初始值本来就是 "checking"，所以 mount 那次不需要谁来重置。
  const recheck = useCallback(() => {
    setStatus("checking");
    setVersion("");
    setProbeId((n) => n + 1);
  }, []);

  return { status, version, recheck };
}

export default useExtensionInstalled;
