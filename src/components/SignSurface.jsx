import { useMemo, useState } from 'react';
import PdfPage from './PdfPage.jsx';
import EditPanel from './EditPanel.jsx';
import SignaturePad from './SignaturePad.jsx';

// Shared fill-and-sign surface used by both the request signer and the
// permanent-form signer. Fields are positioned (noEdit) and only the current
// signer's fields are interactive.
export default function SignSurface({ pages, fields, signers, currentSigner, onChange }) {
  const [selectedId, setSelectedId] = useState(null);
  const [signFor, setSignFor] = useState(null);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId],
  );

  return (
    <>
      <main
        className="pages"
        onPointerDown={(e) => {
          if (e.target.classList.contains('pages')) setSelectedId(null);
        }}
      >
        {pages.map((page, i) => (
          <PdfPage
            key={i}
            page={page}
            index={i}
            fields={fields}
            signers={signers}
            phase="sign"
            currentSigner={currentSigner}
            activeTool={null}
            selectedId={selectedId}
            noEdit
            onPlace={() => {}}
            onSelect={setSelectedId}
            onChange={onChange}
            onDelete={() => {}}
          />
        ))}
      </main>

      <EditPanel
        field={selectedField}
        signers={signers}
        phase="sign"
        onChange={onChange}
        onDelete={() => {}}
        onDuplicate={() => {}}
        onClose={() => setSelectedId(null)}
        onOpenSign={setSignFor}
      />

      {signFor && (
        <SignaturePad
          onClose={() => setSignFor(null)}
          onSave={(dataUrl) => {
            if (dataUrl) onChange(signFor, { value: dataUrl });
            setSignFor(null);
          }}
        />
      )}
    </>
  );
}
