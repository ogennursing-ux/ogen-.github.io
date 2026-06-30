import { FIELD_ICONS, FIELD_LABELS } from '../lib/fields.js';
import { useT } from '../lib/i18n.js';

const TOOLS = [
  'signature',
  'firstName',
  'lastName',
  'fullName',
  'idNumber',
  'text',
  'date',
  'checkbox',
  'initials',
];

// Always-visible field palette (a side rail on desktop, a sticky scroller on
// mobile) so the owner can add fields without scrolling back to the top.
export default function ToolRail({ activeTool, onSelectTool }) {
  const t = useT();
  return (
    <div className="tools-rail">
      <span className="tools-rail-title">{t('הוספת שדות')}</span>
      {TOOLS.map((tool) => (
        <button
          key={tool}
          className={`tool-btn rail-btn${activeTool === tool ? ' active' : ''}`}
          onClick={() => onSelectTool(activeTool === tool ? null : tool)}
          title={t(FIELD_LABELS[tool])}
        >
          <span className="tool-icon" aria-hidden>
            {FIELD_ICONS[tool]}
          </span>
          <span className="rail-label">{t(FIELD_LABELS[tool])}</span>
        </button>
      ))}
    </div>
  );
}
