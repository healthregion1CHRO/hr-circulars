// หลังบ้าน: จัดการข่าว (ผู้ใช้ที่อนุมัติแล้ว), อนุมัติผู้ใช้ + บันทึกการใช้งาน (ผู้ดูแลระบบ)
// สิทธิ์จริงบังคับโดย firestore.rules — การซ่อนปุ่มในหน้านี้เป็นแค่ความสะดวก
import { $, esc, say, toast, initChrome, CATEGORIES, URG, thaiDate, thaiDateTime, isIso } from './ui.js';
import { SEED_NEWS } from './seed.js';
import { configured, fb, authMessage } from './fb.js';

initChrome();
const gate = $('gate');
const IDLE_MS = 30 * 60 * 1000;

const ACTIONS = {
  'login':'เข้าสู่ระบบ', 'logout':'ออกจากระบบ',
  'news.create':'เพิ่มข่าว', 'news.update':'แก้ไขข่าว', 'news.publish':'เผยแพร่ข่าว', 'news.unpublish':'ซ่อนข่าว', 'news.delete':'ลบข่าว', 'news.seed':'นำเข้าข่าวตัวอย่าง',
  'user.approve':'อนุมัติผู้ใช้', 'user.disable':'ระงับผู้ใช้', 'user.role':'เปลี่ยนสิทธิ์ผู้ใช้',
};
const STATUS = { pending:['รออนุมัติ','wait'], approved:['ใช้งานได้','on'], disabled:['ระงับ','bad'] };
const ROLE = { editor:'ผู้แก้ไขข่าว', admin:'ผู้ดูแลระบบ' };

if (!configured) {
  say(gate, 'warn', 'ระบบสมาชิกยังไม่เปิดใช้งาน ผู้ดูแลต้องตั้งค่า Firebase ใน assets/js/firebase-config.js ก่อน (ดูขั้นตอนใน README.md) ระหว่างนี้ลองใช้หลังบ้านด้วยข้อมูลตัวอย่างได้');
  // โหมดตัวอย่างมีเฉพาะตอนยังไม่ตั้งค่า Firebase: ตั้งค่าแล้วปุ่มนี้หายไป ไม่มีทางข้ามการเข้าสู่ระบบจริง
  $('demoBtn').hidden = false;
  $('demoBtn').addEventListener('click', async () => {
    const { demoBackend } = await import('./demo.js');
    $('demoBtn').hidden = true; $('demoBar').hidden = false;
    boot(demoBackend());
  });
} else {
  fb().then(boot).catch(err => say(gate, 'err', authMessage(err)));
}

async function boot({ auth, db, A, F }){
  let me = null, profile = null, isAdmin = false;
  let news = [], users = [], editing = null, pendingDelete = null;
  let leaving = false;  // ออกจากระบบเอง: ไม่ต้องให้ onAuthStateChanged พาไปหน้า login ซ้ำ

  const audit = async (action, target = '') => {
    try {
      await F.addDoc(F.collection(db, 'audit'), { uid: me.uid, email: me.email, action, target: String(target).slice(0, 300), at: F.serverTimestamp() });
    } catch (e) { /* บันทึกไม่สำเร็จไม่ขวางงานหลัก */ }
  };

  // ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน
  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => { leaving = true; await A.signOut(auth); location.replace('login.html?timeout=1'); }, IDLE_MS);
  };
  ['pointerdown','keydown','scroll','touchstart'].forEach(ev => addEventListener(ev, resetIdle, { passive: true }));

  A.onAuthStateChanged(auth, async u => {
    if (!u) { if (!leaving) location.replace('login.html'); return; }
    if (!u.emailVerified) { await A.signOut(auth); location.replace('login.html?verify=1'); return; }
    me = u; resetIdle();
    $('who').textContent = (u.displayName ? u.displayName + ' · ' : '') + u.email;
    $('logoutBtn').hidden = false;
    try {
      const ref = F.doc(db, 'users', u.uid);
      let snap = await F.getDoc(ref);
      // สมัครแล้วบันทึกโปรไฟล์ไม่สำเร็จ: สร้างใหม่ในสถานะรออนุมัติ
      if (!snap.exists()) {
        await F.setDoc(ref, { email: u.email, name: (u.displayName || u.email).slice(0, 100), org: '', status: 'pending', role: 'editor', createdAt: F.serverTimestamp() });
        snap = await F.getDoc(ref);
      }
      profile = snap.data();
      if (profile.status === 'pending') { say(gate, 'warn', 'บัญชีของคุณยืนยันอีเมลแล้ว และกำลังรอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะเข้าหลังบ้านได้'); return; }
      if (profile.status !== 'approved') { say(gate, 'err', 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'); return; }
      isAdmin = profile.role === 'admin';
      gate.hidden = true; $('app').hidden = false;
      $('roleText').textContent = ROLE[profile.role] || '';
      document.querySelectorAll('[data-admin]').forEach(el => { el.hidden = !isAdmin; });
      try { if (!sessionStorage.getItem('hr-logged')) { sessionStorage.setItem('hr-logged', '1'); audit('login'); } } catch (e) {}
      await loadNews();
    } catch (err) {
      say(gate, 'err', authMessage(err));
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    if (me) await audit('logout');
    try { sessionStorage.removeItem('hr-logged'); } catch (e) {}
    leaving = true;
    await A.signOut(auth);
    location.replace('login.html?out=1');
  });

  // ---------- แท็บ ----------
  $('views').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    $('views').querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    ['news','users','audit'].forEach(v => { $('v-' + v).hidden = v !== b.dataset.view; });
    if (b.dataset.view === 'users') loadUsers();
    if (b.dataset.view === 'audit') loadAudit();
  });

  // ---------- ข่าว ----------
  async function loadNews(){
    const snap = await F.getDocs(F.collection(db, 'news'));
    news = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
    $('seedBtn').hidden = news.length > 0;
    renderNews();
  }

  function renderNews(){
    const q = $('nq').value.trim().toLowerCase();
    const rows = news.filter(n => !q || (String(n.title)+' '+n.no+' '+n.from).toLowerCase().includes(q));
    $('newsCount').textContent = 'ทั้งหมด ' + news.length + ' รายการ · เผยแพร่ ' + news.filter(n => n.published).length;
    $('newsBody').innerHTML = rows.map(n =>
      '<tr>'+
        '<td class="num">'+esc(thaiDate(n.date))+'</td>'+
        '<td>'+esc(CATEGORIES[n.cat]?.name || '-')+'</td>'+
        '<td>'+esc(n.title)+(n.no ? '<br><small class="hint">'+esc(n.no)+'</small>' : '')+'</td>'+
        '<td>'+esc(URG[n.urg] ?? '')+'</td>'+
        '<td>'+(n.published ? '<span class="st on">เผยแพร่</span>' : '<span class="st off">ซ่อน</span>')+'</td>'+
        '<td><div class="acts">'+
          '<button type="button" class="btn-soft" data-edit="'+esc(n.id)+'">แก้ไข</button>'+
          '<button type="button" class="btn-soft" data-pub="'+esc(n.id)+'">'+(n.published ? 'ซ่อน' : 'เผยแพร่')+'</button>'+
          (isAdmin ? '<button type="button" class="btn-soft" data-del="'+esc(n.id)+'">ลบ</button>' : '')+
        '</div></td>'+
      '</tr>'
    ).join('') || '<tr><td colspan="6" class="hint">ยังไม่มีข่าว</td></tr>';
  }
  $('nq').addEventListener('input', renderNews);

  $('nCat').innerHTML = CATEGORIES.map((c, i) => '<option value="'+i+'">'+esc(c.name)+'</option>').join('');

  function openForm(n){
    editing = n ? n.id : null;
    $('formTitle').textContent = n ? 'แก้ไขข่าว' : 'เพิ่มข่าว';
    $('nCat').value = String(n ? n.cat : 0);
    $('nTitle').value = n ? n.title : '';
    $('nNo').value = n ? n.no : '';
    $('nFrom').value = n ? n.from : '';
    $('nUrg').value = n ? n.urg : '';
    $('nDate').value = n ? n.date : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('nDeadline').value = n ? n.deadline : '';
    $('nPub').checked = n ? !!n.published : true;
    say($('formMsg'), '', '');
    $('newsDlg').showModal(); $('nTitle').focus();
  }
  $('addBtn').addEventListener('click', () => openForm(null));
  $('formCancel').addEventListener('click', () => $('newsDlg').close());

  $('newsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      cat: Number($('nCat').value), title: $('nTitle').value.trim(), no: $('nNo').value.trim(), from: $('nFrom').value.trim(),
      urg: $('nUrg').value, date: $('nDate').value, deadline: $('nDeadline').value.trim(), published: $('nPub').checked,
      updatedBy: me.uid, updatedAt: F.serverTimestamp(),
    };
    const fm = $('formMsg');
    if (!Number.isInteger(data.cat) || !CATEGORIES[data.cat]) return say(fm, 'err', 'กรุณาเลือกหมวด');
    if (!data.title || data.title.length > 300) return say(fm, 'err', 'กรุณากรอกชื่อเรื่อง (ไม่เกิน 300 ตัวอักษร)');
    if (!isIso(data.date)) return say(fm, 'err', 'กรุณาเลือกวันที่');
    if (!['', 'very', 'most'].includes(data.urg)) return say(fm, 'err', 'ความเร่งด่วนไม่ถูกต้อง');
    const btn = $('formSave'); btn.disabled = true;
    try {
      if (editing) {
        await F.updateDoc(F.doc(db, 'news', editing), data);
        await audit('news.update', editing + ' ' + data.title);
      } else {
        const ref = await F.addDoc(F.collection(db, 'news'), { ...data, createdBy: me.uid, createdAt: F.serverTimestamp() });
        await audit('news.create', ref.id + ' ' + data.title);
      }
      $('newsDlg').close(); toast('บันทึกแล้ว');
      await loadNews();
    } catch (err) {
      say(fm, 'err', authMessage(err));
    } finally {
      btn.disabled = false;
    }
  });

  $('newsBody').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]'), pub = e.target.closest('[data-pub]'), del = e.target.closest('[data-del]');
    if (ed) openForm(news.find(n => n.id === ed.dataset.edit));
    if (pub) {
      const n = news.find(x => x.id === pub.dataset.pub); pub.disabled = true;
      try {
        await F.updateDoc(F.doc(db, 'news', n.id), { published: !n.published, updatedBy: me.uid, updatedAt: F.serverTimestamp() });
        await audit(n.published ? 'news.unpublish' : 'news.publish', n.id + ' ' + n.title);
        toast(n.published ? 'ซ่อนข่าวแล้ว' : 'เผยแพร่ข่าวแล้ว');
        await loadNews();
      } catch (err) { toast(authMessage(err)); pub.disabled = false; }
    }
    if (del) {
      pendingDelete = news.find(n => n.id === del.dataset.del);
      $('delText').textContent = pendingDelete.title;
      $('delDlg').showModal();
    }
  });
  $('delCancel').addEventListener('click', () => $('delDlg').close());
  $('delOk').addEventListener('click', async () => {
    const n = pendingDelete; if (!n) return;
    $('delOk').disabled = true;
    try {
      await F.deleteDoc(F.doc(db, 'news', n.id));
      await audit('news.delete', n.id + ' ' + n.title);
      $('delDlg').close(); toast('ลบข่าวแล้ว');
      await loadNews();
    } catch (err) { toast(authMessage(err)); }
    finally { $('delOk').disabled = false; pendingDelete = null; }
  });

  $('seedBtn').addEventListener('click', async () => {
    $('seedBtn').disabled = true;
    try {
      const batch = F.writeBatch(db);
      SEED_NEWS.forEach(s => {
        batch.set(F.doc(F.collection(db, 'news')), {
          cat: s.cat, title: s.title, no: s.no, from: s.from, urg: s.urg, date: s.date, deadline: s.deadline, published: true,
          createdBy: me.uid, createdAt: F.serverTimestamp(), updatedBy: me.uid, updatedAt: F.serverTimestamp(),
        });
      });
      await batch.commit();
      await audit('news.seed', SEED_NEWS.length + ' รายการ');
      toast('นำเข้าข่าวตัวอย่าง ' + SEED_NEWS.length + ' รายการแล้ว');
      await loadNews();
    } catch (err) { toast(authMessage(err)); }
    finally { $('seedBtn').disabled = false; }
  });

  // ---------- ผู้ใช้ (ผู้ดูแลระบบ) ----------
  async function loadUsers(){
    if (!isAdmin) return;
    try {
      const snap = await F.getDocs(F.collection(db, 'users'));
      users = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || String(a.email).localeCompare(String(b.email)));
      renderUsers();
    } catch (err) { toast(authMessage(err)); }
  }
  function renderUsers(){
    $('pendingCount').textContent = 'รออนุมัติ ' + users.filter(u => u.status === 'pending').length + ' คน';
    $('usersBody').innerHTML = users.map(u => {
      const st = STATUS[u.status] || ['-', 'off'], self = u.id === me.uid;
      return '<tr>'+
        '<td>'+esc(u.name)+(u.org ? '<br><small class="hint">'+esc(u.org)+'</small>' : '')+'</td>'+
        '<td>'+esc(u.email)+'</td>'+
        '<td class="num">'+esc(thaiDateTime(u.createdAt?.toDate?.()))+'</td>'+
        '<td><span class="st '+st[1]+'">'+st[0]+'</span></td>'+
        '<td>'+esc(ROLE[u.role] || '-')+'</td>'+
        '<td>'+(self ? '<span class="hint">บัญชีของคุณ</span>' : '<div class="acts">'+
          (u.status !== 'approved' ? '<button type="button" class="btn" data-approve="'+esc(u.id)+'">อนุมัติ</button>' : '')+
          (u.status !== 'disabled' ? '<button type="button" class="btn-soft" data-disable="'+esc(u.id)+'">ระงับ</button>' : '')+
          '<button type="button" class="btn-soft" data-role="'+esc(u.id)+'">'+(u.role === 'admin' ? 'ลดเป็นผู้แก้ไขข่าว' : 'ตั้งเป็นผู้ดูแลระบบ')+'</button>'+
        '</div>')+'</td>'+
      '</tr>';
    }).join('') || '<tr><td colspan="6" class="hint">ยังไม่มีผู้ใช้</td></tr>';
  }
  $('usersBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-approve],[data-disable],[data-role]'); if (!b) return;
    const id = b.dataset.approve || b.dataset.disable || b.dataset.role;
    const u = users.find(x => x.id === id); if (!u || id === me.uid) return;
    let change, action;
    if (b.dataset.approve) { change = { status: 'approved' }; action = 'user.approve'; }
    else if (b.dataset.disable) { change = { status: 'disabled' }; action = 'user.disable'; }
    else { change = { role: u.role === 'admin' ? 'editor' : 'admin' }; action = 'user.role'; }
    b.disabled = true;
    try {
      await F.updateDoc(F.doc(db, 'users', id), change);
      await audit(action, u.email + (change.role ? ' → ' + change.role : ''));
      toast('บันทึกแล้ว');
      await loadUsers();
    } catch (err) { toast(authMessage(err)); b.disabled = false; }
  });

  // ---------- บันทึกการใช้งาน (ผู้ดูแลระบบ) ----------
  async function loadAudit(){
    if (!isAdmin) return;
    try {
      const snap = await F.getDocs(F.query(F.collection(db, 'audit'), F.orderBy('at', 'desc'), F.limit(200)));
      $('auditBody').innerHTML = snap.docs.map(d => {
        const a = d.data();
        return '<tr><td class="num">'+esc(thaiDateTime(a.at?.toDate?.()))+'</td><td>'+esc(a.email)+'</td><td>'+esc(ACTIONS[a.action] || a.action)+'</td><td>'+esc(a.target)+'</td></tr>';
      }).join('') || '<tr><td colspan="4" class="hint">ยังไม่มีบันทึก</td></tr>';
    } catch (err) { toast(authMessage(err)); }
  }
  $('auditReload').addEventListener('click', loadAudit);
}
