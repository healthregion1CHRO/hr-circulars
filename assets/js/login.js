// เข้าสู่ระบบ + ลืมรหัสผ่าน
import { $, say, initChrome } from './ui.js';
import { configured, fb, authMessage } from './fb.js';

initChrome();
const msg = $('msg');
const params = new URLSearchParams(location.search);
if (params.has('timeout')) say(msg, 'warn', 'ออกจากระบบอัตโนมัติ เพราะไม่มีการใช้งานเกิน 30 นาที');
else if (params.has('verify')) say(msg, 'warn', 'กรุณายืนยันอีเมลจากลิงก์ที่ส่งไปก่อนเข้าสู่ระบบ');
else if (params.has('out')) say(msg, 'ok', 'ออกจากระบบแล้ว');

const forms = [$('loginForm'), $('forgotForm')];
if (!configured) {
  say(msg, 'warn', 'ระบบสมาชิกยังไม่เปิดใช้งาน ผู้ดูแลต้องตั้งค่า Firebase ใน assets/js/firebase-config.js ก่อน');
  forms.forEach(f => f.querySelectorAll('input,button').forEach(el => { el.disabled = true; }));
} else {
  // เข้าระบบค้างอยู่แล้ว (แท็บเดิม) ไปหลังบ้านเลย
  fb().then(({ auth, A }) => {
    const off = A.onAuthStateChanged(auth, u => { off(); if (u && u.emailVerified) location.replace('admin.html'); });
  });
}

// หน่วงเวลาฝั่งหน้าเว็บเมื่อใส่ผิดติดกัน (ด่านจริงคือการล็อกของ Firebase ฝั่งเซิร์ฟเวอร์)
let fails = 0, lockUntil = 0;

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const wait = Math.ceil((lockUntil - Date.now()) / 1000);
  if (wait > 0) { say(msg, 'err', 'ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ ' + wait + ' วินาทีแล้วลองใหม่'); return; }
  const email = $('email').value.trim(), pw = $('password').value;
  if (!email || !pw) { say(msg, 'err', 'กรุณากรอกอีเมลและรหัสผ่าน'); return; }
  const btn = $('loginBtn'); btn.disabled = true; say(msg, '', '');
  $('resendBtn').hidden = true;
  try {
    const { auth, A } = await fb();
    const cred = await A.signInWithEmailAndPassword(auth, email, pw);
    fails = 0;
    if (!cred.user.emailVerified) {
      say(msg, 'warn', 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ยืนยันในอีเมลของคุณ หรือกดส่งลิงก์ใหม่');
      $('resendBtn').hidden = false;
      return;
    }
    location.replace('admin.html');
  } catch (err) {
    fails++;
    if (fails >= 5) lockUntil = Date.now() + 30000 * 2 ** Math.min(fails - 5, 5);
    say(msg, 'err', authMessage(err));
    $('password').value = '';
  } finally {
    btn.disabled = false;
  }
});

$('resendBtn').addEventListener('click', async () => {
  const { auth, A } = await fb();
  try {
    if (auth.currentUser) await A.sendEmailVerification(auth.currentUser);
    say(msg, 'ok', 'ส่งลิงก์ยืนยันใหม่แล้ว กรุณาตรวจสอบกล่องจดหมาย (รวมถึงจดหมายขยะ)');
  } catch (err) {
    say(msg, 'err', authMessage(err));
  } finally {
    $('resendBtn').hidden = true;
    await A.signOut(auth);
  }
});

$('showForgot').addEventListener('click', () => {
  $('loginForm').hidden = true; $('forgotForm').hidden = false; say(msg, '', '');
  $('fEmail').value = $('email').value; $('fEmail').focus();
});
$('backLogin').addEventListener('click', () => {
  $('forgotForm').hidden = true; $('loginForm').hidden = false; $('email').focus();
});

$('forgotForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('fEmail').value.trim();
  if (!email) { say(msg, 'err', 'กรุณากรอกอีเมล'); return; }
  const btn = $('forgotBtn'); btn.disabled = true;
  // ตอบข้อความเดียวกันเสมอ ไม่บอกว่ามีบัญชีนี้หรือไม่
  const same = 'ถ้าอีเมลนี้มีบัญชีในระบบ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ภายในไม่กี่นาที (ตรวจสอบจดหมายขยะด้วย)';
  try {
    const { auth, A } = await fb();
    await A.sendPasswordResetEmail(auth, email);
    say(msg, 'ok', same);
  } catch (err) {
    say(msg, err.code === 'auth/too-many-requests' || err.code === 'auth/network-request-failed' ? 'err' : 'ok',
        err.code === 'auth/too-many-requests' || err.code === 'auth/network-request-failed' ? authMessage(err) : same);
  } finally {
    btn.disabled = false;
  }
});
