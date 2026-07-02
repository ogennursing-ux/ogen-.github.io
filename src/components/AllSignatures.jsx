import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { signerNameFromReq } from '../lib/fields.js';
import PdfPreview from './PdfPreview.jsx';
import { useT } from '../lib/i18n.js';

const SEEN_KEY = 'all_signed_seen';

function download(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Shows every signed document in the system, with a "new signatures" banner +
// optional browser notification when new ones arrive.
export default function AllSignatures() {
  const t = useT();
  const [items, setItems] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [preview, setPreview] = useState(null);
  const seenRef = useRef('');
  // Keep the latest translator so the 30s polling closure notifies in the
  // current language even after the user toggles EN/HE.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    try {
      seenRef.current = localStorage.getItem(SEEN_KEY) || '';
    } catch {
      /* ignore */
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    let alive = true;
    async function load(notifyOnNew) {
      try {
        const list = await api.listAllSigned();
        if (!alive) return;
        setItems(list);
        const fresh = list.filter((r) => (r.signed_at || '') > seenRef.current).length;
        setNewCount(fresh);
        if (notifyOnNew && fresh > 0 && seenRef.current && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(tRef.current('חתימה דיגיטלית'), { body: tRef.current('חתימות חדשות: {n}', { n: fresh }) });
        }
      } catch {
        /* ignore */
      }
    }
    load(false);
    const timer = setInterval(() => load(true), 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markSeen() {
    const latest = items[0]?.signed_at || new Date().toISOString();
    try {
      localStorage.setItem(SEEN_KEY, latest);
    } catch {
      /* ignore */
    }
    seenRef.current = latest;
    setNewCount(0);
  }

  async function down(r) {
    try {
      download(await api.getSignedBytes(r), `${r.title || 'document'}-signed.pdf`);
    } catch (e) {
      alert('error: ' + e.message);
    }
  }

  if (!items.length) return null;

  const signerName = (r) => {
    // Prefer the actual name the signer entered (incl. a typed signature).
    const real = signerNameFromReq(r);
    if (real) return real;
    const list = r.signers && r.signers.list ? r.signers.list : Array.isArray(r.signers) ? r.signers : [];
    return list.map((s) => s.name).filter(Boolean).join(', ') || t('מסמך');
  };

  return (
    <div className="dashboard">
      <div className="dash-head">
        <h3>{t('כל החתימות במערכת')}</h3>
        {newCount > 0 && (
          <button className="new-badge" onClick={markSeen}>
            🔔 {t('חתימות חדשות: {n}', { n: newCount })}
          </button>
        )}
      </div>
      <ul className="req-list">
        {items.map((r) => (
          <li key={r.id} className="allsig-item">
            <div className="req-main">
              <span className="req-title">{r.title || t('מסמך')}</span>
              <span className="req-date">
                {signerName(r)} · {new Date(r.signed_at || r.created_at).toLocaleString()}
              </span>
            </div>
            <div className="req-side">
              <span className="badge ok">{t('נחתם')}</span>
              <button className="btn-ghost sm" onClick={() => setPreview({ id: r.id, name: r.title || t('מסמך') })}>
                {t('הצג')}
              </button>
              <button className="btn-primary sm" onClick={() => down(r)}>{t('הורד')}</button>
            </div>
          </li>
        ))}
      </ul>

      {preview && (
        <PdfPreview
          name={preview.name}
          getBytes={async () => {
            const req = await api.getRequest(preview.id);
            return api.getSignedBytes(req);
          }}
          onDownload={async () => {
            const req = await api.getRequest(preview.id);
            download(await api.getSignedBytes(req), `${preview.name}-signed.pdf`);
            setPreview(null);
          }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
