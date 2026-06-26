// Setup-phase signer manager: name + optional email per signer, choose which
// signer new fields belong to, and add/remove a second signer.
export default function SignerBar({
  signers,
  activeSigner,
  onSelect,
  onUpdate,
  onAdd,
  onRemove,
}) {
  return (
    <div className="signer-bar">
      <div className="signer-rows">
        {signers.map((s, i) => (
          <div
            key={i}
            className={`signer-row${activeSigner === i ? ' active' : ''}`}
            style={{ borderColor: activeSigner === i ? s.color : undefined }}
            onClick={() => onSelect(i)}
          >
            <span className="signer-dot" style={{ background: s.color }} />
            <input
              className="signer-name"
              value={s.name}
              placeholder={`שם חותם ${i + 1}`}
              onFocus={() => onSelect(i)}
              onChange={(e) => onUpdate(i, { name: e.target.value })}
            />
            <input
              className="signer-email-inline"
              type="email"
              dir="ltr"
              value={s.email || ''}
              placeholder="מייל (לא חובה)"
              onFocus={() => onSelect(i)}
              onChange={(e) => onUpdate(i, { email: e.target.value })}
            />
            {signers.length > 1 && (
              <button
                className="signer-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                aria-label="הסר חותם"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {signers.length < 2 ? (
        <button className="add-signer-btn" onClick={onAdd}>
          + הוסף חותם שני
        </button>
      ) : (
        <span className="signer-hint">שדות חדשים משויכים ל: {signers[activeSigner].name}</span>
      )}
    </div>
  );
}
