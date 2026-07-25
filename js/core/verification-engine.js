/* ═══════════════════════════════════════════════════════════════════
   js/core/verification-engine.js
   ═══════════════════════════════════════════════════════════════════
   Purpose : Create verification tokens and frozen snapshots for every
             printable document (report cards, receipts, transcripts).
             The token is encoded in the QR code URL. When scanned,
             the verification page looks up the token, reads the
             frozen snapshot, builds a PDF from it, and auto-downloads
             it — never touching live data.

   Token URL format:
     https://portal.ecolelafontaine.rw/qr-verify.html?v={UUID_TOKEN}

   Tables written:
     verifications          — one row per generated document
     report_card_snapshots  — frozen academic data at print time
     receipt_snapshots      — frozen payment data at print time
     transcript_snapshots   — frozen multi-term data at print time

   Load order: AFTER api.js, state.js, academic-formulas.js,
               finance-formulas.js, utils.js.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   TOKEN GENERATION
   ───────────────────────────────────────────────────────────────── */

/**
 * Generate a cryptographically random UUID token.
 * Uses crypto.randomUUID() (supported in all modern browsers).
 * Falls back to a manual UUID-v4 generation for older targets.
 */
function generateVerificationToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback: manual UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Build the full QR verification URL for a token.
 * @param {string} token - UUID token
 * @returns {string} full URL to encode in QR code
 */
function buildTokenUrl(token) {
    const base = QR_CONFIG?.verifyBaseUrl || (window.location.origin + '/qr-verify.html');
    return `${base}?v=${encodeURIComponent(token)}`;
}

/**
 * Generate a standardised download filename.
 * Format: {LastName}_{FirstName}_{DocType}_{YYMMDD}_{NNNN}.pdf
 * Example: GANZA_KING_ReportCard_260626_0045.pdf
 *
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} docType   - 'ReportCard' | 'Receipt' | 'Transcript'
 * @param {string} [receiptNumber] - for receipts, used as NNNN suffix
 */
function buildDownloadFilename(firstName, lastName, docType, receiptNumber = null) {
    const now    = new Date();
    const yy     = String(now.getFullYear()).slice(2);
    const mm     = String(now.getMonth() + 1).padStart(2, '0');
    const dd     = String(now.getDate()).padStart(2, '0');
    const datePart = `${yy}${mm}${dd}`;

    const nnnn = receiptNumber
        ? String(receiptNumber).replace(/[^0-9]/g, '').slice(-4).padStart(4, '0')
        : String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

    const safeLast  = (lastName  || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20);
    const safeFirst = (firstName || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 15);

    return `${safeLast}_${safeFirst}_${docType}_${datePart}_${nnnn}.pdf`;
}

/* ─────────────────────────────────────────────────────────────────
   VERIFICATION ROW WRITER
   ───────────────────────────────────────────────────────────────── */

/**
 * Insert one row into the verifications table.
 * @param {Object} opts
 * @returns {Promise<string>} the token saved
 */
async function _saveVerification({ token, docType, snapshotId, studentId }) {
    await insert('verifications', {
        token,
        document_type    : docType,          // 'report_card' | 'receipt' | 'transcript'
        document_id      : snapshotId,
        student_id       : studentId || null,
        generated_at     : new Date().toISOString(),
        scan_count       : 0,
        last_scanned_at  : null,
        is_valid         : true,
        created_by       : state.currentUser?.id || null,
    });
    return token;
}

/* ─────────────────────────────────────────────────────────────────
   REPORT CARD SNAPSHOT
   ───────────────────────────────────────────────────────────────── */

/**
 * Freeze a report card snapshot and return a token URL for the QR code.
 *
 * Call this at print time, BEFORE rendering the PDF.
 * The snapshot stores all calculated data so the QR always shows
 * the data as it was on the day the report card was printed.
 *
 * @param {Object} reportData   - from buildStudentReportData()
 * @param {Object} term         - term row
 * @param {Object} academicYear - academic_year row
 * @param {string} phase        - 'pre_midterm' | 'post_midterm' | 'annual'
 * @param {Object} [attendance] - { total, present, absent, late, rate }
 * @param {string} [teacherComment]
 * @param {Object} [annualData] - for annual phase, from calcAnnualTotals()
 * @returns {Promise<{ token: string, url: string, filename: string }>}
 */
async function createReportCardSnapshot(
    reportData, term, academicYear, phase,
    attendance = null, teacherComment = '',
    annualData = null
) {
    const token   = generateVerificationToken();
    const student = reportData.student;
    const cls     = getClass(student.class_id);
    const s       = state.schoolSettings || {};
    const now     = new Date().toISOString();

    // Build subjects JSONB — full assessment breakdown
    const subjectsJson = (reportData.subjectRows || []).map(row => ({
        id         : row.subject.id,
        name       : row.subject.name,
        code       : row.subject.code || '',
        mg         : row.mg,
        ex         : row.ex,
        total      : row.tot,
        max        : (Number(row.subject.mg_max || 0) + Number(row.subject.ex_max || 0)),
        mg_max     : row.subject.mg_max,
        ex_max     : row.subject.ex_max,
        percentage : row.pct,
        grade      : row.grade,
        isPassing  : row.isPassing,
        assessments: (row.assessments || []).map(a => ({
            type : a.name || a.type || '',
            score: a.score,
            max  : a.max_score,
            pct  : a.max_score > 0 ? Math.round((a.score / a.max_score) * 1000) / 10 : 0,
            grade: getGrade(a.max_score > 0 ? (a.score / a.max_score) * 100 : null),
            kind : a.kind || 'mg', // 'mg' | 'midterm' | 'ex'
        })),
    }));

    // Totals JSONB
    const totalsJson = {
        mg         : reportData.gTot !== null ? (phase === 'post_midterm'
            ? (reportData.subjectRows || []).reduce((s, r) => s + Number(r.mg || 0), 0)
            : reportData.gTot) : null,
        ex         : phase === 'post_midterm'
            ? (reportData.subjectRows || []).reduce((s, r) => s + Number(r.ex || 0), 0)
            : null,
        grand      : reportData.gTot,
        max        : reportData.gTotMax,
        percentage : reportData.gTotPct,
        grade      : getGrade(reportData.gTotPct),
    };

    // Promotion decision
    const decision = getPromotionDecision(reportData.gTotPct ?? 0, cls?.name || '');

    // Annual data if applicable
    const annualJson = annualData ? {
        perTerm          : annualData.perTerm,
        perSubjectAnnual : annualData.perSubjectAnnual,
        annualGTot       : annualData.annualGTot,
        annualGTotMax    : annualData.annualGTotMax,
        annualPct        : annualData.annualPct,
    } : null;

    // Insert snapshot
    const snapshotRow = await insert('report_card_snapshots', {
        student_id          : student.id,
        class_id            : student.class_id,
        term_id             : term?.id || null,
        academic_year_id    : academicYear?.id || null,
        report_type         : phase,
        student_name        : `${student.first_name} ${student.last_name}`.trim(),
        student_code        : student.code,
        student_first_name  : student.first_name,
        student_last_name   : student.last_name,
        student_dob         : student.date_of_birth || null,
        student_gender      : student.gender || null,
        guardian_name       : student.parent_name || null,
        guardian_phone      : student.parent_contact || null,
        class_name          : cls?.name || '',
        term_name           : term ? `Term ${term.term_number}` : '',
        term_number         : term?.term_number || null,
        year_name           : academicYear?.year_name || '',
        phase,
        is_nursery          : cls?.level === 'nursery',
        subjects            : subjectsJson,
        totals              : totalsJson,
        annual_data         : annualJson,
        rank                : reportData.rank ? `${ordinal(reportData.rank)} of ${reportData.classSize}` : null,
        rank_number         : reportData.rank || null,
        class_size          : reportData.classSize || 0,
        overall_grade       : getGrade(reportData.gTotPct),
        overall_percentage  : reportData.gTotPct,
        is_passing          : reportData.isPassing,
        attendance          : attendance || null,
        teacher_comment     : teacherComment || null,
        promotion_decision  : decision?.decision || null,
        promotion_label     : decision?.label || null,
        head_teacher_name   : s.head_teacher_name || s.school_head || '',
        school_name         : s.school_name || 'ECOLE LA FONTAINE',
        school_address      : s.school_location || 'Rubavu, Rwanda',
        school_phone        : s.school_phone || '',
        school_email        : s.school_email || '',
        school_logo         : s.school_logo || null,
        school_motto        : s.school_motto || '',
        school_footer_1     : s.report_footer_line1 || '',
        school_footer_2     : s.report_footer_line2 || '',
        generated_at        : now,
        created_by          : state.currentUser?.id || null,
        is_locked           : true,
    });

    if (!snapshotRow?.id) throw new Error('Failed to save report card snapshot.');

    await _saveVerification({
        token,
        docType    : 'report_card',
        snapshotId : snapshotRow.id,
        studentId  : student.id,
    });

    const url      = buildTokenUrl(token);
    const filename = buildDownloadFilename(
        student.first_name, student.last_name,
        phase === 'annual' ? 'AnnualReport' : 'ReportCard'
    );

    return { token, url, filename, snapshotId: snapshotRow.id };
}

/* ─────────────────────────────────────────────────────────────────
   RECEIPT SNAPSHOT
   ───────────────────────────────────────────────────────────────── */

/**
 * Freeze a receipt snapshot and return a token URL.
 *
 * @param {Object} payment    - payment row
 * @param {Object} student    - student row
 * @param {Array}  lineItems  - [{feeId, feeName, owed, allocated}]
 * @param {number} total      - total amount paid
 * @returns {Promise<{ token, url, filename }>}
 */
async function createReceiptSnapshot(payment, student, lineItems, total) {
    const token  = generateVerificationToken();
    const cls    = getClass(student.class_id);
    const term   = getTerm(payment.term_id);
    const year   = getAcadYear(payment.academic_year_id);
    const s      = state.schoolSettings || {};
    const now    = new Date().toISOString();

    // Full fee status at time of payment
    const yearId  = payment.academic_year_id || getActiveYearId();
    const allFees = (state.studentFees || []).filter(f =>
        f.student_id === student.id && f.academic_year_id === yearId
    );
    const summary = computeStudentFeeSummary(allFees, 0);

    const feesJson = allFees.map(f => {
        const bal = computeFeeBalance(f);
        return {
            category  : f.fee_name || '—',
            amount    : bal.amount,
            waived    : bal.waived,
            paid      : bal.paid,
            balance   : bal.remaining,
            status    : getFeeStatusDisplay(f).label,
            due_date  : f.due_date || null,
        };
    });

    // Line items for THIS payment only
    const lineItemsJson = lineItems.map(li => ({
        fee_name  : li.feeName || li.fee_name || '—',
        owed      : li.owed || 0,
        allocated : li.allocated || li.amount || 0,
    }));

    const snapshotRow = await insert('receipt_snapshots', {
        receipt_number      : payment.receipt_number || '',
        student_id          : student.id,
        student_name        : `${student.first_name} ${student.last_name}`.trim(),
        student_first_name  : student.first_name,
        student_last_name   : student.last_name,
        student_code        : student.code,
        class_name          : cls?.name || '',
        guardian_name       : student.parent_name || null,
        guardian_phone      : student.parent_contact || null,
        term_id             : payment.term_id || null,
        term_name           : term ? `Term ${term.term_number}` : '',
        academic_year_id    : payment.academic_year_id || null,
        year_name           : year?.year_name || '',
        amount              : Number(total || 0),
        amount_in_words     : amountInWords(Math.round(total || 0)),
        payment_method      : payment.payment_method || '—',
        payment_date        : payment.payment_date || now.split('T')[0],
        reference_number    : payment.reference || null,
        fees                : feesJson,
        line_items          : lineItemsJson,
        total_fees          : summary.effective,
        total_paid          : summary.paid + Number(total || 0),   // after this payment
        outstanding_balance : Math.max(0, summary.outstanding - Number(total || 0)),
        notes               : payment.notes || null,
        recorded_by         : state.currentUser?.name || '',
        school_name         : s.school_name || 'ECOLE LA FONTAINE',
        school_address      : s.school_location || 'Rubavu, Rwanda',
        school_phone        : s.school_phone || '',
        school_email        : s.school_email || '',
        school_logo         : s.school_logo || null,
        head_teacher_name   : s.head_teacher_name || '',
        generated_at        : now,
    });

    if (!snapshotRow?.id) throw new Error('Failed to save receipt snapshot.');

    await _saveVerification({
        token,
        docType    : 'receipt',
        snapshotId : snapshotRow.id,
        studentId  : student.id,
    });

    const url      = buildTokenUrl(token);
    const filename = buildDownloadFilename(
        student.first_name, student.last_name, 'Receipt',
        payment.receipt_number
    );

    return { token, url, filename, snapshotId: snapshotRow.id };
}

/* ─────────────────────────────────────────────────────────────────
   TRANSCRIPT SNAPSHOT
   ───────────────────────────────────────────────────────────────── */

/**
 * Freeze a transcript snapshot and return a token URL.
 *
 * @param {Object} student
 * @param {Object} academicYear
 * @param {Object} annualData   - from calcAnnualTotals()
 * @param {Array}  subjects
 * @param {Array}  allTerms     - term rows for the year
 * @returns {Promise<{ token, url, filename }>}
 */
async function createTranscriptSnapshot(student, academicYear, annualData, subjects, allTerms) {
    const token = generateVerificationToken();
    const cls   = getClass(student.class_id);
    const s     = state.schoolSettings || {};
    const now   = new Date().toISOString();

    // Build terms JSONB with per-subject data per term
    const termsJson = allTerms.map(term => {
        const termResult = annualData.perTerm[term.id] || {};
        const termSubjects = subjects.map(sub => {
            const subData = termResult.perSubject?.[sub.id] || {};
            return {
                id         : sub.id,
                name       : sub.name,
                mg         : subData.mg ?? null,
                ex         : subData.ex ?? null,
                total      : subData.tot ?? null,
                max        : Number(sub.mg_max || 0) + Number(sub.ex_max || 0),
                percentage : subData.tot !== null
                    ? Math.round((subData.tot / (Number(sub.mg_max || 0) + Number(sub.ex_max || 0))) * 1000) / 10
                    : null,
                grade      : getGrade(subData.tot !== null
                    ? (subData.tot / (Number(sub.mg_max || 0) + Number(sub.ex_max || 0))) * 100
                    : null),
            };
        });

        return {
            term_id     : term.id,
            term_name   : `Term ${term.term_number}`,
            term_number : term.term_number,
            subjects    : termSubjects,
            g_tot       : termResult.gTot ?? null,
            g_tot_max   : termResult.maxTot ?? null,
            percentage  : termResult.gTotPct ?? null,
            grade       : getGrade(termResult.gTotPct ?? null),
        };
    });

    // Cumulative / annual totals
    const cumulativeJson = {
        annual_g_tot    : annualData.annualGTot,
        annual_g_tot_max: annualData.annualGTotMax,
        annual_pct      : annualData.annualPct,
        annual_grade    : getGrade(annualData.annualPct),
        per_subject     : annualData.perSubjectAnnual,
    };

    const snapshotRow = await insert('transcript_snapshots', {
        student_id          : student.id,
        student_name        : `${student.first_name} ${student.last_name}`.trim(),
        student_first_name  : student.first_name,
        student_last_name   : student.last_name,
        student_code        : student.code,
        academic_year_id    : academicYear?.id || null,
        year_name           : academicYear?.year_name || '',
        class_name          : cls?.name || '',
        class_level         : cls?.level || 'primary',
        terms               : termsJson,
        cumulative_totals   : cumulativeJson,
        overall_grade       : getGrade(annualData.annualPct),
        overall_percentage  : annualData.annualPct,
        school_name         : s.school_name || 'ECOLE LA FONTAINE',
        school_address      : s.school_location || 'Rubavu, Rwanda',
        school_logo         : s.school_logo || null,
        head_teacher_name   : s.head_teacher_name || '',
        generated_at        : now,
        created_by          : state.currentUser?.id || null,
    });

    if (!snapshotRow?.id) throw new Error('Failed to save transcript snapshot.');

    await _saveVerification({
        token,
        docType    : 'transcript',
        snapshotId : snapshotRow.id,
        studentId  : student.id,
    });

    const url      = buildTokenUrl(token);
    const filename = buildDownloadFilename(
        student.first_name, student.last_name, 'Transcript'
    );

    return { token, url, filename, snapshotId: snapshotRow.id };
}

/* ─────────────────────────────────────────────────────────────────
   TOKEN LOOKUP  (called by qr-verify.html)
   ───────────────────────────────────────────────────────────────── */

/**
 * Look up a token from the verifications table and return the
 * associated snapshot. Also increments scan_count.
 *
 * @param {string} token
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 * @returns {Promise<{ docType, snapshot, verification } | null>}
 */
async function lookupVerificationToken(token, supabaseUrl, supabaseKey) {
    async function dbGet(table, filter) {
        const url = `${supabaseUrl}/rest/v1/${table}?${filter}&limit=1`;
        const res = await fetch(url, {
            headers: {
                'apikey'       : supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
            },
        });
        if (!res.ok) throw new Error(`DB ${table} error ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
    }

    async function dbPatch(table, id, body) {
        const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
        await fetch(url, {
            method : 'PATCH',
            headers: {
                'apikey'       : supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type' : 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    // Fetch verification row
    const verif = await dbGet('verifications', `token=eq.${encodeURIComponent(token)}&select=*`);
    if (!verif) return null;
    if (!verif.is_valid) return { invalid: true, verif };

    // Increment scan count (fire and forget)
    dbPatch('verifications', verif.id, {
        scan_count     : (verif.scan_count || 0) + 1,
        last_scanned_at: new Date().toISOString(),
    }).catch(() => {});

    // Fetch the appropriate snapshot
    let snapshot = null;
    const snapshotTable = {
        report_card : 'report_card_snapshots',
        receipt     : 'receipt_snapshots',
        transcript  : 'transcript_snapshots',
    }[verif.document_type];

    if (snapshotTable) {
        snapshot = await dbGet(snapshotTable, `id=eq.${verif.document_id}&select=*`);
    }

    return {
        docType     : verif.document_type,
        snapshot,
        verification: verif,
        invalid     : false,
    };
}

/* ─────────────────────────────────────────────────────────────────
   EXPOSE
   ───────────────────────────────────────────────────────────────── */

window.generateVerificationToken  = generateVerificationToken;
window.buildTokenUrl              = buildTokenUrl;
window.buildDownloadFilename      = buildDownloadFilename;
window.createReportCardSnapshot   = createReportCardSnapshot;
window.createReceiptSnapshot      = createReceiptSnapshot;
window.createTranscriptSnapshot   = createTranscriptSnapshot;
window.lookupVerificationToken    = lookupVerificationToken;
