import { useEffect, useRef, useState } from 'react';
import {
  STEPS, FOLLOWUPS, GREETING, PAYMENT_TEXT, PAYMENT_LINK, NO_DISCOUNT_TEXT, INSURANCE_TEXT,
  faqAnswer, saveChat, newSessionId, applyUrlKey, aiChatReply, withTimeout,
  loadPublishedKey, wantsHuman, ESCALATE_TEXT, AGENT_NAME,
} from './intakeChat.js';
import { extractDocument, extractFamilyDocument, hasAI } from './gemini.js';

// Render **bold** and links inside a chat bubble.
function renderText(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>;
    return <span key={i}>{p}</span>;
  });
}

export default function IntakeChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [collected, setCollected] = useState({});
  const [done, setDone] = useState(false);
  const [typing, setTyping] = useState(false);
  const filesRef = useRef([]);        // [{ category, name, blob }]
  const extractedRef = useRef({});    // field values read from the documents
  const callbackRef = useRef(false);  // customer asked to speak with a person
  const sessionId = useRef(newSessionId());
  const fileInput = useRef(null);
  const camInput = useRef(null);
  const scroller = useRef(null);
  const startedRef = useRef(false);

  const pushBot = (text) => setMessages((m) => [...m, { from: 'bot', text }]);
  const pushMe = (msg) => setMessages((m) => [...m, { from: 'me', ...msg }]);

  // Bot "types" then speaks — with a human-like pause that scales to the length
  // of what it's about to say, so it reads like a real person is chatting.
  const botSay = (text, delay) => new Promise((res) => {
    const ms = delay != null ? delay : Math.min(3200, 900 + String(text).length * 22 + Math.random() * 500);
    setTyping(true);
    setTimeout(() => { setTyping(false); pushBot(text); res(); }, ms);
  });

  // Next thing to ask: an unfilled required step, then a follow-up question the
  // documents didn't already answer (marital status / spouse / parents).
  const pendingStep = (col) => {
    const s = STEPS.find((x) => !(x.key in col));
    if (s) return s;
    const known = { ...extractedRef.current, ...col };
    return FOLLOWUPS.find((f) => !(f.key in known) && (!f.when || f.when(known))) || null;
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    applyUrlKey();                       // key from the link (fallback)
    loadPublishedKey().catch(() => {});  // key published by the office — in the background
    (async () => {
      await botSay(GREETING, 900);
      await botSay(STEPS[0].ask, 1200);
    })();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [messages, typing]);

  // Persist transcript (+ fields) to Supabase so the office can read it live.
  const persist = (finalFiles) => {
    const transcript = messages.map((m) => ({ from: m.from, text: m.text || (m.image ? '[תמונה]' : '') }));
    saveChat(sessionId.current, {
      transcript,
      data: { ...extractedRef.current, ...collected },
      files: finalFiles || [],
      status: finalFiles ? 'new' : 'chat',
      needsCallback: callbackRef.current,
    }).catch(() => {});
  };
  // Save shortly after every change (debounced).
  useEffect(() => {
    if (!messages.length) return undefined;
    const t = setTimeout(() => persist(done ? filesRef.current : null), 800);
    return () => clearTimeout(t);
  }, [messages, done]);

  async function finish() {
    await botSay('קיבלנו את כל הפרטים, תודה רבה! 🙏', 500);
    await botSay(PAYMENT_TEXT, 700);
    await botSay(PAYMENT_LINK, 300);
    await botSay(NO_DISCOUNT_TEXT, 600);
    await botSay(INSURANCE_TEXT, 700);
    await botSay(
      'לאחר התשלום נהפוך את הפרטים לחוזה ונשלח אליכם — ואז נשאר רק להחתים את העובד/ת. ' +
      'תודה שבחרתם בעוגן סיעוד! 💙', 700,
    );
    setDone(true);
  }

  async function advanceAfter(col) {
    const next = pendingStep(col);
    if (next) await botSay(next.ask, 650);
    else await finish();
  }

  async function onText() {
    const text = input.trim();
    if (!text || typing || done) return;
    setInput('');
    pushMe({ text });
    const step = pendingStep(collected);
    const faq = faqAnswer(text);

    // Customer asked to speak with a person → flag it and promise a callback.
    if (wantsHuman(text)) {
      callbackRef.current = true;
      await botSay(ESCALATE_TEXT);
      if (step) await botSay(step.ask, 900);
      return;
    }

    const missing = STEPS.filter((s) => !(s.key in collected)).map((s) => s.label);
    const historyText = messages.slice(-8).map((m) => `${m.from === 'bot' ? 'בוט' : 'לקוח'}: ${m.text || '[תמונה]'}`).join('\n');

    if (!step) { // everything collected — free chat, AI answers
      if (faq) { await botSay(faq); return; }
      const ai = await aiChatReply(historyText, text, missing);
      await botSay(ai || 'תודה! 🙏', 300);
      return;
    }

    if (step.type === 'text') {
      if (faq) { await botSay(faq); await botSay('נחזור רגע: ' + step.ask, 500); return; }
      const col = { ...collected, [step.key]: text };
      setCollected(col);
      await botSay('נרשם ✓', 350);
      await advanceAfter(col);
      return;
    }
    // pending is an optional file step but the user typed "אין" → skip it
    if (/^(אין|לא|דלג|אין לי|לא רלוונטי)/.test(text) && step.optional) {
      const col = { ...collected, [step.key]: 'אין' };
      setCollected(col);
      await botSay('אין בעיה, אפשר להשלים אחר כך.', 500);
      await advanceAfter(col);
      return;
    }
    if (faq) { await botSay(faq); await botSay('וכשתהיו מוכנים: ' + step.ask, 500); return; }
    // let the AI answer naturally, then steer back to the pending document
    const ai = await aiChatReply(historyText, text, missing);
    if (ai) { await botSay(ai, 300); await botSay(step.ask, 500); }
    else await botSay('כדי להמשיך אני צריך תמונה כאן 🙂 ' + step.ask, 450);
  }

  async function onFiles(list) {
    const files = Array.from(list || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length || typing || done) return;
    const step = pendingStep(collected);
    for (const f of files) {
      const url = URL.createObjectURL(f);
      pushMe({ image: url });
      if (step && step.type === 'file') {
        filesRef.current.push({ category: step.category, name: f.name || step.key, blob: f });
      } else {
        filesRef.current.push({ category: 'other', name: f.name || 'doc', blob: f });
      }
    }
    if (step && step.type === 'file') {
      const col = { ...collected, [step.key]: true };
      setCollected(col);
      // Read the document with AI (if a key was provided in the link).
      if (hasAI()) {
        const img = files[0];
        try {
          setTyping(true);
          const res = await withTimeout(
            step.key === 'passport'
              ? extractDocument(img, 'passport')
              : extractFamilyDocument(img, step.key === 'permit' ? 'permit' : 'id'),
            16000,
          );
          setTyping(false);
          const patch = res?.patch || {};
          Object.assign(extractedRef.current, patch);
          const bits = [
            patch.nameEn || patch.nameHe || patch.fullName,
            patch.passportNo && 'דרכון ' + patch.passportNo,
            patch.idNumber && 'ת.ז ' + patch.idNumber,
          ].filter(Boolean).join(' · ');
          await botSay(bits ? `קראתי מהמסמך: ${bits} ✓` : 'קיבלתי, תודה ✓', 300);
        } catch {
          setTyping(false);
          await botSay('קיבלתי, תודה ✓', 300);
        }
      } else {
        await botSay('קיבלתי, תודה ✓', 450);
      }
      await advanceAfter(col);
    } else {
      await botSay('תודה על התמונה! 📎', 400);
      if (step) await botSay(step.ask, 450);
    }
  }

  const total = STEPS.length;
  const doneCount = STEPS.filter((s) => s.key in collected).length;

  return (
    <div className="chat-wrap">
      <div className="chat-head">
        <div className="chat-avatar">{AGENT_NAME.slice(0, 1)}</div>
        <div className="chat-head-txt">
          <strong>{AGENT_NAME} · עוגן סיעוד</strong>
          <span>{typing ? 'מקליד…' : done ? 'מקוון' : 'מקוון · זמין עכשיו'}</span>
        </div>
      </div>

      <div className="chat-body" ref={scroller}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-row ${m.from}`}>
            <div className="chat-bubble">
              {m.image ? <img className="chat-img" src={m.image} alt="" /> : renderText(m.text)}
            </div>
          </div>
        ))}
        {typing && (
          <div className="chat-row bot">
            <div className="chat-bubble chat-typing"><span></span><span></span><span></span></div>
          </div>
        )}
      </div>

      {!done && (
        <div className="chat-input">
          <button className="chat-icon" title="מצלמה" onClick={() => camInput.current?.click()}>📷</button>
          <button className="chat-icon" title="קובץ" onClick={() => fileInput.current?.click()}>📎</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input
            className="chat-text"
            placeholder="כתבו הודעה…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onText(); }}
          />
          <button className="chat-send" onClick={onText} disabled={!input.trim()}>שלח</button>
        </div>
      )}
      {done && (
        <div className="chat-done">
          <a className="btn-primary full" href={PAYMENT_LINK} target="_blank" rel="noreferrer">💳 מעבר לתשלום המאובטח</a>
        </div>
      )}
    </div>
  );
}
