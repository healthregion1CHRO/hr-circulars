// โหลด Firebase SDK เมื่อจำเป็นเท่านั้น (หน้าแรกที่ยังไม่ตั้งค่าไม่ต้องโหลด)
import { firebaseConfig, appCheckSiteKey } from './firebase-config.js';

const BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let cache = null;
export function fb() {
  if (!configured) return Promise.resolve(null);
  cache ||= (async () => {
    const [appM, A, F] = await Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-firestore.js'),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    if (appCheckSiteKey) {
      const AC = await import(BASE + 'firebase-app-check.js');
      AC.initializeAppCheck(app, { provider: new AC.ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    // ปิดแท็บ/เบราว์เซอร์ = ออกจากระบบ (เก็บ session ใน sessionStorage เท่านั้น ไม่ใช้ IndexedDB/localStorage)
    const auth = A.initializeAuth(app, { persistence: A.browserSessionPersistence });
    auth.languageCode = 'th';
    const db = F.getFirestore(app);
    return { app, auth, db, A, F };
  })();
  return cache;
}

// ข้อความผิดพลาดที่ไม่บอกว่าอีเมลมีอยู่ในระบบหรือไม่ (กัน account enumeration)
export function authMessage(err) {
  const code = err && err.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials', 'auth/invalid-email'].includes(code))
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code === 'auth/too-many-requests') return 'พยายามหลายครั้งเกินไป ระบบระงับการเข้าสู่ระบบชั่วคราว กรุณารอสักครู่แล้วลองใหม่ หรือรีเซ็ตรหัสผ่าน';
  if (code === 'auth/user-disabled') return 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
  if (code === 'auth/network-request-failed') return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่';
  if (code === 'auth/password-does-not-meet-requirements' || code === 'auth/weak-password') return 'รหัสผ่านไม่ผ่านนโยบายความปลอดภัย กรุณาตั้งรหัสผ่านที่ยาวและซับซ้อนขึ้น';
  if (code === 'permission-denied') return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}
