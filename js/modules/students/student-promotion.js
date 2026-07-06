/**
 * ECOLE LA FONTAINE — Student Promotion Module
 * End-of-year promotion wizard with batch processing, archiving, and history tracking
 * Last updated: 2026-07-03
 * 
 * CHANGES:
 * - Added academic year tracking in promotions
 * - Added marks archiving before promotion
 * - Added class history recording
 * - Added per-student promotion records
 * - Added rollback support
 * - Added historical data preservation
 */


import {
    state,
    getClassById,
    getCurrentUser,
    getCurrentAcademicYear,
    getStudentById,
    getActiveAcademicYearId,
    getYearData,
    getStudentPromotionHistory,
    getStudentClassHistory
} from '../../core/state.js';
import { esc, fmtDate, fmtDateTime } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import {
    update,
    insert,
    insertBatch,
    getAll,
    getById,
    get,
    updateWhere,
    archiveStudentMarksForYear,
    getStudentMarksByYear,
    getStudentPromotionHistory as apiGetStudentPromotionHistory,
    getBatchPromotionDetails,
    getStudentClassHistory as apiGetStudentClassHistory
} from '../../core/api.js';
import { PROMOTION_RULES, PROMOTION_MAP } from '../../config/constants.js';
import { notifyAction } from '../../core/notifications.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let promotionData = [];
let selectedPromotions = {};
let currentBatchId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderStudentPromotion(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const currentYear = getCurrentAcademicYear();

    // Check if next academic year exists
    const nextYear = (state.academicYears || []).find(y => y.id === currentYear?.id + 1);
    if (!nextYear) {
        container.innerHTML = `
            <div class="alert alert-warning" style="margin:2rem;">
                <strong>⚠️ No next academic year found.</strong>
                <br>Please create the next academic year before running promotion.
                <br><br>
                <button class="btn btn-primary" onclick="navigateTo('academic-years')">📅 Go to Academic Years</button>
            </div>
        `;
        return;
    }

    // Build promotion data
    promotionData = [];
    selectedPromotions = {};

    for (const rule of PROMOTION_RULES) {
        const fromClass = (state.classes || []).find(c => c.name === rule.from);
        if (fromClass) {
            const students = (state.students || [])
                .filter(s => s.class_id === fromClass.id && s.status === 'Active')
                .sort((a, b) => a.last_name.localeCompare(b.last_name));

            // Calculate annual averages for each student
            const studentData = [];
            for (const student of students) {
                const avg = await calculateStudentAnnualAverage(student.id, fromClass.id, currentYear?.id);
                const hasMarks = avg !== null;
                studentData.push({
                    ...student,
                    annualAvg: avg,
                    grade: hasMarks ? getGrade(avg) : '—',
                    eligible: hasMarks && avg >= 50,
                    hasMarks: hasMarks,
                });
            }

            const toClass = rule.to === 'GRADUATED' ? null : (state.classes || []).find(c => c.name === rule.to);
            promotionData.push({
                from_class: rule.from,
                from_id: fromClass.id,
                to_class: rule.to,
                to_id: toClass?.id,
                students: studentData,
                eligibleCount: studentData.filter(s => s.eligible).length,
                totalCount: studentData.length,
            });
        }
    }

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🚀 Student Promotion Wizard</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window._previewPromotion()">👁️ Preview</button>
                    <button class="btn btn-sm btn-warning" onclick="window._executePromotion()">✅ Execute Promotion</button>
                    ${currentBatchId ? `<button class="btn btn-sm btn-danger" onclick="window._rollbackPromotion()">↩️ Rollback</button>` : ''}
                </div>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info" style="font-size:0.85rem;">
                    <strong>📅 Promotion Details:</strong> 
                    From: <strong>${currentYear?.name || 'Current Year'}</strong> → To: <strong>${nextYear?.name || 'Next Academic Year'}</strong>
                    <br>Promotion Date: <strong>${fmtDate(new Date())}</strong>
                    ${currentBatchId ? `<br>🔄 Current Batch ID: <strong>#${currentBatchId}</strong> (can be rolled back)` : ''}
                </div>

                <div id="promotion-classes-container">
                    ${promotionData.map(p => `
                        <div class="dash-card" style="margin-bottom:12px;border:1px solid var(--border-light);border-radius:var(--r-lg);overflow:hidden;">
                            <div class="dash-card-header" style="cursor:pointer;background:var(--bg-tertiary);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;" onclick="window._togglePromotionClass('class-${p.from_id}')">
                                <span>
                                    <strong>${esc(p.from_class)}</strong> → 
                                    ${p.to_class === 'GRADUATED' ? '<span class="badge badge-warning">🎓 GRADUATED</span>' : esc(p.to_class)}
                                    <span class="badge badge-info" style="margin-left:8px;">${p.totalCount} students</span>
                                    <span class="badge ${p.eligibleCount === p.totalCount ? 'badge-success' : 'badge-warning'}" style="margin-left:4px;">${p.eligibleCount} eligible</span>
                                </span>
                                <span class="nav-section-arrow">▾</span>
                            </div>
                            <div id="class-${p.from_id}" class="promotion-class-content" style="display:none;padding:12px 16px;">
                                <div class="alert alert-warning" style="margin-bottom:12px;font-size:0.8rem;">
                                    ✅ Checked students will be promoted. Uncheck to keep in same class (repeat).
                                    <br>⚠️ Students without marks will be unchecked by default.
                                </div>
                                <div class="table-wrapper">
                                    <table class="data-table" style="font-size:0.78rem;">
                                        <thead>
                                            <tr>
                                                <th style="width:40px;"><input type="checkbox" id="select-all-${p.from_id}" onchange="window._toggleSelectAll(${p.from_id})"></th>
                                                <th>Student Name</th>
                                                <th>Code</th>
                                                <th style="text-align:center;">Avg %</th>
                                                <th style="text-align:center;">Grade</th>
                                                <th>Promoting To</th>
                                                <th style="text-align:center;">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${p.students.map(s => {
        const isEligible = s.eligible && s.hasMarks;
        const checked = isEligible;
        return `
                                                    <tr>
                                                        <td><input type="checkbox" class="student-promo-${p.from_id}" data-student-id="${s.id}" data-from="${p.from_id}" data-to="${p.to_id || ''}" data-to-name="${p.to_class}" ${checked ? 'checked' : ''} ${!isEligible ? 'disabled' : ''}></td>
                                                        <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                                                        <td>${esc(s.student_code || '—')}</td>
                                                        <td style="text-align:center;">${s.hasMarks ? s.annualAvg.toFixed(1) + '%' : '—'}</td>
                                                        <td style="text-align:center;"><span class="badge ${s.grade !== '—' ? getGradeClass(s.annualAvg) : 'badge-neutral'}">${s.grade}</span></td>
                                                        <td>${p.to_class === 'GRADUATED' ? '🎓 Graduated' : esc(p.to_class)}</td>
                                                        <td style="text-align:center;">
                                                            ${isEligible ? '<span class="badge badge-success">✅ Eligible</span>' :
                !s.hasMarks ? '<span class="badge badge-neutral">⚠️ No Marks</span>' :
                    '<span class="badge badge-danger">❌ Not Eligible</span>'}
                                                        </td>
                                                    </tr>
                                                `;
    }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="form-group" style="margin-top:16px;">
                    <label>Promotion Batch Name</label>
                    <input type="text" id="promotion-batch-name" value="End of Year ${currentYear?.name || ''} Promotion" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;max-width:400px;">
                </div>

                <div id="promotion-preview" style="margin-top:16px;display:none;"></div>

                <div class="btn-group" style="margin-top:16px;">
                    <button class="btn btn-outline" onclick="window._previewPromotion()">👁️ Preview Selected</button>
                    <button class="btn btn-warning" onclick="window._executePromotion()">✅ Execute Promotion</button>
                    <button class="btn btn-outline" onclick="window._resetPromotion()">↻ Reset</button>
                </div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📜 Promotion History</span>
                <button class="btn btn-sm btn-outline" onclick="window._loadPromotionHistory()">🔄 Refresh</button>
                <button class="btn btn-sm btn-outline" onclick="window._exportPromotionHistory()">📥 Export</button>
            </div>
            <div class="dash-card-body" id="promotion-history-list">
                <div class="loading-container"><div class="spinner"></div><p>Loading history...</p></div>
            </div>
        </div>

        <div class="dash-card" style="margin-top:20px;">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Promotion Statistics</span>
            </div>
            <div class="dash-card-body" id="promotion-stats">
                <div class="loading-container"><div class="spinner"></div><p>Loading stats...</p></div>
            </div>
        </div>
    `;

    // Register window functions
    window._togglePromotionClass = togglePromotionClass;
    window._toggleSelectAll = toggleSelectAll;
    window._previewPromotion = previewPromotion;
    window._executePromotion = executePromotion;
    window._resetPromotion = resetPromotion;
    window._loadPromotionHistory = loadPromotionHistory;
    window._rollbackPromotion = rollbackPromotion;
    window._exportPromotionHistory = exportPromotionHistory;

    await loadPromotionHistory();
    await loadPromotionStats();
}

// ──────────────────────────────────────────────────────────────────────
// CALCULATE STUDENT ANNUAL AVERAGE
// ──────────────────────────────────────────────────────────────────────

async function calculateStudentAnnualAverage(studentId, classId, yearId) {
    const terms = (state.terms || [])
        .filter(t => t.academic_year_id === (yearId || state.currentAcadYear?.id))
        .sort((a, b) => a.term_number - b.term_number);

    const cls = getClassById(classId);
    const subjects = (state.subjects || [])
        .filter(s => s.level === cls?.level && s.is_active !== false);

    if (!terms.length || !subjects.length) return null;

    let totalScore = 0, totalMax = 0;
    const studentMarks = (state.marks || []).filter(m => m.student_id === studentId);

    for (const term of terms) {
        const assessments = (state.assessments || [])
            .filter(a => a.class_id === classId && a.term_id === term.id);

        for (const subject of subjects) {
            const subjectAssessments = assessments.filter(a => a.subject_id === subject.id);
            let score = 0, max = 0;

            for (const a of subjectAssessments) {
                const mark = studentMarks.find(m => m.assessment_id === a.id);
                if (mark && mark.score !== null && mark.score !== undefined) {
                    score += mark.score;
                    max += a.max_marks;
                }
            }

            if (max > 0) {
                const pct = (score / max) * 100;
                totalScore += pct;
                totalMax++;
            }
        }
    }

    return totalMax > 0 ? totalScore / totalMax : null;
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE PROMOTION CLASS
// ──────────────────────────────────────────────────────────────────────

function togglePromotionClass(classId) {
    const el = document.getElementById(classId);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE SELECT ALL
// ──────────────────────────────────────────────────────────────────────

function toggleSelectAll(classId) {
    const master = document.getElementById(`select-all-${classId}`);
    const checkboxes = document.querySelectorAll(`.student-promo-${classId}`);
    checkboxes.forEach(cb => {
        if (!cb.disabled) cb.checked = master?.checked || false;
    });
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW PROMOTION
// ──────────────────────────────────────────────────────────────────────

function previewPromotion() {
    const preview = document.getElementById('promotion-preview');
    const selected = [];

    for (const p of promotionData) {
        const checkboxes = document.querySelectorAll(`.student-promo-${p.from_id}:checked`);
        checkboxes.forEach(cb => {
            const studentId = parseInt(cb.dataset.studentId);
            const student = p.students.find(s => s.id === studentId);
            if (student) {
                selected.push({
                    student: student,
                    from: p.from_class,
                    fromId: p.from_id,
                    to: cb.dataset.toName,
                    toId: cb.dataset.to || null,
                });
            }
        });
    }

    if (!selected.length) {
        preview.innerHTML = '<div class="alert alert-warning">No students selected for promotion.</div>';
        preview.style.display = 'block';
        return;
    }

    const promoted = selected.filter(s => s.to !== 'GRADUATED');
    const graduated = selected.filter(s => s.to === 'GRADUATED');

    preview.innerHTML = `
        <div class="alert alert-info">
            <strong>Preview:</strong> ${selected.length} student${selected.length !== 1 ? 's' : ''} selected
            ${promoted.length ? ` · ${promoted.length} to promote` : ''}
            ${graduated.length ? ` · ${graduated.length} to graduate` : ''}
        </div>
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.78rem;">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Avg %</th>
                        <th>Grade</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${selected.map(s => `
                        <tr>
                            <td><strong>${esc(s.student.first_name)} ${esc(s.student.last_name)}</strong></td>
                            <td>${esc(s.from)}</td>
                            <td>${s.to === 'GRADUATED' ? '🎓 Graduated' : esc(s.to)}</td>
                            <td style="text-align:center;">${s.student.annualAvg !== null ? s.student.annualAvg.toFixed(1) + '%' : '—'}</td>
                            <td style="text-align:center;"><span class="badge ${s.student.grade !== '—' ? getGradeClass(s.student.annualAvg) : 'badge-neutral'}">${s.student.grade}</span></td>
                            <td style="text-align:center;">
                                ${s.to === 'GRADUATED' ? '<span class="badge badge-warning">🎓 Graduate</span>' : '<span class="badge badge-success">✅ Promote</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:12px;padding:12px;background:var(--bg-tertiary);border-radius:8px;">
            <strong>📊 Summary:</strong>
            ${selected.length} total · 
            ${promoted.length} promoted · 
            ${graduated.length} graduated
            <br><small style="color:var(--text-muted);">
                ⚠️ ${selected.filter(s => s.student.annualAvg === null).length} students have no marks and will be unchecked.
            </small>
        </div>
    `;
    preview.style.display = 'block';
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTE PROMOTION — Full Implementation with Archiving
// ──────────────────────────────────────────────────────────────────────

async function executePromotion() {
    const selected = [];

    for (const p of promotionData) {
        const checkboxes = document.querySelectorAll(`.student-promo-${p.from_id}:checked`);
        checkboxes.forEach(cb => {
            const studentId = parseInt(cb.dataset.studentId);
            const student = p.students.find(s => s.id === studentId);
            if (student) {
                selected.push({
                    student: student,
                    from: p.from_class,
                    fromId: p.from_id,
                    to: cb.dataset.toName,
                    toId: cb.dataset.to || null,
                });
            }
        });
    }

    if (!selected.length) {
        showToast('No students selected for promotion', 'warning');
        return;
    }

    const batchName = document.getElementById('promotion-batch-name')?.value.trim() || 'Promotion Batch';
    const currentYear = getCurrentAcademicYear();
    const nextYear = (state.academicYears || []).find(y => y.id === currentYear?.id + 1);

    if (!nextYear) {
        showToast('Next academic year not found', 'error');
        return;
    }

    if (!await confirmDialog(
        `⚠️ PROMOTION CONFIRMATION\n\n` +
        `This will:\n` +
        `• Promote ${selected.filter(s => s.to !== 'GRADUATED').length} students\n` +
        `• Graduate ${selected.filter(s => s.to === 'GRADUATED').length} students\n` +
        `• Archive marks from ${currentYear?.name}\n` +
        `• Create promotion history records\n\n` +
        `This action CANNOT be undone (rollback available for 7 days).\n\n` +
        `Proceed?`
    )) return;

    const btn = document.querySelector('.btn-warning');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Processing...';

    let promoted = 0, graduated = 0, repeated = 0;
    let batchId = null;

    try {
        // 1. Create promotion batch record
        const batch = await insert('student_promotions', {
            batch_name: batchName,
            from_academic_year_id: currentYear?.id,
            to_academic_year_id: nextYear.id,
            executed_by: getCurrentUser()?.id,
            executed_at: new Date().toISOString(),
            total_students: selected.length,
            promoted_count: 0,
            repeated_count: 0,
            graduated_count: 0,
            can_rollback: true,
            notes: `Promotion from ${currentYear?.name} to ${nextYear.name}`
        });

        if (!batch) {
            throw new Error('Failed to create promotion batch record');
        }

        batchId = batch.id;
        currentBatchId = batchId;

        // 2. Process each student
        const promotionRecords = [];
        const classHistoryRecords = [];

        for (const s of selected) {
            const annualPct = s.student.annualAvg;
            const action = s.to === 'GRADUATED' ? 'graduated' :
                (annualPct !== null && annualPct >= 50) ? 'promoted' : 'repeated';

            let toClassId = null;
            let newStatus = 'Active';

            if (s.to === 'GRADUATED') {
                toClassId = null;
                newStatus = 'Graduated';
                graduated++;
            } else if (s.toId) {
                toClassId = parseInt(s.toId);
                promoted++;
            } else {
                // Repeat: keep same class
                toClassId = parseInt(s.fromId);
                repeated++;
            }

            // 2a. Archive marks for current year
            try {
                await archiveStudentMarksForYear(s.student.id, currentYear?.id, getCurrentUser()?.id);
            } catch (e) {
                console.warn(`[Promotion] Failed to archive marks for student ${s.student.id}:`, e);
                // Continue anyway — marks may not exist
            }

            // 2b. Update student
            const updateData = {
                class_id: toClassId,
                status: newStatus,
                academic_year_id: nextYear.id,
                updated_at: new Date().toISOString(),
            };

            if (s.to === 'GRADUATED') {
                updateData.graduated_at = new Date().toISOString();
            } else if (action === 'promoted') {
                updateData.promoted_at = new Date().toISOString();
            } else {
                updateData.repeated_at = new Date().toISOString();
            }

            await update('students', s.student.id, updateData);

            // 2c. Record class history
            const historyRecord = {
                student_id: s.student.id,
                class_id: parseInt(s.fromId),
                academic_year_id: currentYear?.id,
                end_date: new Date().toISOString().split('T')[0],
                status: action === 'graduated' ? 'graduated' : (action === 'promoted' ? 'promoted' : 'repeated'),
                created_at: new Date().toISOString(),
            };
            await insert('student_class_history', historyRecord);

            // 2d. Record promotion
            const promoRecord = {
                promotion_id: batchId,
                student_id: s.student.id,
                from_class_id: parseInt(s.fromId),
                to_class_id: toClassId,
                action: action,
                annual_percentage: annualPct !== null ? annualPct : null,
                from_academic_year_id: currentYear?.id,
                to_academic_year_id: nextYear.id,
                created_at: new Date().toISOString(),
            };
            await insert('student_promotion_records', promoRecord);
        }

        // 3. Update batch with final counts
        await update('student_promotions', batchId, {
            promoted_count: promoted,
            repeated_count: repeated,
            graduated_count: graduated,
            total_students: selected.length,
            updated_at: new Date().toISOString(),
        });

        // 4. Notify
        await notifyAction('student_promoted', {
            message: `Batch promotion "${batchName}": ${promoted} promoted, ${graduated} graduated, ${repeated} repeated`,
            entity_type: 'students',
            batch_id: batchId,
        }, ['admin', 'teachers']);

        // 5. Refresh state
        await refreshPromotionData();
        await refreshTable('students');
        await refreshTable('marks');

        showToast(`✅ Promotion complete: ${promoted} promoted, ${graduated} graduated, ${repeated} repeated`, 'success');

        // 6. Refresh the page
        renderStudentPromotion(document.getElementById('dynamic-content'));

    } catch (error) {
        console.error('[Promotion]', error);
        showToast('Promotion failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '✅ Execute Promotion';
    }
}

// ──────────────────────────────────────────────────────────────────────
// ROLLBACK PROMOTION
// ──────────────────────────────────────────────────────────────────────

async function rollbackPromotion() {
    if (!currentBatchId) {
        showToast('No batch to rollback', 'warning');
        return;
    }

    const batch = await getById('student_promotions', currentBatchId);
    if (!batch) {
        showToast('Batch not found', 'error');
        return;
    }

    if (!batch.can_rollback) {
        showToast('This batch cannot be rolled back (rollback window expired)', 'warning');
        return;
    }

    // Check if batch is older than 7 days
    const batchDate = new Date(batch.executed_at);
    const daysOld = (Date.now() - batchDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld > 7) {
        showToast('Rollback window expired (7 days)', 'warning');
        return;
    }

    if (!await confirmDialog(
        `⚠️ ROLLBACK CONFIRMATION\n\n` +
        `This will undo the promotion batch "${batch.batch_name}"\n` +
        `• Restore ${batch.total_students} students to their previous classes\n` +
        `• Restore marks from archive\n` +
        `• Remove promotion records\n\n` +
        `This action CANNOT be undone.\n\n` +
        `Proceed?`
    )) return;

    const btn = document.querySelector('.btn-danger');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Rolling back...';
    }

    try {
        // 1. Get all promotion records for this batch
        const records = await get('student_promotion_records', { promotion_id: currentBatchId });

        // 2. Restore each student
        for (const record of records) {
            const student = await getById('students', record.student_id);
            if (!student) continue;

            // Restore class
            const updateData = {
                class_id: record.from_class_id,
                status: 'Active',
                academic_year_id: record.from_academic_year_id,
                updated_at: new Date().toISOString(),
                promoted_at: null,
                repeated_at: null,
                graduated_at: null,
            };

            if (record.action === 'graduated') {
                updateData.status = 'Active';
            }

            await update('students', record.student_id, updateData);

            // Restore marks from archive
            const archivedMarks = await get('marks_archive', {
                student_id: record.student_id,
                academic_year_id: record.from_academic_year_id,
            });

            for (const mark of archivedMarks) {
                await insert('marks', {
                    assessment_id: mark.assessment_id,
                    student_id: mark.student_id,
                    score: mark.score,
                    academic_year_id: mark.academic_year_id,
                    term_id: mark.term_id,
                    is_archived: false,
                    entered_by: mark.archived_by,
                    entered_at: mark.archived_at,
                });
            }

            // Delete archived marks
            for (const mark of archivedMarks) {
                await remove('marks_archive', mark.id);
            }
        }

        // 3. Mark batch as rolled back
        await update('student_promotions', currentBatchId, {
            can_rollback: false,
            notes: (batch.notes || '') + ' [ROLLED BACK]',
            updated_at: new Date().toISOString(),
        });

        await notifyAction('promotion_rolled_back', {
            message: `Promotion batch "${batch.batch_name}" rolled back`,
            entity_type: 'students',
            batch_id: currentBatchId,
        }, ['admin']);

        currentBatchId = null;

        // 4. Refresh
        await refreshPromotionData();
        await refreshTable('students');
        await refreshTable('marks');

        showToast('✅ Promotion rolled back successfully', 'success');
        renderStudentPromotion(document.getElementById('dynamic-content'));

    } catch (error) {
        console.error('[Rollback]', error);
        showToast('Rollback failed: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '↩️ Rollback';
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// RESET PROMOTION
// ──────────────────────────────────────────────────────────────────────

function resetPromotion() {
    document.querySelectorAll('.promotion-class-content').forEach(el => el.style.display = 'none');
    document.getElementById('promotion-preview').style.display = 'none';
    showToast('Form reset', 'info', 1500);
}

// ──────────────────────────────────────────────────────────────────────
// LOAD PROMOTION HISTORY
// ──────────────────────────────────────────────────────────────────────

async function loadPromotionHistory() {
    const container = document.getElementById('promotion-history-list');
    if (!container) return;

    let history = [];
    try {
        history = await getAll('student_promotions', 'order=executed_at.desc&limit=50');
    } catch (e) {
        history = [];
    }

    if (!history.length) {
        container.innerHTML = '<div class="alert alert-info">No promotion history recorded.</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" style="font-size:0.78rem;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Batch Name</th>
                        <th>Total</th>
                        <th>Promoted</th>
                        <th>Graduated</th>
                        <th>Repeated</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(h => {
        const isRollbackable = h.can_rollback && new Date(h.executed_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return `
                        <tr>
                            <td>${fmtDateTime(h.executed_at)}</td>
                            <td><strong>${esc(h.batch_name || '—')}</strong></td>
                            <td style="text-align:center;">${h.total_students || 0}</td>
                            <td style="text-align:center;">${h.promoted_count || 0}</td>
                            <td style="text-align:center;">${h.graduated_count || 0}</td>
                            <td style="text-align:center;">${h.repeated_count || 0}</td>
                            <td style="text-align:center;">
                                <span class="badge ${h.can_rollback ? 'badge-success' : 'badge-neutral'}">
                                    ${h.can_rollback ? '✅ Active' : '🔒 Finalized'}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline" onclick="window._viewBatchDetails(${h.id})">👁️</button>
                                ${isRollbackable ? `<button class="btn btn-sm btn-danger" onclick="window._rollbackBatch(${h.id})">↩️</button>` : ''}
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Register batch view/rollback functions
    window._viewBatchDetails = viewBatchDetails;
    window._rollbackBatch = async (batchId) => {
        currentBatchId = batchId;
        await rollbackPromotion();
    };
}

// ──────────────────────────────────────────────────────────────────────
// VIEW BATCH DETAILS
// ──────────────────────────────────────────────────────────────────────

async function viewBatchDetails(batchId) {
    const batch = await getById('student_promotions', batchId);
    if (!batch) {
        showToast('Batch not found', 'error');
        return;
    }

    const records = await get('student_promotion_records', { promotion_id: batchId });
    const students = [];

    for (const record of records) {
        const student = await getById('students', record.student_id);
        if (student) {
            const fromClass = getClassById(record.from_class_id);
            const toClass = getClassById(record.to_class_id);
            students.push({
                ...record,
                student: student,
                fromClass: fromClass,
                toClass: toClass,
            });
        }
    }

    showModal(`
        <div class="modal-overlay" id="batch-details-modal">
            <div class="modal modal-lg" style="max-width:700px;">
                <div class="modal-header">
                    <h3>📋 Promotion Batch Details</h3>
                    <button class="modal-close" onclick="closeModal('batch-details-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group"><label>Batch Name</label><input readonly value="${esc(batch.batch_name)}"></div>
                        <div class="form-group"><label>Date</label><input readonly value="${fmtDateTime(batch.executed_at)}"></div>
                        <div class="form-group"><label>From Year</label><input readonly value="${esc(state.academicYears.find(y => y.id === batch.from_academic_year_id)?.name || '—')}"></div>
                        <div class="form-group"><label>To Year</label><input readonly value="${esc(state.academicYears.find(y => y.id === batch.to_academic_year_id)?.name || '—')}"></div>
                        <div class="form-group"><label>Total Students</label><input readonly value="${batch.total_students}"></div>
                        <div class="form-group"><label>Status</label><input readonly value="${batch.can_rollback ? '✅ Can Rollback' : '🔒 Finalized'}"></div>
                    </div>

                    <h4>👥 Students</h4>
                    <div class="table-wrapper">
                        <table class="data-table" style="font-size:0.78rem;">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>From Class</th>
                                    <th>To Class</th>
                                    <th>Action</th>
                                    <th>Annual %</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map(s => `
                                    <tr>
                                        <td><strong>${esc(s.student.first_name)} ${esc(s.student.last_name)}</strong></td>
                                        <td>${esc(s.fromClass?.name || '—')}</td>
                                        <td>${s.toClass ? esc(s.toClass.name) : '🎓 Graduated'}</td>
                                        <td><span class="badge ${s.action === 'promoted' ? 'badge-success' : s.action === 'graduated' ? 'badge-warning' : 'badge-danger'}">${s.action}</span></td>
                                        <td style="text-align:center;">${s.annual_percentage !== null ? s.annual_percentage.toFixed(1) + '%' : '—'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal('batch-details-modal')">Close</button>
                </div>
            </div>
        </div>
    `);
}

// ──────────────────────────────────────────────────────────────────────
// LOAD PROMOTION STATS
// ──────────────────────────────────────────────────────────────────────

async function loadPromotionStats() {
    const container = document.getElementById('promotion-stats');
    if (!container) return;

    let history = [];
    try {
        history = await getAll('student_promotions', 'order=executed_at.desc');
    } catch (e) {
        history = [];
    }

    const totalBatches = history.length;
    const totalPromoted = history.reduce((sum, h) => sum + (h.promoted_count || 0), 0);
    const totalGraduated = history.reduce((sum, h) => sum + (h.graduated_count || 0), 0);
    const totalRepeated = history.reduce((sum, h) => sum + (h.repeated_count || 0), 0);
    const totalStudents = history.reduce((sum, h) => sum + (h.total_students || 0), 0);

    container.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
            <div class="stat-card" style="text-align:center;">
                <div class="stat-value">${totalBatches}</div>
                <div class="stat-label">Total Batches</div>
            </div>
            <div class="stat-card" style="text-align:center;background:var(--success-bg);">
                <div class="stat-value" style="color:var(--success);">${totalPromoted}</div>
                <div class="stat-label">✅ Promoted</div>
            </div>
            <div class="stat-card" style="text-align:center;background:var(--warning-bg);">
                <div class="stat-value" style="color:var(--warning);">${totalGraduated}</div>
                <div class="stat-label">🎓 Graduated</div>
            </div>
            <div class="stat-card" style="text-align:center;background:var(--danger-bg);">
                <div class="stat-value" style="color:var(--danger);">${totalRepeated}</div>
                <div class="stat-label">🔄 Repeated</div>
            </div>
            <div class="stat-card" style="text-align:center;background:var(--info-bg);">
                <div class="stat-value" style="color:var(--info);">${totalStudents}</div>
                <div class="stat-label">📊 Total Students</div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT PROMOTION HISTORY
// ──────────────────────────────────────────────────────────────────────

async function exportPromotionHistory() {
    let history = [];
    try {
        history = await getAll('student_promotions', 'order=executed_at.desc');
    } catch (e) {
        history = [];
    }

    if (!history.length) {
        showToast('No data to export', 'warning');
        return;
    }

    const data = history.map(h => ({
        'Date': fmtDateTime(h.executed_at),
        'Batch Name': h.batch_name || '—',
        'Total Students': h.total_students || 0,
        'Promoted': h.promoted_count || 0,
        'Graduated': h.graduated_count || 0,
        'Repeated': h.repeated_count || 0,
        'Status': h.can_rollback ? 'Active' : 'Finalized',
    }));

    exportToExcel(data, `Promotion_History_${fmtDate(new Date())}`);
    showToast('✅ Promotion history exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH PROMOTION DATA
// ──────────────────────────────────────────────────────────────────────

async function refreshPromotionData() {
    try {
        const [promotions, records, history, archive] = await Promise.all([
            get('student_promotions'),
            get('student_promotion_records'),
            get('student_class_history'),
            get('marks_archive'),
        ]);

        state.studentPromotions = promotions || [];
        state.studentPromotionRecords = records || [];
        state.studentClassHistory = history || [];
        state.marksArchive = archive || [];
    } catch (e) {
        console.warn('[Promotion] Refresh failed:', e);
    }
}

// ──────────────────────────────────────────────────────────────────────
// HELPER: EXPORT TO EXCEL
// ──────────────────────────────────────────────────────────────────────

function exportToExcel(data, filename) {
    if (!data?.length) {
        showToast('No data to export', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('SheetJS library not loaded', 'warning');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ──────────────────────────────────────────────────────────────────────
// HELPER: SHOW TOAST
// ──────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span class="toast-message">${esc(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ──────────────────────────────────────────────────────────────────────
// HELPER: ENSURE STATE LOADED
// ──────────────────────────────────────────────────────────────────────

async function ensureStateLoaded() {
    if (!state.classes.length) {
        const loadInitialData = window.loadInitialData || (async () => {});
        await loadInitialData(false);
    }
}