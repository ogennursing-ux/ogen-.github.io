import { useEffect, useState } from 'react';
import { api, listMyRequests, signingLink } from '../lib/api.js';

// Owner's list of created requests with live status + actions.
export default function Dashboard({ onDownloadSigned }) {
  const [items, setItems] = useState([]);
  const [info, setInfo] = useState({}); // id -> { status, current, total }

  useEffect(() => {
    const list = listMyRequests();
    setItems(list);
    list.forEach(async (it) => {
      try {
        const req = await api.getRequest(it.id);
        const signers = req.signers && req.signers.list ? req.signers : { current: 0, list: [{}] };
        setInfo((s) => ({
          ...s,
          [it.id]: { status: req.status, current: signers.current || 0, total: signers.list.length },
        }));
      } catch {
        setInfo((s) => ({ ...s, [it.id]: { status: 'missing' } }));
      }
    });
  }, []);

  if (!items.length) return null;

  const copy = (id) => {
    const link = signingLink(id);
    navigator.clipboard?.writeText(link).catch(() => window.prompt('העתק:', link));
  };

  return (
    <div className="dashboard">
      <h3>המסמכים שלי</h3>
      <ul className="req-list">
        {items.map((it) => {
          const d = info[it.id] || {};
          return (
            <li key={it.id} className="req-item">
              <div className="req-main">
                <span className="req-title">{it.title || 'מסמך'}</span>
                <span className="req-date">{new Date(it.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <div className="req-side">
                {d.status === 'signed' ? (
                  <>
                    <span className="badge ok">נחתם</span>
                    <button className="btn-primary sm" onClick={() => onDownloadSigned(it.id)}>
                      הורד חתום
                    </button>
                  </>
                ) : d.status === 'missing' ? (
                  <span className="badge muted">לא נמצא</span>
                ) : d.status ? (
                  <>
                    <span className="badge wait">
                      {d.total > 1 ? `ממתין לחותם ${d.current + 1}/${d.total}` : 'ממתין לחתימה'}
                    </span>
                    <button className="btn-ghost sm" onClick={() => copy(it.id)}>
                      העתק קישור
                    </button>
                  </>
                ) : (
                  <span className="badge muted">טוען…</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
