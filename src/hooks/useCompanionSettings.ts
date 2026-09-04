/**
 * @file useCompanionSettings.ts - 读当前用户的数字人设置（GET /api/companion/settings），并跟着改动事件刷新
 * @category Hook
 *
 * 人格详情页、模型市场列表 / 详情、首页舞台都要知道「现在用的是哪个人格 / 哪个模型」，
 * 而这些页面之间不共享 state —— 谁改了设置（updateCompanionSettings）就广播 COMPANION_UPDATED_EVENT，
 * 挂着这个 hook 的组件各自重新拉一次。规则只写在这里，页面不用各自写监听。
 *
 * ★ enabled=false（游客）时不发请求：接口要登录，游客打过去只会 401 并触发「登录过期」弹窗。
 * ★ ready 只在「已拿到结果或确定不需要拿」后为 true：首页舞台靠它避免先加载官方模型、再销毁重建成用户的模型。
 * ★ 登录态翻转时的重置写在渲染期而不是 effect 里（React 官方 "adjusting state while rendering" 写法，
 *   ArenaGate 也这么干）：effect 里同步 setState 会多跑一轮级联渲染，且被 react-hooks/set-state-in-effect 拦。
 */

import { useCallback, useEffect, useState } from "react";
import { COMPANION_UPDATED_EVENT, getCompanionSettings, type CompanionSettings } from "../api";

type State = {
  settings: CompanionSettings | null;
  ready: boolean;
  /** 这份 state 是为哪个 enabled 值准备的；和当前 enabled 不一致就说明登录态翻了，整份重置 */
  forEnabled: boolean;
};

function initialState(enabled: boolean): State {
  return { settings: null, ready: !enabled, forEnabled: enabled };
}

export function useCompanionSettings(enabled: boolean) {
  const [state, setState] = useState<State>(() => initialState(enabled));

  if (state.forEnabled !== enabled) setState(initialState(enabled));

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      getCompanionSettings()
        .then((next) => {
          if (alive) setState((prev) => ({ ...prev, settings: next, ready: true }));
        })
        .catch((error) => {
          // 取不到就当没设置（官方模型 + 默认人设），但要留痕，不然线上坏了没人知道
          console.warn("[companion] settings load failed", error);
          if (alive) setState((prev) => ({ ...prev, settings: null, ready: true }));
        });
    };
    load();
    window.addEventListener(COMPANION_UPDATED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(COMPANION_UPDATED_EVENT, load);
    };
  }, [enabled]);

  /** 调用方拿到 PUT 的响应后直接写入，不用等事件那一轮重拉 */
  const setSettings = useCallback((next: CompanionSettings | null) => {
    setState((prev) => ({ ...prev, settings: next, ready: true }));
  }, []);

  return { settings: state.settings, ready: state.ready, setSettings };
}
