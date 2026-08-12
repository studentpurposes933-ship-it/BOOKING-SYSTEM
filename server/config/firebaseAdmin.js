import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

export const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDaGfde2tp6lbTgQ9ROSyJ32TRX9Q1l1rM",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "booking-system-7b154.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "booking-system-7b154",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "booking-system-7b154.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "712080323281",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:712080323281:web:92e9030cf7c1bb999acbf0",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-8CVWHQCJWP",
};

// Initialize Client SDK on Server for Firestore read/write & transactions
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(firebaseApp);
export const clientAuth = getAuth(firebaseApp);

// Initialize Admin SDK if service account is provided, or as fallback
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!admin.apps.length) {
  try {
    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseConfig.projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('Firebase Admin initialized with Service Account Credentials.');
    } else {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log(`Firebase Admin initialized with Project ID (${firebaseConfig.projectId}).`);
    }
  } catch (error) {
    console.warn('Firebase Admin init warning:', error.message);
  }
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
export default firebaseApp;
