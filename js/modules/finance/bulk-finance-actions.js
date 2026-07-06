export async function renderBulkFinanceActions(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="page-header"><h2>💰 Bulk Finance Actions</h2></div>
        <div class="empty-state">
            <div class="empty-icon">💰</div>
            <p>Bulk finance actions module — coming soon.</p>
        </div>`;
}
