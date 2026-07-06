// Full register export with PDF/Excel and print options
        // ════════════════════════════════════════════════════════════════════════

        function switchRegisterTab(tabName, event) {
            const tabs = ['export', 'settings', 'history'];
            for (const t of tabs) {
                const el = document.getElementById(`register-${t}-tab`);
                if (el) el.style.display = t === tabName ? 'block' : 'none';
            }
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            if (event && event.target) event.target.classList.add('active');
        }

        function loadRegisterSettings() {
            const formatSelect = document.getElementById('default-export-format');
            const orientationSelect = document.getElementById('default-orientation');
            const dateFormatSelect = document.getElementById('register-date-format');
            const decimalsSelect = document.getElementById('register-decimals');
            const exportFormatSelect = document.getElementById('export-register-format');
            const orientationSettingSelect = document.getElementById('export-orientation');

            const savedFormat = localStorage.getItem('default_register_format');
            const savedOrientation = localStorage.getItem('default_register_orientation');
            const savedDateFormat = localStorage.getItem('register_date_format');
            const savedDecimals = localStorage.getItem('register_decimals');

            if (savedFormat && formatSelect) formatSelect.value = savedFormat;
            if (savedFormat && exportFormatSelect) exportFormatSelect.value = savedFormat;
            if (savedOrientation && orientationSelect) orientationSelect.value = savedOrientation;
            if (savedOrientation && orientationSettingSelect) orientationSettingSelect.value = savedOrientation;
            if (savedDateFormat && dateFormatSelect) dateFormatSelect.value = savedDateFormat;
            if (savedDecimals && decimalsSelect) decimalsSelect.value = savedDecimals;
        }

        function saveRegisterSettings() {
            const format = document.getElementById('default-export-format')?.value;
            const orientation = document.getElementById('default-orientation')?.value;
            const dateFormat = document.getElementById('register-date-format')?.value;
            const decimals = document.getElementById('register-decimals')?.value;

            if (format) localStorage.setItem('default_register_format', format);
            if (orientation) localStorage.setItem('default_register_orientation', orientation);
            if (dateFormat) localStorage.setItem('register_date_format', dateFormat);
            if (decimals) localStorage.setItem('register_decimals', decimals);

            // Update export format dropdown
            const exportFormat = document.getElementById('export-register-format');
            if (exportFormat && format) exportFormat.value = format;

            // Update orientation dropdown
            const orientationSelect = document.getElementById('export-orientation');
            if (orientationSelect && orientation) orientationSelect.value = orientation;

            showToast('✅ Settings saved', 'success');
        }

        function resetRegisterSettings() {
            localStorage.removeItem('default_register_format');
            localStorage.removeItem('default_register_orientation');
            localStorage.removeItem('register_date_format');
            localStorage.removeItem('register_decimals');

            const formatSelect = document.getElementById('default-export-format');
            const orientationSelect = document.getElementById('default-orientation');
            const dateFormatSelect = document.getElementById('register-date-format');
            const decimalsSelect = document.getElementById('register-decimals');
            const exportFormatSelect = document.getElementById('export-register-format');
            const orientationSettingSelect = document.getElementById('export-orientation');

            if (formatSelect) formatSelect.value = 'excel';
            if (exportFormatSelect) exportFormatSelect.value = 'excel';
            if (orientationSelect) orientationSelect.value = 'landscape';
            if (orientationSettingSelect) orientationSettingSelect.value = 'landscape';
            if (dateFormatSelect) dateFormatSelect.value = 'DD/MM/YYYY';
            if (decimalsSelect) decimalsSelect.value = '2';

            showToast('✅ Settings reset to defaults', 'success');
        }

        function resetRegisterForm() {
            document.getElementById('export-register-class').value = '';
            document.getElementById('export-register-term').value = '';
            document.getElementById('include-subject-breakdown').checked = true;
            document.getElementById('include-rankings').checked = true;
            document.getElementById('include-attendance').checked = true;
            document.getElementById('include-averages').checked = true;
            document.getElementById('register-preview').style.display = 'none';
            showToast('Form reset', 'info', 1500);
        }

        async function previewRegister() {
            const classId = document.getElementById('export-register-class')?.value;
            const termId = document.getElementById('export-register-term')?.value;
            const previewDiv = document.getElementById('register-preview');

            if (!classId) {
                showToast('Please select a class', 'warning');
                return;
            }

            previewDiv.style.display = 'block';
            previewDiv.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Generating preview...</p></div>';

            try {
                const isAnnual = !termId;
                const registerData = await generateRegisterData(classId, termId, isAnnual);

                if (!registerData || registerData.students.length === 0) {
                    previewDiv.innerHTML = '<div class="alert alert-warning">No data available for preview</div>';
                    return;
                }

                previewDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>Preview:</strong> ${registerData.className} | ${registerData.termName} | ${registerData.students.length} students
            </div>
            <div class="table-wrapper" style="max-height:400px; overflow-y:auto">
                <table class="data-table" style="font-size:12px">
                    <thead>
                        <tr style="position:sticky; top:0; background:var(--bg-primary)">
                            <th>#</th>
                            <th>Student Name</th>
                            <th>Student Code</th>
                            <th>Total Score</th>
                            <th>%</th>
                            <th>Grade</th>
                            <th>Rank</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registerData.students.slice(0, 10).map((s, i) => `
                            <tr>
                                <td style="text-align:center">${i + 1}</td>
                                <td><strong>${esc(s.name)}</strong></td>
                                <td>${esc(s.code || '—')}</td>
                                <td style="text-align:right">${s.totalScore?.toFixed(1) || '—'}</td>
                                <td style="text-align:center"><span class="badge ${getGradeClass(s.percentage)}">${s.percentage?.toFixed(1) || '—'}%</span></td>
                                <td style="text-align:center">${s.grade || '—'}</td>
                                <td style="text-align:center">${s.rank || '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${registerData.students.length > 10 ? `<p style="margin-top:8px; color:var(--text-muted); text-align:center">... and ${registerData.students.length - 10} more students</p>` : ''}
            <div class="btn-group" style="margin-top:12px">
                <button class="btn btn-sm btn-primary" onclick="window.exportRegisterNow()">📥 Export Full Register</button>
            </div>
        `;

            } catch (error) {
                previewDiv.innerHTML = `<div class="alert alert-danger">Error generating preview: ${error.message}</div>`;
            }
        }

        async function generateRegisterData(classId, termId, isAnnual = false) {
            const cls = getClassById(classId);
            if (!cls) return null;

            const isNursery = cls.level === 'Nursery';
            const students = state.students.filter(s => s.class_id == classId && s.status === 'Active');

            let terms = [];
            let termName = '';

            if (isAnnual) {
                terms = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);
                termName = 'Annual Register';
            } else {
                const term = state.terms.find(t => t.id == termId);
                if (term) terms = [term];
                termName = term?.name || 'Current Term';
            }

            if (terms.length === 0) return null;

            const phase = getCurrentPhase(terms[0]);
            let subjects = state.subjects.filter(s => s.level === cls.level && s.is_active !== false);
            if (phase === 'pre_midterm') subjects = subjects.filter(s => !s.appears_only_post_midterm);
            subjects.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

            // Get all assessments for the selected terms
            let allAssessments = [];
            for (const term of terms) {
                const assessments = state.assessments.filter(a => a.class_id == classId && a.term_id === term.id);
                allAssessments.push(...assessments);
            }

            const studentData = [];
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
                studentData.push({
                    id: student.id,
                    name: `${student.first_name} ${student.last_name}`,
                    code: student.student_code,
                    totalScore: totalScore,
                    totalMax: totalMax,
                    percentage: percentage,
                    grade: getGrade(percentage)
                });
            }

            // Calculate ranks
            studentData.sort((a, b) => b.percentage - a.percentage);
            let rank = 1;
            for (let i = 0; i < studentData.length; i++) {
                if (i > 0 && studentData[i].percentage === studentData[i - 1].percentage) {
                    studentData[i].rank = studentData[i - 1].rank;
                } else {
                    studentData[i].rank = rank;
                }
                rank = studentData[i].rank + 1;
                studentData[i].rankDisplay = `${studentData[i].rank} of ${studentData.length}`;
            }

            const classAverage = studentData.reduce((sum, s) => sum + s.percentage, 0) / (studentData.length || 1);
            const passCount = studentData.filter(s => s.percentage >= 50).length;
            const passRate = (passCount / (studentData.length || 1)) * 100;

            return {
                className: cls.name,
                termName: termName,
                isNursery: isNursery,
                phase: phase,
                students: studentData,
                totalStudents: students.length,
                classAverage: classAverage,
                passRate: passRate,
                subjects: subjects,
                assessments: allAssessments
            };
        }

        async function exportRegisterNow() {
            const classId = document.getElementById('export-register-class')?.value;
            const termId = document.getElementById('export-register-term')?.value;
            const format = document.getElementById('export-register-format')?.value;
            const orientation = document.getElementById('export-orientation')?.value;
            const includeSubjects = document.getElementById('include-subject-breakdown')?.checked;
            const includeRankings = document.getElementById('include-rankings')?.checked;
            const includeAttendance = document.getElementById('include-attendance')?.checked;
            const includeAverages = document.getElementById('include-averages')?.checked;
            const studentFilter = document.getElementById('export-student-filter')?.value;

            if (!classId) {
                showToast('Please select a class', 'warning');
                return;
            }

            const isAnnual = !termId;
            const cls = getClassById(classId);
            const decimals = parseInt(localStorage.getItem('register_decimals') || '2');
            const dateFormat = localStorage.getItem('register_date_format') || 'DD/MM/YYYY';

            // Show progress modal
            const modal = document.getElementById('export-progress-modal');
            const progressBar = document.getElementById('export-progress-bar');
            const progressText = document.getElementById('export-progress-text');
            modal.style.display = 'flex';
            progressBar.style.width = '20%';
            progressText.textContent = 'Generating register data...';

            try {
                const registerData = await generateRegisterData(classId, termId, isAnnual);
                if (!registerData || registerData.students.length === 0) {
                    throw new Error('No data available for export');
                }

                progressBar.style.width = '50%';
                progressText.textContent = 'Formatting data...';

                // Filter students
                let studentsToExport = [...registerData.students];
                if (studentFilter === 'active') {
                    // Already filtered by status
                } else if (studentFilter === 'with_marks') {
                    studentsToExport = studentsToExport.filter(s => s.totalScore > 0);
                }

                progressBar.style.width = '70%';
                progressText.textContent = 'Building export file...';

                // Build export data
                const exportData = studentsToExport.map(s => {
                    const row = {
                        'Rank': s.rank,
                        'Student Name': s.name,
                        'Student Code': s.code,
                        'Total Score': formatNumber(s.totalScore, decimals),
                        'Max Score': s.totalMax,
                        'Percentage (%)': formatNumber(s.percentage, decimals),
                        'Grade': s.grade
                    };

                    if (includeAverages) {
                        row['Class Average'] = formatNumber(registerData.classAverage, decimals) + '%';
                    }

                    return row;
                });

                // Add summary row
                const summaryRow = {
                    'Rank': '',
                    'Student Name': 'CLASS AVERAGE',
                    'Student Code': '',
                    'Total Score': '',
                    'Max Score': '',
                    'Percentage (%)': formatNumber(registerData.classAverage, decimals) + '%',
                    'Grade': getGrade(registerData.classAverage)
                };
                exportData.push(summaryRow);

                progressBar.style.width = '90%';
                progressText.textContent = 'Saving file...';

                // Record export in history
                const exportRecord = {
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    className: cls.name,
                    termName: registerData.termName,
                    format: format,
                    studentCount: studentsToExport.length,
                    exportedBy: getCurrentUser()?.name || 'System'
                };
                addToExportHistory(exportRecord);

                // Export based on format
                const filename = `${cls.name}_${registerData.termName.replace(/\s/g, '_')}_Register_${formatDate(new Date(), dateFormat)}`;

                if (format === 'excel') {
                    exportToExcel(exportData, filename);
                } else if (format === 'csv') {
                    const ws = XLSX.utils.json_to_sheet(exportData);
                    const csv = XLSX.utils.sheet_to_csv(ws);
                    downloadBlob(csv, `${filename}.csv`, 'text/csv');
                } else if (format === 'pdf') {
                    await exportRegisterToPDF(exportData, registerData, filename, orientation);
                }

                progressBar.style.width = '100%';
                progressText.textContent = 'Export complete!';

                setTimeout(() => {
                    modal.style.display = 'none';
                    showToast(`✅ Register exported successfully (${studentsToExport.length} students)`, 'success');
                }, 1000);

            } catch (error) {
                modal.style.display = 'none';
                showToast('Export failed: ' + error.message, 'error');
            }
        }

        async function exportRegisterToPDF(data, registerData, filename, orientation) {
            if (typeof html2pdf === 'undefined') {
                // Fallback: open print dialog
                const html = generateRegisterHTML(data, registerData);
                const win = window.open('', '_blank');
                win.document.write(html);
                win.document.close();
                win.print();
                return;
            }

            const html = generateRegisterHTML(data, registerData);
            const element = document.createElement('div');
            element.innerHTML = html;

            html2pdf().set({
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `${filename}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: orientation === 'landscape' ? 'a4' : 'a4', orientation: orientation }
            }).from(element).save();
        }

        function generateRegisterHTML(data, registerData) {
            const school = state.schoolSettings || {};
            const logoHtml = getSchoolLogoHtml(school.school_logo);

            return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${registerData.className} - Class Register</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:'Inter',Arial,sans-serif;padding:20px}
                .header{text-align:center;margin-bottom:30px;border-bottom:2px solid #1a3a5c;padding-bottom:15px}
                .school-name{font-size:20px;font-weight:800;color:#1a3a5c}
                .report-title{font-size:16px;font-weight:700;margin:10px 0}
                .info-bar{display:flex;justify-content:space-between;margin:20px 0;padding:10px;background:#f0f4f8;border-radius:8px}
                table{width:100%;border-collapse:collapse;margin-top:15px}
                th,td{border:1px solid #ccc;padding:8px;text-align:left}
                th{background:#1a3a5c;color:white}
                .badge-success{background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px}
                .badge-warning{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px}
                .badge-danger{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px}
                .footer{text-align:center;margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:10px;color:#666}
                @media print{body{padding:0}}
            </style>
        </head>
        <body>
            <div class="header">
                <div class="school-name">${esc(school.school_name || 'ECOLE LA FONTAINE')}</div>
                <div class="report-title">CLASS REGISTER</div>
                <div>${esc(registerData.className)} - ${esc(registerData.termName)}</div>
                <div style="font-size:12px; margin-top:5px">Generated on ${new Date().toLocaleString()}</div>
            </div>
            
            <div class="info-bar">
                <div><strong>Total Students:</strong> ${registerData.totalStudents}</div>
                <div><strong>Class Average:</strong> ${registerData.classAverage.toFixed(1)}%</div>
                <div><strong>Pass Rate:</strong> ${registerData.passRate.toFixed(1)}%</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Student Name</th>
                        <th>Student Code</th>
                        <th>Total Score</th>
                        <th>Max Score</th>
                        <th>%</th>
                        <th>Grade</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.slice(0, -1).map(s => `
                        <tr>
                            <td style="text-align:center">${s.Rank}</td>
                            <td><strong>${esc(s['Student Name'])}</strong></td>
                            <td>${esc(s['Student Code'])}</td>
                            <td style="text-align:right">${s['Total Score']}</td>
                            <td style="text-align:right">${s['Max Score']}</td>
                            <td style="text-align:center">${s['Percentage (%)']}</td>
                            <td style="text-align:center">${s.Grade}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr style="background:#f0f4f8; font-weight:700">
                        <td colspan="2">CLASS AVERAGE</td>
                        <td colspan="4" style="text-align:center">${registerData.classAverage.toFixed(1)}%</td>
                        <td style="text-align:center">${getGrade(registerData.classAverage)}</td>
                    </tr>
                </tfoot>
            </table>
            
            <div class="footer">
                <p>${esc(school.report_footer_line1 || 'This is an official school document')}</p>
                <p>Printed on ${new Date().toLocaleString()}</p>
            </div>
        </body>
        </html>
    `;
        }

        function addToExportHistory(record) {
            let history = [];
            try {
                history = JSON.parse(localStorage.getItem('register_export_history') || '[]');
            } catch (e) { }

            history.unshift(record);

            // Keep only last 50
            if (history.length > 50) history = history.slice(0, 50);

            localStorage.setItem('register_export_history', JSON.stringify(history));
        }

        async function refreshExportHistory() {
            const container = document.getElementById('export-history-list');
            if (!container) return;

            let history = [];
            try {
                history = JSON.parse(localStorage.getItem('register_export_history') || '[]');
            } catch (e) { }

            if (history.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No export history found</div>';
                return;
            }

            container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date & Time</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th>Format</th>
                    <th>Students</th>
                    <th>Exported By</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(record => `
                    <tr>
                        <td>${fmtDateTime(record.timestamp)}</td>
                        <td><strong>${esc(record.className)}</strong></td>
                        <td>${esc(record.termName)}</td>
                        <td><span class="badge badge-info">${record.format.toUpperCase()}</span></td>
                        <td>${record.studentCount}</td>
                        <td>${esc(record.exportedBy)}</td>
                        <td>
                            <button class="btn btn-sm btn-outline" onclick="window.repeatExport(${record.id})">🔄 Repeat</button>
                         </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
        }

        function clearExportHistory() {
            if (confirm('Clear all export history?')) {
                localStorage.removeItem('register_export_history');
                refreshExportHistory();
                showToast('✅ Export history cleared', 'success');
            }
        }

        function repeatExport(recordId) {
            let history = [];
            try {
                history = JSON.parse(localStorage.getItem('register_export_history') || '[]');
            } catch (e) { }

            const record = history.find(r => r.id == recordId);
            if (record) {
                // Find class with matching name
                const cls = state.classes.find(c => c.name === record.className);
                if (cls) {
                    document.getElementById('export-register-class').value = cls.id;
                    document.getElementById('export-register-format').value = record.format;
                    exportRegisterNow();
                } else {
                    showToast('Class not found', 'error');
                }
            }
        }

        function getSchoolLogoHtml(logoData) {
            if (!logoData || logoData === '🏫') return '<span style="font-size:24px">🏫</span>';
            if (logoData.startsWith('data:') || logoData.startsWith('http')) {
                return `<img src="${logoData}" style="height:40px;width:auto;" onerror="this.outerHTML='🏫'">`;
            }
            return `<span style="font-size:24px">${logoData}</span>`;
        }

        function formatNumber(value, decimals) {
            if (value === null || value === undefined || isNaN(value)) return '—';
            return value.toFixed(decimals);
        }

        function formatDate(date, format) {
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();

            switch (format) {
                case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
                case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
                default: return `${day}/${month}/${year}`;
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SECTION EX-3 — REPORT CARD GENERATOR MODULE
