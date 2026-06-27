import { useEffect, useState } from 'react';
import { api, listMyRequests, forgetRequest, signingLink } from '../lib/api.js';
import { mergePdfs, toCsv, downloadBlob } from '../lib/exporters.js';

const statusText = (d) => {
  if (!d || !d.status) return 'טוען…';
  if (d.status === 'signed') return 'נחתם';
  if (d.status === 'missing') return 'לא נמצא';
  return d.total > 1 ? `ממתין לחותם ${d.current + 1}/${d.total}` : 'ממתין לחתימה';
};

export default function Dashboard({ onDownloadSigned }) {
  const [items, setItems] = useState([]);
  const [info, setInfo] = useState({}); // id -> {status,current,total}
  const [query, setQuery] = useState('');
  const [showN, setShowN] = useState(25);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const list = listMyRequests();
    setItems(list);
    list.forEach(async (it) => {
      try {
        const req = await api.getRequest(it.id);
        const s = req.signers && req.signers.list ? req.signers : { current: 0, list: [{}] };
        setInfo((p) => ({ ...p, [it.id]: { status: req.status, current: s.current || 0, total: s.list.length } }));
      } catch {
        setInfo((p) => ({ ...p, [it.id]: { status: 'missing' } }));
      }
    });
  }, []);

  if (!items.length) return null;

  const filtered = items.filter((it) => (it.title || '').includes(query.trim())).slice(0, showN);
  const visibleIds = filtered.map((i) => i.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(visibleIds)));

  const chosen = () => (selected.size ? items.filter((i) => selected.has(i.id)) : filtered);
  const copy = (id) => {
    const link = signingLink(id);
    navigator.clipboard?.writeText(link).catch(() => window.prompt('העתק:', link));
  };

  function exportCsv() {
    const rows = chosen().map((it) => ({
      title: it.title || 'מסמך',
      status: statusText(info[it.id]),
      date: new Date(it.createdAt).toLocaleDateString('he-IL'),
    }));
    downloadBlob(toCsv(rows), 'text/csv;charset=utf-8', 'ogen-documents.csv');
  }

  async function mergeDownload() {
    const ids = chosen()
      .map((i) => i.id)
      .filter((id) => info[id]?.status === 'signed');
    if (!ids.length) {
      alert('בחר מסמכים חתומים להורדה מרוכזת.');
      return;
    }
    setBusy(true);
    try {
      const buffers = [];
      for (const id of ids) {
        const req = await api.getRequest(id);
        buffers.push(await api.getSignedBytes(req));
      }
      const merged = await mergePdfs(buffers);
      downloadBlob(merged, 'application/pdf', `signed-documents-${ids.length}.pdf`);
    } catch (e) {
      alert('שגיאה בהורדה מרוכזת: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    const ids = chosen().map((i) => i.id);
    if (!ids.length) return;
    if (!confirm(`להסיר ${ids.length} מסמכים מהרשימה?`)) return;
    setBusy(true);
    try {
      for (const id of ids) {
        try {
          await api.deleteRequest(id);
        } catch {
          /* best-effort */
        }
        forgetRequest(id);
      }
      setItems(listMyRequests());
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dash-head">
        <h3>המסמכים שלי</h3>
        <div className="dash-controls">
          <input
            className="dash-search"
            placeholder="חיפוש…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="dash-show" value={showN} onChange={(e) => setShowN(+e.target.value)}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>הצג {n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="dash-bulk">
        <label className="dash-selall">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          בחר הכל
        </label>
        <div className="dash-bulk-actions">
          <button className="btn-ghost sm" disabled={busy} onClick={exportCsv}>ייצוא Excel/CSV</button>
          <button className="btn-ghost sm" disabled={busy} onClick={mergeDownload}>הורדה מרוכזת</button>
          <button className="btn-ghost sm danger-text" disabled={busy} onClick={removeSelected}>מחק</button>
        </div>
      </div>

      <ul className="req-list">
        {filtered.map((it) => {
          const d = info[it.id] || {};
          const sel = selected.has(it.id);
          return (
            <li key={it.id} className={`req-item${sel ? ' sel' : ''}`}>
              <input className="req-check" type="checkbox" checked={sel} onChange={() => toggle(it.id)} />
              <div className="req-main">
                <span className="req-title">{it.title || 'מסמך'}</span>
                <span className="req-date">{new Date(it.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <div className="req-side">
                {d.status === 'signed' ? (
                  <>
                    <span className="badge ok">נחתם</span>
                    <button className="btn-primary sm" onClick={() => onDownloadSigned(it.id)}>הורד</button>
                  </>
                ) : d.status === 'missing' ? (
                  <span className="badge muted">לא נמצא</span>
                ) : (
                  <>
                    <span className="badge wait">{statusText(d)}</span>
                    <button className="btn-ghost sm" onClick={() => copy(it.id)}>קישור</button>
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
