import { useState } from 'react';
import { getSettings, saveSettings } from '../lib/notify.js';

// Owner settings: where completion emails go + the Make webhook that sends them.
export default function Settings({ onClose }) {
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
          <h3>הגדרות</h3>
          <button className="icon-btn" onClick={onClose} aria-label="סגור">✕</button>
        </div>
        <p className="sign-hint">
          להפעלת שליחה אוטומטית במייל (קישור לחותם + המסמך החתום אליך) — חבר webhook של Make.
        </p>
        <label className="field-label">המייל שלך (לקבלת מסמכים חתומים)</label>
        <input
          className="text-input"
          type="email"
          dir="ltr"
          placeholder="you@example.com"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
        <label className="field-label" style={{ marginTop: 10 }}>כתובת ה-Webhook של Make</label>
        <input
          className="text-input"
          type="url"
          dir="ltr"
          placeholder="https://hook.eu2.make.com/..."
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
        />
        <div className="sign-actions">
          <button className="btn-primary" onClick={save}>שמור</button>
        </div>
      </div>
    </div>
  );
}
