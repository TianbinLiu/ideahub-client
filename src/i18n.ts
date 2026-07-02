import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import zh from './locales/zh.json';

const LANGUAGE_STORAGE_KEY = 'i18nextLng';

function normalizeLanguage(value?: string) {
  const lang = String(value || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh' : 'en';
}

function getInitialLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;

    const browserLanguage =
      navigator.languages && navigator.languages.length > 0
        ? navigator.languages[0]
        : navigator.language;
    return normalizeLanguage(browserLanguage);
  } catch {
    return 'en';
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    detection: {
      order: ['navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
