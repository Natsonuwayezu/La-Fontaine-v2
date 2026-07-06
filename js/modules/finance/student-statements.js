// ============================================================
// STUDENT STATEMENTS MODULE - Generate financial statements
// ============================================================


// Generate and print student fee statement
async function printStudentStatement(studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        showToast('Student not found', 'error');
        return;
    }

    const cls = getClassById(student.class_id);
    const bal = getFullStudentBalance(studentId);
    const fees = (state.studentFees || []).filter(f => f.student_id === studentId && !f.is_credit);
    const payments = (state.payments || []).filter(p => p.student_id === studentId).sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Please allow popups to print', 'warning');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fee Statement - ${student.first_name} ${student.last_name}</title>
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
                @media print{body{padding:0}}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🏫 ECOLE LA FONTAINE</h1>
                <h3>FEE STATEMENT</h3>
            </div>
            <div class="info">
                <div><strong>Student:</strong> ${esc(student.first_name)} ${esc(student.last_name)}</div>
                <div><strong>Code:</strong> ${esc(student.student_code || '—')}</div>
                <div><strong>Class:</strong> ${esc(cls?.name || '—')}</div>
            </div>
            <div class="info">
                <div><strong>Total Fees:</strong> ${fmtCurrency(bal.total)}</div>
                <div><strong>Total Paid:</strong> ${fmtCurrency(bal.paid)}</div>
                <div><strong>Balance:</strong> ${fmtCurrency(bal.balance)}</div>
            </div>
            <h3>Fee Breakdown</h3>
            <table>
                <thead><tr><th>Category</th><th>Amount</th><th>Paid</th><th>Remaining</th></tr></thead>
                <tbody>
                    ${fees.map(f => {
        const cat = (state.feeCategories || []).find(c => c.id === f.fee_category_id);
        return `<tr><td>${esc(cat?.name || 'Unknown')}</td><td>${fmtCurrency(f.amount)}</td><td>${fmtCurrency(f.paid_amount || 0)}</td><td>${fmtCurrency(f.amount - (f.paid_amount || 0))}</td></tr>`;
    }).join('')}
                </tbody>
            </table>
            <h3>Payment History</h3>
            <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Receipt #</th></tr></thead>
                <tbody>
                    ${payments.map(p => `<tr><td>${fmtDate(p.payment_date || p.created_at)}</td><td>${fmtCurrency(p.amount)}</td><td>${esc(p.payment_method || '—')}</td><td>${esc(p.receipt_number || '—')}</td></tr>`).join('')}
                </tbody>
            </table>
            <div class="total">Outstanding Balance: ${fmtCurrency(bal.balance)}</div>
            <div class="footer">Generated on ${new Date().toLocaleString()} | ECOLE LA FONTAINE School Management System</div>
            <script>window.onload = function() { window.print(); setTimeout(window.close, 1000); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Generate class financial summary
async function printClassStatement(classId) {
    const cls = getClassById(classId);
    if (!cls) return;

    const students = (state.students || []).filter(s => s.class_id === classId && s.status === 'Active');
    let totalFees = 0, totalPaid = 0;
    const studentData = [];

    for (const student of students) {
        const bal = getFullStudentBalance(student.id);
        totalFees += bal.total;
        totalPaid += bal.paid;
        studentData.push({
            name: `${student.first_name} ${student.last_name}`,
            code: student.student_code,
            total: bal.total,
            paid: bal.paid,
            balance: bal.balance,
            pct: bal.pct
        });
    }

    studentData.sort((a, b) => b.balance - a.balance);

    const printWindow = window.open('', '_blank');
    if (!printWindow) { showToast('Please allow popups to print', 'warning'); return; }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Class Fee Summary - ${cls.name}</title>
            <style>
                body{font-family:Arial,sans-serif;padding:20px;max-width:1200px;margin:0 auto}
                h1{text-align:center;color:#1a3a5c}
                .header{text-align:center;margin-bottom:30px}
                .summary{display:flex;justify-content:space-between;margin-bottom:20px;padding:10px;background:#f0f0f0;border-radius:8px}
                table{width:100%;border-collapse:collapse;margin:15px 0}
                th,td{border:1px solid #ccc;padding:8px;text-align:left}
                th{background:#1a3a5c;color:white}
                .text-right{text-align:right}
                .footer{text-align:center;margin-top:30px;font-size:11px;color:#666}
                @media print{body{padding:0}}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🏫 ECOLE LA FONTAINE</h1>
                <h3>CLASS FEE SUMMARY - ${esc(cls.name)}</h3>
            </div>
            <div class="summary">
                <div><strong>Total Students:</strong> ${students.length}</div>
                <div><strong>Total Fees:</strong> ${fmtCurrency(totalFees)}</div>
                <div><strong>Total Paid:</strong> ${fmtCurrency(totalPaid)}</div>
                <div><strong>Total Outstanding:</strong> ${fmtCurrency(totalFees - totalPaid)}</div>
                <div><strong>Collection Rate:</strong> ${totalFees > 0 ? ((totalPaid / totalFees) * 100).toFixed(1) : 0}%</div>
            </div>
            <table>
                <thead><tr><th>Student</th><th>Code</th><th class="text-right">Total Fees</th><th class="text-right">Paid</th><th class="text-right">Balance</th><th class="text-right">%</th></tr></thead>
                <tbody>
                    ${studentData.map(s => `<tr>
                        <td>${esc(s.name)}</td>
                        <td>${esc(s.code)}</td>
                        <td class="text-right">${fmtCurrency(s.total)}</td>
                        <td class="text-right">${fmtCurrency(s.paid)}</td>
                        <td class="text-right ${s.balance > 0 ? 'overdue-red' : ''}">${fmtCurrency(s.balance)}</td>
                        <td class="text-right">${s.pct.toFixed(1)}%</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="footer">Generated on ${new Date().toLocaleString()} | ECOLE LA FONTAINE School Management System</div>
            <script>window.onload = function() { window.print(); setTimeout(window.close, 1000); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Export student statement to Excel
function exportStudentStatementToExcel(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;

    const bal = getFullStudentBalance(studentId);
    const fees = (state.studentFees || []).filter(f => f.student_id === studentId && !f.is_credit);
    const payments = (state.payments || []).filter(p => p.student_id === studentId);

    const feeData = fees.map(f => {
        const cat = (state.feeCategories || []).find(c => c.id === f.fee_category_id);
        return {
            'Category': cat?.name || 'Unknown',
            'Amount (RWF)': f.amount,
            'Paid (RWF)': f.paid_amount || 0,
            'Remaining (RWF)': f.amount - (f.paid_amount || 0)
        };
    });

    const paymentData = payments.map(p => ({
        'Date': fmtDate(p.payment_date || p.created_at),
        'Amount (RWF)': p.amount,
        'Method': p.payment_method || '—',
        'Receipt #': p.receipt_number || '—'
    }));

    const summary = [{
        'Student': `${student.first_name} ${student.last_name}`,
        'Student Code': student.student_code,
        'Class': getClassById(student.class_id)?.name,
        'Total Fees (RWF)': bal.total,
        'Total Paid (RWF)': bal.paid,
        'Outstanding Balance (RWF)': bal.balance,
        'Collection Rate (%)': bal.pct.toFixed(1)
    }];

    const ws1 = XLSX.utils.json_to_sheet(summary);
    const ws2 = XLSX.utils.json_to_sheet(feeData);
    const ws3 = XLSX.utils.json_to_sheet(paymentData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
    XLSX.utils.book_append_sheet(wb, ws2, 'Fee Breakdown');
    XLSX.utils.book_append_sheet(wb, ws3, 'Payment History');
    XLSX.writeFile(wb, `Student_Statement_${student.student_code}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('✅ Statement exported', 'success');
}
// ── Page render entry point ─────────────────────────────────
async function renderStudentStatements(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header"><h2>💳 Student Statements</h2></div>
            <div class="dash-card-body">
                <p class="text-muted">This module provides utility functions used by other modules. 
                Select a specific action from the relevant section.</p>
            </div>
        </div>
    `;
}


export { renderStudentStatements };
