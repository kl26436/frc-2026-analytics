import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAu2gp1zFL3_P-7rj9FaSgSxUWxvGGlykU",
  authDomain: "data-wrangler-2026.firebaseapp.com",
  projectId: "data-wrangler-2026",
  storageBucket: "data-wrangler-2026.firebasestorage.app",
  messagingSenderId: "584876627446",
  appId: "1:584876627446:web:33ffd3e73193549f3023d7",
  measurementId: "G-ZZ05LJ5K3S"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
