/**
 * ECOLE LA FONTAINE — Sibling Linking Module
 * Quick sibling linking, auto-detect, and family management
 * Last updated: 2026-06-29
 */



const state = window.state || {}; // global state alias
const ensureStateLoaded = window.ensureStateLoaded || (async () => {}); // global from boot.js
import { state, getClassById, getCurrentUser } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { update, insert } from '../../core/api.js';

// ──────────────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ──────────────────────────────────────────────────────────────────────

export async function renderSiblingLinking(container) {
    if (!container) return;

    const user = getCurrentUser();
    if (user?.role !== 'admin') {
        container.innerHTML = '<div class="alert alert-danger">Access denied. Admin privileges required.</div>';
        return;
    }

    await ensureStateLoaded();

    // This is a lightweight version — redirects to full family management
    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-header">
                <span class="dash-card-title">👨‍👩‍👧 Sibling Linking</span>
                <button class="btn btn-sm btn-primary" onclick="window.navigateTo('family-management')">🏠 Go to Family Management</button>
            </div>
            <div class="dash-card-body">
                <div class="alert alert-info">
                    <strong>💡 Tip:</strong> Use the full <a href="#" onclick="window.navigateTo('family-management')">Family Management</a> module for complete control.
                    <br><br>
                    <strong>Quick Actions:</strong>
                </div>
                <div class="quick-actions" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
                    <button class="quick-btn" onclick="window.navigateTo('family-management')" style="padding:16px;">
                        <div class="qb-icon">👨‍👩‍👧</div>
                        <div class="qb-title">Family Management</div>
                    </button>
                    <button class="quick-btn" onclick="window._autoDetectSiblings()" style="padding:16px;">
                        <div class="qb-icon">🔍</div>
                        <div class="qb-title">Auto-Detect Siblings</div>
                    </button>
                    <button class="quick-btn" onclick="window.navigateTo('student-list')" style="padding:16px;">
                        <div class="qb-icon">👥</div>
                        <div class="qb-title">View Students</div>
                    </button>
                </div>
            </div>
        </div>
    `;

    window._autoDetectSiblings = autoDetectSiblings;
}

// ──────────────────────────────────────────────────────────────────────
// AUTO-DETECT SIBLINGS
// ──────────────────────────────────────────────────────────────────────

async function autoDetectSiblings() {
    const unlinkedStudents = (state.students || []).filter(s => !s.family_id && s.status === 'Active');
    const guardianMap = new Map();

    for (const s of unlinkedStudents) {
        const key = (s.guardian_name || '').toLowerCase().trim();
        if (key) {
            if (!guardianMap.has(key)) guardianMap.set(key, []);
            guardianMap.get(key).push(s);
        }
    }

    const groups = Array.from(guardianMap.values()).filter(g => g.length > 1);

    if (!groups.length) {
        showToast('No potential sibling groups found', 'info');
        return;
    }

    let created = 0;
    let linked = 0;

    for (const group of groups) {
        const familyCode = `FAM-${Date.now().toString().slice(-6)}`;
        const guardianName = group[0].guardian_name || 'Family';

        const newFamily = await insert('families', {
            family_code: familyCode,
            guardian_name: guardianName,
            guardian_phone: group[0].guardian_phone || null,
            created_at: new Date().toISOString(),
        });

        if (newFamily) {
            created++;
            for (const s of group) {
                const result = await update('students', s.id, {
                    family_id: newFamily.id,
                    updated_at: new Date().toISOString(),
                });
                if (result) linked++;
            }
        }
    }

    await refreshTable('students');
    await refreshTable('families');

    showToast(`✅ Created ${created} families, linked ${linked} students`, 'success');
    navigateTo('family-management');
}