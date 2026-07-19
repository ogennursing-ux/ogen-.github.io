import { useEffect, useState } from 'react';
import SignFlow from './SignFlow.jsx';
import LangToggle from './LangToggle.jsx';
import BrandName from './BrandName.jsx';
import DocLoader from './DocLoader.jsx';
import { api } from '../lib/api.js';
import { notify, getIp } from '../lib/notify.js';
import { signedPublicUrl, signedPartPublicUrl } from '../lib/config.js';
import { parseGroups, splitByGroups } from '../lib/exporters.js';
import { renderPdfPages, buildSignedPdf } from '../lib/pdfUtils.js';
import { useT } from '../lib/i18n.js';

const FALLBACK = { current: 0, list: [{ name: 'החותם', color: '#1f7a53' }], note: '' };

function download(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeSigners(s) {
  if (!s) return FALLBACK;
  if (Array.isArray(s)) return { current: 0, list: s.length ? s : FALLBACK.list, note: '' };
  if (!s.list || !s.list.length) return { ...FALLBACK, note: s.note || '' };
  return { current: s.current || 0, list: s.list, note: s.note || '' };
}

export default function SignerView({ id }) {
  const t = useT();
  const [status, setStatus] = useState('loading'); // loading|ready|already|done|error
  const [doneKind, setDoneKind] = useState('final');
  const [error, setError] = useState('');
  const [req, setReq] = useState(null);
  const [pages, setPages] = useState([]);
  const [originalBytes, setOriginalBytes] = useState(null);
  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState(false);
  const [signedBytes, setSignedBytes] = useState(null);
  const [loadProg, setLoadProg] = useState({ p: 0.03 });

  const signers = normalizeSigners(req?.signers);
  const current = signers.current;
  const title = req?.title || 'document';

  useEffect(() => {
    (async () => {
      try {
        const r = await api.getRequest(id);
        setReq(r);
        if (r.status === 'signed') {
          setStatus('already');
          return;
        }
        const bytes = await api.getOriginalBytes(r, (f) => setLoadProg({ p: 0.05 + f * 0.5 }));
        setOriginalBytes(bytes);
        const rendered = await renderPdfPages(new Uint8Array(bytes.slice(0)), {
          onProgress: (f, i, n) => setLoadProg({ p: 0.55 + f * 0.45, page: i, pages: n }),
        });
        setPages(rendered);
        setFields(r.fields || []);
        setStatus('ready');
      } catch (e) {
        console.error(e);
        setError(e.message || 'שגיאה בטעינת המסמך');
        setStatus('error');
      }
    })();
  }, [id]);

  async function handleSubmit(filled, signerName) {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const ip = await getIp();
      const newList = signers.list.map((s, i) =>
        i === current ? { ...s, signed: true, signedAt: now, ip, signedName: signerName || s.signedName || '', consent: 'terms-v1' } : s,
      );
      // Preserve any extra fields stored on signers (note, downloadGroups, …).
      const base = req && req.signers && !Array.isArray(req.signers) ? req.signers : {};
      const isLast = current >= signers.list.length - 1;

      if (isLast) {
        const bytes = await buildSignedPdf(originalBytes.slice(0), filled, {
          names: newList.map((s) => s.name),
          refId: id,
          ip,
        });
        await api.submitSigned(id, { fields: filled, signers: { ...base, current, list: newList }, signedPdfBytes: bytes });
        setSignedBytes(bytes);
        setDoneKind('final');
        // Always notify on completion. Requests created by older app versions
        // were saved with a null webhook_url / owner_email and the old guard
        // here silently skipped their notification forever; notify() fills in
        // the built-in relay and the relay falls back to the owner's address.
        {
          const names = newList.map((s) => s.signedName || s.name).filter(Boolean).join(', ');
          // If the document was set up with a download-split preset, the email
          // mirrors the download: upload each page-range part and have the
          // relay attach the parts instead of the single full file. Any
          // failure falls back to the full file — the email must always go out.
          let files = null;
          const groups = parseGroups(base.downloadGroups);
          if (groups.length) {
            try {
              const parts = await splitByGroups(bytes.slice(0), groups);
              if (parts.length) {
                await Promise.all(parts.map((p, i) => api.uploadSignedPart(id, i + 1, p.bytes)));
                files = {
                  fileUrls: parts.map((p, i) => signedPartPublicUrl(id, i + 1)).join('|'),
                  fileNames: parts
                    .map((p) => `${title}-${p.label}.pdf`.replace(/\|/g, '-'))
                    .join('|'),
                };
              }
            } catch (e) {
              console.warn('split for email failed, sending full file', e);
            }
          }
          notify(req.webhook_url, {
            type: 'completed',
            to: req.owner_email,
            title,
            signerName: names,
            ...(files || { fileName: `${title}-signed.pdf`, fileUrl: signedPublicUrl(id) }),
            subject: `מסמך נחתם: ${title}`,
            message: files
              ? `המסמך "${title}" נחתם על ידי ${names || 'החותם'}. הקבצים החתומים (מפוצלים לפי דפים) מצורפים למייל זה.`
              : `המסמך "${title}" נחתם על ידי ${names || 'החותם'}. הקובץ החתום מצורף למייל זה.`,
          });
        }
      } else {
        await api.advance(id, { fields: filled, signers: { ...base, current: current + 1, list: newList } });
        setDoneKind('intermediate');
        const next = newList[current + 1];
        if (next?.email) {
          notify(req.webhook_url, { type: 'invite', to: next.email, title, link: location.href });
        }
        // Tell the owner the first signature is in (no attachment yet — the file
        // is emailed with the attachment once the last signer completes).
        {
          notify(req.webhook_url, {
            type: 'partial',
            to: req.owner_email,
            title,
            link: location.href,
            signerName: signerName || newList[current]?.name || '',
            signerIndex: current + 1,
            totalSigners: newList.length,
            subject: `חתימה ${current + 1}/${newList.length} בוצעה — ${title}`,
            message: `חתימה ראשונה בוצעה בהצלחה על המסמך "${title}". ממתין לחתימת החותם הבא. המסמך החתום המלא יישלח אליך בסיום.`,
          });
        }
      }
      setStatus('done');
    } catch (e) {
      console.error(e);
      alert('שליחת החתימה נכשלה: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSignedExisting() {
    setBusy(true);
    try {
      download(await api.getSignedBytes(req), `${title}-signed.pdf`);
    } catch (e) {
      alert('הורדה נכשלה: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header className="app-header">
      <div className="brand">
        <img className="brand-mark brand-logo" src="./klik-icon.png" alt="" />
        <BrandName />
      </div>
      <LangToggle />
    </header>
  );
  const centered = (content) => (
    <div className="app">{header}<div className="centered-screen">{content}</div></div>
  );

  if (status === 'loading')
    return centered(<DocLoader progress={loadProg.p} page={loadProg.page} pages={loadProg.pages} />);
  if (status === 'error')
    return centered(
      <div className="card"><h2>{t('לא ניתן לפתוח את המסמך')}</h2><p className="muted">{error}</p></div>,
    );
  if (status === 'already')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        <h2>{t('המסמך כבר נחתם')}</h2>
        <p className="muted">{t('אפשר להוריד עותק חתום.')}</p>
        <button className="btn-primary full" disabled={busy} onClick={downloadSignedExisting}>
          {busy ? t('מוריד…') : t('הורד מסמך חתום')}
        </button>
      </div>,
    );
  if (status === 'done')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        {doneKind === 'final' ? (
          <>
            <h2>{t('תודה! החתימה הושלמה')}</h2>
            <p className="muted">{t('המסמך החתום נשמר ונשלח לשולח הבקשה.')}</p>
            <button className="btn-primary full" onClick={() => download(signedBytes, `${title}-signed.pdf`)}>
              {t('הורד עותק חתום')}
            </button>
          </>
        ) : (
          <>
            <h2>{t('תודה! החתימה נשמרה')}</h2>
            <p className="muted">{t('המסמך הועבר לחתימת {name}.', { name: signers.list[current + 1]?.name || '' })}</p>
          </>
        )}
      </div>,
    );

  return (
    <div className="app">
      {header}
      <SignFlow
        pages={pages}
        fields={fields}
        signers={signers.list}
        currentSigner={current}
        title={title}
        note={signers.note}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
