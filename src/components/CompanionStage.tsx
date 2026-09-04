/**
 * @file CompanionStage.tsx - 首页看板娘舞台（Live2D 画布，压在内容卡片之下）
 * @category Component
 * @requires_auth no
 *
 * 只负责：取模型、把它"站"到 anchorRef 指向的留白区域、跟随鼠标转头、尺寸变化时重摆。
 * 表情/动作/口型由 CompanionChat 通过 companionBus 驱动，本组件不认识对话。
 *
 * ★ 舞台画布覆盖整个左列，但模型按 anchorRef（留白 div）定位：这样推荐位展开时头部会"躲"在卡片后面，
 *   收起时留白变高、模型自动长大——这就是"看板娘在最底层"的全部实现，不需要任何 z-index 魔法。
 * ★ 画布不是这里 render 出来的：模型是全站单例、自带画布，这里只是 acquire 后 attach 进容器、卸载时 detach。
 *   离开首页再回来会重挂一次；如果每次都新建 WebGL 上下文，Cubism 缓存的着色器就属于旧上下文，画布一片空白
 *   （见 live2d/companionModel.ts 文件头）。
 * ★ 移动端不挂（父级 hidden lg:block）：手机上没有留白区域，也省掉 800KB 运行时。
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { CompanionModel } from "../live2d/companionModel";
import { companionBus } from "../companion/bus";

const MODEL_URL = "/live2d/mascot/mascot.model3.json";

type Props = {
  /** 模型脚踩的留白区域；为空时占满整个舞台 */
  anchorRef: RefObject<HTMLElement | null>;
  className?: string;
};

export default function CompanionStage({ anchorRef, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let alive = true;
    let model: CompanionModel | null = null;

    const fit = () => {
      if (!model) return;
      const wr = wrap.getBoundingClientRect();
      if (wr.width < 2 || wr.height < 2) return;
      model.resize(wr.width, wr.height);
      const a = anchorRef.current?.getBoundingClientRect();
      const rect = a
        ? { x: a.left - wr.left, y: a.top - wr.top, width: a.width, height: a.height }
        : { x: 0, y: 0, width: wr.width, height: wr.height };
      // 整个人（含头）都落在留白里：脸是最重要的，宁可人小一点也不让头钻进上方的筛选卡片后面
      model.fitTo(rect, { heightRatio: 0.98, xBias: 0.5 });
    };

    const observer = new ResizeObserver(() => fit());
    observer.observe(wrap);
    if (anchorRef.current) observer.observe(anchorRef.current);

    const onMove = (event: PointerEvent) => {
      if (!model) return;
      const wr = wrap.getBoundingClientRect();
      model.lookAtClient(event.clientX, event.clientY, { left: wr.left, top: wr.top });
    };
    const onLeave = () => model?.lookForward();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", fit);

    void CompanionModel.acquire(MODEL_URL)
      .then((created) => {
        if (!alive) return;
        model = created;
        created.attach(wrap);
        companionBus.setModel(created);
        if (import.meta.env.DEV) {
          // 只在开发环境暴露到 window，方便在控制台直接调参数/看补片状态
          (window as Window & { __companionModel?: CompanionModel }).__companionModel = created;
        }
        fit();
      })
      .catch((error) => {
        console.warn("[companion] stage failed to load", error);
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", fit);
      if (model) {
        model.detach();
        if (companionBus.model === model) companionBus.setModel(null);
        model = null;
      }
    };
  }, [anchorRef]);

  if (failed) return null;

  return <div ref={wrapRef} className={className} aria-hidden="true" />;
}
