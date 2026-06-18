import { useEffect, useState } from 'react';
import { api, listMyRequests, signingLink } from '../lib/api.js';
import { formatDate } from '../lib/pdfUtils.js';

// Owner's list of created requests with live status + actions.
export default function Dashboard({ onDownloadSigned }) {
  const [items, setItems] = useState([]);
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    const list = listMyRequests();
    setItems(list);
    // Fetch current status for each request.
    list.forEach(async (it) => {
      try {
        const req = await api.getRequest(it.id);
        setStatuses((s) => ({ ...s, [it.id]: req.status }));
      } catch {
        setStatuses((s) => ({ ...s, [it.id]: 'missing' }));
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
          const st = statuses[it.id];
          return (
            <li key={it.id} className="req-item">
              <div className="req-main">
                <span className="req-title">{it.title || 'מסמך'}</span>
                <span className="req-date">{new Date(it.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <div className="req-side">
                {st === 'signed' ? (
                  <>
                    <span className="badge ok">נחתם</span>
                    <button className="btn-primary sm" onClick={() => onDownloadSigned(it.id)}>
                      הורד חתום
                    </button>
                  </>
                ) : st === 'missing' ? (
                  <span className="badge muted">לא נמצא</span>
                ) : (
                  <>
                    <span className="badge wait">ממתין לחתימה</span>
                    <button className="btn-ghost sm" onClick={() => copy(it.id)}>
                      העתק קישור
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
