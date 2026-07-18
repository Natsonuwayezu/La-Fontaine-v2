/* ═══════════════════════════════════════════════════════════════════
   js/integrations/print.js — Print orchestration
   ═══════════════════════════════════════════════════════════════════
   core/utils.js already has printElement(elementId), but it toggles
   .print-target/.printing-element classes that don't actually exist
   anywhere in css/print/*.css — those files hide known app-chrome
   selectors (.sidebar, .topbar, etc.) directly and rely on the
   printable document already being the only meaningful content left,
   using dedicated wrapper classes verified against the actual files:

     Report cards → .batch-reports-container > .report-card (per-card
                     page-break-after via report-cards-print.css)
     Receipts      → .receipt-container (receipts-print.css)
     Statements    → .statement-container (statements-print.css)
     Attendance    → .attendance-print-container (print.css)

   Since print.css hides specific chrome selectors but never hides
   #app's own content wholesale, this file's real job is the missing
   piece: temporarily hide the live app and show a dedicated, isolated
   print root containing only the document being printed, then restore
   everything afterward. Pure JS visibility toggling — no new CSS
   needed, and nothing in the existing print stylesheets is touched.

   Callers (report-cards.js, receipts.js, etc.) build the correctly-
   classed HTML themselves; this file only handles the mechanics of
   showing it, printing, and cleaning up.
   ═══════════════════════════════════════════════════════════════════ */

const PrintIntegration = (() => {

  const PRINT_ROOT_ID = 'print-root';
  let restoreFns = [];

  function getOrCreatePrintRoot() {
    let root = document.getElementById(PRINT_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = PRINT_ROOT_ID;
      root.setAttribute('aria-hidden', 'true');
      document.body.appendChild(root);
    }
    return root;
  }

  /**
   * Hides every direct child of <body> except the print root, and
   * remembers how to put them back. Simpler and safer than trying to
   * enumerate every app-chrome selector print.css already knows about —
   * this just hides everything else, full stop.
   */
  function hideAppForPrint() {
    restoreFns = [];
    Array.from(document.body.children).forEach(el => {
      if (el.id === PRINT_ROOT_ID) return;
      const prevDisplay = el.style.display;
      el.style.display = 'none';
      restoreFns.push(() => { el.style.display = prevDisplay; });
    });
  }

  function restoreAppAfterPrint() {
    restoreFns.forEach(fn => fn());
    restoreFns = [];
    const root = document.getElementById(PRINT_ROOT_ID);
    if (root) { root.innerHTML = ''; root.style.display = 'none'; }
  }

  /**
   * Core entry point. `html` should already use the correct print
   * wrapper class for its document type (see the class map above) —
   * this function doesn't add one, since callers vary in how many
   * documents they're printing at once (e.g. batch report cards need
   * their own .batch-reports-container wrapper around several
   * .report-card children; a single receipt doesn't).
   */
  function printHTML(html) {
    return new Promise((resolve) => {
      const root = getOrCreatePrintRoot();
      root.innerHTML = html;
      root.style.display = 'block';
      hideAppForPrint();

      const cleanup = () => {
        restoreAppAfterPrint();
        window.removeEventListener('afterprint', cleanup);
        resolve();
      };
      window.addEventListener('afterprint', cleanup);

      // requestAnimationFrame so the browser has actually painted the
      // print root before print() opens the dialog — otherwise some
      // browsers (notably Firefox) can print a blank first page.
      requestAnimationFrame(() => window.print());

      // Safety net: if `afterprint` never fires (some mobile browsers
      // don't emit it reliably), restore after a generous timeout so
      // the app doesn't stay hidden forever.
      setTimeout(() => { if (restoreFns.length) cleanup(); }, 15000);
    });
  }

  // ── Convenience wrappers for the document types verified above ────

  function printReportCards(reportCardHTMLArray) {
    const html = `<div class="batch-reports-container">${reportCardHTMLArray.join('')}</div>`;
    return printHTML(html);
  }

  function printReceipt(receiptHTML, { thermal = false } = {}) {
    // receipts-print.css and receipts-thermal-print.css both target
    // .receipt-container; thermal formatting is controlled by the
    // caller adding the .thermal modifier class already used on-screen
    // (css/modules/finance.css's .receipt-container.thermal), not by
    // this function — it just prints whatever it's given.
    return printHTML(receiptHTML);
  }

  function printStatement(statementHTML) {
    return printHTML(statementHTML);
  }

  function printAttendance(attendanceHTML) {
    return printHTML(`<div class="attendance-print-container">${attendanceHTML}</div>`);
  }

  /** Escape hatch for document types without a dedicated wrapper
   *  verified in css/print/*.css yet (transcripts, marksheets,
   *  register exports) — same mechanics, caller supplies the HTML
   *  exactly as it should appear. */
  function printRaw(html) {
    return printHTML(html);
  }

  return {
    printHTML, printRaw,
    printReportCards, printReceipt, printStatement, printAttendance
  };
})();