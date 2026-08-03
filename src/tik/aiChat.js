// Free-text AI chat, on top of the keys the office already stores in settings
// (Groq or Gemini). gemini.js's own callGroq forces a JSON response, which is
// right for extraction but wrong for a conversation — so this is a separate,
// plain-text path. No key is ever committed; it lives in the browser only.
import { getGroqKey, getGroqTextModel, getGeminiKey, getGeminiModel } from './gemini.js';

async function groqChat(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getGroqKey() },
    body: JSON.stringify({ model: getGroqTextModel(), messages, temperature: 0.3 }),
  });
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new Error('מפתח ה-Groq אינו תקין. בדוק/י אותו בהגדרות.');
    if (res.status === 429) throw new Error('חרגת ממכסת השימוש ב-Groq. נסה/י שוב מאוחר יותר.');
    throw new Error('שגיאת Groq (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  return (await res.json())?.choices?.[0]?.message?.content || '';
}

// Gemini fallback: fold the system message into systemInstruction, map the rest
// to Gemini's user/model turns.
async function geminiChat(messages) {
  const key = getGeminiKey();
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const turns = messages.filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: turns,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new Error('שגיאת Gemini (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

// True when the office has entered at least one AI key.
export const hasChatAI = () => !!getGroqKey() || !!getGeminiKey();

// Send a message list ([{role:'system'|'user'|'assistant', content}]) → reply text.
export async function chatAI(messages) {
  if (getGroqKey()) return groqChat(messages);
  if (getGeminiKey()) return geminiChat(messages);
  throw new Error('לא הוגדר מפתח AI. היכנס/י להגדרות והדבק/י מפתח Groq או Gemini.');
}
