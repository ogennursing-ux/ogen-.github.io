import { useRef, useState } from 'react';

// Browser speech-to-text (Hebrew). Uses the Web Speech API — no key, no server;
// works on Chrome over HTTPS (the live site). Where it isn't available the
// button simply doesn't render, so nothing breaks.
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function MicButton({ onText, lang = 'he-IL', title = 'הקלדה קולית' }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  if (!SR) return null;

  function toggle() {
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
      if (t) onText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }

  return (
    <button type="button" className={`mic-btn${listening ? ' on' : ''}`} onClick={toggle}
      title={listening ? 'עצור הקלטה' : title} aria-label={title}>
      {listening ? '⏹️' : '🎤'}
    </button>
  );
}
