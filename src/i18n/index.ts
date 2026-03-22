import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import en from './locales/en.json';

const getInitialLanguage = () => {
    const saved = localStorage.getItem('language');
    if (saved) return saved;
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
};

i18n
    .use(initReactI18next)
    .init({
        lng: getInitialLanguage(),
        fallbackLng: 'ja',
        resources: {
            ja: { translation: ja },
            en: { translation: en },
        },
        interpolation: {
            escapeValue: false
        }
    });

export default i18n;
