// Logic + copy for the public intake chat ("WhatsApp on our own link").
//
// A customer opens the shared link (…/#chat), chats with a guided assistant,
// uploads their documents and answers a few questions. The assistant will not
// finish until every required item is collected. The whole conversation and the
// uploaded files are saved to Supabase so the office can read the full chat and
// import it. No AI key is exposed publicly — the office runs the AI extraction
// on its side from the inbox.
import { createClient } from '@supabase/supabase-js';
import {
  getGeminiKey, setGeminiKey, getGeminiModel,
  getGroqKey, setGroqKey, getGroqTextModel, hasAI,
} from './gemini.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
export const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// ---- fixed copy provided by the office ----
export const PAYMENT_LINK = 'https://pay.grow.link/MTAyMDA2~518b6d50d0cd6bf8c1fb3d39339ef11c-MzU2NTg5Mg';
export const PAYMENT_TEXT =
  'בהמשך לתהליך שלנו, מצורף קישור מאובטח לביצוע התשלום.\n' +
  'הסכום כולל:\n' +
  '• דמי השמה: 2,000 ש"ח\n' +
  '• דמי תאגיד לשנה הקרובה: 840 ש"ח\n' +
  'סה"כ לתשלום: 2,840 ש"ח.\n\n' +
  'למען הסדר הטוב, דמי התאגיד משקפים ליווי ושירות עבור התקופה המלאה. ככל שיחול שינוי במסגרת ' +
  'ההתקשרות במהלך השנה, בחינת זכאות להחזר — ככל שקיימת — נעשית בפנייה יזומה ומסודרת למשרדנו.\n\n' +
  'לכל שאלה או הבהרה, אני כאן בשמחה.';
export const NO_DISCOUNT_TEXT =
  'הסכום קבוע ואחיד לכל הלקוחות ואין באפשרותנו להעניק הנחה — הוא כולל את דמי ההשמה ואת דמי התאגיד ' +
  'לשנה מלאה של ליווי ושירות.';

// Insurance company name (edit here if the spelling differs).
export const INSURANCE_NAME = 'הילית';
export const INSURANCE_TEXT =
  'לגבי ביטוח רפואי לעובד/ת: אנחנו עובדים עם חברת ' + INSURANCE_NAME + ', ואנחנו שולחים אליהם את הפרטים ' +
  'שלכם — והם יצרו איתכם קשר להסדרת הביטוח. אין צורך שתעשו כלום בשלב זה.';
export const INSURANCE_WHY =
  'ביטוח רפואי לעובד/ת הוא חובה על פי חוק על המעסיק, מרגע תחילת ההעסקה. בלי ביטוח בתוקף לא ניתן לדווח ' +
  'על ההשמה לרשויות, וזה עלול לפגוע בזכויות של המעסיק והעובד — ובמקרה של צורך רפואי, המעסיק יישא בכל ' +
  'העלויות. לכן אי אפשר לוותר על הביטוח.';

// ---- the required checklist. The bot asks for each missing item in order. ----
export const STEPS = [
  { key: 'passport', type: 'file', category: 'passport', label: 'דרכון של העובד/ת',
    ask: 'נתחיל 🙂 אנא צלמו ושלחו כאן תמונה של **הדרכון** של העובד/ת (אפשר גם עמוד הפרטים).' },
  { key: 'patientId', type: 'file', category: 'id', label: 'תעודת זהות של המטופל/מעסיק',
    ask: 'מצוין! עכשיו שלחו תמונה של **תעודת הזהות** של המטופל/המעסיק (כולל הספח אם יש).' },
  { key: 'permit', type: 'file', category: 'permit', label: 'היתר העסקה',
    ask: 'תודה! שלחו בבקשה תמונה של **היתר ההעסקה** (אם יש ברשותכם).' },
  { key: 'employerName', type: 'text', label: 'שם המעסיק/מטופל',
    ask: 'מה **השם המלא** של המטופל/המעסיק?' },
  { key: 'employerPhone', type: 'text', label: 'טלפון המעסיק',
    ask: 'מה **מספר הטלפון** של המעסיק/איש הקשר?' },
  { key: 'workerPhone', type: 'text', label: 'טלפון העובד/ת',
    ask: 'ומה **מספר הטלפון של העובד/ת**?' },
];

export const GREETING =
  'שלום וברוכים הבאים לעוגן סיעוד! 👋\n' +
  'אני כאן כדי לאסוף את הפרטים והמסמכים להשמת העובד/ת, בצורה פשוטה וזריזה. ' +
  'נעבור על כמה דברים יחד — פשוט שלחו לי מה שאבקש. אפשר לשאול אותי כל שאלה בדרך.';

// Simple keyword FAQ so the customer can ask questions mid-flow.
export function faqAnswer(text) {
  const t = (text || '').toLowerCase();
  if (/הנח|זול|יקר|מחיר|כמה עולה|עלות|תשלום|לשלם/.test(t)) return PAYMENT_TEXT + '\n\n' + NO_DISCOUNT_TEXT + '\n\n' + PAYMENT_LINK;
  if (/ביטוח|בריאות|עלית|הילית/.test(t)) return INSURANCE_TEXT + '\n\n' + INSURANCE_WHY;
  if (/לא רוצה|לא צריך|בלי ביטוח|מסרב|לוותר/.test(t)) return INSURANCE_WHY;
  if (/מסמכ|צריך|מה נדרש|איזה|רשימה/.test(t)) return 'צריך: דרכון העובד/ת, תעודת זהות של המטופל/מעסיק, היתר העסקה, וכמה פרטי טלפון. נעבור על הכול יחד 🙂';
  if (/כמה זמן|מתי|לוקח/.test(t)) return 'התהליך כאן לוקח כמה דקות. אחרי שנשלים, נהפוך את זה לחוזה ונשלח אליכם — ואז רק נחתים את העובד/ת.';
  if (/שלום|היי|הי |תודה|בוקר טוב|ערב טוב/.test(t)) return 'בשמחה! 🙏';
  return null;
}

// The office shares a link that carries the AI key (…/#chat?k=…), so no key is
// committed to the public repo. On load we store it where gemini.js reads it.
export function applyUrlKey() {
  try {
    const m = (location.hash || '').match(/[?&]k=([^&]+)/);
    if (!m) return;
    const key = decodeURIComponent(m[1]).trim();
    if (!key) return;
    if (key.startsWith('gsk_')) setGroqKey(key); else setGeminiKey(key);
  } catch { /* ignore */ }
}

const SYSTEM = 'את/ה עוזר/ת דיגיטלי/ת חם/ה של "עוגן סיעוד ועובדים זרים בע"מ", לשכה להשמת עובדים זרים בסיעוד. ' +
  'המטרה: לאסוף מהלקוח את כל המסמכים והפרטים בעברית, בנעימות. עובדות: צריך לאסוף דרכון העובד/ת, ' +
  'תעודת זהות של המטופל/מעסיק, היתר העסקה, טלפון מעסיק וטלפון עובד/ת. תשלום: דמי השמה 2000 ש"ח + דמי ' +
  'תאגיד 840 ש"ח = 2840 ש"ח, אין אפשרות להנחה, קישור: ' + PAYMENT_LINK + '. ביטוח: חובה על פי חוק, ' +
  'אנחנו עובדים עם חברת הילית והם יצרו קשר, אי אפשר לוותר. כללים: תשובות קצרות (1-3 משפטים), חמות, ' +
  'בעברית בלבד. תמיד כוון/י בעדינות להשלמת המסמכים החסרים. אל תמציא/י פרטים.';

// Reject a promise after ms so a slow network never freezes the chat.
export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

// A natural free-text reply from the AI (falls back to null if no key / error).
export async function aiChatReply(historyText, userText, missingLabels) {
  if (!hasAI()) return null;
  const prompt = SYSTEM + '\n\nמה שעדיין חסר מהלקוח: ' + (missingLabels.join(', ') || 'שום דבר, הכול נאסף') +
    '.\n\nהשיחה עד כה:\n' + historyText + '\n\nהלקוח כתב: "' + userText + '"\n\nענה/י בעברית, קצר וחם:';
  try {
    const groq = getGroqKey();
    if (groq) {
      const r = await withTimeout(fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groq },
        body: JSON.stringify({ model: getGroqTextModel(), temperature: 0.3, messages: [{ role: 'user', content: prompt }] }),
      }), 18000);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.choices?.[0]?.message?.content?.trim() || null;
    }
    const key = getGeminiKey();
    if (!key) return null;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + getGeminiModel() +
      ':generateContent?key=' + encodeURIComponent(key);
    const r = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }) }), 18000);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() || null;
  } catch { return null; }
}

const uid = () => (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Persist (upsert) the running conversation to Supabase so the office sees it
// live and can read the full transcript. One row per chat session.
export async function saveChat(rowId, { transcript, data, files, status }) {
  const filePayload = [];
  for (const f of files || []) {
    filePayload.push({ category: f.category, name: f.name, dataUrl: await blobToDataUrl(f.blob) });
  }
  const payload = {
    kind: 'family',
    source: 'chat',
    status: status || 'chat',
    data: { chat: true, transcript, fields: data, files: filePayload, updatedAt: new Date().toISOString() },
  };
  const { error } = await sb()
    .from('agent_submissions')
    .upsert({ id: rowId, ...payload }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export const newSessionId = uid;
