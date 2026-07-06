// js/modules/finance-dashboard.js
// Finance Dashboard Module - Overview of all financial metrics


let financeChart = null;

async function renderFinanceDashboard(container) {
    await ensureStateLoaded();

    const user = state.currentUser;
    const isTeacher = user?.role === 'teacher';

    if (isTeacher) {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Teachers cannot view finance dashboard.</div>';
        return;
    }

    // Calculate summary metrics
    const activeStudents = state.students.filter(s => s.status === 'Active');
    let totalFees = 0;
    let totalPaid = 0;
    let totalCredit = 0;
    let studentsWithBalance = 0;
    let overdueCount = 0;
    let monthlyTotals = {};

    for (const student of activeStudents) {
        const balance = getFullStudentBalance(student.id);
        const credit = getStudentCreditBalance(student.id);
        totalFees += balance.total;
        totalPaid += balance.paid;
        totalCredit += credit.available;
        if (balance.balance > 0) studentsWithBalance++;
    }

    // Calculate overdue payments
    for (const fee of state.studentFees) {
        if (!fee.is_paid && !fee.is_waived && fee.due_date && new Date(fee.due_date) < new Date()) {
            overdueCount++;
        }
    }

    // Calculate monthly collection trend
    for (const payment of state.payments) {
        const month = (payment.payment_date || payment.created_at || '').slice(0, 7);
        if (month) {
            monthlyTotals[month] = (monthlyTotals[month] || 0) + payment.amount;
        }
    }

    const months = Object.keys(monthlyTotals).sort().slice(-6);
    const monthlyData = months.map(m => monthlyTotals[m]);

    // Calculate collection by class
    const classData = [];
    for (const cls of state.classes) {
        const classStudents = activeStudents.filter(s => s.class_id === cls.id);
        let classFees = 0;
        let classPaid = 0;
        for (const student of classStudents) {
            const balance = getFullStudentBalance(student.id);
            classFees += balance.total;
            classPaid += balance.paid;
        }
        if (classFees > 0 || classPaid > 0) {
            classData.push({
                name: cls.name,
                expected: classFees,
                collected: classPaid,
                rate: classFees > 0 ? (classPaid / classFees) * 100 : 0
            });
        }
    }
    classData.sort((a, b) => b.rate - a.rate);

    const totalOutstanding = totalFees - totalPaid;
    const collectionRate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;

    container.innerHTML = `
        <div class="finance-dashboard">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">💰</div>
                    <div class="stat-value">${fmtCurrency(totalFees)}</div>
                    <div class="stat-label">Total Expected Fees</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-value">${fmtCurrency(totalPaid)}</div>
                    <div class="stat-label">Total Collected</div>
                    <div class="stat-trend up">${collectionRate.toFixed(1)}% of total</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏳</div>
                    <div class="stat-value">${fmtCurrency(totalOutstanding)}</div>
                    <div class="stat-label">Outstanding Balance</div>
                    <div class="stat-trend down">${studentsWithBalance} students</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⭐</div>
                    <div class="stat-value">${fmtCurrency(totalCredit)}</div>
                    <div class="stat-label">Credit Available</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⚠️</div>
                    <div class="stat-value">${overdueCount}</div>
                    <div class="stat-label">Overdue Payments</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${collectionRate.toFixed(1)}%</div>
                    <div class="stat-label">Collection Rate</div>
                    <div style="background:var(--border-light);border-radius:99px;height:6px;margin-top:8px;overflow:hidden">
                        <div style="height:100%;width:${collectionRate}%;background:var(--role-primary);border-radius:99px;"></div>
                    </div>
                </div>
            </div>
            
            <div class="two-col">
                <div class="dash-card">
                    <div class="dash-card-header">
                        <span class="dash-card-title">📈 Monthly Collection Trend</span>
                        <button class="btn btn-sm btn-outline" onclick="window.exportMonthlyTrend()">📥 Export</button>
                    </div>
                    <div class="dash-card-body">
                        <canvas id="monthly-collection-chart" height="250"></canvas>
                    </div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-header">
                        <span class="dash-card-title">🏆 Top Performing Classes</span>
                        <button class="btn btn-sm btn-outline" onclick="window.exportClassCollection()">📥 Export</button>
                    </div>
                    <div class="dash-card-body">
                        <div class="table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr><th>Class</th><th style="text-align:right">Expected</th><th style="text-align:right">Collected</th><th style="text-align:center">Rate</th></tr>
                                </thead>
                                <tbody>
                                    ${classData.slice(0, 8).map(c => `
                                        <tr>
                                            <td><strong>${esc(c.name)}</strong></span>
                                            <td style="text-align:right">${fmtCurrency(c.expected)}</span>
                                            <td style="text-align:right">${fmtCurrency(c.collected)}</span>
                                            <td style="text-align:center"><span class="badge ${c.rate >= 80 ? 'badge-success' : (c.rate >= 50 ? 'badge-warning' : 'badge-danger')}">${c.rate.toFixed(1)}%</span></span>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="dash-card">
                <div class="dash-card-header">
                    <span class="dash-card-title">⚡ Quick Actions</span>
                </div>
                <div class="dash-card-body">
                    <div class="quick-actions">
                        <div class="quick-btn" onclick="window.navigateTo('record-payment')">
                            <div class="qb-icon">💰</div>
                            <div class="qb-title">Record Payment</div>
                            <div class="qb-sub">Add payment</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('payment-history')">
                            <div class="qb-icon">📜</div>
                            <div class="qb-title">Payment History</div>
                            <div class="qb-sub">View all</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('financial-reports')">
                            <div class="qb-icon">📊</div>
                            <div class="qb-title">Financial Reports</div>
                            <div class="qb-sub">Generate reports</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('overdue-payments')">
                            <div class="qb-icon">⚠️</div>
                            <div class="qb-title">Overdue Payments</div>
                            <div class="qb-sub">Follow up</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('fee-structure')">
                            <div class="qb-icon">🏷️</div>
                            <div class="qb-title">Fee Structure</div>
                            <div class="qb-sub">Manage fees</div>
                        </div>
                        <div class="quick-btn" onclick="window.navigateTo('receipts')">
                            <div class="qb-icon">🧾</div>
                            <div class="qb-title">Receipts</div>
                            <div class="qb-sub">Print receipts</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize chart
    setTimeout(() => {
        const ctx = document.getElementById('monthly-collection-chart')?.getContext('2d');
        if (ctx) {
            if (financeChart) financeChart.destroy();
            financeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Amount Collected (RWF)',
                        data: monthlyData,
                        backgroundColor: '#0d9488',
                        borderRadius: 6,
                        barPercentage: 0.7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${fmtCurrency(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: (v) => fmtCurrency(v)
                            }
                        }
                    }
                }
            });
        }
    }, 100);

    window.exportMonthlyTrend = () => {
        const data = months.map((m, i) => ({
            'Month': m,
            'Amount Collected (RWF)': monthlyData[i]
        }));
        exportToExcel(data, 'Monthly_Collection_Trend');
    };

    window.exportClassCollection = () => {
        exportToExcel(classData, 'Class_Collection_Summary');
    };
}

export { renderFinanceDashboard };
