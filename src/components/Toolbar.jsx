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

export default function Toolbar({
  activeTool,
  onSelectTool,
  onContinue,
  onReset,
  onSaveTemplate,
  busy,
  canContinue,
  continueLabel,
}) {
  const t = useT();
  return (
    <div className="toolbar">
      <div className="toolbar-tools">
        {TOOLS.map((tool) => (
          <button
            key={tool}
            className={`tool-btn${activeTool === tool ? ' active' : ''}`}
            onClick={() => onSelectTool(activeTool === tool ? null : tool)}
            title={t('הוסף {label}', { label: t(FIELD_LABELS[tool]) })}
          >
            <span className="tool-icon" aria-hidden>
              {FIELD_ICONS[tool]}
            </span>
            <span>{t(FIELD_LABELS[tool])}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-actions">
        <button className="btn-ghost" onClick={onReset} disabled={busy}>
          {t('מסמך חדש')}
        </button>
        {onSaveTemplate && (
          <button className="btn-ghost" onClick={onSaveTemplate} disabled={busy || !canContinue}>
            {t('שמור כתבנית')}
          </button>
        )}
        <button className="btn-primary" onClick={onContinue} disabled={busy || !canContinue}>
          {continueLabel || t('צור קישור לחתימה ›')}
        </button>
      </div>
    </div>
  );
}
