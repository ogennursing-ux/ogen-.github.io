// Convert an uploaded file to PDF bytes. PDFs pass through unchanged; .docx is
// converted best-effort in the browser (mammoth -> HTML -> canvas -> PDF).
export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
export function isDocx(file) {
  return (
    /\.docx?$/i.test(file.name) ||
    file.type.includes('word') ||
    file.type.includes('officedocument.wordprocessing')
  );
}

export async function fileToPdfBytes(file) {
  if (isPdf(file)) return file.arrayBuffer();
  if (isDocx(file)) return docxToPdf(file);
  throw new Error('סוג קובץ לא נתמך: ' + (file.name || ''));
}

async function docxToPdf(file) {
  const mammothMod = await import('mammoth');
  const mammoth = mammothMod.convertToHtml ? mammothMod : mammothMod.default;
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const holder = document.createElement('div');
  holder.style.cssText =
    'position:fixed;left:-99999px;top:0;width:794px;background:#fff;padding:48px;' +
    'font-family:Heebo,Arial,sans-serif;direction:rtl;font-size:15px;line-height:1.6;color:#111;';
  holder.innerHTML = html || '<p></p>';
  document.body.appendChild(holder);
  try {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#fff' });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const pageSrcHeight = (canvas.width * ph) / pw; // source px that fill one A4 page

    let sY = 0;
    let first = true;
    while (sY < canvas.height) {
      const sliceH = Math.min(pageSrcHeight, canvas.height - sY);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext('2d').drawImage(canvas, 0, sY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const img = slice.toDataURL('image/jpeg', 0.92);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(img, 'JPEG', 0, 0, pw, (sliceH * pw) / canvas.width);
      sY += sliceH;
    }
    return pdf.output('arraybuffer');
  } finally {
    document.body.removeChild(holder);
  }
}
