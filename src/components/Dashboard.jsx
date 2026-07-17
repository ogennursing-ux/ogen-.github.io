import { useEffect, useState } from 'react';
import { api, listMyRequests, forgetRequest, signingLink } from '../lib/api.js';
import { mergePdfs, toCsv, downloadBlob, downloadPagesAsImages } from '../lib/exporters.js';
import { signerNameFromReq } from '../lib/fields.js';
import PdfPreview from './PdfPreview.jsx';
import { useT } from '../lib/i18n.js';

export default function Dashboard({ onDownloadSigned }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [info, setInfo] = useState({});
  const [query, setQuery] = useState('');
  const [showN, setShowN] = useState(25);
  const [sortBy, setSortBy] = useState('new');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dlMode, setDlMode] = useState({}); // per-document: 'all' (one PDF) | 'sep' (a image per page)

  // Download a signed document either as one PDF or as one image per page.
  async function downloadDoc(id, name) {
    if ((dlMode[id] || 'all') === 'all') {
      onDownloadSigned(id);
      return;
    }
    setBusy(true);
    try {
      const req = await api.getRequest(id);
      const bytes = await api.getSignedBytes(req);
      await downloadPagesAsImages(bytes, name);
    } catch (e) {
      alert(t('הורדה נכשלה') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const statusText = (d) => {
    if (!d || !d.status) return t('טוען…');
    if (d.status === 'signed') return t('נחתם');
    if (d.status === 'missing') return t('לא נמצא');
    return d.total > 1 ? t('ממתין לחותם {c}/{t}', { c: d.current + 1, t: d.total }) : t('ממתין לחתימה');
  };

  useEffect(() => {
    let alive = true;
    const list = listMyRequests();
    setItems(list);
    list.forEach(async (it) => {
      try {
        const req = await api.getRequest(it.id);
        const s = req.signers && req.signers.list ? req.signers : { current: 0, list: [{}] };
        if (alive) setInfo((p) => ({ ...p, [it.id]: { status: req.status, current: s.current || 0, total: s.list.length, signer: signerNameFromReq(req) } }));
      } catch {
        if (alive) setInfo((p) => ({ ...p, [it.id]: { status: 'missing' } }));
      }
    });
    return () => { alive = false; };
  }, []);

  if (!items.length) return null;

  const matchesStatus = (id) => {
    if (filterStatus === 'all') return true;
    const st = info[id]?.status;
    if (filterStatus === 'signed') return st === 'signed';
    return st && st !== 'signed' && st !== 'missing';
  };
  const sorted = items
    .filter((it) => (it.title || '').includes(query.trim()) && matchesStatus(it.id))
    .sort((a, b) => {
      if (sortBy === 'old') return a.createdAt - b.createdAt;
      if (sortBy === 'name') return (a.title || '').localeCompare(b.title || '', 'he');
      if (sortBy === 'status') return (info[a.id]?.status || '').localeCompare(info[b.id]?.status || '');
      return b.createdAt - a.createdAt;
    });
  const filtered = sorted.slice(0, showN);
  const visibleIds = filtered.map((i) => i.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(visibleIds)));
  const chosen = () => (selected.size ? items.filter((i) => selected.has(i.id)) : filtered);
  const copy = (id) => {
    const link = signingLink(id);
    navigator.clipboard?.writeText(link).catch(() => window.prompt('copy', link));
  };

  function exportCsv() {
    const rows = chosen().map((it) => ({
      title: it.title || t('מסמך'),
      status: statusText(info[it.id]),
      date: new Date(it.createdAt).toLocaleDateString(),
    }));
    downloadBlob(toCsv(rows), 'text/csv;charset=utf-8', 'klik-hatima-documents.csv');
  }

  async function mergeDownload() {
    const ids = chosen().map((i) => i.id).filter((id) => info[id]?.status === 'signed');
    if (!ids.length) {
      alert(t('בחר מסמכים חתומים להורדה מרוכזת.'));
      return;
    }
    setBusy(true);
    try {
      const buffers = [];
      for (const id of ids) {
        const req = await api.getRequest(id);
        buffers.push(await api.getSignedBytes(req));
      }
      downloadBlob(await mergePdfs(buffers), 'application/pdf', `signed-documents-${ids.length}.pdf`);
    } catch (e) {
      alert('error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    // Delete is destructive: require an explicit selection (never fall back to
    // "all visible") so an accidental click can't wipe the whole list.
    if (!selected.size) {
      alert(t('בחר מסמכים למחיקה.'));
      return;
    }
    const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (!ids.length) return;
    if (!confirm(t('להסיר {n} מסמכים מהרשימה?', { n: ids.length }))) return;
    setBusy(true);
    try {
      for (const id of ids) {
        try { await api.deleteRequest(id); } catch { /* best-effort */ }
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
        <h3>{t('המסמכים שלי')}</h3>
        <div className="dash-controls">
          <input className="dash-search" placeholder={t('חיפוש…')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="dash-show" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="new">{t('חדש → ישן')}</option>
            <option value="old">{t('ישן → חדש')}</option>
            <option value="name">{t('לפי שם')}</option>
            <option value="status">{t('לפי סטטוס')}</option>
          </select>
          <select className="dash-show" value={showN} onChange={(e) => setShowN(+e.target.value)}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{t('הצג {n}', { n })}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="dash-filters">
        {[['all', t('הכל')], ['pending', t('ממתינים')], ['signed', t('נחתמו')]].map(([key, label]) => (
          <button key={key} className={`chip${filterStatus === key ? ' active' : ''}`} onClick={() => setFilterStatus(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="dash-bulk">
        <label className="dash-selall">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          {t('בחר הכל')}
        </label>
        <div className="dash-bulk-actions">
          <button className="btn-ghost sm" disabled={busy} onClick={exportCsv}>{t('ייצוא Excel/CSV')}</button>
          <button className="btn-ghost sm" disabled={busy} onClick={mergeDownload}>{t('הורדה מרוכזת')}</button>
          <button className="btn-ghost sm danger-text" disabled={busy} onClick={removeSelected}>{t('מחק')}</button>
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
                <span className="req-title">{it.title || t('מסמך')}</span>
                <span className="req-date">
                  {d.signer ? `${d.signer} · ` : ''}
                  {new Date(it.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="req-side">
                {d.status === 'signed' ? (
                  <>
                    <span className="badge ok">{t('נחתם')}</span>
                    <button className="btn-ghost sm" onClick={() => setPreview({ id: it.id, name: it.title || t('מסמך') })}>{t('הצג')}</button>
                    <select
                      className="dl-mode"
                      value={dlMode[it.id] || 'all'}
                      onChange={(e) => setDlMode((m) => ({ ...m, [it.id]: e.target.value }))}
                      aria-label={t('אופן ההורדה')}
                    >
                      <option value="all">{t('הכל ביחד (PDF)')}</option>
                      <option value="sep">{t('כל דף בנפרד (תמונות)')}</option>
                    </select>
                    <button className="btn-primary sm" disabled={busy} onClick={() => downloadDoc(it.id, it.title || t('מסמך'))}>{t('הורד')}</button>
                  </>
                ) : d.status === 'missing' ? (
                  <span className="badge muted">{t('לא נמצא')}</span>
                ) : (
                  <>
                    <span className="badge wait">{statusText(d)}</span>
                    <button className="btn-ghost sm" onClick={() => copy(it.id)}>{t('קישור')}</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {preview && (
        <PdfPreview
          name={preview.name}
          getBytes={async () => {
            const req = await api.getRequest(preview.id);
            return api.getSignedBytes(req);
          }}
          onDownload={() => { onDownloadSigned(preview.id); setPreview(null); }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
