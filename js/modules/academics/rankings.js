const state = window.state || {}; // state alias — resolves to global state
// ============================================================
// RANKINGS MODULE - Student ranking and position calculations
// ============================================================


// Ranking state
let _currentRankingClass = null;
let _currentRankingTerm = null;
let _currentRankingPage = 1;
const ITEMS_PER_PAGE = 20;

// Render Rankings page
async function renderRankings(container) {
    if (isAccountant()) {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Accountant cannot access rankings.</div>';
        return;
    }

    await ensureStateLoaded();

    let classes = (state.classes || []).filter(c => c.is_active !== false);
    if (isTeacher()) {
        const assignments = await getAll('teacher_assignments', { teacher_id: getCurrentUser()?.id });
        const classIds = [...new Set(assignments.map(a => a.class_id))];
        classes = classes.filter(c => classIds.includes(c.id));
    }

    const terms = (state.terms || []).filter(t => t.academic_year_id === state.currentAcadYear?.id);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🏆 Student Rankings</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="exportRankingsToExcel()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar">
                    <select id="rank-class" onchange="loadRankings()">
                        <option value="">-- Select Class --</option>
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <select id="rank-term" onchange="loadRankings()">
                        ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                    </select>
                    <button class="btn btn-primary" onclick="loadRankings()">📊 Load Rankings</button>
                </div>
                <div id="rankings-content">
                    <div class="alert alert-info" style="text-align:center;padding:40px">Select a class and term to view rankings</div>
                </div>
            </div>
        </div>
    `;
}

// Load rankings
window.loadRankings = async function () {
    const classId = document.getElementById('rank-class')?.value;
    const termId = document.getElementById('rank-term')?.value;
    const container = document.getElementById('rankings-content');

    if (!classId || !termId) {
        container.innerHTML = '<div class="alert alert-info" style="text-align:center;padding:40px">Select a class and term to view rankings</div>';
        return;
    }

    _currentRankingClass = parseInt(classId);
    _currentRankingTerm = parseInt(termId);
    _currentRankingPage = 1;

    container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Calculating rankings...</p></div>';

    const cls = getClassById(classId);
    const students = (state.students || []).filter(s => s.class_id == classId && s.status === 'Active');
    const assessments = (state.assessments || []).filter(a => a.class_id == classId && a.term_id == termId);

    if (assessments.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No assessments found for this class and term.</div>';
        return;
    }

    // Calculate percentages for all students
    const studentScores = [];
    for (const student of students) {
        let totalScore = 0;
        let totalMax = 0;

        for (const assessment of assessments) {
            const mark = (state.marks || []).find(m => m.assessment_id === assessment.id && m.student_id === student.id);
            if (mark) {
                totalScore += mark.score;
                totalMax += assessment.max_marks;
            }
        }

        const percentage = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
        studentScores.push({
            id: student.id,
            name: `${student.first_name} ${student.last_name}`,
            code: student.student_code,
            totalScore: totalScore,
            totalMax: totalMax,
            percentage: percentage,
            grade: getGrade(percentage)
        });
    }

    // Sort and rank
    studentScores.sort((a, b) => {
        if (b.percentage !== a.percentage) return b.percentage - a.percentage;
        return a.name.localeCompare(b.name);
    });

    let rank = 1;
    for (let i = 0; i < studentScores.length; i++) {
        if (i > 0 && studentScores[i].percentage === studentScores[i - 1].percentage) {
            studentScores[i].rank = studentScores[i - 1].rank;
        } else {
            studentScores[i].rank = rank;
        }
        rank = studentScores[i].rank + 1;
        studentScores[i].rankDisplay = `${studentScores[i].rank} of ${studentScores.length}`;
    }

    // Store for export
    window._currentRankingData = studentScores;

    // Paginate
    const totalPages = Math.ceil(studentScores.length / ITEMS_PER_PAGE);
    const start = (_currentRankingPage - 1) * ITEMS_PER_PAGE;
    const paginated = studentScores.slice(start, start + ITEMS_PER_PAGE);

    // Calculate class statistics
    const avgPercentage = studentScores.reduce((sum, s) => sum + s.percentage, 0) / studentScores.length;
    const passCount = studentScores.filter(s => s.percentage >= 50).length;
    const passRate = (passCount / studentScores.length) * 100;
    const topStudent = studentScores[0];

    let html = `
        <div class="stats-grid" style="margin-bottom:20px">
            <div class="stat-card"><div class="stat-value">${studentScores.length}</div><div class="stat-label">Total Students</div></div>
            <div class="stat-card"><div class="stat-value">${fmtPct(avgPercentage)}</div><div class="stat-label">Class Average</div></div>
            <div class="stat-card"><div class="stat-value">${passRate.toFixed(1)}%</div><div class="stat-label">Pass Rate</div></div>
            <div class="stat-card"><div class="stat-value">${topStudent ? esc(topStudent.name) : '—'}</div><div class="stat-label">Top Performer</div><div class="stat-trend up">${topStudent ? fmtPct(topStudent.percentage) : ''}</div></div>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:60px">Rank</th>
                        <th>Student Name</th>
                        <th>Student Code</th>
                        <th style="text-align:right">Total Score</th>
                        <th style="text-align:right">Max Score</th>
                        <th style="text-align:center">%</th>
                        <th style="text-align:center">Grade</th>
                    </tr>
                </thead>
                <tbody>
                    ${paginated.map(s => `
                        <tr>
                            <td style="text-align:center;font-weight:700">${s.rank}</span>
                            <td><strong>${esc(s.name)}</strong></span>
                            <td>${esc(s.code)}</span>
                            <td style="text-align:right">${s.totalScore.toFixed(1)}</span>
                            <td style="text-align:right">${s.totalMax}</span>
                            <td style="text-align:center"><span class="badge ${getGradeClass(s.percentage)}">${fmtPct(s.percentage)}</span></span>
                            <td style="text-align:center">${s.grade}</span>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="pagination" id="rankings-pagination"></div>
    `;

    container.innerHTML = html;

    // Render pagination
    const paginationContainer = document.getElementById('rankings-pagination');
    if (paginationContainer && totalPages > 1) {
        paginationContainer.innerHTML = '';
        for (let i = 1; i <= Math.min(totalPages, 10); i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === _currentRankingPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => {
                _currentRankingPage = i;
                loadRankings();
            };
            paginationContainer.appendChild(btn);
        }
    }
};

// Export rankings to Excel
window.exportRankingsToExcel = function () {
    if (!window._currentRankingData || window._currentRankingData.length === 0) {
        showToast('No ranking data to export', 'warning');
        return;
    }

    const cls = getClassById(_currentRankingClass);
    const term = (state.terms || []).find(t => t.id === _currentRankingTerm);

    const data = window._currentRankingData.map(s => ({
        'Rank': s.rank,
        'Student Name': s.name,
        'Student Code': s.code,
        'Total Score': s.totalScore,
        'Max Score': s.totalMax,
        'Percentage (%)': s.percentage.toFixed(1),
        'Grade': s.grade
    }));

    exportToExcel(data, `${cls?.name}_${term?.name}_Rankings`);
    showToast('✅ Rankings exported', 'success');
};

// Helper functions


async function ensureStateLoaded() {
    if (!state.classes.length) await refreshTable('classes');
    if (!state.terms.length) await refreshTable('terms');
    if (!state.assessments.length) await refreshTable('assessments');
}