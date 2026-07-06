// Advanced rankings: class, subject, overall, honour roll, trends
        // ════════════════════════════════════════════════════════════════════════

        function switchRankingTab(tabName, event) {
            const tabs = ['class', 'subject', 'overall', 'trends', 'settings'];
            for (const t of tabs) {
                const el = document.getElementById(`ranking-${t}-tab`);
                if (el) el.style.display = t === tabName ? 'block' : 'none';
            }
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            if (event && event.target) event.target.classList.add('active');
        }

        async function loadTrendStudents() {
            const classId = document.getElementById('trend-class')?.value;
            const studentSelect = document.getElementById('trend-student');

            if (!classId) {
                studentSelect.innerHTML = '<option value="">-- All Students --</option>';
                return;
            }

            const students = state.students.filter(s => s.class_id == classId && s.status === 'Active')
                .sort((a, b) => a.last_name.localeCompare(b.last_name));

            studentSelect.innerHTML = '<option value="">-- All Students --</option>' +
                students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)}</option>`).join('');
        }

        async function calculateClassRankings() {
            const classId = document.getElementById('rank-class')?.value;
            const termId = document.getElementById('rank-term')?.value;
            const sortBy = document.getElementById('rank-sort-by')?.value;
            const tieRule = document.getElementById('rank-tie-rule')?.value;
            const showPercentage = localStorage.getItem('ranking_show_percentage') !== 'false';
            const decimals = parseInt(localStorage.getItem('ranking_decimals') || '2');

            if (!classId) {
                showToast('Please select a class', 'warning');
                return;
            }

            const cls = getClassById(classId);
            const isAnnual = !termId;
            const resultsDiv = document.getElementById('rankings-results');
            const titleSpan = document.getElementById('rankings-title');

            resultsDiv.style.display = 'block';
            resultsDiv.querySelector('.dash-card-body').innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Calculating rankings...</p></div>';

            // Determine terms to process
            let termsToProcess = [];
            if (isAnnual) {
                termsToProcess = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);
            } else {
                const term = state.terms.find(t => t.id == termId);
                if (term) termsToProcess = [term];
            }

            // Get students
            const students = state.students.filter(s => s.class_id == classId && s.status === 'Active');
            const isNursery = cls.level === 'Nursery';
            const phase = getCurrentPhase(termsToProcess[0]);

            // Get subjects
            let subjects = state.subjects.filter(s => s.level === cls.level && s.is_active !== false);
            if (phase === 'pre_midterm') subjects = subjects.filter(s => !s.appears_only_post_midterm);
            subjects.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

            // Get all assessments for the selected terms
            let allAssessments = [];
            for (const term of termsToProcess) {
                const assessments = state.assessments.filter(a => a.class_id == classId && a.term_id === term.id);
                allAssessments.push(...assessments);
            }

            // Calculate scores for each student
            const studentScores = [];
            for (const student of students) {
                let totalScore = 0, totalMax = 0;
                const studentMarks = state.marks.filter(m => m.student_id === student.id);

                for (const assessment of allAssessments) {
                    const mark = studentMarks.find(m => m.assessment_id === assessment.id);
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

            // Sort based on criteria
            studentScores.sort((a, b) => {
                if (sortBy === 'percentage') {
                    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
                } else if (sortBy === 'total_score') {
                    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                } else if (sortBy === 'name') {
                    return a.name.localeCompare(b.name);
                } else if (sortBy === 'code') {
                    return (a.code || '').localeCompare(b.code || '');
                }

                // Apply tie-breaking rule
                if (tieRule === 'alphabetical') return a.name.localeCompare(b.name);
                if (tieRule === 'higher_total') return b.totalScore - a.totalScore;
                if (tieRule === 'more_exams') {
                    const aExams = state.marks.filter(m => m.student_id === a.id).length;
                    const bExams = state.marks.filter(m => m.student_id === b.id).length;
                    return bExams - aExams;
                }
                return b.percentage - a.percentage;
            });

            // Assign ranks with tie handling
            let rank = 1;
            let previousPercentage = null;
            for (let i = 0; i < studentScores.length; i++) {
                const current = studentScores[i];

                if (previousPercentage !== null && current.percentage !== previousPercentage) {
                    rank = i + 1;
                }

                current.rank = rank;
                current.rankDisplay = rank === 1 ? '🥇 1st' : rank === 2 ? '🥈 2nd' : rank === 3 ? '🥉 3rd' : `${rank}th`;
                previousPercentage = current.percentage;
            }

            // Calculate class statistics
            const classAverage = studentScores.reduce((sum, s) => sum + s.percentage, 0) / (studentScores.length || 1);
            const passCount = studentScores.filter(s => s.percentage >= 50).length;
            const passRate = (passCount / (studentScores.length || 1)) * 100;
            const topStudent = studentScores[0];

            titleSpan.textContent = `${cls.name} Rankings${isAnnual ? ' (Annual)' : ''} - ${studentScores.length} Students`;

            // Build table
            let tableHtml = `
        <div class="stats-grid" style="margin-bottom:16px">
            <div class="stat-card"><div class="stat-value">${studentScores.length}</div><div class="stat-label">Total Students</div></div>
            <div class="stat-card"><div class="stat-value">${classAverage.toFixed(decimals)}%</div><div class="stat-label">Class Average</div></div>
            <div class="stat-card"><div class="stat-value">${passRate.toFixed(1)}%</div><div class="stat-label">Pass Rate</div></div>
            <div class="stat-card"><div class="stat-value">${topStudent?.name || '—'}</div><div class="stat-label">Top Student</div><div class="stat-trend up">${topStudent ? topStudent.percentage.toFixed(decimals) + '%' : ''}</div></div>
        </div>
        <div class="table-wrapper">
            <table class="data-table" id="rankings-table">
                <thead>
                    <tr>
                        <th style="width:60px">Rank</th>
                        <th>Student Name</th>
                        <th>Student Code</th>
                        <th style="text-align:right">Total Score</th>
                        <th style="text-align:right">Max Score</th>
                        ${showPercentage ? '<th style="text-align:center">%</th>' : ''}
                        <th style="text-align:center">Grade</th>
                        <th style="text-align:center">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${studentScores.map(s => `
                        <tr>
                            <td style="text-align:center; font-weight:700">${s.rankDisplay}</span>
                            <td><strong>${esc(s.name)}</strong></span>
                            <td>${esc(s.code || '—')}</span>
                            <td style="text-align:right">${s.totalScore.toFixed(decimals)}</span>
                            <td style="text-align:right">${s.totalMax}</span>
                            ${showPercentage ? `<td style="text-align:center"><span class="badge ${getGradeClass(s.percentage)}">${s.percentage.toFixed(decimals)}%</span></span>` : ''}
                            <td style="text-align:center">${s.grade}</span>
                            <td style="text-align:center">
                                ${s.percentage >= 80 ? '<span class="badge badge-success">🏆 Excellent</span>' :
                    s.percentage >= 70 ? '<span class="badge badge-info">👍 Good</span>' :
                        s.percentage >= 50 ? '<span class="badge badge-warning">📚 Average</span>' :
                            '<span class="badge badge-danger">⚠️ Needs Improvement</span>'}
                            </span>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

            resultsDiv.querySelector('.dash-card-body').innerHTML = tableHtml;
            window._currentRankingData = studentScores;
        }

        async function compareClasses() {
            const classId = document.getElementById('rank-class')?.value;
            const termId = document.getElementById('rank-term')?.value;

            if (!classId) {
                showToast('Please select a class first', 'warning');
                return;
            }

            const cls = getClassById(classId);
            const isAnnual = !termId;
            let termsToProcess = [];

            if (isAnnual) {
                termsToProcess = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);
            } else {
                const term = state.terms.find(t => t.id == termId);
                if (term) termsToProcess = [term];
            }

            // Get all classes to compare
            const allClasses = state.classes.filter(c => c.is_active !== false);
            const comparisonData = [];

            for (const compareClass of allClasses) {
                const students = state.students.filter(s => s.class_id === compareClass.id && s.status === 'Active');
                let totalScore = 0, totalMax = 0;

                // Get assessments for this class
                let allAssessments = [];
                for (const term of termsToProcess) {
                    const assessments = state.assessments.filter(a => a.class_id === compareClass.id && a.term_id === term.id);
                    allAssessments.push(...assessments);
                }

                for (const student of students) {
                    const studentMarks = state.marks.filter(m => m.student_id === student.id);
                    for (const assessment of allAssessments) {
                        const mark = studentMarks.find(m => m.assessment_id === assessment.id);
                        if (mark) {
                            totalScore += mark.score;
                            totalMax += assessment.max_marks;
                        }
                    }
                }

                const avgPercentage = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
                comparisonData.push({
                    name: compareClass.name,
                    students: students.length,
                    avgPercentage: avgPercentage,
                    grade: getGrade(avgPercentage)
                });
            }

            comparisonData.sort((a, b) => b.avgPercentage - a.avgPercentage);

            const modal = document.getElementById('class-comparison-modal');
            const content = document.getElementById('comparison-content');

            content.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Class</th>
                        <th>Students</th>
                        <th>Average %</th>
                        <th>Grade</th>
                        <th>Performance</th>
                    </tr>
                </thead>
                <tbody>
                    ${comparisonData.map((c, idx) => `
                        <tr>
                            <td style="text-align:center; font-weight:700">${idx + 1}${idx === 0 ? ' 🏆' : idx === 1 ? ' 🥈' : idx === 2 ? ' 🥉' : ''}</span>
                            <td><strong>${esc(c.name)}</strong></span>
                            <td style="text-align:center">${c.students}</span>
                            <td style="text-align:center"><span class="badge ${getGradeClass(c.avgPercentage)}">${c.avgPercentage.toFixed(1)}%</span></span>
                            <td style="text-align:center">${c.grade}</span>
                            <td style="text-align:center">
                                <div style="background:var(--border-light); border-radius:99px; height:6px; width:100px; overflow:hidden">
                                    <div style="width:${c.avgPercentage}%; height:100%; background:${c.avgPercentage >= 80 ? '#10b981' : c.avgPercentage >= 60 ? '#f59e0b' : '#ef4444'}; border-radius:99px"></div>
                                </div>
                            </span>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

            modal.style.display = 'flex';
        }

        function exportClassComparison() {
            const table = document.querySelector('#comparison-content table');
            if (!table) return;

            const ws = XLSX.utils.table_to_sheet(table);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Class_Comparison');
            XLSX.writeFile(wb, `Class_Comparison_${new Date().toISOString().split('T')[0]}.xlsx`);
            showToast('✅ Class comparison exported', 'success');
        }

        async function calculateSubjectRankings() {
            const classId = document.getElementById('subj-rank-class')?.value;
            const subjectId = document.getElementById('subj-rank-subject')?.value;
            const termId = document.getElementById('subj-rank-term')?.value;
            const decimals = parseInt(localStorage.getItem('ranking_decimals') || '2');

            if (!classId || !subjectId) {
                showToast('Please select class and subject', 'warning');
                return;
            }

            const cls = getClassById(classId);
            const subject = getSubjectById(subjectId);
            const term = getTermById(termId);
            const resultsDiv = document.getElementById('subject-rankings-results');

            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Calculating subject rankings...</p></div>';

            const students = state.students.filter(s => s.class_id == classId && s.status === 'Active');
            const assessments = state.assessments.filter(a => a.class_id == classId && a.subject_id == subjectId && a.term_id == termId);

            const studentScores = [];
            for (const student of students) {
                let totalScore = 0, totalMax = 0;
                const studentMarks = state.marks.filter(m => m.student_id === student.id);

                for (const assessment of assessments) {
                    const mark = studentMarks.find(m => m.assessment_id === assessment.id);
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
                    score: totalScore,
                    max: totalMax,
                    percentage: percentage,
                    grade: getGrade(percentage)
                });
            }

            studentScores.sort((a, b) => b.percentage - a.percentage);

            let rank = 1;
            for (let i = 0; i < studentScores.length; i++) {
                if (i > 0 && studentScores[i].percentage === studentScores[i - 1].percentage) {
                    studentScores[i].rank = studentScores[i - 1].rank;
                } else {
                    studentScores[i].rank = rank;
                }
                rank = studentScores[i].rank + 1;
            }

            const classAverage = studentScores.reduce((sum, s) => sum + s.percentage, 0) / (studentScores.length || 1);

            resultsDiv.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">📖 ${esc(subject?.name)} Rankings - ${esc(cls?.name)} (${esc(term?.name)})</span>
            </div>
            <div class="dash-card-body">
                <div class="stats-grid" style="margin-bottom:16px; grid-template-columns:repeat(3,1fr)">
                    <div class="stat-card"><div class="stat-value">${studentScores.length}</div><div class="stat-label">Students</div></div>
                    <div class="stat-card"><div class="stat-value">${classAverage.toFixed(decimals)}%</div><div class="stat-label">Class Average</div></div>
                    <div class="stat-card"><div class="stat-value">${subject.mg_max + subject.ex_max}</div><div class="stat-label">Total Max Marks</div></div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Student Name</th>
                                <th>Score</th>
                                <th>Max</th>
                                <th>%</th>
                                <th>Grade</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${studentScores.map(s => `
                                <tr>
                                    <td style="text-align:center; font-weight:700">${s.rank}${s.rank === 1 ? ' 🏆' : s.rank === 2 ? ' 🥈' : s.rank === 3 ? ' 🥉' : ''}</span>
                                    <td><strong>${esc(s.name)}</strong></span>
                                    <td style="text-align:right">${s.score.toFixed(decimals)}</span>
                                    <td style="text-align:right">${s.max}</span>
                                    <td style="text-align:center"><span class="badge ${getGradeClass(s.percentage)}">${s.percentage.toFixed(decimals)}%</span></span>
                                    <td style="text-align:center">${s.grade}</span>
                                </tr>
                            `).join('')}
                        </tbody>
                    <table>
                </div>
            </div>
        </div>
    `;
        }

        async function calculateOverallRankings() {
            const yearId = document.getElementById('overall-year')?.value;
            const classFilter = document.getElementById('overall-classes')?.value;
            const topN = parseInt(document.getElementById('overall-top-n')?.value) || 10;
            const decimals = parseInt(localStorage.getItem('ranking_decimals') || '2');
            const resultsDiv = document.getElementById('overall-rankings-results');

            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Calculating overall rankings...</p></div>';

            let students = state.students.filter(s => s.status === 'Active');
            if (classFilter !== 'all') students = students.filter(s => s.class_id == classFilter);

            const yearTerms = state.terms.filter(t => t.academic_year_id == yearId);
            const yearAssessments = state.assessments.filter(a => yearTerms.some(t => t.id === a.term_id));

            const studentScores = [];
            for (const student of students) {
                let totalScore = 0, totalMax = 0;
                const studentMarks = state.marks.filter(m => m.student_id === student.id);
                const cls = getClassById(student.class_id);

                for (const assessment of yearAssessments) {
                    if (assessment.class_id !== student.class_id) continue;
                    const mark = studentMarks.find(m => m.assessment_id === assessment.id);
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
                    class: cls?.name,
                    totalScore: totalScore,
                    totalMax: totalMax,
                    percentage: percentage,
                    grade: getGrade(percentage)
                });
            }

            studentScores.sort((a, b) => b.percentage - a.percentage);

            const topStudents = studentScores.slice(0, topN);

            resultsDiv.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">🏆 Top ${topN} Students Overall</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window.exportOverallRankings()">📥 Export</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Student Name</th>
                                <th>Student Code</th>
                                <th>Class</th>
                                <th>Score</th>
                                <th>%</th>
                                <th>Grade</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topStudents.map((s, idx) => `
                                <tr>
                                    <td style="text-align:center; font-weight:700">${idx + 1}${idx === 0 ? ' 🏆' : idx === 1 ? ' 🥈' : idx === 2 ? ' 🥉' : ''}</span>
                                    <td><strong>${esc(s.name)}</strong></span>
                                    <td>${esc(s.code || '—')}</span>
                                    <td>${esc(s.class || '—')}</span>
                                    <td style="text-align:right">${s.totalScore.toFixed(decimals)} / ${s.totalMax}</span>
                                    <td style="text-align:center"><span class="badge ${getGradeClass(s.percentage)}">${s.percentage.toFixed(decimals)}%</span></span>
                                    <td style="text-align:center">${s.grade}</span>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

            window._overallRankingData = topStudents;
        }

        async function generateHonorRoll() {
            const yearId = document.getElementById('overall-year')?.value;
            const classFilter = document.getElementById('overall-classes')?.value;
            const decimals = parseInt(localStorage.getItem('ranking_decimals') || '2');
            const resultsDiv = document.getElementById('overall-rankings-results');

            let students = state.students.filter(s => s.status === 'Active');
            if (classFilter !== 'all') students = students.filter(s => s.class_id == classFilter);

            const yearTerms = state.terms.filter(t => t.academic_year_id == yearId);
            const yearAssessments = state.assessments.filter(a => yearTerms.some(t => t.id === a.term_id));

            const honorRoll = {
                principal: [], // 90%+
                honor: [],     // 85-89%
                merit: []      // 80-84%
            };

            for (const student of students) {
                let totalScore = 0, totalMax = 0;
                const studentMarks = state.marks.filter(m => m.student_id === student.id);

                for (const assessment of yearAssessments) {
                    if (assessment.class_id !== student.class_id) continue;
                    const mark = studentMarks.find(m => m.assessment_id === assessment.id);
                    if (mark) {
                        totalScore += mark.score;
                        totalMax += assessment.max_marks;
                    }
                }

                const percentage = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
                const cls = getClassById(student.class_id);

                if (percentage >= 90) {
                    honorRoll.principal.push({ ...student, percentage, class: cls?.name });
                } else if (percentage >= 85) {
                    honorRoll.honor.push({ ...student, percentage, class: cls?.name });
                } else if (percentage >= 80) {
                    honorRoll.merit.push({ ...student, percentage, class: cls?.name });
                }
            }

            honorRoll.principal.sort((a, b) => b.percentage - a.percentage);
            honorRoll.honor.sort((a, b) => b.percentage - a.percentage);
            honorRoll.merit.sort((a, b) => b.percentage - a.percentage);

            resultsDiv.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">⭐ Honor Roll ${state.academicYears.find(y => y.id == yearId)?.name || ''}</span>
                <button class="btn btn-sm btn-outline" onclick="window.printHonorRoll()">🖨️ Print</button>
            </div>
            <div class="dash-card-body">
                ${honorRoll.principal.length > 0 ? `
                    <h3 style="color: #fbbf24; margin-bottom:12px">🏆 Principal's Honor Roll (90%+)</h3>
                    <div class="table-wrapper" style="margin-bottom:20px">
                        <table class="data-table">
                            <thead><tr><th>#</th><th>Student Name</th><th>Class</th><th>Average %</th></tr></thead>
                            <tbody>
                                ${honorRoll.principal.map((s, i) => `
                                    <tr><td style="text-align:center">${i + 1}</span><td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></span><td>${esc(s.class)}</span><td>${s.percentage.toFixed(decimals)}%</span></tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
                ${honorRoll.honor.length > 0 ? `
                    <h3 style="color: #a0aec0; margin-bottom:12px">⭐ Honor Roll (85-89%)</h3>
                    <div class="table-wrapper" style="margin-bottom:20px">
                        <table class="data-table"><thead><tr><th>#</th><th>Student Name</th><th>Class</th><th>Average %</th></tr></thead>
                        <tbody>${honorRoll.honor.map((s, i) => `<tr><td style="text-align:center">${i + 1}</span><td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></span><td>${esc(s.class)}</span><td>${s.percentage.toFixed(decimals)}%</span></tr>`).join('')}</tbody>
                    </table></div>
                ` : ''}
                ${honorRoll.merit.length > 0 ? `
                    <h3 style="color: #cd853f; margin-bottom:12px">📚 Merit Roll (80-84%)</h3>
                    <div class="table-wrapper"><table class="data-table"><thead><tr><th>#</th><th>Student Name</th><th>Class</th><th>Average %</th></tr></thead>
                    <tbody>${honorRoll.merit.map((s, i) => `<tr><td style="text-align:center">${i + 1}</span><td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></span><td>${esc(s.class)}</span><td>${s.percentage.toFixed(decimals)}%</span></td>`).join('')}</tbody>
                </table></div>
                ` : ''}
                ${honorRoll.principal.length === 0 && honorRoll.honor.length === 0 && honorRoll.merit.length === 0 ? '<div class="alert alert-info">No students qualify for honor roll this year.</div>' : ''}
            </div>
        </div>
    `;
        }

        async function loadPerformanceTrends() {
            const classId = document.getElementById('trend-class')?.value;
            const studentId = document.getElementById('trend-student')?.value;
            const metric = document.getElementById('trend-metric')?.value;
            const resultsDiv = document.getElementById('trends-results');

            if (!classId && !studentId) {
                showToast('Please select a class or student', 'warning');
                return;
            }

            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading trends...</p></div>';

            // Get all terms across academic years
            const allYears = state.academicYears.sort((a, b) => a.id - b.id);
            const allTerms = [];
            for (const year of allYears) {
                const terms = state.terms.filter(t => t.academic_year_id === year.id).sort((a, b) => a.term_number - b.term_number);
                allTerms.push(...terms);
            }

            const trendData = [];

            for (const term of allTerms) {
                let value = 0;

                if (studentId) {
                    // Single student trend
                    const student = getStudentById(studentId);
                    if (!student) continue;

                    const assessments = state.assessments.filter(a => a.class_id === student.class_id && a.term_id === term.id);
                    let totalScore = 0, totalMax = 0;
                    const studentMarks = state.marks.filter(m => m.student_id == studentId);

                    for (const assessment of assessments) {
                        const mark = studentMarks.find(m => m.assessment_id === assessment.id);
                        if (mark) {
                            totalScore += mark.score;
                            totalMax += assessment.max_marks;
                        }
                    }

                    if (metric === 'average') {
                        const students = state.students.filter(s => s.class_id === student.class_id && s.status === 'Active');
                        let classTotal = 0, classCount = 0;
                        for (const st of students) {
                            let stScore = 0, stMax = 0;
                            const stMarks = state.marks.filter(m => m.student_id === st.id);
                            for (const a of assessments) {
                                const mk = stMarks.find(m => m.assessment_id === a.id);
                                if (mk) { stScore += mk.score; stMax += a.max_marks; }
                            }
                            if (stMax > 0) { classTotal += (stScore / stMax) * 100; classCount++; }
                        }
                        value = classCount > 0 ? classTotal / classCount : 0;
                    } else if (metric === 'top_student') {
                        const students = state.students.filter(s => s.class_id === student.class_id && s.status === 'Active');
                        let topPct = 0;
                        for (const st of students) {
                            let stScore = 0, stMax = 0;
                            const stMarks = state.marks.filter(m => m.student_id === st.id);
                            for (const a of assessments) {
                                const mk = stMarks.find(m => m.assessment_id === a.id);
                                if (mk) { stScore += mk.score; stMax += a.max_marks; }
                            }
                            const pct = stMax > 0 ? (stScore / stMax) * 100 : 0;
                            if (pct > topPct) topPct = pct;
                        }
                        value = topPct;
                    } else if (metric === 'pass_rate') {
                        const students = state.students.filter(s => s.class_id === student.class_id && s.status === 'Active');
                        let passCount = 0, totalCount = 0;
                        for (const st of students) {
                            let stScore = 0, stMax = 0;
                            const stMarks = state.marks.filter(m => m.student_id === st.id);
                            for (const a of assessments) {
                                const mk = stMarks.find(m => m.assessment_id === a.id);
                                if (mk) { stScore += mk.score; stMax += a.max_marks; }
                            }
                            const pct = stMax > 0 ? (stScore / stMax) * 100 : 0;
                            if (stMax > 0) { totalCount++; if (pct >= 50) passCount++; }
                        }
                        value = totalCount > 0 ? (passCount / totalCount) * 100 : 0;
                    } else if (metric === 'completion') {
                        const expectedCount = state.students.filter(s => s.class_id === student.class_id && s.status === 'Active').length;
                        let enteredCount = 0;
                        for (const a of assessments) {
                            enteredCount += state.marks.filter(m => m.assessment_id === a.id).length;
                        }
                        const totalExpected = assessments.length * expectedCount;
                        value = totalExpected > 0 ? (enteredCount / totalExpected) * 100 : 0;
                    }
                } else if (classId) {
                    // Class-level trend
                    const students = state.students.filter(s => s.class_id == classId && s.status === 'Active');
                    const assessments = state.assessments.filter(a => a.class_id == classId && a.term_id === term.id);

                    if (metric === 'average') {
                        let totalPct = 0, count = 0;
                        for (const student of students) {
                            let score = 0, max = 0;
                            const studentMarks = state.marks.filter(m => m.student_id === student.id);
                            for (const a of assessments) {
                                const mk = studentMarks.find(m => m.assessment_id === a.id);
                                if (mk) { score += mk.score; max += a.max_marks; }
                            }
                            if (max > 0) { totalPct += (score / max) * 100; count++; }
                        }
                        value = count > 0 ? totalPct / count : 0;
                    } else if (metric === 'top_student') {
                        let topPct = 0;
                        for (const student of students) {
                            let score = 0, max = 0;
                            const studentMarks = state.marks.filter(m => m.student_id === student.id);
                            for (const a of assessments) {
                                const mk = studentMarks.find(m => m.assessment_id === a.id);
                                if (mk) { score += mk.score; max += a.max_marks; }
                            }
                            const pct = max > 0 ? (score / max) * 100 : 0;
                            if (pct > topPct) topPct = pct;
                        }
                        value = topPct;
                    } else if (metric === 'pass_rate') {
                        let passCount = 0, totalCount = 0;
                        for (const student of students) {
                            let score = 0, max = 0;
                            const studentMarks = state.marks.filter(m => m.student_id === student.id);
                            for (const a of assessments) {
                                const mk = studentMarks.find(m => m.assessment_id === a.id);
                                if (mk) { score += mk.score; max += a.max_marks; }
                            }
                            const pct = max > 0 ? (score / max) * 100 : 0;
                            if (max > 0) { totalCount++; if (pct >= 50) passCount++; }
                        }
                        value = totalCount > 0 ? (passCount / totalCount) * 100 : 0;
                    } else if (metric === 'completion') {
                        const expectedCount = students.length;
                        let enteredCount = 0;
                        for (const a of assessments) {
                            enteredCount += state.marks.filter(m => m.assessment_id === a.id).length;
                        }
                        const totalExpected = assessments.length * expectedCount;
                        value = totalExpected > 0 ? (enteredCount / totalExpected) * 100 : 0;
                    }
                }

                trendData.push({
                    term: term.name,
                    year: state.academicYears.find(y => y.id === term.academic_year_id)?.name,
                    value: value
                });
            }

            // Filter out zero values from start
            const filteredData = trendData.filter(d => d.value > 0 || trendData.indexOf(d) === trendData.length - 1);
            const labels = filteredData.map(d => `${d.term} (${d.year?.substring(0, 4) || ''})`);
            const values = filteredData.map(d => d.value);

            resultsDiv.innerHTML = `
        <canvas id="trends-chart" height="300" style="margin-bottom:20px"></canvas>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Value</th>
                        <th>Trend</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredData.map((d, i) => {
                const change = i > 0 ? d.value - filteredData[i - 1].value : 0;
                const changeIcon = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
                const changeColor = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--text-muted)';
                return `
                            <tr>
                                <td><strong>${esc(d.term)} (${esc(d.year)})</strong></td>
                                <td><span class="badge ${getGradeClass(d.value)}">${d.value.toFixed(1)}%</span></td>
                                <td style="color:${changeColor}">${changeIcon} ${change > 0 ? '+' : ''}${change.toFixed(1)}%</span>
                            </tr>
                        `;
            }).join('')}
                </tbody>
            </table>
        </div>
    `;

            // Create chart
            setTimeout(() => {
                const ctx = document.getElementById('trends-chart')?.getContext('2d');
                if (ctx) {
                    if (window._trendsChart) window._trendsChart.destroy();
                    window._trendsChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: metric === 'average' ? 'Class Average (%)' : metric === 'top_student' ? 'Top Student Score (%)' : metric === 'pass_rate' ? 'Pass Rate (%)' : 'Completion Rate (%)',
                                data: values,
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59,130,246,0.1)',
                                fill: true,
                                tension: 0.3,
                                pointBackgroundColor: '#3b82f6',
                                pointBorderColor: '#fff',
                                pointRadius: 5,
                                pointHoverRadius: 7
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                tooltip: {
                                    callbacks: {
                                        label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    max: 100,
                                    title: { display: true, text: 'Percentage (%)' }
                                }
                            }
                        }
                    });
                }
            }, 100);
        }

        function saveRankingSettings() {
            const defaultType = document.getElementById('default-ranking-type')?.value;
            const tieRule = document.getElementById('default-tie-rule')?.value;
            const decimals = document.getElementById('ranking-decimals')?.value;
            const showPercentage = document.getElementById('show-percentage')?.value;

            if (defaultType) localStorage.setItem('default_ranking_type', defaultType);
            if (tieRule) localStorage.setItem('ranking_tie_rule', tieRule);
            if (decimals) localStorage.setItem('ranking_decimals', decimals);
            if (showPercentage) localStorage.setItem('ranking_show_percentage', showPercentage);

            // Apply to main form
            const rankTieRule = document.getElementById('rank-tie-rule');
            if (rankTieRule && tieRule) rankTieRule.value = tieRule;

            const rankDecimals = document.getElementById('ranking-decimals');
            if (rankDecimals && decimals) rankDecimals.value = decimals;

            showToast('✅ Ranking settings saved', 'success');
        }

        function resetRankingSettings() {
            localStorage.removeItem('default_ranking_type');
            localStorage.removeItem('ranking_tie_rule');
            localStorage.removeItem('ranking_decimals');
            localStorage.removeItem('ranking_show_percentage');

            document.getElementById('default-ranking-type').value = 'class';
            document.getElementById('default-tie-rule').value = 'alphabetical';
            document.getElementById('ranking-decimals').value = '2';
            document.getElementById('show-percentage').value = 'true';
            document.getElementById('rank-tie-rule').value = 'alphabetical';

            showToast('✅ Settings reset to defaults', 'success');
        }

        function loadRankingSettings() {
            const defaultType = localStorage.getItem('default_ranking_type');
            const tieRule = localStorage.getItem('ranking_tie_rule');
            const decimals = localStorage.getItem('ranking_decimals');
            const showPercentage = localStorage.getItem('ranking_show_percentage');

            if (defaultType && document.getElementById('default-ranking-type')) {
                document.getElementById('default-ranking-type').value = defaultType;
            }
            if (tieRule && document.getElementById('rank-tie-rule')) {
                document.getElementById('rank-tie-rule').value = tieRule;
                document.getElementById('default-tie-rule').value = tieRule;
            }
            if (decimals && document.getElementById('ranking-decimals')) {
                document.getElementById('ranking-decimals').value = decimals;
            }
            if (showPercentage && document.getElementById('show-percentage')) {
                document.getElementById('show-percentage').value = showPercentage;
            }
        }

        function exportRankingData() {
            const data = window._currentRankingData;
            if (!data || data.length === 0) {
                showToast('No ranking data to export', 'warning');
                return;
            }

            const exportData = data.map(s => ({
                'Rank': s.rank,
                'Student Name': s.name,
                'Student Code': s.code,
                'Total Score': s.totalScore,
                'Max Score': s.totalMax,
                'Percentage (%)': s.percentage,
                'Grade': s.grade
            }));

            exportToExcel(exportData, `Rankings_${new Date().toISOString().split('T')[0]}`);
            showToast('✅ Rankings exported', 'success');
        }

        function printRankingReport() {
            const table = document.getElementById('rankings-table');
            if (!table) {
                showToast('No ranking data to print', 'warning');
                return;
            }

            const title = document.getElementById('rankings-title')?.textContent || 'Class Rankings';
            const school = state.schoolSettings || {};

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title} - ECOLE LA FONTAINE</title>
            <style>
                body{font-family:Arial,sans-serif;padding:20px}
                h1{text-align:center;color:#1a3a5c}
                table{width:100%;border-collapse:collapse;margin-top:20px}
                th,td{border:1px solid #ccc;padding:8px;text-align:left}
                th{background:#1a3a5c;color:white}
                .badge{display:inline-block;padding:2px 8px;border-radius:12px}
                @media print{body{padding:0}}
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2 style="text-align:center">${title}</h2>
            <p style="text-align:center">Generated on ${new Date().toLocaleString()}</p>
            ${table.outerHTML}
        </body>
        </html>
    `);
            printWindow.document.close();
            printWindow.print();
        }

        function copyRankingsTable() {
            const table = document.getElementById('rankings-table');
            if (!table) {
                showToast('No rankings to copy', 'warning');
                return;
            }

            const range = document.createRange();
            range.selectNode(table);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            showToast('✅ Rankings copied to clipboard', 'success');
        }

        function printHonorRoll() {
            const honorRollContent = document.querySelector('#overall-rankings-results .dash-card');
            if (!honorRollContent) return;

            const school = state.schoolSettings || {};
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Honor Roll - ECOLE LA FONTAINE</title>
            <style>
                body{font-family:Arial,sans-serif;padding:20px}
                h1{text-align:center;color:#1a3a5c}
                h2{text-align:center}
                table{width:100%;border-collapse:collapse;margin:10px 0}
                th,td{border:1px solid #ccc;padding:8px}
                th{background:#1a3a5c;color:white}
                @media print{body{padding:0}}
            </style>
        </head>
        <body>
            <h1>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h1>
            <h2>Academic Honor Roll</h2>
            <p style="text-align:center">Generated on ${new Date().toLocaleString()}</p>
            ${honorRollContent.innerHTML}
        </body>
        </html>
    `);
            printWindow.document.close();
            printWindow.print();
        }

        function exportOverallRankings() {
            const data = window._overallRankingData;
            if (!data || data.length === 0) {
                showToast('No overall ranking data to export', 'warning');
                return;
            }

            const exportData = data.map((s, idx) => ({
                'Rank': idx + 1,
                'Student Name': s.name,
                'Student Code': s.code,
                'Class': s.class,
                'Total Score': s.totalScore,
                'Max Score': s.totalMax,
                'Percentage (%)': s.percentage,
                'Grade': s.grade
            }));

            exportToExcel(exportData, `Overall_Rankings_${new Date().toISOString().split('T')[0]}`);
            showToast('✅ Overall rankings exported', 'success');
        }

        // ════════════════════════════════════════════════════════════════════════
        // SECTION EX-6 — ACADEMIC REPORTS MODULE
