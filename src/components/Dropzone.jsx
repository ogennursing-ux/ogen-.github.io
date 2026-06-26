import { useRef, useState } from 'react';

// Landing screen: drag-and-drop or browse for a PDF.
export default function Dropzone({ onFile, busy }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (file) => {
    if (file) onFile(file);
  };

  return (
    <div className="dropzone-screen">
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
        <h2>{busy ? 'טוען מסמך…' : 'גרור לכאן קובץ PDF'}</h2>
        <p>או לחץ לבחירת קובץ מהמחשב</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <p className="privacy-note">
        🔒 הקבצים נשמרים באופן מאובטח ומשמשים אך ורק לתהליך החתימה.
      </p>
    </div>
  );
}
