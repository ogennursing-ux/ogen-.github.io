import { useState } from 'react';
import { getSettings, saveSettings } from '../lib/notify.js';
import { useT } from '../lib/i18n.js';

export default function Settings({ onClose }) {
  const t = useT();
  const s = getSettings();
  const [ownerEmail, setOwnerEmail] = useState(s.ownerEmail || '');
  const [webhook, setWebhook] = useState(s.webhook || '');

  const save = () => {
    saveSettings({ ownerEmail: ownerEmail.trim(), webhook: webhook.trim() });
    onClose();
  };

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
        <div className="sign-actions">
          <button className="btn-primary" onClick={save}>{t('שמור')}</button>
        </div>
      </div>
    </div>
  );
}
