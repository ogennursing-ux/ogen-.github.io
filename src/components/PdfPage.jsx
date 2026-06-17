import { useRef } from 'react';
import FieldBox from './FieldBox.jsx';

// One PDF page image with its field overlays. When a tool is active (setup
// phase), clicking the page background places a new field at the click position.
export default function PdfPage({
  page,
  index,
  fields,
  signers,
  phase,
  currentSigner,
  activeTool,
  selectedId,
  onPlace,
  onSelect,
  onChange,
  onDelete,
}) {
  const ref = useRef(null);

  const handlePointerDown = (e) => {
    if (phase !== 'setup' || !activeTool) return;
    // Ignore clicks that land on an existing field.
    if (e.target.closest('.field-box')) return;
    const rect = ref.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    onPlace(index, activeTool, xPct, yPct);
  };

  return (
    <div className="pdf-page-wrap">
      <div
        ref={ref}
        className="pdf-page"
        style={{ cursor: phase === 'setup' && activeTool ? 'crosshair' : 'default' }}
        onPointerDown={handlePointerDown}
      >
        <img src={page.url} alt={`עמוד ${index + 1}`} draggable={false} />
        {fields
          .filter((f) => f.pageIndex === index)
          .map((f) => (
            <FieldBox
              key={f.id}
              field={f}
              containerRef={ref}
              color={signers[f.signer]?.color || '#1f7a53'}
              locked={phase === 'sign' && f.signer !== currentSigner}
              selected={selectedId === f.id}
              onSelect={onSelect}
              onChange={onChange}
              onDelete={onDelete}
            />
          ))}
      </div>
      <div className="page-num">עמוד {index + 1}</div>
    </div>
  );
}
