import { useMemo, useState } from 'react';
import { personFacts, draftMessage, translateText, DRAFT_LANGS, guessLang } from './aiDraft.js';
import { hasChatAI } from './aiChat.js';
import MicButton from './MicButton.jsx';

const PRESETS = [
  { label: '📄 מסמך עומד לפוג', text: 'תזכורת ידידותית שהמסמך הקרוב לפוג (היתר/ויזה/דרכון/ביטוח) דורש חידוש, כולל התאריך המדויק, ובקשה ליצור קשר לתיאום.' },
  { label: '💰 תזכורת תשלום', text: 'תזכורת מנומסת על תשלום שטרם הוסדר, עם בקשה להסדרה.' },
  { label: '👨‍👩‍👧 הודעה למשפחה', text: 'הודעה כללית קצרה למשפחה/למעסיק.' },
  { label: '👷 הודעה לעובד/ת', text: 'הודעה קצרה וברורה לעובד/ת הזר/ה.' },
];

const intlPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '972' + d.slice(1); return d; };

export default function AiDraftModal({ caseObj, kind = 'worker', onClose }) {
  const facts = useMemo(() => personFacts(caseObj), [caseObj]);
  const w = caseObj?.worker || {};
  const fam = caseObj?.family || {};
  // Default recipient follows which file you opened it from.
  const [to, setTo] = useState(kind === 'worker' ? 'worker' : 'family');
  const [instruction, setInstruction] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState(guessLang(caseObj));
  const [translated, setTranslated] = useState('');
  const [tBusy, setTBusy] = useState(false);
  const [err, setErr] = useState('');

  const phone = to === 'worker' ? (w.phone || '') : (fam.phone || fam.mobile || '');
  const email = to === 'worker' ? (w.email || '') : (fam.email || '');
  // A message to the worker is written directly in their language.
  const writeLang = to === 'worker' ? lang : 'עברית';

  async function gen() {
    if (!instruction.trim()) return;
    setBusy(true); setErr(''); setTranslated('');
    try { setDraft(await draftMessage({ instruction, facts, lang: writeLang })); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  }
  async function translate() {
    if (!draft.trim()) return;
    setTBusy(true); setErr('');
    try { setTranslated(await translateText(draft, lang)); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setTBusy(false); }
  }
  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});
  const wa = (t) => phone && window.open(`https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
  const mail = (t) => email && window.open(`mailto:${email}?body=${encodeURIComponent(t)}`);

  const actions = (t) => (
    <div className="aid-actions">
      <button className="rp-btn ghost sm" onClick={() => copy(t)}>📋 העתק</button>
      {phone && <button className="rp-btn ghost sm" onClick={() => wa(t)}>💬 וואטסאפ</button>}
      {email && <button className="rp-btn ghost sm" onClick={() => mail(t)}>✉️ מייל</button>}
    </div>
  );

  return (
    <div className="aid-overlay" onClick={onClose}>
      <div className="aid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aid-head">
          <h3>✍️ ניסוח עם AI — {w.nameHe || w.nameEn || fam.fullName || ''}</h3>
          <button className="aid-x" onClick={onClose}>✕</button>
        </div>

        {!hasChatAI() && (
          <p className="aid-warn">לא הוגדר מפתח AI. היכנס/י ל-🤖 עוזר AI פעם אחת כדי להזין מפתח, ואז נסה/י שוב.</p>
        )}

        <div className="aid-row">
          <label>אל:</label>
          <div className="aid-seg">
            <button className={to === 'family' ? 'on' : ''} onClick={() => setTo('family')}>המשפחה (עברית)</button>
            <button className={to === 'worker' ? 'on' : ''} onClick={() => setTo('worker')}>העובד/ת ({lang})</button>
          </div>
        </div>

        <div className="aid-chips">
          {PRESETS.map((p) => <button key={p.label} className="aid-chip" onClick={() => setInstruction(p.text)}>{p.label}</button>)}
        </div>
        <div className="aid-instr-wrap">
          <textarea className="aid-instr" placeholder="מה לכתוב? (בחר/י נושא למעלה, כתוב/י חופשי, או דבר/י 🎤)" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <MicButton onText={(t) => setInstruction((v) => (v ? v + ' ' : '') + t)} />
        </div>
        <button className="rp-btn" disabled={busy || !instruction.trim()} onClick={gen}>{busy ? 'מנסח…' : '✨ נסח'}</button>

        {err && <p className="aid-warn">{err}</p>}

        {draft && (
          <div className="aid-out">
            <label className="aid-label">הטיוטה {to === 'worker' ? `(${writeLang})` : ''}</label>
            <textarea className="aid-draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
            {actions(draft)}
            <div className="aid-translate">
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {DRAFT_LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <button className="rp-btn ghost sm" disabled={tBusy} onClick={translate}>{tBusy ? 'מתרגם…' : '🌐 תרגם'}</button>
            </div>
            {translated && (
              <div className="aid-out">
                <label className="aid-label">תרגום ({lang})</label>
                <textarea className="aid-draft" dir="auto" value={translated} onChange={(e) => setTranslated(e.target.value)} />
                {actions(translated)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
