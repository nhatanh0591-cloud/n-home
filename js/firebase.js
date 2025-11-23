// js/firebase.js

// Import các thư viện Firebase cần thiết từ CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    query, 
    where, 
    orderBy, 
    getDocs,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    deleteObject,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-storage.js";

// --- FIREBASE CONFIG (Lấy từ file gốc của bạn) ---
const firebaseConfig = {
    apiKey: "AIzaSyA2m1K7pijNC1yirw_t36Rc3HnzCsD8pCs",
    authDomain: "nha-tro-53ca7.firebaseapp.com",
    projectId: "nha-tro-53ca7",
    storageBucket: "nha-tro-53ca7.firebasestorage.app",
    messagingSenderId: "415886594203",
    appId: "1:415886594203:web:f3cda09037973176c9763e",
    measurementId: "G-Y5GSRYP4XC"
};

// Khởi tạo ứng dụng Firebase
const app = initializeApp(firebaseConfig);

// Khởi tạo và export (xuất) các dịch vụ cốt lõi
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Export các hàm của Firebase để các module khác có thể dùng
export {
    // Auth
    signInAnonymously,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    
    // Firestore
    collection,
    onSnapshot,
    addDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    getDocs,
    Timestamp,
    
    // Storage
    ref,
    deleteObject,
    uploadBytes,
    getDownloadURL
};