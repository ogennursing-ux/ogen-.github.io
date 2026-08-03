import { useEffect, useMemo, useRef, useState } from 'react';
import { FAMILY_SECTIONS, WORKER_SECTIONS, computeValue, PLACEMENT_TYPES, END_REASONS, HIDDEN_FAMILY, HIDDEN_WORKER } from './registrySchema.js';
import {
  DOC_TYPES, EVENT_TYPES, documentHistory, addDocumentEntry,
  PAYMENT_METHODS, INSURANCE_COMPANIES, payments, addPayment, vatBreakdown,
  VISIT_TYPES, visits, addVisit, notes, addNote, patchCaseFields, duplicateCase,
  uploadCaseFile, fileUrl, contacts, addContact, removeContact, CONTACT_RELATIONS,
  accountStatement, getOrAssignCaseNumber, removeDocumentEntry, eventsFor,
  placements, addPlacement, removePlacement,
} from './caseDetail.js';
import { recordsFromChat } from './chatRecords.js';
import { recordUrl, openRecordTab } from './recordLink.js';
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
          // `fallback` covers records saved before the worker's own personal
          // fields were split from the patient's: show the old shared value,
          // but write any edit to the worker's key so they stop overwriting.
          <Field key={def.key} def={def} editing={editing} onChange={onChange} fields={fields}
            value={fields[def.key] ?? (def.fallback ? fields[def.fallback] : undefined)} />
        ))}
      </div>
    </section>
  );
}

// The record's own "details" view, decluttered: each section is trimmed to the
// operational essentials, and everything the office marked personal / rarely
// used drops into one collapsed "מידע נוסף" block below (auto-opened while
// editing so nothing becomes unreachable).
function DetailsView({ sections, hiddenKeys, fields, editing, onChange }) {
  const visible = sections
    .map((s) => ({ ...s, fields: s.fields.filter((f) => !hiddenKeys.has(f.key)) }))
    .filter((s) => s.fields.length);
  const hiddenGroups = sections
    .map((s) => ({ s, hf: s.fields.filter((f) => hiddenKeys.has(f.key)) }))
    .filter((g) => g.hf.length);
  const hiddenCount = hiddenGroups.reduce((n, g) => n + g.hf.length, 0);
  return (
    <>
      {visible.map((s) => <Section key={s.title} section={s} fields={fields} editing={editing} onChange={onChange} />)}
      {hiddenCount > 0 && (
        <details className="rp-more" open={editing || undefined}>
          <summary>🔒 מידע נוסף · {hiddenCount} שדות</summary>
          <div className="rp-more-body">
            {hiddenGroups.map(({ s, hf }) => (
              <Section key={s.title} section={{ ...s, fields: hf }} fields={fields} editing={editing} onChange={onChange} />
            ))}
          </div>
        </details>
      )}
    </>
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
  const today = () => new Date().toISOString().slice(0, 10);

  const save = async (docKey) => {
    if (!form.expiry && !form.validFrom) return;
    setBusy(true);
    try {
      let attachment = null;
      if (file) attachment = await uploadCaseFile(caseObj, docKey, file);
      await addDocumentEntry(caseObj, docKey, {
        event: form.event || eventsFor(docKey)[0],
        regDate: form.regDate || today(),
        by: form.by || '',
        number: form.number || '',
        issued: form.issued || '',
        issuePlace: form.issuePlace || '',
        validFrom: form.validFrom || '',
        expiry: form.expiry || '',
        company: form.company || '',
        note: form.note || '',
        attachment,
      });
      setForm({}); setFile(null); setOpen(null); onChanged();
    } catch (e) { alert(e?.message || e); }
    finally { setBusy(false); }
  };

  const remove = async (docKey, id) => {
    if (!confirm('למחוק את הרשומה? תוקף המסמך יחושב מחדש מהרשומות שנשארו.')) return;
    try { await removeDocumentEntry(caseObj, docKey, id); onChanged(); }
    catch (e) { alert(e?.message || e); }
  };

  return (
    <section className="rp-section">
      <h3><span>📁</span>מסמכים והיסטוריית חידושים</h3>
      <p className="rp-hint">
        לכל מסמך נשמרת שרשרת אירועים שלמה — מתי נרשם, מי ביצע, המספר החדש,
        איפה הופק ולאיזו תקופה הוא בתוקף. התוקף שמופיע בדוחות הוא של הרשומה
        האחרונה.
      </p>
      {DOC_TYPES.map((t) => {
        const hist = documentHistory(caseObj, t.key);
        const current = hist.map((h) => h.expiry).filter(Boolean).sort().pop();
        return (
          <div key={t.key} className="rp-doc">
            <div className="rp-doc-head">
              <b>{t.icon} {t.label}</b>
              {current && <span className="rp-doc-current">בתוקף עד {fmtDate(current)}</span>}
              <button className="rp-btn ghost" onClick={() => { setOpen(open === t.key ? null : t.key); setForm({}); }}>
                {open === t.key ? 'ביטול' : '+ רשומה חדשה'}
              </button>
            </div>
            {hist.length ? (
              <div className="rp-tablewrap">
                <table className="rp-table">
                  <thead><tr>
                    <th>ת.רישום</th><th>סוג אירוע</th><th>בוצע ע״י</th>
                    {t.hasNumber && <th>מספר</th>}
                    {t.hasCompany && <th>חברה</th>}
                    <th>ת.הנפקה</th>
                    {t.hasIssuePlace && <th>מקום הנפקה</th>}
                    <th>תוקף מ</th><th>תוקף עד</th><th>הערה</th><th>קובץ</th><th />
                  </tr></thead>
                  <tbody>{hist.map((h) => (
                    <tr key={h.id}>
                      <td>{fmtDate(h.regDate || h.addedAt)}</td>
                      <td><span className="rp-tag">{h.event}</span></td>
                      <td>{h.by || '—'}</td>
                      {t.hasNumber && <td dir="ltr">{h.number || '—'}</td>}
                      {t.hasCompany && <td>{h.company || '—'}</td>}
                      <td>{fmtDate(h.issued)}</td>
                      {t.hasIssuePlace && <td>{h.issuePlace || '—'}</td>}
                      <td>{fmtDate(h.validFrom)}</td>
                      <td><b>{fmtDate(h.expiry)}</b></td>
                      <td className="rp-muted">{h.note || '—'}</td>
                      <td>
                        {h.attachment?.path
                          ? <button className="rp-btn ghost sm" onClick={() => openAttachment(h.attachment.path)}>📎 צפייה</button>
                          : <span className="rp-empty">—</span>}
                      </td>
                      <td><button className="rp-btn ghost sm" title="מחיקת הרשומה" onClick={() => remove(t.key, h.id)}>✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="rp-empty">אין רשומות.</p>}
            {open === t.key && (
              <div className="rp-inline-form">
                <input type="date" title="תאריך רישום" value={form.regDate || today()}
                  onChange={(e) => setForm({ ...form, regDate: e.target.value })} />
                <select value={form.event || ''} onChange={(e) => setForm({ ...form, event: e.target.value })}>
                  <option value="">סוג אירוע…</option>
                  {eventsFor(t.key).map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
                <input placeholder="בוצע ע״י" value={form.by || ''} onChange={(e) => setForm({ ...form, by: e.target.value })} />
                {t.hasNumber && <input placeholder="מספר" dir="ltr" value={form.number || ''} onChange={(e) => setForm({ ...form, number: e.target.value })} />}
                {t.hasCompany && (
                  <select value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                    <option value="">חברת ביטוח…</option>{INSURANCE_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <input type="date" title="תאריך הנפקה" value={form.issued || ''} onChange={(e) => setForm({ ...form, issued: e.target.value })} />
                {t.hasIssuePlace && <input placeholder="מקום הנפקה" value={form.issuePlace || ''} onChange={(e) => setForm({ ...form, issuePlace: e.target.value })} />}
                <input type="date" title="תוקף מ" value={form.validFrom || ''} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
                <input type="date" title="תוקף עד" value={form.expiry || ''} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
                <input placeholder="הערה" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <label className="rp-file">
                  {file ? `📎 ${file.name}` : '📎 צרף סריקה / צילום'}
                  <input type="file" accept="image/*,application/pdf" hidden
                    onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <button className="rp-btn" disabled={(!form.expiry && !form.validFrom) || busy} onClick={() => save(t.key)}>
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

// ---- placement history (היסטוריית השמות) -------------------------------------
// Every worker↔family pairing this file went through, newest first. The file is
// shared by both sides, so each entry names BOTH the worker and the family and
// each side shows the other. Added by hand; opening the form pre-fills from the
// current placement so archiving it is one click, and old placements from the
// legacy system can be typed in too.
function PlacementsPanel({ caseObj, kind, onChanged }) {
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = placements(caseObj);
  const otherKey = kind === 'worker' ? 'family' : 'worker';
  const otherLabel = kind === 'worker' ? 'מטופל / מעסיק' : 'עובד/ת';

  const openAdd = () => {
    const f = caseObj.data?.fields || {};
    setForm({
      worker: kind === 'worker' ? (f.nameHe || f.nameEn || '') : (f.placementWorker || ''),
      family: f.employerName || f.fullName || '',
      placementNumber: f.placementNumber || '',
      startDate: f.placementStartDate || '',
      endDate: f.placementEndDate || '',
      placementType: f.placementType || '',
    });
    setAdding(true);
  };
  const save = async () => {
    if (!form[otherKey] && !form.startDate) return;
    setBusy(true);
    try { await addPlacement(caseObj, form); setForm({}); setAdding(false); onChanged(); }
    catch (e) { alert(e?.message || e); } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!confirm('למחוק את שורת ההשמה מההיסטוריה?')) return;
    try { await removePlacement(caseObj, id); onChanged(); } catch (e) { alert(e?.message || e); }
  };

  return (
    <section className="rp-section">
      <h3><span>🤝</span>היסטוריית השמות{list.length ? <em>{list.length}</em> : null}</h3>
      <p className="rp-hint">
        כל ההשמות של התיק לאורך זמן — {kind === 'worker' ? 'כל המשפחות שהעובד/ת עבד/ה אצלן' : 'כל העובדים שטיפלו במטופל'}.
        אפשר להזין גם השמות ישנות מהעבר; טופס ההוספה נטען מההשמה הנוכחית כדי לשמור אותה בקליק.
      </p>
      {list.length ? (
        <div className="rp-tablewrap">
          <table className="rp-table">
            <thead><tr>
              <th>{otherLabel}</th><th>מס׳ השמה</th><th>מתאריך</th><th>עד תאריך</th>
              <th>סוג</th><th>סיבת סיום</th><th />
            </tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td><b>{p[otherKey] || p.counterpart || '—'}</b></td>
                <td dir="ltr">{p.placementNumber || '—'}</td>
                <td>{fmtDate(p.startDate)}</td>
                <td>{p.endDate ? fmtDate(p.endDate) : <span className="rp-tag ok">פעילה</span>}</td>
                <td>{p.placementType ? <span className="rp-tag">{p.placementType}</span> : '—'}</td>
                <td className="muted">{p.endReason || '—'}</td>
                <td><button className="rp-btn ghost sm" title="מחיקת השורה" onClick={() => remove(p.id)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="rp-empty">אין השמות רשומות עדיין.</p>}
      {adding ? (
        <div className="rp-inline-form">
          <input placeholder={otherLabel} value={form[otherKey] || ''} onChange={(e) => setForm({ ...form, [otherKey]: e.target.value })} />
          <input placeholder="מס׳ השמה" dir="ltr" value={form.placementNumber || ''} onChange={(e) => setForm({ ...form, placementNumber: e.target.value })} />
          <input type="date" title="מתאריך" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input type="date" title="עד תאריך" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <select value={form.placementType || ''} onChange={(e) => setForm({ ...form, placementType: e.target.value })}>
            <option value="">סוג השמה…</option>{PLACEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.endReason || ''} onChange={(e) => setForm({ ...form, endReason: e.target.value })}>
            <option value="">סיבת סיום…</option>{END_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="rp-btn" disabled={(!form[otherKey] && !form.startDate) || busy} onClick={save}>{busy ? 'שומר…' : 'שמור'}</button>
          <button className="rp-btn ghost" onClick={() => { setAdding(false); setForm({}); }}>ביטול</button>
        </div>
      ) : <button className="rp-btn ghost" onClick={openAdd}>+ הוסף השמה</button>}
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
    ? (f.nameEn || f.nameHe || '')
    : (f.employerName || f.fullName || '');
  if (!name) return null;
  const detail = other === 'worker'
    ? [f.nameHe, f.passportNo && `דרכון ${f.passportNo}`, f.nationality].filter(Boolean).join(' · ')
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

  // Remember this as the last file opened of its kind, so entering the registry
  // and clicking "משפחות" / "עובדים" reopens exactly where you left off.
  useEffect(() => {
    try { if (caseObj?.id) localStorage.setItem(`ogen_last_${kind}`, caseObj.id); } catch { /* ignore */ }
  }, [caseObj?.id, kind]);

  // A file gets its number the first time it is opened. The list used to do
  // this, but files now open in their own tab, so the number is assigned here.
  useEffect(() => {
    if (caseObj?.data?.fields?.caseNumber || !siblings.length) return;
    let alive = true;
    getOrAssignCaseNumber(caseObj, siblings)
      .then(() => { if (alive) onChanged(); })
      .catch(() => { /* a missing number is not worth an alert */ });
    return () => { alive = false; };
  }, [caseObj?.id]);

  // The caregiver's file leads with the English (passport) name — that is the
  // base name on every government form — with the Hebrew name kept beside it.
  const title = kind === 'worker'
    ? (stored.nameEn || stored.nameHe || 'עובד/ת ללא שם')
    : (stored.employerName || stored.fullName || 'תיק ללא שם');
  const subtitle = kind === 'worker'
    ? [stored.nameHe, stored.passportNo && `דרכון ${stored.passportNo}`, stored.nationality].filter(Boolean).join(' · ')
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

  // A one-click receipt for the person in this file: opens the invoicing desk
  // with their name / ID already filled and the case linked, so the clerk only
  // types the amount. The link back to the case is what lets the collection
  // report (306) know which worker a receipt belongs to.
  const receiptLink = useMemo(() => {
    const p = new URLSearchParams();
    if (kind === 'worker') {
      p.set('name', stored.nameEn || stored.nameHe || '');
      if (stored.passportNo) p.set('taxId', stored.passportNo);
    } else {
      p.set('name', stored.employerName || stored.fullName || '');
      if (stored.idNumber) p.set('taxId', stored.idNumber);
    }
    p.set('case', caseObj.id);
    return `${location.pathname}${location.search}#invoices?${p.toString()}`;
  }, [stored, kind, caseObj.id]);

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
    try {
      const id = await duplicateCase(caseObj);
      onChanged();
      openRecordTab(kind, id); // the copy opens in its own tab, like every file
    } catch (e) { alert('שכפול נכשל: ' + (e?.message || e)); }
  }

  const TABS = [
    ['details', '📋 פרטי התיק'], ['docs', '📁 מסמכים'], ['placements', '🤝 השמות'],
    ['contacts', '📞 א.קשר'], ['pay', '💳 תשלומים'], ['statement', '📒 כרטסת'],
    ['activity', '📅 פעילות'], ['forms', '🖨️ טפסים'],
  ];

  return (
    <div className="rp-page" ref={topRef}>
      <div className="rp-topbar">
        <div className="rp-nav">
          {onBack && <button className="rp-back" onClick={onBack}>→ חזרה</button>}
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
              <a className="rp-btn receipt" href={receiptLink} target="_blank" rel="noreferrer" title="פתיחת קבלה עם הפרטים כבר ממולאים">🧾 הפק קבלה</a>
              {kind === 'worker' && (
                <a className="rp-btn matash" href={`${location.pathname}${location.search}#manot?case=${caseObj.id}`} target="_blank" rel="noreferrer" title="הפקת מנה לרשות האוכלוסין עם פרטי העובד">📮 הפק מנה</a>
              )}
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
          <DetailsView sections={sections} hiddenKeys={kind === 'worker' ? HIDDEN_WORKER : HIDDEN_FAMILY}
            fields={fields} editing={editing} onChange={onChange} />
        </div>
      )}
      {tab === 'docs' && <DocumentsPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'placements' && <PlacementsPanel caseObj={caseObj} kind={kind} onChanged={onChanged} />}
      {tab === 'pay' && <PaymentsPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'contacts' && <ContactsPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'statement' && <StatementPanel caseObj={caseObj} />}
      {tab === 'activity' && <ActivityPanel caseObj={caseObj} onChanged={onChanged} />}
      {tab === 'forms' && <FormsPanel caseObj={caseObj} kind={kind} />}
    </div>
  );
}
