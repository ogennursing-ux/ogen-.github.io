import { useMemo, useState } from 'react';
import PdfPage from './PdfPage.jsx';
import SignaturePad from './SignaturePad.jsx';
import { isFieldEmpty, todayISO } from '../lib/fields.js';
import { useT } from '../lib/i18n.js';

// "Fill once" signing surface: the signer fills a single prominent form and the
// values are distributed to every matching field across the document.
export default function SignFlow({ pages, fields, signers, currentSigner, title, note, busy, onSubmit }) {
  const t = useT();
  const myFields = useMemo(
    () => fields.filter((f) => f.signer === currentSigner),
    [fields, currentSigner],
  );
  const has = (ty) => myFields.some((f) => f.type === ty);

  const [data, setData] = useState({ firstName: '', lastName: '', fullName: '', idNumber: '', initials: '', signature: '' });
  const [sigName, setSigName] = useState(''); // name typed into the signature pad, if any
  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [perField, setPerField] = useState(() => {
    const init = {};
    for (const f of myFields) {
      if (f.type === 'date') init[f.id] = todayISO();
      else if (f.type === 'checkbox') init[f.id] = false;
      else if (f.type === 'text' || f.type === 'question') init[f.id] = '';
    }
    return init;
  });
  const [signFor, setSignFor] = useState(false);

  const setShared = (patch) =>
    setData((d) => {
      const next = { ...d, ...patch };
      if (('firstName' in patch || 'lastName' in patch) && !fullNameTouched) {
        next.fullName = [next.firstName, next.lastName].filter(Boolean).join(' ');
      }
      return next;
    });

  function computeValue(f) {
    switch (f.type) {
      case 'signature': return data.signature || '';
      case 'initials': return data.initials || '';
      case 'firstName': return data.firstName || '';
      case 'lastName': return data.lastName || '';
      case 'fullName':
        return data.fullName || [data.firstName, data.lastName].filter(Boolean).join(' ');
      case 'idNumber': return data.idNumber || '';
      default: return perField[f.id] ?? f.value ?? '';
    }
  }

  const filled = fields.map((f) => (f.signer === currentSigner ? { ...f, value: computeValue(f) } : f));

  function submit() {
    const mine = filled.filter((f) => f.signer === currentSigner);
    const missing = mine.filter((f) => f.required && isFieldEmpty(f)).length;
    if (missing) {
      alert(t('יש למלא {n} שדות חובה לפני השליחה.', { n: missing }));
      return;
    }
    const emptySig = mine.filter((f) => f.type === 'signature' && !f.value).length;
    if (emptySig && !confirm(t('נשארו {n} שדות חתימה ריקים. לשלוח בכל זאת?', { n: emptySig }))) return;
    // Signer's name: prefer the name fields, else the name typed in the signature.
    const signerName = (
      data.fullName ||
      [data.firstName, data.lastName].filter(Boolean).join(' ') ||
      sigName ||
      ''
    ).trim();
    onSubmit(filled, signerName);
  }

  const textFields = myFields.filter((f) => f.type === 'text');
  const questionFields = myFields.filter((f) => f.type === 'question');
  const dateFields = myFields.filter((f) => f.type === 'date');
  const checkboxFields = myFields.filter((f) => f.type === 'checkbox');
  const signer = signers[currentSigner] || { name: 'החותם', color: '#1f7a53' };
  const multi = signers.length > 1;

  return (
    <>
      <div className="signflow-bar">
        <div className="signflow-info">
          <span className="signer-dot lg" style={{ background: signer.color }} />
          <div className="signflow-text">
            <strong>{multi ? t('תור החתימה: {name}', { name: signer.name }) : t('מילוי וחתימה')}</strong>
            <span className="signflow-step">
              {title}
              {multi ? ' · ' + t('חותם {c} מתוך {n}', { c: currentSigner + 1, n: signers.length }) : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="details-form">
        {note && <div className="signer-note">{note}</div>}
        <h3>{t('מלא את הפרטים פעם אחת — הם יופיעו בכל המקומות במסמך')}</h3>

        <div className="df-grid">
          {(has('firstName') || has('fullName')) && (
            <label className="df-field">
              <span>{t('שם פרטי')}</span>
              <input value={data.firstName} onChange={(e) => setShared({ firstName: e.target.value })} />
            </label>
          )}
          {(has('lastName') || has('fullName')) && (
            <label className="df-field">
              <span>{t('שם משפחה')}</span>
              <input value={data.lastName} onChange={(e) => setShared({ lastName: e.target.value })} />
            </label>
          )}
          {has('fullName') && (
            <label className="df-field">
              <span>{t('שם מלא')}</span>
              <input
                value={data.fullName}
                onChange={(e) => {
                  setFullNameTouched(true);
                  setData((d) => ({ ...d, fullName: e.target.value }));
                }}
              />
            </label>
          )}
          {has('idNumber') && (
            <label className="df-field">
              <span>{t('תעודת זהות')}</span>
              <input dir="ltr" value={data.idNumber} onChange={(e) => setShared({ idNumber: e.target.value })} />
            </label>
          )}
          {has('initials') && (
            <label className="df-field">
              <span>{t('ראשי תיבות')}</span>
              <input value={data.initials} onChange={(e) => setShared({ initials: e.target.value })} />
            </label>
          )}
          {textFields.map((f, i) => (
            <label className="df-field" key={f.id}>
              <span>{textFields.length > 1 ? t('טקסט {i}', { i: i + 1 }) : t('טקסט')}</span>
              <input value={perField[f.id] ?? ''} onChange={(e) => setPerField((p) => ({ ...p, [f.id]: e.target.value }))} />
            </label>
          ))}
          {questionFields.map((f) => (
            <label className="df-field" key={f.id}>
              <span>{f.label || t('שאלה')}</span>
              <input value={perField[f.id] ?? ''} onChange={(e) => setPerField((p) => ({ ...p, [f.id]: e.target.value }))} />
            </label>
          ))}
          {dateFields.map((f, i) => (
            <label className="df-field" key={f.id}>
              <span>{dateFields.length > 1 ? t('תאריך {i}', { i: i + 1 }) : t('תאריך')}</span>
              <input
                type="date"
                value={perField[f.id] ?? todayISO()}
                onChange={(e) => setPerField((p) => ({ ...p, [f.id]: e.target.value }))}
              />
            </label>
          ))}
        </div>

        {checkboxFields.map((f, i) => (
          <label className="df-check" key={f.id}>
            <input type="checkbox" checked={perField[f.id] === true} onChange={(e) => setPerField((p) => ({ ...p, [f.id]: e.target.checked }))} />
            <span>{checkboxFields.length > 1 ? t('אישור {i}', { i: i + 1 }) : t('אני מאשר/ת')}</span>
          </label>
        ))}

        {has('signature') && (
          <div className="df-signature">
            <span className="df-sig-label">{t('חתימה')}</span>
            {data.signature ? (
              <div className="df-sig-preview">
                <img src={data.signature} alt="signature" />
                <button className="btn-ghost sm" onClick={() => setSignFor(true)}>{t('חתום מחדש')}</button>
              </div>
            ) : (
              <button className="btn-primary full" onClick={() => setSignFor(true)}>{t('פתח לוח חתימה')}</button>
            )}
          </div>
        )}

        <p className="consent-note">
          {t('בלחיצה על "סיים ושלח חתימה" הנך מסכימ/ה לביצוע חתימה אלקטרונית ומאשר/ת את')}{' '}
          <a href="./legal.html#terms" target="_blank" rel="noreferrer">{t('תנאי השימוש')}</a>
          {' '}{t('ואת')}{' '}
          <a href="./legal.html#privacy" target="_blank" rel="noreferrer">{t('מדיניות הפרטיות')}</a>.
        </p>
        <button className="btn-primary full df-submit" disabled={busy} onClick={submit}>
          {busy ? t('שולח…') : t('סיים ושלח חתימה')}
        </button>
      </div>

      <main className="pages preview-mode">
        {pages.map((page, i) => (
          <PdfPage
            key={i}
            page={page}
            index={i}
            fields={filled}
            signers={signers}
            phase="sign"
            currentSigner={currentSigner}
            activeTool={null}
            selectedId={null}
            noEdit
            displayOnly
            onPlace={() => {}}
            onSelect={() => {}}
            onChange={() => {}}
            onDelete={() => {}}
          />
        ))}
      </main>

      {signFor && (
        <SignaturePad
          onClose={() => setSignFor(false)}
          onSave={(dataUrl, meta) => {
            if (dataUrl) setData((d) => ({ ...d, signature: dataUrl }));
            if (meta && meta.name) setSigName(meta.name);
            setSignFor(false);
          }}
        />
      )}
    </>
  );
}
