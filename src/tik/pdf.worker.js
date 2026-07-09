// Worker entry for pdf.js in the tik module (self-contained copy). Installs the
// getOrInsertComputed polyfill first, then loads pdf.js's worker.
import './polyfills.js';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
