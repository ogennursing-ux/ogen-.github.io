// Dead-simple inbound channel: a Telegram bot. The agent sends messages to the
// bot; this polls Telegram's getUpdates directly from the browser (the Bot API
// is CORS-enabled), stores new messages locally, and the inbox shows them for
// import. No server, no Supabase — just a free bot token pasted in Settings.

const TOKEN_KEY = 'tik_tg_token';
const OFFSET_KEY = 'tik_tg_offset';
const INBOX_KEY = 'tik_tg_inbox';

export function getTelegramToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setTelegramToken(v) {
  try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function readInbox() {
  try { return JSON.parse(localStorage.getItem(INBOX_KEY) || '[]'); } catch { return []; }
}
function writeInbox(list) {
  try { localStorage.setItem(INBOX_KEY, JSON.stringify(list.slice(-500))); } catch { /* ignore */ }
}

export function listTelegram() {
  return readInbox().filter((x) => x.status === 'new').sort((a, b) => b.date - a.date);
}
export function countTelegram() {
  return readInbox().filter((x) => x.status === 'new').length;
}
export function setTelegramStatus(id, status) {
  writeInbox(readInbox().map((x) => (x.id === id ? { ...x, status } : x)));
}

// Poll for new messages. Advances the stored offset so each update is only
// fetched once; keeps the messages locally so they persist for review.
export async function pollTelegram() {
  const token = getTelegramToken();
  if (!token) throw new Error('לא הוגדר בוט טלגרם. פתח/י ⚙ הגדרות והדבק/י את הטוקן.');
  const offset = Number(localStorage.getItem(OFFSET_KEY) || 0);
  const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=0${offset ? `&offset=${offset}` : ''}`;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('החיבור לטלגרם נכשל. בדוק/י אינטרנט. (' + (e?.message || e) + ')');
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 404) throw new Error('טוקן הבוט של טלגרם שגוי. בדוק/י אותו בהגדרות.');
    throw new Error('שגיאת טלגרם (' + res.status + ')');
  }
  const data = await res.json();
  if (!data.ok) throw new Error('טלגרם החזיר שגיאה: ' + (data.description || ''));

  const list = readInbox();
  let maxId = offset - 1;
  for (const u of data.result || []) {
    maxId = Math.max(maxId, u.update_id);
    const m = u.message || u.channel_post || u.edited_message;
    if (!m) continue;
    const text = m.text || m.caption || '';
    const hasPhoto = Array.isArray(m.photo) && m.photo.length > 0;
    if (!text && !hasPhoto) continue;
    if (list.some((x) => x.id === u.update_id)) continue;
    const from = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.chat?.title || 'טלגרם';
    list.push({ id: u.update_id, from, text, hasPhoto, date: (m.date || 0) * 1000, status: 'new' });
  }
  if ((data.result || []).length) localStorage.setItem(OFFSET_KEY, String(maxId + 1));
  writeInbox(list);
  return listTelegram();
}
