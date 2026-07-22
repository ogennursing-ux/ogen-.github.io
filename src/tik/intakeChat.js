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
  { key: 'referrer', type: 'text', label: 'מאיפה הגיעו אלינו',
    ask: 'שאלה קטנה לפני שנתחיל — **מאיפה הגעתם אלינו?** (המלצה מחבר, גוגל, פייסבוק, וכו׳)' },
  { key: 'contactPhone', type: 'text', label: 'טלפון ליצירת קשר',
    ask: 'תודה! מה **מספר הטלפון** שלכם? ככה נוכל לחזור אליכם אם צריך 🙂' },
  { key: 'passport', type: 'file', category: 'passport', label: 'דרכון של העובד/ת', allowText: true,
    ask: 'תודה! אפשר בשתי דרכים — **או** לשלוח **צילום** של עמוד הפרטים בדרכון של העובד/ת, **או** פשוט **לכתוב כאן את מספר הדרכון**. אין צורך בדרכון הפיזי.' },
  { key: 'visa', type: 'file', category: 'visa', optional: true, label: 'ויזה של העובד/ת',
    ask: 'מצוין. שלחו לי בבקשה תמונה של ה**ויזה / אשרה** של העובד/ת (ואם אין ברשותכם — כתבו "אין").' },
  { key: 'patientId', type: 'file', category: 'id', label: 'תעודת זהות של המטופל/מעסיק',
    ask: 'תודה. שלחו לי תמונה של **תעודת הזהות** של המטופל/המעסיק (עם הספח אם יש).' },
  { key: 'permit', type: 'file', category: 'permit', optional: true, label: 'היתר העסקה',
    ask: 'ויש לכם תמונה של **היתר ההעסקה**? שלחו לי אותה (ואם אין — כתבו "אין").' },
  { key: 'employerName', type: 'text', label: 'שם המטופל/מעסיק',
    ask: 'מה **השם המלא** של המטופל/המעסיק?' },
  { key: 'contactName', type: 'text', label: 'שם איש קשר',
    ask: 'מה שם **איש הקשר** מטעם המשפחה? (אם זה המטופל עצמו — כתבו את שמו)' },
  { key: 'email', type: 'text', label: 'אימייל המעסיק',
    ask: 'מה **כתובת האימייל** של המעסיק? (לשליחת החוזה)' },
  { key: 'street', type: 'text', label: 'כתובת המטופל',
    ask: 'מה ה**כתובת המלאה** של המטופל — עיר, רחוב ומספר בית?' },
  { key: 'workerPhone', type: 'text', label: 'טלפון העובד/ת',
    ask: 'מה **מספר הטלפון של העובד/ת**?' },
  { key: 'salary', type: 'text', label: 'שכר חודשי',
    ask: 'מה **גובה השכר החודשי** המוסכם לעובד/ת? (בש"ח)' },
  // ---- Employment terms (needed for the contract — none of this is on a document) ----
  { key: 'startDate', type: 'text', label: 'תאריך תחילת העסקה',
    ask: 'מתי **מתחילה ההעסקה**? (תאריך)' },
  { key: 'daysPerWeek', type: 'choice', label: 'ימי עבודה בשבוע', options: ['5', '6', '7'],
    ask: 'כמה **ימים בשבוע** העובד/ת עובד/ת?' },
  { key: 'hoursPerDay', type: 'text', label: 'שעות ביום',
    ask: 'כמה **שעות עבודה ביום** בערך?' },
  { key: 'weeklyDayOff', type: 'choice', label: 'יום חופש שבועי', options: ['שבת', 'ראשון', 'אחר'],
    ask: 'מהו **יום החופש השבועי** של העובד/ת?' },
  { key: 'liveIn', type: 'choice', label: 'מגורים', options: ['גר/ה בבית המטופל', 'לא גר/ה בבית'],
    ask: 'האם העובד/ת **גר/ה בבית המטופל** (מגורים צמודים)?' },
  { key: 'jobTasks', type: 'multi', label: 'מרכיבי העבודה',
    options: ['בישול', 'ניקיון', 'כביסה', 'מתן תרופות', 'זריקות', 'השגחה'],
    ask: 'מה **מרכיבי העבודה**? בחרו כמה שרלוונטי 👇' },
  { key: 'weeklyAdvance', type: 'text', optional: true, label: 'מקדמה שבועית',
    ask: 'האם יש **מקדמה / דמי כיס שבועיים**? (סכום, או "אין")' },
  { key: 'languages', type: 'text', optional: true, label: 'שפות',
    ask: 'אילו **שפות** העובד/ת דובר/ת? (אם לא בטוחים — "אין")' },
  { key: 'overseasAgency', type: 'text', optional: true, label: 'חברת כ״א בחו״ל',
    ask: 'דרך איזו **חברת כוח-אדם בחו״ל** הגיע/ה העובד/ת? (אם ידוע, אחרת "אין")' },
  { key: 'arrivalDate', type: 'text', label: 'תאריך הגעה לארץ',
    ask: 'מתי העובד/ת **הגיע/ה לארץ**? (תאריך — גם משוער עוזר)' },
  { key: 'lastWorkDate', type: 'text', label: 'תאריך עבודה אחרון',
    ask: 'ואחרון — מה ה**תאריך המדויק האחרון** שבו העובד/ת עבד/ה במקום הקודם? (אם רלוונטי)' },
];

// After the documents, ask ONLY for whatever the passport didn't already give
// us: marital status (→ spouse name if married) and the caregiver's parents.
export const isMarried = (v) => /נשוי|נשואה|married|(^|\s)כן(\s|$)/i.test(String(v || ''));
export const cannotSign = (v) => /^\s*(לא|לא יכול|לא מסוגל|אי אפשר|לא יכולה)/.test(String(v || ''));
export const FOLLOWUPS = [
  { key: 'maritalStatus', type: 'text', label: 'מצב משפחתי',
    ask: 'עוד כמה פרטים קצרים על העובד/ת: האם הוא/היא **נשוי/אה**? (כן / לא)' },
  { key: 'spouseName', type: 'text', label: 'שם בן/בת הזוג', when: (d) => isMarried(d.maritalStatus),
    ask: 'מה **שם בן/בת הזוג**?' },
  { key: 'fatherName', type: 'text', label: 'שם האב', ask: 'מה **שם האב** של העובד/ת?' },
  { key: 'motherName', type: 'text', label: 'שם האם', ask: 'ומה **שם האם** של העובד/ת?' },
  { key: 'contactRelation', type: 'text', label: 'קירבה למטופל',
    ask: 'מה **הקירבה** של איש הקשר למטופל? (בן/בת, בן/בת זוג, נכד/ה וכו׳)' },
  { key: 'heightWeight', type: 'text', optional: true, label: 'גובה ומשקל',
    ask: 'מה בערך **הגובה והמשקל** של העובד/ת? (לטופס הזמנת עבודה — אם לא ידוע, "אין")' },
  // The contract is signed by the PATIENT. If the patient can't sign, we need a
  // guardian / power-of-attorney document and their name first.
  { key: 'canSign', type: 'text', label: 'המטופל יכול לחתום?',
    ask: 'לגבי החתימה על החוזה — היא צריכה להיות של **המטופל עצמו**. האם המטופל יכול לחתום בעצמו? (כן / לא)' },
  { key: 'guardianDoc', type: 'file', category: 'guardian', label: 'מסמך אפוטרופוס / ייפוי כוח',
    when: (d) => cannotSign(d.canSign),
    ask: 'הבנתי. במקרה כזה נחתום דרך אפוטרופוס או מיופה כוח. אנא שלחו לי תמונה של **מסמך האפוטרופסות / ייפוי הכוח**.' },
  { key: 'guardianName', type: 'text', label: 'שם האפוטרופוס / מיופה הכוח',
    when: (d) => cannotSign(d.canSign),
    ask: 'ומה **שם האפוטרופוס / מיופה הכוח** שיחתום במקום המטופל?' },
];

export const GREETING =
  'היי, נעים מאוד! אני ' + AGENT_NAME + ' מעוגן סיעוד 😊\n' +
  'אני אעזור לכם לאסוף את הפרטים והמסמכים להשמת העובד/ת — זה קצר ופשוט. ' +
  'פשוט שלחו לי מה שאבקש, ואפשר לשאול אותי כל שאלה בדרך.';

// ---- Split intake by role (three permanent links) ----------------------------
// The office sends the same three links forever. The two halves are matched
// automatically by the WORKER'S PASSPORT NUMBER: the employer gives the worker's
// passport (photo or number), the worker gives their own — same number → one file.
//   #chat                → full (employer fills everything)
//   #chat?role=employer  → employer's half only
//   #chat?role=worker    → worker's half only
const WORKER_KEYS = new Set([
  'passport', 'visa', 'workerPhone', 'languages', 'overseasAgency',
  'arrivalDate', 'lastWorkDate', 'maritalStatus', 'spouseName', 'fatherName',
  'motherName', 'heightWeight',
]);
const EMPLOYER_KEYS = new Set([
  'contactPhone', 'passport', 'patientId', 'permit', 'employerName', 'contactName', 'email',
  'street', 'salary', 'startDate', 'daysPerWeek', 'hoursPerDay', 'weeklyDayOff',
  'liveIn', 'jobTasks', 'weeklyAdvance', 'contactRelation', 'canSign',
  'guardianDoc', 'guardianName',
]);
// 'passport' + 'referrer' belong to both — the passport is the shared key.

export function getRole() {
  try {
    const h = location.hash.replace(/^#\/?/, '');
    const m = h.match(/[?&]role=(employer|worker)/i);
    return m ? m[1].toLowerCase() : 'all';
  } catch { return 'all'; }
}

export function filterByRole(list, role) {
  if (role !== 'employer' && role !== 'worker') return list;
  const keep = role === 'worker' ? WORKER_KEYS : EMPLOYER_KEYS;
  // "How did you hear about us" only makes sense for the employer/family side.
  return list.filter((s) => (s.key === 'referrer' && role === 'employer') || keep.has(s.key));
}

export const ROLE_GREETING = {
  employer:
    'היי, נעים מאוד! אני ' + AGENT_NAME + ' מעוגן סיעוד 😊\n' +
    'זה החלק של **המעסיק/המשפחה** — נאסוף את הפרטים שלכם ואת הדרכון של העובד/ת. ' +
    'העובד/ת ימלא/תמלא את החלק שלו/ה בנפרד, והמערכת תחבר הכול לפי מספר הדרכון.',
  worker:
    'Hi! I am ' + AGENT_NAME + ' from Ogen 😊\nהיי! זה החלק של **העובד/ת המטפל/ת**. ' +
    'נאסוף את הדרכון והפרטים האישיים. החלק של המעסיק ממולא בנפרד, והמערכת מחברת הכול יחד לפי מספר הדרכון.',
};

// ---- Legal: privacy consent + electronic-signature notice ----
// Shown once, before any detail is collected. Consent (with timestamp + IP) is
// stored with the submission so the process is compliant with חוק הגנת הפרטיות
// and the signature with חוק חתימה אלקטרונית התשס"א-2001.
export const CONSENT_VERSION = '2026-07-v1';
export const CONSENT_TEXT =
  'לפני שנתחיל — שקיפות מלאה 🔒\n' +
  'הפרטים והמסמכים שתמסרו נאספים על ידי **עוגן סיעוד ועובדים זרים בע"מ** לצורך תהליך ההשמה והפקת החוזה בלבד, ' +
  'ונשמרים באופן מאובטח. הם לא יימסרו לצד שלישי, למעט הרשויות הנדרשות על פי חוק (רשות האוכלוסין וההגירה, המוסד לביטוח לאומי). ' +
  'ניתן לפנות אלינו בכל עת לעיון או תיקון הפרטים.\n' +
  'החתימה על החוזה היא **חתימה אלקטרונית מחייבת** לפי חוק חתימה אלקטרונית, התשס"א-2001, ונשמרת עם תיעוד מלא (מועד וכתובת IP).\n' +
  'By continuing you consent to the collection and use of these details for the placement, and to signing the contract electronically.\n' +
  'לאישור והמשך, לחצו על הכפתור למטה 👇';
export const CONSENT_BUTTON = '✓ אני מאשר/ת ומסכים/ה';

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
  'העובד/ת, תעודת זהות של המטופל/מעסיק, היתר העסקה, שם המטופל/מעסיק, שם איש קשר, אימייל המעסיק, כתובת ' +
  'מלאה של המטופל, טלפון עובד/ת, שכר חודשי, תאריך הגעת העובד/ת לארץ, ותאריך העבודה האחרון המדויק. תשלום: דמי השמה 2000 ש"ח + דמי תאגיד ' +
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

// Metadata saved with each conversation — the customer's public IP (via a free
// service), plus browser/time info — so the office has a record of who chatted.
export async function getClientMeta() {
  const meta = {
    userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
    language: (typeof navigator !== 'undefined' && navigator.language) || '',
    startedAt: new Date().toISOString(),
  };
  try {
    const r = await withTimeout(fetch('https://api.ipify.org?format=json'), 6000);
    if (r.ok) { const d = await r.json(); if (d?.ip) meta.ip = d.ip; }
  } catch { /* IP lookup blocked — keep the rest */ }
  return meta;
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
export async function saveChat(rowId, { transcript, data, files, status, needsCallback, meta }) {
  const filePayload = [];
  for (const f of files || []) {
    filePayload.push({ category: f.category, name: f.name, dataUrl: await blobToDataUrl(f.blob) });
  }
  const payload = {
    kind: 'family',
    source: 'chat',
    status: status || 'chat',
    data: { chat: true, needsCallback: !!needsCallback, meta: meta || {}, transcript, fields: data, files: filePayload, updatedAt: new Date().toISOString() },
  };
  const { error } = await sb()
    .from('agent_submissions')
    .upsert({ id: rowId, ...payload }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export const newSessionId = uid;
