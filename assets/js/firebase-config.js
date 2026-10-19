/*
 * ค่าตั้งค่า Firebase ของเว็บนี้ — คัดลอกจาก Firebase console › Project settings › Your apps › SDK setup (Config)
 * ค่าเหล่านี้ไม่ใช่ความลับ (ทุกเว็บที่ใช้ Firebase เปิดเผยค่านี้) ความปลอดภัยมาจาก firestore.rules และ App Check
 * ตราบใดที่ apiKey ยังว่าง หน้าแรกจะแสดงข่าวตัวอย่างในไฟล์ seed.js และหน้าเข้าสู่ระบบจะแจ้งว่ายังไม่ได้ตั้งค่า
 */
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// (แนะนำ) site key ของ reCAPTCHA v3 สำหรับ App Check — กันสคริปต์/บอทที่ไม่ได้มาจากเว็บนี้ เว้นว่างได้
export const appCheckSiteKey = '';
