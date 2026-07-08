/**
 * ECOLE LA FONTAINE — Card Animations
 * GSAP animations for premium cards
 * Last updated: 2026-07-07
 */

// ──────────────────────────────────────────────────────────────────────
// ANIMATE CARDS ON LOAD
// ──────────────────────────────────────────────────────────────────────

export function animateCards(container = document) {
    const cards = container.querySelectorAll('.card, .stat-card, .dash-card');
    if (!cards.length) return;

    // Check if GSAP is loaded
    if (typeof window.gsap === 'undefined') {
        console.warn('[Cards] GSAP not loaded — using fallback');
        // Fallback: simple CSS transitions
        cards.forEach(card => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });
        return;
    }

    const gsap = window.gsap;

    // Staggered entrance animation
    gsap.fromTo(cards,
        {
            y: 30,
            opacity: 0,
            scale: 0.97,
        },
        {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.6,
            ease: 'power2.out',
            stagger: 0.06,
            clearProps: 'transform',
        }
    );

    // Animate progress bars
    cards.forEach((card, index) => {
        const fill = card.querySelector('.progress-fill');
        if (fill && fill.dataset.target) {
            const target = parseFloat(fill.dataset.target) || 0;
            gsap.to(fill, {
                width: target + '%',
                duration: 1.2,
                ease: 'power2.out',
                delay: 0.3 + index * 0.05,
            });
        }
    });

    // Animate card values (counters)
    cards.forEach((card, index) => {
        const valueEl = card.querySelector('.card-value');
        if (valueEl && card.dataset.count) {
            const target = parseFloat(card.dataset.count);
            const isFloat = target % 1 !== 0;
            const suffix = valueEl.querySelector('.suffix')?.textContent || '';

            // Store original text
            const originalText = valueEl.textContent;

            gsap.fromTo(valueEl,
                { textContent: 0 },
                {
                    textContent: target,
                    duration: 1.8,
                    ease: 'power2.out',
                    delay: 0.2 + index * 0.05,
                    snap: { textContent: isFloat ? 0.1 : 1 },
                    onUpdate: function () {
                        const val = parseFloat(valueEl.textContent);
                        if (!isNaN(val)) {
                            const display = isFloat ? val.toFixed(1) : Math.round(val);
                            // Preserve suffix
                            const suffixMatch = originalText.match(/[^\d.]*$/);
                            const suffixText = suffixMatch ? suffixMatch[0] : suffix;
                            valueEl.textContent = display + suffixText;
                        }
                    }
                }
            );
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// ACTIVATE CARD ON CLICK
// ──────────────────────────────────────────────────────────────────────

export function setupCardClickEffects(container = document) {
    container.querySelectorAll('.card, .stat-card').forEach(card => {
        card.addEventListener('click', function (e) {
            // Toggle active state
            const wasActive = this.classList.contains('active');

            // Deactivate all cards in this container
            const siblings = this.closest('.stats-grid')?.querySelectorAll('.card.active, .stat-card.active') || [];
            siblings.forEach(c => c.classList.remove('active'));

            // Activate this card (toggle)
            if (!wasActive) {
                this.classList.add('active');
            }

            // Ripple effect
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const ripple = document.createElement('div');
            ripple.className = 'ripple';
            const size = Math.min(rect.width, rect.height) * 0.6;
            ripple.style.width = size + 'px';
            ripple.style.height = size + 'px';
            ripple.style.left = (x - size / 2) + 'px';
            ripple.style.top = (y - size / 2) + 'px';
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 800);
        });
    });
}

// ──────────────────────────────────────────────────────────────────────
// SET CARD THEME
// ──────────────────────────────────────────────────────────────────────

export function setCardTheme(theme) {
    const themes = ['sapphire', 'emerald', 'purple', 'gold', 'ruby', 'cyan', 'obsidian', 'rosegold'];

    document.querySelectorAll('.card, .stat-card').forEach(card => {
        // Remove all theme classes
        themes.forEach(t => card.classList.remove(t));
        // Add the selected theme
        card.classList.add(theme);
        card.dataset.theme = theme;
    });
}

// ──────────────────────────────────────────────────────────────────────
// INIT CARDS
// ──────────────────────────────────────────────────────────────────────

export function initCards(container) {
    animateCards(container);
    setupCardClickEffects(container);
}

// ──────────────────────────────────────────────────────────────────────
// EXPOSE GLOBALLY
// ──────────────────────────────────────────────────────────────────────

window.animateCards = animateCards;
window.setupCardClickEffects = setupCardClickEffects;
window.setCardTheme = setCardTheme;
window.initCards = initCards;

console.log('✅ Card animations loaded');