// Shared config between the owner app (publishing forms) and the standalone
// social-worker forms portal (worker.html). Basic client-side gate — same
// security model as the owner login in Login.jsx. Change the code below and
// redeploy to rotate it.
export const WORKER_ACCESS_CODE = 'עובדים2026';

// Resolves to the sibling worker.html regardless of deployment sub-path.
export function workerPortalLink() {
  return new URL('worker.html', location.href).href;
}
