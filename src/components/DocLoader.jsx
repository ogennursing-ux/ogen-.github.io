import { useT } from '../lib/i18n.js';

// Loading screen shown while a document downloads and renders: an animated
// pen endlessly "signing" above a real progress bar. `progress` is 0..1 (or
// null for indeterminate); `page`/`pages` switch the label to a per-page
// count once rendering starts.
const SIG_PATH =
  'M14,52 C30,16 42,16 47,40 C51,58 60,58 67,40 C74,24 82,24 88,40 C93,55 101,55 108,38 C118,12 130,12 138,38 C144,55 152,57 163,46 C174,35 188,33 212,40';

export default function DocLoader({ progress, page, pages }) {
  const t = useT();
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress * 100)));
  const label =
    pct !== null && pct >= 99
      ? t('עוד רגע והמסמך מוכן…')
      : page && pages
        ? t('מכין עמוד {i} מתוך {n}…', { i: page, n: pages })
        : t('מוריד את המסמך…');

  return (
    <div className="doc-loader" role="status" aria-live="polite">
      <img className="dl-logo" src="./klik-icon.png" alt="" />
      <div className="dl-stage">
        <svg viewBox="0 0 226 70" className="dl-svg" aria-hidden>
          <path className="dl-sig-track" d={SIG_PATH} />
          <path className="dl-sig" d={SIG_PATH} />
        </svg>
        <span className="dl-pen" aria-hidden>
          ✒️
        </span>
      </div>
      <div className="dl-bar">
        <div
          className={'dl-fill' + (pct === null ? ' indeterminate' : '')}
          style={pct === null ? undefined : { width: pct + '%' }}
        />
      </div>
      <div className="dl-meta">
        {pct !== null && <span className="dl-pct">{pct}%</span>}
        <span className="dl-label">{label}</span>
      </div>
    </div>
  );
}
