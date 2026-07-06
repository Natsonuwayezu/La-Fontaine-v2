// SECTION 60: MANUAL ADJUSTMENTS
        // ================================================================

        async function renderManualAdjustments(container) {
            await ensureStateLoaded();
            const user = state.currentUser;
            if (user?.role === 'teacher') { container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot make manual adjustments.</div>'; return; }
            const students = state.students.filter(s => s.status === 'Active').sort((a, b) => a.last_name.localeCompare(b.last_name));
            const categories = state.feeCategories.filter(c => c.is_active !== false);
            const terms = state.terms.filter(t => t.academic_year_id === state.currentAcadYear?.id);
            container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header"><span class="dash-card-title">⚙️ Manual Balance Adjustments</span></div>
            <div class="dash-card-body">
                <div class="alert alert-warning"><strong>⚠️ Warning:</strong> Manual adjustments directly modify student balances. All changes are logged for audit purposes.</div>
                <div class="form-grid"><div class="form-group full"><label>Select Student</label><select id="adj-student" class="form-control" onchange="window.loadStudentBalanceInfo()"><option value="">-- Select Student --</option>${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${esc(s.student_code || '')})</option>`).join('')}</select></div></div>
                <div id="student-balance-info" style="display:none; margin:16px 0; padding:12px; background:var(--bg-tertiary); border-radius:8px"></div>
                <div class="form-grid">
                    <div class="form-group"><label>Adjustment Type</label><select id="adj-type" class="form-control" onchange="window.toggleAdjustmentFields()"><option value="add_fee">➕ Add Fee (Increase Balance)</option><option value="add_payment">💰 Add Payment (Decrease Balance)</option><option value="add_credit">⭐ Add Credit (Overpayment/Refund)</option><option value="waive_fee">🎁 Waive Fee (Remove from Balance)</option><option value="adjust_balance">📊 Direct Balance Adjustment</option></select></div>
                    <div class="form-group" id="adj-fee-category-group" style="display:none"><label>Fee Category</label><select id="adj-fee-category" class="form-control"><option value="">-- Select Fee Category --</option>${categories.map(c => `<option value="${c.id}">${esc(c.name)} (${fmtCurrency(c.amount || 0)} default)</option>`).join('')}</select></div>
                    <div class="form-group" id="adj-term-group" style="display:none"><label>Term</label><select id="adj-term" class="form-control">${terms.map(t => `<option value="${t.id}" ${t.id === state.currentTerm?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Amount (RWF)</label><input type="number" id="adj-amount" class="form-control" min="0" step="1000" placeholder="Enter amount"></div>
                    <div class="form-group full" id="adj-reason-group"><label>Reason / Notes *</label><textarea id="adj-reason" class="form-control" rows="2" placeholder="Provide reason for this adjustment..."></textarea></div>
                </div>
                <div class="btn-group" style="margin-top:20px"><button class="btn btn-danger" onclick="window.submitManualAdjustment()">⚠️ Apply Adjustment</button><button class="btn btn-outline" onclick="window.resetAdjustmentForm()">🗑️ Clear Form</button></div>
            </div>
        </div>
        <div class="dash-card" style="margin-top:20px"><div class="dash-card-header"><span class="dash-card-title">📜 Recent Adjustments</span><button class="btn btn-sm btn-outline" onclick="window.loadAdjustmentHistory()">🔄 Refresh</button></div><div class="dash-card-body"><div id="adjustment-history" class="table-wrapper"><div class="loading-container"><div class="spinner"></div><p>Loading adjustment history...</p></div></div></div></div>
    `;
            window.loadStudentBalanceInfo = loadStudentBalanceInfo;
            window.toggleAdjustmentFields = toggleAdjustmentFields;
            window.submitManualAdjustment = submitManualAdjustment;
            window.resetAdjustmentForm = resetAdjustmentForm;
            window.loadAdjustmentHistory = loadAdjustmentHistory;
        }
        window.renderManualAdjustments = renderManualAdjustments;

        async function loadStudentBalanceInfo() {
            const studentId = document.getElementById('adj-student')?.value;
            const container = document.getElementById('student-balance-info');
            if (!container) return;
            if (!studentId) { container.innerHTML = ''; return; }
            await ensureStateLoaded();
            const bal = typeof getFullStudentBalance === 'function' ? getFullStudentBalance(parseInt(studentId)) : { total: 0, paid: 0, balance: 0 };
            container.innerHTML = `<div style="background:var(--bg-tertiary);padding:12px;border-radius:8px;font-size:13px"><div style="display:flex;gap:24px;flex-wrap:wrap"><div><strong>Total Fees:</strong> ${fmtCurrency(bal.total || 0)}</div><div><strong>Paid:</strong> ${fmtCurrency(bal.paid || 0)}</div><div style="color:${(bal.balance || 0) > 0 ? 'var(--danger)' : 'var(--success)'}"><strong>Balance:</strong> ${fmtCurrency(bal.balance || 0)}</div></div></div>`;
        }
        window.loadStudentBalanceInfo = loadStudentBalanceInfo;

        function toggleAdjustmentFields() {
            const type = document.getElementById('adj-type')?.value;
            const catGp = document.getElementById('adj-fee-category-group');
            if (catGp) catGp.style.display = type === 'waive' ? '' : 'none';
        }
        window.toggleAdjustmentFields = toggleAdjustmentFields;

        async function submitManualAdjustment() {
            const studentId = document.getElementById('adj-student')?.value;
            const type = document.getElementById('adj-type')?.value || 'credit';
            const amount = parseFloat(document.getElementById('adj-amount')?.value || 0);
            const reason = document.getElementById('adj-reason')?.value?.trim();
            if (!studentId) { showToast('Select a student', 'warning'); return; }
            if (!amount || amount <= 0) { showToast('Enter a valid amount', 'warning'); return; }
            if (!reason) { showToast('Reason is required', 'warning'); return; }
            const payload = {
                student_id: parseInt(studentId),
                fee_category_id: null,
                term_id: state.currentTerm?.id || null,
                academic_year_id: state.currentAcadYear?.id || null,
                amount: type === 'credit' ? -Math.abs(amount) : Math.abs(amount),
                paid_amount: 0,
                is_paid: false,
                is_waived: type === 'waive',
                notes: '[' + type.toUpperCase() + '] ' + reason,
                created_at: new Date().toISOString()
            };
            const r = await apiRequest('student_fees', 'POST', payload);
            if (r.success) {
                await refreshTable('student_fees');
                await logActivity(state.currentUser?.id, state.currentUser?.role, type + ' of ' + fmtCurrency(amount) + ' for student #' + studentId + ': ' + reason, 'finance');
                showToast('✅ Adjustment applied', 'success');
                resetAdjustmentForm();
                await loadStudentBalanceInfo();
                await loadAdjustmentHistory();
            } else showToast('Failed: ' + r.error, 'error');
        }
        window.submitManualAdjustment = submitManualAdjustment;

        function resetAdjustmentForm() {
            ['adj-student', 'adj-type', 'adj-amount', 'adj-reason', 'adj-fee-category'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = el.tagName === 'SELECT' ? el.options[0]?.value || '' : '';
            });
            const info = document.getElementById('student-balance-info');
            if (info) info.innerHTML = '';
        }
        window.resetAdjustmentForm = resetAdjustmentForm;

        async function loadAdjustmentHistory() {
            const studentId = document.getElementById('adj-student')?.value;
            const container = document.getElementById('adjustment-history');
            if (!container) return;
            if (!studentId) { container.innerHTML = ''; return; }
            const fees = (state.studentFees || []).filter(f => f.student_id === parseInt(studentId) && (f.notes || '').match(/^\[(CREDIT|DEBIT|WAIVE)\]/)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
            if (!fees.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No manual adjustments yet.</p>'; return; }
            container.innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${fees.map(f => `<tr><td>${fmtDate(f.created_at)}</td><td><span class="badge ${f.amount < 0 ? 'badge-success' : f.is_waived ? 'badge-info' : 'badge-danger'}">${f.notes?.match(/^\[([A-Z]+)\]/)?.[1] || '—'}</span></td><td style="text-align:right">${fmtCurrency(Math.abs(f.amount || 0))}</td><td>${esc((f.notes || '').replace(/^\[[A-Z]+\] /, ''))}</td></tr>`).join('')}</tbody></table></div>`;
        }
        window.loadAdjustmentHistory = loadAdjustmentHistory;

        // ================================================================
