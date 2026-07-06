// Batch report card generation with templates, queue, and PDF export
        // ════════════════════════════════════════════════════════════════════════

        function switchReportTab(tabName, event) {
            const tabs = ['generate', 'queue', 'templates', 'settings'];
            for (const t of tabs) {
                const el = document.getElementById(`report-${t}-tab`);
                if (el) el.style.display = t === tabName ? 'block' : 'none';
            }
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            if (event && event.target) event.target.classList.add('active');
        }

        async function loadBatchStudents() {
            const classId = document.getElementById('batch-class')?.value;
            const container = document.getElementById('student-checkbox-list');

            if (!classId) {
                container.innerHTML = '<div class="alert alert-info">Select a class to load students</div>';
                return;
            }

            container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading students...</p></div>';

            const students = state.students.filter(s => s.class_id == classId && s.status === 'Active')
                .sort((a, b) => a.last_name.localeCompare(b.last_name));

            if (students.length === 0) {
                container.innerHTML = '<div class="alert alert-warning">No active students in this class</div>';
                return;
            }

            container.innerHTML = students.map((s, idx) => `
        <label style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid var(--border-light); cursor:pointer">
            <input type="checkbox" class="student-batch-cb" data-id="${s.id}" data-name="${esc(s.first_name)} ${esc(s.last_name)}" checked>
            <div style="flex:1">
                <strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
                <div style="font-size:11px; color:var(--text-muted)">${esc(s.student_code || 'No code')}</div>
            </div>
            <div style="font-size:12px; color:var(--text-muted)">#${idx + 1}</div>
        </label>
    `).join('');

            document.getElementById('student-selection').style.display = 'block';
        }

        function toggleBatchOptions() {
            const reportType = document.getElementById('batch-report-type')?.value;
            const termGroup = document.getElementById('batch-term-group');
            const yearGroup = document.getElementById('batch-year-group');
            const dateFromGroup = document.getElementById('batch-date-from-group');
            const dateToGroup = document.getElementById('batch-date-to-group');

            if (termGroup) termGroup.style.display = reportType === 'custom' ? 'none' : 'block';
            if (yearGroup) yearGroup.style.display = reportType === 'annual' ? 'block' : 'none';
            if (dateFromGroup) dateFromGroup.style.display = reportType === 'custom' ? 'block' : 'none';
            if (dateToGroup) dateToGroup.style.display = reportType === 'custom' ? 'block' : 'none';
        }

        function selectAllStudents(select) {
            document.querySelectorAll('.student-batch-cb').forEach(cb => cb.checked = select);
        }

        function resetBatchForm() {
            document.getElementById('batch-class').value = '';
            document.getElementById('batch-report-type').value = 'endterm';
            document.getElementById('batch-term').value = state.currentTerm?.id || '';
            document.getElementById('batch-format').value = 'separate';
            document.getElementById('include-subjects').checked = true;
            document.getElementById('include-rankings').checked = true;
            document.getElementById('include-attendance').checked = true;
            document.getElementById('student-checkbox-list').innerHTML = '<div class="alert alert-info">Select a class to load students</div>';
            document.getElementById('batch-progress').style.display = 'none';
            toggleBatchOptions();
            showToast('Form reset', 'info', 1500);
        }

        function addToBatchQueue() {
            const selectedStudents = getSelectedStudents();
            if (selectedStudents.length === 0) {
                showToast('No students selected', 'warning');
                return;
            }

            const batchJob = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                classId: document.getElementById('batch-class')?.value,
                className: getClassById(document.getElementById('batch-class')?.value)?.name,
                reportType: document.getElementById('batch-report-type')?.value,
                termId: document.getElementById('batch-term')?.value,
                termName: getTermById(document.getElementById('batch-term')?.value)?.name,
                format: document.getElementById('batch-format')?.value,
                includeSubjects: document.getElementById('include-subjects')?.checked,
                includeRankings: document.getElementById('include-rankings')?.checked,
                includeAttendance: document.getElementById('include-attendance')?.checked,
                studentIds: selectedStudents.map(s => s.id),
                studentNames: selectedStudents.map(s => s.name),
                status: 'pending',
                progress: 0,
                createdAt: new Date().toISOString()
            };

            // Save to queue
            let queue = [];
            try {
                queue = JSON.parse(localStorage.getItem('report_batch_queue') || '[]');
            } catch (e) { }
            queue.push(batchJob);
            localStorage.setItem('report_batch_queue', JSON.stringify(queue));

            showToast(`✅ Added ${selectedStudents.length} students to batch queue`, 'success');
            refreshQueueDisplay();
            switchReportTab('queue', { target: document.querySelector('[onclick*="queue"]') });
        }

        function getSelectedStudents() {
            const students = [];
            document.querySelectorAll('.student-batch-cb:checked').forEach(cb => {
                students.push({
                    id: parseInt(cb.dataset.id),
                    name: cb.dataset.name
                });
            });
            return students;
        }

        async function startBatchGeneration() {
            const selectedStudents = getSelectedStudents();
            if (selectedStudents.length === 0) {
                showToast('No students selected', 'warning');
                return;
            }

            const classId = document.getElementById('batch-class')?.value;
            const reportType = document.getElementById('batch-report-type')?.value;
            const termId = document.getElementById('batch-term')?.value;
            const format = document.getElementById('batch-format')?.value;
            const autoQueue = localStorage.getItem('auto_queue') !== 'false';

            // Check if we should use queue for large batches
            if (autoQueue && selectedStudents.length > 5) {
                if (confirm(`${selectedStudents.length} students selected. This may take a while. Add to queue instead?`)) {
                    addToBatchQueue();
                    return;
                }
            }

            // Show progress modal
            const modal = document.getElementById('batch-progress-modal');
            const modalBar = document.getElementById('batch-modal-bar');
            const modalText = document.getElementById('batch-modal-text');
            const modalDetail = document.getElementById('batch-modal-detail');
            modal.style.display = 'flex';
            modalBar.style.width = '0%';
            modalText.textContent = 'Generating reports...';
            cancelGeneration = false;
            isGenerating = true;

            const cls = getClassById(classId);
            const term = getTermById(termId);
            const batchSize = parseInt(document.getElementById('batch-size')?.value || 3);

            const results = [];
            let completed = 0;

            // Process in batches
            for (let i = 0; i < selectedStudents.length; i += batchSize) {
                if (cancelGeneration) break;

                const batch = selectedStudents.slice(i, i + batchSize);
                const batchPromises = batch.map(async (student, idx) => {
                    try {
                        modalDetail.textContent = `Generating: ${student.name}...`;

                        // Generate single report
                        const reportData = await generateSingleReport(student.id, classId, reportType, termId);

                        results.push({
                            studentId: student.id,
                            studentName: student.name,
                            success: true,
                            data: reportData,
                            index: i + idx + 1
                        });
                    } catch (error) {
                        results.push({
                            studentId: student.id,
                            studentName: student.name,
                            success: false,
                            error: error.message,
                            index: i + idx + 1
                        });
                    }

                    completed++;
                    const percent = (completed / selectedStudents.length) * 100;
                    modalBar.style.width = `${percent}%`;
                    modalText.textContent = `Generating: ${completed} of ${selectedStudents.length}`;
                });

                await Promise.all(batchPromises);
            }

            isGenerating = false;
            modal.style.display = 'none';

            // Handle results
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (successCount === 0) {
                showToast(`❌ Failed to generate any reports`, 'error');
                return;
            }

            showToast(`✅ Generated ${successCount} reports (${failCount} failed)`, successCount === selectedStudents.length ? 'success' : 'warning');

            // Export based on format
            if (format === 'separate') {
                await downloadAsZip(results.filter(r => r.success), cls, term);
            } else if (format === 'combined') {
                await downloadAsCombinedPDF(results.filter(r => r.success), cls, term);
            } else if (format === 'print') {
                openPrintView(results.filter(r => r.success), cls, term);
            }

            // Log the batch
            logBatchGeneration(cls?.name, term?.name, successCount, selectedStudents.length);
        }

        async function generateSingleReport(studentId, classId, reportType, termId) {
            const student = getStudentById(studentId);
            const cls = getClassById(classId);
            const term = getTermById(termId);

            if (!student || !cls) throw new Error('Student or class not found');

            const isAnnual = reportType === 'annual';
            const isPreMidterm = reportType === 'midterm';
            const isNursery = cls.level === 'Nursery';

            // Determine terms to process
            let termsToProcess = [];
            if (isAnnual) {
                termsToProcess = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);
            } else {
                if (term) termsToProcess = [term];
            }

            // Get subjects
            let subjects = state.subjects.filter(s => s.level === cls.level && s.is_active !== false);
            if (isPreMidterm) subjects = subjects.filter(s => !s.appears_only_post_midterm);
            subjects.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

            // Get assessments and marks
            let allAssessments = [];
            for (const t of termsToProcess) {
                const assessments = state.assessments.filter(a => a.class_id == classId && a.term_id === t.id);
                allAssessments.push(...assessments);
            }
            const allMarks = state.marks.filter(m => m.student_id == studentId);

            // Build a Map for O(1) mark lookup instead of O(N) find() inside every loop.
            // This is the key performance fix for annual reports (3 terms × many subjects × many
            // students → was O(terms × subjects × marks), now O(terms × subjects)).
            const marksByAssessmentId = new Map(allMarks.map(m => [m.assessment_id, m]));

            // Calculate term scores
            const termScores = {};
            for (const t of termsToProcess) {
                termScores[t.id] = { subjects: {}, totals: { mg: 0, ex: 0, total: 0, max: 0 } };

                for (const subject of subjects) {
                    const termAssessments = allAssessments.filter(a => a.term_id === t.id && a.subject_id === subject.id);
                    const mgAssessments = termAssessments.filter(a => !['Exam', 'Final Exam'].includes(a.assessment_type));
                    const exAssessments = termAssessments.filter(a => ['Exam', 'Final Exam'].includes(a.assessment_type));

                    let mgScore = null, exScore = null;
                    const mgMax = subject.mg_max || 50;
                    const exMax = subject.ex_max || 50;

                    // Calculate MG
                    if (mgAssessments.length > 0) {
                        let totalRaw = 0, totalMaxRaw = 0, completedCount = 0;
                        for (const ass of mgAssessments) {
                            const mark = marksByAssessmentId.get(ass.id);
                            if (mark) {
                                totalRaw += mark.score;
                                totalMaxRaw += ass.max_marks;
                                completedCount++;
                            }
                        }
                        if (completedCount > 0) {
                            const avgRaw = totalRaw / completedCount;
                            const avgMax = totalMaxRaw / completedCount;
                            if (isPreMidterm) {
                                mgScore = isNursery ? avgRaw : (avgMax > 0 ? (avgRaw / avgMax) * 100 : 0);
                            } else {
                                mgScore = avgMax > 0 ? (avgRaw / avgMax) * mgMax : 0;
                            }
                        }
                    }

                    // Calculate EX
                    if (!isPreMidterm && exAssessments.length > 0) {
                        let totalRaw = 0, totalMaxRaw = 0, completedCount = 0;
                        for (const ass of exAssessments) {
                            const mark = marksByAssessmentId.get(ass.id);
                            if (mark) {
                                totalRaw += mark.score;
                                totalMaxRaw += ass.max_marks;
                                completedCount++;
                            }
                        }
                        if (completedCount > 0) {
                            const avgRaw = totalRaw / completedCount;
                            const avgMax = totalMaxRaw / completedCount;
                            exScore = avgMax > 0 ? (avgRaw / avgMax) * exMax : 0;
                        }
                    }

                    // Post-midterm only subjects
                    if (!isPreMidterm && subject.appears_only_post_midterm && mgScore === null && exScore !== null) {
                        mgScore = exScore;
                    }

                    // Calculate total
                    let total = null, maxTotal = 0;
                    if (isPreMidterm) {
                        total = mgScore;
                        maxTotal = isNursery ? mgMax : 100;
                    } else {
                        if (mgScore !== null || exScore !== null) {
                            total = (mgScore || 0) + (exScore || 0);
                        }
                        maxTotal = mgMax + exMax;
                    }

                    const percentage = (total !== null && maxTotal > 0) ? (total / maxTotal) * 100 : null;

                    termScores[t.id].subjects[subject.id] = {
                        mg: mgScore, ex: exScore, total: total, max: maxTotal, percentage: percentage
                    };

                    termScores[t.id].totals.mg += mgScore || 0;
                    termScores[t.id].totals.ex += exScore || 0;
                    termScores[t.id].totals.total += total || 0;
                    termScores[t.id].totals.max += maxTotal;
                }
            }

            // Calculate overall scores
            let annualTotalScore = 0, annualTotalMax = 0;
            for (const t of termsToProcess) {
                annualTotalScore += termScores[t.id].totals.total;
                annualTotalMax += termScores[t.id].totals.max;
            }

            const overallPercentage = annualTotalMax > 0 ? (annualTotalScore / annualTotalMax) * 100 : 0;
            const overallGrade = getGrade(overallPercentage);

            // Calculate rank
            const rank = await calculateStudentRankFair(studentId, classId, termsToProcess, allAssessments, annualTotalMax);

            // Get attendance
            let attendance = { present: 0, absent: 0, late: 0, total: 0 };
            try {
                const attRecords = await getAll('attendance', { student_id: studentId });
                const termAttRecords = attRecords.filter(a => {
                    if (isAnnual) {
                        return termsToProcess.some(t => a.date >= t.start_date && a.date <= t.end_date);
                    }
                    return term && a.date >= term.start_date && a.date <= term.end_date;
                });
                attendance.total = termAttRecords.length;
                attendance.present = termAttRecords.filter(a => a.status === 'present').length;
                attendance.absent = termAttRecords.filter(a => a.status === 'absent').length;
                attendance.late = termAttRecords.filter(a => a.status === 'late').length;
            } catch (e) { }

            return {
                student, cls, term, isNursery, isAnnual, isPreMidterm,
                termScores, subjects, termsToProcess,
                overallPercentage, overallGrade, rank,
                attendance, annualTotalScore, annualTotalMax
            };
        }

        async function downloadAsZip(results, cls, term) {
            if (typeof JSZip === 'undefined') {
                showToast('JSZip library not loaded. Use combined PDF or print option.', 'warning');
                return;
            }

            const zip = new JSZip();
            const folder = zip.folder(`Report_Cards_${cls?.name}_${term?.name || 'Annual'}`);

            for (const result of results) {
                const html = generateReportHTML(result.data);
                folder.file(`${result.studentName.replace(/\s/g, '_')}.html`, html);
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Report_Cards_${cls?.name}_${new Date().toISOString().split('T')[0]}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`✅ Downloaded ${results.length} reports as ZIP`, 'success');
        }

        async function downloadAsCombinedPDF(results, cls, term) {
            if (typeof html2pdf === 'undefined') {
                showToast('PDF library not loaded. Use separate PDF or print option.', 'warning');
                return;
            }

            let combinedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Combined Report Cards - ${cls?.name}</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:'Inter',Arial,sans-serif}
                .report-card{max-width:800px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;page-break-after:always}
                .report-header{background:#1a3a5c;color:#fff;padding:24px 28px;display:flex;gap:18px;align-items:center}
                .report-header-text h2{font-size:18px;font-weight:700;margin-bottom:4px}
                .report-info{display:grid;grid-template-columns:repeat(2,1fr);border-bottom:1px solid #e2e8f0}
                .report-info-item{padding:12px 20px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}
                .report-subjects{width:100%;border-collapse:collapse}
                .report-subjects th{background:#e8f0fe;padding:10px 12px;font-size:11px;font-weight:700;text-align:center}
                .report-subjects td{padding:8px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;text-align:center}
                .report-summary{background:#1a3a5c;color:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));padding:14px 20px;text-align:center;gap:12px}
                .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
                .grade-Ap,.grade-A{background:#d1fae5;color:#065f46}
                .grade-B{background:#fef3c7;color:#92400e}
                @media print{.report-card{page-break-after:always;margin:0}}
            </style>
        </head>
        <body>
    `;

            for (const result of results) {
                combinedHtml += generateReportHTML(result.data);
            }

            combinedHtml += `</body></html>`;

            const element = document.createElement('div');
            element.innerHTML = combinedHtml;

            html2pdf().set({
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `Combined_Reports_${cls?.name}_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            }).from(element).save();

            showToast(`✅ Generated combined PDF with ${results.length} reports`, 'success');
        }

        function generateReportHTML(data) {
            const school = state.schoolSettings || {};
            const logoHtml = getSchoolLogoHtml(school.school_logo);
            const student = data.student;
            const cls = data.cls;

            let subjectRows = '';
            for (const subject of data.subjects) {
                const score = data.termScores[data.termsToProcess[0]?.id]?.subjects[subject.id];
                const pct = score?.percentage;
                const grade = pct !== null ? getGrade(pct) : '—';
                subjectRows += `
            <tr>
                <td style="font-weight:600">${esc(subject.name)}</td>
                <td style="text-align:center">${score?.max || 100}</td>
                <td style="text-align:center;font-weight:700">${score?.total !== null ? score.total.toFixed(1) : '—'}</td>
                <td style="text-align:center">${pct !== null ? pct.toFixed(1) + '%' : '—'}</td>
                <td style="text-align:center"><span class="badge ${getGradeClass(pct)}">${grade}</span></td>
            </tr>
        `;
            }

            const termLabel = data.isAnnual ?
                `Academic Year ${state.currentAcadYear?.name}` :
                `${data.term?.name} - ${state.schoolSettings.current_year || ''}`;

            return `
        <div class="report-card">
            <div class="report-header">
                <div class="report-logo">${logoHtml}</div>
                <div class="report-header-text">
                    <h2>${esc(school.school_name || 'ECOLE LA FONTAINE')}</h2>
                    <p>${esc(school.school_location || 'Rubavu, Rwanda')}</p>
                    <h3>${data.isAnnual ? 'ANNUAL REPORT CARD' : (data.isPreMidterm ? 'MID-TERM REPORT' : 'END OF TERM REPORT')}</h3>
                    <p>${termLabel}</p>
                </div>
            </div>
            <div class="report-info">
                <div class="report-info-item"><strong>STUDENT</strong><span>${esc(student.first_name)} ${esc(student.last_name)}</span></div>
                <div class="report-info-item"><strong>CODE</strong><span>${esc(student.student_code || '—')}</span></div>
                <div class="report-info-item"><strong>CLASS</strong><span>${esc(cls.name)}</span></div>
                <div class="report-info-item"><strong>GRADE</strong><span>${esc(cls.name.replace(/\s+[A-Za-z]$/, '').trim())}</span></div>
            </div>
            <table class="report-subjects">
                <thead><tr><th>SUBJECT</th><th>MAX</th><th>SCORE</th><th>%</th><th>GRADE</th></tr></thead>
                <tbody>${subjectRows}</tbody>
            </table>
            <div class="report-summary">
                <div><div class="summary-label">TOTAL SCORE</div><div class="summary-value">${data.annualTotalScore.toFixed(1)} / ${data.annualTotalMax}</div></div>
                <div><div class="summary-label">AVERAGE %</div><div class="summary-value">${data.overallPercentage.toFixed(1)}%</div></div>
                <div><div class="summary-label">GRADE</div><div class="summary-value">${data.overallGrade}</div></div>
                <div><div class="summary-label">RANK</div><div class="summary-value">${data.rank}</div></div>
            </div>
            <div class="report-footer" style="padding:14px 20px;background:#f8fafc;text-align:center;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0">
                ${esc(school.report_footer_line1 || 'Done at ECOLE LA FONTAINE')}<br>
                ${esc(school.report_footer_line2 || 'UWAYO GANZA Eugene')}<br>
                THE SCHOOL HEADTEACHER
            </div>
        </div>
    `;
        }

        function openPrintView(results, cls, term) {
            let printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Report Cards - ${cls?.name}</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:'Inter',Arial,sans-serif;padding:20px}
                .report-card{max-width:800px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;page-break-after:always}
                .report-header{background:#1a3a5c;color:#fff;padding:24px 28px;display:flex;gap:18px;align-items:center}
                .report-header-text h2{font-size:18px;font-weight:700;margin-bottom:4px}
                .report-info{display:grid;grid-template-columns:repeat(2,1fr);border-bottom:1px solid #e2e8f0}
                .report-info-item{padding:12px 20px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}
                .report-subjects{width:100%;border-collapse:collapse}
                .report-subjects th{background:#e8f0fe;padding:10px 12px;font-size:11px;font-weight:700;text-align:center}
                .report-subjects td{padding:8px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;text-align:center}
                .report-summary{background:#1a3a5c;color:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));padding:14px 20px;text-align:center;gap:12px}
                .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
                @media print{.report-card{page-break-after:always;margin:0}}
                .print-btn{position:fixed;bottom:20px;right:20px;padding:10px 20px;background:#1a3a5c;color:#fff;border:none;border-radius:8px;cursor:pointer;z-index:1000}
            </style>
        </head>
        <body>
            <button class="print-btn" onclick="window.print()">🖨️ Print All Reports</button>
    `;

            for (const result of results) {
                printHtml += generateReportHTML(result.data);
            }

            printHtml += `</body></html>`;

            const win = window.open('', '_blank');
            win.document.write(printHtml);
            win.document.close();
        }

        async function previewBatch() {
            const selectedStudents = getSelectedStudents();
            if (selectedStudents.length === 0) {
                showToast('No students selected', 'warning');
                return;
            }

            const classId = document.getElementById('batch-class')?.value;
            const reportType = document.getElementById('batch-report-type')?.value;
            const termId = document.getElementById('batch-term')?.value;

            showToast('Generating preview...', 'info');

            try {
                const reportData = await generateSingleReport(selectedStudents[0].id, classId, reportType, termId);
                const html = generateReportHTML(reportData);

                const previewWin = window.open('', '_blank', 'width=800,height=600');
                previewWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>Preview - ${selectedStudents[0].name}</title></head>
            <body style="margin:0">${html}<script>window.print = function(){}<\/script></body>
            </html>
        `);
                previewWin.document.close();
            } catch (error) {
                showToast('Preview failed: ' + error.message, 'error');
            }
        }

        function refreshQueueDisplay() {
            const container = document.getElementById('batch-queue-list');
            if (!container) return;

            let queue = [];
            try {
                queue = JSON.parse(localStorage.getItem('report_batch_queue') || '[]');
            } catch (e) { }

            if (queue.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No jobs in queue</div>';
                return;
            }

            container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Added</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${queue.map(job => `
                    <tr>
                        <td>${fmtDateTime(job.timestamp)}</span>
                        <td><strong>${esc(job.className || '—')}</strong></span>
                        <td>${esc(job.termName || 'Annual')}</span>
                        <td>${job.studentIds.length} students</span>
                        <td><span class="badge ${job.status === 'completed' ? 'badge-success' : job.status === 'processing' ? 'badge-warning' : 'badge-info'}">${job.status || 'pending'}</span></span>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="window.processSingleJob(${job.id})">▶️ Process</button>
                            <button class="btn btn-sm btn-danger" onclick="window.removeJob(${job.id})">🗑️</button>
                         </span>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
        }

        async function processQueue() {
            let queue = [];
            try {
                queue = JSON.parse(localStorage.getItem('report_batch_queue') || '[]');
            } catch (e) { }

            const pendingJobs = queue.filter(job => job.status !== 'completed');
            if (pendingJobs.length === 0) {
                showToast('No pending jobs in queue', 'info');
                return;
            }

            for (const job of pendingJobs) {
                await processSingleJob(job.id);
            }

            showToast('✅ Queue processing complete', 'success');
        }

        async function processSingleJob(jobId) {
            let queue = [];
            try {
                queue = JSON.parse(localStorage.getItem('report_batch_queue') || '[]');
            } catch (e) { }

            const job = queue.find(j => j.id == jobId);
            if (!job) return;

            job.status = 'processing';
            localStorage.setItem('report_batch_queue', JSON.stringify(queue));
            refreshQueueDisplay();

            // Set form values from job
            document.getElementById('batch-class').value = job.classId;
            await loadBatchStudents();

            // Select the students from the job
            setTimeout(() => {
                document.querySelectorAll('.student-batch-cb').forEach(cb => {
                    cb.checked = job.studentIds.includes(parseInt(cb.dataset.id));
                });
            }, 500);

            document.getElementById('batch-report-type').value = job.reportType;
            document.getElementById('batch-term').value = job.termId || '';
            document.getElementById('batch-format').value = job.format;
            document.getElementById('include-subjects').checked = job.includeSubjects;
            document.getElementById('include-rankings').checked = job.includeRankings;
            document.getElementById('include-attendance').checked = job.includeAttendance;

            await startBatchGeneration();

            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            localStorage.setItem('report_batch_queue', JSON.stringify(queue));
            refreshQueueDisplay();
        }

        function removeJob(jobId) {
            let queue = [];
            try {
                queue = JSON.parse(localStorage.getItem('report_batch_queue') || '[]');
            } catch (e) { }

            queue = queue.filter(j => j.id != jobId);
            localStorage.setItem('report_batch_queue', JSON.stringify(queue));
            refreshQueueDisplay();
            showToast('✅ Job removed from queue', 'success');
        }

        function clearQueue() {
            if (confirm('Clear all jobs from queue?')) {
                localStorage.removeItem('report_batch_queue');
                refreshQueueDisplay();
                showToast('✅ Queue cleared', 'success');
            }
        }

        function showBatchQueue() {
            switchReportTab('queue', { target: document.querySelector('[onclick*="queue"]') });
        }

        function loadTemplatePreview() {
            const template = document.getElementById('report-template-select')?.value;
            const previewDiv = document.getElementById('template-preview');
            const previewContent = document.getElementById('template-preview-content');

            if (!previewDiv || !previewContent) return;

            const templates = {
                default: 'Standard report card with all subjects and grades',
                nursery_french: 'French language template for nursery students with simplified layout',
                primary_english: 'English template for primary students with detailed subject breakdown',
                custom: 'Custom uploaded template'
            };

            previewContent.innerHTML = `
        <div class="alert alert-info">
            <strong>${template.replace('_', ' ').toUpperCase()}</strong><br>
            ${templates[template] || 'Select this template to use for report generation'}
        </div>
        <div style="margin-top:12px">
            <button class="btn btn-sm btn-primary" onclick="window.applyTemplate()">Apply Template</button>
        </div>
    `;
            previewDiv.style.display = 'block';
        }

        function applyTemplate() {
            const template = document.getElementById('report-template-select')?.value;
            localStorage.setItem('report_template', template);
            showToast(`✅ Template "${template}" applied`, 'success');
        }

        async function uploadCustomTemplate() {
            const file = document.getElementById('template-upload')?.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                const content = e.target.result;
                localStorage.setItem('custom_report_template', content);
                localStorage.setItem('report_template', 'custom');
                showToast('✅ Custom template uploaded', 'success');
                loadTemplatePreview();
            };
            reader.readAsText(file);
        }

        function loadReportSettings() {
            const defaultReportType = localStorage.getItem('default_report_type');
            const defaultOutputFormat = localStorage.getItem('default_output_format');
            const autoQueue = localStorage.getItem('auto_queue');
            const emailReports = localStorage.getItem('email_reports');

            if (defaultReportType) document.getElementById('default-report-type').value = defaultReportType;
            if (defaultOutputFormat) document.getElementById('default-output-format').value = defaultOutputFormat;
            if (autoQueue !== null) document.getElementById('auto-queue').value = autoQueue;
            if (emailReports !== null) document.getElementById('email-reports').value = emailReports;

            // Apply to main form
            if (defaultReportType && document.getElementById('batch-report-type')) {
                document.getElementById('batch-report-type').value = defaultReportType;
                toggleBatchOptions();
            }
            if (defaultOutputFormat && document.getElementById('batch-format')) {
                document.getElementById('batch-format').value = defaultOutputFormat;
            }
        }

        function saveReportSettings() {
            const defaultReportType = document.getElementById('default-report-type')?.value;
            const defaultOutputFormat = document.getElementById('default-output-format')?.value;
            const autoQueue = document.getElementById('auto-queue')?.value;
            const emailReports = document.getElementById('email-reports')?.value;

            if (defaultReportType) localStorage.setItem('default_report_type', defaultReportType);
            if (defaultOutputFormat) localStorage.setItem('default_output_format', defaultOutputFormat);
            if (autoQueue) localStorage.setItem('auto_queue', autoQueue);
            if (emailReports) localStorage.setItem('email_reports', emailReports);

            showToast('✅ Report settings saved', 'success');
        }

        function resetReportSettings() {
            localStorage.removeItem('default_report_type');
            localStorage.removeItem('default_output_format');
            localStorage.removeItem('auto_queue');
            localStorage.removeItem('email_reports');

            document.getElementById('default-report-type').value = 'endterm';
            document.getElementById('default-output-format').value = 'separate';
            document.getElementById('auto-queue').value = 'true';
            document.getElementById('email-reports').value = 'false';

            showToast('✅ Settings reset to defaults', 'success');
        }

        function cancelBatchGeneration() {
            cancelGeneration = true;
            isGenerating = false;
            document.getElementById('batch-progress-modal').style.display = 'none';
            showToast('Batch generation cancelled', 'warning');
        }

        function exportBatchLog() {
            let queue = [];
            try {
                queue = JSON.parse(localStorage.getItem('report_batch_queue') || '[]');
            } catch (e) { }

            if (queue.length === 0) {
                showToast('No batch history to export', 'warning');
                return;
            }

            const data = queue.map(job => ({
                'Date Added': fmtDateTime(job.timestamp),
                'Class': job.className,
                'Term': job.termName,
                'Students': job.studentNames?.join(', ') || `${job.studentIds.length} students`,
                'Status': job.status,
                'Completed': job.completedAt ? fmtDateTime(job.completedAt) : '—',
                'Format': job.format
            }));

            exportToExcel(data, `Batch_Report_Log_${new Date().toISOString().split('T')[0]}`);
            showToast('✅ Batch log exported', 'success');
        }

        async function logBatchGeneration(className, termName, successCount, totalCount) {
            try {
                await insert('activity_logs', {
                    user_id: getCurrentUser()?.id,
                    user_role: getCurrentUser()?.role,
                    action: `Batch report generation: ${successCount}/${totalCount} reports for ${className} (${termName || 'Annual'})`,
                    entity_type: 'batch_reports',
                    details: JSON.stringify({ className, termName, successCount, totalCount }),
                    created_at: new Date().toISOString()
                });
            } catch (e) { }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SECTION EX-4 — TRANSCRIPTS MODULE
