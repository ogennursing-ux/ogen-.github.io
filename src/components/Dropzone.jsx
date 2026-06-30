import { useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';

// Landing screen: drag-and-drop or browse for a PDF.
export default function Dropzone({ onFile, busy }) {
  const t = useT();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (file) => {
    if (file) onFile(file);
  };

  return (
    <div className="dropzone-screen">
      <div className="home-intro">
        <h1>{t('שליחת מסמך לחתימה')}</h1>
        <p>{t('העלה PDF, מקם שדות חתימה, ושלח קישור — או שמור כתבנית לשימוש חוזר.')}</p>
      </div>
      <div
        className={`dropzone${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-icon" aria-hidden>
          📄
        </div>
        <h2>{busy ? t('טוען מסמך…') : t('גרור לכאן קובץ PDF')}</h2>
        <p>{t('או בחר קובץ מהמכשיר')}</p>
        <span className="dropzone-cta">{t('בחר קובץ PDF')}</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <p className="privacy-note">{t('🔒 הקבצים נשמרים באופן מאובטח ומשמשים אך ורק לתהליך החתימה.')}</p>
    </div>
  );
}
