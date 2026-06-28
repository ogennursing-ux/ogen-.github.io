import { FIELD_LABELS } from '../lib/fields.js';

// Bottom sheet for editing the selected field's value (and, during setup, which
// signer it belongs to).
export default function EditPanel({
  field,
  signers,
  phase,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
  onOpenSign,
}) {
  if (!field) return null;

  return (
    <div className="edit-panel">
      <div className="edit-panel-head">
        <strong>{FIELD_LABELS[field.type]}</strong>
        <button className="icon-btn" onClick={onClose} aria-label="סגור">
          ✕
        </button>
      </div>

      {phase === 'setup' && signers.length > 1 && (
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

      <div className="edit-panel-body">
        {(field.type === 'text' || field.type === 'initials') && (
          <input
            className="text-input"
            type="text"
            value={field.value || ''}
            placeholder={field.type === 'initials' ? 'ראשי תיבות' : 'הקלד טקסט'}
            autoFocus
            onChange={(e) => onChange(field.id, { value: e.target.value })}
          />
        )}

        {field.type === 'date' && (
          <input
            className="text-input"
            type="date"
            value={field.value || ''}
            onChange={(e) => onChange(field.id, { value: e.target.value })}
          />
        )}

        {field.type === 'checkbox' && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={field.value === true}
              onChange={(e) => onChange(field.id, { value: e.target.checked })}
            />
            <span>סמן את התיבה</span>
          </label>
        )}

        {field.type === 'signature' &&
          (phase === 'setup' ? (
            <p className="muted small">שדה חתימה — החותם ימלא אותו דרך הקישור.</p>
          ) : (
            <button className="btn-primary full" onClick={() => onOpenSign(field.id)}>
              {field.value ? 'חתום מחדש' : 'פתח לוח חתימה'}
            </button>
          ))}
      </div>

      {phase === 'setup' && (
        <label className="checkbox-row req-toggle">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange(field.id, { required: e.target.checked })}
          />
          <span>שדה חובה</span>
        </label>
      )}

      {phase === 'setup' && (
        <div className="edit-panel-foot">
          <button className="btn-ghost" onClick={() => onDuplicate(field.id)}>
            שכפל
          </button>
          <button className="btn-danger" onClick={() => onDelete(field.id)}>
            מחק שדה
          </button>
        </div>
      )}
    </div>
  );
}
