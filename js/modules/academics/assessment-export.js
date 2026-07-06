export async function renderAssessmentExport(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="page-header"><h2>📤 Assessment Export</h2></div>
        <div class="empty-state">
            <div class="empty-icon">📤</div>
            <p>Assessment export module — coming soon.</p>
        </div>`;
}
