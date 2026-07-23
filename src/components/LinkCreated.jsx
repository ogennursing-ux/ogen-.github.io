import { useState } from 'react';
import { useT } from '../lib/i18n.js';

export default function LinkCreated({ link, signerEmail, signersCount = 1, permanent = false, onNewDocument, onDashboard }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('העתק'), link);
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
        <h2>{permanent ? t('התבנית נשמרה! הנה הלינק הקבוע') : t('הקישור לחתימה מוכן!')}</h2>
        <p className="muted">
          {permanent
            ? t('כל מי שתשלח לו את הלינק הזה יוכל לחתום — וכל חתימה תישמר בנפרד ב"התבניות שלי".')
            : signersCount > 1
            ? t('שלח את הקישור לחותם הראשון. אחרי שיחתום — שלח את אותו קישור לחותם השני. בסיום המסמך החתום יחכה לך ב"המסמכים שלי".')
            : t('שלח את הקישור לחותם. ברגע שהוא יחתום, המסמך החתום יחכה לך ב"המסמכים שלי".')}
        </p>

        <div className="link-row">
          <input className="link-input" value={link} readOnly aria-label="קישור לחתימה" onFocus={(e) => e.target.select()} />
          <button className="btn-primary" onClick={copy}>
            {copied ? t('הועתק!') : t('העתק')}
          </button>
        </div>

        <div className="share-buttons">
          <a className="btn-ghost" href={mailto}>{t('שלח במייל')}</a>
          <a className="btn-ghost" href={whatsapp} target="_blank" rel="noreferrer">{t('שלח בוואטסאפ')}</a>
        </div>

        <div className="card-actions">
          <button className="btn-ghost" onClick={onDashboard}>{t('המסמכים שלי')}</button>
          <button className="btn-primary" onClick={onNewDocument}>{t('מסמך חדש')}</button>
        </div>
      </div>
    </div>
  );
}
