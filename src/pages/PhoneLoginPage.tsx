import { useTranslation } from "react-i18next";

export default function PhoneLoginPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">{t('auth.phoneLoginDescription')}</h1>
      <p className="text-gray-400 text-sm mt-2">
        {t('auth.comingSoonOTP')}
      </p>
    </div>
  );
}
