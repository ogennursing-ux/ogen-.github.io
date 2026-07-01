// Runtime polyfill for `Map.prototype.getOrInsertComputed` (and the WeakMap
// variant). pdf.js v6 calls this brand-new TC39 "Upsert" proposal method both
// on the main thread and inside its worker, but many shipping browsers don't
// implement it yet (e.g. Chromium ≤ 141), which makes PDF rendering throw
// "getOrInsertComputed is not a function" and blocks every upload.
//
// This module must be imported *before* pdf.js loads, on each thread that runs
// pdf.js code (see main entry points and the worker wrapper).
function install(proto) {
  if (typeof proto.getOrInsertComputed === 'function') return;
  Object.defineProperty(proto, 'getOrInsertComputed', {
    value: function getOrInsertComputed(key, callbackfn) {
      if (typeof callbackfn !== 'function') {
        throw new TypeError('callbackfn must be a function');
      }
      if (this.has(key)) return this.get(key);
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

install(Map.prototype);
install(WeakMap.prototype);
