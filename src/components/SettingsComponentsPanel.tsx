/**
 * @file SettingsComponentsPanel.tsx - Reusable component settings list
 * @category Component
 * @i18n yes
 * 
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 * 
 * 职责:
 * - 加载用户可控制的站点组件配置
 * - 提供组件启用/停用操作
 * - 提供跳转到组件详细设置页的入口
 * 
 * 被使用于:
 * @used_in pages/ComponentsPage.tsx - 独立组件管理页
 * @used_in pages/SettingsPage.tsx - 统一设置页中的组件管理区
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyComponents,
  updateMyComponents,
  type Live2DComponentSettings,
  type SiteComponentCatalogItem,
  type ToggleComponentSettings,
} from "../api";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

export default function SettingsComponentsPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<SiteComponentCatalogItem[]>([]);
  const [live2dSettings, setLive2dSettings] = useState<Live2DComponentSettings | null>(null);
  const [tagRankSettings, setTagRankSettings] = useState<ToggleComponentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await getMyComponents();
        if (!mounted) return;
        setItems(res.catalog || []);
        setLive2dSettings(res.components.live2d);
        setTagRankSettings(res.components.tagRank);
      } catch (e: any) {
        toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function toggleComponent(item: SiteComponentCatalogItem) {
    setSavingKey(item.key);
    try {
      const nextPayload =
        item.key === "live2d"
          ? live2dSettings
            ? {
                live2d: {
                  enabled: !item.enabled,
                  source: live2dSettings.source,
                  modelJsonUrl: live2dSettings.modelJsonUrl,
                },
              }
            : null
          : tagRankSettings
            ? {
                tagRank: {
                  enabled: !item.enabled,
                },
              }
            : null;

      if (!nextPayload) return;

      const res = await updateMyComponents(nextPayload);
      setLive2dSettings(res.components.live2d);
      setTagRankSettings(res.components.tagRank);
      setItems((prev) =>
        prev.map((entry) =>
          entry.key === item.key
            ? {
                ...entry,
                enabled: item.key === "live2d" ? res.components.live2d.enabled : res.components.tagRank.enabled,
              }
            : entry
        )
      );
      window.dispatchEvent(new CustomEvent("ideahub:components-updated"));
      toast.success(!item.enabled ? t("components.enabledSuccess") : t("components.disabledSuccess"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return <p className="text-gray-400">{t("common.loading")}</p>;
  }

  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const saving = savingKey === item.key;
        const titleKey = item.key === "live2d" ? "components.live2dTitle" : "components.tagRankTitle";
        const descriptionKey = item.key === "live2d" ? "components.live2dDescription" : "components.tagRankDescription";

        return (
          <div key={item.key} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-white">{t(titleKey)}</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.enabled ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700" : "bg-gray-800 text-gray-300 border border-gray-700"
                    }`}
                  >
                    {item.enabled ? t("components.enabled") : t("components.disabled")}
                  </span>
                </div>
                <p className="text-sm text-gray-400">{t(descriptionKey)}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleComponent(item)}
                  disabled={saving}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    item.enabled ? "border border-gray-600 text-gray-200 hover:bg-gray-800" : "bg-white text-black hover:bg-gray-200"
                  } disabled:opacity-60`}
                >
                  {saving ? t("common.loading") : item.enabled ? t("components.disable") : t("components.enable")}
                </button>
                {item.hasSettings && item.settingsPath ? (
                  <Link
                    to={item.settingsPath}
                    className="rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-900/20"
                  >
                    {t("components.openSettings")}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}