/* ═══════════════════════════════════════════════════════════════════
   js/integrations/qrcode.js — QR code generation (CDN loader)
   ═══════════════════════════════════════════════════════════════════
   core/utils.js already has a complete generateQRCode(studentCode,
   termNumber, yearId) that builds the verify URL from QR_CONFIG
   (constants.js) and renders it via window.QRCode (the qrcodejs
   library) — but that library is never actually loaded anywhere in
   this repo, so calling it throws today. This file's entire job is to
   supply that missing piece: lazy-load qrcodejs from CDN, then defer
   to the existing generateQRCode() rather than reimplementing it.

   Report-card generation should call QRCodeIntegration.generate(...)
   (async, safe to call anytime) instead of window.generateQRCode(...)
   directly (sync, throws if the library isn't loaded yet).
   ═══════════════════════════════════════════════════════════════════ */

const QRCodeIntegration = (() => {

    const CDN_URL = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    let loadPromise = null;

    function isAvailable() {
        return typeof window.QRCode !== 'undefined';
    }

    function ensureLoaded() {
        if (isAvailable()) return Promise.resolve(window.QRCode);
        if (loadPromise) return loadPromise;

        loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CDN_URL;
            script.onload = () => resolve(window.QRCode);
            script.onerror = () => {
                loadPromise = null;
                reject(new Error('Could not load the QR code library. Check your internet connection.'));
            };
            document.head.appendChild(script);
        });
        return loadPromise;
    }

    /**
     * Generate a QR code for a student's report card. Always resolves —
     * falls back to the inline placeholder SVG (qrPlaceholderSVG in
     * core/utils.js) if the library can't be loaded (e.g. fully offline
     * on first use, before sw.js has ever cached it), so report card
     * generation never hard-fails just because of the QR image.
     *
     * @returns {Promise<{src: string, url: string}>}
     */
    async function generate(studentCode, termNumber, yearId) {
        try {
            await ensureLoaded();
            if (typeof window.generateQRCode !== 'function') {
                throw new Error('generateQRCode() is not available (core/utils.js not loaded).');
            }
            const result = window.generateQRCode(studentCode, termNumber, yearId);
            if (result?.src) return result;
            throw new Error('QR generation returned no image.');
        } catch (err) {
            console.warn('QRCodeIntegration: falling back to placeholder QR —', err.message);
            const url = buildVerifyUrl(studentCode, termNumber, yearId);
            const svg = typeof window.qrPlaceholderSVG === 'function'
                ? window.qrPlaceholderSVG(QR_CONFIG?.size || 128)
                : '';
            return { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, url };
        }
    }

    /**
     * Builds the same verify URL generateQRCode() encodes, without
     * requiring the QR library at all — used both as the placeholder
     * fallback above and directly by anything that just needs the link
     * (e.g. a "Copy verify link" button next to the printed QR image).
     */
    function buildVerifyUrl(studentCode, termNumber, yearId) {
        const base = QR_CONFIG?.verifyBaseUrl || (window.location.origin + '/qr-verify.html');
        const params = new URLSearchParams({
            [QR_CONFIG?.studentParam || 's']: studentCode,
            [QR_CONFIG?.termParam || 't']: termNumber,
            [QR_CONFIG?.yearParam || 'y']: yearId
        });
        return `${base}?${params.toString()}`;
    }

    /** Batch variant for report-card batch generation — generates
     *  sequentially rather than in parallel, since qrcodejs renders via a
     *  transient off-screen DOM node per call (see generateQRCode() in
     *  core/utils.js) and concurrent calls could race on that node. */
    async function generateBatch(items) {
        const results = [];
        for (const item of items) {
            results.push(await generate(item.studentCode, item.termNumber, item.yearId));
        }
        return results;
    }

    return { isAvailable, ensureLoaded, generate, generateBatch, buildVerifyUrl };
})();