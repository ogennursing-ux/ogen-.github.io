import { useState } from 'react';

// Shown after the owner creates a signing request: the shareable link + ways
// to send it.
export default function LinkCreated({ link, signerEmail, onNewDocument, onDashboard }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select via prompt
      window.prompt('העתק את הקישור:', link);
    }
  };

  const subject = encodeURIComponent('בקשת חתימה על מסמך');
  const body = encodeURIComponent(`שלום,\nמצורף קישור לחתימה על המסמך:\n${link}\n\nתודה.`);
  const mailto = `mailto:${signerEmail || ''}?subject=${subject}&body=${body}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent('קישור לחתימה על מסמך: ' + link)}`;

  return (
    <div className="centered-screen">
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        <h2>הקישור לחתימה מוכן!</h2>
        <p className="muted">שלח את הקישור לחותם. ברגע שהוא יחתום, המסמך החתום יחכה לך ב"המסמכים שלי".</p>

        <div className="link-row">
          <input className="link-input" value={link} readOnly onFocus={(e) => e.target.select()} />
          <button className="btn-primary" onClick={copy}>
            {copied ? 'הועתק!' : 'העתק'}
          </button>
        </div>

        <div className="share-buttons">
          <a className="btn-ghost" href={mailto}>שלח במייל</a>
          <a className="btn-ghost" href={whatsapp} target="_blank" rel="noreferrer">שלח בוואטסאפ</a>
        </div>

        <div className="card-actions">
          <button className="btn-ghost" onClick={onDashboard}>המסמכים שלי</button>
          <button className="btn-primary" onClick={onNewDocument}>מסמך חדש</button>
        </div>
      </div>
    </div>
  );
}
