// สมัครสมาชิก: สร้างบัญชี → บันทึกโปรไฟล์สถานะ "รออนุมัติ" → ส่งอีเมลยืนยัน → ออกจากระบบ
import { $, say, initChrome } from './ui.js';
import { configured, fb, authMessage } from './fb.js';

initChrome();
const msg = $('msg');
const form = $('regForm');
if (!configured) {
  say(msg, 'warn', 'ระบบสมาชิกยังไม่เปิดใช้งาน ผู้ดูแลต้องตั้งค่า Firebase ใน assets/js/firebase-config.js ก่อน');
  form.querySelectorAll('input,button').forEach(el => { el.disabled = true; });
}

// รหัสผ่านที่พบบ่อย/เดาง่าย (ตรวจแบบไม่สนตัวพิมพ์)
const COMMON = ['password','password1','12345678','123456789','1234567890','qwerty123','qwertyuiop','iloveyou','admin123','welcome1','abc12345','11111111','00000000','p@ssw0rd','passw0rd','moph1234','hr123456'];

function checks(pw, email){
  const local = (email.split('@')[0] || '').toLowerCase();
  return {
    len: pw.length >= 12,
    mix: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw),
    safe: pw.length > 0 && !COMMON.some(c => pw.toLowerCase().includes(c)) && !(local.length >= 4 && pw.toLowerCase().includes(local)) && !/(.)\1\1\1/.test(pw),
  };
}

function updateMeter(){
  const c = checks($('password').value, $('email').value.trim());
  Object.entries(c).forEach(([k, ok]) => $('r-' + k).classList.toggle('pass', ok));
  const score = Object.values(c).filter(Boolean).length;
  const bar = $('meterBar');
  bar.style.width = (score * 20) + '%';
  bar.className = score >= 5 ? 's4' : score >= 4 ? 's3' : score >= 3 ? 's2' : '';
  $('meterText').textContent = 'ความแข็งแรงของรหัสผ่าน: ' + (score >= 5 ? 'แข็งแรง' : score >= 4 ? 'พอใช้' : 'อ่อน');
  return Object.values(c).every(Boolean);
}
$('password').addEventListener('input', updateMeter);
$('email').addEventListener('input', updateMeter);
updateMeter();

form.addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('name').value.trim(), org = $('org').value.trim(), email = $('email').value.trim();
  const pw = $('password').value, pw2 = $('password2').value;
  if (name.length < 2 || name.length > 100) { say(msg, 'err', 'กรุณากรอกชื่อ-สกุล (2–100 ตัวอักษร)'); $('name').focus(); return; }
  if (org.length > 150) { say(msg, 'err', 'ชื่อหน่วยงานยาวเกิน 150 ตัวอักษร'); $('org').focus(); return; }
  if (!$('email').checkValidity() || !email) { say(msg, 'err', 'รูปแบบอีเมลไม่ถูกต้อง'); $('email').focus(); return; }
  if (!updateMeter()) { say(msg, 'err', 'รหัสผ่านยังไม่ผ่านเงื่อนไขทุกข้อด้านล่าง'); $('password').focus(); return; }
  if (pw !== pw2) { say(msg, 'err', 'ยืนยันรหัสผ่านไม่ตรงกัน'); $('password2').focus(); return; }
  if (!$('consent').checked) { say(msg, 'err', 'กรุณายอมรับการเก็บข้อมูลส่วนบุคคลก่อนสมัคร'); $('consent').focus(); return; }

  const btn = $('regBtn'); btn.disabled = true; say(msg, '', '');
  const done = 'ส่งคำขอสมัครแล้ว ถ้าอีเมลนี้ยังไม่เคยสมัคร จะได้รับลิงก์ยืนยันอีเมล กรุณายืนยันอีเมล แล้วรอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน';
  const { auth, db, A, F } = await fb();
  try {
    const cred = await A.createUserWithEmailAndPassword(auth, email, pw);
    await A.updateProfile(cred.user, { displayName: name });
    // กฎ Firestore บังคับว่าโปรไฟล์ใหม่ต้องเป็น status 'pending' และ role 'editor' เท่านั้น
    await F.setDoc(F.doc(db, 'users', cred.user.uid), {
      email: cred.user.email, name, org, status: 'pending', role: 'editor', createdAt: F.serverTimestamp(),
    });
    await A.sendEmailVerification(cred.user);
    await A.signOut(auth);
    form.reset(); updateMeter();
    say(msg, 'ok', done);
  } catch (err) {
    // อีเมลซ้ำ: ตอบเหมือนสมัครสำเร็จ ไม่บอกว่ามีบัญชีนี้อยู่แล้ว
    if (err.code === 'auth/email-already-in-use') { form.reset(); updateMeter(); say(msg, 'ok', done); }
    else say(msg, 'err', authMessage(err));
    if (auth.currentUser) await A.signOut(auth);
  } finally {
    btn.disabled = false;
  }
});
