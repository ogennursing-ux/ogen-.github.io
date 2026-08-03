import { useState } from 'react';
import { buildAiContext } from './aiContext.js';
import { chatAI, hasChatAI } from './aiChat.js';

// AI phase 3 — a proactive daily briefing on the home screen. Reads the same
// live risk snapshot the assistant uses (expiring documents, overdue and due
// visits) and turns it into a short, prioritised action list for today.
export default function AiBriefing() {
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setBusy(true); setErr(''); setOut('');
    try {
      const { text } = await buildAiContext();
      const reply = await chatAI([
        { role: 'system', content: 'את/ה מנהל/ת המשרד של לשכת "עוגן סיעוד". מהנתונים שלהלן החזר/י "סיכום יומי": 3–6 הפעולות הדחופות ביותר להיום, כל אחת בשורה נפרדת שמתחילה באימוג\'י, קצרה וברורה, עם שם האדם והתאריך הרלוונטי. עברית, תכליתי, בלי מבוא ובלי סיכום.' },
        { role: 'user', content: text },
      ]);
      setOut(reply);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="brief-card">
      <div className="brief-head">
        <div>
          <h3>🤖 סיכום יומי חכם</h3>
          <p className="brief-sub">מה הכי דחוף היום — נסרק מהתוקפים והביקורים של כל התיקים.</p>
        </div>
        <button className="rp-btn ai" disabled={busy} onClick={run}>{busy ? 'סורק…' : out ? '↻ רענן' : '✨ הפק סיכום'}</button>
      </div>
      {!hasChatAI() && !out && <p className="brief-hint">להפעלה: היכנס/י ל-🤖 עוזר AI פעם אחת להזין מפתח.</p>}
      {err && <p className="brief-err">{err}</p>}
      {out && <div className="brief-out">{out}</div>}
    </div>
  );
}
