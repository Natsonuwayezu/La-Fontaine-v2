// Sortable table: paid / partial / unpaid — per student or per category
        // Accessible by admin and accountant
        // ============================================================

        /**
         * Render the Student Fee Status List module.
         * Shows all students with their fee totals, paid amounts, balances,
         * payment status (Paid/Partial/Unpaid), filterable by class, category, and status.
         * Sortable columns.
         */
        async function renderStudentFeeStatus(container) {
            if (!isAdmin() && !isAccountant()) {
                container.innerHTML = '<div class="alert alert-danger">Access denied.</div>'; return;
            }
            await ensureStateLoaded();
            const classes = (state.classes || []).filter(c => c.is_active !== false);
            const cats = (state.feeCategories || []).filter(c => c.is_active !== false);
            const terms = (state.terms || []).filter(t => t.academic_year_id === state.currentAcadYear?.id);

            container.innerHTML = `
                <div class="dash-card">
                    <div class="dash-card-header">
                        <span class="dash-card-title">💳 Student Fee Status</span>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline" onclick="window.exportFeeStatusList()">📥 Export</button>
                            <button class="btn btn-sm btn-outline" onclick="window.printFeeStatusList()">🖨️ Print</button>
                        </div>
                    </div>
                    <div class="dash-card-body">
                        <div class="filters-bar" style="flex-wrap:wrap;gap:8px">
                            <select id="fs-class" onchange="window.loadFeeStatusData()">
                                <option value="">All Classes</option>
                                ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                            <select id="fs-category" onchange="window.loadFeeStatusData()">
                                <option value="">All Categories</option>
                                ${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                            <select id="fs-term" onchange="window.loadFeeStatusData()">
                                <option value="">All Terms</option>
                                ${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                            </select>
                            <select id="fs-status" onchange="window.loadFeeStatusData()">
                                <option value="">All Statuses</option>
                                <option value="paid">✅ Fully Paid</option>
                                <option value="partial">🟡 Partially Paid</option>
                                <option value="unpaid">❌ Unpaid</option>
                            </select>
                            <input type="text" id="fs-search" placeholder="🔍 Search student…"
                                oninput="window.filterFeeStatusTable()" style="min-width:180px">
                            <span id="fs-count" style="color:var(--text-muted);font-size:.82rem;align-self:center"></span>
                        </div>
                        <div id="fs-summary" style="margin:12px 0"></div>
                        <div id="fs-table-wrap">
                            <div class="loading-container"><div class="spinner"></div><p>Loading…</p></div>
                        </div>
                    </div>
                </div>`;

            // Auto-load
            await window.loadFeeStatusData();
        }

        window.loadFeeStatusData = async function () {
            const classId = document.getElementById('fs-class')?.value;
            const catId = document.getElementById('fs-category')?.value;
            const termId = document.getElementById('fs-term')?.value;
            const statusF = document.getElementById('fs-status')?.value;
            const wrap = document.getElementById('fs-table-wrap');
            if (!wrap) return;

            wrap.innerHTML = '<div class="loading-container"><div class="spinner"></div></div>';

            let students = (state.students || []).filter(s => s.status === 'Active');
            if (classId) students = students.filter(s => s.class_id == classId);
            students = students.sort((a, b) => a.last_name.localeCompare(b.last_name));

            // Build per-student balance rows
            const rows = await Promise.all(students.map(async s => {
                let fees = (state.studentFees || []).filter(f =>
                    f.student_id == s.id && !f.is_credit && !f.manually_deleted
                );
                if (catId) fees = fees.filter(f => f.fee_category_id == catId);
                if (termId) fees = fees.filter(f => f.term_id == termId);

                const total = fees.reduce((a, f) => a + (f.is_waived ? (f.paid_amount || 0) : f.amount), 0);
                const paid = fees.reduce((a, f) => a + (f.paid_amount || 0), 0);
                const waived = fees.filter(f => f.is_waived).reduce((a, f) => a + f.amount, 0);
                const balance = Math.max(0, total - paid);
                const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 100;
                const status = balance === 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
                return { s, total, paid, balance, waived, pct, status, feeCount: fees.length };
            }));

            // Filter by status
            const filtered = statusF ? rows.filter(r => r.status === statusF) : rows;

            // Summary
            const sumDiv = document.getElementById('fs-summary');
            if (sumDiv) {
                const totTotal = filtered.reduce((a, r) => a + r.total, 0);
                const totPaid = filtered.reduce((a, r) => a + r.paid, 0);
                const totBalance = filtered.reduce((a, r) => a + r.balance, 0);
                const paidCount = filtered.filter(r => r.status === 'paid').length;
                const partCount = filtered.filter(r => r.status === 'partial').length;
                const unpaidCount = filtered.filter(r => r.status === 'unpaid').length;
                sumDiv.innerHTML = `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
                        <div class="stat-card stat-blue" style="margin:0;padding:10px"><div class="stat-value">${fmt(filtered.length)}</div><div class="stat-label">Students</div></div>
                        <div class="stat-card stat-green" style="margin:0;padding:10px"><div class="stat-value">${fmtCurrency(totPaid)}</div><div class="stat-label">Total Paid</div></div>
                        <div class="stat-card stat-red" style="margin:0;padding:10px"><div class="stat-value">${fmtCurrency(totBalance)}</div><div class="stat-label">Outstanding</div></div>
                        <div class="stat-card stat-gray" style="margin:0;padding:10px"><div class="stat-value">${paidCount}</div><div class="stat-label">✅ Fully Paid</div></div>
                        <div class="stat-card stat-orange" style="margin:0;padding:10px"><div class="stat-value">${partCount}</div><div class="stat-label">🟡 Partial</div></div>
                        <div class="stat-card stat-red" style="margin:0;padding:10px"><div class="stat-value">${unpaidCount}</div><div class="stat-label">❌ Unpaid</div></div>
                    </div>`;
            }

            // Store for filter/export
            window._feeStatusRows = filtered;
            const countEl = document.getElementById('fs-count');
            if (countEl) countEl.textContent = `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`;

            if (!filtered.length) {
                wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No students match the selected filters</div>';
                return;
            }

            wrap.innerHTML = `
                <div class="table-wrapper" id="fs-table-inner">
                    <table class="data-table" id="fs-main-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th onclick="window.sortFeeStatus('name')" style="cursor:pointer">Student ↕</th>
                                <th onclick="window.sortFeeStatus('class')" style="cursor:pointer">Class ↕</th>
                                <th onclick="window.sortFeeStatus('total')" style="cursor:pointer;text-align:right">Total Fees ↕</th>
                                <th onclick="window.sortFeeStatus('paid')" style="cursor:pointer;text-align:right">Paid ↕</th>
                                <th onclick="window.sortFeeStatus('balance')" style="cursor:pointer;text-align:right">Balance ↕</th>
                                <th style="text-align:center">%</th>
                                <th style="text-align:center">Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="fs-tbody">
                            ${renderFeeStatusRows(filtered)}
                        </tbody>
                    </table>
                </div>`;
        };

        function renderFeeStatusRows(rows) {
            return rows.map((r, i) => {
                const cls = getClassById(r.s.class_id);
                const pctFmt = r.total > 0 ? r.pct.toFixed(0) + '%' : '—';
                const barColor = r.status === 'paid' ? '#10b981' : r.status === 'partial' ? '#f59e0b' : '#ef4444';
                const badge = r.status === 'paid'
                    ? '<span class="badge badge-success">✅ Paid</span>'
                    : r.status === 'partial'
                        ? '<span class="badge badge-warning">🟡 Partial</span>'
                        : '<span class="badge badge-danger">❌ Unpaid</span>';
                return `<tr data-student-id="${r.s.id}" data-name="${esc(r.s.first_name + ' ' + r.s.last_name)}" data-class="${esc(cls?.name || '')}" data-status="${r.status}">
                    <td style="color:var(--text-muted)">${i + 1}</td>
                    <td>
                        <button class="btn-link" onclick="navigateToWithData('student-details',{studentId:${r.s.id}})" style="background:none;border:none;color:var(--role-primary);cursor:pointer;font-weight:600;text-align:left">
                            ${esc(r.s.first_name + ' ' + r.s.last_name)}
                        </button><br>
                        <small style="color:var(--text-muted)">${esc(r.s.student_code || '')}</small>
                    </td>
                    <td>${esc(cls?.name || '—')}</td>
                    <td style="text-align:right;font-weight:600">${fmtCurrency(r.total)}</td>
                    <td style="text-align:right;color:#10b981;font-weight:600">${fmtCurrency(r.paid)}</td>
                    <td style="text-align:right;color:${r.balance > 0 ? '#ef4444' : '#10b981'};font-weight:700">${fmtCurrency(r.balance)}</td>
                    <td style="text-align:center">
                        <div style="display:flex;align-items:center;gap:6px">
                            <div style="flex:1;height:6px;background:var(--border-light);border-radius:99px;overflow:hidden">
                                <div style="width:${r.pct.toFixed(0)}%;height:100%;background:${barColor};transition:width .3s"></div>
                            </div>
                            <span style="font-size:.75rem;min-width:30px">${pctFmt}</span>
                        </div>
                    </td>
                    <td style="text-align:center">${badge}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="navigateToWithData('record-payment',{studentId:${r.s.id}})" title="Record Payment">💸</button>
                        <button class="btn btn-sm btn-outline" onclick="window.openSmartWaiverModal(${r.s.id})" title="Apply Waiver">🎁</button>
                    </td>
                </tr>`;
            }).join('');
        }

        window.filterFeeStatusTable = function () {
            const term = (document.getElementById('fs-search')?.value || '').toLowerCase();
            const tbody = document.getElementById('fs-tbody');
            if (!tbody) return;
            Array.from(tbody.querySelectorAll('tr')).forEach(row => {
                row.style.display = (!term || row.dataset.name?.toLowerCase().includes(term) || row.dataset.class?.toLowerCase().includes(term)) ? '' : 'none';
            });
        };

        let _feeStatusSortDir = {};
        window.sortFeeStatus = function (col) {
            const rows = window._feeStatusRows;
            if (!rows) return;
            _feeStatusSortDir[col] = !_feeStatusSortDir[col];
            const asc = _feeStatusSortDir[col];
            const sorted = [...rows].sort((a, b) => {
                if (col === 'name') return asc ? a.s.last_name.localeCompare(b.s.last_name) : b.s.last_name.localeCompare(a.s.last_name);
                if (col === 'class') { const ca = getClassById(a.s.class_id)?.name || ''; const cb = getClassById(b.s.class_id)?.name || ''; return asc ? ca.localeCompare(cb) : cb.localeCompare(ca); }
                if (col === 'total') return asc ? a.total - b.total : b.total - a.total;
                if (col === 'paid') return asc ? a.paid - b.paid : b.paid - a.paid;
                if (col === 'balance') return asc ? a.balance - b.balance : b.balance - a.balance;
                return 0;
            });
            const tbody = document.getElementById('fs-tbody');
            if (tbody) tbody.innerHTML = renderFeeStatusRows(sorted);
        };

        window.exportFeeStatusList = function () {
            const rows = window._feeStatusRows;
            if (!rows?.length) { showToast('Load the fee status list first', 'warning'); return; }
            const data = rows.map(r => ({
                'Student': `${r.s.first_name} ${r.s.last_name}`,
                'Code': r.s.student_code || '—',
                'Class': getClassById(r.s.class_id)?.name || '—',
                'Total Fees': r.total,
                'Paid': r.paid,
                'Balance': r.balance,
                'Paid %': r.pct.toFixed(1) + '%',
                'Status': r.status === 'paid' ? 'Fully Paid' : r.status === 'partial' ? 'Partially Paid' : 'Unpaid',
                'Waived': r.waived
            }));
            exportToExcel(data, `Fee_Status_${new Date().toISOString().split('T')[0]}`);
            showToast('✅ Fee status exported', 'success');
        };

        window.printFeeStatusList = function () {
            const content = document.getElementById('fs-table-wrap');
            if (!content) return;
            const w = window.open('', '_blank');
            w.document.write(`<!DOCTYPE html><html><head><title>Fee Status</title>
                <style>body{font-family:Arial;padding:20px;font-size:11px}table{width:100%;border-collapse:collapse}
                th,td{border:1px solid #ccc;padding:5px}th{background:#1a3a5c;color:#fff}h2{text-align:center}
                @media print{body{padding:0}button{display:none}}</style></head>
                <body><h2>ECOLE LA FONTAINE — Student Fee Status</h2>
                <p style="text-align:center">${new Date().toLocaleDateString()}</p>
                ${content.innerHTML}</body></html>`);
            w.document.close(); w.print();
        };

        // Register in MODULE_REGISTRY — accessible by admin + accountant
        window.renderStudentFeeStatus = renderStudentFeeStatus;
        window.renderStudentFeesByStatus = renderStudentFeeStatus; // alias


        document.addEventListener('DOMContentLoaded', function () {
            // 1. Initialize particles on the login background
            initParticles();

            // 2. Apply saved theme (dark/light)
            initTheme();

            // 3. Set up PWA install prompt capture
            if (typeof initPWA === 'function') initPWA();

            // 4. Initialize offline support (IndexedDB + connection watcher)
            if (typeof initOfflineSupport === 'function') initOfflineSupport();

            // 5. Check for an existing session, or show the login page
            initApp();

            // 6. Back-to-top button visibility
            window.addEventListener('scroll', function () {
                const btn = document.getElementById('back-to-top');
                if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
            }, { passive: true });

            // 7. Close sidebar on outside click (mobile)
            document.addEventListener('click', function (e) {
                const sidebar = document.getElementById('sidebar');
                if (sidebar?.classList.contains('mobile-open') &&
                    !e.target.closest('.sidebar') &&
                    !e.target.closest('#menu-toggle')) {
                    sidebar.classList.remove('mobile-open');
                }
            });

            // 8. Close user dropdown on outside click
            document.addEventListener('click', function (e) {
                const dd = document.getElementById('user-dropdown');
                if (dd && !e.target.closest('.user-menu') && !e.target.closest('.user-dropdown')) {
                    dd.classList.remove('open');
                }
            });

            // 9. Set up modal backdrop click-to-close
            document.getElementById('modals-container')?.addEventListener('click', function (e) {
                if (e.target.classList.contains('modal-overlay')) closeModal();
            });

            console.log('✅ ECOLE LA FONTAINE v9.0 — All systems initialised');
        });

        // ════════════════════════════════════════════════════════════════════════
        // SECTION EX-1 — MARKS IMPORT/EXPORT MODULE
