// Worker entry for pdf.js. We can't inject code into the pre-built
// pdf.worker.min.mjs, so instead we bundle this thin wrapper as the worker:
// it installs the getOrInsertComputed polyfill first, then loads pdf.js's
// worker for its side effects (registering the message handler on `self`).
import './polyfills.js';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
