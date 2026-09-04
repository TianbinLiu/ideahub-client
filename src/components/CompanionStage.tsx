/**
 * @file CompanionStage.tsx - 首页看板娘舞台（Live2D 画布，压在内容卡片之下）
 * @category Component
 * @requires_auth no
 *
 * 只负责：加载模型、把它"站"到 anchorRef 指向的留白区域、跟随鼠标转头、尺寸变化时重摆。
 * 表情/动作/口型由 CompanionChat 通过 companionBus 驱动，本组件不认识对话。
 *
 * ★ 舞台画布覆盖整个左列，但模型按 anchorRef（留白 div）定位：这样推荐位展开时头部会"躲"在卡片后面，
 *   收起时留白变高、模型自动长大——这就是"看板娘在最底层"的全部实现，不需要任何 z-index 魔法。
 * ★ 移动端不挂（父级 hidden lg:block）：手机上没有留白区域，也省掉 700KB 运行时。
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let disposed = false;
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

    void (async () => {
      try {
        const created = await CompanionModel.create(canvas, MODEL_URL);
        if (disposed) {
          created.destroy();
          return;
        }
        model = created;
        companionBus.setModel(created);
        if (import.meta.env.DEV) {
          // 只在开发环境暴露到 window，方便在控制台直接调参数/看补片状态
          (window as Window & { __companionModel?: CompanionModel }).__companionModel = created;
        }
        fit();
      } catch (error) {
        console.warn("[companion] stage failed to load", error);
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", fit);
      if (model) {
        if (companionBus.model === model) companionBus.setModel(null);
        model.destroy();
        model = null;
      }
    };
  }, [anchorRef]);

  if (failed) return null;

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
