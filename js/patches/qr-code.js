/**
 * ECOLE LA FONTAINE — QR Code System
 * Generate QR codes for report cards, receipts, and verification
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year detection for report QR codes
 * - Added report type detection (welcoming, midterm, endterm, annual)
 * - QR payload now includes academic_year_id
 * - Shows appropriate term/phase based on report type
 * - Year indicator in QR display modal
 */

import {
    state,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getCurrentTerm,
    getTermsByYear
} from '../core/state.js';
import { getGrade, getGradeClass, getCurrentPhase } from '../core/formulas.js';
import { esc, fmtDate } from '../core/utils.js';
import { showModal, closeModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';

// ──────────────────────────────────────────────────────────────────────
// GENERATE QR CODE DATA URL
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a QR code as a base64 PNG data-URL
 * @param {string} text - Text to encode
 * @param {number} size - QR code size in pixels
 * @returns {string} Base64 data URL
 */
export function generateQRCodeDataURL(text, size = 150) {
    if (typeof QRCode === 'undefined') {
        console.warn('[QR] QRCode library not loaded');
        return '';
    }

    try {
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
        document.body.appendChild(container);

        new QRCode(container, {
            text: text,
            width: size,
            height: size,
            colorDark: '#0f2744',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
        });

        const canvas = container.querySelector('canvas');
        const dataURL = canvas ? canvas.toDataURL('image/png') : '';
        document.body.removeChild(container);
        return dataURL;
    } catch (e) {
        console.warn('[QR] Generation failed:', e);
        return '';
    }
}

// ──────────────────────────────────────────────────────────────────────
// GET REPORT TYPE LABEL
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the label for a report type
 * @param {string} reportType - 'welcoming' | 'midterm' | 'endterm' | 'annual'
 * @param {boolean} isFrench - Whether to return French label
 * @returns {string} Report type label
 */
function getReportTypeLabel(reportType, isFrench = false) {
    const labels = {
        welcoming: { en: 'Welcoming Tests', fr: 'Tests d\'Accueil' },
        midterm: { en: 'Mid-Term', fr: 'Demi-Trimestre' },
        endterm: { en: 'End of Term', fr: 'Fin de Trimestre' },
        annual: { en: 'Annual', fr: 'Annuel' },
    };
    const label = labels[reportType] || labels.endterm;
    return isFrench ? label.fr : label.en;
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE STUDENT REPORT QR
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate QR code data for a student report
 * @param {object} student - Student object
 * @param {object} reportData - Report data
 * @param {string} reportType - 'welcoming' | 'midterm' | 'endterm' | 'annual'
 * @param {number} yearId - Academic year ID (optional)
 * @returns {string} QR code data URL
 */
export function generateStudentReportQR(student, reportData, reportType, yearId = null) {
    const school = state.schoolSettings || {};
    const currentYear = getCurrentAcademicYear();
    const selectedYearId = yearId || state.filters?.academic_year_id || currentYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const term = reportData.term || getCurrentTerm();

    // Determine if it's a Nursery report (French)
    const isNursery = reportData.isNursery || reportData.cls?.level === 'Nursery';

    // Get report type label
    const typeLabel = getReportTypeLabel(reportType, isNursery);

    // Get phase for the report
    const phase = reportData.phase || getCurrentPhase(term);
    const phaseLabel = phase === 'pre_midterm' ? 'Pre-Midterm' : 'Post-Midterm';

    const payload = {
        v: '2',
        reportType: reportType,
        reportTypeLabel: typeLabel,
        phase: phase,
        phaseLabel: phaseLabel,
        school: {
            name: school.school_name || 'ECOLE LA FONTAINE',
            address: school.school_address || 'Rubavu, Rwanda',
            phone: school.school_phone || '',
            academicYear: selectedYear?.name || school.academic_year || state.currentAcadYear?.name || '',
            academicYearId: selectedYearId,
            isNursery: isNursery,
        },
        student: {
            id: student.id,
            code: student.student_code || '',
            firstName: student.first_name || '',
            lastName: student.last_name || '',
            class: reportData.className || reportData.cls?.name || '',
            gender: student.gender || '',
            dob: student.date_of_birth || '',
            guardian: student.guardian_name || '',
            guardianPhone: student.guardian_phone || '',
        },
        academic: {
            term: reportData.termName || term?.name || '',
            termId: reportData.termId || term?.id || '',
            type: reportType || 'endterm',
            typeLabel: typeLabel,
            totalScore: reportData.totalScore ?? reportData.annualTotalScore ?? 0,
            totalMax: reportData.totalMax ?? reportData.annualTotalMax ?? 0,
            pct: reportData.overallPercentage ?? 0,
            grade: reportData.overallGrade ?? getGrade(reportData.overallPercentage ?? 0),
            rank: reportData.rank || '—',
            subjects: (reportData.subjects || []).map(s => ({
                name: s.name,
                mg: s.mg ?? null,
                ex: s.ex ?? null,
                total: s.total ?? null,
                max: s.max ?? 0,
                pct: s.pct ?? null,
                grade: s.grade || '—',
            })),
            // Include promotion decision for annual reports
            promotion: reportType === 'annual' ? {
                decision: reportData.promotionDecision || (reportData.overallPercentage >= 50 ? 'PROMOTED' : 'REPEAT'),
                nextClass: reportData.nextClass || null,
                failedSubjects: reportData.failedSubjects || [],
            } : null,
        },
        headTeacher: school.head_teacher || school.report_footer_line2 || 'UWAYO GANZA Eugene',
        gen: new Date().toISOString(),
    };

    // Keep payload under QR limit (~2000 chars)
    let text = JSON.stringify(payload);
    if (text.length > 2000) {
        payload.academic.subjects = payload.academic.subjects.map(s => ({
            name: s.name,
            total: s.total,
            pct: s.pct,
            grade: s.grade,
        }));
        text = JSON.stringify(payload);
    }

    return generateQRCodeDataURL(text, 160);
}

// ──────────────────────────────────────────────────────────────────────
// ADD QR CODE TO REPORT
// ──────────────────────────────────────────────────────────────────────

/**
 * Inject QR code into a report card element
 * @param {HTMLElement} reportElement - Report card container
 * @param {object} student - Student object
 * @param {object} reportData - Report data
 * @param {string} reportType - 'welcoming' | 'midterm' | 'endterm' | 'annual'
 * @param {number} yearId - Academic year ID (optional)
 */
export function addQRCodeToReport(reportElement, student, reportData, reportType, yearId = null) {
    if (!reportElement || typeof QRCode === 'undefined') return;
    if (reportElement.querySelector('.report-qr-block')) return;

    const selectedYearId = yearId || state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActive = selectedYear?.is_active !== false;

    const qrDataURL = generateStudentReportQR(student, reportData, reportType, selectedYearId);
    if (!qrDataURL) return;

    const typeLabel = getReportTypeLabel(reportType, reportData.isNursery);

    const block = document.createElement('div');
    block.className = 'report-qr-block';
    block.style.cssText = `
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:10px;
        padding:8px 12px;
        border-top:1px solid #e2e8f0;
        margin-top:8px;
        background:#f8fafc;
        border-radius:0 0 8px 8px;
    `;

    block.innerHTML = `
        <div style="font-size:9px;color:#64748b;line-height:1.6;text-align:left;">
            <div><strong>${esc(student.first_name || '')} ${esc(student.last_name || '')}</strong></div>
            <div>Code: ${esc(student.student_code || '—')}</div>
            <div>${esc(reportData.className || '')}</div>
            <div style="font-size:8px;color:#94a3b8;">${esc(typeLabel)} · ${esc(selectedYear?.name || '')} ${isActive ? '🟢' : '🔒'}</div>
            <div style="margin-top:3px;font-style:italic;">📱 Scan to verify</div>
        </div>
        <div>
            <img src="${qrDataURL}" alt="QR" style="width:80px;height:80px;border:1px solid #e2e8f0;border-radius:4px;display:block;">
        </div>
    `;

    reportElement.appendChild(block);
}

// ──────────────────────────────────────────────────────────────────────
// DISPLAY QR CODE RESULTS
// ──────────────────────────────────────────────────────────────────────

/**
 * Display decoded QR code data in a modal
 * @param {string} qrData - JSON string from QR code
 */
export function displayQRCodeResults(qrData) {
    try {
        const data = JSON.parse(qrData);
        const s = data.student || {};
        const a = data.academic || {};
        const school = data.school || {};
        const pct = a.pct ?? 0;
        const passed = pct >= (parseFloat(state.schoolSettings?.pass_mark) || 50);

        // Get report type label
        const reportType = a.type || 'endterm';
        const typeLabel = a.typeLabel || getReportTypeLabel(reportType, school.isNursery);

        // Get phase
        const phaseLabel = a.phaseLabel || '';

        // Get year
        const yearLabel = school.academicYear || '';

        const subjectRows = (a.subjects || []).map(sub => `
            <tr>
                <td><strong>${esc(sub.name)}</strong></td>
                <td style="text-align:center;">${sub.mg !== null ? Number(sub.mg).toFixed(1) : '—'}</td>
                <td style="text-align:center;">${sub.ex !== null ? Number(sub.ex).toFixed(1) : '—'}</td>
                <td style="text-align:center;font-weight:700;">${sub.total !== null ? Number(sub.total).toFixed(1) : '—'}</td>
                <td style="text-align:center;">${sub.max || '—'}</td>
                <td style="text-align:center;"><span class="badge ${getGradeClass(sub.pct)}">${sub.pct !== null ? Number(sub.pct).toFixed(1) + '%' : '—'}</span></td>
                <td style="text-align:center;"><span class="badge ${getGradeClass(sub.pct)}">${sub.grade || '—'}</span></td>
            </tr>
        `).join('');

        // Promotion decision for annual reports
        let promotionHtml = '';
        if (reportType === 'annual' && a.promotion) {
            const promo = a.promotion;
            const isPromoted = promo.decision === 'PROMOTED';
            const nextClass = promo.nextClass || 'NEXT CLASS';
            const failedSubjects = promo.failedSubjects || [];

            let promoColor = isPromoted ? 'var(--success)' : 'var(--danger)';
            let promoBg = isPromoted ? 'var(--success-bg)' : '#fee2e2';
            let promoText = isPromoted
                ? `✅ PROMOTED to ${esc(nextClass)}`
                : `❌ REPEAT — ${esc(failedSubjects.length)} subject(s) to improve`;

            if (failedSubjects.length > 0) {
                promoText += ` (${esc(failedSubjects.join(', '))})`;
            }

            promotionHtml = `
                <div style="margin-top:12px;padding:10px;border-radius:8px;background:${promoBg};text-align:center;">
                    <strong style="color:${promoColor};font-size:0.9rem;">${promoText}</strong>
                    ${failedSubjects.length > 0 && !isPromoted ? `
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
                            Focus on these subjects: ${esc(failedSubjects.join(', '))}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        const html = `
            <div class="modal-overlay" id="qr-result-modal" style="display:flex;">
                <div class="modal" style="max-width:820px;max-height:95vh;overflow-y:auto;padding:0;">
                    <div class="modal-header" style="position:sticky;top:0;z-index:10;">
                        <h3>📱 QR Code — Student Report</h3>
                        <button class="modal-close" onclick="window.closeModal('qr-result-modal')">✕</button>
                    </div>
                    <div class="modal-body" style="padding:16px 20px;">

                        <!-- School header -->
                        <div style="text-align:center;padding:12px 0;border-bottom:2px solid #1a3a5c;margin-bottom:16px;">
                            <h2 style="color:#1a3a5c;margin:0;">${esc(school.name || 'ECOLE LA FONTAINE')}</h2>
                            <p style="color:#64748b;font-size:12px;margin:4px 0;">${esc(school.address || '')} | ${esc(school.phone || '')}</p>
                            <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
                                <span class="badge badge-success">🔒 OFFICIAL DOCUMENT</span>
                                <span class="badge badge-info">${esc(typeLabel)}</span>
                                ${phaseLabel ? `<span class="badge badge-neutral">${esc(phaseLabel)}</span>` : ''}
                                ${yearLabel ? `<span class="badge badge-neutral">📅 ${esc(yearLabel)}</span>` : ''}
                            </div>
                        </div>

                        <!-- Student Info -->
                        <div class="dash-card" style="margin-bottom:12px;">
                            <div class="dash-card-header"><span class="dash-card-title">👤 Student</span></div>
                            <div class="dash-card-body">
                                <div class="form-grid">
                                    <div class="form-group"><label>Full Name</label><div style="font-weight:600;font-size:15px;">${esc((s.firstName || '') + ' ' + (s.lastName || ''))}</div></div>
                                    <div class="form-group"><label>Student Code</label><div><code>${esc(s.code || '—')}</code></div></div>
                                    <div class="form-group"><label>Class</label><div>${esc(s.class || '—')}</div></div>
                                    <div class="form-group"><label>Gender</label><div>${esc(s.gender || '—')}</div></div>
                                    <div class="form-group"><label>Guardian</label><div>${esc(s.guardian || '—')}</div></div>
                                    <div class="form-group"><label>Guardian Phone</label><div>${esc(s.guardianPhone || '—')}</div></div>
                                </div>
                            </div>
                        </div>

                        <!-- Academic Summary -->
                        <div class="dash-card" style="margin-bottom:12px;">
                            <div class="dash-card-header"><span class="dash-card-title">📊 Academic Summary — ${esc(a.term || '')} (${esc(typeLabel)})</span></div>
                            <div class="dash-card-body">
                                <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:12px;">
                                    <div class="stat-card"><div class="stat-value">${Number(a.totalScore || 0).toFixed(1)}</div><div class="stat-label">Total Score</div></div>
                                    <div class="stat-card"><div class="stat-value">${a.totalMax || 0}</div><div class="stat-label">Max</div></div>
                                    <div class="stat-card"><div class="stat-value" style="color:${passed ? 'var(--success)' : 'var(--danger)'};">${Number(pct).toFixed(1)}%</div><div class="stat-label">Average</div></div>
                                    <div class="stat-card"><div class="stat-value"><span class="badge ${getGradeClass(pct)}">${esc(a.grade || getGrade(pct))}</span></div><div class="stat-label">Grade</div></div>
                                    <div class="stat-card"><div class="stat-value">${esc(String(a.rank || '—'))}</div><div class="stat-label">Rank</div></div>
                                </div>
                                <div style="text-align:center;padding:10px;border-radius:8px;background:${passed ? 'var(--success-bg)' : '#fee2e2'};">
                                    <strong style="color:${passed ? 'var(--success)' : 'var(--danger)'};">
                                        ${passed ? '✅ PASSED' : '❌ NEEDS IMPROVEMENT'}
                                    </strong>
                                </div>
                                ${promotionHtml}
                            </div>
                        </div>

                        <!-- Subjects -->
                        ${a.subjects?.length ? `
                            <div class="dash-card" style="margin-bottom:12px;">
                                <div class="dash-card-header"><span class="dash-card-title">📖 Subject Marks</span></div>
                                <div class="dash-card-body" style="padding:0;">
                                    <div class="table-wrapper">
                                        <table class="data-table" style="font-size:12px;">
                                            <thead>
                                                <tr>
                                                    <th>Subject</th>
                                                    <th style="text-align:center;">MG</th>
                                                    <th style="text-align:center;">EX</th>
                                                    <th style="text-align:center;">TOTAL</th>
                                                    <th style="text-align:center;">MAX</th>
                                                    <th style="text-align:center;">%</th>
                                                    <th style="text-align:center;">GRADE</th>
                                                </tr>
                                            </thead>
                                            <tbody>${subjectRows}</tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Footer -->
                        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);padding:10px;border-top:1px solid var(--border-light);">
                            <span>Head Teacher: ${esc(data.headTeacher || 'UWAYO GANZA Eugene')}</span>
                            <span>Generated: ${data.gen ? new Date(data.gen).toLocaleString() : '—'}</span>
                            <span>Scanned: ${new Date().toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="modal-footer" style="position:sticky;bottom:0;">
                        <button class="btn btn-outline" onclick="window.closeModal('qr-result-modal')">Close</button>
                        <button class="btn btn-primary" onclick="window.print()">🖨️ Print</button>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('qr-result-modal');
        if (existing) existing.remove();

        const container = document.getElementById('modals-container') || document.body;
        container.insertAdjacentHTML('beforeend', html);

    } catch (e) {
        console.error('[QR] Parse error:', e);
        showToast('Invalid QR code: ' + e.message, 'error');
    }
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE RECEIPT QR
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate QR code for a payment receipt
 * @param {object} receiptData - Receipt data
 * @param {number} size - QR code size
 * @returns {string} QR code data URL
 */
export function generateReceiptQR(receiptData, size = 120) {
    const school = state.schoolSettings || {};

    const payload = {
        v: '1',
        type: 'receipt',
        school: {
            name: school.school_name || 'ECOLE LA FONTAINE',
            address: school.school_address || 'Rubavu, Rwanda',
        },
        receipt: {
            number: receiptData.receiptNum || '',
            date: receiptData.date || '',
            amount: receiptData.amount || 0,
            student: receiptData.studentName || '',
            method: receiptData.method || '',
            academicYear: state.currentAcadYear?.name || '',
        },
        gen: new Date().toISOString(),
    };

    const text = JSON.stringify(payload);
    return generateQRCodeDataURL(text, size);
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.generateQRCodeDataURL = generateQRCodeDataURL;
window.generateStudentReportQR = generateStudentReportQR;
window.addQRCodeToReport = addQRCodeToReport;
window.displayQRCodeResults = displayQRCodeResults;
window.generateReceiptQR = generateReceiptQR;

console.log('✅ QR Code system loaded');