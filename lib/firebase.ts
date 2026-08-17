import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAYDFp7QV-r1V9hzgGwiIJ4lAb_E8CZoOY",
  authDomain: "atom-erp-web.firebaseapp.com",
  projectId: "atom-erp-web",
  storageBucket: "atom-erp-web.firebasestorage.app",
  messagingSenderId: "137659221462",
  appId: "1:137659221462:web:fe23070430398c5ed59077",
  measurementId: "G-551LSKH755"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;