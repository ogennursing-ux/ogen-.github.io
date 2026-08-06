import { useEffect, useRef, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { chatAI, hasChatAI } from './aiChat.js';
import { buildAiContext } from './aiContext.js';
import { getGroqKey, setGroqKey } from './gemini.js';
import MicButton from './MicButton.jsx';

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>🤖 העוזר החכם</h2>
        <label className="field-label">שם משתמש</label>
        <input className="text-input" value={user} autoFocus onChange={(e) => setUser(e.target.value)} />
        <label className="field-label" style={{ marginTop: 10 }}>סיסמה</label>
        <input className="text-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <p className="login-error">שם משתמש או סיסמה שגויים</p>}
        <button className="btn-primary full" type="submit" style={{ marginTop: 14 }}>התחבר</button>
      </form>
    </div>
  );
}

// One-time paste of a Groq key, so the assistant works without opening settings.
function KeyGate({ onSet }) {
  const [k, setK] = useState('');
  return (
    <div className="ai-keygate">
      <h3>🔑 חיבור למנוע ה-AI</h3>
      <p>כדי להפעיל את העוזר, הדבק/י מפתח Groq (חינמי, מ-<span dir="ltr">console.groq.com</span>). המפתח נשמר במחשב הזה בלבד.</p>
      <input className="text-input" dir="ltr" placeholder="gsk_..." value={k} onChange={(e) => setK(e.target.value)} />
      <button className="btn-primary" style={{ marginTop: 10 }} disabled={!k.trim()} onClick={() => { setGroqKey(k.trim()); onSet(); }}>שמור והפעל</button>
    </div>
  );
}

const SUGGESTIONS = [
  'אילו היתרים או ויזות פגים ב-30 הימים הקרובים?',
  'מי צריך ביקור עו"ס החודש?',
  'אילו ביקורים באיחור?',
  'כמה השמות פעילות יש לנו?',
  'נסח הודעת וואטסאפ למשפחה שמזכירה שהיתר העובד עומד לפוג.',
];

function Chat() {
  const [ctx, setCtx] = useState(null);
  const [ctxErr, setCtxErr] = useState('');
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    buildAiContext().then(setCtx).catch((e) => { console.error(e); setCtxErr(e?.message || String(e)); });
  }, []);
  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight); }, [messages, busy]);

  const systemPrompt = () => [
    'את/ה העוזר/ת המשרדי/ת של "עוגן סיעוד ועובדים זרים" — לשכה לסיעוד ועובדים זרים.',
    'ענה/י בעברית, בקצרה ולעניין. הסתמך/י אך ורק על הנתונים שלהלן; אם משהו לא מופיע בנתונים — אמור/י שאין לך את המידע, אל תמציא/י.',
    'כשמבקשים לנסח מכתב/הודעה/מייל — כתוב/כתבי טיוטה מנוסחת ומוכנה לשליחה.',
    '',
    '=== נתוני המשרד (עדכני) ===',
    ctx?.text || '(לא נטענו נתונים)',
  ].join('\n');

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const reply = await chatAI([{ role: 'system', content: systemPrompt() }, ...next]);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ ' + (e?.message || e) }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="ai-wrap">
      <header className="ai-head">
        <div>
          <h1>🤖 העוזר החכם</h1>
          <p className="ai-sub">שאל/י על התיקים, התוקפים, הביקורים והתשלומים — או בקש/י לנסח הודעה. מבוסס על הנתונים החיים של המשרד.</p>
        </div>
        <a className="rp-btn ghost" href="#registry">← חזרה למערכת</a>
      </header>

      {ctxErr && <div className="ai-warn">שגיאה בטעינת הנתונים: {ctxErr}</div>}

      <div className="ai-chat" ref={scroller}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>שלום 👋 אני מכיר את כל התיקים. אפשר לשאול אותי דברים כמו:</p>
            <div className="ai-chips">
              {SUGGESTIONS.map((s) => <button key={s} className="ai-chip" onClick={() => send(s)} disabled={!ctx}>{s}</button>)}
            </div>
            {!ctx && !ctxErr && <p className="muted" style={{ marginTop: 12 }}>טוען נתונים…</p>}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="ai-bubble">{m.content}</div>
          </div>
        ))}
        {busy && <div className="ai-msg assistant"><div className="ai-bubble ai-typing">חושב…</div></div>}
      </div>

      <form className="ai-inputbar" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="text-input" placeholder="כתוב/י שאלה… או דבר/י 🎤" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
        <MicButton onText={(t) => setInput((v) => (v ? v + ' ' : '') + t)} />
        <button className="btn-primary" type="submit" disabled={busy || !input.trim()}>שלח</button>
      </form>
    </div>
  );
}

export default function AssistantDesk() {
  const [authed, setAuthed] = useState(isAuthed());
  const [ready, setReady] = useState(hasChatAI());
  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  if (!ready) return <div className="ai-wrap"><KeyGate onSet={() => setReady(true)} /></div>;
  return <Chat />;
}
