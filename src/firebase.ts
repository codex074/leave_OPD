import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAGxbhp7jrMCVwXoqycYT5IT2wBxp25XBM",
  authDomain: "leaveopd.firebaseapp.com",
  projectId: "leaveopd",
  storageBucket: "leaveopd.appspot.com",
  messagingSenderId: "198276583055",
  appId: "1:198276583055:web:0bd83371a70f0fb891aafa"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
