/* ═══════════════════════════════════════════════════════════════════
   tests/helpers/jsdom-polyfills.js
   ═══════════════════════════════════════════════════════════════════
   jest-environment-jsdom provides browser-like globals but doesn't
   backport newer Node-only APIs that some real browsers (and Node
   itself, since v17) do provide — structuredClone being the one
   fake-indexeddb needs internally for IndexedDB's clone-on-write
   semantics. Runs before fake-indexeddb/auto in jest.config.js's
   setupFiles.
   ═══════════════════════════════════════════════════════════════════ */

if (typeof global.structuredClone !== 'function') {
    global.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}
