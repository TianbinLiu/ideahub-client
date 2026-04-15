import { useTranslation } from "react-i18next";
import SettingsComponentsPanel from "../components/SettingsComponentsPanel";

export default function ComponentsPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">{t("components.title")}</h1>
        <p className="mt-2 text-gray-400">{t("components.subtitle")}</p>
      </div>
      <SettingsComponentsPanel />
    </div>
  );
}