import { useEffect, useRef, useState } from 'react';
import {
  STEPS, FOLLOWUPS, GREETING, PAYMENT_TEXT, PAYMENT_LINK, NO_DISCOUNT_TEXT, INSURANCE_TEXT,
  faqAnswer, saveChat, newSessionId, applyUrlKey, aiChatReply, withTimeout,
  loadPublishedKey, wantsHuman, ESCALATE_TEXT, AGENT_NAME, getClientMeta,
  getRole, filterByRole, ROLE_GREETING, CONSENT_TEXT, CONSENT_BUTTON, CONSENT_VERSION,
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
  // Which half of the intake this link is for (employer / worker / all).
  const roleRef = useRef(getRole());
  const role = roleRef.current;
  const steps = filterByRole(STEPS, role);
  const followups = filterByRole(FOLLOWUPS, role);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [multiSel, setMultiSel] = useState([]); // selected options for a 'multi' step
  const [consented, setConsented] = useState(false); // privacy + e-signature consent
  const consentRef = useRef(null); // { at, version }
  const [collected, setCollected] = useState({});
  const [done, setDone] = useState(false);
  const [typing, setTyping] = useState(false);
  const filesRef = useRef([]);        // [{ category, name, blob }]
  const extractedRef = useRef({});    // field values read from the documents
  const callbackRef = useRef(false);  // customer asked to speak with a person
  const metaRef = useRef({});         // IP + browser metadata for this chat
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
    const s = steps.find((x) => !(x.key in col));
    if (s) return s;
    const known = { ...extractedRef.current, ...col };
    return followups.find((f) => !(f.key in known) && (!f.when || f.when(known))) || null;
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    applyUrlKey();                       // key from the link (fallback)
    loadPublishedKey().catch(() => {});  // key published by the office — in the background
    getClientMeta().then((m) => { metaRef.current = m; }).catch(() => {}); // IP + browser info
    (async () => {
      await botSay(ROLE_GREETING[role] || GREETING, 900);
      await botSay(CONSENT_TEXT, 1200); // then wait for the consent button
    })();
  }, []);

  // Record explicit consent (privacy + electronic signature) before collecting.
  async function giveConsent() {
    if (consented || typing) return;
    consentRef.current = { at: new Date().toISOString(), version: CONSENT_VERSION };
    setConsented(true);
    pushMe({ text: CONSENT_BUTTON });
    await botSay(steps[0].ask, 900);
  }

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [messages, typing]);

  // Persist transcript (+ fields) to Supabase so the office can read it live.
  const persist = (finalFiles) => {
    const transcript = messages.map((m) => ({ from: m.from, text: m.text || (m.image ? '[תמונה]' : '') }));
    const data = { ...extractedRef.current, ...collected };
    // The worker's passport number is the key that matches the two halves.
    const linkKey = (data.passportNo || data.passport || '').toString().replace(/\s+/g, '').toUpperCase();
    saveChat(sessionId.current, {
      transcript,
      data,
      files: finalFiles || [],
      status: finalFiles ? 'new' : 'chat',
      needsCallback: callbackRef.current,
      meta: { ...metaRef.current, role, linkKey, consent: consentRef.current },
    }).catch(() => {});
  };
  // Save shortly after every change (debounced).
  useEffect(() => {
    if (!messages.length) return undefined;
    const t = setTimeout(() => persist(done ? filesRef.current : null), 800);
    return () => clearTimeout(t);
  }, [messages, done]);

  async function finish() {
    // The worker's half just collects details — no payment. The office joins it
    // to the employer's half automatically by the passport number.
    if (role === 'worker') {
      await botSay('קיבלנו את כל הפרטים של העובד/ת, תודה רבה! 🙏', 500);
      await botSay('נחבר את הפרטים לצד של המעסיק ונמשיך בתהליך. אפשר לסגור את החלון 💙', 700);
      setDone(true);
      return;
    }
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

  // Quick-select answer (button) for a choice/multi step — records it just like
  // a typed answer and moves on.
  async function chooseOption(step, value) {
    if (typing || done || !value) return;
    pushMe({ text: value });
    const col = { ...collected, [step.key]: value };
    setCollected(col);
    setMultiSel([]);
    await botSay('נרשם ✓', 300);
    await advanceAfter(col);
  }

  // One-tap "don't know / skip" — leaves the field empty and moves on.
  async function skipStep(step) {
    if (!step || typing || done) return;
    pushMe({ text: 'לא יודע/ת' });
    const col = { ...collected, [step.key]: '' };
    setCollected(col);
    setMultiSel([]);
    await botSay('אין בעיה, נמשיך 🙂', 350);
    await advanceAfter(col);
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

    const missing = steps.filter((s) => !(s.key in collected)).map((s) => s.label);
    const historyText = messages.slice(-8).map((m) => `${m.from === 'bot' ? 'בוט' : 'לקוח'}: ${m.text || '[תמונה]'}`).join('\n');

    // "I don't know / not relevant / no permit…" → skip this question and move on,
    // leaving the field empty so it stays blank on the contract. (Bare "לא" is NOT
    // a skip — it's a valid answer to yes/no questions like marital status.)
    const SKIP_RE = /^(אין|לא יודע|לא יודעת|לא ידוע|לא צריך|אין לי|לא רלוונטי|דלג|לא בטוח|לא בטוחה|אחר כך|בהמשך|לא משנה)/;
    if (step && SKIP_RE.test(text)) {
      const col = { ...collected, [step.key]: '' };
      setCollected(col);
      await botSay('אין בעיה, נמשיך הלאה 🙂', 400);
      await advanceAfter(col);
      return;
    }

    // A document step that also accepts a typed value (e.g. passport by number,
    // no photo needed). Store it and, for the passport, use it as the link key.
    if (step && step.type === 'file' && step.allowText) {
      if (faq) { await botSay(faq); await botSay('נחזור רגע: ' + step.ask, 500); return; }
      const val = text.replace(/\s+/g, ' ').trim();
      const col = { ...collected, [step.key]: val };
      setCollected(col);
      if (step.key === 'passport') {
        extractedRef.current.passportNo = extractedRef.current.passportNo || val.replace(/\s+/g, '').toUpperCase();
      }
      await botSay('נרשם ✓', 350);
      await advanceAfter(col);
      return;
    }

    if (!step) { // everything collected — free chat, AI answers
      if (faq) { await botSay(faq); return; }
      const ai = await aiChatReply(historyText, text, missing);
      await botSay(ai || 'תודה! 🙏', 300);
      return;
    }

    if (step.type === 'text' || step.type === 'choice' || step.type === 'multi') {
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

  const total = steps.length;
  const doneCount = steps.filter((s) => s.key in collected).length;
  // The step currently awaiting an answer — used to show quick-select buttons.
  const curStep = !done && consented && !typing ? pendingStep(collected) : null;
  const showChoices = curStep && (curStep.type === 'choice' || curStep.type === 'multi');
  // Show a one-tap skip on optional questions and on the choice/multi ones.
  const canSkip = curStep && (curStep.optional || curStep.type === 'choice' || curStep.type === 'multi');

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

      {showChoices && curStep.type === 'choice' && (
        <div className="chat-choices">
          {curStep.options.map((opt) => (
            <button key={opt} className="chat-chip" onClick={() => chooseOption(curStep, opt)}>{opt}</button>
          ))}
          <button className="chat-chip skip" onClick={() => skipStep(curStep)}>לא יודע/ת</button>
        </div>
      )}
      {showChoices && curStep.type === 'multi' && (
        <div className="chat-choices">
          {curStep.options.map((opt) => {
            const on = multiSel.includes(opt);
            return (
              <button
                key={opt}
                className={`chat-chip${on ? ' on' : ''}`}
                onClick={() => setMultiSel((s) => (on ? s.filter((x) => x !== opt) : [...s, opt]))}
              >{on ? '✓ ' : ''}{opt}</button>
            );
          })}
          <button className="chat-chip go" disabled={!multiSel.length} onClick={() => chooseOption(curStep, multiSel.join(', '))}>המשך ›</button>
          <button className="chat-chip skip" onClick={() => skipStep(curStep)}>לא יודע/ת</button>
        </div>
      )}
      {canSkip && !showChoices && (
        <div className="chat-choices">
          <button className="chat-chip skip" onClick={() => skipStep(curStep)}>אין לי / לא יודע/ת — דלג</button>
        </div>
      )}
      {!done && !consented && !typing && (
        <div className="chat-choices">
          <button className="chat-chip go" onClick={giveConsent}>{CONSENT_BUTTON}</button>
        </div>
      )}

      {!done && consented && (
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
      {done && role !== 'worker' && (
        <div className="chat-done">
          <a className="btn-primary full" href={PAYMENT_LINK} target="_blank" rel="noreferrer">💳 מעבר לתשלום המאובטח</a>
        </div>
      )}
      <div className="chat-legal">
        <a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a>
      </div>
    </div>
  );
}
