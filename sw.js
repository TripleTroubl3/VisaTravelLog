self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open('visa-tracker-v1').then((cache) => {
            return cache.addAll([
                '/',
                'index.html',
                'countries.geojson',
                'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
                'https://unpkg.com/@turf/turf@6/turf.min.js',
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'periodic-log') {
        event.waitUntil(performDailyLog());
    }
});

async function performDailyLog() {
    try {
        // Check last log time
        const lastLogTime = parseInt(localStorage.getItem('lastLogTime') || '0');
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (now - lastLogTime > oneDay) {
            await self.registration.showNotification('Visa Tracker', {
                body: 'No location logged in over 24 hours. Open the app to log your location.',
                icon: 'icon.png',
            });
        }

        // Send message to main thread to perform logging
        await new Promise((resolve, reject) => {
            const channel = new BroadcastChannel('visa-tracker-channel');
            channel.postMessage({ action: 'logLocation' });

            channel.onmessage = (event) => {
                if (event.data.action === 'logLocationResult') {
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                    } else {
                        resolve();
                    }
                    channel.close();
                }
            };
        });

        // Check visa limits for notifications
        await new Promise((resolve, reject) => {
            const channel = new BroadcastChannel('visa-tracker-channel');
            channel.postMessage({ action: 'checkVisaLimits' });

            channel.onmessage = (event) => {
                if (event.data.action === 'visaLimitWarning') {
                    const { region, daysInPeriod, daysLimit } = event.data;
                    self.registration.showNotification('Visa Tracker', {
                        body: `Approaching visa limit in ${region}: ${daysInPeriod}/${daysLimit} days used.`,
                        icon: 'icon.png',
                    });
                    resolve();
                }
            };
        });
    } catch (error) {
        console.error('Periodic sync failed:', error);
    }
}