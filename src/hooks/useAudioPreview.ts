/**
 * @file useAudioPreview.ts - 「试听」按钮共用的播放逻辑：拿 Blob → object URL → <audio>，播完 / 出错 / 卸载都 revoke
 * @category Hook
 *
 * 试听按钮有六七处（音频表单、混音器、声音市场卡片、模板详情、模板选择器每一行、首页声音面板），
 * 每处各自管 audio / URL 迟早有一处忘了 revoke —— 每试听一次就漏一段 mp3 在内存里。
 * ★ 全站同一时刻只放一段：市场列表一排卡片各有试听，新的一开就把上一段停掉（模块级 activeStop），
 *   不然三个声音叠着响，用户分不清在听谁。
 * ★ seq 计数：合成要一两秒，期间用户又点了停止 / 换了配方 → 旧的 Blob 回来时 seq 已变，直接丢弃不播。
 * ★ 错误在这里统一 toast（voiceErrorMessage：服务端的中文人话优先）：调用方只管给「怎么拿 Blob」。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { voiceErrorMessage } from "../companion/voiceTemplates";

/** 正在放的那一个：owner 是该 hook 实例的身份令牌（stop 自己不能引用自己，React Compiler 的 lint 会拦），stop 是它的停止函数 */
let active: { owner: object; stop: () => void } | null = null;

export function useAudioPreview() {
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef("");
  const seqRef = useRef(0);
  const ownerRef = useRef<object>({});

  const stop = useCallback(() => {
    seqRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
      audio.removeAttribute("src");
      audioRef.current = null;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    if (active?.owner === ownerRef.current) active = null;
    setPlaying(false);
    setBusy(false);
  }, []);

  // 卸载（离开页面 / 关弹窗）即停 + revoke
  useEffect(() => () => stop(), [stop]);

  const play = useCallback(
    async (load: () => Promise<Blob>) => {
      stop();
      if (active && active.owner !== ownerRef.current) active.stop();
      active = { owner: ownerRef.current, stop };
      const seq = seqRef.current;
      setBusy(true);
      try {
        const blob = await load();
        if (seq !== seqRef.current) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        urlRef.current = url;
        audioRef.current = audio;
        audio.addEventListener("ended", stop, { once: true });
        audio.addEventListener("error", stop, { once: true });
        setBusy(false);
        setPlaying(true);
        await audio.play();
      } catch (e) {
        if (seq !== seqRef.current) return;
        stop();
        toast.error(voiceErrorMessage(e));
      }
    },
    [stop]
  );

  /** 按钮的一键行为：在放 / 在合成 → 停；否则开始 */
  const toggle = useCallback(
    (load: () => Promise<Blob>) => {
      if (busy || playing) stop();
      else void play(load);
    },
    [busy, playing, play, stop]
  );

  return { busy, playing, play, stop, toggle };
}
