/* ═══════════════════════════════════════════════════════════════════
   js/modules/students/enroll-student.js
   ═══════════════════════════════════════════════════════════════════
   Four-step enrollment wizard with fee assignment and payment
   recording. Renders into the main content container.

   Dependencies (all plain-script globals loaded earlier in index.html, no import needed):
   - utils.js: esc, fmtCurrency, debounce
   - api.js: insert, update  ('get' was imported previously but never used — removed)
   - toast.js: showToast
   - router.js: navigateTo (NOTE: core/router.js is currently an empty file —
     navigateTo() will be undefined until it's written; not part of this fix)
   - modals.js: confirmDialog
   - loaders.js: window.Loaders.button.start/stop (see fix below —
     this file previously called a non-existent buttonLoader() function)
   - state.js: state
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Constants ───────────────────────────────────────────────────── */

const CLASS_LEVELS = {
    nursery: ['NURSERY 1', 'NURSERY 2', 'NURSERY 3'],
    primary: ['PRIMARY 1', 'PRIMARY 2', 'PRIMARY 3', 'PRIMARY 4', 'PRIMARY 5', 'PRIMARY 6']
};

/* ─── Module State ────────────────────────────────────────────────── */

const enrollState = {
    step: 1,
    data: {
        firstName: '',
        lastName: '',
        dob: '',
        gender: '',
        classId: '',
        guardianName: '',
        guardianPhone: '',
        guardianEmail: '',
        guardianAddress: '',
        linkedFamily: null,
        feeSelections: {}
    }
};

/* ─── Helpers ─────────────────────────────────────────────────────── */

function getLevelForClass(classId) {
    const allNursery = CLASS_LEVELS.nursery;
    const allPrimary = CLASS_LEVELS.primary;
    if (allNursery.includes(classId)) return 'nursery';
    if (allPrimary.includes(classId)) return 'primary';
    return 'primary';
}

function generateStudentCode() {
    const year = new Date().getFullYear();
    const count = (state.students || []).filter(s => s.status === 'Active').length + 1;
    return `STU-${year}-${String(count).padStart(4, '0')}`;
}

function getDefaultFeesForLevel(level) {
    // Query the fee_categories table for the given level
    // For now, return a fallback structure
    const fees = (state.feeCategories || [])
        .filter(c => c.level === level && c.is_active !== false)
        .map(c => ({
            id: c.id,
            name: c.name,
            amount: c.default_amount || 0
        }));

    if (fees.length === 0) {
        // Fallback defaults
        if (level === 'nursery') {
            return [
                { id: 'fallback-tuition', name: 'Tuition', amount: 60000 },
                { id: 'fallback-uniform', name: 'Uniform', amount: 25000 },
                { id: 'fallback-materials', name: 'Books & Materials', amount: 15000 }
            ];
        }
        return [
            { id: 'fallback-tuition', name: 'Tuition', amount: 80000 },
            { id: 'fallback-uniform', name: 'Uniform', amount: 25000 },
            { id: 'fallback-materials', name: 'Books & Materials', amount: 18000 },
            { id: 'fallback-transport', name: 'Transport', amount: 30000 }
        ];
    }
    return fees;
}

/* ─── Step Labels ──────────────────────────────────────────────────── */

const STEP_LABELS = [
    'Basic Information',
    'Family & Guardian',
    'Fee Assignment',
    'Review & Confirm'
];

/* ─── Main Render ──────────────────────────────────────────────────── */

function renderEnrollStudent(container) {
    if (!container) return;
    enrollState.step = 1;
    enrollState.data = {
        firstName: '',
        lastName: '',
        dob: '',
        gender: '',
        classId: '',
        guardianName: '',
        guardianPhone: '',
        guardianEmail: '',
        guardianAddress: '',
        linkedFamily: null,
        feeSelections: {}
    };

    container.innerHTML = `
        <div class="enroll-wizard">
            <div class="enroll-wizard__header">
                <h2>Enroll New Student</h2>
                <p class="text-muted">Complete all steps to enroll a new student</p>
            </div>
            <div class="enroll-steps" id="enroll-steps"></div>
            <div class="enroll-form-panel" id="enroll-panel"></div>
        </div>
    `;

    renderSteps(container);
    renderStepContent(container);
}

function renderSteps(container) {
    const el = container.querySelector('#enroll-steps');
    if (!el) return;

    el.innerHTML = STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const isActive = num === enrollState.step;
        const isDone = num < enrollState.step;

        let statusClass = 'enroll-step';
        if (isDone) statusClass += ' enroll-step--done';
        if (isActive) statusClass += ' enroll-step--active';

        const circleContent = isDone ? '<span class="enroll-step__check">✓</span>' : `<span class="enroll-step__number">${num}</span>`;

        return `
            <div class="${statusClass}" data-step="${num}">
                <div class="enroll-step__circle">${circleContent}</div>
                <div class="enroll-step__label">${label}</div>
                ${num < STEP_LABELS.length ? `<div class="enroll-step__connector ${isDone ? 'enroll-step__connector--done' : ''}"></div>` : ''}
            </div>
        `;
    }).join('');
}

function renderStepContent(container) {
    const panel = container.querySelector('#enroll-panel');
    if (!panel) return;

    switch (enrollState.step) {
        case 1: renderStep1(panel, container); break;
        case 2: renderStep2(panel, container); break;
        case 3: renderStep3(panel, container); break;
        case 4: renderStep4(panel, container); break;
        default: break;
    }
}

function goToStep(container, step) {
    if (step < 1 || step > 4) return;
    enrollState.step = step;
    renderSteps(container);
    renderStepContent(container);

    // Scroll to top of panel
    const panel = container.querySelector('#enroll-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── Step 1: Basic Information ───────────────────────────────────── */

function renderStep1(panel, container) {
    const d = enrollState.data;

    panel.innerHTML = `
        <div class="enroll-form-section">
            <h3 class="enroll-form-section__title">Basic Information</h3>
            <p class="enroll-form-section__subtitle">Enter the student's personal details</p>
        </div>

        <div class="enroll-form-grid">
            <div class="form-group">
                <label for="enroll-first-name">First Name <span class="required">*</span></label>
                <input type="text" id="enroll-first-name" class="form-input" value="${esc(d.firstName)}" placeholder="e.g. Eric" />
                <div class="form-hint"></div>
            </div>

            <div class="form-group">
                <label for="enroll-last-name">Last Name <span class="required">*</span></label>
                <input type="text" id="enroll-last-name" class="form-input" value="${esc(d.lastName)}" placeholder="e.g. Habimana" />
                <div class="form-hint"></div>
            </div>

            <div class="form-group">
                <label for="enroll-dob">Date of Birth <span class="required">*</span></label>
                <input type="date" id="enroll-dob" class="form-input" value="${d.dob}" />
                <div class="form-hint"></div>
            </div>

            <div class="form-group">
                <label>Gender <span class="required">*</span></label>
                <div class="radio-group">
                    <label class="radio-label">
                        <input type="radio" name="enroll-gender" value="Male" ${d.gender === 'Male' ? 'checked' : ''} />
                        <span class="radio-label__text">Male</span>
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="enroll-gender" value="Female" ${d.gender === 'Female' ? 'checked' : ''} />
                        <span class="radio-label__text">Female</span>
                    </label>
                </div>
                <div class="form-hint"></div>
            </div>

            <div class="form-group form-group--full">
                <label for="enroll-class">Class <span class="required">*</span></label>
                <select id="enroll-class" class="form-select">
                    <option value="">Select a class...</option>
                    <optgroup label="Nursery">
                        ${CLASS_LEVELS.nursery.map(c => `<option value="${c}" ${d.classId === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </optgroup>
                    <optgroup label="Primary">
                        ${CLASS_LEVELS.primary.map(c => `<option value="${c}" ${d.classId === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </optgroup>
                </select>
                <div class="form-hint"></div>
            </div>
        </div>

        <div class="enroll-actions">
            <button class="btn btn-primary" id="enroll-step1-next">
                Continue <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    `;

    const nextBtn = panel.querySelector('#enroll-step1-next');
    nextBtn.addEventListener('click', () => {
        const firstName = panel.querySelector('#enroll-first-name').value.trim();
        const lastName = panel.querySelector('#enroll-last-name').value.trim();
        const dob = panel.querySelector('#enroll-dob').value;
        const gender = panel.querySelector('input[name="enroll-gender"]:checked')?.value || '';
        const classId = panel.querySelector('#enroll-class').value;

        // Validate
        if (!firstName) {
            showToast('First name is required', 'warning');
            return;
        }
        if (!lastName) {
            showToast('Last name is required', 'warning');
            return;
        }
        if (!dob) {
            showToast('Date of birth is required', 'warning');
            return;
        }
        if (!gender) {
            showToast('Please select a gender', 'warning');
            return;
        }
        if (!classId) {
            showToast('Please select a class', 'warning');
            return;
        }

        d.firstName = firstName;
        d.lastName = lastName;
        d.dob = dob;
        d.gender = gender;
        d.classId = classId;

        goToStep(container, 2);
    });

    // Enter key support
    panel.querySelector('#enroll-first-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nextBtn.click();
    });
    panel.querySelector('#enroll-last-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nextBtn.click();
    });
    panel.querySelector('#enroll-dob').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nextBtn.click();
    });
}

/* ─── Step 2: Family & Guardian ───────────────────────────────────── */

function renderStep2(panel, container) {
    const d = enrollState.data;
    const hasFamily = !!d.linkedFamily;

    panel.innerHTML = `
        <div class="enroll-form-section">
            <h3 class="enroll-form-section__title">Family &amp; Guardian</h3>
            <p class="enroll-form-section__subtitle">Link to an existing family or create a new one</p>
        </div>

        ${hasFamily ? `
            <div class="enroll-family-badge">
                <div class="enroll-family-badge__icon">
                    <i class="fa-solid fa-house-chimney-user"></i>
                </div>
                <div class="enroll-family-badge__info">
                    <div class="enroll-family-badge__name">Linked to ${esc(d.linkedFamily.name)}</div>
                    <div class="enroll-family-badge__sub">Sibling of an existing student — family discounts may apply</div>
                </div>
                <button class="btn btn-sm btn-outline-danger" id="enroll-unlink-family">
                    <i class="fa-solid fa-unlink"></i> Unlink
                </button>
            </div>
        ` : `
            <button class="btn btn-outline" id="enroll-link-sibling" style="margin-bottom:20px;">
                <i class="fa-solid fa-link"></i> This student has a sibling already enrolled
            </button>
        `}

        <div class="enroll-form-grid">
            <div class="form-group form-group--full">
                <label for="enroll-guardian-name">Guardian Full Name <span class="required">*</span></label>
                <input type="text" id="enroll-guardian-name" class="form-input" value="${esc(d.guardianName)}" placeholder="e.g. HABIMANA Grace" />
                <div class="form-hint"></div>
            </div>

            <div class="form-group">
                <label for="enroll-guardian-phone">Guardian Phone <span class="required">*</span></label>
                <input type="tel" id="enroll-guardian-phone" class="form-input" value="${esc(d.guardianPhone)}" placeholder="+250 788 534 320" />
                <div class="form-hint"></div>
            </div>

            <div class="form-group">
                <label for="enroll-guardian-email">Guardian Email</label>
                <input type="email" id="enroll-guardian-email" class="form-input" value="${esc(d.guardianEmail)}" placeholder="guardian@email.com" />
                <div class="form-hint"></div>
            </div>

            <div class="form-group form-group--full">
                <label for="enroll-guardian-address">Address</label>
                <input type="text" id="enroll-guardian-address" class="form-input" value="${esc(d.guardianAddress)}" placeholder="e.g. Kigali, Rwanda" />
                <div class="form-hint"></div>
            </div>
        </div>

        <div class="enroll-actions">
            <button class="btn btn-outline" id="enroll-step2-back">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>
            <button class="btn btn-primary" id="enroll-step2-next">
                Continue <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    `;

    // Link sibling button
    const linkBtn = panel.querySelector('#enroll-link-sibling');
    if (linkBtn) {
        linkBtn.addEventListener('click', () => {
            // Open sibling search modal
            const modalContent = `
                <div class="modal-body">
                    <div class="form-group">
                        <label>Search for a student</label>
                        <input type="text" id="sibling-search" class="form-input" placeholder="Search by name or code..." />
                        <div class="form-hint">Search for an existing student to link as a sibling</div>
                    </div>
                    <div id="sibling-results" style="margin-top:16px; max-height:300px; overflow-y:auto;">
                        <div class="text-muted" style="text-align:center; padding:20px;">Type to search for students</div>
                    </div>
                </div>
            `;

            const modalId = 'sibling-link-modal';
            const modalHtml = `
                <div class="modal-overlay" id="${modalId}">
                    <div class="modal modal-sm">
                        <div class="modal-header">
                            <h3>Link Sibling</h3>
                            <button class="modal-close" data-close-modal="${modalId}">✕</button>
                        </div>
                        ${modalContent}
                        <div class="modal-footer">
                            <button class="btn btn-outline" data-close-modal="${modalId}">Cancel</button>
                        </div>
                    </div>
                </div>
            `;

            // Show modal
            const modalsContainer = document.getElementById('modals-container');
            if (modalsContainer) {
                modalsContainer.innerHTML = modalHtml;

                const searchInput = document.getElementById('sibling-search');
                const resultsContainer = document.getElementById('sibling-results');

                const performSearch = debounce((query) => {
                    if (!query || query.length < 2) {
                        resultsContainer.innerHTML = `<div class="text-muted" style="text-align:center; padding:20px;">Type at least 2 characters to search</div>`;
                        return;
                    }

                    const students = (state.students || [])
                        .filter(s => s.status === 'Active' && !s.is_deleted)
                        .filter(s => {
                            const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
                            const code = (s.student_code || '').toLowerCase();
                            const q = query.toLowerCase();
                            return fullName.includes(q) || code.includes(q);
                        })
                        .slice(0, 10);

                    if (students.length === 0) {
                        resultsContainer.innerHTML = `<div class="text-muted" style="text-align:center; padding:20px;">No students found</div>`;
                        return;
                    }

                    resultsContainer.innerHTML = students.map(s => `
                        <div class="sibling-result-item" data-student-id="${s.id}" data-family-id="${s.family_id || ''}" data-name="${esc(s.first_name)} ${esc(s.last_name)}">
                            <div class="sibling-result-item__info">
                                <div class="sibling-result-item__name">${esc(s.first_name)} ${esc(s.last_name)}</div>
                                <div class="sibling-result-item__sub">${esc(s.student_code || '')} · ${esc((state.classes || []).find(c => c.id === s.class_id)?.name || '')}</div>
                            </div>
                            ${s.family_id ? '<span class="badge badge-info">Has Family</span>' : '<span class="badge badge-neutral">No Family</span>'}
                        </div>
                    `).join('');

                    // Click handler for results
                    resultsContainer.querySelectorAll('.sibling-result-item').forEach(el => {
                        el.addEventListener('click', () => {
                            const familyId = el.dataset.familyId;
                            const name = el.dataset.name;

                            if (familyId) {
                                // Link to existing family
                                enrollState.data.linkedFamily = { id: familyId, name: `${name}'s Family` };
                            } else {
                                // Create new family with this student's guardian
                                const studentId = parseInt(el.dataset.studentId);
                                const student = state.students.find(s => s.id === studentId);
                                if (student) {
                                    enrollState.data.linkedFamily = {
                                        id: `NEW-${studentId}`,
                                        name: `${student.guardian_name || 'Family'} (from ${student.first_name} ${student.last_name})`
                                    };
                                    // Pre-fill guardian info
                                    if (!enrollState.data.guardianName) {
                                        enrollState.data.guardianName = student.guardian_name || '';
                                    }
                                    if (!enrollState.data.guardianPhone) {
                                        enrollState.data.guardianPhone = student.guardian_phone || '';
                                    }
                                    if (!enrollState.data.guardianEmail) {
                                        enrollState.data.guardianEmail = student.guardian_email || '';
                                    }
                                    if (!enrollState.data.guardianAddress) {
                                        enrollState.data.guardianAddress = student.address || '';
                                    }
                                }
                            }

                            // Close modal and re-render step
                            const modal = document.getElementById(modalId);
                            if (modal) modal.remove();
                            renderStep2(panel, container);
                            showToast('Sibling linked successfully', 'success');
                        });
                    });
                }, 300);

                searchInput.addEventListener('input', (e) => {
                    performSearch(e.target.value);
                });

                searchInput.focus();
            }
        });
    }

    // Unlink family button
    const unlinkBtn = panel.querySelector('#enroll-unlink-family');
    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', () => {
            enrollState.data.linkedFamily = null;
            renderStep2(panel, container);
            showToast('Family unlinked', 'info');
        });
    }

    // Back button
    panel.querySelector('#enroll-step2-back').addEventListener('click', () => {
        goToStep(container, 1);
    });

    // Next button
    panel.querySelector('#enroll-step2-next').addEventListener('click', () => {
        const guardianName = panel.querySelector('#enroll-guardian-name').value.trim();
        const guardianPhone = panel.querySelector('#enroll-guardian-phone').value.trim();
        const guardianEmail = panel.querySelector('#enroll-guardian-email').value.trim();
        const guardianAddress = panel.querySelector('#enroll-guardian-address').value.trim();

        if (!guardianName) {
            showToast('Guardian name is required', 'warning');
            return;
        }
        if (!guardianPhone) {
            showToast('Guardian phone is required', 'warning');
            return;
        }
        if (guardianEmail && !guardianEmail.includes('@')) {
            showToast('Please enter a valid email address', 'warning');
            return;
        }

        enrollState.data.guardianName = guardianName;
        enrollState.data.guardianPhone = guardianPhone;
        enrollState.data.guardianEmail = guardianEmail;
        enrollState.data.guardianAddress = guardianAddress;

        goToStep(container, 3);
    });
}

/* ─── Step 3: Fee Assignment ──────────────────────────────────────── */

function renderStep3(panel, container) {
    const d = enrollState.data;
    const level = getLevelForClass(d.classId);
    const fees = getDefaultFeesForLevel(level);

    // Initialize fee selections
    fees.forEach(f => {
        if (!d.feeSelections[f.id]) {
            d.feeSelections[f.id] = { checked: true, amountPaid: 0 };
        }
    });

    function recalcTotal() {
        const total = fees.reduce((sum, f) => {
            const sel = d.feeSelections[f.id];
            return sum + (sel.checked ? (sel.amountPaid || 0) : 0);
        }, 0);
        const totalEl = panel.querySelector('#fee-running-total');
        if (totalEl) totalEl.textContent = fmtCurrency(total);
        return total;
    }

    function renderFees() {
        const list = panel.querySelector('#fee-select-list');
        if (!list) return;

        list.innerHTML = fees.map(f => {
            const sel = d.feeSelections[f.id];
            const isChecked = sel?.checked !== false;
            return `
                <div class="payment-category-item ${isChecked ? 'payment-category-item--checked' : ''}" data-fee-id="${f.id}">
                    <label class="payment-category-item__checkbox-wrap">
                        <input type="checkbox" class="payment-category-item__checkbox" data-fee-check="${f.id}" ${isChecked ? 'checked' : ''} />
                        <span class="payment-category-item__custom-checkbox"></span>
                    </label>
                    <div class="payment-category-item__info">
                        <div class="payment-category-item__name">${esc(f.name)}</div>
                        <div class="payment-category-item__total">Total: <strong>${fmtCurrency(f.amount)}</strong></div>
                    </div>
                    <div class="payment-category-item__amount-wrap ${isChecked ? '' : 'payment-category-item__amount-wrap--disabled'}">
                        <span class="payment-category-item__currency">RWF</span>
                        <input type="text" class="payment-category-item__amount-input" data-fee-amount="${f.id}" placeholder="0" value="${sel?.amountPaid || ''}" ${isChecked ? '' : 'disabled'} />
                    </div>
                    <button class="btn btn-xs btn-outline payment-category-item__max-btn" data-fee-max="${f.id}">Full</button>
                </div>
            `;
        }).join('');
        recalcTotal();

        // Event listeners
        list.querySelectorAll('[data-fee-check]').forEach(cb => {
            cb.addEventListener('change', () => {
                const feeId = cb.dataset.feeCheck;
                const checked = cb.checked;
                d.feeSelections[feeId].checked = checked;

                const row = list.querySelector(`[data-fee-id="${feeId}"]`);
                const amountInput = row.querySelector('[data-fee-amount]');
                const amountWrap = row.querySelector('.payment-category-item__amount-wrap');

                row.classList.toggle('payment-category-item--checked', checked);
                amountWrap.classList.toggle('payment-category-item__amount-wrap--disabled', !checked);
                amountInput.disabled = !checked;

                if (!checked) {
                    d.feeSelections[feeId].amountPaid = 0;
                    amountInput.value = '';
                }

                recalcTotal();
            });
        });

        list.querySelectorAll('[data-fee-amount]').forEach(input => {
            // Format as currency on blur
            input.addEventListener('blur', () => {
                const raw = input.value.replace(/,/g, '');
                const num = parseInt(raw) || 0;
                const feeId = input.dataset.feeAmount;
                d.feeSelections[feeId].amountPaid = num;
                if (num > 0) {
                    input.value = num.toLocaleString();
                } else {
                    input.value = '';
                }
                recalcTotal();
            });

            // Allow only numbers
            input.addEventListener('input', () => {
                input.value = input.value.replace(/[^0-9]/g, '');
            });

            // Select all on focus
            input.addEventListener('focus', () => {
                input.select();
            });
        });

        list.querySelectorAll('[data-fee-max]').forEach(btn => {
            btn.addEventListener('click', () => {
                const feeId = btn.dataset.feeMax;
                const fee = fees.find(f => f.id === feeId);
                if (!fee) return;

                const amountInput = list.querySelector(`[data-fee-amount="${feeId}"]`);
                const checkbox = list.querySelector(`[data-fee-check="${feeId}"]`);

                // Ensure checked
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change'));
                }

                d.feeSelections[feeId].amountPaid = fee.amount;
                amountInput.value = fee.amount.toLocaleString();
                recalcTotal();
            });
        });
    }

    panel.innerHTML = `
        <div class="enroll-form-section">
            <h3 class="enroll-form-section__title">Fee Assignment</h3>
            <p class="enroll-form-section__subtitle">Select fees to apply and enter any amount being paid today</p>
        </div>

        <div class="payment-category-select" id="fee-select-list"></div>

        <div class="payment-total-bar">
            <span class="payment-total-bar__label">Total being paid today</span>
            <span class="payment-total-bar__value" id="fee-running-total">0 RWF</span>
        </div>

        <div class="enroll-actions">
            <button class="btn btn-outline" id="enroll-step3-back">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>
            <button class="btn btn-primary" id="enroll-step3-next">
                Continue <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    `;

    renderFees();

    panel.querySelector('#enroll-step3-back').addEventListener('click', () => {
        goToStep(container, 2);
    });

    panel.querySelector('#enroll-step3-next').addEventListener('click', () => {
        goToStep(container, 4);
    });
}

/* ─── Step 4: Review & Confirm ────────────────────────────────────── */

function renderStep4(panel, container) {
    const d = enrollState.data;
    const level = getLevelForClass(d.classId);
    const fees = getDefaultFeesForLevel(level);

    const totalAssigned = fees.reduce((sum, f) => {
        const sel = d.feeSelections[f.id];
        return sum + (sel?.checked ? f.amount : 0);
    }, 0);

    const totalPaidToday = fees.reduce((sum, f) => {
        const sel = d.feeSelections[f.id];
        return sum + (sel?.checked ? (sel.amountPaid || 0) : 0);
    }, 0);

    const remaining = totalAssigned - totalPaidToday;
    const studentCode = generateStudentCode();

    const feeRows = fees.map(f => {
        const sel = d.feeSelections[f.id];
        if (!sel?.checked) return '';
        const paid = sel.amountPaid || 0;
        const due = f.amount - paid;
        return `
            <tr>
                <td>${esc(f.name)}</td>
                <td style="text-align:right;">${fmtCurrency(f.amount)}</td>
                <td style="text-align:right;color:var(--success);">${fmtCurrency(paid)}</td>
                <td style="text-align:right;${due > 0 ? 'color:var(--danger);' : ''}">${fmtCurrency(due)}</td>
            </tr>
        `;
    }).filter(Boolean).join('');

    panel.innerHTML = `
        <div class="enroll-form-section">
            <h3 class="enroll-form-section__title">Review &amp; Confirm</h3>
            <p class="enroll-form-section__subtitle">Verify all information before enrolling</p>
        </div>

        <div class="enroll-review-grid">
            <div class="enroll-review-group">
                <div class="enroll-review-group__title">Student Information</div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Student Code</span>
                    <span class="enroll-review-item__value">${esc(studentCode)}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Full Name</span>
                    <span class="enroll-review-item__value">${esc(d.firstName)} ${esc(d.lastName)}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Date of Birth</span>
                    <span class="enroll-review-item__value">${d.dob}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Gender</span>
                    <span class="enroll-review-item__value">${d.gender === 'Male' ? 'Male' : 'Female'}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Class</span>
                    <span class="enroll-review-item__value">${esc(d.classId)}</span>
                </div>
            </div>

            <div class="enroll-review-group">
                <div class="enroll-review-group__title">Guardian Information</div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Guardian Name</span>
                    <span class="enroll-review-item__value">${esc(d.guardianName)}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Phone</span>
                    <span class="enroll-review-item__value">${esc(d.guardianPhone)}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Email</span>
                    <span class="enroll-review-item__value">${esc(d.guardianEmail) || '—'}</span>
                </div>
                <div class="enroll-review-item">
                    <span class="enroll-review-item__label">Family</span>
                    <span class="enroll-review-item__value">${d.linkedFamily ? esc(d.linkedFamily.name) : 'New Family'}</span>
                </div>
            </div>
        </div>

        <div class="enroll-review-fees">
            <div class="enroll-review-fees__title">Fee Summary</div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Fee Category</th>
                            <th style="text-align:right;">Total</th>
                            <th style="text-align:right;">Paid Today</th>
                            <th style="text-align:right;">Remaining</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${feeRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No fees selected</td></tr>'}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:700;background:var(--bg-tertiary);">
                            <td>TOTALS</td>
                            <td style="text-align:right;">${fmtCurrency(totalAssigned)}</td>
                            <td style="text-align:right;color:var(--success);">${fmtCurrency(totalPaidToday)}</td>
                            <td style="text-align:right;${remaining > 0 ? 'color:var(--danger);' : ''}">${fmtCurrency(remaining)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <div class="enroll-actions">
            <button class="btn btn-outline" id="enroll-step4-back">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>
            <button class="btn btn-success" id="enroll-step4-confirm">
                <i class="fa-solid fa-check"></i> Enroll Student
            </button>
        </div>
    `;

    panel.querySelector('#enroll-step4-back').addEventListener('click', () => {
        goToStep(container, 3);
    });

    panel.querySelector('#enroll-step4-confirm').addEventListener('click', async () => {
        const btn = panel.querySelector('#enroll-step4-confirm');
        window.Loaders.button.start(btn, 'Enrolling...');

        try {
            // 1. Create student record
            const studentPayload = {
                first_name: d.firstName,
                last_name: d.lastName,
                date_of_birth: d.dob,
                gender: d.gender,
                class_id: d.classId,
                student_code: studentCode,
                guardian_name: d.guardianName,
                guardian_phone: d.guardianPhone,
                guardian_email: d.guardianEmail || null,
                address: d.guardianAddress || null,
                status: 'Active',
                is_deleted: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // If linked family exists, use it
            if (d.linkedFamily && !d.linkedFamily.id.startsWith('NEW-')) {
                studentPayload.family_id = d.linkedFamily.id;
            }

            const studentResult = await insert('students', studentPayload);
            if (!studentResult) throw new Error('Failed to create student record');
            const studentId = studentResult.id;

            // 2. Create family if needed
            let familyId = d.linkedFamily?.id;
            if (d.linkedFamily && d.linkedFamily.id.startsWith('NEW-')) {
                const familyPayload = {
                    family_code: `FAM-${new Date().getFullYear()}-${String(studentId).padStart(4, '0')}`,
                    guardian_name: d.guardianName,
                    guardian_phone: d.guardianPhone,
                    guardian_email: d.guardianEmail || null,
                    address: d.guardianAddress || null,
                    created_at: new Date().toISOString()
                };
                const familyResult = await insert('families', familyPayload);
                if (familyResult) {
                    familyId = familyResult.id;
                    await update('students', studentId, { family_id: familyId });
                }
            }

            // 3. Create fee assignments
            const feeCategoryIds = [];
            for (const fee of fees) {
                const sel = d.feeSelections[fee.id];
                if (!sel?.checked) continue;

                // Check if fee is a real category ID or a fallback
                const isRealCategory = !fee.id.startsWith('fallback-');
                let categoryId = isRealCategory ? fee.id : null;

                // If fallback, try to find matching category or create one
                if (!isRealCategory) {
                    const existing = (state.feeCategories || []).find(c => c.name === fee.name);
                    if (existing) {
                        categoryId = existing.id;
                    } else {
                        // Create it
                        const newCat = await insert('fee_categories', {
                            name: fee.name,
                            level: level,
                            default_amount: fee.amount,
                            is_active: true,
                            created_at: new Date().toISOString()
                        });
                        if (newCat) categoryId = newCat.id;
                    }
                }

                if (!categoryId) continue;

                const feePayload = {
                    student_id: studentId,
                    fee_category_id: categoryId,
                    term_id: state.currentTerm?.id || null,
                    academic_year_id: state.currentAcadYear?.id || null,
                    amount: fee.amount,
                    paid_amount: sel.amountPaid || 0,
                    is_paid: (sel.amountPaid || 0) >= fee.amount,
                    is_waived: false,
                    due_date: state.currentTerm?.end_date || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                await insert('student_fees', feePayload);
                feeCategoryIds.push(categoryId);
            }

            // 4. Record payment if any amount was paid today
            if (totalPaidToday > 0) {
                const receiptNumber = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String((state.payments?.length || 0) + 1).padStart(4, '0')}`;

                const paymentPayload = {
                    student_id: studentId,
                    amount: totalPaidToday,
                    payment_date: new Date().toISOString().slice(0, 10),
                    payment_method: 'Cash',
                    receipt_number: receiptNumber,
                    notes: `Initial enrollment payment for ${d.firstName} ${d.lastName}`,
                    recorded_by: state.currentUser?.id || null,
                    created_at: new Date().toISOString()
                };

                await insert('payments', paymentPayload);
            }

            // 5. Update state and navigate
            await loadInitialData();
            showToast('Student enrolled successfully!', 'success', `${d.firstName} ${d.lastName} (${studentCode})`);
            navigateTo('student-list');

        } catch (error) {
            console.error('[EnrollStudent] Error:', error);
            showToast('Enrollment failed', 'error', error.message || 'Please try again.');
        } finally {
            window.Loaders.button.stop(btn);
        }
    });
}

/* ─── Export ───────────────────────────────────────────────────────── */

function render(container) {
    renderEnrollStudent(container);
}

window.renderEnrollStudent = renderEnrollStudent;
window.EnrollStudent = { render };