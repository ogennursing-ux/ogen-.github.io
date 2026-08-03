// AI drafting + translation, phase 2 of the AI layer. Turns a case into a
// short, ready-to-send Hebrew message (reminder, notice, update), then
// translates it to the worker's language on demand. Grounded in the person's
// real facts so dates and names are correct. Reuses the settings AI key.
import { chatAI } from './aiChat.js';

const DAY = 86400000;
const parseDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const fmt = (v) => { const d = parseDate(v); if (!d) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
const daysLeft = (v) => { const d = parseDate(v); return d ? Math.round((d - Date.now()) / DAY) : null; };

// The facts about one case, as plain Hebrew lines for the model to rely on.
export function personFacts(caseObj) {
  const f = caseObj?.data?.fields || {};
  const w = caseObj?.worker || {};
  const fam = caseObj?.family || {};
  const rows = [];
  const wName = w.nameHe || w.nameEn || '';
  if (wName) rows.push(`עובד/ת: ${wName}${w.nameEn && w.nameHe ? ` (${w.nameEn})` : ''}`);
  if (w.passportNo) rows.push(`דרכון: ${w.passportNo}`);
  if (w.nationality) rows.push(`ארץ מוצא: ${w.nationality}`);
  if (fam.fullName) rows.push(`מעסיק/מטופל: ${fam.fullName}`);
  if (fam.city) rows.push(`עיר: ${fam.city}`);
  const checks = [
    ['היתר', f.permitExpiry || fam.permitExpiry],
    ['ויזה', w.visaExpiry || fam.visaExpiry],
    ['דרכון', w.passportExpiry],
    ['ביטוח', w.insuranceExpiry || fam.insuranceExpiry],
  ];
  for (const [label, v] of checks) {
    const dl = daysLeft(v);
    if (dl != null) rows.push(`${label} בתוקף עד ${fmt(v)} (${dl < 0 ? `פג לפני ${-dl} ימים` : `בעוד ${dl} ימים`})`);
  }
  return rows.join('\n');
}

// Compose a message. `lang` is the language to WRITE it in (Hebrew by default).
export async function draftMessage({ instruction, facts, lang = 'עברית' }) {
  const sys = [
    'את/ה כותב/ת בשם לשכת "עוגן סיעוד ועובדים זרים".',
    'נסח/י הודעה קצרה, מנומסת ומקצועית, מוכנה לשליחה כמות שהיא.',
    'בלי כותרות טכניות, בלי סוגריים של הסבר, בלי מקומות-שמורה כמו [שם] — השתמש/י בפרטים האמיתיים שסופקו.',
    `שפת הכתיבה: ${lang}.`,
  ].join(' ');
  const user = `פרטי האדם:\n${facts || '(אין)'}\n\nמה לכתוב: ${instruction}`;
  return (await chatAI([{ role: 'system', content: sys }, { role: 'user', content: user }])).trim();
}

// Translate a finished message to another language, returning only the translation.
export async function translateText(text, lang) {
  const sys = `תרגם/י את ההודעה הבאה לשפה: ${lang}. שמור/י על משמעות ונימה. החזר/י אך ורק את התרגום, בלי הערות ובלי הטקסט המקורי.`;
  return (await chatAI([{ role: 'system', content: sys }, { role: 'user', content: text }])).trim();
}

// Languages offered for translation.
export const DRAFT_LANGS = ['אנגלית', 'הינדי', 'נפאלית', 'סינהלה', 'טמילית', 'תאית', 'רומנית', 'רוסית', 'ספרדית'];

// Best guess of a worker's language from their origin country.
export function guessLang(caseObj) {
  const nat = String(caseObj?.worker?.nationality || caseObj?.data?.fields?.nationality || '');
  if (/נפאל/.test(nat)) return 'נפאלית';
  if (/סרי.?לנק|לנקה/.test(nat)) return 'סינהלה';
  if (/תאילנד|תאי/.test(nat)) return 'תאית';
  if (/מולדב|אוקראינ/.test(nat)) return 'רומנית';
  if (/רוסי/.test(nat)) return 'רוסית';
  return 'אנגלית'; // Philippines / India / default
}
