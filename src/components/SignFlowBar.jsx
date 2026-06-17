// Signing-phase bar: shows whose turn it is and advances through the signers.
export default function SignFlowBar({ signers, currentSigner, onNext, onBack, onDownload, busy }) {
  const signer = signers[currentSigner];
  const isLast = currentSigner >= signers.length - 1;

  return (
    <div className="signflow-bar">
      <div className="signflow-info">
        <span className="signer-dot lg" style={{ background: signer.color }} />
        <div className="signflow-text">
          <strong>תור החתימה: {signer.name}</strong>
          <span className="signflow-step">
            שלב {currentSigner + 1} מתוך {signers.length}
          </span>
        </div>
      </div>
      <div className="signflow-actions">
        <button className="btn-ghost" onClick={onBack} disabled={busy}>
          חזור לעריכה
        </button>
        {isLast ? (
          <button className="btn-primary" onClick={onDownload} disabled={busy}>
            {busy ? 'מעבד…' : 'הורד PDF חתום'}
          </button>
        ) : (
          <button className="btn-primary" onClick={onNext} disabled={busy}>
            סיים והעבר ל{signers[currentSigner + 1].name} ›
          </button>
        )}
      </div>
    </div>
  );
}
