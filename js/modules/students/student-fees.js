// ══════════════════════════════════════════════════════════════════════════


        /**
         * Student fee management: view assigned fees, payment history,
         * record payment, apply waiver, add fee. Balance summary at top.
         */
        async function renderStudentFees(container) {
            await ensureStateLoaded();

            const user = state.currentUser;
            const isTeacher = user?.role === 'teacher';

            if (isTeacher) {
                container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot view fee balances.</div>';
                return;
            }

            const classes = state.classes.filter(c => c.is_active !== false);

            container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">💳 Student Fee Balances</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window.exportStudentFeeBalances()">📥 Export</button>
                    <button class="btn btn-sm btn-outline" onclick="window.printFeeReport()">🖨️ Print</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar">
                    <select id="stf-class" class="form-control" style="width:180px" onchange="window.renderStudentFeesTable()">
                        <option value="">All Classes</option>
                        ${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                    </select>
                    <select id="stf-status" class="form-control" style="width:150px" onchange="window.renderStudentFeesTable()">
                        <option value="">All Status</option>
                        <option value="has_balance">Has Balance 🔴</option>
                        <option value="paid">Paid ✅</option>
                        <option value="credit">Has Credit ⭐</option>
                    </select>
                    <input type="text" id="stf-search" class="form-control flex-1" placeholder="🔍 Search student name or code..." oninput="window.renderStudentFeesTable()">
                    <span class="result-count" id="stf-count"></span>
                </div>
                
                <div class="table-wrapper" id="stf-table-container">
                    <div class="loading-container"><div class="spinner"></div><p>Loading student fees...</p></div>
                </div>
            </div>
        </div>
        
        <div class="dash-card" style="margin-top:20px">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Fee Summary</span>
            </div>
            <div class="dash-card-body">
                <div id="fee-summary-stats" class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
                    <div class="loading-container"><div class="spinner"></div><p>Loading summary...</p></div>
                </div>
            </div>
        </div>
    `;
            window.renderStudentFeesTable = renderStudentFeesTable;
            window.exportStudentFeeBalances = exportStudentFeeBalances;
            window.printFeeReport = printFeeReport;
            window.openStudentFeeDetails = openStudentFeeDetails;

            await renderStudentFeesTable();
            await renderFeeSummary();
        }

        /**
         * Renders 4 summary stat cards into #fee-summary-stats: total expected
         * fees, total collected, total outstanding, and collection rate —
         * across all active students (school-wide, not filtered by the
         * class/status/search filters used for the table above it).
         */
        async function renderFeeSummary() {
            const container = document.getElementById('fee-summary-stats');
            if (!container) return;

            const students = state.students.filter(s => s.status === 'Active');
            let totalExpected = 0, totalPaid = 0;
            for (const s of students) {
                const bal = await getFullStudentBalance(s.id);
                totalExpected += bal.total;
                totalPaid += bal.paid;
            }
            const totalOutstanding = Math.max(0, totalExpected - totalPaid);
            const collectionRate = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

            container.innerHTML = `
                <div class="stat-card"><div class="stat-value">${fmtCurrency(totalExpected)}</div><div class="stat-label">📋 Total Expected</div></div>
                <div class="stat-card"><div class="stat-value" style="color:var(--success)">${fmtCurrency(totalPaid)}</div><div class="stat-label">✅ Total Collected</div></div>
                <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${fmtCurrency(totalOutstanding)}</div><div class="stat-label">🔴 Outstanding</div></div>
                <div class="stat-card"><div class="stat-value">${collectionRate.toFixed(1)}%</div><div class="stat-label">📊 Collection Rate</div></div>
            `;
        }


        /**
         * Link students into family groups for shared billing.
         * Auto-detect siblings by guardian phone or name. Manual link/unlink.
         */
        async function renderSiblingLinking(el) {
            const families = state.families || [];
            const studentsWithFamily = state.students.filter(s => s.family_id);
            const studentsWithoutFamily = state.students.filter(s => !s.family_id && s.status === 'Active');

            // Auto-detect potential siblings (same guardian name or same guardian phone)
            const potentialSiblings = [];
            const guardianMap = new Map();
            studentsWithoutFamily.forEach(s => {
                const key = (s.guardian_name || '').toLowerCase();
                if (key && !guardianMap.has(key)) guardianMap.set(key, []);
                if (key) guardianMap.get(key).push(s);
            });
            guardianMap.forEach(group => {
                if (group.length > 1) potentialSiblings.push(group);
            });

            // Build families table HTML safely
            let familiesHtml = '';
            if (families.length) {
                for (const f of families) {
                    const familyStudents = state.students.filter(s => s.family_id === f.id);
                    familiesHtml += `<tr>
                        <td><code>${esc(f.family_code)}</code></td>
                        <td><strong>${esc(f.guardian_name || '—')}</strong></td>
                        <td>${esc(f.guardian_phone || '—')}</td>
                        <td>${familyStudents.length} student${familyStudents.length !== 1 ? 's' : ''}</td>
                        <td>${fmtCurrency(f.discount_amount || 0)}</td>
                        <td>
                            <button class="btn btn-sm btn-outline" onclick="openEditFamilyModalFull(${f.id})">✏️</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteFamilyFull(${f.id},'${esc(f.family_code)}')">🗑️</button>
                        </td>
                    </tr>`;
                }
            } else {
                familiesHtml = '<tr><td colspan="6" style="text-align:center">No families created</td></tr>';
            }

            // Build linked table HTML
            let linkedHtml = '';
            if (studentsWithFamily.length) {
                for (const s of studentsWithFamily) {
                    const family = families.find(f => f.id === s.family_id);
                    const cls = getClassById(s.class_id);
                    linkedHtml += `<tr>
                        <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                        <td>${esc(cls?.name || '—')}</td>
                        <td><code>${esc(family?.family_code || '—')}</code></td>
                        <td>${esc(family?.guardian_name || '—')}</td>
                        <td>${fmtCurrency(family?.discount_amount || 0)}</td>
                        <td><button class="btn btn-sm btn-warning" onclick="unlinkStudentFull(${s.id},'${esc(s.first_name)} ${esc(s.last_name)}')">🔗 Unlink</button></td>
                    </tr>`;
                }
            } else {
                linkedHtml = '<tr><td colspan="6" style="text-align:center">No linked students</td></tr>';
            }

            // Build unlinked table HTML
            let unlinkedHtml = '';
            if (studentsWithoutFamily.length) {
                for (const s of studentsWithoutFamily) {
                    const cls = getClassById(s.class_id);
                    unlinkedHtml += `<tr>
                        <td><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong></td>
                        <td>${esc(cls?.name || '—')}</td>
                        <td>${esc(s.guardian_name || '—')}</td>
                        <td>${esc(s.guardian_phone || '—')}</td>
                        <td><button class="btn btn-sm btn-primary" onclick="openLinkStudentModalFull(${s.id},'${esc(s.first_name)} ${esc(s.last_name)}')">🔗 Link to Family</button></td>
                    </tr>`;
                }
            } else {
                unlinkedHtml = '<tr><td colspan="5" style="text-align:center">No unlinked students</td></tr>';
            }

            // Build auto-detect HTML
            let autoHtml = '';
            if (potentialSiblings.length) {
                for (const group of potentialSiblings) {
                    const studentIds = group.map(s => s.id).join(',');
                    const studentNames = group.map(s => `${esc(s.first_name)} ${esc(s.last_name)}`).join(', ');
                    autoHtml += `<tr>
                        <td><strong>${esc(group[0].guardian_name)}</strong></td>
                        <td>${studentNames}</td>
                        <td><button class="btn btn-sm btn-primary" onclick="autoCreateFamilyForGroup('${studentIds}')">🏠 Create Family & Link All</button></td>
                    </tr>`;
                }
            }

            el.innerHTML = `
                <div class="dash-card">
                    <div class="dash-card-header">
                        <span class="dash-card-title">👨‍👩‍👧 Family & Sibling Management</span>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-primary" onclick="openCreateFamilyModalFull()">➕ Create Family</button>
                            <button class="btn btn-sm btn-outline" onclick="renderSiblingLinking(document.getElementById('dynamic-content'))">🔄 Refresh</button>
                        </div>
                    </div>
                    <div class="dash-card-body">
                        <div class="tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border-light);margin-bottom:16px">
                            <button class="tab-btn active" onclick="showFamilyTabFull('families', event)">🏠 Families (${families.length})</button>
                            <button class="tab-btn" onclick="showFamilyTabFull('linked', event)">👥 Linked (${studentsWithFamily.length})</button>
                            <button class="tab-btn" onclick="showFamilyTabFull('unlinked', event)">📋 Unlinked (${studentsWithoutFamily.length})</button>
                            ${potentialSiblings.length > 0 ? `<button class="tab-btn" onclick="showFamilyTabFull('auto', event)">🔍 Auto-Detect (${potentialSiblings.length})</button>` : ''}
                        </div>
                        <div id="families-tab-full" class="tab-content active">
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead><tr><th>Family Code</th><th>Guardian Name</th><th>Phone</th><th>Students</th><th>Discount</th><th>Actions</th></tr></thead>
                                    <tbody>${familiesHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <div id="linked-tab-full" class="tab-content" style="display:none">
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead><tr><th>Student</th><th>Class</th><th>Family Code</th><th>Guardian</th><th>Discount</th><th>Action</th></tr></thead>
                                    <tbody>${linkedHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <div id="unlinked-tab-full" class="tab-content" style="display:none">
                            <div class="filters-bar"><input type="text" id="unlinked-search-full" placeholder="🔍 Search students..." class="flex-1" oninput="filterUnlinkedStudentsFull()"></div>
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead><tr><th>Student</th><th>Class</th><th>Guardian</th><th>Phone</th><th>Action</th></tr></thead>
                                    <tbody id="unlinked-students-list-full">${unlinkedHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        ${potentialSiblings.length > 0 ? `
                        <div id="auto-tab-full" class="tab-content" style="display:none">
                            <div class="alert alert-info">Detected students with the same guardian name. Consider linking them as siblings.</div>
                            <div class="table-wrapper">
                                <table class="data-table">
                                    <thead><tr><th>Guardian</th><th>Students</th><th>Action</th></tr></thead>
                                    <tbody>${autoHtml}</tbody>
                                </table>
                            </div>
                        </div>` : ''}
                    </div>
                </div>`;
        }


        /**
         * Manage family groups: view members, total family balance,
         * family payment history. Merge and split family groups.
         */
        async function renderFamilyManagement(container) {
            if (!container) return;
            container.innerHTML = `
                <div class="dash-card">
                    <div class="dash-card-header"><h2>👨‍👩‍👧 Family Management</h2></div>
                    <div class="dash-card-body">
                        <p class="text-muted">This module provides utility functions used by other modules. 
                        Select a specific action from the relevant section.</p>
                    </div>
                </div>
            `;
        }



        // ══════════════════════════════════════════════════════════════════════════
        // SECTION 40 — FINANCE: PAYMENTS & RECORDS
