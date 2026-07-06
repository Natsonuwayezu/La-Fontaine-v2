// js/modules/family-fee-summary.js
// Family Fee Summary Module - View combined fee status for all family members


async function renderFamilyFeeSummary(container) {
    await ensureStateLoaded();

    const user = state.currentUser;
    if (user?.role === 'teacher') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot view family fee summaries.</div>';
        return;
    }

    const families = state.families || [];
    const activeFamilies = families.filter(f => {
        const members = state.students.filter(s => s.family_id === f.id && s.status === 'Active');
        return members.length > 0;
    });

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">👨‍👩‍👧 Family Fee Summary</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="window.exportFamilyFeeSummary()">📥 Export All</button>
                    <button class="btn btn-sm btn-outline" onclick="window.refreshFamilySummary()">🔄 Refresh</button>
                </div>
            </div>
            <div class="dash-card-body">
                <div class="filters-bar">
                    <input type="text" id="family-search" class="form-control flex-1" placeholder="🔍 Search family code or guardian name..." oninput="window.filterFamilySummary()">
                    <span class="result-count" id="family-count"></span>
                </div>
                
                <div class="table-wrapper" id="family-summary-table">
                    <div class="loading-container"><div class="spinner"></div><p>Loading family summaries...</p></div>
                </div>
            </div>
        </div>
        
        <div class="dash-card" style="margin-top:20px">
            <div class="dash-card-header">
                <span class="dash-card-title">📊 Overall Family Statistics</span>
            </div>
            <div class="dash-card-body">
                <div id="family-stats-container" class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
                    <div class="loading-container"><div class="spinner"></div><p>Loading stats...</p></div>
                </div>
            </div>
        </div>
    `;

    window.exportFamilyFeeSummary = exportFamilyFeeSummary;
    window.refreshFamilySummary = refreshFamilySummary;
    window.filterFamilySummary = filterFamilySummary;
    window.viewFamilyDetails = viewFamilyDetails;
    window.printFamilyStatement = printFamilyStatement;

    await refreshFamilySummary();
}

async function refreshFamilySummary() {
    const families = state.families || [];
    const summaryData = [];

    for (const family of families) {
        const members = state.students.filter(s => s.family_id === family.id && s.status === 'Active');
        if (members.length === 0) continue;

        let totalFees = 0;
        let totalPaid = 0;
        let totalCredit = 0;
        let memberDetails = [];

        for (const member of members) {
            const balance = getFullStudentBalance(member.id);
            const credit = getStudentCreditBalance(member.id);
            const cls = getClassById(member.class_id);

            totalFees += balance.total;
            totalPaid += balance.paid;
            totalCredit += credit.available;

            memberDetails.push({
                student: member,
                class: cls,
                balance: balance,
                credit: credit
            });
        }

        const outstanding = totalFees - totalPaid;
        const collectionRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 100;

        summaryData.push({
            family: family,
            members: members,
            memberDetails: memberDetails,
            totalFees: totalFees,
            totalPaid: totalPaid,
            outstanding: outstanding,
            collectionRate: collectionRate,
            totalCredit: totalCredit,
            memberCount: members.length
        });
    }

    // Store for filtering
    window._familySummaryData = summaryData;

    renderFamilySummaryTable(summaryData);
    renderFamilyStats(summaryData);
}

function renderFamilySummaryTable(summaryData) {
    const container = document.getElementById('family-summary-table');
    const search = document.getElementById('family-search')?.value.toLowerCase();

    let filtered = summaryData;
    if (search) {
        filtered = summaryData.filter(data =>
            data.family.family_code.toLowerCase().includes(search) ||
            (data.family.guardian_name || '').toLowerCase().includes(search)
        );
    }

    const countSpan = document.getElementById('family-count');
    if (countSpan) countSpan.textContent = `${filtered.length} famil${filtered.length !== 1 ? 'ies' : 'y'}`;

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No families found</div>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Family Code</th>
                    <th>Guardian Name</th>
                    <th>Members</th>
                    <th style="text-align:right">Total Fees</th>
                    <th style="text-align:right">Total Paid</th>
                    <th style="text-align:right">Outstanding</th>
                    <th style="text-align:center">Collection Rate</th>
                    <th style="text-align:center">Credit</th>
                    <th style="text-align:center">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(data => {
        const rateClass = data.collectionRate >= 90 ? 'badge-success' : (data.collectionRate >= 50 ? 'badge-warning' : 'badge-danger');
        const outstandingClass = data.outstanding > 0 ? 'text-danger' : '';

        return `
                        <tr>
                            <td><code><strong>${esc(data.family.family_code)}</strong></code></span>
                            <td>${esc(data.family.guardian_name || '—')}</span>
                            <td style="text-align:center">${data.memberCount}</span>
                            <td style="text-align:right">${fmtCurrency(data.totalFees)}</span>
                            <td style="text-align:right">${fmtCurrency(data.totalPaid)}</span>
                            <td style="text-align:right" class="${outstandingClass}">${fmtCurrency(data.outstanding)}</span>
                            <td style="text-align:center"><span class="badge ${rateClass}">${data.collectionRate.toFixed(1)}%</span></span>
                            <td style="text-align:center">${data.totalCredit > 0 ? fmtCurrency(data.totalCredit) : '—'}</span>
                            <td style="text-align:center">
                                <div class="btn-group" style="gap:4px; justify-content:center">
                                    <button class="btn btn-sm btn-outline" onclick="window.viewFamilyDetails(${data.family.id})" title="View Members">👁️</button>
                                    <button class="btn btn-sm btn-primary" onclick="window.printFamilyStatement(${data.family.id})" title="Print Statement">🖨️</button>
                                    <button class="btn btn-sm btn-success" onclick="window.exportFamilyToExcel(${data.family.id})" title="Export">📥</button>
                                </div>
                            </span>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;
}

function renderFamilyStats(summaryData) {
    const container = document.getElementById('family-stats-container');
    if (!container) return;

    const totalFamilies = summaryData.length;
    const totalFees = summaryData.reduce((sum, d) => sum + d.totalFees, 0);
    const totalPaid = summaryData.reduce((sum, d) => sum + d.totalPaid, 0);
    const totalOutstanding = totalFees - totalPaid;
    const totalCredit = summaryData.reduce((sum, d) => sum + d.totalCredit, 0);
    const avgCollectionRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;
    const familiesWithOutstanding = summaryData.filter(d => d.outstanding > 0).length;

    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">🏠</div>
            <div class="stat-value">${totalFamilies}</div>
            <div class="stat-label">Active Families</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">💰</div>
            <div class="stat-value">${fmtCurrency(totalFees)}</div>
            <div class="stat-label">Total Family Fees</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-value">${fmtCurrency(totalPaid)}</div>
            <div class="stat-label">Total Collected</div>
            <div class="stat-trend up">${avgCollectionRate.toFixed(1)}%</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">⚠️</div>
            <div class="stat-value">${familiesWithOutstanding}</div>
            <div class="stat-label">Families with Balance</div>
            <div class="stat-trend down">${fmtCurrency(totalOutstanding)} total</div>
        </div>
    `;
}

function filterFamilySummary() {
    if (window._familySummaryData) {
        renderFamilySummaryTable(window._familySummaryData);
    }
}

async function viewFamilyDetails(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family) return;

    const members = state.students.filter(s => s.family_id === familyId && s.status === 'Active');
    const memberDetails = [];
    let totalFees = 0;
    let totalPaid = 0;

    for (const member of members) {
        const balance = getFullStudentBalance(member.id);
        const cls = getClassById(member.class_id);
        totalFees += balance.total;
        totalPaid += balance.paid;
        memberDetails.push({
            student: member,
            class: cls,
            balance: balance
        });
    }

    const outstanding = totalFees - totalPaid;
    const collectionRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 100;

    showModal(`
        <div class="modal-overlay">
            <div class="modal modal-lg" style="max-width: 800px;">
                <div class="modal-header">
                    <h3>👨‍👩‍👧 Family Details - ${esc(family.family_code)}</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-grid" style="margin-bottom:16px">
                        <div class="form-group"><label>Family Code</label><input readonly value="${esc(family.family_code)}" class="form-control"></div>
                        <div class="form-group"><label>Guardian Name</label><input readonly value="${esc(family.guardian_name || '—')}" class="form-control"></div>
                        <div class="form-group"><label>Guardian Phone</label><input readonly value="${esc(family.guardian_phone || '—')}" class="form-control"></div>
                        <div class="form-group"><label>Family Discount</label><input readonly value="${fmtCurrency(family.discount_amount || 0)}" class="form-control"></div>
                    </div>
                    
                    <div style="background:var(--bg-tertiary); padding:12px; border-radius:8px; margin-bottom:16px">
                        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; text-align:center">
                            <div><div style="font-size:11px; color:var(--text-muted)">Total Family Fees</div><div style="font-size:18px; font-weight:700">${fmtCurrency(totalFees)}</div></div>
                            <div><div style="font-size:11px; color:var(--text-muted)">Total Paid</div><div style="font-size:18px; font-weight:700; color:var(--success)">${fmtCurrency(totalPaid)}</div></div>
                            <div><div style="font-size:11px; color:var(--text-muted)">Outstanding</div><div style="font-size:18px; font-weight:700; ${outstanding > 0 ? 'color:var(--danger)' : 'color:var(--success)'}">${fmtCurrency(outstanding)}</div></div>
                        </div>
                        <div style="margin-top:8px; background:var(--border-light); border-radius:99px; height:6px; overflow:hidden">
                            <div style="width:${collectionRate}%; height:100%; background:var(--role-primary); border-radius:99px;"></div>
                        </div>
                        <p style="text-align:center; margin-top:6px; font-size:11px">${collectionRate.toFixed(1)}% collected</p>
                    </div>
                    
                    <h4>👥 Family Members</h4>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr><th>Student Name</th><th>Class</th><th>Total Fees</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                ${memberDetails.map(d => `
                                    <tr>
                                        <td><strong>${esc(d.student.first_name)} ${esc(d.student.last_name)}</strong></span>
                                        <td>${esc(d.class?.name || '—')}</span>
                                        <td>${fmtCurrency(d.balance.total)}</span>
                                        <td>${fmtCurrency(d.balance.paid)}</span>
                                        <td style="${d.balance.balance > 0 ? 'color:var(--danger); font-weight:600' : ''}">${fmtCurrency(d.balance.balance)}</span>
                                        <td><span class="badge ${d.balance.balance === 0 ? 'badge-success' : (d.balance.paid > 0 ? 'badge-warning' : 'badge-danger')}">${d.balance.balance === 0 ? '✅ Paid' : (d.balance.paid > 0 ? '⚠️ Partial' : '❌ Due')}</span></span>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="closeModal()">Close</button>
                    <button class="btn btn-primary" onclick="window.exportFamilyToExcel(${familyId}); closeModal()">📥 Export to Excel</button>
                </div>
            </div>
        </div>
    `);
}

function printFamilyStatement(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family) return;

    const members = state.students.filter(s => s.family_id === familyId && s.status === 'Active');
    let totalFees = 0;
    let totalPaid = 0;

    const memberRows = members.map(member => {
        const balance = getFullStudentBalance(member.id);
        const cls = getClassById(member.class_id);
        totalFees += balance.total;
        totalPaid += balance.paid;

        return `
            <tr>
                <td>${esc(member.first_name)} ${esc(member.last_name)}</td>
                <td>${esc(cls?.name || '—')}</td>
                <td style="text-align:right">${fmtCurrency(balance.total)}</td>
                <td style="text-align:right">${fmtCurrency(balance.paid)}</td>
                <td style="text-align:right">${fmtCurrency(balance.balance)}</td>
                <td style="text-align:center">${balance.balance === 0 ? '✅ Paid' : (balance.paid > 0 ? '⚠️ Partial' : '❌ Due')}</td>
            </tr>
        `;
    }).join('');

    const outstanding = totalFees - totalPaid;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Family Statement - ${esc(family.family_code)}</title>
            <style>
                body{font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:0 auto}
                h1{text-align:center;color:#1a3a5c}
                .header{text-align:center;margin-bottom:30px}
                .info{display:flex;justify-content:space-between;margin-bottom:20px;padding:10px;background:#f0f0f0;border-radius:8px}
                table{width:100%;border-collapse:collapse;margin:15px 0}
                th,td{border:1px solid #ccc;padding:8px;text-align:left}
                th{background:#1a3a5c;color:white}
                .total{font-size:18px;font-weight:bold;text-align:right;margin-top:20px;padding:10px;background:#d1fae5;border-radius:8px}
                .footer{text-align:center;margin-top:30px;font-size:11px;color:#666}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🏫 ECOLE LA FONTAINE</h1>
                <h3>FAMILY FEE STATEMENT</h3>
            </div>
            <div class="info">
                <div><strong>Family Code:</strong> ${esc(family.family_code)}</div>
                <div><strong>Guardian:</strong> ${esc(family.guardian_name || '—')}</div>
                <div><strong>Phone:</strong> ${esc(family.guardian_phone || '—')}</div>
            </div>
            <div class="info">
                <div><strong>Total Family Fees:</strong> ${fmtCurrency(totalFees)}</div>
                <div><strong>Total Paid:</strong> ${fmtCurrency(totalPaid)}</div>
                <div><strong>Outstanding Balance:</strong> ${fmtCurrency(outstanding)}</div>
            </div>
            <h3>Member Details</h3>
            <table>
                <thead><tr><th>Student</th><th>Class</th><th>Total Fees</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>${memberRows}</tbody>
            </table>
            <div class="total">Family Outstanding Balance: ${fmtCurrency(outstanding)}</div>
            <div class="footer">Generated on ${new Date().toLocaleString()} | ECOLE LA FONTAINE School Management System</div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function exportFamilyToExcel(familyId) {
    const family = state.families.find(f => f.id === familyId);
    if (!family) return;

    const members = state.students.filter(s => s.family_id === familyId && s.status === 'Active');
    const data = members.map(member => {
        const balance = getFullStudentBalance(member.id);
        const cls = getClassById(member.class_id);
        return {
            'Family Code': family.family_code,
            'Guardian Name': family.guardian_name || '',
            'Student Name': `${member.first_name} ${member.last_name}`,
            'Student Code': member.student_code || '',
            'Class': cls?.name || '',
            'Total Fees (RWF)': balance.total,
            'Paid (RWF)': balance.paid,
            'Balance (RWF)': balance.balance,
            'Status': balance.balance === 0 ? 'Paid' : (balance.paid > 0 ? 'Partial' : 'Due')
        };
    });

    exportToExcel(data, `Family_Fees_${family.family_code}_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Family data exported', 'success');
}

function exportFamilyFeeSummary() {
    if (!window._familySummaryData) return;

    const data = window._familySummaryData.map(d => ({
        'Family Code': d.family.family_code,
        'Guardian Name': d.family.guardian_name || '',
        'Number of Members': d.memberCount,
        'Total Fees (RWF)': d.totalFees,
        'Total Paid (RWF)': d.totalPaid,
        'Outstanding (RWF)': d.outstanding,
        'Collection Rate (%)': d.collectionRate.toFixed(1),
        'Credit Available (RWF)': d.totalCredit
    }));

    exportToExcel(data, `Family_Fee_Summary_${new Date().toISOString().split('T')[0]}`);
    showToast('✅ Family fee summary exported', 'success');
}

export { renderFamilyFeeSummary };
