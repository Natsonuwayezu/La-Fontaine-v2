/* ═══════════════════════════════════════════════════════════════════
   js/integrations/qrcode.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Generate QR code images from verification token URLs.
             Each QR has a small colored badge in the center to
             indicate document type:
               Report Card → 🎓 navy   (#1a3a5c)
               Receipt     → 💰 green  (#2d6a4f)
               Transcript  → 📜 gold   (#c99a3b)

             The QR encodes ONLY the short token URL (~80 chars),
             not any student data. Example:
               https://portal.ecolelafontaine.rw/qr-verify.html?v=UUID

             Architecture:
               - Lazy-loads qrcodejs from CDN on first call
               - Renders QR onto a hidden canvas
               - Draws center badge onto the same canvas using Canvas 2D API
               - Returns a PNG data URL ready to embed in print HTML
               - Falls back to placeholder SVG if library unavailable

   Replaces: the old param-based approach (?s=&t=&y=)
   Load order: AFTER constants.js (needs QR_CONFIG)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const QRCodeIntegration = (() => {

    /* ── CDN loader ─────────────────────────────────────────────── */
    const CDN_URL = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    let _promise = null;

    function _isLoaded() {
        return typeof window.QRCode !== 'undefined';
    }

    function _load() {
        if (_isLoaded()) return Promise.resolve();
        if (_promise) return _promise;
        _promise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = CDN_URL;
            s.onload = () => resolve();
            s.onerror = () => { _promise = null; reject(new Error('QR library CDN load failed.')); };
            document.head.appendChild(s);
        });
        return _promise;
    }

    /* ── Badge config ───────────────────────────────────────────── */
    const BADGE = {
        report_card: { emoji: '🎓', color: '#1a3a5c', label: 'Report' },
        receipt: { emoji: '💰', color: '#2d6a4f', label: 'Receipt' },
        transcript: { emoji: '📜', color: '#c99a3b', label: 'Transcript' },
    };

    /* ── Core generator ─────────────────────────────────────────── */

    /**
     * Generate a QR code PNG with a center badge.
     *
     * @param {string} tokenUrl   - full verification URL (the only payload)
     * @param {string} docType    - 'report_card' | 'receipt' | 'transcript'
     * @param {number} [size=160] - QR image size in px
     * @returns {Promise<string>} PNG data URL
     */
    async function generateQRWithBadge(tokenUrl, docType = 'report_card', size = 160) {
        try {
            await _load();
        } catch (err) {
            console.warn('[QRCode] Library unavailable:', err.message);
            return _placeholderDataUrl(size, docType);
        }

        return new Promise((resolve) => {
            // Off-screen container for qrcodejs to render into
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            document.body.appendChild(wrap);

            // Badge dimensions (center square = 22% of QR size)
            const badgeSize = Math.round(size * 0.22);
            const badgeRadius = Math.round(badgeSize * 0.25);
            const badgePad = Math.round(badgeSize * 0.12);
            const badge = BADGE[docType] || BADGE.report_card;

            try {
                new window.QRCode(wrap, {
                    text: tokenUrl,
                    width: size,
                    height: size,
                    colorDark: '#0f2744',
                    colorLight: '#ffffff',
                    correctLevel: window.QRCode.CorrectLevel.H, // H = 30% recovery, needed for badge cutout
                });

                // qrcodejs renders a canvas (or img fallback)
                const canvas = wrap.querySelector('canvas');
                const img = wrap.querySelector('img');

                if (canvas) {
                    _drawBadge(canvas, badge, badgeSize, badgeRadius, badgePad, size);
                    const dataUrl = canvas.toDataURL('image/png');
                    document.body.removeChild(wrap);
                    resolve(dataUrl);
                } else if (img) {
                    // Fallback: draw QR as image onto a new canvas, then add badge
                    const c = document.createElement('canvas');
                    c.width = size;
                    c.height = size;
                    const ctx = c.getContext('2d');
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, size, size);
                        _drawBadge(c, badge, badgeSize, badgeRadius, badgePad, size);
                        document.body.removeChild(wrap);
                        resolve(c.toDataURL('image/png'));
                    };
                    img.onerror = () => {
                        document.body.removeChild(wrap);
                        resolve(_placeholderDataUrl(size, docType));
                    };
                    if (img.complete) img.onload();
                } else {
                    document.body.removeChild(wrap);
                    resolve(_placeholderDataUrl(size, docType));
                }
            } catch (err) {
                if (document.body.contains(wrap)) document.body.removeChild(wrap);
                console.warn('[QRCode] Generation error:', err.message);
                resolve(_placeholderDataUrl(size, docType));
            }
        });
    }

    /**
     * Draw the center badge onto a canvas.
     * The badge is a rounded rectangle with the doc-type emoji.
     */
    function _drawBadge(canvas, badge, badgeSize, radius, pad, qrSize) {
        const ctx = canvas.getContext('2d');
        const cx = Math.round(qrSize / 2);
        const cy = Math.round(qrSize / 2);
        const x = cx - Math.round(badgeSize / 2);
        const y = cy - Math.round(badgeSize / 2);

        // White backing square (clears QR modules behind badge)
        ctx.fillStyle = '#ffffff';
        _roundRect(ctx, x - pad, y - pad, badgeSize + pad * 2, badgeSize + pad * 2, radius + pad);
        ctx.fill();

        // Colored badge background
        ctx.fillStyle = badge.color;
        _roundRect(ctx, x, y, badgeSize, badgeSize, radius);
        ctx.fill();

        // Emoji in center
        const fontSize = Math.round(badgeSize * 0.54);
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge.emoji, cx, cy + Math.round(fontSize * 0.05));
    }

    /** Draw a rounded rectangle path on a canvas context. */
    function _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * Return an SVG placeholder (used when library/canvas unavailable).
     * Rendered as a data URL so it can be used as img src.
     */
    function _placeholderDataUrl(size, docType) {
        const badge = BADGE[docType] || BADGE.report_card;
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
            xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" fill="#f0ebe6" rx="4"/>
            <!-- QR corner markers -->
            <rect x="10" y="10" width="28" height="28" fill="none" stroke="#0f2744" stroke-width="2.5" rx="3"/>
            <rect x="15" y="15" width="18" height="18" fill="#0f2744" rx="1"/>
            <rect x="${size - 38}" y="10" width="28" height="28" fill="none" stroke="#0f2744" stroke-width="2.5" rx="3"/>
            <rect x="${size - 33}" y="15" width="18" height="18" fill="#0f2744" rx="1"/>
            <rect x="10" y="${size - 38}" width="28" height="28" fill="none" stroke="#0f2744" stroke-width="2.5" rx="3"/>
            <rect x="15" y="${size - 33}" width="18" height="18" fill="#0f2744" rx="1"/>
            <!-- Center badge -->
            <rect x="${size / 2 - 14}" y="${size / 2 - 14}" width="28" height="28"
                fill="${badge.color}" rx="5"/>
            <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="middle"
                font-size="16" font-family="serif">${badge.emoji}</text>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    /* ── Public API ─────────────────────────────────────────────── */

    /**
     * Main entry point — generate a QR code for a token URL.
     * Always resolves (never rejects) — falls back to placeholder.
     *
     * @param {string} tokenUrl - full verify URL
     * @param {string} docType  - 'report_card' | 'receipt' | 'transcript'
     * @param {number} [size]   - px (default 160)
     * @returns {Promise<string>} data URL (PNG or SVG fallback)
     */
    async function generate(tokenUrl, docType, size = 160) {
        return generateQRWithBadge(tokenUrl, docType, size);
    }

    /**
     * Generate QR codes for multiple items sequentially.
     * Sequential to avoid canvas race conditions.
     */
    async function generateBatch(items) {
        const results = [];
        for (const { tokenUrl, docType, size } of items) {
            results.push(await generate(tokenUrl, docType || 'report_card', size || 160));
        }
        return results;
    }

    /**
     * Build just the verify URL from a token (no QR image needed).
     * Used for "Copy link" buttons.
     */
    function buildUrl(token) {
        const base = QR_CONFIG?.verifyBaseUrl || (window.location.origin + '/qr-verify.html');
        return `${base}?v=${encodeURIComponent(token)}`;
    }

    return { generate, generateBatch, buildUrl, isLoaded: _isLoaded, BADGE };

})();

// Expose globally
window.QRCodeIntegration = QRCodeIntegration;