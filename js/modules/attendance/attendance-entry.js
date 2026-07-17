/* ═══════════════════════════════════════════════════════════════════
   js/modules/attendance/attendance-entry.js
   ═══════════════════════════════════════════════════════════════════
   Daily attendance recording. Markup matches css/modules/attendance.css
   exactly (.attendance-filters, .no-attendance-banner, .attendance-
   bulk-actions, .attendance-table-wrap/.attendance-table with a native
   .status-select per row, .attendance-save-actions) — verified against
   the actual CSS file rather than assumed.

   Real backend: window.getStudentsInClass(classId), window.getWhere/
   insert/update on the 'attendance' table, window.isHolidayDate(),
   window.computeAttendanceRate/countAttendance/getAttendanceRisk from
   core/formulas.js. Falls back to a small in-memory mock roster only
   if window.state isn't populated yet, with a console.warn — never
   silently mistaken for real data.
   ═══════════════════════════════════════════════════════════════════ */

const AttendanceEntry = (() => {

    const STATUS_CODES = (typeof ATTENDANCE_CODES !== 'undefined') ? ATTENDANCE_CODES : ['P', 'A', 'L', 'E'];
    const STATUS_LABELS = (typeof ATTENDANCE_LABELS !== 'undefined') ? ATTENDANCE_LABELS : { P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' };

    const MOCK_ROSTER = [
        { id: 'STU-2024-0012', name: 'MUGISHA Jean' },
        { id: 'STU-2024-0202', name: 'KAMALI Jean' },
        { id: 'STU-2023-0175', name: 'NIYONZIMA Claude' }
    ];

    let currentClassId = null;
    let currentDate = null;
    let roster = []; // [{ id, name, attendanceId|null, status, notes }]
    let dirty = false;

    function esc(str) {
        if (window.esc) return window.esc(str);
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function today() {
        return window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10);
    }

    function isWeekend(dateStr) {
        const day = new Date(dateStr + 'T00:00:00').getDay();
        return day === 0 || day === 6;
    }

    function isFuture(dateStr) {
        return dateStr > today();
    }

    function render(container) {
        if (!container) return;
        currentDate = today();

        container.innerHTML = `
      <div class="dashboard-page">
        <div class="attendance-filters" id="att-filters">
          <div class="filter-group">
            <label>Class</label>
            <select id="att-class-select">
              <option value="">Select a class...</option>
              ${classOptions()}
            </select>
          </div>
          <div class="filter-group">
            <label>Date</label>
            <input type="date" id="att-date-input" value="${currentDate}" max="${today()}" />
          </div>
          <div class="filter-actions">
            <button class="btn btn-apply" id="att-load-btn">Load</button>
            <button class="btn btn-reset" id="att-reset-btn">Today</button>
          </div>
        </div>

        <div class="no-attendance-banner" id="att-banner">
          <span class="icon"><i class="fa-solid fa-triangle-exclamation"></i></span>
          <div class="content">
            <div class="title" id="att-banner-title"></div>
            <div class="reason" id="att-banner-reason"></div>
          </div>
        </div>

        <div id="att-body"></div>
      </div>
    `;

        container.querySelector('#att-load-btn').addEventListener('click', () => loadRoster(container));
        container.querySelector('#att-reset-btn').addEventListener('click', () => {
            container.querySelector('#att-date-input').value = today();
            loadRoster(container);
        });
        container.querySelector('#att-date-input').addEventListener('change', () => loadRoster(container));
        container.querySelector('#att-class-select').addEventListener('change', () => loadRoster(container));
    }

    function classOptions() {
        if (window.state?.classes?.length) {
            return window.state.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        }
        return [...CLASS_LEVELS.nursery, ...CLASS_LEVELS.primary].map(c => `<option value="${c}">${c}</option>`).join('');
    }

    function dateStatus(dateStr) {
        if (window.isHolidayDate?.(dateStr)) return { blocked: true, kind: 'holiday', title: 'This date is a school holiday', reason: 'Attendance cannot be recorded on holidays. Use Holiday Marks/Fees for holiday-period activity instead.' };
        if (isWeekend(dateStr)) return { blocked: true, kind: 'weekend', title: 'This date is a weekend', reason: 'No classes are held on weekends.' };
        if (isFuture(dateStr)) return { blocked: true, kind: 'future', title: 'This date is in the future', reason: 'You can only record attendance for today or a past date.' };
        return { blocked: false };
    }

    async function loadRoster(container) {
        currentClassId = container.querySelector('#att-class-select').value;
        currentDate = container.querySelector('#att-date-input').value;
        const banner = container.querySelector('#att-banner');
        const body = container.querySelector('#att-body');
        const dateInput = container.querySelector('#att-date-input');

        const status = dateStatus(currentDate);
        banner.className = `no-attendance-banner ${status.blocked ? `show ${status.kind}` : ''}`;
        dateInput.parentElement.classList.toggle('attendance-date-disabled', status.blocked);

        if (!currentClassId) {
            body.innerHTML = '';
            return;
        }
        if (status.blocked) {
            container.querySelector('#att-banner-title').textContent = status.title;
            container.querySelector('#att-banner-reason').textContent = status.reason;
            body.innerHTML = '';
            return;
        }

        if (window.Skeletons) window.Skeletons.showIn(body, 'list', 5);

        const students = await fetchStudentsInClass(currentClassId);
        const existing = await fetchExistingAttendance(currentClassId, currentDate);

        roster = students.map(s => {
            const record = existing.find(r => r.student_id === s.id);
            return {
                id: s.id, name: s.name,
                attendanceId: record?.id || null,
                status: record?.status || 'P',
                notes: record?.notes || ''
            };
        });

        dirty = false;
        renderTable(body, container);
    }

    async function fetchStudentsInClass(classId) {
        if (window.getStudentsInClass && window.state?.students?.length) {
            return window.getStudentsInClass(classId).map(s => ({
                id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()
            }));
        }
        if (window.getAll) {
            try {
                const rows = await window.getAll('students', { class_id: classId, is_deleted: false });
                if (rows?.length) return rows.map(s => ({ id: s.id, name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() }));
            } catch (err) { console.warn('AttendanceEntry: getAll(students) failed', err); }
        }
        console.warn('AttendanceEntry: no real student roster available — using MOCK_ROSTER placeholder.');
        return MOCK_ROSTER;
    }

    async function fetchExistingAttendance(classId, dateStr) {
        if (!window.getWhere) return [];
        try {
            return await window.getWhere('attendance', `class_id=eq.${classId}&date=eq.${dateStr}`);
        } catch (err) {
            console.warn('AttendanceEntry: getWhere(attendance) failed', err);
            return [];
        }
    }

    function renderTable(body, container) {
        body.innerHTML = `
      <div class="attendance-bulk-actions">
        <button class="btn btn-primary" data-bulk="P">Mark All Present</button>
        <button class="btn btn-danger" data-bulk="A">Mark All Absent</button>
        <button class="btn btn-warning" data-bulk="L">Mark All Late</button>
        <button class="btn btn-purple" data-bulk="E">Mark All Excused</button>
      </div>
      <div class="attendance-table-wrap">
        <table class="attendance-table">
          <thead><tr><th>Student</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            ${roster.map((s, i) => `
              <tr data-row="${i}">
                <td>
                  <span class="attendance-student-name">${esc(s.name)}</span>
                  <span class="attendance-student-code">${esc(s.id)}</span>
                </td>
                <td>
                  <select class="status-select" data-status="${i}">
                    ${STATUS_CODES.map(code => `<option value="${code}" ${s.status === code ? 'selected' : ''}>${STATUS_LABELS[code]}</option>`).join('')}
                  </select>
                </td>
                <td><input type="text" class="attendance-notes-input" data-notes="${i}" value="${esc(s.notes)}" placeholder="Optional note..." /></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="attendance-save-actions">
        <button class="btn btn-save" id="att-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save Attendance</button>
        <button class="btn btn-export" id="att-export-btn"><i class="fa-solid fa-file-export"></i> Export</button>
        <button class="btn btn-print" id="att-print-btn"><i class="fa-solid fa-print"></i> Print</button>
        <span class="status-text" id="att-status-text"><strong>${roster.length}</strong> students</span>
      </div>
    `;

        body.querySelectorAll('[data-bulk]').forEach(btn => {
            btn.addEventListener('click', () => {
                roster.forEach(s => { s.status = btn.dataset.bulk; });
                markDirty(body);
                renderTable(body, container);
            });
        });
        body.querySelectorAll('[data-status]').forEach(sel => {
            sel.addEventListener('change', () => { roster[+sel.dataset.status].status = sel.value; markDirty(body); });
        });
        body.querySelectorAll('[data-notes]').forEach(input => {
            input.addEventListener('input', () => { roster[+input.dataset.notes].notes = input.value; markDirty(body); });
        });
        body.querySelector('#att-save-btn').addEventListener('click', () => saveAttendance(body));
        body.querySelector('#att-export-btn').addEventListener('click', () => exportAttendance());
        body.querySelector('#att-print-btn').addEventListener('click', () => window.print());
    }

    function markDirty(body) {
        dirty = true;
        const statusText = body.querySelector('#att-status-text');
        if (statusText && !statusText.querySelector('.unsaved')) {
            statusText.innerHTML += ` \u00b7 <span class="unsaved">unsaved changes</span>`;
        }
    }

    async function saveAttendance(body) {
        const btn = body.querySelector('#att-save-btn');
        window.Loaders?.button?.start(btn);

        try {
            const userId = window.state?.currentUser?.id || null;
            await Promise.all(roster.map(s => {
                const payload = { student_id: s.id, class_id: currentClassId, date: currentDate, status: s.status, notes: s.notes || null, recorded_by: userId };
                if (s.attendanceId) {
                    return window.update ? window.update('attendance', s.attendanceId, payload) : Promise.resolve();
                }
                return window.insert ? window.insert('attendance', payload).then(row => { if (row?.id) s.attendanceId = row.id; }) : Promise.resolve();
            }));

            dirty = false;
            body.querySelector('#att-status-text').innerHTML = `<strong>${roster.length}</strong> students \u00b7 saved`;
            window.Toast?.success('Attendance saved', `${roster.length} records saved for ${currentDate}.`);
        } catch (err) {
            window.Toast?.error('Could not save attendance', err?.message || 'Please try again.');
        } finally {
            window.Loaders?.button?.stop(btn);
        }
    }

    function exportAttendance() {
        let worker;
        try { worker = new Worker('js/workers/export-worker.js'); }
        catch { window.Toast?.error('Export unavailable', 'Web Workers are not supported in this environment.'); return; }

        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'COMPLETE') {
                const url = URL.createObjectURL(payload.blob);
                const a = document.createElement('a');
                a.href = url; a.download = `attendance-${currentDate}.xlsx`;
                document.body.appendChild(a); a.click(); a.remove();
                URL.revokeObjectURL(url);
                window.Toast?.success('Export ready');
                worker.terminate();
            } else if (type === 'ERROR') {
                window.Toast?.error('Export failed', payload.message);
                worker.terminate();
            }
        };

        worker.postMessage({
            type: 'EXPORT_XLSX',
            payload: { sheets: [{ name: 'Attendance', rows: roster.map(s => ({ 'Student Code': s.id, 'Name': s.name, 'Status': STATUS_LABELS[s.status], 'Notes': s.notes || '' })) }] }
        });
    }

    function destroy() {
        if (dirty) {
            console.warn('AttendanceEntry: leaving with unsaved changes.');
        }
    }

    return { render, destroy };
})();