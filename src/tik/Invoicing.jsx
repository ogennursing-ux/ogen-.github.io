import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { readConfig, patchConfig } from './officeConfig.js';
import {
  DOC_TYPES, PAYMENT_METHODS, COMPUTERISED_STAMP, companyDetails,
  loadDocuments, issueDocument, creditDocument, recordPrint, loadEvents,
} from './invoices.js';
import { downloadUniformFile } from './bkmExport.js';
import { EXPORT_MODES, runAccountingExport, pendingExportCount, loadExportHistory, downloadBlob } from './accountingExport.js';

// The tax-documents desk (קבלות וחשבוניות). Everything issued here is frozen
// and numbered in sequence; corrections are made by a credit document, never by
// editing. Opens in its own browser tab (#invoices).

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v); if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtMoney = (n) => `${(Number(n) || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪`;

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>🧾 קבלות וחשבוניות</h2>
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

// Company details must exist (ח.פ) before any document can be issued.
function CompanySetup({ config, onSaved }) {
  const c = companyDetails(config);
  const [form, setForm] = useState({
    companyName: c.name, companyTaxId: c.taxId, companyAddress: c.address, companyPhone: c.phone, companyEmail: c.email,
    companyBankName: c.bank.name, companyBankNumber: c.bank.number, companyBankBranch: c.bank.branch,
    companyBankAccount: c.bank.account, workerFeeTotal: c.workerFeeTotal,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await patchConfig(form); onSaved(); } catch (e) { alert(e?.message || e); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <section className="inv-card">
      <h3>פרטי החברה המפיקה</h3>
      <p className="inv-hint">מופיעים בכל מסמך, כנדרש בחוק. חובה למלא ח.פ לפני הפקת מסמך.</p>
      <div className="inv-form">
        <label>שם החברה<input value={form.companyName} onChange={set('companyName')} /></label>
        <label>ח.פ / מס׳ עוסק<input dir="ltr" value={form.companyTaxId} onChange={set('companyTaxId')} /></label>
        <label>כתובת<input value={form.companyAddress} onChange={set('companyAddress')} /></label>
        <label>טלפון<input dir="ltr" value={form.companyPhone} onChange={set('companyPhone')} /></label>
        <label>אימייל<input dir="ltr" value={form.companyEmail} onChange={set('companyEmail')} /></label>
      </div>
      <p className="inv-hint" style={{ marginTop: 12 }}>חשבון הבנק של החברה והשכר — לדוח הגבייה הרבעוני למשרד הפנים (306).</p>
      <div className="inv-form">
        <label>שם בנק<input value={form.companyBankName} onChange={set('companyBankName')} /></label>
        <label>מספר בנק<input dir="ltr" value={form.companyBankNumber} onChange={set('companyBankNumber')} /></label>
        <label>מספר סניף<input dir="ltr" value={form.companyBankBranch} onChange={set('companyBankBranch')} /></label>
        <label>מספר חשבון<input dir="ltr" value={form.companyBankAccount} onChange={set('companyBankAccount')} /></label>
        <label>שכר מינימום (סה״כ דמי הטיפול)<input dir="ltr" type="number" value={form.workerFeeTotal} onChange={set('workerFeeTotal')} /></label>
      </div>
      {Number(form.workerFeeTotal) > 0 && (
        <p className="inv-hint">
          מזה נגזרים 3 התשלומים: תשלום 1 (בהגעה) = <b>{(Number(form.workerFeeTotal) - 2500).toLocaleString('he-IL')} ₪</b>
          {' · '}תשלום 2 (26 ח׳) = <b>1,250 ₪</b>{' · '}תשלום 3 (38 ח׳) = <b>1,250 ₪</b>. עדכנו כאן בלבד כשמשתנה שכר המינימום.
        </p>
      )}
      <button className="rp-btn" disabled={busy} onClick={save}>{busy ? 'שומר…' : '💾 שמור פרטי חברה'}</button>
    </section>
  );
}

// The issue form: type, customer, amount (gross, VAT included), payment method.
function IssueForm({ config, onIssued }) {
  const [docType, setDocType] = useState('receipt');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const issue = async () => {
    if (!Number(amount)) { alert('יש להזין סכום.'); return; }
    if (!name.trim()) { alert('יש להזין שם לקוח.'); return; }
    if (!confirm('להפיק את המסמך? לאחר ההפקה המסמך נעול ואי אפשר לערוך אותו — תיקון נעשה בזיכוי בלבד.')) return;
    setBusy(true);
    try {
      const doc = await issueDocument({
        docType, customer: { name: name.trim(), taxId: taxId.trim() },
        amountGross: amount, paymentMethod: method, reference: reference.trim(), config,
      });
      setName(''); setTaxId(''); setAmount(''); setReference('');
      onIssued(doc);
    } catch (e) { alert(e?.message || e); } finally { setBusy(false); }
  };

  return (
    <section className="inv-card">
      <h3>הפקת מסמך חדש</h3>
      <div className="inv-form">
        <label>סוג מסמך
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {Object.values(DOC_TYPES).filter((t) => t.key !== 'credit').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label>שם הלקוח<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>ת״ז / ח.פ לקוח<input dir="ltr" value={taxId} onChange={(e) => setTaxId(e.target.value)} /></label>
        <label>סכום כולל מע״מ (₪)<input dir="ltr" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>אמצעי תשלום
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <label>פירוט / אסמכתא<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="למשל: דמי טיפול חודש 07/2026" /></label>
      </div>
      {amount && Number(amount) > 0 && (
        <p className="inv-preview">
          לפני מע״מ {fmtMoney(Number(amount) / 1.17)} · מע״מ 17% {fmtMoney(Number(amount) - Number(amount) / 1.17)} · <b>סה״כ {fmtMoney(amount)}</b>
        </p>
      )}
      <button className="rp-btn" disabled={busy} onClick={issue}>{busy ? 'מפיק…' : '🧾 הפק מסמך'}</button>
    </section>
  );
}

// A single frozen document, printable, with its audit log.
function DocView({ doc, config, onClose, onChanged }) {
  const [events, setEvents] = useState([]);
  useEffect(() => { loadEvents(doc.id).then(setEvents).catch(() => setEvents([])); }, [doc.id]);
  const c = companyDetails(config);
  const type = DOC_TYPES[doc.docType];

  const print = async () => { await recordPrint(doc); window.print(); };
  const credit = async () => {
    if (!confirm(`להפיק חשבונית זיכוי כנגד ${doc.display}? המסמך המקורי יישאר, והזיכוי יבטל אותו.`)) return;
    try { const z = await creditDocument(doc, { config }); alert(`הופקה חשבונית זיכוי ${z.display}.`); onChanged(); onClose(); }
    catch (e) { alert(e?.message || e); }
  };

  return (
    <div className="inv-modal" onClick={onClose}>
      <div className="inv-doc" onClick={(e) => e.stopPropagation()}>
        <div className="inv-doc-actions no-print">
          <button className="rp-btn ghost" onClick={onClose}>✕ סגור</button>
          <button className="rp-btn ghost" onClick={print}>🖨️ הדפס</button>
          {!type.isCredit && <button className="rp-btn ghost" onClick={credit}>↩️ הפק זיכוי</button>}
        </div>
        <div className="inv-print">
          <header className="inv-doc-head">
            <div>
              <h2>{c.name}</h2>
              <p>ח.פ {c.taxId}{c.address ? ` · ${c.address}` : ''}{c.phone ? ` · ${c.phone}` : ''}</p>
            </div>
            <div className="inv-doc-type">
              <b>{doc.typeLabel}</b>
              <span dir="ltr">{doc.display}</span>
            </div>
          </header>
          <div className="inv-doc-meta">
            <div><span>תאריך</span><b>{fmtDate(doc.issuedAt)}</b></div>
            <div><span>לכבוד</span><b>{doc.customer?.name || '—'}</b></div>
            {doc.customer?.taxId && <div><span>ת״ז / ח.פ</span><b dir="ltr">{doc.customer.taxId}</b></div>}
            {doc.creditOf && <div><span>כנגד מסמך</span><b dir="ltr">{doc.creditOf}</b></div>}
          </div>
          <table className="inv-doc-table">
            <thead><tr><th>פירוט</th><th>לפני מע״מ</th><th>מע״מ 17%</th><th>סה״כ</th></tr></thead>
            <tbody>
              <tr>
                <td>{doc.reference || doc.typeLabel}</td>
                <td>{fmtMoney(doc.net)}</td>
                <td>{fmtMoney(doc.vat)}</td>
                <td><b>{fmtMoney(doc.gross)}</b></td>
              </tr>
            </tbody>
          </table>
          <div className="inv-doc-total">
            <span>אמצעי תשלום: {doc.paymentMethodLabel}</span>
            <b>לתשלום: {fmtMoney(doc.gross)}</b>
          </div>
          <p className="inv-doc-stamp">{doc.stamp || COMPUTERISED_STAMP}{doc.signed ? '' : ' (התעודה תיחתם בחתימת החברה)'}</p>
        </div>
        <div className="inv-doc-log no-print">
          <h4>יומן אירועים</h4>
          <ul>{events.map((e, i) => (
            <li key={i}>{fmtDate(e.at)} — {({ issued: 'הופק', printed: 'הודפס', emailed: 'נשלח במייל', credited: 'זוכה' })[e.event] || e.event}{e.by ? ` · ${e.by}` : ''}{e.to ? ` · ${e.to}` : ''}</li>
          ))}</ul>
        </div>
      </div>
    </div>
  );
}

// Report 406 — the accounting export. Three modes; "current" marks what it sends
// so nothing goes out twice, "range" re-exports a period, "full" dumps everything.
function AccountingExport({ config }) {
  const [pending, setPending] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState([]);

  const refresh = () => {
    pendingExportCount().then(setPending).catch(() => setPending(0));
    loadExportHistory().then(setHistory).catch(() => setHistory([]));
  };
  useEffect(refresh, []);

  const run = async (mode) => {
    setBusy(mode);
    try {
      const { count, filename, blob } = await runAccountingExport(mode, { from, to, config });
      downloadBlob(blob, filename);
      alert(`יוצאו ${count} מסמכים לקובץ ${filename}.`);
      refresh();
    } catch (e) { alert(e?.message || e); } finally { setBusy(''); }
  };

  return (
    <section className="inv-card">
      <h3>ייצוא להנהלת חשבונות
        {pending != null && <em className={pending ? 'inv-badge on' : 'inv-badge'}>{pending} ממתינים</em>}
      </h3>
      <p className="inv-hint">
        מפיק קובץ תנועות (Movein.dat) לתוכנת הנהלת החשבונות. "ייצוא שוטף" שולח רק
        מה שטרם יוצא ומסמן אותו, כדי שלא יישלח פעמיים.
      </p>
      <div className="inv-export-modes">
        <button className="rp-btn" disabled={busy === 'current'} onClick={() => run('current')}>
          {busy === 'current' ? 'מייצא…' : `🟢 ${EXPORT_MODES.current.label}`}
        </button>
        <button className="rp-btn ghost" disabled={busy === 'full'} onClick={() => run('full')}>
          {busy === 'full' ? 'מייצא…' : `📄 ${EXPORT_MODES.full.label}`}
        </button>
      </div>
      <div className="inv-export-range">
        <label>מתאריך<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>עד<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="rp-btn ghost" disabled={busy === 'range'} onClick={() => run('range')}>
          {busy === 'range' ? 'מייצא…' : `📅 ${EXPORT_MODES.range.label}`}
        </button>
      </div>
      {history.length > 0 && (
        <details className="inv-export-log">
          <summary>היסטוריית ייצוא ({history.length})</summary>
          <ul>{history.slice(0, 12).map((h) => (
            <li key={h.id}>
              {fmtDate(h.at)} · {EXPORT_MODES[h.mode]?.label || h.mode} · {h.count} מסמכים{h.by ? ` · ${h.by}` : ''}
            </li>
          ))}</ul>
        </details>
      )}
    </section>
  );
}

export default function Invoicing() {
  const [authed, setAuthed] = useState(isAuthed());
  const [config, setConfig] = useState(null);
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  const reloadConfig = () => readConfig().then(setConfig).catch(() => setConfig({}));
  const reloadDocs = () => loadDocuments().then(setDocs).catch((e) => { setDocs([]); setErr(e?.message || String(e)); });
  useEffect(() => { if (authed) { reloadConfig(); reloadDocs(); } }, [authed]);

  const company = useMemo(() => companyDetails(config || {}), [config]);
  const hasCompany = !!company.taxId;

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  return (
    <div className="inv-shell">
      <header className="inv-header no-print">
        <div className="rg-brand"><span className="rg-logo">🧾</span><div><h1>קבלות וחשבוניות</h1><p>מסמכים ממוספרים, נעולים, לפי הוראות ניהול פנקסים</p></div></div>
        <div className="rg-header-actions">
          <button className="rp-btn ghost" disabled={!docs?.length} onClick={() => downloadUniformFile({ documents: docs, config })}>💾 ייצוא קובץ אחיד (BKM)</button>
          <a className="rp-btn ghost" href="#registry">מערכת הרישום ←</a>
        </div>
      </header>

      {err && <p className="rg-err no-print">{err}</p>}

      <div className="inv-cols no-print">
        <div>
          {config && (!hasCompany ? <CompanySetup config={config} onSaved={reloadConfig} />
            : <IssueForm config={config} onIssued={() => reloadDocs()} />)}
          {hasCompany && config && <AccountingExport config={config} />}
          {hasCompany && config && <CompanySetup config={config} onSaved={reloadConfig} />}
        </div>
        <div>
          <section className="inv-card">
            <h3>מסמכים שהופקו {docs && <em>{docs.length}</em>}</h3>
            {docs === null ? <p className="rg-empty">טוען…</p>
              : docs.length === 0 ? <p className="rg-empty">עדיין לא הופקו מסמכים.</p>
              : (
                <div className="rg-tablewrap">
                  <table className="rg-table">
                    <thead><tr><th>מספר</th><th>סוג</th><th>תאריך</th><th>לקוח</th><th>סכום</th><th /></tr></thead>
                    <tbody>{docs.map((d) => (
                      <tr key={d.id} className="rg-clickrow" onClick={() => setOpen(d)}>
                        <td dir="ltr"><b>{d.display}</b></td>
                        <td>{d.typeLabel}</td>
                        <td>{fmtDate(d.issuedAt)}</td>
                        <td>{d.customer?.name || '—'}</td>
                        <td dir="ltr">{fmtMoney(d.gross)}</td>
                        <td>{d.docType === 'credit' ? <span className="rg-pill bad">זיכוי</span> : ''}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
          </section>
        </div>
      </div>

      {open && <DocView doc={open} config={config} onClose={() => setOpen(null)} onChanged={reloadDocs} />}
    </div>
  );
}
