import { useState } from 'react';
import { getSettings, saveSettings, notify, bytesToBase64 } from '../lib/notify.js';
import { useT } from '../lib/i18n.js';

export default function Settings({ onClose }) {
  const t = useT();
  const s = getSettings();
  const [ownerEmail, setOwnerEmail] = useState(s.ownerEmail || '');
  const [webhook, setWebhook] = useState(s.webhook || '');
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);

  const save = () => {
    saveSettings({ ownerEmail: ownerEmail.trim(), webhook: webhook.trim() });
    onClose();
  };

  // Fire the SAME payload a real completed signature sends (incl. a PDF
  // attachment), so this button faithfully tests the whole email path.
  async function sendTest() {
    if (!webhook.trim() || !ownerEmail.trim()) {
      setTestMsg(t('מלא/י קודם מייל וכתובת שירות.'));
      return;
    }
    setTesting(true);
    setTestMsg(t('שולח…'));
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      doc.addPage([320, 200]);
      const bytes = await doc.save();
      await notify(webhook.trim(), {
        type: 'test',
        to: ownerEmail.trim(),
        title: 'בדיקה',
        subject: 'בדיקת מייל מהאפליקציה — עוגן',
        message: 'זהו מייל בדיקה מהאפליקציה. אם הגיע (עם הקובץ המצורף) — כל מסלול השליחה עובד ✅',
        fileName: 'test.pdf',
        fileBase64: bytesToBase64(bytes),
      });
      setTestMsg(t('נשלח! בדוק/י את המייל שלך — כולל תיקיית ספאם. לא הגיע? כתוב/י לי.'));
    } catch (e) {
      setTestMsg('error: ' + e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="sign-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sign-modal-head">
          <h3>{t('הגדרות')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <p className="sign-hint">
          {t('בכל חתימה יישלח אליך מייל עם המסמך החתום המצורף (וכשיש שני חותמים — גם התראה אחרי החתימה הראשונה). כדי להפעיל: הזן את המייל שלך וכתובת שירות השליחה (Make או Google Apps Script).')}
        </p>
        <label className="field-label">{t('המייל שלך (לקבלת מסמכים חתומים)')}</label>
        <input
          className="text-input"
          type="email"
          dir="ltr"
          placeholder="you@example.com"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
        <label className="field-label" style={{ marginTop: 10 }}>{t('כתובת שירות שליחת המייל (Make / Google Apps Script)')}</label>
        <input
          className="text-input"
          type="url"
          dir="ltr"
          placeholder="https://script.google.com/macros/s/.../exec"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
        />
        <div className="sign-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={sendTest} disabled={testing}>
            {t('שלח מייל בדיקה')}
          </button>
          <button className="btn-primary" onClick={save}>{t('שמור')}</button>
        </div>
        {testMsg && <p className="sign-hint" style={{ marginTop: 8 }}>{testMsg}</p>}
      </div>
    </div>
  );
}
