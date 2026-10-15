// Firebase proje ayarları (bu bilgiler gizli değildir; güvenliği firestore.rules sağlar)
export const firebaseConfig = {
  apiKey: "AIzaSyB_8zVVOi7X1HjOwFoHKVaU7qrww5rzvrk",
  authDomain: "karmen-erp.firebaseapp.com",
  projectId: "karmen-erp",
  storageBucket: "karmen-erp.firebasestorage.app",
  messagingSenderId: "676917131620",
  appId: "1:676917131620:web:6435a125c9f202fd742271"
};

// Her zaman yönetici olan hesaplar. firestore.rules içindeki listeyle aynı olmalı.
export const BOOT_ADMINS = ["planlama.karmen@gmail.com"];

// İsteğe bağlı aktarma (TURN) sunucuları. Bazı mobil/şirket ağlarında aramanın bağlanması için gerekir.
// Örnek: [{ urls: "turn:sunucu.ornek.com:3478", username: "kullanici", credential: "sifre" }]
export const EXTRA_ICE = [];
