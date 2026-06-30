import { FIELD_LABELS } from '../lib/fields.js';
import { useT } from '../lib/i18n.js';

export default function EditPanel({ field, signers, phase, onChange, onDelete, onDuplicate, onClose }) {
  const t = useT();
  if (!field || phase !== 'setup') return null;

  return (
    <div className="edit-panel">
      <div className="edit-panel-head">
        <strong>{t(FIELD_LABELS[field.type] || 'שדה')}</strong>
        <button className="icon-btn" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>

      {signers.length > 1 && (
        <div className="assign-row">
          <span className="assign-label">{t('שייך ל:')}</span>
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

      <p className="muted small">{t('השדה ימולא על־ידי החותם דרך הקישור.')}</p>

      <label className="checkbox-row req-toggle">
        <input
          type="checkbox"
          checked={!!field.required}
          onChange={(e) => onChange(field.id, { required: e.target.checked })}
        />
        <span>{t('שדה חובה')}</span>
      </label>

      <div className="edit-panel-foot">
        <button className="btn-ghost" onClick={() => onDuplicate(field.id)}>
          {t('שכפל')}
        </button>
        <button className="btn-danger" onClick={() => onDelete(field.id)}>
          {t('מחק שדה')}
        </button>
      </div>
    </div>
  );
}
