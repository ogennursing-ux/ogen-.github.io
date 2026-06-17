import { FIELD_ICONS, FIELD_LABELS } from '../lib/fields.js';

const TOOLS = ['signature', 'text', 'date', 'checkbox'];

// Setup-phase toolbar: pick a field tool to place, start over, or continue to
// the signing flow.
export default function Toolbar({ activeTool, onSelectTool, onContinue, onReset, busy, canContinue }) {
  return (
    <div className="toolbar">
      <div className="toolbar-tools">
        {TOOLS.map((tool) => (
          <button
            key={tool}
            className={`tool-btn${activeTool === tool ? ' active' : ''}`}
            onClick={() => onSelectTool(activeTool === tool ? null : tool)}
            title={`הוסף ${FIELD_LABELS[tool]}`}
          >
            <span className="tool-icon" aria-hidden>
              {FIELD_ICONS[tool]}
            </span>
            <span>{FIELD_LABELS[tool]}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-actions">
        <button className="btn-ghost" onClick={onReset} disabled={busy}>
          מסמך חדש
        </button>
        <button className="btn-primary" onClick={onContinue} disabled={busy || !canContinue}>
          המשך לחתימה ›
        </button>
      </div>
    </div>
  );
}
