/**
 * @file SceneBackgroundPicker.tsx - 首页场景背景选择弹窗
 * @category Component
 * @requires_auth no
 * @i18n_module companion
 *
 * 选项来自 companion/scenes.ts；选中即生效、即关闭。偏好只存本机（见 scenes.ts 的说明）。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { SCENES, type SceneKey } from "../companion/scenes";

type Props = {
  value: SceneKey;
  onSelect: (scene: SceneKey) => void;
  onClose: () => void;
};

export default function SceneBackgroundPicker({ value, onSelect, onClose }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("companion.sceneTitle")}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t("companion.sceneTitle")}</h2>
            <p className="mt-1 text-xs text-gray-400">{t("companion.sceneHint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-700 p-1.5 text-gray-300 hover:bg-gray-800"
            aria-label={t("companion.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {SCENES.map((scene) => (
            <button
              key={scene.key}
              type="button"
              onClick={() => {
                onSelect(scene.key);
                onClose();
              }}
              className={`overflow-hidden rounded-xl border text-left transition ${
                value === scene.key ? "border-cyan-400 ring-2 ring-cyan-400/40" : "border-gray-800 hover:border-gray-500"
              }`}
            >
              <div className="aspect-video w-full bg-gray-950">
                {scene.thumb ? (
                  <img src={scene.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.25)_0%,rgba(3,7,18,1)_55%)]" />
                )}
              </div>
              <div className="px-3 py-2 text-sm text-gray-100">{t(`companion.scenes.${scene.key}`)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
