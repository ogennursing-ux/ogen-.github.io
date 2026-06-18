// Setup-phase bar: choose which signer new fields belong to, and rename signers.
export default function SignerBar({ signers, activeSigner, onSelect, onRename }) {
  return (
    <div className="signer-bar">
      <span className="signer-bar-label">שדות חדשים עבור:</span>
      {signers.map((s, i) => (
        <div
          key={i}
          className={`signer-chip${activeSigner === i ? ' active' : ''}`}
          style={{ borderColor: activeSigner === i ? s.color : undefined }}
          onClick={() => onSelect(i)}
        >
          <span className="signer-dot" style={{ background: s.color }} />
          <input
            className="signer-name"
            value={s.name}
            onFocus={() => onSelect(i)}
            onChange={(e) => onRename(i, e.target.value)}
            aria-label={`שם חותם ${i + 1}`}
          />
        </div>
      ))}
    </div>
  );
}
