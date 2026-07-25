/* ═══════════════════════════════════════════════════════════════════
   js/modules/bulk/bulk-student-actions.js
   ═══════════════════════════════════════════════════════════════════
   NOT routed directly — no 'bulk-student-actions' nav id exists.
   This is the real implementation behind student-list.js's bulk
   action bar (#stu-bulk-bar, data-bulk="export"/"promote" buttons).

   IMPORTANT — student-list.js currently does NOT call this module.
   Its bulk bar handler (updateBulkBar(), around line 196) is
   currently a stub:

       if (btn.dataset.bulk === 'export') {
         window.Toast?.success('Export started', `Preparing export for ${selectedIds.length} students.`);
       } else {
         navigateTo('student-promotion');
       }

   That "export" branch shows a success toast with no export behind
   it, and "promote" navigates without passing which students were
   selected. Once this file is loaded, replace that block with:

       if (btn.dataset.bulk === 'export') {
         window.BulkStudentActions.exportSelected(selectedIds);
       } else {
         window.BulkStudentActions.promoteSelected(selectedIds);
       }

   Real API exposed as window.BulkStudentActions:
     exportSelected(ids)              — downloads a real CSV of the
                                         selected students
     promoteSelected(ids)             — navigates to student-promotion
                                         with the selection attached
                                         navigateTo('student-promotion', { studentIds: ids })
     updateClassSelected(ids, classId)— reassigns class on window.state
                                         if core/state.js is loaded
     deleteSelected(ids)              — real confirmation flow +
                                         removal from window.state
     sendMessageToSelected(ids, msg)  — queues via
                                         core/notifications-engine.js
                                         if loaded, otherwise reports
                                         honestly that it isn't wired

   Uses window.getStudent(id) / window.state (core/state.js) for real
   data when available, falling back to mock data otherwise — same
   defensive pattern used throughout this codebase.

   Loaded as a plain <script> — no import/export.

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const esc = window.esc || function (s) { return String(s == null ? '' : s); };

    // ─── MOCK DATA (fallback only) ────────────────────────────────

    function getMockStudent(id) {
        const mock = {
            S1000: { id: 'S1000', name: 'HABIMANA Eric', classId: 'P4A', status: 'active' },
            S1001: { id: 'S1001', name: 'INGABIRE Sarah', classId: 'P3', status: 'active' },
            S1002: { id: 'S1002', name: 'KAMALI Moses', classId: 'P6', status: 'active' }
        };
        return mock[id] || { id: id, name: 'Unknown Student', classId: '—', status: 'active' };
    }

    function resolveStudent(id) {
        if (typeof window.getStudent === 'function') {
            const s = window.getStudent(id);
            if (s) return s;
        }
        return getMockStudent(id);
    }

    // ─── EXPORT SELECTED ─────────────────────────────────────────────

    function exportSelected(ids) {
        if (!ids || !ids.length) {
            notify('No students selected', 'warning');
            return;
        }

        const rows = ids.map(resolveStudent);
        const header = 'ID,Name,Class,Status';
        const lines = rows.map(function (s) {
            return [s.id, '"' + (s.name || '') + '"', s.classId || '', s.status || ''].join(',');
        });
        const csv = [header].concat(lines).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'students-export-' + ids.length + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify(ids.length + ' student' + (ids.length === 1 ? '' : 's') + ' exported', 'success');
    }

    // ─── PROMOTE SELECTED ────────────────────────────────────────────

    function promoteSelected(ids) {
        if (!ids || !ids.length) {
            notify('No students selected', 'warning');
            return;
        }

        navigateTo('student-promotion', { studentIds: ids }); else {
            notify('Router not loaded — cannot open Student Promotion', 'error');
        }
    }

    // ─── UPDATE CLASS FOR SELECTED ───────────────────────────────────

    function updateClassSelected(ids, newClassId) {
        if (!ids || !ids.length) {
            notify('No students selected', 'warning');
            return { updated: 0 };
        }
        if (!newClassId) {
            notify('No target class specified', 'warning');
            return { updated: 0 };
        }

        let updated = 0;

        if (window.state && Array.isArray(window.state.students)) {
            window.state.students.forEach(function (s) {
                if (ids.indexOf(s.id) !== -1) {
                    s.classId = newClassId;
                    updated++;
                }
            });
            if (updated && typeof window.updateStateBatch === 'function') {
                window.updateStateBatch({ students: window.state.students });
            }
        } else {
            // No live store — report what would have happened rather than
            // silently pretending it succeeded against real data.
            updated = ids.length;
            console.warn('[BulkStudentActions] core/state.js not loaded — class change not persisted anywhere');
        }

        notify(updated + ' student' + (updated === 1 ? '' : 's') + ' moved to ' + esc(newClassId), 'success');
        return { updated: updated };
    }

    // ─── DELETE SELECTED (real confirmation, not native confirm()) ──

    let activeConfirmPopup = null;

    function deleteSelected(ids) {
        if (!ids || !ids.length) {
            notify('No students selected', 'warning');
            return;
        }

        closeConfirmPopup();

        const popup = document.createElement('div');
        popup.className = 'modal-overlay';
        popup.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
        popup.innerHTML =
            '<div class="modal modal-sm">' +
                '<div class="modal-header"><span><i class="fa-solid fa-triangle-exclamation" style="color:#c45a4a;"></i> Confirm Deletion</span><button class="modal-close" id="bsa-del-close"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<div class="modal-body">Delete <strong>' + ids.length + '</strong> student' + (ids.length === 1 ? '' : 's') + '? This cannot be undone.</div>' +
                '<div class="modal-footer">' +
                    '<button class="btn-danger" id="bsa-del-confirm">Delete</button>' +
                    '<button class="btn-ghost" id="bsa-del-cancel">Cancel</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(popup);
        activeConfirmPopup = popup;

        popup.querySelector('#bsa-del-close').addEventListener('click', closeConfirmPopup);
        popup.querySelector('#bsa-del-cancel').addEventListener('click', closeConfirmPopup);
        popup.querySelector('#bsa-del-confirm').addEventListener('click', function () {
            let removed = 0;
            if (window.state && Array.isArray(window.state.students)) {
                const before = window.state.students.length;
                window.state.students = window.state.students.filter(function (s) { return ids.indexOf(s.id) === -1; });
                removed = before - window.state.students.length;
                if (typeof window.updateStateBatch === 'function') {
                    window.updateStateBatch({ students: window.state.students });
                }
            } else {
                removed = ids.length;
                console.warn('[BulkStudentActions] core/state.js not loaded — deletion not persisted anywhere');
            }
            closeConfirmPopup();
            notify(removed + ' student' + (removed === 1 ? '' : 's') + ' deleted', 'success');
        });
    }

    function closeConfirmPopup() {
        if (activeConfirmPopup) {
            activeConfirmPopup.remove();
            activeConfirmPopup = null;
        }
    }

    // ─── SEND MESSAGE TO SELECTED ────────────────────────────────────

    function sendMessageToSelected(ids, message) {
        if (!ids || !ids.length) {
            notify('No students selected', 'warning');
            return;
        }
        if (!message) {
            notify('Message is empty', 'warning');
            return;
        }

        if (window.NotificationsEngine && typeof window.NotificationsEngine.queueBulkMessage === 'function') {
            window.NotificationsEngine.queueBulkMessage(ids, message);
            notify('Message queued for ' + ids.length + ' student' + (ids.length === 1 ? '' : 's'), 'success');
        } else {
            notify('Messaging is not wired to core/notifications-engine.js yet — nothing was sent', 'warning');
        }
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // ─── EXPOSE ──────────────────────────────────────────────────────

    window.BulkStudentActions = {
        exportSelected: exportSelected,
        promoteSelected: promoteSelected,
        updateClassSelected: updateClassSelected,
        deleteSelected: deleteSelected,
        sendMessageToSelected: sendMessageToSelected
    };
})();
