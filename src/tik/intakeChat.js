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

// One clean link for everyone: the office publishes the AI key to Supabase once,
// and every chat reads it on load — so the assistant is "always connected" and
// the link (…/#chat) carries no secret.
const CONFIG_ID = '00000000-0000-4000-8000-0a9e0c0f0001';
export async function publishChatKey(key) {
  const { error } = await sb().from('agent_submissions')
    .upsert({ id: CONFIG_ID, kind: 'config', status: 'config', source: 'office', data: { aiKey: key || '' } }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}
export async function loadPublishedKey() {
  try {
    const { data } = await withTimeout(
      sb().from('agent_submissions').select('data').eq('id', CONFIG_ID).maybeSingle(),
      8000,
    );
    const key = data?.data?.aiKey || '';
    if (!key) return false;
    if (key.startsWith('gsk_')) setGroqKey(key); else setGeminiKey(key);
    return true;
  } catch { return false; }
}

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

// The person the customer is chatting with (front-line rep persona).
export const AGENT_NAME = 'מאור';
// Who unknown questions get escalated to.
export const ESCALATE_TO = 'דביר';

// ---- the required checklist. The bot asks for each missing item in order. ----
// Phone comes FIRST so the office can always call the customer back.
export const STEPS = [
  { key: 'contactPhone', type: 'text', label: 'טלפון ליצירת קשר',
    ask: 'קודם כול — מה **מספר הטלפון** שלכם? ככה נוכל לחזור אליכם אם צריך 🙂' },
  { key: 'passport', type: 'file', category: 'passport', label: 'דרכון של העובד/ת',
    ask: 'תודה! עכשיו צלמו ושלחו לי את **עמוד הפרטים של הדרכון** של העובד/ת — התמונה עם השם, מספר הדרכון ותאריך הלידה.' },
  { key: 'visa', type: 'file', category: 'visa', optional: true, label: 'ויזה של העובד/ת',
    ask: 'מצוין. שלחו לי בבקשה תמונה של ה**ויזה / אשרה** של העובד/ת (ואם אין ברשותכם — כתבו "אין").' },
  { key: 'patientId', type: 'file', category: 'id', label: 'תעודת זהות של המטופל/מעסיק',
    ask: 'תודה. שלחו לי תמונה של **תעודת הזהות** של המטופל/המעסיק (עם הספח אם יש).' },
  { key: 'permit', type: 'file', category: 'permit', optional: true, label: 'היתר העסקה',
    ask: 'ויש לכם תמונה של **היתר ההעסקה**? שלחו לי אותה (ואם אין — כתבו "אין").' },
  { key: 'employerName', type: 'text', label: 'שם המטופל/מעסיק',
    ask: 'מה **השם המלא** של המטופל/המעסיק?' },
  { key: 'street', type: 'text', label: 'כתובת המטופל',
    ask: 'מה ה**כתובת המלאה** של המטופל — עיר, רחוב ומספר בית?' },
  { key: 'workerPhone', type: 'text', label: 'טלפון העובד/ת',
    ask: 'מה **מספר הטלפון של העובד/ת**?' },
  { key: 'arrivalDate', type: 'text', label: 'תאריך הגעה לארץ',
    ask: 'מתי העובד/ת **הגיע/ה לארץ**? (תאריך — גם משוער עוזר)' },
  { key: 'lastWorkDate', type: 'text', label: 'תאריך עבודה אחרון',
    ask: 'ואחרון — מה ה**תאריך המדויק האחרון** שבו העובד/ת עבד/ה במקום הקודם? (אם רלוונטי)' },
];

// After the documents, ask ONLY for whatever the passport didn't already give
// us: marital status (→ spouse name if married) and the caregiver's parents.
export const isMarried = (v) => /נשוי|נשואה|married|(^|\s)כן(\s|$)/i.test(String(v || ''));
export const FOLLOWUPS = [
  { key: 'maritalStatus', type: 'text', label: 'מצב משפחתי',
    ask: 'עוד כמה פרטים קצרים על העובד/ת: האם הוא/היא **נשוי/אה**? (כן / לא)' },
  { key: 'spouseName', type: 'text', label: 'שם בן/בת הזוג', when: (d) => isMarried(d.maritalStatus),
    ask: 'מה **שם בן/בת הזוג**?' },
  { key: 'fatherName', type: 'text', label: 'שם האב', ask: 'מה **שם האב** של העובד/ת?' },
  { key: 'motherName', type: 'text', label: 'שם האם', ask: 'ומה **שם האם** של העובד/ת?' },
];

export const GREETING =
  'היי, נעים מאוד! אני ' + AGENT_NAME + ' מעוגן סיעוד 😊\n' +
  'אני אעזור לכם לאסוף את הפרטים והמסמכים להשמת העובד/ת — זה קצר ופשוט. ' +
  'פשוט שלחו לי מה שאבקש, ואפשר לשאול אותי כל שאלה בדרך.';

// Detect a request to speak with a human / get a call back.
export function wantsHuman(text) {
  return /לדבר עם|נציג|בן אדם|בנאדם|תתקשר|תחזור אלי|שיחה איתי|לדבר איתכם|טלפון איתכם|לא הבנתי|מישהו אמיתי/.test(text || '');
}
export const ESCALATE_TEXT =
  'בשמחה 🙏 אני מעביר את זה ל' + ESCALATE_TO + ' מהצוות שלנו, ונחזור אליכם טלפונית בהקדם. ' +
  'בינתיים נמשיך להשלים את הפרטים?';

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

const SYSTEM = 'אתה ' + AGENT_NAME + ', נציג שירות אנושי וחם של "עוגן סיעוד ועובדים זרים בע"מ", לשכה להשמת ' +
  'עובדים זרים בסיעוד. אתה מדבר בגוף ראשון כאילו אתה בן אדם אמיתי (לא בוט). המטרה: לאסוף מהלקוח את כל ' +
  'המסמכים והפרטים בעברית, בנעימות. עובדות: צריך לאסוף טלפון ליצירת קשר, דרכון העובד/ת, ויזה/אשרה של ' +
  'העובד/ת, תעודת זהות של המטופל/מעסיק, היתר העסקה, שם המטופל/מעסיק, כתובת מלאה של המטופל, טלפון עובד/ת, ' +
  'תאריך הגעת העובד/ת לארץ, ותאריך העבודה האחרון המדויק. תשלום: דמי השמה 2000 ש"ח + דמי תאגיד ' +
  '840 ש"ח = 2840 ש"ח, אין אפשרות להנחה, קישור: ' + PAYMENT_LINK + '. ביטוח: חובה על פי חוק, אנחנו ' +
  'עובדים עם חברת הילית והם יצרו קשר, אי אפשר לוותר. אם אינך יודע את התשובה או שהלקוח מבקש לדבר עם ' +
  'נציג — אמור שתעביר את זה ל' + ESCALATE_TO + ' מהצוות ושנחזור אליהם טלפונית. כללים: תשובות קצרות ' +
  '(1-3 משפטים), חמות, בעברית בלבד, בגוף ראשון. תמיד כוון בעדינות להשלמת המסמכים החסרים. אל תמציא פרטים.';

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
export async function saveChat(rowId, { transcript, data, files, status, needsCallback }) {
  const filePayload = [];
  for (const f of files || []) {
    filePayload.push({ category: f.category, name: f.name, dataUrl: await blobToDataUrl(f.blob) });
  }
  const payload = {
    kind: 'family',
    source: 'chat',
    status: status || 'chat',
    data: { chat: true, needsCallback: !!needsCallback, transcript, fields: data, files: filePayload, updatedAt: new Date().toISOString() },
  };
  const { error } = await sb()
    .from('agent_submissions')
    .upsert({ id: rowId, ...payload }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export const newSessionId = uid;
