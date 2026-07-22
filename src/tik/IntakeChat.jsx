import { useEffect, useRef, useState } from 'react';
import {
  STEPS, FOLLOWUPS, GREETING, PAYMENT_TEXT, PAYMENT_LINK, NO_DISCOUNT_TEXT, INSURANCE_TEXT,
  faqAnswer, saveChat, newSessionId, applyUrlKey, aiChatReply, withTimeout,
  loadPublishedKey, wantsHuman, ESCALATE_TEXT, AGENT_NAME, getClientMeta,
  getRole, filterByRole, ROLE_GREETING, CONSENT_TEXT, CONSENT_BUTTON, CONSENT_VERSION,
  PAY_SUMMARY, COUPON_PLACEHOLDER, COUPON_OK, COUPON_BAD, checkCoupon,
  INSURANCE_OFFER, noInsurance,
} from './intakeChat.js';
import { LANGS, RTL_LANGS, t } from './chatI18n.js';
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

  // Only the caregiver (worker) chooses a language; the rest stay in Hebrew.
  const [lang, setLang] = useState(role === 'worker' ? '' : 'he');
  const multi = role === 'worker';
  const tr = (k) => t(lang || 'he', k);
  // The question to ask for a step — translated for the worker, Hebrew otherwise.
  const askText = (step) => (multi && lang ? (t(lang, 'ask_' + step.key) || step.ask) : step.ask);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [multiSel, setMultiSel] = useState([]); // selected options for a 'multi' step
  const [consented, setConsented] = useState(false); // privacy + e-signature consent
  const consentRef = useRef(null); // { at, version }
  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState('');
  const [couponOk, setCouponOk] = useState(false);
  const couponRef = useRef('');
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
    applyUrlKey();                       // key from the link (fallback)
    loadPublishedKey().catch(() => {});  // key published by the office — in the background
    getClientMeta().then((m) => { metaRef.current = m; }).catch(() => {}); // IP + browser info
    if (!multi) { startedRef.current = true; runGreeting('he'); } // worker waits for a language pick
  }, []);

  async function runGreeting(code) {
    const greet = multi ? t(code, 'greeting') : (ROLE_GREETING[role] || GREETING);
    const consentMsg = multi ? t(code, 'consent') : CONSENT_TEXT;
    await botSay(greet, 900);
    await botSay(consentMsg, 1200); // then wait for the consent button
  }

  // Worker picks a language on the opening screen → the whole chat runs in it.
  async function pickLang(code) {
    if (lang || typing) return;
    setLang(code);
    startedRef.current = true;
    await runGreeting(code);
  }

  // Record explicit consent (privacy + electronic signature) before collecting.
  async function giveConsent() {
    if (consented || typing) return;
    consentRef.current = { at: new Date().toISOString(), version: CONSENT_VERSION };
    setConsented(true);
    pushMe({ text: tr('consentBtn') });
    await botSay(askText(steps[0]), 900);
  }

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [messages, typing]);

  // How many uploaded files are already saved to the cloud (so we don't
  // re-upload them on every message, but DO upload each new photo right away).
  const uploadedFiles = useRef(0);
  // Persist transcript (+ fields + photos) to Supabase so the office can read it
  // live — even a half-finished chat shows up, with whatever was sent so far.
  const persist = (includeFiles, isFinal) => {
    const transcript = messages.map((m) => ({ from: m.from, text: m.text || (m.image ? '[תמונה]' : '') }));
    const data = { ...extractedRef.current, ...collected };
    // The worker's passport number is the key that matches the two halves.
    const linkKey = (data.passportNo || data.passport || '').toString().replace(/\s+/g, '').toUpperCase();
    const files = includeFiles ? filesRef.current : [];
    return saveChat(sessionId.current, {
      transcript,
      data,
      files,
      status: isFinal ? 'new' : 'chat',
      needsCallback: callbackRef.current,
      meta: { ...metaRef.current, role, linkKey, consent: consentRef.current, lang: lang || 'he', coupon: couponRef.current || undefined },
    }).then(() => { if (includeFiles) uploadedFiles.current = filesRef.current.length; })
      .catch(() => {});
  };
  // Save shortly after every change (debounced). Upload photos as soon as they
  // arrive — and everything again at the end — so nothing is lost if the
  // customer stops halfway.
  useEffect(() => {
    if (!messages.length) return undefined;
    const t = setTimeout(() => {
      const includeFiles = done || filesRef.current.length > uploadedFiles.current;
      persist(includeFiles, done);
    }, 800);
    return () => clearTimeout(t);
  }, [messages, done]);

  async function finish() {
    // The worker's half just collects details — no payment. The office joins it
    // to the employer's half automatically by the passport number.
    if (role === 'worker') {
      await botSay(tr('finish1'), 500);
      await botSay(tr('finish2'), 700);
      setDone(true);
      return;
    }
    // If they don't already have medical insurance, route them to our partner.
    if (noInsurance(collected.hasInsurance)) await botSay(INSURANCE_OFFER, 800);
    // Consolidated closing — two clean bubbles instead of five.
    await botSay('קיבלנו את כל הפרטים, תודה רבה! 🙏\n\n' + PAY_SUMMARY, 800);
    await botSay(PAYMENT_LINK, 400);
    setDone(true);
  }

  // A coupon (e.g. "עוגן 2840") waives the payment and finishes the process.
  function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    if (checkCoupon(code)) {
      couponRef.current = code;
      setCouponOk(true);
      setCouponMsg('');
      pushBot(COUPON_OK);
      setTimeout(() => persist(true, true), 300); // record the coupon (final)
    } else {
      setCouponMsg(COUPON_BAD);
    }
  }

  async function advanceAfter(col) {
    const next = pendingStep(col);
    if (next) await botSay(askText(next), 650);
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
    await botSay(tr('recorded'), 300);
    await advanceAfter(col);
  }

  // One-tap "don't know / skip" — leaves the field empty and moves on.
  async function skipStep(step) {
    if (!step || typing || done) return;
    pushMe({ text: tr('skip') });
    const col = { ...collected, [step.key]: '' };
    setCollected(col);
    setMultiSel([]);
    await botSay(tr('noWorries'), 350);
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
      if (step) await botSay(askText(step), 900);
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
      await botSay(tr('noWorries'), 400);
      await advanceAfter(col);
      return;
    }

    // A document step that also accepts a typed value (e.g. passport by number,
    // no photo needed). Store it and, for the passport, use it as the link key.
    if (step && step.type === 'file' && step.allowText) {
      if (faq) { await botSay(faq); await botSay('נחזור רגע: ' + askText(step), 500); return; }
      const val = text.replace(/\s+/g, ' ').trim();
      const col = { ...collected, [step.key]: val };
      setCollected(col);
      if (step.key === 'passport') {
        extractedRef.current.passportNo = extractedRef.current.passportNo || val.replace(/\s+/g, '').toUpperCase();
      }
      await botSay(tr('recorded'), 350);
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
      if (faq) { await botSay(faq); await botSay('נחזור רגע: ' + askText(step), 500); return; }
      const col = { ...collected, [step.key]: text };
      setCollected(col);
      await botSay(tr('recorded'), 350);
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
    if (faq) { await botSay(faq); await botSay('וכשתהיו מוכנים: ' + askText(step), 500); return; }
    // let the AI answer naturally, then steer back to the pending document
    const ai = await aiChatReply(historyText, text, missing);
    if (ai) { await botSay(ai, 300); await botSay(askText(step), 500); }
    else await botSay('כדי להמשיך אני צריך תמונה כאן 🙂 ' + askText(step), 450);
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
          // The ID card already gives us the employer/patient name — don't ask
          // for it again. Fill it in so that step is skipped automatically.
          if (step.key === 'patientId' && patch.fullName && !col.employerName) {
            col.employerName = patch.fullName;
            setCollected({ ...col });
          }
          const bits = [
            patch.nameEn || patch.nameHe || patch.fullName,
            patch.passportNo && 'דרכון ' + patch.passportNo,
            patch.idNumber && 'ת.ז ' + patch.idNumber,
          ].filter(Boolean).join(' · ');
          await botSay(bits ? `קראתי מהמסמך: ${bits} ✓` : tr('gotImage'), 300);
        } catch {
          setTyping(false);
          await botSay(tr('gotImage'), 300);
        }
      } else {
        await botSay(tr('gotImage'), 450);
      }
      await advanceAfter(col);
    } else {
      await botSay('תודה על התמונה! 📎', 400);
      if (step) await botSay(askText(step), 450);
    }
  }

  const total = steps.length;
  const doneCount = steps.filter((s) => s.key in collected).length;
  // The step currently awaiting an answer — used to show quick-select buttons.
  const curStep = !done && consented && !typing ? pendingStep(collected) : null;
  const showChoices = curStep && (curStep.type === 'choice' || curStep.type === 'multi');
  // Show a one-tap skip on optional questions and on the choice/multi ones.
  const canSkip = curStep && (curStep.optional || curStep.type === 'choice' || curStep.type === 'multi');
  // Same assistant across the registration bot — "מאור" (Maor in Latin scripts).
  const ltr = !RTL_LANGS.has(lang || 'he');
  const agentName = multi && ltr ? 'Maor' : AGENT_NAME;
  const company = multi && ltr ? 'Ogen' : 'עוגן סיעוד';

  return (
    <div className="chat-wrap" dir={RTL_LANGS.has(lang || 'he') ? 'rtl' : 'ltr'}>
      <div className="chat-head">
        <div className="chat-avatar">{agentName.slice(0, 1)}</div>
        <div className="chat-head-txt">
          <strong>{agentName} · {company}</strong>
          <span>{typing ? tr('typing') : tr('online')}</span>
        </div>
      </div>

      {multi && !lang && (
        <div className="chat-lang-pick">
          <p className="chat-lang-title">{t('en', 'pickLanguage')}</p>
          <div className="chat-lang-grid">
            {LANGS.map((l) => (
              <button key={l.code} className="chat-lang-btn" onClick={() => pickLang(l.code)}>
                <span className="flag">{l.flag}</span><span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
          <button className="chat-chip skip" onClick={() => skipStep(curStep)}>{tr('skip')}</button>
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
          <button className="chat-chip skip" onClick={() => skipStep(curStep)}>{tr('skip')}</button>
        </div>
      )}
      {canSkip && !showChoices && (
        <div className="chat-choices">
          <button className="chat-chip skip" onClick={() => skipStep(curStep)}>{tr('skip')}</button>
        </div>
      )}
      {!done && !consented && !typing && lang && (
        <div className="chat-choices">
          <button className="chat-chip go" onClick={giveConsent}>{tr('consentBtn')}</button>
        </div>
      )}

      {!done && consented && (
        <div className="chat-input">
          {/* The writing field gets its own full-width row so what you type is clear. */}
          <div className="chat-input-text">
            <input
              className="chat-text"
              placeholder={tr('placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onText(); }}
            />
            <button className="chat-send" onClick={onText} disabled={!input.trim()}>{tr('send')}</button>
          </div>
          {/* Photo / camera on a second, smaller row. */}
          <div className="chat-input-media">
            <button className="chat-photo-btn" onClick={() => camInput.current?.click()}>
              <span className="ic">📷</span><span className="lbl">{tr('camera')}</span>
            </button>
            <button className="chat-photo-btn" onClick={() => fileInput.current?.click()}>
              <span className="ic">🖼️</span><span className="lbl">{tr('gallery')}</span>
            </button>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
            <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
      )}
      {done && role !== 'worker' && !couponOk && (
        <div className="chat-done">
          <a className="btn-primary full" href={PAYMENT_LINK} target="_blank" rel="noreferrer">💳 מעבר לתשלום המאובטח</a>
          <div className="chat-coupon">
            <input className="chat-text" placeholder={COUPON_PLACEHOLDER} value={couponInput}
              onChange={(e) => { setCouponInput(e.target.value); setCouponMsg(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCoupon(); }} />
            <button className="chat-send" onClick={applyCoupon} disabled={!couponInput.trim()}>אישור</button>
          </div>
          {couponMsg && <p className="chat-coupon-msg">{couponMsg}</p>}
        </div>
      )}
      {done && couponOk && (
        <div className="chat-done"><div className="chat-coupon-ok">✓ פטורים מתשלום — סיימנו!</div></div>
      )}
      <div className="chat-legal">
        <a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a>
      </div>
    </div>
  );
}
