import { useMemo, useState } from 'react';
import {
  DOC_TYPES, EVENT_TYPES, documentHistory, addDocumentEntry,
  PAYMENT_METHODS, INSURANCE_COMPANIES, payments, addPayment, vatBreakdown,
  VISIT_TYPES, visits, addVisit,
  notes, addNote,
  assignRakaz, duplicateCase,
} from './caseDetail.js';
import { COMPANY_NAME } from '../lib/workerPortal.js';

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtMoney = (n) => `${(Number(n) || 0).toLocaleString('he-IL')} ₪`;

function DocTab({ caseObj, onChanged }) {
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({});
  const save = async (docKey) => {
    if (!form.expiry) return;
    await addDocumentEntry(caseObj, docKey, {
      event: form.event || EVENT_TYPES[0], number: form.number || '',
      issued: form.issued || '', expiry: form.expiry, company: form.company || '',
    });
    setForm({}); setOpen(null); onChanged();
  };
  return (
    <div className="cd-panel">
      {DOC_TYPES.map((t) => {
        const hist = documentHistory(caseObj, t.key);
        return (
          <div key={t.key} className="cd-doc-block">
            <div className="cd-doc-head">
              <b>{t.label}</b>
              <button className="cd-mini-btn" onClick={() => setOpen(open === t.key ? null : t.key)}>
                {open === t.key ? 'סגור' : '+ הוסף רשומה'}
              </button>
            </div>
            {hist.length > 0 ? (
              <table className="cd-doc-table">
                <thead><tr><th>אירוע</th>{t.hasNumber && <th>מספר</th>}{t.hasCompany && <th>חברה</th>}<th>הופק</th><th>בתוקף עד</th></tr></thead>
                <tbody>
                  {hist.map((h) => (
                    <tr key={h.id}>
                      <td>{h.event}</td>
                      {t.hasNumber && <td dir="ltr">{h.number}</td>}
                      {t.hasCompany && <td>{h.company}</td>}
                      <td>{fmtDate(h.issued)}</td>
                      <td>{fmtDate(h.expiry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="cd-empty">אין עדיין רשומות.</p>}
            {open === t.key && (
              <div className="cd-doc-form">
                <select value={form.event || ''} onChange={(e) => setForm({ ...form, event: e.target.value })}>
                  <option value="">סוג אירוע…</option>
                  {EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
                {t.hasNumber && <input placeholder="מספר" dir="ltr" value={form.number || ''} onChange={(e) => setForm({ ...form, number: e.target.value })} />}
                {t.hasCompany && (
                  <select value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                    <option value="">חברת ביטוח…</option>
                    {INSURANCE_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <input type="date" placeholder="תאריך הופק" value={form.issued || ''} onChange={(e) => setForm({ ...form, issued: e.target.value })} />
                <input type="date" placeholder="בתוקף עד" value={form.expiry || ''} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
                <button className="cd-save-btn" disabled={!form.expiry} onClick={() => save(t.key)}>שמור</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReceiptPrintable({ caseObj, payment, onClose }) {
  const { net, vat, gross } = vatBreakdown(payment.amount);
  const name = caseObj.family?.fullName || caseObj.data?.fields?.employerName || '';
  return (
    <div className="cd-receipt-overlay" onClick={onClose}>
      <div className="cd-receipt" onClick={(e) => e.stopPropagation()}>
        <div className="cd-receipt-head">
          <div>
            <b>{COMPANY_NAME}</b>
            <div className="muted">בן צבי 84, תל אביב · 216095568</div>
          </div>
          <div className="cd-receipt-title">קבלה{payment.method === 'הוראת קבע' ? ' / הוראת קבע' : ''}</div>
        </div>
        <div className="cd-receipt-row"><span>לכבוד:</span><b>{name}</b></div>
        <div className="cd-receipt-row"><span>תאריך:</span><span>{fmtDate(payment.date)}</span></div>
        <div className="cd-receipt-row"><span>אמצעי תשלום:</span><span>{payment.method}</span></div>
        {payment.method === 'המחאה' && (
          <div className="cd-receipt-row"><span>פרטי המחאה:</span><span>בנק {payment.checkBank || '—'} · סניף {payment.checkBranch || '—'} · מס' {payment.checkNumber || '—'}</span></div>
        )}
        <table className="cd-receipt-table">
          <tbody>
            <tr><td>סכום לפני מע"מ</td><td>{fmtMoney(net)}</td></tr>
            <tr><td>מע"מ (17%)</td><td>{fmtMoney(vat)}</td></tr>
            <tr className="cd-receipt-total"><td>סה"כ כולל מע"מ</td><td>{fmtMoney(gross)}</td></tr>
          </tbody>
        </table>
        {payment.note && <div className="cd-receipt-note">{payment.note}</div>}
        <div className="cd-receipt-actions">
          <button className="btn-primary" onClick={() => window.print()}>🖨️ הדפס</button>
          <button className="cd-mini-btn" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({ caseObj, onChanged }) {
  const [form, setForm] = useState({ method: PAYMENT_METHODS[0] });
  const [showAdd, setShowAdd] = useState(false);
  const [receiptFor, setReceiptFor] = useState(null);
  const list = payments(caseObj);
  const totalGross = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const save = async () => {
    if (!form.amount || !form.date) return;
    await addPayment(caseObj, { ...form, amount: Number(form.amount) });
    setForm({ method: PAYMENT_METHODS[0] }); setShowAdd(false); onChanged();
  };

  return (
    <div className="cd-panel">
      <div className="cd-pay-summary">סה"כ נגבה: <b>{fmtMoney(totalGross)}</b> · {list.length} תשלומים</div>
      {list.length ? (
        <div className="cd-pay-list">
          {list.map((p) => (
            <div key={p.id} className="cd-pay-row">
              <div className="cd-pay-mid">
                <div className="cd-pay-amount">{fmtMoney(p.amount)}</div>
                <div className="cd-pay-meta">{fmtDate(p.date)} · {p.method}</div>
              </div>
              <button className="cd-mini-btn" onClick={() => setReceiptFor(p)}>🧾 קבלה</button>
            </div>
          ))}
        </div>
      ) : <p className="cd-empty">עדיין לא נרשמו תשלומים.</p>}

      {!showAdd ? (
        <button className="cd-mini-btn" onClick={() => setShowAdd(true)}>+ רשום תשלום</button>
      ) : (
        <div className="cd-doc-form">
          <input type="number" placeholder="סכום כולל מע״מ" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {form.method === 'המחאה' && (
            <>
              <input placeholder="בנק" value={form.checkBank || ''} onChange={(e) => setForm({ ...form, checkBank: e.target.value })} />
              <input placeholder="סניף" value={form.checkBranch || ''} onChange={(e) => setForm({ ...form, checkBranch: e.target.value })} />
              <input placeholder="מס׳ המחאה" value={form.checkNumber || ''} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
            </>
          )}
          <input placeholder="הערה (לא חובה)" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className="cd-save-btn" disabled={!form.amount || !form.date} onClick={save}>שמור</button>
        </div>
      )}
      {receiptFor && <ReceiptPrintable caseObj={caseObj} payment={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}

function VisitsTab({ caseObj, onChanged }) {
  const [form, setForm] = useState({ type: VISIT_TYPES[0] });
  const list = visits(caseObj);
  const save = async () => {
    if (!form.date) return;
    await addVisit(caseObj, form);
    setForm({ type: VISIT_TYPES[0] }); onChanged();
  };
  return (
    <div className="cd-panel">
      {list.length ? (
        <div className="cd-pay-list">
          {list.map((v) => (
            <div key={v.id} className="cd-pay-row">
              <div className="cd-pay-mid">
                <div className="cd-pay-amount">{v.type}</div>
                <div className="cd-pay-meta">{fmtDate(v.date)}{v.note ? ' · ' + v.note : ''}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="cd-empty">אין עדיין ביקורים/פגישות רשומים.</p>}
      <div className="cd-doc-form">
        <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="הערה" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="cd-save-btn" disabled={!form.date} onClick={save}>שמור</button>
      </div>
    </div>
  );
}

function NotesTab({ caseObj, onChanged }) {
  const [text, setText] = useState('');
  const list = notes(caseObj);
  const save = async () => {
    if (!text.trim()) return;
    await addNote(caseObj, text.trim());
    setText(''); onChanged();
  };
  return (
    <div className="cd-panel">
      <div className="cd-doc-form" style={{ marginBottom: 14 }}>
        <textarea rows={2} placeholder="הוסף הערה…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="cd-save-btn" disabled={!text.trim()} onClick={save}>שמור הערה</button>
      </div>
      {list.length ? (
        <div className="cd-notes-list">
          {list.map((n) => (
            <div key={n.id} className="cd-note-row">
              <div className="cd-note-date">{fmtDate(n.at)}</div>
              <div>{n.text}</div>
            </div>
          ))}
        </div>
      ) : <p className="cd-empty">אין עדיין הערות.</p>}
    </div>
  );
}

export default function CaseDetail({ caseObj, onClose, onChanged }) {
  const [tab, setTab] = useState('info');
  const [hideSensitive, setHideSensitive] = useState(true);
  const [rakazBusy, setRakazBusy] = useState(false);
  const [dupBusy, setDupBusy] = useState(false);
  const f = caseObj.family || {};
  const w = caseObj.worker || {};
  const mask = (v) => (hideSensitive && v ? '••••••' : v);

  const waLink = useMemo(() => {
    const phone = (f.phone || f.mobile || '').replace(/\D/g, '');
    const text = encodeURIComponent(`עוגן סיעוד — תיק ${f.fullName || w.nameHe || ''}`);
    return phone ? `https://wa.me/972${phone.replace(/^0/, '')}?text=${text}` : '';
  }, [f, w]);

  async function onDuplicate() {
    setDupBusy(true);
    try { await duplicateCase(caseObj); onChanged(); alert('תיק חדש נוצר (עותק).'); }
    catch (e) { alert('שכפול נכשל: ' + (e?.message || e)); }
    finally { setDupBusy(false); }
  }
  async function onAssign() {
    const name = prompt('שם הרכז/ת האחראי/ת על התיק:', caseObj.data?.fields?.assignedTo || '');
    if (name == null) return;
    setRakazBusy(true);
    try { await assignRakaz(caseObj, name); onChanged(); } finally { setRakazBusy(false); }
  }

  const TABS = [
    ['info', '📋 פרטים'],
    ['docs', '📁 מסמכים'],
    ['pay', '💳 תשלומים'],
    ['visits', '📅 ביקורים'],
    ['notes', '📝 הערות'],
  ];

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cd-head">
          <div>
            <h2>{f.fullName || 'ללא שם'} {w.nameHe || w.nameEn ? `· 👷 ${w.nameHe || w.nameEn}` : ''}</h2>
            <div className="cd-head-sub">
              {caseObj.data?.fields?.caseNumber && <span>תיק #{caseObj.data.fields.caseNumber}</span>}
              <span>רכז/ת: {caseObj.data?.fields?.assignedTo || 'לא משויך'}</span>
            </div>
          </div>
          <button className="board-refresh" onClick={onClose}>✕</button>
        </div>

        <div className="cd-toolbar">
          <button className="cd-mini-btn" disabled={rakazBusy} onClick={onAssign}>👤 שייך רכז/ת</button>
          <button className="cd-mini-btn" disabled={dupBusy} onClick={onDuplicate}>🧬 שכפל תיק</button>
          {waLink && <a className="cd-mini-btn" href={waLink} target="_blank" rel="noreferrer">💬 וואטסאפ</a>}
          <button className="cd-mini-btn" onClick={() => setHideSensitive((v) => !v)}>{hideSensitive ? '👁️ הצג פרטים רגישים' : '🙈 הסתר פרטים רגישים'}</button>
        </div>

        <div className="board-tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`board-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="cd-panel">
            <div className="cd-info-grid">
              <div><span>שם מלא</span><b>{f.fullName || '—'}</b></div>
              <div><span>ת״ז</span><b dir="ltr">{mask(f.idNumber) || '—'}</b></div>
              <div><span>טלפון</span><b dir="ltr">{mask(f.phone || f.mobile) || '—'}</b></div>
              <div><span>כתובת</span><b>{[f.street, f.city].filter(Boolean).join(', ') || '—'}</b></div>
              <div><span>עובד/ת</span><b>{w.nameHe || w.nameEn || '—'}</b></div>
              <div><span>דרכון</span><b dir="ltr">{mask(w.passportNo) || '—'}</b></div>
              <div><span>אזרחות</span><b>{w.nationality || '—'}</b></div>
              <div><span>טלפון עובד/ת</span><b dir="ltr">{mask(w.phone) || '—'}</b></div>
              <div><span>שכר</span><b>{f.offeredSalary || caseObj.data?.fields?.salary || '—'}</b></div>
              <div><span>תאריך תחילה</span><b>{fmtDate(caseObj.data?.fields?.startDate) || '—'}</b></div>
            </div>
          </div>
        )}
        {tab === 'docs' && <DocTab caseObj={caseObj} onChanged={onChanged} />}
        {tab === 'pay' && <PaymentsTab caseObj={caseObj} onChanged={onChanged} />}
        {tab === 'visits' && <VisitsTab caseObj={caseObj} onChanged={onChanged} />}
        {tab === 'notes' && <NotesTab caseObj={caseObj} onChanged={onChanged} />}
      </div>
    </div>
  );
}
