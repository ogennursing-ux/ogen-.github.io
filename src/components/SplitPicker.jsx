import { Fragment } from 'react';
import { parseGroups } from '../lib/exporters.js';
import { useT } from '../lib/i18n.js';

// Visual picker for the download-split preset: the document's pages are shown
// as numbered chips and clicking the gap between two pages toggles a cut
// there. The result is a contiguous partition spec ("1-3 ; 4 ; 5-7") written
// through onChange — the same format the manual text field produced, so
// download/email splitting downstream is unchanged.

// Derive the cut set (cut after page p) from a spec string. Returns null when
// the spec is not a contiguous partition of 1..count (e.g. a legacy spec that
// skips pages) — the picker can't represent it and must not overwrite it.
function cutsFromSpec(spec, count) {
  const groups = parseGroups(spec);
  const cuts = new Set();
  let next = 1;
  for (const g of groups) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(g.replace(/\s+/g, ''));
    if (!m) return null;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    if (a !== next || b < a || b > count) return null;
    if (b < count) cuts.add(b);
    next = b + 1;
  }
  if (groups.length && next !== count + 1) return null;
  return cuts;
}

function specFromCuts(cuts, count) {
  if (!cuts.size) return '';
  const sorted = [...cuts].sort((x, y) => x - y);
  const spans = [];
  let start = 1;
  for (const c of sorted) {
    spans.push([start, c]);
    start = c + 1;
  }
  spans.push([start, count]);
  return spans.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(' ; ');
}

export default function SplitPicker({ count, value, onChange }) {
  const t = useT();
  const cuts = cutsFromSpec(value, count);

  // A spec the picker can't represent (saved from an old layout): leave the
  // text as-is and offer a reset instead of silently destroying it.
  if (cuts === null) {
    return (
      <div className="split-picker-custom">
        <span dir="ltr">{value}</span>
        <button type="button" className="btn-link" onClick={() => onChange('')}>
          {t('נקה פיצול')}
        </button>
      </div>
    );
  }

  const groupOf = [];
  let g = 0;
  for (let p = 1; p <= count; p++) {
    groupOf[p] = g;
    if (cuts.has(p)) g += 1;
  }

  function toggle(p) {
    const next = new Set(cuts);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(specFromCuts(next, count));
  }

  const parts = cuts.size ? specFromCuts(cuts, count).split(';').map((s) => s.trim()) : [];

  return (
    <div className="split-picker-wrap">
      <div className="split-picker" dir="ltr">
        {Array.from({ length: count }, (_, i) => i + 1).map((p) => (
          <Fragment key={p}>
            <span className={`sp-page ${groupOf[p] % 2 ? 'sp-odd' : 'sp-even'}`}>{p}</span>
            {p < count && (
              <button
                type="button"
                className={'sp-cut' + (cuts.has(p) ? ' active' : '')}
                onClick={() => toggle(p)}
                title={t('לחץ כדי לחתוך כאן לקובץ נפרד')}
                aria-pressed={cuts.has(p)}
              >
                {cuts.has(p) ? '✂️' : '·'}
              </button>
            )}
          </Fragment>
        ))}
      </div>
      <div className="sp-summary">
        {cuts.size
          ? t('יפוצל ל-{n} קבצים: {parts}', { n: parts.length, parts: parts.join(' | ') })
          : t('לחץ בין הדפים כדי לחתוך לקבצים נפרדים (לא חובה)')}
      </div>
    </div>
  );
}
