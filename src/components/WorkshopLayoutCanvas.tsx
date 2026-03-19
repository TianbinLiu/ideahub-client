import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkshopLayout, WorkshopLayoutItem, WorkshopTheme } from "../api";

type InteractionState = {
  type: "move" | "resize";
  itemId: string;
  startX: number;
  startY: number;
  startItem: WorkshopLayoutItem;
  bounds: { width: number; height: number };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function updateItem(layout: WorkshopLayout, itemId: string, updater: (item: WorkshopLayoutItem) => WorkshopLayoutItem): WorkshopLayout {
  return {
    ...layout,
    pages: {
      ...layout.pages,
      home: {
        ...layout.pages.home,
        items: layout.pages.home.items.map((item) => (item.id === itemId ? updater(item) : item)),
      },
    },
  };
}

function renderMiniContent(kind: WorkshopLayoutItem["kind"]) {
  if (kind === "nav") {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-20 rounded-full bg-white/70" />
        <div className="flex gap-2">
          <div className="h-2.5 w-10 rounded-full bg-white/30" />
          <div className="h-2.5 w-10 rounded-full bg-white/30" />
          <div className="h-2.5 w-10 rounded-full bg-white/30" />
        </div>
      </div>
    );
  }
  if (kind === "hero") {
    return (
      <div className="space-y-2">
        <div className="h-3 w-24 rounded-full bg-white/75" />
        <div className="h-6 w-3/4 rounded-lg bg-white/20" />
        <div className="h-3 w-2/3 rounded-full bg-white/30" />
        <div className="h-8 w-24 rounded-xl bg-white/25" />
      </div>
    );
  }
  if (kind === "feed") {
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="h-3 w-20 rounded-full bg-white/65" />
            <div className="mt-2 h-2.5 w-full rounded-full bg-white/20" />
            <div className="mt-1 h-2.5 w-4/5 rounded-full bg-white/15" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="h-3 w-20 rounded-full bg-white/65" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-10 rounded-xl bg-white/15" />
        <div className="h-10 rounded-xl bg-white/10" />
      </div>
      <div className="h-2.5 w-2/3 rounded-full bg-white/20" />
    </div>
  );
}

export default function WorkshopLayoutCanvas({
  layout,
  theme,
  editable = false,
  selectedId,
  onSelect,
  onChange,
}: {
  layout: WorkshopLayout;
  theme?: WorkshopTheme;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (nextLayout: WorkshopLayout) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);

  useEffect(() => {
    if (!interaction || !editable || !onChange) return;

    const activeInteraction = interaction;
    const emitChange = onChange;

    function handlePointerMove(event: PointerEvent) {
      const deltaXPercent = ((event.clientX - activeInteraction.startX) / activeInteraction.bounds.width) * 100;
      const deltaYPercent = ((event.clientY - activeInteraction.startY) / activeInteraction.bounds.height) * 100;
      emitChange(
        updateItem(layout, activeInteraction.itemId, (item) => {
          if (activeInteraction.type === "move") {
            const nextX = clamp(activeInteraction.startItem.x + deltaXPercent, 0, 100 - activeInteraction.startItem.w);
            const nextY = clamp(activeInteraction.startItem.y + deltaYPercent, 0, 100 - activeInteraction.startItem.h);
            return { ...item, x: nextX, y: nextY };
          }

          const nextW = clamp(activeInteraction.startItem.w + deltaXPercent, 8, 96);
          const nextH = clamp(activeInteraction.startItem.h + deltaYPercent, 6, 80);
          return {
            ...item,
            w: nextW,
            h: nextH,
            x: clamp(item.x, 0, 100 - nextW),
            y: clamp(item.y, 0, 100 - nextH),
          };
        })
      );
    }

    function handlePointerUp() {
      setInteraction(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [editable, interaction, layout, onChange]);

  const visibleItems = useMemo(
    () => [...layout.pages.home.items].filter((item) => item.visible !== false).sort((a, b) => a.z - b.z),
    [layout]
  );

  const accent = theme?.accentColor || "#22d3ee";
  const text = theme?.textColor || "#f3f4f6";
  const radius = `${theme?.cardRadius || 16}px`;

  function startInteraction(event: React.PointerEvent, item: WorkshopLayoutItem, type: "move" | "resize") {
    if (!editable || !containerRef.current || !onChange) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = containerRef.current.getBoundingClientRect();
    onSelect?.(item.id);
    setInteraction({
      type,
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      startItem: item,
      bounds: { width: bounds.width, height: bounds.height },
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-[1200/760] w-full overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
      style={{
        color: text,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "5% 5%",
      }}
      onPointerDown={() => onSelect?.(null)}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.16),transparent_35%)]" />
      {visibleItems.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <div
            key={item.id}
            className={`absolute overflow-hidden border backdrop-blur-sm transition ${editable ? "cursor-move" : "cursor-default"}`}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              width: `${item.w}%`,
              height: `${item.h}%`,
              borderColor: isSelected ? accent : "rgba(255,255,255,0.12)",
              borderWidth: isSelected ? 2 : 1,
              borderRadius: radius,
              background: isSelected ? "rgba(15,23,42,0.88)" : "rgba(15,23,42,0.76)",
              boxShadow: isSelected ? `0 0 0 1px ${accent}, 0 18px 40px rgba(0,0,0,0.35)` : "0 12px 30px rgba(0,0,0,0.25)",
              zIndex: item.z,
            }}
            onPointerDown={(event) => startInteraction(event, item, "move")}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(item.id);
            }}
          >
            <div className="flex h-full flex-col p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{item.kind}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{item.label}</div>
                </div>
                <div className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55">
                  {Math.round(item.w)}×{Math.round(item.h)}
                </div>
              </div>
              <div className="mt-3 flex-1">{renderMiniContent(item.kind)}</div>
            </div>

            {editable && isSelected && (
              <button
                type="button"
                aria-label="Resize block"
                className="absolute bottom-2 right-2 h-4 w-4 rounded-sm border border-white/30 bg-black/40"
                style={{ boxShadow: `0 0 0 1px ${accent}` }}
                onPointerDown={(event) => startInteraction(event, item, "resize")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}