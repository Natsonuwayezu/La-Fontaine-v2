/**
 * ECOLE LA FONTAINE — Transcripts Module
 * Full academic transcripts with multi-year, GPA, PDF/Excel export
 * Last updated: 2026-07-04
 * 
 * CHANGES:
 * - Added academic year filtering (uses selected year from sidebar)
 * - Transcripts are year-specific
 * - Added year selector in UI
 * - Historical transcripts can be viewed
 * - GPA calculation uses year-filtered data
 * - Batch transcripts filtered by year
 */



const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import {
    state,
    getClassById,
    getTermById,
    getStudentById,
    getCurrentUser,
    getCurrentAcademicYear,
    getActiveAcademicYearId,
    getYearData,
    getCurrentYearData
} from '../../core/state.js';
import { esc, fmtDate, fmtPct, exportToExcel } from '../../core/utils.js';
import { getGrade, getGradeClass, calculateGPA, rankStudents } from '../../core/formulas.js';
import { getAll, get, getYearData as apiGetYearData } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────

let selectedYearId = null;

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderTranscripts(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role === 'accountant') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access transcripts.</div>';
        return;
    }

    await ensureStateLoaded();

    // Get selected year from state
    selectedYearId = state.filters?.academic_year_id || state.currentAcadYear?.id;
    const selectedYear = (state.academicYears || []).find(y => y.id === selectedYearId);
    const isActiveYear = selectedYear?.is_active === true;
    const years = (state.academicYears || []).sort((a, b) => a.id - b.id);

    const students = (state.students || [])
        .filter(s => s.status === 'Active' && (selectedYearId ? s.academic_year_id === selectedYearId : true))
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const terms = (state.terms || [])
        .filter(t => t.academic_year_id === selectedYearId);

    const yearLabel = selectedYear?.name || 'All Years';

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header" style="flex-wrap:wrap;gap:8px;">
                <span class="dash-card-title">📜 Academic Transcripts</span>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <select id="transcript-year-filter" onchange="window._loadTranscriptsByYear()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-medium);font-size:0.75rem;">
                        ${years.map(y => `
                            <option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>
                                ${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <span class="badge ${isActiveYear ? 'badge-success' : 'badge-neutral'}" style="font-size:0.6rem;">
                        ${isActiveYear ? '🟢 Active' : '🔒 Archived'}
                    </span>
                    <button class="btn btn-sm btn-outline" onclick="window._printTranscriptGuide()">📖 Guide</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div style="padding:6px 12px;background:var(--bg-tertiary);border-radius:6px;margin-bottom:16px;font-size:0.75rem;color:var(--text-muted);">
                    📅 ${esc(yearLabel)} · ${students.length} students · ${terms.length} terms
                    ${!isActiveYear ? ' · 🔒 Read-only (archived year)' : ''}
                </div>

                <!-- Tabs -->
                <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);margin-bottom:16px;">
                    <button class="tab-btn active" onclick="window._switchTranscriptTab('single', event)">👤 Single</button>
                    <button class="tab-btn" onclick="window._switchTranscriptTab('batch', event)">📚 Batch</button>
                    <button class="tab-btn" onclick="window._switchTranscriptTab('comparison', event)">📊 Comparison</button>
                    <button class="tab-btn" onclick="window._switchTranscriptTab('settings', event)">⚙️ Settings</button>
                </div>

                <!-- Single Tab -->
                <div id="transcript-single-tab">
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Student *</label>
                            <select id="transcript-student" onchange="window._loadTranscriptData()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select Student —</option>
                                ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Transcript Type</label>
                            <select id="transcript-type" onchange="window._toggleTranscriptOptions()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="full">Full Transcript</option>
                                <option value="year">By Academic Year</option>
                                <option value="term">By Term</option>
                            </select>
                        </div>
                        <div class="form-group" id="transcript-year-group">
                            <label>Academic Year</label>
                            <select id="transcript-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `<option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" id="transcript-term-group" style="display:none;">
                            <label>Term</label>
                            <select id="transcript-term" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Format</label>
                            <select id="transcript-format" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="pdf">PDF</option>
                                <option value="excel">Excel</option>
                                <option value="print">Print</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                        <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;"><input type="checkbox" id="include-gpa" checked> GPA</label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;"><input type="checkbox" id="include-rank" checked> Rank</label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;"><input type="checkbox" id="include-attendance-summary" checked> Attendance</label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;"><input type="checkbox" id="include-teacher-comments"> Comments</label>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="window._generateTranscript()">📄 Generate</button>
                        <button class="btn btn-outline" onclick="window._previewTranscript()">👁️ Preview</button>
                        <button class="btn btn-outline" onclick="window._resetTranscriptForm()">↻ Reset</button>
                    </div>
                    <div id="transcript-preview" style="margin-top:16px;display:none;"></div>
                </div>

                <!-- Batch Tab -->
                <div id="transcript-batch-tab" style="display:none;">
                    <div class="alert alert-info">
                        <strong>Batch Transcripts:</strong> Generate transcripts for all students in a class for the selected year.
                    </div>
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Class *</label>
                            <select id="batch-class" onchange="window._loadBatchTranscriptStudents()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">Select Class</option>
                                ${(state.classes || []).filter(c => c.is_active !== false).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year</label>
                            <select id="batch-year" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `<option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Output Format</label>
                            <select id="batch-format" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="excel">Excel</option>
                                <option value="combined">Combined PDF</option>
                                <option value="zip">ZIP (Separate Files)</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;margin-bottom:12px;">
                        <button class="btn btn-sm btn-outline" onclick="window._selectAllBatchStudents(true)">✓ Select All</button>
                        <button class="btn btn-sm btn-outline" onclick="window._selectAllBatchStudents(false)">✗ Deselect All</button>
                    </div>
                    <div id="batch-students-list" style="max-height:300px;overflow-y:auto;border:1px solid var(--border-light);border-radius:6px;padding:8px;">
                        <div class="alert alert-info">Select a class to load students for ${esc(yearLabel)}</div>
                    </div>
                    <div class="btn-group" style="margin-top:12px;">
                        <button class="btn btn-primary" onclick="window._generateBatchTranscripts()">📄 Generate Batch</button>
                        <button class="btn btn-outline" onclick="window._exportBatchTranscriptList()">📥 Export Student List</button>
                    </div>
                </div>

                <!-- Comparison Tab -->
                <div id="transcript-comparison-tab" style="display:none;">
                    <div class="alert alert-info">
                        <strong>Student Comparison:</strong> Compare two students side by side for the selected year.
                    </div>
                    <div class="form-grid" style="margin-bottom:16px;">
                        <div class="form-group">
                            <label>Student 1 *</label>
                            <select id="compare-student-1" onchange="window._loadComparisonData()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select Student —</option>
                                ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Student 2 *</label>
                            <select id="compare-student-2" onchange="window._loadComparisonData()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="">— Select Student —</option>
                                ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Academic Year</label>
                            <select id="compare-year" onchange="window._loadComparisonData()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                ${years.map(y => `<option value="${y.id}" ${y.id === selectedYearId ? 'selected' : ''}>${esc(y.name)} ${y.id === state.currentAcadYear?.id ? '🟢' : ''}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div id="comparison-content" style="margin-top:16px;"></div>
                </div>

                <!-- Settings Tab -->
                <div id="transcript-settings-tab" style="display:none;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Default Format</label>
                            <select id="default-format" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="pdf" ${localStorage.getItem('transcript_default_format') === 'pdf' || !localStorage.getItem('transcript_default_format') ? 'selected' : ''}>PDF</option>
                                <option value="excel" ${localStorage.getItem('transcript_default_format') === 'excel' ? 'selected' : ''}>Excel</option>
                                <option value="print" ${localStorage.getItem('transcript_default_format') === 'print' ? 'selected' : ''}>Print</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>GPA Scale</label>
                            <select id="gpa-scale" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="4.0" ${localStorage.getItem('transcript_gpa_scale') === '4.0' || !localStorage.getItem('transcript_gpa_scale') ? 'selected' : ''}>4.0 Scale</option>
                                <option value="5.0" ${localStorage.getItem('transcript_gpa_scale') === '5.0' ? 'selected' : ''}>5.0 Scale</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Include Letterhead</label>
                            <select id="include-letterhead" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="true" ${localStorage.getItem('transcript_include_letterhead') !== 'false' ? 'selected' : ''}>Yes</option>
                                <option value="false" ${localStorage.getItem('transcript_include_letterhead') === 'false' ? 'selected' : ''}>No</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Signature Style</label>
                            <select id="signature-style" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-medium);width:100%;">
                                <option value="printed" ${localStorage.getItem('transcript_signature_style') !== 'digital' ? 'selected' : ''}>Printed</option>
                                <option value="digital" ${localStorage.getItem('transcript_signature_style') === 'digital' ? 'selected' : ''}>Digital</option>
                            </select>
                        </div>
                    </div>
                    <div class="btn-group" style="margin-top:16px;">
                        <button class="btn btn-primary" onclick="window._saveTranscriptSettings()">💾 Save Settings</button>
                        <button class="btn btn-outline" onclick="window._resetTranscriptSettings()">🔄 Reset to Defaults</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    window._switchTranscriptTab = switchTranscriptTab;
    window._toggleTranscriptOptions = toggleTranscriptOptions;
    window._loadTranscriptData = loadTranscriptData;
    window._generateTranscript = generateTranscript;
    window._previewTranscript = previewTranscript;
    window._resetTranscriptForm = resetTranscriptForm;
    window._loadBatchTranscriptStudents = loadBatchTranscriptStudents;
    window._selectAllBatchStudents = selectAllBatchStudents;
    window._generateBatchTranscripts = generateBatchTranscripts;
    window._exportBatchTranscriptList = exportBatchTranscriptList;
    window._loadComparisonData = loadComparisonData;
    window._saveTranscriptSettings = saveTranscriptSettings;
    window._resetTranscriptSettings = resetTranscriptSettings;
    window._printTranscriptGuide = printTranscriptGuide;
    window._loadTranscriptsByYear = loadTranscriptsByYear;
}

// ──────────────────────────────────────────────────────────────────────
// LOAD TRANSCRIPTS BY YEAR
// ──────────────────────────────────────────────────────────────────────

async function loadTranscriptsByYear() {
    const yearId = document.getElementById('transcript-year-filter')?.value;
    if (yearId) {
        selectedYearId = parseInt(yearId);
        state.filters.academic_year_id = selectedYearId;
        renderTranscripts(document.getElementById('dynamic-content'));
    }
}

// ──────────────────────────────────────────────────────────────────────
// SWITCH TRANSCRIPT TAB
// ──────────────────────────────────────────────────────────────────────

function switchTranscriptTab(tabName, event) {
    ['single', 'batch', 'comparison', 'settings'].forEach(t => {
        const el = document.getElementById(`transcript-${t}-tab`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

// ──────────────────────────────────────────────────────────────────────
// TOGGLE TRANSCRIPT OPTIONS
// ──────────────────────────────────────────────────────────────────────

function toggleTranscriptOptions() {
    const type = document.getElementById('transcript-type')?.value;
    const yearGroup = document.getElementById('transcript-year-group');
    const termGroup = document.getElementById('transcript-term-group');

    if (yearGroup) yearGroup.style.display = (type === 'year' || type === 'full') ? 'block' : 'none';
    if (termGroup) termGroup.style.display = type === 'term' ? 'block' : 'none';
}

// ──────────────────────────────────────────────────────────────────────
// LOAD TRANSCRIPT DATA
// ──────────────────────────────────────────────────────────────────────

async function loadTranscriptData() {
    const studentId = document.getElementById('transcript-student')?.value;
    if (!studentId) return;

    const preview = document.getElementById('transcript-preview');
    preview.style.display = 'block';
    preview.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading...</p></div>';

    try {
        const data = await generateTranscriptData(studentId, selectedYearId);
        if (!data) {
            preview.innerHTML = '<div class="alert alert-warning">No data available for this student</div>';
            return;
        }

        window._currentTranscriptData = data;

        // Show summary
        const yearLabel = (state.academicYears || []).find(y => y.id === selectedYearId)?.name || 'Current Year';
        preview.innerHTML = `
            <div class="alert alert-success">
                <strong>✅ Data loaded for ${esc(data.student.first_name)} ${esc(data.student.last_name)}</strong><br>
                ${data.years.length} terms · GPA: <strong>${data.overallGPA}</strong> · 📅 ${esc(yearLabel)}
            </div>
            <div class="table-wrapper">
                <table class="data-table" style="font-size:0.8rem;">
                    <thead>
                        <tr>
                            <th>Term</th>
                            <th style="text-align:right;">Score</th>
                            <th style="text-align:right;">Max</th>
                            <th style="text-align:center;">%</th>
                            <th style="text-align:center;">Grade</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.years.map(y => y.terms.map(t => `
                            <tr>
                                <td><strong>${esc(t.term.name)}</strong></td>
                                <td style="text-align:right;">${t.score.toFixed(1)}</td>
                                <td style="text-align:right;">${t.max}</td>
                                <td style="text-align:center;"><span class="badge ${getGradeClass(t.percentage)}">${t.percentage.toFixed(1)}%</span></td>
                                <td style="text-align:center;">${t.grade}</td>
                            </tr>
                        `).join('')).join('')}
                    </tbody>
                </table>
            </div>
            <div class="btn-group" style="margin-top:12px;">
                <button class="btn btn-primary" onclick="window._generateTranscript()">📄 Generate Full Transcript</button>
            </div>
        `;

    } catch (error) {
        preview.innerHTML = `<div class="alert alert-danger">Error: ${esc(error.message)}</div>`;
    }
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE TRANSCRIPT DATA — With Year Filtering
// ──────────────────────────────────────────────────────────────────────

async function generateTranscriptData(studentId, yearId) {
    const student = getStudentById(studentId);
    if (!student) return null;

    const cls = getClassById(student.class_id);
    const allMarks = (state.marks || []).filter(m => m.student_id == studentId && !m.is_archived);
    const allAssessments = state.assessments || [];

    // Get terms for the selected year
    const year = (state.academicYears || []).find(y => y.id === (yearId || selectedYearId || state.currentAcadYear?.id));
    if (!year) return null;

    const terms = (state.terms || [])
        .filter(t => t.academic_year_id === year.id)
        .sort((a, b) => a.term_number - b.term_number);

    if (!terms.length) return null;

    const yearAssessments = allAssessments.filter(a => a.academic_year_id === year.id);

    let yearTotalScore = 0, yearTotalMax = 0;
    const termData = [];

    for (const term of terms) {
        const termAssessments = yearAssessments.filter(a => a.term_id === term.id);
        let termScore = 0, termMax = 0;

        for (const a of termAssessments) {
            const mark = allMarks.find(m => m.assessment_id === a.id && m.academic_year_id === year.id);
            if (mark) {
                termScore += mark.score;
                termMax += a.max_marks;
            }
        }

        const termPct = termMax > 0 ? (termScore / termMax) * 100 : 0;
        termData.push({
            term: term,
            score: termScore,
            max: termMax,
            percentage: termPct,
            grade: getGrade(termPct),
        });

        yearTotalScore += termScore;
        yearTotalMax += termMax;
    }

    const yearPct = yearTotalMax > 0 ? (yearTotalScore / yearTotalMax) * 100 : 0;
    const yearData = [{
        year: year,
        terms: termData,
        totalScore: yearTotalScore,
        totalMax: yearTotalMax,
        percentage: yearPct,
        grade: getGrade(yearPct),
    }];

    // Calculate overall GPA
    const allPercentages = termData.map(t => t.percentage).filter(p => p > 0);
    const overallGPA = calculateGPA(allPercentages, localStorage.getItem('transcript_gpa_scale') || '4.0');

    // Calculate rank for the year
    let rank = '—';
    const classStudents = (state.students || [])
        .filter(s => s.class_id === student.class_id && s.status === 'Active' && (yearId ? s.academic_year_id == yearId : true));

    const studentScores = classStudents.map(s => {
        const sMarks = (state.marks || []).filter(m => m.student_id === s.id && !m.is_archived);
        const sAssessments = allAssessments.filter(a => a.academic_year_id === year.id);
        let score = 0, max = 0;
        for (const a of sAssessments) {
            const mark = sMarks.find(m => m.assessment_id === a.id);
            if (mark) { score += mark.score; max += a.max_marks; }
        }
        return { id: s.id, pct: max > 0 ? (score / max) * 100 : 0 };
    });
    studentScores.sort((a, b) => b.pct - a.pct);
    const idx = studentScores.findIndex(s => s.id == studentId);
    if (idx >= 0) {
        const rankNum = idx + 1;
        const suffix = rankNum === 1 ? 'st' : rankNum === 2 ? 'nd' : rankNum === 3 ? 'rd' : 'th';
        rank = `${rankNum}${suffix} of ${studentScores.length}`;
    }

    // Get attendance for the year
    let attendance = { present: 0, total: 0, rate: 0 };
    try {
        const attRecords = await get('attendance', { student_id: studentId });
        const yearAtt = attRecords.filter(a => {
            const term = state.terms.find(t => t.id === a.term_id);
            return term?.academic_year_id === year.id;
        });
        attendance.total = yearAtt.length;
        attendance.present = yearAtt.filter(a => a.status === 'present' || a.status === 'late').length;
        attendance.rate = attendance.total > 0 ? (attendance.present / attendance.total) * 100 : 0;
    } catch (e) {
        // Attendance table may not exist
    }

    return {
        student,
        cls,
        years: yearData,
        overallGPA,
        rank,
        attendance,
        year: year,
    };
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE TRANSCRIPT
// ──────────────────────────────────────────────────────────────────────

async function generateTranscript() {
    const data = window._currentTranscriptData;
    if (!data) {
        showToast('Please select a student first', 'warning');
        return;
    }

    const format = document.getElementById('transcript-format')?.value || 'pdf';
    const includeGPA = document.getElementById('include-gpa')?.checked;
    const includeRank = document.getElementById('include-rank')?.checked;
    const includeAttendance = document.getElementById('include-attendance-summary')?.checked;
    const includeComments = document.getElementById('include-teacher-comments')?.checked;
    const transcriptType = document.getElementById('transcript-type')?.value;
    const yearId = document.getElementById('transcript-year')?.value;
    const termId = document.getElementById('transcript-term')?.value;

    let transcriptData = data;

    // Filter by type
    if (transcriptType === 'year' && yearId) {
        transcriptData = {
            ...data,
            years: data.years.filter(y => y.year.id == yearId),
        };
    } else if (transcriptType === 'term' && termId) {
        const term = getTermById(termId);
        transcriptData = {
            ...data,
            years: [{
                year: data.year || state.academicYears.find(y => y.id === term?.academic_year_id),
                terms: data.years.find(y => y.year.id === term?.academic_year_id)?.terms.filter(t => t.term.id == termId) || [],
                totalScore: 0,
                totalMax: 0,
                percentage: 0,
                grade: '—',
            }],
        };
    }

    if (format === 'pdf') {
        await generateTranscriptPDF(transcriptData, { includeGPA, includeRank, includeAttendance, includeComments });
    } else if (format === 'excel') {
        await generateTranscriptExcel(transcriptData);
    } else {
        openTranscriptPrintView(transcriptData, { includeGPA, includeRank, includeAttendance, includeComments });
    }

    showToast('✅ Transcript generated', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE TRANSCRIPT PDF
// ──────────────────────────────────────────────────────────────────────

async function generateTranscriptPDF(data, options) {
    const html = buildTranscriptHTML(data, options);
    const element = document.createElement('div');
    element.innerHTML = html;

    try {
        if (typeof html2pdf === 'undefined') {
            openTranscriptPrintView(data, options);
            return;
        }

        const orientation = data.years.length > 3 ? 'landscape' : 'portrait';

        await html2pdf().set({
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `Transcript_${data.student.first_name}_${data.student.last_name}_${data.year?.name || 'Current'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'a4', orientation: orientation },
        }).from(element).save();
    } catch (e) {
        showToast('PDF generation failed. Using print view instead.', 'warning');
        openTranscriptPrintView(data, options);
    }
}

// ──────────────────────────────────────────────────────────────────────
// GENERATE TRANSCRIPT EXCEL
// ──────────────────────────────────────────────────────────────────────

async function generateTranscriptExcel(data) {
    const exportData = [];

    for (const year of data.years) {
        for (const term of year.terms) {
            exportData.push({
                'Academic Year': year.year.name,
                'Term': term.term.name,
                'Term Score': term.score,
                'Term Max': term.max,
                'Term Percentage (%)': term.percentage.toFixed(1),
                'Term Grade': term.grade,
                'Year Average (%)': year.percentage.toFixed(1),
                'Year Grade': year.grade,
            });
        }
    }

    if (exportData.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }

    exportData.push({
        'Academic Year': 'SUMMARY',
        'Term': `Overall GPA: ${data.overallGPA}`,
        'Term Score': '',
        'Term Max': '',
        'Term Percentage (%)': '',
        'Term Grade': '',
        'Year Average (%)': '',
        'Year Grade': `Rank: ${data.rank}`,
    });

    exportToExcel(exportData, `Transcript_${data.student.first_name}_${data.student.last_name}_${data.year?.name || 'Current'}`);
}

// ──────────────────────────────────────────────────────────────────────
// BUILD TRANSCRIPT HTML — With Year Display
// ──────────────────────────────────────────────────────────────────────

function buildTranscriptHTML(data, options) {
    const school = state.schoolSettings || {};
    const includeLetterhead = localStorage.getItem('transcript_include_letterhead') !== 'false';
    const signatureStyle = localStorage.getItem('transcript_signature_style') || 'printed';
    const logoHtml = school.school_logo
        ? `<img src="${school.school_logo}" style="width:48px;height:48px;object-fit:contain;border-radius:8px;">`
        : '🏫';

    const yearName = data.year?.name || data.years[0]?.year?.name || 'Current Year';

    let termRows = '';
    for (const year of data.years) {
        for (const term of year.terms) {
            termRows += `
                <tr>
                    <td><strong>${esc(year.year.name)}</strong></td>
                    <td>${esc(term.term.name)}</td>
                    <td style="text-align:right;">${term.score.toFixed(1)}</td>
                    <td style="text-align:right;">${term.max}</td>
                    <td style="text-align:center;"><span class="badge ${getGradeClass(term.percentage)}">${term.percentage.toFixed(1)}%</span></td>
                    <td style="text-align:center;">${term.grade}</td>
                </tr>
            `;
        }

        termRows += `
            <tr style="background:var(--bg-tertiary);font-weight:700;">
                <td colspan="2" style="text-align:right;">YEAR TOTAL:</td>
                <td style="text-align:right;">${year.totalScore.toFixed(1)}</td>
                <td style="text-align:right;">${year.totalMax}</td>
                <td style="text-align:center;">${year.percentage.toFixed(1)}%</td>
                <td style="text-align:center;">${year.grade}</td>
            </tr>
        `;
    }

    const gpaSection = options?.includeGPA ? `
        <div style="display:flex;gap:16px;font-size:0.8rem;">
            <span><strong>Overall GPA:</strong> ${data.overallGPA}</span>
            <span><strong>Scale:</strong> ${localStorage.getItem('transcript_gpa_scale') || '4.0'}</span>
        </div>
    ` : '';

    const rankSection = options?.includeRank ? `
        <div style="font-size:0.8rem;">
            <strong>Class Rank:</strong> ${data.rank}
        </div>
    ` : '';

    const attendanceSection = options?.includeAttendance && data.attendance ? `
        <div style="font-size:0.8rem;">
            <strong>Attendance:</strong> ${data.attendance.present}/${data.attendance.total} (${data.attendance.rate.toFixed(1)}%)
        </div>
    ` : '';

    return `
        <div style="max-width:900px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;font-family:'DM Sans',Arial,sans-serif;">
            <!-- Header -->
            <div style="${includeLetterhead ? 'background:#1a3a5c;color:white;padding:20px 24px;display:flex;gap:16px;align-items:center;' : 'padding:16px 24px;border-bottom:2px solid #1a3a5c;display:flex;gap:16px;align-items:center;'}">
                <div style="width:48px;height:48px;flex-shrink:0;display:flex;align-items:center;justify-content:center;${includeLetterhead ? 'background:rgba(255,255,255,0.15);border-radius:8px;' : ''}">${logoHtml}</div>
                <div style="flex:1;">
                    <div style="${includeLetterhead ? 'font-size:1.1rem;font-weight:700;' : 'font-size:1.1rem;font-weight:700;color:#1a3a5c;'}">${esc(school.school_name || 'ECOLE LA FONTAINE')}</div>
                    <div style="${includeLetterhead ? 'font-size:0.7rem;opacity:0.8;' : 'font-size:0.7rem;color:#64748b;'}">${esc(school.school_address || 'Rubavu, Rwanda')}</div>
                    <div style="font-size:0.85rem;font-weight:700;margin-top:4px;">ACADEMIC TRANSCRIPT — ${esc(yearName)}</div>
                </div>
            </div>

            <!-- Student Info -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:0.8rem;">
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">Student</strong>${esc(data.student.first_name)} ${esc(data.student.last_name)}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">Code</strong>${esc(data.student.student_code || '—')}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">Class</strong>${esc(data.cls?.name || '—')}</div>
                <div><strong style="display:block;font-size:0.65rem;text-transform:uppercase;color:#64748b;">Academic Year</strong>${esc(yearName)}</div>
                ${gpaSection ? `<div>${gpaSection}</div>` : ''}
                ${rankSection ? `<div>${rankSection}</div>` : ''}
                ${attendanceSection ? `<div>${attendanceSection}</div>` : ''}
            </div>

            <!-- Transcript Table -->
            <div style="padding:12px 16px;overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                    <thead>
                        <tr style="background:#e8f0fe;color:#1a3a5c;">
                            <th style="padding:6px 8px;text-align:left;border:1px solid #c7d8f8;">Year</th>
                            <th style="padding:6px 8px;text-align:left;border:1px solid #c7d8f8;">Term</th>
                            <th style="padding:6px 8px;text-align:right;border:1px solid #c7d8f8;">Score</th>
                            <th style="padding:6px 8px;text-align:right;border:1px solid #c7d8f8;">Max</th>
                            <th style="padding:6px 8px;text-align:center;border:1px solid #c7d8f8;">%</th>
                            <th style="padding:6px 8px;text-align:center;border:1px solid #c7d8f8;">Grade</th>
                        </tr>
                    </thead>
                    <tbody>${termRows}</tbody>
                </table>
            </div>

            <!-- Footer -->
            <div style="padding:12px 20px;background:#f8fafc;text-align:center;font-size:0.7rem;color:#64748b;border-top:1px solid #e2e8f0;line-height:1.8;">
                <div>Done at ECOLE LA FONTAINE, ON ${fmtDate(new Date())}</div>
                <div>${esc(school.report_footer_line2 || school.head_teacher || 'UWAYO GANZA Eugene')} — HEAD OF SCHOOL</div>
                ${school.school_motto ? `<div style="font-style:italic;font-size:0.65rem;">"${esc(school.school_motto)}"</div>` : ''}
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────────
// OPEN TRANSCRIPT PRINT VIEW
// ──────────────────────────────────────────────────────────────────────

function openTranscriptPrintView(data, options) {
    const html = buildTranscriptHTML(data, options);
    const win = window.open('', '_blank');
    if (!win) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Transcript - ${data.student.first_name} ${data.student.last_name}</title>
            <style>
                body { font-family: 'DM Sans', Arial, sans-serif; padding: 20px; background: white; }
                .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; }
                .grade-Ap { background: #d1fae5; color: #065f46; }
                .grade-A { background: #d1fae5; color: #065f46; }
                .grade-B { background: #fef3c7; color: #92400e; }
                .grade-C { background: #ffedd5; color: #9a3412; }
                .grade-D { background: #fee2e2; color: #991b1b; }
                .grade-F { background: #fee2e2; color: #991b1b; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            ${html}
            <script>
                window.print();
                setTimeout(function() { window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
}

// ──────────────────────────────────────────────────────────────────────
// BATCH TRANSCRIPT FUNCTIONS — With Year Filtering
// ──────────────────────────────────────────────────────────────────────

async function loadBatchTranscriptStudents() {
    const classId = document.getElementById('batch-class')?.value;
    const container = document.getElementById('batch-students-list');
    if (!classId) {
        container.innerHTML = '<div class="alert alert-info">Select a class to load students</div>';
        return;
    }

    const yearId = document.getElementById('batch-year')?.value || selectedYearId;
    const yearLabel = (state.academicYears || []).find(y => y.id === yearId)?.name || 'Current Year';

    const students = (state.students || [])
        .filter(s => s.class_id == classId && s.status === 'Active' && (yearId ? s.academic_year_id == yearId : true))
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

    if (!students.length) {
        container.innerHTML = `<div class="alert alert-warning">No active students in this class for ${esc(yearLabel)}</div>`;
        return;
    }

    container.innerHTML = students.map(s => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border-light);cursor:pointer;">
            <input type="checkbox" class="batch-student-cb" value="${s.id}">
            <span><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong> (${esc(s.student_code || '')})</span>
        </label>
    `).join('') + `
        <div style="padding:6px;font-size:0.7rem;color:var(--text-muted);text-align:center;">
            📅 ${esc(yearLabel)} · ${students.length} students
        </div>
    `;
}

function selectAllBatchStudents(select) {
    document.querySelectorAll('.batch-student-cb').forEach(cb => cb.checked = select);
}

async function generateBatchTranscripts() {
    const selected = [...document.querySelectorAll('.batch-student-cb:checked')];
    if (!selected.length) {
        showToast('No students selected', 'warning');
        return;
    }

    const classId = document.getElementById('batch-class')?.value;
    const yearId = document.getElementById('batch-year')?.value || selectedYearId;
    const format = document.getElementById('batch-format')?.value;

    if (!classId) {
        showToast('Select a class', 'warning');
        return;
    }

    const yearLabel = (state.academicYears || []).find(y => y.id === yearId)?.name || 'Current Year';
    showToast(`⏳ Generating ${selected.length} transcripts for ${esc(yearLabel)}...`, 'info', 3000);

    const results = [];
    let completed = 0;

    for (const cb of selected) {
        const studentId = parseInt(cb.value);
        try {
            const data = await generateTranscriptData(studentId, yearId);
            if (data) {
                results.push({ studentId, data, success: true });
            } else {
                results.push({ studentId, success: false, error: 'No data' });
            }
        } catch (e) {
            results.push({ studentId, success: false, error: e.message });
        }
        completed++;
    }

    const successCount = results.filter(r => r.success).length;

    if (format === 'excel') {
        exportBatchTranscriptsExcel(results.filter(r => r.success), yearLabel);
    } else if (format === 'combined') {
        await generateCombinedTranscriptsPDF(results.filter(r => r.success), yearLabel);
    } else {
        await generateSeparateTranscriptsZIP(results.filter(r => r.success), yearLabel);
    }

    showToast(`✅ Generated ${successCount}/${selected.length} transcripts`, successCount === selected.length ? 'success' : 'warning');
}

function exportBatchTranscriptsExcel(results, yearLabel) {
    const data = [];
    for (const result of results) {
        if (!result.success) continue;
        for (const year of result.data.years) {
            for (const term of year.terms) {
                data.push({
                    'Student': result.data.student.first_name + ' ' + result.data.student.last_name,
                    'Student Code': result.data.student.student_code || '',
                    'Year': year.year.name,
                    'Term': term.term.name,
                    'Score': term.score,
                    'Max': term.max,
                    'Percentage (%)': term.percentage.toFixed(1),
                    'Grade': term.grade,
                });
            }
        }
    }
    exportToExcel(data, `Batch_Transcripts_${yearLabel}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Batch transcripts exported', 'success');
}

async function generateCombinedTranscriptsPDF(results, yearLabel) {
    let combinedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Combined Transcripts - ${esc(yearLabel)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .transcript { max-width: 800px; margin: 20px auto; border: 1px solid #ccc; border-radius: 8px; padding: 16px; page-break-after: always; }
                h2 { text-align: center; color: #1a3a5c; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; }
                th { background: #1a3a5c; color: white; }
                .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 8px; }
                .grade-Ap { background: #d1fae5; color: #065f46; }
                .grade-A { background: #d1fae5; color: #065f46; }
                .grade-B { background: #fef3c7; color: #92400e; }
                .grade-C { background: #ffedd5; color: #9a3412; }
                .grade-D { background: #fee2e2; color: #991b1b; }
                .grade-F { background: #fee2e2; color: #991b1b; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1 style="text-align:center;">${esc(state.schoolSettings?.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2 style="text-align:center;">Combined Transcripts — ${esc(yearLabel)}</h2>
    `;

    for (const result of results) {
        if (!result.success) continue;
        const data = result.data;
        let rows = '';
        for (const year of data.years) {
            for (const term of year.terms) {
                rows += `
                    <tr>
                        <td>${esc(year.year.name)}</td>
                        <td>${esc(term.term.name)}</td>
                        <td style="text-align:right;">${term.score.toFixed(1)}</td>
                        <td style="text-align:right;">${term.max}</td>
                        <td><span class="badge ${getGradeClass(term.percentage)}">${term.percentage.toFixed(1)}%</span></td>
                        <td>${term.grade}</td>
                    </tr>
                `;
            }
        }

        combinedHtml += `
            <div class="transcript">
                <h3 style="text-align:center;">${esc(data.student.first_name)} ${esc(data.student.last_name)} (${esc(data.student.student_code || '')})</h3>
                <p style="text-align:center;">Class: ${esc(data.cls?.name || '—')}</p>
                <table>
                    <thead><tr><th>Year</th><th>Term</th><th>Score</th><th>Max</th><th>%</th><th>Grade</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <p style="text-align:center;font-size:9px;color:#666;margin-top:8px;">GPA: ${data.overallGPA} · Generated: ${new Date().toLocaleString()}</p>
            </div>
        `;
    }

    combinedHtml += `</body></html>`;

    const element = document.createElement('div');
    element.innerHTML = combinedHtml;

    try {
        if (typeof html2pdf === 'undefined') {
            showToast('PDF library not loaded. Use Excel format instead.', 'warning');
            return;
        }
        await html2pdf().set({
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `Combined_Transcripts_${yearLabel}_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        }).from(element).save();
        showToast('✅ Combined PDF generated', 'success');
    } catch (e) {
        showToast('PDF generation failed: ' + e.message, 'error');
    }
}

async function generateSeparateTranscriptsZIP(results, yearLabel) {
    if (typeof JSZip === 'undefined') {
        showToast('JSZip library not loaded. Use Excel or combined PDF.', 'warning');
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder(`Transcripts_${yearLabel}_${new Date().toISOString().split('T')[0]}`);

    for (const result of results) {
        if (!result.success) continue;
        const data = result.data;
        const html = buildTranscriptHTML(data, { includeGPA: true, includeRank: true, includeAttendance: false, includeComments: false });
        const name = `${data.student.first_name}_${data.student.last_name}`.replace(/\s/g, '_');
        folder.file(`${name}.html`, html);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transcripts_${yearLabel}_${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ ZIP downloaded', 'success');
}

function exportBatchTranscriptList() {
    const selected = [...document.querySelectorAll('.batch-student-cb:checked')];
    if (!selected.length) {
        showToast('No students selected', 'warning');
        return;
    }

    const yearId = document.getElementById('batch-year')?.value || selectedYearId;
    const yearLabel = (state.academicYears || []).find(y => y.id === yearId)?.name || 'Current Year';

    const data = selected.map(cb => {
        const student = getStudentById(parseInt(cb.value));
        return {
            'Student Name': student ? `${student.first_name} ${student.last_name}` : '—',
            'Student Code': student?.student_code || '',
        };
    });

    exportToExcel(data, `Batch_Student_List_${yearLabel}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Student list exported', 'success');
}

// ──────────────────────────────────────────────────────────────────────
// SETTINGS FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

function saveTranscriptSettings() {
    const format = document.getElementById('default-format')?.value;
    const gpaScale = document.getElementById('gpa-scale')?.value;
    const letterhead = document.getElementById('include-letterhead')?.value;
    const signature = document.getElementById('signature-style')?.value;

    if (format) localStorage.setItem('transcript_default_format', format);
    if (gpaScale) localStorage.setItem('transcript_gpa_scale', gpaScale);
    if (letterhead) localStorage.setItem('transcript_include_letterhead', letterhead);
    if (signature) localStorage.setItem('transcript_signature_style', signature);

    const formatSelect = document.getElementById('transcript-format');
    if (formatSelect && format) formatSelect.value = format;

    showToast('✅ Transcript settings saved', 'success');
}

function resetTranscriptSettings() {
    localStorage.removeItem('transcript_default_format');
    localStorage.removeItem('transcript_gpa_scale');
    localStorage.removeItem('transcript_include_letterhead');
    localStorage.removeItem('transcript_signature_style');

    document.getElementById('default-format').value = 'pdf';
    document.getElementById('gpa-scale').value = '4.0';
    document.getElementById('include-letterhead').value = 'true';
    document.getElementById('signature-style').value = 'printed';
    document.getElementById('transcript-format').value = 'pdf';

    showToast('✅ Settings reset to defaults', 'success');
}

function printTranscriptGuide() {
    const win = window.open('', '_blank');
    if (!win) {
        showToast('Popup blocked. Please allow popups.', 'warning');
        return;
    }

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Transcript Guide</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                h1 { color: #1a3a5c; text-align: center; }
                h2 { color: #1a3a5c; margin-top: 20px; }
                .step { margin: 12px 0; padding: 10px; background: #f8fafc; border-radius: 8px; }
                .step-number { display: inline-block; width: 28px; height: 28px; background: #1a3a5c; color: white; border-radius: 50%; text-align: center; line-height: 28px; margin-right: 10px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>📜 Academic Transcript Guide</h1>
            <p style="text-align:center;">How to generate and use academic transcripts</p>

            <h2>📋 Single Transcript</h2>
            <div class="step"><span class="step-number">1</span> Select a student from the dropdown</div>
            <div class="step"><span class="step-number">2</span> Choose transcript type (Full/Year/Term)</div>
            <div class="step"><span class="step-number">3</span> Select output format (PDF/Excel/Print)</div>
            <div class="step"><span class="step-number">4</span> Click "Generate"</div>

            <h2>📚 Batch Transcripts</h2>
            <div class="step"><span class="step-number">1</span> Select a class</div>
            <div class="step"><span class="step-number">2</span> Choose academic year</div>
            <div class="step"><span class="step-number">3</span> Select students</div>
            <div class="step"><span class="step-number">4</span> Choose output format (ZIP/Combined PDF/Excel)</div>

            <h2>📊 Student Comparison</h2>
            <div class="step"><span class="step-number">1</span> Select two students</div>
            <div class="step"><span class="step-number">2</span> Choose academic year</div>
            <div class="step"><span class="step-number">3</span> View side-by-side comparison</div>

            <p style="margin-top:30px;text-align:center;font-size:11px;color:#666;">
                ECOLE LA FONTAINE School Management System<br>
                Generated on ${new Date().toLocaleString()}
            </p>
            <script>
                window.print();
                setTimeout(function() { window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
}