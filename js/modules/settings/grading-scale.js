/**
 * ECOLE LA FONTAINE — Grading Scale Management
 * Edit grade bands, pass marks, and preview distribution
 * Last updated: 2026-06-29
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getCurrentUser } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { getGrade, getGradeClass } from '../../core/formulas.js';
import { insert, update, remove, refreshTable, logActivity } from '../../core/api.js';
import { DEFAULT_GRADES } from '../../config/constants.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderGradingScale(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    const grades = state.gradingScale || DEFAULT_GRADES;
    const settings = state.schoolSettings || {};

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Grading Scale</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-success" onclick="window._saveGradingScale()">💾 Save</button>
                    <button class="btn btn-sm btn-outline" onclick="window._resetGradingScale()">🔄 Reset to Default</button>
                    <button class="btn btn-sm btn-outline" onclick="window._exportGradingScale()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Grade</th>
                                <th>Min %</th>
                                <th>Max %</th>
                                <th>Description</th>
                                <th>Color</th>
                                <th>Order</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="grading-scale-tbody">
                            ${grades.map((g, i) => {
        const minVal = g.min_percentage !== undefined ? g.min_percentage : g.min;
        const maxVal = g.max_percentage !== undefined ? g.max_percentage : g.max;
        const desc = g.description || g.desc || '';
        const color = g.color || g.bg || '#10b981';
        const order = g.sort_order || i + 1;
        return `
                                    <tr id="grade-row-${i}">
                                        <td><input type="text" id="grade-name-${i}" class="form-control" style="width:70px;" value="${esc(g.grade)}" placeholder="Grade"></td>
                                        <td><input type="number" id="grade-min-${i}" class="form-control" style="width:70px;" value="${minVal}" min="0" max="100" step="1"></td>
                                        <td><input type="number" id="grade-max-${i}" class="form-control" style="width:70px;" value="${maxVal}" min="0" max="100" step="1"></td>
                                        <td><input type="text" id="grade-desc-${i}" class="form-control" style="width:120px;" value="${esc(desc)}" placeholder="Description"></td>
                                        <td><input type="color" id="grade-color-${i}" class="form-control" style="width:50px;padding:2px;" value="${color}"></td>
                                        <td><input type="number" id="grade-order-${i}" class="form-control" style="width:60px;" value="${order}" min="1"></td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="window._moveGradeUp(${i})" title="Move Up">▲</button>
                                            <button class="btn btn-sm btn-outline" onclick="window._moveGradeDown(${i})" title="Move Down">▼</button>
                                            <button class="btn btn-sm btn-danger" onclick="window._removeGradeLevel(${i})" title="Remove">🗑️</button>
                                        </td>
                                    </tr>
                                `;
    }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="btn-group" style="margin-top:12px;">
                    <button class="btn btn-sm btn-outline" onclick="window._addGradeLevel()">➕ Add Grade Level</button>
                </div>

                <div class="form-grid" style="margin-top:24px;border-top:1px solid var(--border-light);padding-top:20px;">
                    <div class="form-group">
                        <label>Default Pass Mark (%)</label>
                        <input type="number" id="setting-pass-mark" class="form-control" value="${settings.pass_mark || 50}" min="0" max="100">
                    </div>
                    <div class="form-group">
                        <label>Promotion Mark (%)</label>
                        <input type="number" id="setting-promotion-mark" class="form-control" value="${settings.promotion_mark || settings.pass_mark || 50}" min="0" max="100">
                    </div>
                    <div class="form-group">
                        <label>GPA Scale</label>
                        <select id="setting-gpa-scale" class="form-control">
                            <option value="4.0" ${settings.gpa_scale === '4.0' || !settings.gpa_scale ? 'selected' : ''}>4.0 Scale (Standard)</option>
                            <option value="5.0" ${settings.gpa_scale === '5.0' ? 'selected' : ''}>5.0 Scale (Advanced)</option>
                            <option value="custom" ${settings.gpa_scale === 'custom' ? 'selected' : ''}>Custom Scale</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Rounding Method</label>
                        <select id="setting-rounding" class="form-control">
                            <option value="none" ${settings.rounding === 'none' || !settings.rounding ? 'selected' : ''}>No Rounding</option>
                            <option value="half_up" ${settings.rounding === 'half_up' ? 'selected' : ''}>Round Half Up</option>
                            <option value="ceil" ${settings.rounding === 'ceil' ? 'selected' : ''}>Always Round Up</option>
                            <option value="floor" ${settings.rounding === 'floor' ? 'selected' : ''}>Always Round Down</option>
                        </select>
                    </div>
                </div>

                <div class="dash-card" style="margin-top:20px;">
                    <div class="dash-card-header">
                        <span class="dash-card-title">📈 Grade Distribution Preview</span>
                        <button class="btn btn-sm btn-outline" onclick="window._refreshGradePreview()">🔄 Refresh</button>
                    </div>
                    <div class="dash-card-body">
                        <div id="grade-distribution-preview">
                            <div class="loading-container"><div class="spinner"></div><p>Loading distribution...</p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._saveGradingScale = saveGradingScale;
    window._resetGradingScale = resetGradingScale;
    window._exportGradingScale = exportGradingScale;
    window._addGradeLevel = addGradeLevel;
    window._removeGradeLevel = removeGradeLevel;
    window._moveGradeUp = moveGradeUp;
    window._moveGradeDown = moveGradeDown;
    window._refreshGradePreview = refreshGradePreview;

    await refreshGradePreview();
}

// ──────────────────────────────────────────────────────────────────────
// ADD GRADE LEVEL
// ──────────────────────────────────────────────────────────────────────

function addGradeLevel() {
    const tbody = document.getElementById('grading-scale-tbody');
    if (!tbody) return;

    const idx = tbody.querySelectorAll('tr').length;

    const row = document.createElement('tr');
    row.id = `grade-row-${idx}`;
    row.innerHTML = `
        <td><input type="text" id="grade-name-${idx}" class="form-control" style="width:70px;" placeholder="Grade"></td>
        <td><input type="number" id="grade-min-${idx}" class="form-control" style="width:70px;" value="0" min="0" max="100"></td>
        <td><input type="number" id="grade-max-${idx}" class="form-control" style="width:70px;" value="100" min="0" max="100"></td>
        <td><input type="text" id="grade-desc-${idx}" class="form-control" style="width:120px;" placeholder="Description"></td>
        <td><input type="color" id="grade-color-${idx}" class="form-control" style="width:50px;padding:2px;" value="#10b981"></td>
        <td><input type="number" id="grade-order-${idx}" class="form-control" style="width:60px;" value="${idx + 1}" min="1"></td>
        <td>
            <button class="btn btn-sm btn-outline" onclick="window._moveGradeUp(${idx})" title="Move Up">▲</button>
            <button class="btn btn-sm btn-outline" onclick="window._moveGradeDown(${idx})" title="Move Down">▼</button>
            <button class="btn btn-sm btn-danger" onclick="window._removeGradeLevel(${idx})" title="Remove">🗑️</button>
        </td>
    `;

    tbody.appendChild(row);
    showToast('✅ Grade level added. Click Save to persist.', 'success', 2000);
}

// ──────────────────────────────────────────────────────────────────────
// REMOVE GRADE LEVEL
// ──────────────────────────────────────────────────────────────────────

function removeGradeLevel(index) {
    const row = document.getElementById(`grade-row-${index}`);
    if (!row) return;

    const tbody = document.getElementById('grading-scale-tbody');
    if (tbody.querySelectorAll('tr').length <= 1) {
        showToast('At least one grade level is required', 'warning');
        return;
    }

    if (!confirm('Remove this grade level?')) return;
    row.remove();
    showToast('✅ Grade level removed. Click Save to persist.', 'success', 2000);
}

// ──────────────────────────────────────────────────────────────────────
// MOVE GRADE UP
// ──────────────────────────────────────────────────────────────────────

function moveGradeUp(index) {
    const tbody = document.getElementById('grading-scale-tbody');
    const rows = tbody.querySelectorAll('tr');
    if (index <= 0) return;

    const current = rows[index];
    const previous = rows[index - 1];
    tbody.insertBefore(current, previous);

    // Rebuild order numbers
    rows.forEach((r, i) => {
        const orderInput = r.querySelector(`input[id^="grade-order-"]`);
        if (orderInput) orderInput.value = i + 1;
    });

    showToast('✅ Grade moved up. Click Save to persist.', 'success', 2000);
}

// ──────────────────────────────────────────────────────────────────────
// MOVE GRADE DOWN
// ──────────────────────────────────────────────────────────────────────

function moveGradeDown(index) {
    const tbody = document.getElementById('grading-scale-tbody');
    const rows = tbody.querySelectorAll('tr');
    if (index >= rows.length - 1) return;

    const current = rows[index];
    const next = rows[index + 1];
    tbody.insertBefore(next, current);

    // Rebuild order numbers
    rows.forEach((r, i) => {
        const orderInput = r.querySelector(`input[id^="grade-order-"]`);
        if (orderInput) orderInput.value = i + 1;
    });

    showToast('✅ Grade moved down. Click Save to persist.', 'success', 2000);
}

// ──────────────────────────────────────────────────────────────────────
// SAVE GRADING SCALE
// ──────────────────────────────────────────────────────────────────────

async function saveGradingScale() {
    const tbody = document.getElementById('grading-scale-tbody');
    const rows = tbody.querySelectorAll('tr');

    const grades = [];
    let hasErrors = false;

    for (const row of rows) {
        const idx = row.id.replace('grade-row-', '');
        const grade = document.getElementById(`grade-name-${idx}`)?.value?.trim();
        const min = parseFloat(document.getElementById(`grade-min-${idx}`)?.value);
        const max = parseFloat(document.getElementById(`grade-max-${idx}`)?.value);
        const desc = document.getElementById(`grade-desc-${idx}`)?.value?.trim() || '';
        const color = document.getElementById(`grade-color-${idx}`)?.value || '#10b981';
        const order = parseInt(document.getElementById(`grade-order-${idx}`)?.value) || (grades.length + 1);

        if (!grade) {
            showToast('All grade letters must have a value', 'warning');
            hasErrors = true;
            break;
        }

        if (isNaN(min) || isNaN(max) || min < 0 || max > 100 || min > max) {
            showToast(`Invalid range for grade ${grade}`, 'warning');
            hasErrors = true;
            break;
        }

        grades.push({ grade, min, max, desc, color, order });
    }

    if (hasErrors) return;

    // Delete existing grading scale entries
    await removeWhere('grading_scale', 'id=gt.0');

    // Insert new entries
    for (const g of grades) {
        await insert('grading_scale', {
            grade: g.grade,
            min_percentage: g.min,
            max_percentage: g.max,
            description: g.desc,
            color: g.color,
            sort_order: g.order,
            created_at: new Date().toISOString(),
        });
    }

    // Save pass mark and promotion mark
    const passMark = document.getElementById('setting-pass-mark')?.value;
    const promotionMark = document.getElementById('setting-promotion-mark')?.value;
    const gpaScale = document.getElementById('setting-gpa-scale')?.value;
    const rounding = document.getElementById('setting-rounding')?.value;

    if (passMark) await updateSchoolSetting('pass_mark', passMark);
    if (promotionMark) await updateSchoolSetting('promotion_mark', promotionMark);
    if (gpaScale) await updateSchoolSetting('gpa_scale', gpaScale);
    if (rounding) await updateSchoolSetting('rounding', rounding);

    await refreshTable('grading_scale');
    state.gradingScale = grades;
    state.schoolSettings = await getSchoolSettings();

    await logActivity(state.currentUser?.id, state.currentUser?.role, 'Updated grading scale');
    showToast(`✅ Saved ${grades.length} grade levels`, 'success');
    renderGradingScale(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// RESET GRADING SCALE
// ──────────────────────────────────────────────────────────────────────

async function resetGradingScale() {
    if (!await confirmDialog('Reset to default grading scale? This will overwrite your current scale.')) return;

    await removeWhere('grading_scale', 'id=gt.0');

    for (const g of DEFAULT_GRADES) {
        await insert('grading_scale', {
            grade: g.grade,
            min_percentage: g.min,
            max_percentage: g.max,
            description: g.desc,
            color: g.color,
            sort_order: g.sort_order,
            created_at: new Date().toISOString(),
        });
    }

    await refreshTable('grading_scale');
    state.gradingScale = DEFAULT_GRADES;
    await logActivity(state.currentUser?.id, state.currentUser?.role, 'Reset grading scale to defaults');
    showToast('✅ Grading scale reset to defaults', 'success');
    renderGradingScale(document.getElementById('dynamic-content'));
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT GRADING SCALE
// ──────────────────────────────────────────────────────────────────────

function exportGradingScale() {
    const grades = state.gradingScale || DEFAULT_GRADES;
    const data = grades.map(g => ({
        'Grade': g.grade,
        'Min %': g.min_percentage !== undefined ? g.min_percentage : g.min,
        'Max %': g.max_percentage !== undefined ? g.max_percentage : g.max,
        'Description': g.description || g.desc || '',
        'Color': g.color || g.bg || '#10b981',
        'Order': g.sort_order || 0,
    }));

    exportToExcel(data, `Grading_Scale_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Grading scale exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// REFRESH GRADE PREVIEW
// ──────────────────────────────────────────────────────────────────────

async function refreshGradePreview() {
    const container = document.getElementById('grade-distribution-preview');
    if (!container) return;

    const grades = state.gradingScale || DEFAULT_GRADES;
    const termId = state.currentTerm?.id;

    // Count students by grade
    const counts = grades.map(() => 0);
    const students = (state.students || []).filter(s => s.status === 'Active');

    for (const student of students) {
        const assessments = (state.assessments || []).filter(a => a.class_id === student.class_id && (!termId || a.term_id === termId));
        if (!assessments.length) continue;

        let total = 0, max = 0;
        const studentMarks = (state.marks || []).filter(m => m.student_id === student.id);

        for (const a of assessments) {
            const mark = studentMarks.find(m => m.assessment_id === a.id);
            if (mark) {
                total += mark.score;
                max += a.max_marks;
            }
        }

        if (max === 0) continue;
        const pct = (total / max) * 100;
        const grade = getGrade(pct, grades);
        const idx = grades.findIndex(g => g.grade === grade);
        if (idx >= 0) counts[idx]++;
    }

    const total = counts.reduce((a, b) => a + b, 0);

    if (total === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No grade data available for preview</div>';
        return;
    }

    container.innerHTML = grades.map((g, i) => {
        const count = counts[i] || 0;
        const pct = (count / total) * 100;
        const bar = '█'.repeat(Math.round(pct / 2)) + '░'.repeat(50 - Math.round(pct / 2));
        const color = g.color || g.bg || '#10b981';
        return `
            <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
                <span style="min-width:40px;font-weight:700;font-size:0.9rem;color:${color};">${g.grade}</span>
                <span style="flex:1;font-family:monospace;font-size:0.9rem;color:${color};">${bar}</span>
                <span style="min-width:50px;text-align:right;font-size:0.75rem;font-weight:600;">${pct.toFixed(1)}%</span>
                <span style="min-width:40px;text-align:right;font-size:0.7rem;color:var(--text-muted);">(${count})</span>
            </div>
        `;
    }).join('');
}