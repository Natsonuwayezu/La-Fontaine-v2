/**
 * ECOLE LA FONTAINE — Missing Functions Patch
 * Browser-ready global functions for HTML onclick handlers
 * Last updated: 2026-07-04
 * 
 * This file provides fallback implementations for all window.* functions
 * that are referenced by HTML onclick handlers and inline scripts.
 * 
 * IMPORTANT: This file should be loaded LAST in index.html
 * after all other JS files to ensure functions are available.
 */

// ============================================================
// SECTION 1 — TOAST & MODAL HELPERS (Standalone)
// ============================================================

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Milliseconds to show
 */
window.showToast = function (message, type = 'info', duration = 3500) {
    try {
        // Try to use the module function first
        if (typeof window._showToastModule === 'function') {
            return window._showToastModule(message, type, duration);
        }

        // Fallback: manual toast
        const container = document.getElementById('toast-container');
        if (!container) {
            const el = document.createElement('div');
            el.id = 'toast-container';
            el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(el);
        }

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            background: var(--bg-secondary, #fff);
            border: 1px solid var(--border-light, #e2e8f0);
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 0.875rem;
            max-width: 360px;
            animation: toastIn 0.3s ease;
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 8px;
            border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        `;
        toast.innerHTML = `<span style="font-size:1.1rem;flex-shrink:0;">${icons[type] || 'ℹ️'}</span><span style="flex:1;">${window.esc ? window.esc(message) : message}</span>`;
        document.getElementById('toast-container').appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
        return true;
    } catch (e) {
        console.warn('[showToast] Fallback:', e);
        alert(message);
        return false;
    }
};

/**
 * Close a modal
 * @param {string} modalId - Optional modal ID
 */
window.closeModal = function (modalId = null) {
    try {
        if (typeof window._closeModalModule === 'function') {
            return window._closeModalModule(modalId);
        }
        if (modalId) {
            const el = document.getElementById(modalId);
            if (el) el.remove();
        } else {
            const container = document.getElementById('modals-container');
            if (container) container.innerHTML = '';
        }
        return true;
    } catch (e) {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = '';
        return false;
    }
};

/**
 * Show a confirmation dialog
 * @param {string} message - Message to display
 * @param {string} title - Dialog title
 * @returns {Promise<boolean>}
 */
window.confirmDialog = function (message, title = 'Confirm') {
    try {
        if (typeof window._confirmDialogModule === 'function') {
            return window._confirmDialogModule(message, title);
        }
        return new Promise((resolve) => {
            const modalId = `confirm-modal-${Date.now()}`;
            const html = `
                <div class="modal-overlay" id="${modalId}" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;">
                    <div class="modal" style="background:var(--bg-secondary, #fff);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:420px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
                        <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border-light, #e2e8f0);display:flex;align-items:center;justify-content:space-between;">
                            <h3 style="margin:0;">${window.esc ? window.esc(title) : title}</h3>
                            <button class="modal-close" onclick="window.closeModal('${modalId}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text-muted, #94a3b8);">✕</button>
                        </div>
                        <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1;">
                            <p style="margin:0;">${window.esc ? window.esc(message) : message}</p>
                        </div>
                        <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-light, #e2e8f0);display:flex;justify-content:flex-end;gap:8px;">
                            <button class="btn btn-outline" onclick="window.closeModal('${modalId}'); window._confirmResolve(false)">Cancel</button>
                            <button class="btn btn-danger" onclick="window.closeModal('${modalId}'); window._confirmResolve(true)">Confirm</button>
                        </div>
                    </div>
                </div>
            `;
            window.showModal(html);
            window._confirmResolve = resolve;
        });
    } catch (e) {
        return Promise.resolve(confirm(message));
    }
};

/**
 * Show a modal with HTML content
 * @param {string} html - HTML content
 */
window.showModal = function (html) {
    try {
        if (typeof window._showModalModule === 'function') {
            return window._showModalModule(html);
        }
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = html;
        return true;
    } catch (e) {
        const container = document.getElementById('modals-container');
        if (container) container.innerHTML = html;
        return false;
    }
};

// ============================================================
// SECTION 2 — FORMATTING FUNCTIONS (Standalone)
// ============================================================

window.fmt = function (n, d = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: d,
        maximumFractionDigits: d
    });
};

window.fmtCurrency = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US') + ' RWF';
};

window.fmtDate = function (s) {
    if (!s) return '—';
    try {
        return new Date(s).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        return s || '—';
    }
};

window.fmtDateTime = function (s) {
    if (!s) return '—';
    try {
        return new Date(s).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return s || '—';
    }
};

window.fmtAgo = function (s) {
    if (!s) return '—';
    const secs = Math.floor((Date.now() - new Date(s)) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return window.fmtDate(s);
};

window.fmtPct = function (n, d = 1) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(d) + '%';
};

window.esc = function (str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

window.truncate = function (str, max = 50) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '…' : str;
};

// ============================================================
// SECTION 3 — ACADEMIC FORMULA FUNCTIONS (Standalone)
// ============================================================

window.getGrade = function (pct, scale = null) {
    if (pct === null || pct === undefined || isNaN(pct)) return '—';
    // Try to use module if available
    if (typeof window._getGradeModule === 'function') {
        try { return window._getGradeModule(pct, scale); } catch (e) { }
    }
    // Fallback
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
};

window.getGradeClass = function (pct) {
    if (typeof window._getGradeClassModule === 'function') {
        try { return window._getGradeClassModule(pct); } catch (e) { }
    }
    const g = window.getGrade(pct);
    if (g === 'A+') return 'grade-Ap';
    if (g === 'A') return 'grade-A';
    if (g === 'B') return 'grade-B';
    if (g === 'C') return 'grade-C';
    if (g === 'D') return 'grade-D';
    return 'grade-F';
};

window.calcMG = function (scores, maxes, mgMax) {
    if (!scores?.length) return null;
    const avgRaw = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgMax = maxes.reduce((a, b) => a + b, 0) / maxes.length;
    return avgMax > 0 ? (avgRaw / avgMax) * mgMax : null;
};

window.calcEX = function (scores, maxes, exMax) {
    return window.calcMG(scores, maxes, exMax);
};

window.getCurrentPhase = function (term = null) {
    const t = term || window.state?.currentTerm;
    if (!t?.midterm_date) return 'post_midterm';
    return new Date() < new Date(t.midterm_date) ? 'pre_midterm' : 'post_midterm';
};

window.termProgress = function (term = null) {
    const t = term || window.state?.currentTerm;
    if (!t?.start_date || !t?.end_date) {
        return { pct: 0, daysLeft: 0, text: 'No term data' };
    }
    const start = new Date(t.start_date);
    const end = new Date(t.end_date);
    const now = new Date();
    if (now < start) return { pct: 0, daysLeft: Math.ceil((end - start) / 86400000), text: 'Not started' };
    if (now > end) return { pct: 100, daysLeft: 0, text: 'Term ended' };
    const pct = ((now - start) / (end - start)) * 100;
    const daysLeft = Math.ceil((end - now) / 86400000);
    return { pct: Math.round(pct), daysLeft, text: `${Math.round(pct)}% complete` };
};

// ============================================================
// SECTION 4 — FEE & FINANCE FUNCTIONS
// ============================================================

window.studentFeeBalance = function (studentId) {
    try {
        if (typeof window._studentFeeBalanceModule === 'function') {
            return window._studentFeeBalanceModule(studentId);
        }
        const fees = (window.state?.studentFees || []).filter(f => f.student_id == studentId);
        const total = fees.reduce((a, f) => a + (f.is_waived ? (f.paid_amount || 0) : f.amount), 0);
        const paid = fees.reduce((a, f) => a + (f.paid_amount || 0), 0);
        const balance = Math.max(0, total - paid);
        const credit = Math.max(0, paid - total);
        const pct = total > 0 ? Math.min(100, (paid / total) * 100) : (paid > 0 ? 100 : 0);
        const waivedTotal = fees.filter(f => f.is_waived).reduce((a, f) => a + f.amount, 0);
        return { total, paid, balance, credit, hasCredit: credit > 0, pct, waivedTotal };
    } catch (e) {
        return { total: 0, paid: 0, balance: 0, credit: 0, hasCredit: false, pct: 0, waivedTotal: 0 };
    }
};

window.getFullStudentBalance = window.studentFeeBalance;

window.getStudentCreditBalance = function (studentId) {
    try {
        if (typeof window._getStudentCreditBalanceModule === 'function') {
            return window._getStudentCreditBalanceModule(studentId);
        }
        const creditFees = (window.state?.studentFees || []).filter(f =>
            f.student_id == studentId && f.is_credit === true
        );
        const totalCredit = creditFees.reduce((sum, f) => sum + (f.credit_amount || 0), 0);
        const usedCredit = creditFees.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
        return { total: totalCredit, used: usedCredit, available: Math.max(0, totalCredit - usedCredit) };
    } catch (e) {
        return { total: 0, used: 0, available: 0 };
    }
};

// ============================================================
// SECTION 5 — STATE ACCESSOR FUNCTIONS
// ============================================================

window.getClassById = function (id) {
    try {
        if (typeof window._getClassByIdModule === 'function') {
            return window._getClassByIdModule(id);
        }
        return (window.state?.classes || []).find(c => c.id === parseInt(id)) || null;
    } catch (e) {
        return (window.state?.classes || []).find(c => c.id === parseInt(id)) || null;
    }
};

window.getStudentById = function (id) {
    try {
        if (typeof window._getStudentByIdModule === 'function') {
            return window._getStudentByIdModule(id);
        }
        return (window.state?.students || []).find(s => s.id === parseInt(id)) || null;
    } catch (e) {
        return (window.state?.students || []).find(s => s.id === parseInt(id)) || null;
    }
};

window.getTeacherById = function (id) {
    try {
        if (typeof window._getTeacherByIdModule === 'function') {
            return window._getTeacherByIdModule(id);
        }
        return (window.state?.teachers || []).find(t => t.id === parseInt(id)) || null;
    } catch (e) {
        return (window.state?.teachers || []).find(t => t.id === parseInt(id)) || null;
    }
};

window.getSubjectById = function (id) {
    try {
        if (typeof window._getSubjectByIdModule === 'function') {
            return window._getSubjectByIdModule(id);
        }
        return (window.state?.subjects || []).find(s => s.id === parseInt(id)) || null;
    } catch (e) {
        return (window.state?.subjects || []).find(s => s.id === parseInt(id)) || null;
    }
};

window.getTermById = function (id) {
    try {
        if (typeof window._getTermByIdModule === 'function') {
            return window._getTermByIdModule(id);
        }
        return (window.state?.terms || []).find(t => t.id === parseInt(id)) || null;
    } catch (e) {
        return (window.state?.terms || []).find(t => t.id === parseInt(id)) || null;
    }
};

window.getCurrentUser = function () {
    try {
        if (typeof window._getCurrentUserModule === 'function') {
            return window._getCurrentUserModule();
        }
        return window.state?.currentUser || null;
    } catch (e) {
        return window.state?.currentUser || null;
    }
};

window.isAdmin = function () {
    try {
        if (typeof window._isAdminModule === 'function') {
            return window._isAdminModule();
        }
        return window.state?.currentUser?.role === 'admin';
    } catch (e) {
        return window.state?.currentUser?.role === 'admin';
    }
};

window.isTeacher = function () {
    try {
        if (typeof window._isTeacherModule === 'function') {
            return window._isTeacherModule();
        }
        return window.state?.currentUser?.role === 'teacher';
    } catch (e) {
        return window.state?.currentUser?.role === 'teacher';
    }
};

window.isAccountant = function () {
    try {
        if (typeof window._isAccountantModule === 'function') {
            return window._isAccountantModule();
        }
        return window.state?.currentUser?.role === 'accountant';
    } catch (e) {
        return window.state?.currentUser?.role === 'accountant';
    }
};

window.getCurrentAcademicYear = function () {
    try {
        if (typeof window._getCurrentAcademicYearModule === 'function') {
            return window._getCurrentAcademicYearModule();
        }
        return window.state?.currentAcadYear || null;
    } catch (e) {
        return window.state?.currentAcadYear || null;
    }
};

window.getCurrentTerm = function () {
    try {
        if (typeof window._getCurrentTermModule === 'function') {
            return window._getCurrentTermModule();
        }
        return window.state?.currentTerm || null;
    } catch (e) {
        return window.state?.currentTerm || null;
    }
};

// ============================================================
// SECTION 6 — NAVIGATION FUNCTIONS
// ============================================================

window.navigateTo = function (moduleId) {
    try {
        if (typeof window._navigateToModule === 'function') {
            return window._navigateToModule(moduleId);
        }
        const content = document.getElementById('dynamic-content');
        if (content) {
            content.innerHTML = `<div class="alert alert-warning">Module "${moduleId}" not available.</div>`;
        }
        return false;
    } catch (e) {
        const content = document.getElementById('dynamic-content');
        if (content) {
            content.innerHTML = `<div class="alert alert-warning">Module "${moduleId}" not available.</div>`;
        }
        return false;
    }
};

window.navigateToWithData = function (page, data) {
    window._navData = window._navData || {};
    window._navData[page] = data;
    return window.navigateTo(page);
};

window.getNavData = function (page) {
    const data = window._navData?.[page];
    delete window._navData?.[page];
    return data;
};

// ============================================================
// SECTION 7 — SHORTCUT NAVIGATION
// ============================================================

window.goToMarksEntry = function (id) {
    window.navigateToWithData('marks-entry', { assessment_id: id });
};

window.goToReportCard = function (id) {
    window.navigateToWithData('report-cards', { report_student_id: id });
};

window.goToClassRegister = function (id) {
    window.navigateToWithData('class-register', { class_id: id });
};

window.goToStudentFees = function (id) {
    window.navigateToWithData('student-fees', { fee_student_id: id });
};

// ============================================================
// SECTION 8 — EXPORT FUNCTIONS
// ============================================================

window.exportToExcel = function (data, filename) {
    try {
        if (typeof window._exportToExcelModule === 'function') {
            return window._exportToExcelModule(data, filename);
        }
        if (typeof XLSX === 'undefined') {
            window.showToast('SheetJS library not loaded.', 'warning');
            return;
        }
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, `${filename || 'export'}.xlsx`);
    } catch (e) {
        if (typeof XLSX === 'undefined') {
            window.showToast('SheetJS library not loaded.', 'warning');
            return;
        }
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, `${filename || 'export'}.xlsx`);
    }
};

window.downloadBlob = function (content, filename, mime = 'application/octet-stream') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// ============================================================
// SECTION 9 — NOTIFICATION FUNCTIONS
// ============================================================

window.notifyAction = function (action, details = {}, targetRoles = ['admin']) {
    try {
        if (typeof window._notifyActionModule === 'function') {
            return window._notifyActionModule(action, details, targetRoles);
        }
        console.log(`[Notification] ${action}:`, details);
        return true;
    } catch (e) {
        console.log(`[Notification] ${action}:`, details);
        return false;
    }
};

window.showRoleNotification = function (message, type = 'info', roles = ['admin', 'accountant', 'teacher']) {
    window.showToast(message, type);
};

// ============================================================
// SECTION 10 — OFFLINE FUNCTIONS
// ============================================================

window.syncOfflineMarks = function () {
    try {
        if (typeof window._syncOfflineMarksModule === 'function') {
            return window._syncOfflineMarksModule();
        }
        window.showToast('Sync not available. Please refresh.', 'warning');
        return Promise.resolve(false);
    } catch (e) {
        window.showToast('Sync not available. Please refresh.', 'warning');
        return Promise.resolve(false);
    }
};

window.saveMarksOffline = function (data) {
    try {
        if (typeof window._saveMarksOfflineModule === 'function') {
            return window._saveMarksOfflineModule(data);
        }
        window.showToast('Offline save failed. Please connect to internet.', 'error');
        return Promise.resolve(false);
    } catch (e) {
        window.showToast('Offline save failed. Please connect to internet.', 'error');
        return Promise.resolve(false);
    }
};

window.updatePendingBadge = function () {
    try {
        if (typeof window._updatePendingBadgeModule === 'function') {
            return window._updatePendingBadgeModule();
        }
    } catch (e) {
        // Silently fail
    }
};

// ============================================================
// SECTION 11 — THEME FUNCTIONS
// ============================================================

window.toggleTheme = function () {
    try {
        if (typeof window._toggleThemeModule === 'function') {
            return window._toggleThemeModule();
        }
        const html = document.documentElement;
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('elf_theme', next);
        window.showToast(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode', 'info', 1500);
        return true;
    } catch (e) {
        const html = document.documentElement;
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('elf_theme', next);
        window.showToast(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode', 'info', 1500);
        return true;
    }
};

window.initTheme = function () {
    try {
        if (typeof window._initThemeModule === 'function') {
            return window._initThemeModule();
        }
        const saved = localStorage.getItem('elf_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        return true;
    } catch (e) {
        const saved = localStorage.getItem('elf_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        return true;
    }
};

window.getSavedTheme = function () {
    return localStorage.getItem('elf_theme') || 'light';
};

// ============================================================
// SECTION 12 — QR CODE FUNCTIONS (Standalone)
// ============================================================

window.generateQRCodeDataURL = function (text, size = 150) {
    try {
        if (typeof QRCode === 'undefined') return '';
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
        document.body.appendChild(container);
        new QRCode(container, { text, width: size, height: size, colorDark: '#0f2744', colorLight: '#ffffff' });
        const canvas = container.querySelector('canvas');
        const dataURL = canvas ? canvas.toDataURL('image/png') : '';
        document.body.removeChild(container);
        return dataURL;
    } catch (e) {
        return '';
    }
};

window.generateStudentReportQR = function (student, reportData, reportType) {
    try {
        const school = window.state?.schoolSettings || {};
        const payload = {
            v: '1',
            school: {
                name: school.school_name || 'ECOLE LA FONTAINE',
                address: school.school_address || 'Rubavu, Rwanda',
                phone: school.school_phone || '',
            },
            student: {
                id: student.id,
                code: student.student_code || '',
                firstName: student.first_name || '',
                lastName: student.last_name || '',
                class: reportData.className || '',
                gender: student.gender || '',
            },
            academic: {
                term: reportData.termName || '',
                type: reportType || 'endterm',
                totalScore: reportData.totalScore || 0,
                totalMax: reportData.totalMax || 0,
                pct: reportData.overallPercentage || 0,
                grade: reportData.overallGrade || '—',
                subjects: (reportData.subjects || []).map(s => ({
                    name: s.name,
                    total: s.total || null,
                    pct: s.pct || null,
                    grade: s.grade || '—'
                }))
            },
            gen: new Date().toISOString()
        };
        const text = JSON.stringify(payload);
        return window.generateQRCodeDataURL(text, 160);
    } catch (e) {
        return '';
    }
};

window.addQRCodeToReport = function (reportElement, student, reportData, reportType) {
    try {
        const qrDataURL = window.generateStudentReportQR(student, reportData, reportType);
        if (!qrDataURL) return;
        const block = document.createElement('div');
        block.className = 'report-qr-block';
        block.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:8px 12px;border-top:1px solid #e2e8f0;margin-top:8px;background:#f8fafc;border-radius:0 0 8px 8px;';
        block.innerHTML = `
            <div style="font-size:9px;color:#64748b;line-height:1.6;text-align:left;">
                <div><strong>${window.esc(student.first_name || '')} ${window.esc(student.last_name || '')}</strong></div>
                <div>Code: ${window.esc(student.student_code || '—')}</div>
                <div>${window.esc(reportData.className || '')}</div>
                <div style="margin-top:3px;font-style:italic;">📱 Scan to verify</div>
            </div>
            <div>
                <img src="${qrDataURL}" alt="QR" style="width:80px;height:80px;border:1px solid #e2e8f0;border-radius:4px;display:block;">
            </div>
        `;
        reportElement.appendChild(block);
    } catch (e) {
        // Silently fail
    }
};

window.displayQRCodeResults = function (qrData) {
    try {
        const data = JSON.parse(qrData);
        const html = `
            <div class="modal-overlay" id="qr-result-modal" style="display:flex;">
                <div class="modal" style="max-width:500px;">
                    <div class="modal-header">
                        <h3>📱 QR Scan Result</h3>
                        <button class="modal-close" onclick="window.closeModal('qr-result-modal')">✕</button>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom:12px;padding:8px 12px;background:var(--success-bg, #d1fae5);border-radius:6px;text-align:center;">
                            ✅ Verified Student Record
                        </div>
                        <div class="form-grid">
                            <div class="form-group"><label>Name</label><div><strong>${window.esc(data.student?.firstName || '')} ${window.esc(data.student?.lastName || '')}</strong></div></div>
                            <div class="form-group"><label>Code</label><div>${window.esc(data.student?.code || '—')}</div></div>
                            <div class="form-group"><label>Class</label><div>${window.esc(data.student?.class || '—')}</div></div>
                            <div class="form-group"><label>Score</label><div>${data.academic?.totalScore || 0}</div></div>
                            <div class="form-group"><label>%</label><div>${data.academic?.pct || 0}%</div></div>
                            <div class="form-group"><label>Grade</label><div>${data.academic?.grade || '—'}</div></div>
                        </div>
                        <div style="font-size:0.7rem;color:var(--text-muted, #94a3b8);margin-top:12px;text-align:center;">
                            Generated: ${data.gen ? new Date(data.gen).toLocaleString() : '—'}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="window.closeModal('qr-result-modal')">Close</button>
                    </div>
                </div>
            </div>
        `;
        window.showModal(html);
    } catch (e) {
        window.showToast('Invalid QR code data', 'warning');
    }
};

// ============================================================
// SECTION 13 — PWA FUNCTIONS
// ============================================================

window.installPWA = function () {
    try {
        if (typeof window._installPWAModule === 'function') {
            return window._installPWAModule();
        }
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            window.deferredPrompt.userChoice.then((result) => {
                if (result.outcome === 'accepted') {
                    window.showToast('✅ Installing app...', 'success');
                }
                window.deferredPrompt = null;
            });
        } else {
            window.showToast('App already installed or not available.', 'info');
        }
    } catch (e) {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            window.deferredPrompt.userChoice.then((result) => {
                if (result.outcome === 'accepted') {
                    window.showToast('✅ Installing app...', 'success');
                }
                window.deferredPrompt = null;
            });
        } else {
            window.showToast('App already installed or not available.', 'info');
        }
    }
};

window.isStandalone = function () {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
};

// ============================================================
// SECTION 14 — BIOMETRIC FUNCTIONS
// ============================================================

window.setupBiometricLogin = function () {
    try {
        if (typeof window._setupBiometricLoginModule === 'function') {
            return window._setupBiometricLoginModule();
        }
        window.showToast('Biometric login not available in this browser.', 'warning');
    } catch (e) {
        window.showToast('Biometric login not available in this browser.', 'warning');
    }
};

window.doBiometricLogin = function () {
    try {
        if (typeof window._doBiometricLoginModule === 'function') {
            return window._doBiometricLoginModule();
        }
        window.showToast('Biometric login failed. Please use password.', 'warning');
    } catch (e) {
        window.showToast('Biometric login failed. Please use password.', 'warning');
    }
};

// ============================================================
// SECTION 15 — PRINT & LOGO FUNCTIONS
// ============================================================

window.buildPrintHeader = function (title) {
    try {
        if (typeof window._buildPrintHeaderModule === 'function') {
            return window._buildPrintHeaderModule(title);
        }
        const school = window.state?.schoolSettings || {};
        const today = new Date().toLocaleDateString('en-RW', { year: 'numeric', month: 'long', day: 'numeric' });
        const logoHtml = school.school_logo
            ? `<img src="${school.school_logo}" style="height:50px;width:auto;border-radius:8px;">`
            : '🏫';
        return `<div style="display:flex;align-items:center;gap:16px;padding:10px 0;border-bottom:2.5px solid #1a3a5c;margin-bottom:14px;">
            <div style="flex-shrink:0;">${logoHtml}</div>
            <div style="flex:1;text-align:center;line-height:1.4;">
                <div style="font-size:1.2rem;font-weight:800;color:#1a3a5c;">${window.esc(school.school_name || 'ECOLE LA FONTAINE')}</div>
                ${school.school_motto ? `<div style="font-size:.8rem;font-style:italic;color:#64748b;">"${window.esc(school.school_motto)}"</div>` : ''}
                ${school.school_address ? `<div style="font-size:.75rem;color:#64748b;">${window.esc(school.school_address)}</div>` : ''}
                ${title ? `<div style="font-size:.95rem;font-weight:700;color:#1a3a5c;margin-top:5px;padding-top:5px;border-top:1px solid #e2e8f0;">${window.esc(title)}</div>` : ''}
            </div>
            <div style="flex-shrink:0;text-align:right;font-size:.72rem;color:#64748b;line-height:1.6;">
                <div>${today}</div>
            </div>
        </div>`;
    } catch (e) {
        const school = window.state?.schoolSettings || {};
        const today = new Date().toLocaleDateString('en-RW', { year: 'numeric', month: 'long', day: 'numeric' });
        return `<div style="text-align:center;border-bottom:2px solid #1a3a5c;padding-bottom:10px;margin-bottom:14px;">
            <h2 style="color:#1a3a5c;margin:0;">${window.esc(school.school_name || 'ECOLE LA FONTAINE')}</h2>
            ${title ? `<h3 style="margin:4px 0;">${window.esc(title)}</h3>` : ''}
            <small>${today}</small>
        </div>`;
    }
};

window.applySchoolLogo = function (logoData) {
    try {
        if (typeof window._applySchoolLogoModule === 'function') {
            return window._applySchoolLogoModule(logoData);
        }
        if (!logoData) return;
        const elements = document.querySelectorAll('.sidebar-logo, .report-logo, .receipt-logo, #login-logo-box');
        const isImg = logoData?.startsWith('data:') || logoData?.startsWith('http');
        const html = isImg ? `<img src="${logoData}" style="width:100%;height:100%;object-fit:contain;">` : `<span style="font-size:2rem;">${logoData || '🏫'}</span>`;
        elements.forEach(el => {
            if (el) el.innerHTML = html;
        });
    } catch (e) {
        if (!logoData) return;
        const elements = document.querySelectorAll('.sidebar-logo, .report-logo, .receipt-logo, #login-logo-box');
        const isImg = logoData?.startsWith('data:') || logoData?.startsWith('http');
        const html = isImg ? `<img src="${logoData}" style="width:100%;height:100%;object-fit:contain;">` : `<span style="font-size:2rem;">${logoData || '🏫'}</span>`;
        elements.forEach(el => {
            if (el) el.innerHTML = html;
        });
    }
};

// ============================================================
// SECTION 16 — CHART FUNCTIONS
// ============================================================

window.createBarChart = function (canvasId, labels, datasets, options = {}) {
    try {
        if (typeof window._createBarChartModule === 'function') {
            return window._createBarChartModule(canvasId, labels, datasets, options);
        }
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return null;
        }
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return null;
        const chart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: { responsive: true, maintainAspectRatio: true, ...options }
        });
        return chart;
    } catch (e) {
        console.warn('[createBarChart] Fallback:', e);
        return null;
    }
};

window.createLineChart = function (canvasId, labels, datasets, options = {}) {
    try {
        if (typeof window._createLineChartModule === 'function') {
            return window._createLineChartModule(canvasId, labels, datasets, options);
        }
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return null;
        }
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return null;
        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: { responsive: true, maintainAspectRatio: true, ...options }
        });
        return chart;
    } catch (e) {
        console.warn('[createLineChart] Fallback:', e);
        return null;
    }
};

window.createPieChart = function (canvasId, labels, data, colors, type = 'doughnut') {
    try {
        if (typeof window._createPieChartModule === 'function') {
            return window._createPieChartModule(canvasId, labels, data, colors, type);
        }
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return null;
        }
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return null;
        const chart = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
        return chart;
    } catch (e) {
        console.warn('[createPieChart] Fallback:', e);
        return null;
    }
};

window.destroyAllCharts = function () {
    try {
        if (typeof window._destroyAllChartsModule === 'function') {
            return window._destroyAllChartsModule();
        }
        if (window._chartInstances) {
            Object.values(window._chartInstances).forEach(chart => {
                try { chart.destroy(); } catch (e) { }
            });
            window._chartInstances = {};
        }
    } catch (e) {
        // Silently fail
    }
};

// ============================================================
// SECTION 17 — SIDEBAR & TOPBAR FUNCTIONS
// ============================================================

window.toggleSidebar = function () {
    try {
        if (typeof window._toggleSidebarModule === 'function') {
            return window._toggleSidebarModule();
        }
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('mobile-open');
            let overlay = document.querySelector('.sidebar-overlay');
            if (!overlay && sidebar.classList.contains('mobile-open')) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.onclick = window.closeSidebarMobile;
                document.body.appendChild(overlay);
            } else if (overlay) {
                overlay.remove();
            }
        } else {
            sidebar.classList.toggle('collapsed');
        }
    } catch (e) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('mobile-open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    }
};

window.closeSidebarMobile = function () {
    try {
        if (typeof window._closeSidebarMobileModule === 'function') {
            return window._closeSidebarMobileModule();
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.remove();
    } catch (e) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.remove();
    }
};

window.toggleNavSection = function (element) {
    try {
        if (typeof window._toggleNavSectionModule === 'function') {
            return window._toggleNavSectionModule(element);
        }
        if (!element) return;
        element.classList.toggle('collapsed');
        const collapsed = [];
        document.querySelectorAll('.nav-section.collapsed').forEach(s => collapsed.push(s.id));
        localStorage.setItem('sidebar_collapsed_sections', JSON.stringify(collapsed));
    } catch (e) {
        if (!element) return;
        element.classList.toggle('collapsed');
    }
};

window.toggleUserDropdown = function () {
    try {
        if (typeof window._toggleUserDropdownModule === 'function') {
            return window._toggleUserDropdownModule();
        }
        const dd = document.getElementById('user-dropdown');
        if (dd) dd.classList.toggle('open');
    } catch (e) {
        const dd = document.getElementById('user-dropdown');
        if (dd) dd.classList.toggle('open');
    }
};

// ============================================================
// SECTION 18 — AUTH FUNCTIONS
// ============================================================

window.doLogin = function () {
    try {
        if (typeof window._doLoginModule === 'function') {
            return window._doLoginModule();
        }
        window.showToast('Login function not available', 'warning');
    } catch (e) {
        window.showToast('Login function not available', 'warning');
    }
};

window.logout = function () {
    try {
        if (typeof window._logoutModule === 'function') {
            return window._logoutModule();
        }
        window.showToast('Logout function not available', 'warning');
    } catch (e) {
        window.showToast('Logout function not available', 'warning');
    }
};

window.toggleLoginPw = function () {
    const el = document.getElementById('login-password');
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
};

window.onRoleChange = function () {
    const role = document.getElementById('login-role')?.value;
    const usernameField = document.getElementById('username-field');
    if (usernameField) {
        usernameField.style.display = role === 'admin' ? 'none' : 'block';
    }
};

// ============================================================
// SECTION 19 — PROFILE FUNCTIONS
// ============================================================

window.showProfileModal = function () {
    try {
        if (typeof window._showProfileModalModule === 'function') {
            return window._showProfileModalModule();
        }
        window.showToast('Profile modal not available', 'info');
    } catch (e) {
        window.showToast('Profile modal not available', 'info');
    }
};

window.showChangePasswordModal = function () {
    try {
        if (typeof window._showChangePasswordModalModule === 'function') {
            return window._showChangePasswordModalModule();
        }
        window.showToast('Change password not available', 'info');
    } catch (e) {
        window.showToast('Change password not available', 'info');
    }
};

window.submitChangePassword = function () {
    try {
        if (typeof window._submitChangePasswordModule === 'function') {
            return window._submitChangePasswordModule();
        }
        window.showToast('Change password not available', 'warning');
    } catch (e) {
        window.showToast('Change password not available', 'warning');
    }
};

// ============================================================
// SECTION 20 — PROGRESS BAR
// ============================================================

window.updateProgressBar = function () {
    try {
        if (typeof window._updateProgressBarModule === 'function') {
            return window._updateProgressBarModule();
        }
        // Try to call the function from topbar.js if available
        if (typeof updateTopbarYearAndTerm === 'function') {
            updateTopbarYearAndTerm();
        }
    } catch (e) {
        // Silently fail
    }
};

// ============================================================
// SECTION 21 — MODULE FUNCTION PLACEHOLDERS
// These are stub functions that will be replaced by actual module functions
// when the modules load. They prevent "function not found" errors.
// ============================================================

// Create stub functions for all common module functions
const moduleFunctionNames = [
    // Marks
    '_validateMarkInput', '_updateMarkGrade', '_toggleAbsent', '_loadAssessment',
    '_saveMarks', '_clearMarksTable', '_exportMarksExcel', '_loadStudentsTable',
    '_loadSubjectsAndStudents', '_updateMaxFromSubject', '_markAllPresent',
    '_showExistingAssessments', '_showAssessmentSelector', '_refreshMarksView',

    // Bulk Import/Export
    '_downloadImportTemplate', '_uploadImportFile', '_handleImportFile',
    '_previewImportFile', '_updateImportType', '_executeImport', '_resetImport',
    '_executeBulkExport', '_updateExportOptions', '_resetBulkExport',

    // Notifications
    '_markAllNotificationsRead', '_refreshNotifications', '_markNotificationRead',
    '_filterNotifTab', '_filterNotificationsList', '_markAllRead',
    '_createSystemNotification', '_exportNotifications', '_refreshNotificationsCenter',
    '_sendNotification',

    // Announcements
    '_openCreateAnnouncement', '_refreshAnnouncements', '_exportAnnouncements',
    '_viewAnnouncement', '_editAnnouncement', '_deleteAnnouncement',

    // Reminders
    '_openAddReminder', '_exportReminders', '_refreshReminders', '_showRemindersTab',
    '_completeReminder', '_deleteReminder',

    // Settings
    '_saveSchoolSettings', '_previewSchoolLogo', '_removeSchoolLogo',
    '_loadAcademicCalendar', '_updateTermDates', '_setCurrentTerm',
    '_openAddHolidayModal', '_saveAcademicCalendar', '_generateYearCalendar',
    '_exportAcademicCalendar', '_editHoliday', '_deleteHoliday', '_importRwandaHolidays',
    '_openAddYearModal', '_exportAcademicYearsData', '_setAcademicYearStatus',
    '_viewYearTerms', '_editAcademicYear', '_cloneAcademicYear', '_deleteAcademicYear',
    '_saveGradingScale', '_resetGradingScale', '_exportGradingScale',
    '_addGradeLevel', '_removeGradeLevel', '_moveGradeUp', '_moveGradeDown',
    '_refreshGradePreview', '_doFullBackup', '_createFullBackup',
    '_previewRestoreFile', '_confirmRestore', '_saveAutoBackupSettings',
    '_showBackupList', '_exportAllBackups', '_downloadBackupFile', '_deleteBackupRecord',
    '_filterLogs', '_exportAllLogs', '_clearOldLogs', '_refreshLogs', '_viewLogDetails',
    '_saveApiSettings', '_resetApiSettings', '_testApiConnection',
    '_toggleApiKeyVisibility', '_showDatabaseSummary', '_saveAnalyticsSettings',
    '_exportReportTemplates', '_openUploadTemplateModal', '_clearAnalyticsCache',
    '_runSystemHealthCheck', '_exportHealthReport',

    // Staff
    '_openAddStaffModal', '_exportStaff', '_refreshStaffList', '_filterStaffList',
    '_editStaff', '_deleteStaff', '_toggleStaffStatus', '_resetStaffPassword',
    '_openAddSubjectModal', '_saveAllSubjects', '_exportSubjects', '_showSubjectTab',
    '_toggleSubjectStatus', '_deleteSubject', '_openAssignmentModal',
    '_exportAssignments', '_refreshAssignments', '_showAssignmentTab',
    '_editTeacherAssignments', '_clearTeacherAssignments', '_setClassTeacher',
    '_removeClassTeacher', '_exportTeacherPerformance', '_refreshTeacherPerformance',
    '_viewTeacherPerformanceDetails', '_filterTeacherPerformance',

    // Timetable
    '_loadTimetableData', '_openAddTimetableSlot', '_exportTimetable',
    '_printTimetable', '_detectAllConflicts', '_exportConflictReport',
    '_filterConflicts', '_resolveConflict',

    // Class Management
    '_openAddClassModal', '_exportClassesData', '_moveClassUp', '_moveClassDown',
    '_updateClassCapacity', '_toggleClassActive', '_editClass', '_viewClassStudents',

    // Report Cards
    '_onReportTypeChange', '_onReportTermChange', '_loadReportStudents',
    '_generateReportCard', '_printReportCard', '_generateAllReports',
    '_generateSingleReport',

    // Class Register
    '_renderCRTable', '_exportCRToExcel', '_printCR',

    // Analytics
    '_loadAnalyticsData', '_exportAnalyticsReport',

    // Sidebar Year
    '_onSidebarYearChange',
];

// Create stub functions for any that aren't already defined
moduleFunctionNames.forEach(name => {
    if (!window[name]) {
        window[name] = function (...args) {
            console.warn(`[missing-functions] ${name} called but not implemented.`);
            return null;
        };
    }
});

// ============================================================
// SECTION 22 — CONFIRM RESOLVE (for confirmDialog)
// ============================================================

window._confirmResolve = null;

// ============================================================
// SECTION 23 — NAV DATA (for navigateToWithData)
// ============================================================

window._navData = {};

// ============================================================
// SECTION 24 — CHART INSTANCES (for destroyAllCharts)
// ============================================================

window._chartInstances = {};

// ============================================================
// SECTION 25 — LOGGING
// ============================================================

console.log('✅ Missing functions patch loaded');
console.log(`   ${Object.keys(window).filter(k => typeof window[k] === 'function').length} global functions available`);