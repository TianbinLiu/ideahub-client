import { Link } from "react-router";
import { useTranslation } from "react-i18next";

const MODE_CARDS = [
  { key: "business", emoji: "💼" },
  { key: "feedback", emoji: "🛠" },
  { key: "external", emoji: "🔗" },
  { key: "daily", emoji: "📝" },
  { key: "dynamic", emoji: "📣" },
] as const;

export default function NewIdeaTypePage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold text-white">{t("idea.createModeTitle")}</h1>
      <p className="mt-1 text-sm text-gray-400">{t("idea.createModeSubtitle")}</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODE_CARDS.map((mode) => (
          <Link
            key={mode.key}
            to={`/ideas/new/${mode.key}`}
            className="group rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:border-purple-500/70 hover:bg-gray-900/80 transition"
          >
            <div className="text-2xl">{mode.emoji}</div>
            <h2 className="mt-3 text-lg font-semibold text-white">
              {t(`idea.createMode${mode.key.charAt(0).toUpperCase()}${mode.key.slice(1)}Title`)}
            </h2>
            <p className="mt-2 text-sm text-gray-300">
              {t(`idea.createMode${mode.key.charAt(0).toUpperCase()}${mode.key.slice(1)}Desc`)}
            </p>
            <div className="mt-4 text-xs text-purple-300 group-hover:text-purple-200">
              {t("idea.createModeContinue")}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
