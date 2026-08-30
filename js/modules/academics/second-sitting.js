/* ═══════════════════════════════════════════════════════════════════
   js/modules/academics/second-sitting.js
   ═══════════════════════════════════════════════════════════════════
   Uses real DB tables:
     second_sitting_students — students registered for 2nd sitting
     second_sitting_marks    — per-subject scores
   Auto-register via Supabase RPC: auto_register_second_sitting_students
   Access: Admin sees all classes. Teacher sees own class only
           (classes.class_teacher_id = current teacher id).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let _ssClassId = null, _ssYearId = null;

async function renderSecondSitting(container, params = {}) {
    if (!container) return;
    await ensureStateLoaded();

    _ssYearId = params.yearId || getActiveYear()?.id || null;

    // Only available after Term 3 ends
    const term3 = (state.terms || []).filter(t => t.academic_year_id === _ssYearId)
        .find(t => t.term_number === 3);
    if (!term3 || term3.status !== 'completed') {
        container.innerHTML = `<div class="module-wrap">
          <div class="mod-topbar"><div class="mod-topbar-left">
            <h1 class="mod-title"><i class="fa-solid fa-clock-rotate-left"></i> Second Sitting</h1>
          </div></div>
          <div class="section-card">
            <div class="empty-state" style="padding:60px;">
              <div class="es-icon"><i class="fa-solid fa-lock" style="font-size:48px;opacity:.3;"></i></div>
              <div class="es-title">Second Sitting Not Yet Available</div>
              <div class="es-sub">Available only after Term 3 is marked as completed.
                ${term3 ? '<br>Term 3 status: <strong>' + esc(term3.status) + '</strong>' : '<br>No Term 3 found for this year.'}</div>
            </div>
          </div></div>`;
        return;
    }

    // Class teacher restriction
    const myClass  = typeof getMyClass === 'function' ? getMyClass() : null;
    const isAdmin  = state.currentUser?.role === 'admin';
    const classes  = isAdmin
        ? (state.classes || []).filter(c => c.is_active !== false).sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
        : myClass ? [myClass] : [];

    if (!classes.length) {
        container.innerHTML = `<div class="module-wrap"><div class="section-card">
          <div class="empty-state" style="padding:60px;">
            <div class="es-title">No class assigned</div>
            <div class="es-sub">You are not assigned as class teacher for any class.</div>
          </div></div></div>`;
        return;
    }

    _ssClassId = params.classId || (myClass?.id) || classes[0]?.id;
    _ssShell(container, classes, term3);
}

function _ssShell(container, classes, term3) {
    const promoMark = parseFloat(state.schoolSettings?.promotion_mark || '50');
    container.innerHTML = `
    <div class="module-wrap">
      <div class="mod-topbar">
        <div class="mod-topbar-left">
          <h1 class="mod-title">
            <i class="fa-solid fa-clock-rotate-left"></i> Second Sitting Marks
          </h1>
          <span class="badge badge-warning" style="margin-left:8px;">Term 3 Complete · Core Subjects</span>
        </div>
        <div class="mod-topbar-right" style="display:flex;gap:8px;">
          ${classes.length > 1 ? `
          <select class="select select-sm" onchange="ssPickClass(parseInt(this.value))">
            ${classes.map(c => `<option value="${c.id}"${c.id===_ssClassId?' selected':''}>
              ${esc(c.name)}</option>`).join('')}
          </select>` : `<span class="badge badge-neutral">${esc(classes[0]?.name||'—')}</span>`}
          <button class="btn btn-secondary btn-sm" onclick="ssAutoRegister()">
            <i class="fa-solid fa-bolt"></i> Auto-Register Failing Students
          </button>
        </div>
      </div>

      <div class="alert alert-info" style="margin-bottom:14px;">
        <i class="fa-solid fa-circle-info"></i>
        Promotion threshold: <strong>${promoMark}%</strong>.
        Enter scores as <strong>percentages (0–100)</strong> for core subjects only.
        Annual average is <strong>not changed</strong> — this is used only for promotion eligibility.
      </div>

      <div class="section-card">
        <div id="ss-body">
          <div class="empty-state" style="padding:32px;">
            <div class="es-title">Loading second sitting students…</div>
          </div>
        </div>
      </div>
    </div>`;

    _ssLoad();
}

window.ssPickClass = classId => { _ssClassId = classId; _ssLoad(); };

async function _ssLoad() {
    const el = document.getElementById('ss-body');
    if (!el) return;
    el.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="es-title">Loading…</div></div>';

    try {
        // Load registered second sitting students for this class + year
        const registered = await getAll('second_sitting_students',
            `class_id=eq.${_ssClassId}&academic_year_id=eq.${_ssYearId}&order=created_at.asc`
        ).catch(() => []);

        // Load their marks
        const ssStudentIds = registered.map(r => r.id);
        let ssMarks = [];
        if (ssStudentIds.length) {
            ssMarks = await getAll('second_sitting_marks',
                `second_sitting_student_id=in.(${ssStudentIds.join(',')})&academic_year_id=eq.${_ssYearId}`
            ).catch(() => []);
        }

        _ssRender(el, registered, ssMarks);
    } catch(err) {
        el.innerHTML = `<div class="empty-state" style="padding:32px;">
            <div class="es-title">Error loading data</div>
            <div class="es-sub">${esc(err.message)}</div></div>`;
    }
}

function _ssRender(el, registered, ssMarks) {
    const promoMark = parseFloat(state.schoolSettings?.promotion_mark || '50');

    if (!registered.length) {
        el.innerHTML = `
        <div class="empty-state" style="padding:40px;">
          <div class="es-icon"><i class="fa-solid fa-users" style="font-size:48px;opacity:.3;"></i></div>
          <div class="es-title">No students registered for second sitting</div>
          <div class="es-sub">Click "Auto-Register Failing Students" to register students
            below the ${promoMark}% promotion threshold.</div>
        </div>`;
        return;
    }

    // Build mark lookup: ssStudentId → subjectId → mark row
    const markMap = {};
    ssMarks.forEach(m => {
        if (!markMap[m.second_sitting_student_id]) markMap[m.second_sitting_student_id] = {};
        markMap[m.second_sitting_student_id][m.subject_id] = m;
    });

    // Get subjects from failed_subjects JSON or from core subjects
    const allSubjectIds = new Set();
    registered.forEach(r => {
        try {
            const failed = Array.isArray(r.failed_subjects)
                ? r.failed_subjects
                : JSON.parse(r.failed_subjects || '[]');
            failed.forEach(f => { if (f.subject_id) allSubjectIds.add(f.subject_id); });
        } catch(e) {}
    });

    // Fallback: get core subjects for the class
    if (!allSubjectIds.size) {
        (state.subjects || []).filter(s => s.is_core !== false).forEach(s => allSubjectIds.add(s.id));
    }

    const subjects = [...allSubjectIds]
        .map(id => (state.subjects || []).find(s => s.id === id))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

    const subjHeaders = subjects.map(s =>
        `<th class="text-center" style="min-width:90px;font-size:12px;">${esc(s.name)}<br>
         <span style="font-weight:400;font-size:10px;">2nd Sit %</span></th>`
    ).join('');

    const rows = registered.map(r => {
        const student = getStudent(r.student_id);
        const pctColor = r.original_average < promoMark ? 'color:var(--color-danger);font-weight:700;' : 'color:var(--color-success);';
        const statusBadge = r.status === 'completed'
            ? `<span class="badge badge-success">Completed</span>`
            : r.status === 'registered'
            ? `<span class="badge badge-warning">Registered</span>`
            : `<span class="badge badge-neutral">${esc(r.status)}</span>`;

        const subjCells = subjects.map(subj => {
            const m = markMap[r.id]?.[subj.id];
            const score = m?.second_percentage ?? m?.second_score ?? null;
            const col = score === null ? '' : score >= promoMark ? 'color:var(--color-success);' : 'color:var(--color-danger);';
            return `<td class="text-center">
              <input type="number" class="input" min="0" max="100" step="0.5"
                     style="width:75px;text-align:center;${col}"
                     id="ss-${r.id}-${subj.id}"
                     value="${score !== null ? score : ''}" placeholder="—"
                     oninput="ssColorInput(this,${promoMark})">
            </td>`;
        }).join('');

        return `<tr>
          <td>
            <div class="student-cell">
              <span class="student-name">${student ? `${esc(student.last_name)}, ${esc(student.first_name)}` : `#${r.student_id}`}</span>
              <span class="student-code">${student ? esc(student.code || '') : '—'}</span>
            </div>
          </td>
          <td class="text-center" style="${pctColor}">${r.original_average !== null ? Number(r.original_average).toFixed(1) + '%' : '—'}</td>
          <td class="text-center">${esc(r.original_grade || '—')}</td>
          <td class="text-center">${statusBadge}</td>
          ${subjCells}
          <td>
            <button class="btn btn-sm btn-primary" onclick="ssSaveRow(${r.id},${r.student_id})">
              <i class="fa-solid fa-floppy-disk"></i></button>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:600;">
        ${registered.length} student${registered.length !== 1 ? 's' : ''} registered for second sitting
      </div>
      <button class="btn btn-primary" onclick="ssSaveAll()">
        <i class="fa-solid fa-floppy-disk"></i> Save All</button>
    </div>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr>
          <th>Student</th>
          <th class="text-center">Annual %</th>
          <th class="text-center">Grade</th>
          <th class="text-center">Status</th>
          ${subjHeaders}
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

window.ssColorInput = (inp, promoMark) => {
    const v = parseFloat(inp.value);
    inp.style.color = isNaN(v) ? '' : v >= promoMark ? 'var(--color-success)' : 'var(--color-danger)';
};

/* ── AUTO-REGISTER ── */
window.ssAutoRegister = async () => {
    const confirmed = await confirmDialog(
        'Auto-register all students below the promotion threshold for second sitting?',
        'Auto-Register Second Sitting',
        { confirmText: 'Register', confirmClass: 'btn-primary' }
    );
    if (!confirmed) return;

    const term3 = (state.terms || []).filter(t => t.academic_year_id === _ssYearId).find(t => t.term_number === 3);
    showToast('Registering students…', 'info', { duration: 3000 });

    try {
        // Call the DB function
        const result = await apiFetch(
            `rpc/auto_register_second_sitting_students`,
            'POST',
            { p_class_id: _ssClassId, p_academic_year_id: _ssYearId, p_term_id: term3?.id || null }
        ).catch(() => null);

        if (result) {
            const count = Array.isArray(result) ? result.length : 0;
            showToast(`${count} student${count !== 1 ? 's' : ''} registered for second sitting.`, 'success');
        } else {
            showToast('Registration complete.', 'success');
        }
        await _ssLoad();
    } catch(err) {
        handleApiError(err, 'auto-register second sitting');
    }
};

/* ── SAVE ROW ── */
window.ssSaveRow = async (ssStudentId, studentId) => {
    const subjects = (state.subjects || []).filter(s => s.is_core !== false);
    await _ssSaveForStudent(ssStudentId, studentId, subjects);
    showToast('Saved.', 'success');
    await _ssLoad();
};

/* ── SAVE ALL ── */
window.ssSaveAll = async () => {
    const registered = await getAll('second_sitting_students',
        `class_id=eq.${_ssClassId}&academic_year_id=eq.${_ssYearId}`).catch(() => []);
    const subjects   = (state.subjects || []).filter(s => s.is_core !== false);
    let saved = 0;

    for (const r of registered) {
        const count = await _ssSaveForStudent(r.id, r.student_id, subjects);
        saved += count;
    }

    showToast(`${saved} score${saved !== 1 ? 's' : ''} saved.`, 'success');
    await _ssLoad();
};

async function _ssSaveForStudent(ssStudentId, studentId, subjects) {
    const now = new Date().toISOString().split('T')[0];
    let count = 0;

    for (const subj of subjects) {
        const inp = document.getElementById(`ss-${ssStudentId}-${subj.id}`);
        if (!inp || inp.value.trim() === '') continue;
        const pct = parseFloat(inp.value);
        if (isNaN(pct) || pct < 0 || pct > 100) continue;

        const payload = {
            second_sitting_student_id : ssStudentId,
            student_id                : studentId,
            subject_id                : subj.id,
            subject_name              : subj.name,
            academic_year_id          : _ssYearId,
            second_percentage         : pct,
            second_max_marks          : 100,
            passed                    : pct >= parseFloat(state.schoolSettings?.promotion_mark || '50'),
            entered_by                : state.currentUser?.id || null,
            recorded_at               : now,
            updated_at                : now,
        };

        // Upsert: check existing
        const existing = await getAll('second_sitting_marks',
            `second_sitting_student_id=eq.${ssStudentId}&subject_id=eq.${subj.id}&academic_year_id=eq.${_ssYearId}`
        ).catch(() => []);

        if (existing?.length) {
            await update('second_sitting_marks', existing[0].id, payload).catch(() => {});
        } else {
            payload.created_at = now;
            await insert('second_sitting_marks', payload).catch(() => {});
        }

        // Log
        if (typeof insert === 'function') {
            insert('system_logs', {
                action_type : 'second_sitting_mark',
                description : `2nd sitting ${pct}% — Student #${studentId}, ${subj.name}`,
                actor_id    : state.currentUser?.id || null,
                actor_name  : state.currentUser?.name || 'Unknown',
                created_at  : new Date().toISOString(),
                metadata    : JSON.stringify({ ssStudentId, studentId, subjectId: subj.id, pct }),
            }).catch(() => {});
        }
        count++;
    }

    // Update second_sitting_students status
    if (count > 0) {
        await update('second_sitting_students', ssStudentId, {
            status    : 'completed',
            second_sitting_completed: true,
            updated_at: new Date().toISOString(),
        }).catch(() => {});
    }

    return count;
}

window.renderSecondSitting = renderSecondSitting;
