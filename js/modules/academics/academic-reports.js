export async function renderAcademicReports(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="page-header"><h2>📊 Academic Reports</h2></div>
        <div class="empty-state">
            <div class="empty-icon">📊</div>
            <p>Academic reports module — coming soon.</p>
        </div>`;
}
