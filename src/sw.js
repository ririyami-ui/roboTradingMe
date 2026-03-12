import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// This is required for VitePWA to inject the precache manifest
precacheAndRoute(self.__WB_MANIFEST);

// Claiming clients immediately so they can be controlled by this SW
self.skipWaiting();
clientsClaim();

// --- FCM Background Messaging Logic ---
// We use the compat version for easier script importing in SW
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAqFIdy9vP4eCI2-5427k4ZBngct1BMod8",
  authDomain: "cryptoanalyzer-2de3a.firebaseapp.com",
  projectId: "cryptoanalyzer-2de3a",
  storageBucket: "cryptoanalyzer-2de3a.firebasestorage.app",
  messagingSenderId: "679870588521",
  appId: "1:679870588521:web:dbfde9c54bd20c40b124f8"
};

try {
  // @ts-ignore
  firebase.initializeApp(firebaseConfig);
  // @ts-ignore
  const messaging = firebase.messaging();

  // Customize background notification handling
  messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background message ', payload);

    const notificationTitle = payload.notification?.title || '🚀 SaktiBot Signal';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'Cek sinyal trading terbaru!',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: payload.data,
      vibrate: [200, 100, 200, 100, 200],
      tag: 'saktibot-signal', // Group notifications
      renotify: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (error) {
  console.error("Firebase SW Init failed in sw.js:", error);
}

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // @ts-ignore
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    // @ts-ignore
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      // @ts-ignore
      return self.clients.openWindow(urlToOpen);
    })
  );
});
