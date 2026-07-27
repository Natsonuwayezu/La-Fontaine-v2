/* ═══════════════════════════════════════════════════════════════════
   js/core/print-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : All printing logic for the app.
             openPrintWindow() for full-document print,
             printElement() for section print,
             and template builders for every printable document type:
               - Report cards (Nursery FR + Primary EN)
               - Payment receipts (A4 + 80mm thermal)
               - Student statements
               - Class registers / mark sheets
               - Attendance sheets
             All templates use esc() on every dynamic value.
             QR code is rendered as an image from qrcode.js.
   References: backend.txt Part 7, Part 9, css/print/
   Load order: AFTER utils.js, academic-formulas.js, finance-formulas.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   CORE PRINT WINDOW
   ───────────────────────────────────────────────────────────────── */

/**
 * Open a new browser window with printable HTML content and
 * trigger the print dialog after a short delay for CSS to load.
 *
 * @param {string} bodyHTML    - HTML to place in <body>
 * @param {string} [title]     - document title
 * @param {string} [extraCSS]  - additional CSS link href(s) to load
 */
function openPrintWindow(bodyHTML, title = APP_NAME, extraCSS = '') {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        showToast('Pop-up blocked. Please allow pop-ups for printing.', 'warning', 5000);
        return null;
    }

    const cssLinks = [
        '<link rel="stylesheet" href="css/base/variables.css">',
        '<link rel="stylesheet" href="css/base/typography.css">',
        '<link rel="stylesheet" href="css/print/print.css">',
        extraCSS ? `<link rel="stylesheet" href="${esc(extraCSS)}">` : '',
    ].filter(Boolean).join('\n');

    const doc = win.document;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="en"><head>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + esc(title) + '</title>' +
        cssLinks +
        '</head><body class="print-body">' +
        bodyHTML +
        '</body></html>');
    doc.close();

    win.document.close();

    // Wait for stylesheets then print
    setTimeout(() => {
        win.focus();
        win.print();
    }, 500);

    return win;
}

/**
 * Print a section of the current page by its element ID.
 * Adds a .print-target class that CSS uses to show only that element.
 *
 * @param {string} elementId
 * @param {string} [extraCSS]
 */
function printElement(elementId, extraCSS = '') {
    const el = document.getElementById(elementId);
    if (!el) {
        showToast(`Print target "${elementId}" not found.`, 'error');
        return;
    }
    openPrintWindow(el.outerHTML, APP_NAME, extraCSS);
}

/* ─────────────────────────────────────────────────────────────────
   SHARED PRINT HEADER
   ───────────────────────────────────────────────────────────────── */

/**
 * Build the standard school letterhead used across all print docs.
 * @param {string} documentTitle - e.g. 'PAYMENT RECEIPT'
 * @param {string} [subtitle]
 */
function buildPrintLetterhead(documentTitle, subtitle = '') {
    const s = state.schoolSettings || {};
    const name = s.school_name || SCHOOL_DEFAULTS.school_name;
    const loc = s.school_location || SCHOOL_DEFAULTS.school_location;
    const phone = s.school_phone || SCHOOL_DEFAULTS.school_phone;
    const email = s.school_email || SCHOOL_DEFAULTS.school_email;
    const logoUrl = s.school_logo || '';

    const logoHtml = logoUrl
        ? `<img src="${esc(logoUrl)}" alt="Logo" class="receipt-logo">`
        : `<div class="receipt-logo receipt-logo-initials">${esc(name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase())}</div>`;

    return `
    <div class="receipt-header">
        ${logoHtml}
        <div class="receipt-title-group">
            <div class="school-name">${esc(name)}</div>
            <div class="school-address">${esc(loc)}</div>
            ${phone ? `<div class="school-address">${esc(phone)}${email ? ' · ' + esc(email) : ''}</div>` : ''}
            <div class="receipt-title">${esc(documentTitle)}</div>
            ${subtitle ? `<div style="font-size:10px;color:#6b5f56;">${esc(subtitle)}</div>` : ''}
        </div>
    </div>`;
}

/* ─────────────────────────────────────────────────────────────────
   REPORT CARD — PRIMARY (English)  (Part 7.2)
   ───────────────────────────────────────────────────────────────── */

/**
 * Build a single Primary report card HTML string.
 * Printed A4 portrait. One student per page.
 *
 * @param {Object} reportData   - from buildStudentReportData()
 * @param {Object} term         - term row
 * @param {Object} academicYear - academic_year row
 * @param {string} phase        - 'pre_midterm' | 'post_midterm'
 */
function buildPrimaryReportCard(reportData, term, academicYear, phase) {
    const s = state.schoolSettings || {};
    const student = reportData.student;
    const cls = getClass(student.class_id);
    const str = REPORT_STRINGS.primary;
    const phaseLabel = phase === 'pre_midterm' ? str.pre_midterm : str.post_midterm;
    const today = fmtDate(todayISO());
    const passMark = getPassMark();

    // QR code
    const { src: qrSrc, url: qrUrl } = generateQRCode(
        student.code,
        term.term_number,
        academicYear.id
    );

    // Decision banner
    const decision = getPromotionDecision(reportData.gTotPct ?? 0, cls?.name || '');

    // Subject rows
    const subjectRows = reportData.subjectRows.map(r => `
        <tr>
            <td class="subject-name">${esc(r.subject.name)}</td>
            <td class="score-cell ${cellStyle(r.mg, r.subject.mg_max) ? '' : ''}"
                style="${cellStyle(r.mg, r.subject.mg_max)}">${r.mg !== null ? fmtScore(r.mg) : '—'}</td>
            <td class="score-cell"
                style="${phase === 'post_midterm' ? cellStyle(r.ex, r.subject.ex_max) : ''}">${phase === 'post_midterm' && r.ex !== null ? fmtScore(r.ex) : '—'}</td>
            <td class="score-cell tot-cell"
                style="${r.tot !== null ? cellStyle(r.tot, Number(r.subject.mg_max) + Number(r.subject.ex_max)) : ''}">${r.tot !== null ? fmtScore(r.tot) : '—'}</td>
            <td>${r.pct !== null ? fmtPct(r.pct, 0) : '—'}</td>
            <td class="grade-cell">${esc(r.grade)}</td>
            <td>${r.isPassing ? 'Pass' : r.pct !== null ? 'Fail' : '—'}</td>
        </tr>`).join('');

    return `
    <div class="report-card page-break-inside-avoid">
        <!-- Header -->
        <div class="report-header">
            <div class="report-logo">${getSchoolLogoHtml(s.school_logo || '', '52px')}</div>
            <div class="report-header-text">
                <h2>${esc(s.school_name || SCHOOL_DEFAULTS.school_name)}</h2>
                <h3>${esc(phaseLabel)}</h3>
                <p>${esc(s.school_motto || SCHOOL_DEFAULTS.school_motto)}</p>
            </div>
        </div>

        <!-- Student info grid -->
        <div class="report-info">
            <div class="report-info-item"><strong>Student Name</strong><span>${esc(student.first_name)} ${esc(student.last_name)}</span></div>
            <div class="report-info-item"><strong>Code</strong><span>${esc(student.code)}</span></div>
            <div class="report-info-item"><strong>Class</strong><span>${esc(cls?.name || '—')}</span></div>
            <div class="report-info-item"><strong>Term</strong><span>Term ${esc(String(term.term_number))} — ${esc(academicYear.year_name)}</span></div>
            <div class="report-info-item"><strong>Gender</strong><span>${esc(student.gender || '—')}</span></div>
            <div class="report-info-item"><strong>Rank</strong><span>${reportData.rank ? ordinal(reportData.rank) + ' / ' + reportData.classSize : '—'}</span></div>
        </div>

        <!-- Subjects table -->
        <table class="report-subjects">
            <thead>
                <tr>
                    <th style="text-align:left;width:26%">Subject</th>
                    <th>MG / ${passMark}</th>
                    <th>EX / ${passMark}</th>
                    <th>Total</th>
                    <th>%</th>
                    <th>Grade</th>
                    <th>Result</th>
                </tr>
            </thead>
            <tbody>${subjectRows}</tbody>
            <tfoot>
                <tr class="total-row">
                    <td><strong>TOTAL</strong></td>
                    <td colspan="2"></td>
                    <td><strong>${reportData.gTot !== null ? fmtScore(reportData.gTot) : '—'} / ${reportData.gTotMax}</strong></td>
                    <td><strong>${reportData.gTotPct !== null ? fmtPct(reportData.gTotPct, 1) : '—'}</strong></td>
                    <td><strong>${esc(getGrade(reportData.gTotPct ?? null))}</strong></td>
                    <td><strong>${reportData.isPassing ? 'PASS' : reportData.gTotPct !== null ? 'FAIL' : '—'}</strong></td>
                </tr>
            </tfoot>
        </table>

        <!-- Summary bar -->
        <div class="report-summary">
            <div><div class="summary-label">Total Score</div><div class="summary-value">${reportData.gTot !== null ? fmtScore(reportData.gTot) : '—'}</div></div>
            <div><div class="summary-label">Percentage</div><div class="summary-value">${reportData.gTotPct !== null ? fmtPct(reportData.gTotPct, 1) : '—'}</div></div>
            <div><div class="summary-label">Grade</div><div class="summary-value">${esc(getGrade(reportData.gTotPct ?? null))}</div></div>
            <div><div class="summary-label">Rank</div><div class="summary-value">${reportData.rank ? ordinal(reportData.rank) : '—'}</div></div>
            <div><div class="summary-label">Class Size</div><div class="summary-value">${reportData.classSize}</div></div>
            <div><div class="summary-label">Pass Mark</div><div class="summary-value">${passMark}%</div></div>
        </div>

        <!-- Decision banner -->
        <div class="report-footer">
            <div class="decision-banner ${decision.decision.toLowerCase()}">
                ${esc(decision.label)}
                ${decision.decision === 'PROMOTED' ? ` — ${esc(CLASS_PROGRESSION[cls?.code] || '')}` : ''}
            </div>

            <!-- Signatures + QR -->
            <div class="report-qr-block">
                <div class="qr-info">
                    <strong>Verification QR</strong><br>
                    Scan to verify this report<br>
                    ${esc(student.code)} · Term ${esc(String(term.term_number))}
                </div>
                <div class="qr-image">
                    ${qrSrc
            ? `<img src="${qrSrc}" alt="QR Code" width="64" height="64">`
            : qrPlaceholderSVG(64)}
                </div>
            </div>

            <div class="signature-grid">
                <div class="sig-label">Class Teacher</div>
                <div class="sig-line"></div>
                <div class="sig-label">Head of School</div>
                <div class="sig-line"></div>
                <div class="sig-label">Parent / Guardian</div>
                <div class="sig-line"></div>
            </div>

            <p style="margin-top:10px;font-size:8pt;color:#6b5f56;text-align:center;">
                ${esc(s.report_footer_line1 || SCHOOL_DEFAULTS.report_footer_line1)}<br>
                ${esc(s.report_footer_line2 || SCHOOL_DEFAULTS.report_footer_line2)}
            </p>
        </div>
    </div>`;
}

/**
 * Print report cards for an array of students.
 * @param {Array}  reportDataArray - from buildStudentReportData() per student
 * @param {Object} term
 * @param {Object} academicYear
 * @param {string} phase
 */
function printPrimaryReportCards(reportDataArray, term, academicYear, phase) {
    if (!reportDataArray || reportDataArray.length === 0) {
        showToast('No report data to print.', 'warning'); return;
    }
    const cards = reportDataArray.map(rd =>
        buildPrimaryReportCard(rd, term, academicYear, phase)
    ).join('<div class="page-break-after"></div>');

    openPrintWindow(cards, `Report Cards — Term ${term.term_number}`,
        'css/print/report-cards-print.css');
}

/* ─────────────────────────────────────────────────────────────────
   REPORT CARD — NURSERY (French)  (Part 7.1)
   ───────────────────────────────────────────────────────────────── */

/**
 * Build a single Nursery report card HTML string (French).
 */
function buildNurseryReportCard(reportData, term, academicYear, phase) {
    const s = state.schoolSettings || {};
    const student = reportData.student;
    const cls = getClass(student.class_id);
    const str = REPORT_STRINGS.nursery;
    const phaseLabel = phase === 'pre_midterm' ? str.pre_midterm : str.post_midterm;
    const clsNameFr = NURSERY_FR_LABELS[cls?.name] || cls?.name || '—';

    const { src: qrSrc } = generateQRCode(
        student.code, term.term_number, academicYear.id
    );

    const decision = getPromotionDecision(reportData.gTotPct ?? 0, cls?.name || '');

    const subjectRows = reportData.subjectRows.map(r => `
        <tr>
            <td class="subject-name">${esc(r.subject.name)}</td>
            <td class="score-cell" style="${cellStyle(r.mg, r.subject.mg_max)}">${r.mg !== null ? fmtScore(r.mg) : '—'}</td>
            <td class="score-cell" style="${phase === 'post_midterm' ? cellStyle(r.ex, r.subject.ex_max) : ''}">${phase === 'post_midterm' && r.ex !== null ? fmtScore(r.ex) : '—'}</td>
            <td class="score-cell tot-cell" style="${r.tot !== null ? cellStyle(r.tot, Number(r.subject.mg_max) + Number(r.subject.ex_max)) : ''}">${r.tot !== null ? fmtScore(r.tot) : '—'}</td>
            <td>${esc(r.grade)}</td>
        </tr>`).join('');

    return `
    <div class="report-card page-break-inside-avoid">
        <div class="report-header" style="background:#2d1f3a;">
            <div class="report-logo">${getSchoolLogoHtml(s.school_logo || '', '52px')}</div>
            <div class="report-header-text">
                <h2>${esc(s.school_name || SCHOOL_DEFAULTS.school_name)}</h2>
                <h3>${esc(phaseLabel)}</h3>
                <p style="font-size:9pt;">SECTION MATERNELLE</p>
            </div>
        </div>

        <div class="report-info">
            <div class="report-info-item"><strong>Nom de l'élève</strong><span>${esc(student.first_name)} ${esc(student.last_name)}</span></div>
            <div class="report-info-item"><strong>Code</strong><span>${esc(student.code)}</span></div>
            <div class="report-info-item"><strong>Classe</strong><span>${esc(clsNameFr)}</span></div>
            <div class="report-info-item"><strong>Trimestre</strong><span>Trimestre ${esc(String(term.term_number))} — ${esc(academicYear.year_name)}</span></div>
            <div class="report-info-item"><strong>Sexe</strong><span>${esc(student.gender || '—')}</span></div>
            <div class="report-info-item"><strong>Rang</strong><span>${reportData.rank ? ordinal(reportData.rank) + ' / ' + reportData.classSize : '—'}</span></div>
        </div>

        <table class="report-subjects">
            <thead>
                <tr>
                    <th style="text-align:left;width:30%">MATIÈRES</th>
                    <th>NOTE / 50</th>
                    <th>CÔTE / 50</th>
                    <th>TOTAL</th>
                    <th>APPRÉCIATION</th>
                </tr>
            </thead>
            <tbody>${subjectRows}</tbody>
            <tfoot>
                <tr class="total-row">
                    <td><strong>TOTAL DES POINTS</strong></td>
                    <td colspan="2"></td>
                    <td><strong>${reportData.gTot !== null ? fmtScore(reportData.gTot) : '—'} / ${reportData.gTotMax}</strong></td>
                    <td><strong>${esc(getGrade(reportData.gTotPct ?? null))}</strong></td>
                </tr>
            </tfoot>
        </table>

        <div class="report-summary">
            <div><div class="summary-label">Total</div><div class="summary-value">${reportData.gTot !== null ? fmtScore(reportData.gTot) : '—'}</div></div>
            <div><div class="summary-label">Moyenne</div><div class="summary-value">${reportData.gTotPct !== null ? fmtPct(reportData.gTotPct, 1) : '—'}</div></div>
            <div><div class="summary-label">Appréciation</div><div class="summary-value">${esc(getGrade(reportData.gTotPct ?? null))}</div></div>
            <div><div class="summary-label">Rang</div><div class="summary-value">${reportData.rank ? ordinal(reportData.rank) : '—'}</div></div>
        </div>

        <div class="report-footer">
            <div class="decision-banner ${decision.decision.toLowerCase()}" style="font-size:9pt;">
                ${esc(decision.labelFr || decision.label)}
                ${decision.decision === 'PROMOTED' ? ` en ${esc(NURSERY_FR_LABELS[CLASS_PROGRESSION[cls?.code]] || CLASS_PROGRESSION[cls?.code] || '')}` : ''}
            </div>

            <div class="report-qr-block">
                <div class="qr-info">
                    <strong>Code de Vérification</strong><br>
                    Scanner pour vérifier<br>
                    ${esc(student.code)}
                </div>
                <div class="qr-image">
                    ${qrSrc
            ? `<img src="${qrSrc}" alt="QR" width="64" height="64">`
            : qrPlaceholderSVG(64)}
                </div>
            </div>

            <div class="signature-grid">
                <div class="sig-label">Maîtresse de Classe</div>
                <div class="sig-line"></div>
                <div class="sig-label">Directeur / Directrice</div>
                <div class="sig-line"></div>
                <div class="sig-label">Parent / Tuteur</div>
                <div class="sig-line"></div>
            </div>

            <p style="margin-top:10px;font-size:8pt;color:#6b5f56;text-align:center;">
                ${esc(s.report_footer_line1 || SCHOOL_DEFAULTS.report_footer_line1)}<br>
                ${esc(s.report_footer_line2 || SCHOOL_DEFAULTS.report_footer_line2)}
            </p>
        </div>
    </div>`;
}

/* ─────────────────────────────────────────────────────────────────
   RECEIPT — A4  (Part 9)
   ───────────────────────────────────────────────────────────────── */

/**
 * Build the HTML for a full A4 payment receipt.
 *
 * @param {Object} payment   - payments row
 * @param {Object} student   - students row
 * @param {Array}  lineItems - from validatePaymentLineItems() or payment_allocations
 * @param {number} total
 */
function buildReceiptA4(payment, student, lineItems, total) {
    const s = state.schoolSettings || {};
    const receiptNo = payment.receipt_number || `RCP-${payment.id}`;
    const date = fmtDate(payment.payment_date || todayISO());
    const method = payment.payment_method || '—';
    const cls = getClass(student.class_id);
    const term = getTerm(payment.term_id);
    const year = getAcadYear(payment.academic_year_id);

    const feeRows = lineItems.map(item => `
        <tr>
            <td>${esc(item.feeName || item.fee_name || '—')}</td>
            <td style="text-align:right">${fmtCurrency(item.owed || item.amount || 0)}</td>
            <td style="text-align:right">${fmtCurrency(item.allocated || item.amount || 0)}</td>
        </tr>`).join('');

    return `
    <div class="receipt-container">
        ${buildPrintLetterhead('PAYMENT RECEIPT',
        `${esc(year?.year_name || '')}${term ? ' · Term ' + term.term_number : ''}`)}

        <div class="receipt-info">
            <div class="info-row"><span class="label">Receipt No.</span>
                <span class="value" style="font-family:monospace;font-weight:700">${esc(receiptNo)}</span></div>
            <div class="info-row"><span class="label">Date</span><span class="value">${esc(date)}</span></div>
            <div class="info-row"><span class="label">Student Name</span>
                <span class="value">${esc(student.first_name)} ${esc(student.last_name)}</span></div>
            <div class="info-row"><span class="label">Student Code</span><span class="value">${esc(student.code)}</span></div>
            <div class="info-row"><span class="label">Class</span><span class="value">${esc(cls?.name || '—')}</span></div>
            <div class="info-row"><span class="label">Payment Method</span><span class="value">${esc(method)}</span></div>
        </div>

        <table class="receipt-fees">
            <thead><tr><th>Description</th><th style="text-align:right">Balance</th><th style="text-align:right">Paid</th></tr></thead>
            <tbody>${feeRows}</tbody>
        </table>

        <div class="receipt-amount-box">
            <div class="amount-label">TOTAL AMOUNT PAID</div>
            <div class="amount-value">${fmtCurrency(total)}</div>
            <div class="amount-words">${amountInWords(total)}</div>
        </div>

        ${payment.notes ? `<p style="font-size:9pt;color:#6b5f56;margin:8px 0;">Notes: ${esc(payment.notes)}</p>` : ''}

        <div class="receipt-signatures">
            <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Cashier / Accountant</div>
                <div class="sig-name">${esc(state.currentUser?.name || '')}</div>
            </div>
            <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Head of School</div>
                <div class="sig-name">${esc(s.report_footer_line2 || SCHOOL_DEFAULTS.report_footer_line2)}</div>
            </div>
        </div>

        <div class="receipt-footer">
            <div class="footer-school">${esc(s.school_name || SCHOOL_DEFAULTS.school_name)}</div>
            ${esc(s.school_location || '')} · ${esc(s.school_phone || '')}
        </div>
    </div>`;
}

/**
 * Build an 80mm thermal receipt.
 */
function buildReceiptThermal(payment, student, lineItems, total) {
    const receiptNo = payment.receipt_number || `RCP-${payment.id}`;
    const date = fmtDate(payment.payment_date || todayISO());
    const s = state.schoolSettings || {};

    const feeRows = lineItems.map(item =>
        `<div class="info-row">
            <span class="label">${esc(item.feeName || item.fee_name || '—')}</span>
            <span class="value">${fmtCurrency(item.allocated || 0)}</span>
        </div>`
    ).join('');

    return `
    <div class="receipt-thermal">
        <div class="receipt-header">
            <div class="school-name">${esc(s.school_name || APP_NAME)}</div>
            <div>${esc(s.school_location || '')}</div>
            <div class="receipt-title">PAYMENT RECEIPT</div>
            <div class="receipt-number">${esc(receiptNo)}</div>
        </div>
        <div class="receipt-body">
            <div class="info-row"><span class="label">Date</span><span class="value">${esc(date)}</span></div>
            <div class="info-row"><span class="label">Student</span>
                <span class="value">${esc(student.first_name)} ${esc(student.last_name)}</span></div>
            <div class="info-row"><span class="label">Code</span><span class="value">${esc(student.code)}</span></div>
            <div class="info-row"><span class="label">Method</span>
                <span class="value">${esc(payment.payment_method || '—')}</span></div>
            <div class="divider"></div>
            ${feeRows}
            <div class="divider"></div>
            <div class="total-row">
                <span class="total-label">TOTAL</span>
                <span class="total-amount">${fmtCurrency(total)}</span>
            </div>
        </div>
        <div class="receipt-footer">
            <div class="thanks">THANK YOU</div>
            ${esc(s.school_name || APP_NAME)}
        </div>
    </div>`;
}

/**
 * Print a payment receipt.
 * @param {Object}  payment
 * @param {Object}  student
 * @param {Array}   lineItems
 * @param {number}  total
 * @param {boolean} [thermal] - true for 80mm thermal format
 */
function printReceipt(payment, student, lineItems, total, thermal = false) {
    const html = thermal
        ? buildReceiptThermal(payment, student, lineItems, total)
        : buildReceiptA4(payment, student, lineItems, total);

    openPrintWindow(html,
        `Receipt ${payment.receipt_number || ''}`,
        thermal ? 'css/print/receipts-thermal-print.css' : 'css/print/receipts-print.css'
    );
}

/* ─────────────────────────────────────────────────────────────────
   STUDENT STATEMENT
   ───────────────────────────────────────────────────────────────── */

/**
 * Build and print a student account statement.
 *
 * @param {Object} student
 * @param {Array}  studentFees     - all student_fee rows for this student + year
 * @param {Array}  payments        - all payment rows for this student
 * @param {number} creditBalance
 * @param {Object} academicYear
 */
function printStudentStatement(student, studentFees, payments, creditBalance, academicYear) {
    const cls = getClass(student.class_id);
    const summary = computeStudentFeeSummary(studentFees, creditBalance);
    const today = fmtDate(todayISO());

    // Build ledger: combine fees and payments in chronological order
    const ledger = [
        ...studentFees.map(f => ({
            date: f.created_at?.split('T')[0] || '',
            desc: `Fee: ${f.fee_name || '—'}`,
            debit: Number(f.amount || 0) - Number(f.waived_amount || 0),
            credit: 0,
            type: 'fee',
        })),
        ...payments.map(p => ({
            date: p.payment_date || '',
            desc: `Payment (${p.payment_method || '—'}) — ${p.receipt_number || ''}`,
            debit: 0,
            credit: Number(p.total_amount || 0),
            type: 'payment',
        })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1));

    // Compute running balance
    let running = 0;
    const rows = ledger.map(item => {
        running += item.debit - item.credit;
        return `<tr>
            <td>${esc(fmtDate(item.date))}</td>
            <td>${esc(item.desc)}</td>
            <td style="text-align:right">${item.debit ? fmtCurrency(item.debit) : '—'}</td>
            <td style="text-align:right">${item.credit ? fmtCurrency(item.credit) : '—'}</td>
            <td style="text-align:right;font-weight:600;color:${running > 0 ? '#c44536' : '#2d6a4f'}">
                ${fmtCurrency(Math.abs(running))} ${running > 0 ? 'DR' : 'CR'}
            </td>
        </tr>`;
    }).join('');

    const html = `
    <div class="statement-container">
        ${buildPrintLetterhead('STUDENT STATEMENT OF ACCOUNT',
        `${esc(academicYear?.year_name || '')} · Printed: ${today}`)}

        <div class="statement-student">
            <div class="s-field"><span class="s-label">Student Name</span>
                <span class="s-value">${esc(student.first_name)} ${esc(student.last_name)}</span></div>
            <div class="s-field"><span class="s-label">Code</span><span class="s-value">${esc(student.code)}</span></div>
            <div class="s-field"><span class="s-label">Class</span><span class="s-value">${esc(cls?.name || '—')}</span></div>
            <div class="s-field"><span class="s-label">Academic Year</span>
                <span class="s-value">${esc(academicYear?.year_name || '—')}</span></div>
        </div>

        <table class="statement-table">
            <thead><tr>
                <th>Date</th><th>Description</th>
                <th style="text-align:right">Debit</th>
                <th style="text-align:right">Credit</th>
                <th style="text-align:right">Balance</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>

        <div class="statement-balance">
            <div class="balance-box">
                <div class="b-label">OUTSTANDING BALANCE</div>
                <div class="b-amount ${summary.outstanding <= 0 ? 'settled' : 'owing'}">
                    ${fmtCurrency(summary.outstanding)}
                </div>
                <div class="b-words">${amountInWords(summary.outstanding)}</div>
            </div>
        </div>

        <div class="statement-footer">
            <div class="footer-school">${esc(state.schoolSettings?.school_name || APP_NAME)}</div>
        </div>
    </div>`;

    openPrintWindow(html, `Statement — ${student.first_name} ${student.last_name}`,
        'css/print/statements-print.css');
}

/* ─────────────────────────────────────────────────────────────────
   ATTENDANCE SHEET
   ───────────────────────────────────────────────────────────────── */

/**
 * Print a blank or filled attendance sheet for a class.
 *
 * @param {Object}  cls         - class row
 * @param {Array}   students    - students in the class
 * @param {string}  dateLabel   - e.g. '14 Jun 2025' or 'Week 12'
 * @param {Array}   [records]   - existing attendance records (optional)
 */
function printAttendanceSheet(cls, students, dateLabel, records = []) {
    const recordMap = {};
    records.forEach(r => { recordMap[r.student_id] = r.status; });

    const rows = students.map((s, idx) => {
        const status = recordMap[s.id] || '';
        return `<tr>
            <td>${idx + 1}</td>
            <td style="text-align:left">${esc(s.last_name)}, ${esc(s.first_name)}</td>
            <td>${esc(s.code)}</td>
            ${ATTENDANCE_CODES.map(code =>
            `<td style="text-align:center;font-weight:700;${status === code ? 'background:#e8f4ee;' : ''}">${status === code ? code : ''}</td>`
        ).join('')}
            <td></td>
        </tr>`;
    }).join('');

    const term = getActiveTerm();
    const year = getActiveYear();

    const html = `
    <div class="attendance-print-container">
        <div class="att-header">
            <div>
                <div class="school-name">${esc(state.schoolSettings?.school_name || APP_NAME)}</div>
                <div class="att-title">ATTENDANCE REGISTER — ${esc(cls?.name || '—')}</div>
            </div>
            <div class="att-meta">
                ${esc(dateLabel)}<br>
                Term ${esc(String(term?.term_number || '—'))} · ${esc(year?.year_name || '')}
            </div>
        </div>

        <table class="att-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th style="text-align:left">Student Name</th>
                    <th>Code</th>
                    ${ATTENDANCE_CODES.map(c => `<th>${c}</th>`).join('')}
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>

        <div class="att-legend">
            ${ATTENDANCE_CODES.map(c =>
        `<div class="legend-item">
                    <span class="legend-dot ${c.toLowerCase()}"></span>
                    <span>${c} = ${ATTENDANCE_LABELS[c]}</span>
                </div>`
    ).join('')}
        </div>

        <div class="print-footer">
            <span class="left">Teacher: ___________________________</span>
            <span class="center">${esc(state.schoolSettings?.school_name || '')}</span>
            <span class="right page-number"></span>
        </div>
    </div>`;

    openPrintWindow(html, `Attendance — ${cls?.name}`,
        'css/print/marksheets-print.css');
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.openPrintWindow = openPrintWindow;
window.printElement = printElement;
window.buildPrintLetterhead = buildPrintLetterhead;
window.buildPrimaryReportCard = buildPrimaryReportCard;
window.buildNurseryReportCard = buildNurseryReportCard;
window.printPrimaryReportCards = printPrimaryReportCards;
window.buildReceiptA4 = buildReceiptA4;
window.buildReceiptThermal = buildReceiptThermal;
window.printReceipt = printReceipt;
window.printStudentStatement = printStudentStatement;
window.printAttendanceSheet = printAttendanceSheet;