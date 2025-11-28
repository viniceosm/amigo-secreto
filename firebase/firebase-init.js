import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-cFYCg-FVzZhiMEc717-DMXuQhxkB2QU",
    authDomain: "amigo-secreto-507c4.firebaseapp.com",
    projectId: "amigo-secreto-507c4",
    storageBucket: "amigo-secreto-507c4.firebasestorage.app",
    messagingSenderId: "539794082236",
    appId: "1:539794082236:web:53afca3ca22ff91ae203b9",
    measurementId: "G-ME72EK5R76"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
