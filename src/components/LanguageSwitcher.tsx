import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <select
      value={i18n.language}
      onChange={(e) => changeLanguage(e.target.value)}
      className="rounded-lg bg-gray-950/50 border border-gray-800 px-2 py-1 text-sm text-gray-200"
    >
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
}
