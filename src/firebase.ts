// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getMessaging, Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAqFIdy9vP4eCI2-5427k4ZBngct1BMod8",
  authDomain: "cryptoanalyzer-2de3a.firebaseapp.com",
  projectId: "cryptoanalyzer-2de3a",
  storageBucket: "cryptoanalyzer-2de3a.firebasestorage.app",
  messagingSenderId: "679870588521",
  appId: "1:679870588521:web:dbfde9c54bd20c40b124f8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Modern Firestore initialization with persistent cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize FCM
export const messaging: Messaging | null = typeof window !== "undefined" ? getMessaging(app) : null;
