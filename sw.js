/* ==================================================================
   SERVICE WORKER — ECOLE LA FONTAINE v9.0
   ================================================================== */

const CACHE_NAME = 'ecole-cache-v9';
const OFFLINE_URL = '/offline.html';
const NOT_FOUND_URL = '/404.html';

// ── Assets to cache on install ──
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/offline.html',
    '/404.html',                    // ← ADDED!
    '/site.webmanifest',
    '/favicon.ico',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',

    // ── CSS ──
    '/css/main.css',
    '/css/base/variables.css',
    '/css/base/reset.css',
    '/css/base/typography.css',
    '/css/layouts/grid.css',
    '/css/layouts/spacing.css',
    '/css/layouts/positioning.css',
    '/css/components/buttons.css',
    '/css/components/cards.css',
    '/css/components/tables.css',
    '/css/components/forms.css',
    '/css/components/modals.css',
    '/css/components/badges.css',
    '/css/components/dropdown.css',
    '/css/components/tabs.css',
    '/css/components/pagination.css',
    '/css/components/alerts.css',
    '/css/components/toast.css',
    '/css/components/loaders.css',
    '/css/components/skeleton.css',
    '/css/components/sidebar.css',
    '/css/components/topbar.css',
    '/css/modules/login.css',
    '/css/modules/dashboard.css',
    '/css/modules/marks.css',
    '/css/modules/attendance.css',
    '/css/modules/finance.css',
    '/css/modules/reports.css',
    '/css/modules/timetable.css',
    '/css/modules/settings.css',
    '/css/modules/analytics.css',
    '/css/themes/light.css',
    '/css/themes/dark.css',

    // ── JavaScript ──
    '/js/main.js',
    '/js/config/constants.js',
    '/js/config/supabase-config.js',
    '/js/config/navigation.js',
    '/js/core/state.js',
    '/js/core/utils.js',
    '/js/core/api.js',
    '/js/core/formulas.js',
    '/js/core/fees.js',
    '/js/core/auth.js',
    '/js/core/boot.js',
    '/js/core/router.js',
    '/js/core/permissions.js',
    '/js/core/offline.js',
    '/js/core/notifications.js',
    '/js/ui/sidebar.js',
    '/js/ui/topbar.js',
    '/js/ui/theme.js',
    '/js/ui/modals.js',
    '/js/ui/toast.js',
    '/js/ui/charts.js',
    '/js/ui/shell.js',

    // ── Modules ── (all modules)
    '/js/modules/dashboard/admin-dashboard.js',
    '/js/modules/dashboard/teacher-dashboard.js',
    '/js/modules/dashboard/accountant-dashboard.js',
    '/js/modules/academics/marks-entry.js',
    '/js/modules/academics/marks-database.js',
    '/js/modules/academics/marks-analysis.js',
    '/js/modules/academics/marks-import-export.js',
    '/js/modules/academics/class-register.js',
    '/js/modules/academics/report-cards.js',
    '/js/modules/academics/transcripts.js',
    '/js/modules/academics/assessments.js',
    '/js/modules/academics/assessment-locking.js',
    '/js/modules/academics/annual-register.js',
    '/js/modules/students/student-list.js',
    '/js/modules/students/student-details.js',
    '/js/modules/students/enroll-student.js',
    '/js/modules/students/student-promotion.js',
    '/js/modules/students/student-archive.js',
    '/js/modules/students/family-management.js',
    '/js/modules/students/sibling-linking.js',
    '/js/modules/attendance/attendance-entry.js',
    '/js/modules/attendance/attendance-reports.js',
    '/js/modules/attendance/attendance-summary.js',
    '/js/modules/attendance/attendance-analytics.js',
    '/js/modules/finance/fee-structure.js',
    '/js/modules/finance/record-payment.js',
    '/js/modules/finance/payment-history.js',
    '/js/modules/finance/receipts.js',
    '/js/modules/finance/overdue-payments.js',
    '/js/modules/finance/fee-waivers.js',
    '/js/modules/finance/balances.js',
    '/js/modules/finance/payment-reversals.js',
    '/js/modules/finance/financial-reports.js',
    '/js/modules/finance/carry-forward.js',
    '/js/modules/finance/credit-balances.js',
    '/js/modules/finance/discounts.js',
    '/js/modules/staff/user-management.js',
    '/js/modules/staff/subjects.js',
    '/js/modules/staff/teacher-assignments.js',
    '/js/modules/staff/teacher-performance.js',
    '/js/modules/staff/timetable.js',
    '/js/modules/staff/timetable-conflicts.js',
    '/js/modules/settings/school-settings.js',
    '/js/modules/settings/academic-calendar.js',
    '/js/modules/settings/academic-years.js',
    '/js/modules/settings/class-management.js',
    '/js/modules/settings/grading-scale.js',
    '/js/modules/settings/backup-restore.js',
    '/js/modules/settings/system-logs.js',
    '/js/modules/settings/api-settings.js',
    '/js/modules/settings/settings.js',
    '/js/modules/communication/notifications.js',
    '/js/modules/communication/announcement-center.js',
    '/js/modules/communication/announcements.js',
    '/js/modules/communication/reminders.js',
    '/js/modules/bulk/bulk-import.js',
    '/js/modules/bulk/bulk-export.js',
    '/js/modules/analytics/analytics.js',
    '/js/modules/analytics/analytics-settings.js',
    '/js/modules/analytics/system-health.js',

    // ── Patches ──
    '/js/patches/missing-functions.js',
    '/js/patches/qr-code.js',

    // ── External Libraries ──
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
    'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap'
];

// ── Install Event ──
self.addEventListener('install', event => {
    console.log('[SW] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] All assets cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Install failed:', error);
            })
    );
});

// ── Activate Event ──
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');

    const cacheWhitelist = [CACHE_NAME];

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
            .then(() => {
                console.log('[SW] Claiming clients...');
                return self.clients.claim();
            })
            .then(() => {
                console.log('[SW] Activated successfully');
            })
    );
});

// ── Fetch Event ──
self.addEventListener('fetch', event => {
    const request = event.request;

    // Skip cross-origin requests (except CDN fonts and libraries)
    const url = new URL(request.url);
    if (url.origin !== self.location.origin && !url.hostname.includes('cdn')) {
        return;
    }

    // Skip POST, PUT, DELETE requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip browser extension requests
    if (request.url.includes('chrome-extension') || request.url.includes('moz-extension')) {
        return;
    }

    event.respondWith(
        caches.match(request)
            .then(response => {
                // Return cached response if found
                if (response) {
                    // Refresh cache in background for HTML pages
                    if (request.headers.get('accept')?.includes('text/html')) {
                        fetch(request)
                            .then(networkResponse => {
                                if (networkResponse.ok) {
                                    caches.open(CACHE_NAME)
                                        .then(cache => {
                                            cache.put(request, networkResponse);
                                        });
                                }
                            })
                            .catch(() => { });
                    }
                    return response;
                }

                // Otherwise fetch from network
                return fetch(request)
                    .then(networkResponse => {
                        // Cache successful responses
                        if (networkResponse.ok) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(request, responseClone);
                                })
                                .catch(() => { });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // If network fails and request is HTML, show offline page
                        if (request.headers.get('accept')?.includes('text/html')) {
                            return caches.match(OFFLINE_URL);
                        }
                        // For non-HTML, show 404 page
                        return caches.match(NOT_FOUND_URL) || new Response('Page not found', { status: 404 });
                    });
            })
    );
});

// ── Push Notification Event ──
self.addEventListener('push', event => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'ECOLE LA FONTAINE',
        body: 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        requireInteraction: true
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon || '/icons/icon-192x192.png',
            badge: data.badge || '/icons/badge-72x72.png',
            vibrate: data.vibrate || [200, 100, 200],
            requireInteraction: data.requireInteraction !== undefined ? data.requireInteraction : true,
            data: data.data || {},
            actions: data.actions || [
                { action: 'view', title: 'View' },
                { action: 'dismiss', title: 'Dismiss' }
            ]
        })
    );
});

// ── Notification Click Event ──
self.addEventListener('notificationclick', event => {
    event.notification.close();

    const action = event.action;
    const notificationData = event.notification.data || {};

    if (action === 'dismiss') {
        return;
    }

    const targetUrl = notificationData.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Check if there's already a window/tab open with the target URL
                for (const client of windowClients) {
                    if (client.url === targetUrl && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not, open a new window/tab
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});

// ── Background Sync Event ──
self.addEventListener('sync', event => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-offline-marks') {
        event.waitUntil(
            // Notify the app to sync marks
            self.clients.matchAll({ type: 'window' })
                .then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'SYNC_MARKS',
                            message: 'Background sync triggered'
                        });
                    });
                })
        );
    }
});

// ── Message Event ──
self.addEventListener('message', event => {
    console.log('[SW] Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME);
        console.log('[SW] Cache cleared');
    }

    if (event.data && event.data.type === 'REFRESH_CACHE') {
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] Cache refreshed');
            });
    }
});