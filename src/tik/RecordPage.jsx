import { useEffect, useMemo, useRef, useState } from 'react';
import { FAMILY_SECTIONS, WORKER_SECTIONS, computeValue } from './registrySchema.js';
import {
  DOC_TYPES, EVENT_TYPES, documentHistory, addDocumentEntry,
  PAYMENT_METHODS, INSURANCE_COMPANIES, payments, addPayment, vatBreakdown,
  VISIT_TYPES, visits, addVisit, notes, addNote, patchCaseFields, duplicateCase,
  uploadCaseFile, fileUrl, contacts, addContact, removeContact, CONTACT_RELATIONS,
  accountStatement,
} from './caseDetail.js';
import { recordsFromChat } from './chatRecords.js';
import { recordUrl } from './recordLink.js';
import { buildFilledContract } from './filledContract.js';
import { COMPANY_NAME } from '../lib/workerPortal.js';

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtMoney = (n) => `${(Number(n) || 0).toLocaleString('he-IL')} ₪`;

// ---- one field ---------------------------------------------------------------
function Field({ def, value, editing, onChange, fields }) {
  const shown = def.computed ? computeValue(def.computed, fields) : value;
  const cls = `rp-field w${def.width || 1}`;

  if (!editing || def.readOnly || def.computed) {
    let text = shown;
    if (def.type === 'date') text = shown ? fmtDate(shown) : '—';
    else if (!shown && shown !== 0) text = '—';
    return (
      <div className={cls}>
        <label>{def.label}</label>
        <div className={`rp-value${!shown && shown !== 0 ? ' empty' : ''}`} dir={def.ltr ? 'ltr' : undefined}>{String(text)}</div>
      </div>
    );
  }

  const common = {
    value: value ?? '',
    onChange: (e) => onChange(def.key, e.target.value),
    dir: def.ltr ? 'ltr' : undefined,
  };
  return (
    <div className={cls}>
      <label>{def.label}</label>
      {def.type === 'select' ? (
        <select {...common}><option value="">—</option>{def.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
      ) : def.type === 'textarea' ? (
        <textarea rows={2} {...common} />
      ) : (
        <input type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'} {...common} />
      )}
    </div>
  );
}

function Section({ section, fields, editing, onChange }) {
  return (
    <section className="rp-section">
      <h3><span>{section.icon}</span>{section.title}</h3>
      <div className="rp-grid">
        {section.fields.map((def) => (
          <Field key={def.key} def={def} value={fields[def.key]} editing={editing} onChange={onChange} fields={fields} />
        ))}
      </div>
    </section>
  );
}

// ---- documents ----------------------------------------------------------------
// Open an attachment in a new tab via a short-lived signed URL.
async function openAttachment(path) {
  try { window.open(await fileUrl(path), '_blank', 'noopener'); }
  catch (e) { alert('פתיחת הקובץ נכשלה: ' + (e?.message || e)); }
}

function DocumentsPanel({ caseObj, onChanged }) {
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (docKey) => {
    if (!form.expiry) return;
    setBusy(true);
    try {
      let attachment = null;
      if (file) attachment = await uploadCaseFile(caseObj, docKey, file);
      await addDocumentEntry(caseObj, docKey, {
        event: form.event || EVENT_TYPES[0], number: form.number || '',
        issued: form.issued || '', expiry: form.expiry, company: form.company || '',
        attachment,
      });
      setForm({}); setFile(null); setOpen(null); onChanged();
    } catch (e) { alert(e?.message || e); }
    finally { setBusy(false); }
  };
  return (
    <section className="rp-section">
      <h3><span>📁</span>מסמכים והיסטוריית חידושים</h3>
      {DOC_TYPES.map((t) => {
        const hist = documentHistory(caseObj, t.key);
        return (
          <div key={t.key} className="rp-doc">
            <div className="rp-doc-head">
              <b>{t.label}</b>
              <button className="rp-btn ghost" onClick={() => setOpen(open === t.key ? null : t.key)}>
                {open === t.key ? 'ביטול' : '+ רשומה חדשה'}
              </button>
            </div>
            {hist.length ? (
              <table className="rp-table">
                <thead><tr><th>אירוע</th>{t.hasNumber && <th>מספר</th>}{t.hasCompany && <th>חברה</th>}<th>הופק</th><th>בתוקף עד</th><th>קובץ</th></tr></thead>
                <tbody>{hist.map((h) => (
                  <tr key={h.id}>
                    <td><span className="rp-tag">{h.event}</span></td>
                    {t.hasNumber && <td dir="ltr">{h.number || '—'}</td>}
                    {t.hasCompany && <td>{h.company || '—'}</td>}
                    <td>{fmtDate(h.issued)}</td>
                    <td><b>{fmtDate(h.expiry)}</b></td>
                    <td>
                      {h.attachment?.path
                        ? <button className="rp-btn ghost sm" onClick={() => openAttachment(h.attachment.path)}>📎 צפייה</button>
                        : <span className="rp-empty">—</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="rp-empty">אין רשומות.</p>}
            {open === t.key && (
              <div className="rp-inline-form">
                <select value={form.event || ''} onChange={(e) => setForm({ ...form, event: e.target.value })}>
                  <option value="">סוג אירוע…</option>{EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
                {t.hasNumber && <input placeholder="מספר" dir="ltr" value={form.number || ''} onChange={(e) => setForm({ ...form, number: e.target.value })} />}
                {t.hasCompany && (
                  <select value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                    <option value="">חברת ביטוח…</option>{INSURANCE_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <input type="date" title="הופק" value={form.issued || ''} onChange={(e) => setForm({ ...form, issued: e.target.value })} />
                <input type="date" title="בתוקף עד" value={form.expiry || ''} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
                <label className="rp-file">
                  {file ? `📎 ${file.name}` : '📎 צרף סריקה / צילום'}
                  <input type="file" accept="image/*,application/pdf" hidden
                    onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <button className="rp-btn" disabled={!form.expiry || busy} onClick={() => save(t.key)}>
                  {busy ? 'שומר…' : 'שמור'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Receipt({ caseObj, payment, onClose }) {
  const { net, vat, gross } = vatBreakdown(payment.amount);
  const name = caseObj.data?.fields?.employerName || caseObj.family?.fullName || '';
  return (
    <div className="rp-overlay" onClick={onClose}>
      <div className="cd-receipt" onClick={(e) => e.stopPropagation()}>
        <div className="cd-receipt-head">
          <div><b>{COMPANY_NAME}</b><div className="muted">בן צבי 84, תל אביב · 216095568</div></div>
          <div className="cd-receipt-title">קבלה</div>
        </div>
        <div className="cd-receipt-row"><span>לכבוד:</span><b>{name}</b></div>
        <div className="cd-receipt-row"><span>תאריך:</span><span>{fmtDate(payment.date)}</span></div>
        <div className="cd-receipt-row"><span>אמצעי תשלום:</span><span>{payment.method}</span></div>
        {payment.method === 'המחאה' && (
          <div className="cd-receipt-row"><span>פרטי המחאה:</span><span>בנק {payment.checkBank || '—'} · סניף {payment.checkBranch || '—'} · מס׳ {payment.checkNumber || '—'}</span></div>
        )}
        <table className="cd-receipt-table"><tbody>
          <tr><td>סכום לפני מע״מ</td><td>{fmtMoney(net)}</td></tr>
          <tr><td>מע״מ (17%)</td><td>{fmtMoney(vat)}</td></tr>
          <tr className="cd-receipt-total"><td>סה״כ כולל מע״מ</td><td>{fmtMoney(gross)}</td></tr>
        </tbody></table>
        {payment.note && <div className="cd-receipt-note">{payment.note}</div>}
        <div className="cd-receipt-actions">
          <button className="rp-btn" onClick={() => window.print()}>🖨️ הדפס</button>
          <button className="rp-btn ghost" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

function PaymentsPanel({ caseObj, onChanged }) {
  const [form, setForm] = useState({ method: PAYMENT_METHODS[0] });
  const [adding, setAdding] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const list = payments(caseObj);
  const total = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const save = async () => {
    if (!form.amount || !form.date) return;
    await addPayment(caseObj, { ...form, amount: Number(form.amount) });
    setForm({ method: PAYMENT_METHODS[0] }); setAdding(false); onChanged();
  };
  return (
    <section className="rp-section">
      <h3><span>💳</span>תשלומים וקבלות<em>סה״כ {fmtMoney(total)}</em></h3>
      {list.length ? (
        <table className="rp-table">
          <thead><tr><th>תאריך</th><th>סכום</th><th>אמצעי</th><th>פרטים</th><th></th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id}>
              <td>{fmtDate(p.date)}</td>
              <td><b>{fmtMoney(p.amount)}</b></td>
              <td><span className="rp-tag">{p.method}</span></td>
              <td className="muted">{p.method === 'המחאה' ? [p.checkBank, p.checkBranch, p.checkNumber].filter(Boolean).join(' · ') : (p.note || '—')}</td>
              <td><button className="rp-btn ghost sm" onClick={() => setReceipt(p)}>🧾 קבלה</button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="rp-empty">לא נרשמו תשלומים.</p>}
      {adding ? (
        <div className="rp-inline-form">
          <input type="number" placeholder="סכום כולל מע״מ" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {form.method === 'המחאה' && (<>
            <input placeholder="בנק" value={form.checkBank || ''} onChange={(e) => setForm({ ...form, checkBank: e.target.value })} />
            <input placeholder="סניף" value={form.checkBranch || ''} onChange={(e) => setForm({ ...form, checkBranch: e.target.value })} />
            <input placeholder="מס׳ המחאה" value={form.checkNumber || ''} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
          </>)}
          <input placeholder="הערה" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className="rp-btn" disabled={!form.amount || !form.date} onClick={save}>שמור</button>
          <button className="rp-btn ghost" onClick={() => setAdding(false)}>ביטול</button>
        </div>
      ) : <button className="rp-btn ghost" onClick={() => setAdding(true)}>+ רשום תשלום</button>}
      {receipt && <Receipt caseObj={caseObj} payment={receipt} onClose={() => setReceipt(null)} />}
    </section>
  );
}

function ActivityPanel({ caseObj, onChanged }) {
  const [visitForm, setVisitForm] = useState({ type: VISIT_TYPES[0] });
  const [note, setNote] = useState('');
  const vList = visits(caseObj);
  const nList = notes(caseObj);
  const saveVisit = async () => { if (!visitForm.date) return; await addVisit(caseObj, visitForm); setVisitForm({ type: VISIT_TYPES[0] }); onChanged(); };
  const saveNote = async () => { if (!note.trim()) return; await addNote(caseObj, note.trim()); setNote(''); onChanged(); };
  return (
    <div className="rp-two">
      <section className="rp-section">
        <h3><span>📅</span>ביקורים ופגישות</h3>
        {vList.length ? (
          <table className="rp-table"><tbody>{vList.map((v) => (
            <tr key={v.id}><td>{fmtDate(v.date)}</td><td><span className="rp-tag">{v.type}</span></td><td className="muted">{v.note || '—'}</td></tr>
          ))}</tbody></table>
        ) : <p className="rp-empty">אין ביקורים רשומים.</p>}
        <div className="rp-inline-form">
          <input type="date" value={visitForm.date || ''} onChange={(e) => setVisitForm({ ...visitForm, date: e.target.value })} />
          <select value={visitForm.type} onChange={(e) => setVisitForm({ ...visitForm, type: e.target.value })}>
            {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="הערה" value={visitForm.note || ''} onChange={(e) => setVisitForm({ ...visitForm, note: e.target.value })} />
          <button className="rp-btn" disabled={!visitForm.date} onClick={saveVisit}>שמור</button>
        </div>
      </section>
      <section className="rp-section">
        <h3><span>📝</span>יומן הערות</h3>
        <div className="rp-inline-form">
          <textarea rows={2} placeholder="הוסף הערה…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="rp-btn" disabled={!note.trim()} onClick={saveNote}>שמור הערה</button>
        </div>
        {nList.length ? (
          <div className="rp-notes">{nList.map((n) => (
            <div key={n.id} className="rp-note"><div className="rp-note-date">{fmtDate(n.at)}</div>{n.text}</div>
          ))}</div>
        ) : <p className="rp-empty">אין הערות.</p>}
      </section>
    </div>
  );
}


function ContactsPanel({ caseObj, onChanged }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const list = contacts(caseObj);
  const save = async () => {
    if (!form.name) return;
    setBusy(true);
    try { await addContact(caseObj, form); setForm({}); onChanged(); }
    catch (e) { alert(e?.message || e); } finally { setBusy(false); }
  };
  return (
    <section className="rp-section">
      <h3><span>📞</span>אנשי קשר</h3>
      {list.length ? (
        <table className="rp-table">
          <thead><tr><th>שם</th><th>קרבה</th><th>טלפון</th><th>הערה</th><th></th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id}>
              <td><b>{c.name}</b></td>
              <td><span className="rp-tag">{c.relation || '—'}</span></td>
              <td dir="ltr">{c.phone || '—'}</td>
              <td className="muted">{c.note || '—'}</td>
              <td>
                {c.phone && <a className="rp-btn ghost sm" href={`tel:${c.phone}`}>☎️</a>}{' '}
                <button className="rp-btn ghost sm" onClick={async () => { if (confirm('להסיר את איש הקשר?')) { await removeContact(caseObj, c.id); onChanged(); } }}>✕</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="rp-empty">לא הוגדרו אנשי קשר נוספים.</p>}
      <div className="rp-inline-form">
        <input placeholder="שם" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.relation || ''} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
          <option value="">קרבה…</option>{CONTACT_RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input placeholder="טלפון" dir="ltr" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="הערה" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="rp-btn" disabled={!form.name || busy} onClick={save}>+ הוסף</button>
      </div>
    </section>
  );
}

function StatementPanel({ caseObj }) {
  const { rows, totalDebit, totalCredit, balance } = accountStatement(caseObj);
  return (
    <section className="rp-section">
      <h3><span>📒</span>כרטסת חשבון
        <em>{balance > 0 ? `יתרה לתשלום ${fmtMoney(balance)}` : balance < 0 ? `יתרת זכות ${fmtMoney(-balance)}` : 'מאוזן'}</em>
      </h3>
      {rows.length ? (
        <table className="rp-table">
          <thead><tr><th>תאריך</th><th>פירוט</th><th>חובה</th><th>זכות</th><th>יתרה</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date)}</td>
                <td><span className={`rp-tag ${r.kind === 'תשלום' ? 'ok' : ''}`}>{r.kind}</span> {r.label}</td>
                <td>{r.debit ? fmtMoney(r.debit) : '—'}</td>
                <td>{r.credit ? fmtMoney(r.credit) : '—'}</td>
                <td><b>{fmtMoney(r.balance)}</b></td>
              </tr>
            ))}
            <tr className="rp-total">
              <td colSpan={2}>סה״כ</td>
              <td>{fmtMoney(totalDebit)}</td>
              <td>{fmtMoney(totalCredit)}</td>
              <td><b>{fmtMoney(balance)}</b></td>
            </tr>
          </tbody>
        </table>
      ) : <p className="rp-empty">אין תנועות. הוסיפו עמלת השמה / דמי תאגיד בפרטי התיק, ותשלומים בטאב תשלומים.</p>}
    </section>
  );
}

// Printable one-page summary of the case, and the full 26-page contract.
function FormsPanel({ caseObj, kind }) {
  const [busy, setBusy] = useState('');
  const f = caseObj.data?.fields || {};

  async function makeContract() {
    setBusy('contract');
    try {
      const { worker, family } = recordsFromChat(f);
      const bytes = await buildFilledContract(family, worker, {});
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `חוזה — ${f.employerName || 'תיק'}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { alert('הפקת החוזה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(''); }
  }

  return (
    <section className="rp-section">
      <h3><span>🖨️</span>הפקת טפסים</h3>
      <div className="rp-forms">
        <button className="rp-formcard" disabled={busy === 'contract'} onClick={makeContract}>
          <b>📄 חוזה השמה מלא</b>
          <span>{busy === 'contract' ? 'מפיק…' : '26 עמודים עם כל פרטי התיק'}</span>
        </button>
        <button className="rp-formcard" onClick={() => window.print()}>
          <b>🧾 דף פרטי התיק</b>
          <span>הדפסת סיכום התיק כפי שהוא על המסך</span>
        </button>
      </div>
      <p className="rp-empty">טפסים נוספים יתווספו כאן — שלחו לי דוגמה של טופס והוא ייווצר אוטומטית מנתוני התיק.</p>
    </section>
  );
}

// ---- the page -----------------------------------------------------------------
// The other side of the placement. A family file always names the worker it
// employs and a worker file names the family — one click moves between them,
// and it opens in a new tab so you keep both files in front of you.
function CounterpartCard({ caseObj, kind }) {
  const f = caseObj.data?.fields || {};
  const other = kind === 'worker' ? 'family' : 'worker';
  const name = other === 'worker'
    ? (f.nameHe || f.nameEn || '')
    : (f.employerName || f.fullName || '');
  if (!name) return null;
  const detail = other === 'worker'
    ? [f.passportNo && `דרכון ${f.passportNo}`, f.nationality].filter(Boolean).join(' · ')
    : [f.idNumber && `ת״ז ${f.idNumber}`, f.city].filter(Boolean).join(' · ');
  return (
    <a className="rp-counterpart" href={recordUrl(other, caseObj.id)} target="_blank" rel="noreferrer">
      <span className="rp-counterpart-icon">{other === 'worker' ? '👷' : '🏠'}</span>
      <span className="rp-counterpart-txt">
        <em>{other === 'worker' ? 'העובד/ת המועסק/ת' : 'המשפחה המעסיקה'}</em>
        <b>{name}</b>
        {detail && <i dir={other === 'worker' ? 'ltr' : undefined}>{detail}</i>}
      </span>
      <span className="rp-counterpart-go">לתיק המלא ↗</span>
    </a>
  );
}

export default function RecordPage({ caseObj, kind, siblings = [], onNavigate, onBack, onChanged }) {
  const sections = kind === 'worker' ? WORKER_SECTIONS : FAMILY_SECTIONS;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('details');
  const [hideSensitive, setHideSensitive] = useState(false);
  const topRef = useRef(null);

  const stored = caseObj.data?.fields || {};
  const fields = editing ? { ...stored, ...draft } : stored;

  useEffect(() => { topRef.current?.scrollIntoView({ block: 'start' }); }, [caseObj?.id]);

  const title = kind === 'worker'
    ? (stored.nameHe || stored.nameEn || 'עובד/ת ללא שם')
    : (stored.employerName || stored.fullName || 'תיק ללא שם');
  const subtitle = kind === 'worker'
    ? [stored.passportNo && `דרכון ${stored.passportNo}`, stored.nationality].filter(Boolean).join(' · ')
    : [stored.idNumber && `ת״ז ${stored.idNumber}`, stored.city].filter(Boolean).join(' · ');

  const waLink = useMemo(() => {
    const phone = String(kind === 'worker' ? stored.workerPhone : (stored.contactPhone || stored.mobile) || '').replace(/\D/g, '');
    return phone ? `https://wa.me/972${phone.replace(/^0/, '')}` : '';
  }, [stored, kind]);
  const mailLink = useMemo(() => {
    const to = String(stored.email || '').trim();
    if (!to) return '';
    return `mailto:${to}?subject=${encodeURIComponent('עוגן סיעוד — ' + title)}`;
  }, [stored, title]);

  // Position in the list behind this page, for the prev/next arrows.
  const idx = siblings.findIndex((c) => c.id === caseObj.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const onChange = (key, val) => setDraft((d) => ({ ...d, [key]: val }));

  async function save() {
    setBusy(true);
    try { await patchCaseFields(caseObj, draft); setDraft({}); setEditing(false); onChanged(); }
    catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  }
  async function onDuplicate() {
    if (!confirm('ליצור עותק של התיק?')) return;
    try { await duplicateCase(caseObj); onChanged(); alert('נוצר תיק חדש (עותק).'); }
    catch (e) { alert('שכפול נכשל: ' + (e?.message || e)); }
  }

  const TABS = [
    ['details', '📋 פרטי התיק'], ['docs', '📁 מסמכים'], ['contacts', '📞 א.קשר'],
    ['pay', '💳 תשלומים'], ['statement', '📒 כרטסת'], ['activity', '📅 פעילות'],
    ['forms', '🖨️ טפסים'],
  ];

  return (
    <div className="rp-page" ref={topRef}>
      <div className="rp-topbar">
        <div className="rp-nav">
          <button className="rp-back" onClick={onBack}>→ חזרה לרשימה</button>
          {siblings.length > 1 && (
            <span className="rp-stepper">
              <button className="rp-btn ghost sm" disabled={!prev} onClick={() => prev && onNavigate(prev)} title="התיק הקודם">‹ הקודם</button>
              <span className="rp-pos">{idx >= 0 ? `${idx + 1} מתוך ${siblings.length}` : ''}</span>
              <button className="rp-btn ghost sm" disabled={!next} onClick={() => next && onNavigate(next)} title="התיק הבא">הבא ›</button>
            </span>
          )}
        </div>
        <div className="rp-actions">
          {editing ? (
            <>
              <button className="rp-btn" disabled={busy} onClick={save}>{busy ? 'שומר…' : '💾 שמור שינויים'}</button>
              <button className="rp-btn ghost" onClick={() => { setDraft({}); setEditing(false); }}>ביטול</button>
            </>
          ) : (
            <>
              <button className="rp-btn" onClick={() => setEditing(true)}>✏️ עריכה</button>
              <button className="rp-btn ghost" onClick={onDuplicate}>🧬 שכפל</button>
              {waLink && <a className="rp-btn ghost" href={waLink} target="_blank" rel="noreferrer">💬 וואטסאפ</a>}
              {mailLink && <a className="rp-btn ghost" href={mailLink}>✉️ מייל</a>}
              <button className="rp-btn ghost" onClick={() => setHideSensitive((v) => !v)}>{hideSensitive ? '👁️ הצג' : '🙈 הסתר רגיש'}</button>
            </>
          )}
        </div>
      </div>

      <header className="rp-hero">
        <div className="rp-hero-main">
          <div className="rp-avatar">{kind === 'worker' ? '👷' : '🏠'}</div>
          <div>
            <h1>{title}</h1>
            <p dir={kind === 'worker' ? 'ltr' : undefined}>{subtitle || '—'}</p>
          </div>
        </div>
        <div className="rp-hero-stats">
          {stored.caseNumber && <div><span>תיק</span><b>#{stored.caseNumber}</b></div>}
          {stored.assignedTo && <div><span>רכז/ת</span><b>{stored.assignedTo}</b></div>}
          <div><span>סטטוס</span><b>{stored.caseStatus || stored.workerStatus || '—'}</b></div>
          <div><span>שולם</span><b>{fmtMoney(payments(caseObj).reduce((s, p) => s + (Number(p.amount) || 0), 0))}</b></div>
        </div>
      </header>

      <CounterpartCard caseObj={caseObj} kind={kind} />

      <nav className="rp-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`rp-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {tab === 'details' && (
        <div className={`rp-sections${hideSensitive ? ' masked' : ''}`}>
          {sections.map((s) => <Section key={s.title} section={s} fields={fields} editing={editing} onChange={onChange} />)}
        </div>
      )}
      {tab === 'docs' && <DocumentsPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'pay' && <PaymentsPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'contacts' && <ContactsPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'statement' && <StatementPanel caseObj={caseObj} />}
      {tab === 'activity' && <ActivityPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'forms' && <FormsPanel caseObj={caseObj} kind={kind} />}
    </div>
  );
}
