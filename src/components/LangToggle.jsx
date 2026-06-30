import { useLang } from '../lib/i18n.js';

// Header button to switch the whole UI between Hebrew and English.
export default function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      className="lang-toggle"
      onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
      aria-label="Switch language"
    >
      {lang === 'he' ? 'EN' : 'עב'}
    </button>
  );
}
