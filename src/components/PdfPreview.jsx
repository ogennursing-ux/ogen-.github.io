import { useEffect, useState } from 'react';
import { renderPdfPages } from '../lib/pdfUtils.js';
import { parseRanges, extractPages, downloadBlob } from '../lib/exporters.js';
import { useT } from '../lib/i18n.js';

// Modal that renders a PDF (by a getBytes() loader) for preview before download.
export default function PdfPreview({ getBytes, name, onClose, onDownload }) {
  const t = useT();
  const [pages, setPages] = useState(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState('');

  async function downloadPages() {
    const total = pages ? pages.length : 0;
    const indices = parseRanges(range, total);
    if (!indices.length) {
      alert(t('דפים (למשל 1-3,5)'));
      return;
    }
    try {
      const bytes = await getBytes();
      const out = await extractPages(bytes, indices);
      downloadBlob(out, 'application/pdf', `${name || 'document'}-pages.pdf`);
    } catch (e) {
      alert('error: ' + e.message);
    }
  }

  // Download every page as its own image file, all from a single click.
  async function downloadPagesSeparately() {
    if (!pages || !pages.length) return;
    const base = (name || 'document').replace(/\.pdf$/i, '');
    for (let i = 0; i < pages.length; i++) {
      const res = await fetch(pages[i].url);
      const blob = await res.blob();
      downloadBlob(blob, 'image/jpeg', `${base}-page-${i + 1}.jpg`);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bytes = await getBytes();
        const rendered = await renderPdfPages(new Uint8Array(bytes.slice(0)));
        if (alive) setPages(rendered);
      } catch (e) {
        if (alive) setError(e.message || 'שגיאה בטעינת התצוגה');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="preview-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sign-modal-head">
          <h3 className="preview-title">{name || t('תצוגה מקדימה')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="preview-pages">
          {error ? (
            <p className="muted">{error}</p>
          ) : !pages ? (
            <p className="muted">{t('טוען תצוגה…')}</p>
          ) : (
            pages.map((p, i) => <img key={i} className="preview-page" src={p.url} alt={`page ${i + 1}`} />)
          )}
        </div>
        <div className="preview-download">
          <div className="preview-range">
            <input
              className="text-input"
              value={range}
              placeholder={t('דפים (למשל 1-3,5)')}
              onChange={(e) => setRange(e.target.value)}
            />
            <button className="btn-ghost" onClick={downloadPages}>{t('הורד דפים נבחרים')}</button>
          </div>
          <button className="btn-ghost" onClick={downloadPagesSeparately}>{t('הורד כל דף כתמונה')}</button>
          {onDownload && (
            <button className="btn-primary" onClick={onDownload}>{t('הורד הכל')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
