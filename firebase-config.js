// firebase-config.js
// Initializes Firebase App, Auth, and Firestore for Info Saver.
// Uses the modular Firebase v10 SDK loaded straight from Google's CDN,
// so this project runs with zero build step — just open index.html
// through a local server (or Firebase Hosting).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9mdQgvsoCuP_OHKYiPWeQ8YyglgdmuPM",
  authDomain: "info-saver-79faf.firebaseapp.com",
  projectId: "info-saver-79faf",
  storageBucket: "info-saver-79faf.firebasestorage.app",
  messagingSenderId: "438693319114",
  appId: "1:438693319114:web:d0011c8e7c5f10bc643f33",
  measurementId: "G-XN27ERX0LY",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);