import { FIELD_LABELS } from '../lib/fields.js';

// Owner setup panel for a placed field: which signer it belongs to, whether it
// is required, and duplicate/delete. The value itself is filled by the signer
// (via the central "fill once" form), so there is no value input here.
export default function EditPanel({
  field,
  signers,
  phase,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
}) {
  if (!field || phase !== 'setup') return null;

  return (
    <div className="edit-panel">
      <div className="edit-panel-head">
        <strong>{FIELD_LABELS[field.type] || 'שדה'}</strong>
        <button className="icon-btn" onClick={onClose} aria-label="סגור">
          ✕
        </button>
      </div>

      {signers.length > 1 && (
        <div className="assign-row">
          <span className="assign-label">שייך ל:</span>
          {signers.map((s, i) => (
            <button
              key={i}
              className={`assign-chip${field.signer === i ? ' active' : ''}`}
              style={{ borderColor: field.signer === i ? s.color : undefined }}
              onClick={() => onChange(field.id, { signer: i })}
            >
              <span className="signer-dot" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      )}

      <p className="muted small">השדה ימולא על־ידי החותם דרך הקישור.</p>

      <label className="checkbox-row req-toggle">
        <input
          type="checkbox"
          checked={!!field.required}
          onChange={(e) => onChange(field.id, { required: e.target.checked })}
        />
        <span>שדה חובה</span>
      </label>

      <div className="edit-panel-foot">
        <button className="btn-ghost" onClick={() => onDuplicate(field.id)}>
          שכפל
        </button>
        <button className="btn-danger" onClick={() => onDelete(field.id)}>
          מחק שדה
        </button>
      </div>
    </div>
  );
}
