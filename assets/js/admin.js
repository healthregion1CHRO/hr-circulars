// หลังบ้าน: ภาพรวม, จัดการข่าว (ผู้ใช้ที่อนุมัติแล้ว), ผู้ใช้งาน + บันทึกความปลอดภัย (ผู้ดูแลระบบ), โปรไฟล์
// สิทธิ์จริงบังคับโดย firestore.rules — การซ่อนเมนู/ปุ่มในหน้านี้เป็นแค่ความสะดวก
import { $, esc, say, toast, initChrome, CATEGORIES, URG, thaiDate, thaiDateTime, isIso } from './ui.js';
import { SEED_NEWS } from './seed.js';
import { configured, fb, authMessage } from './fb.js';

initChrome();
const gate = $('gate');
const IDLE_MS = 30 * 60 * 1000;

const ACTIONS = {
  'login':'เข้าสู่ระบบ', 'logout':'ออกจากระบบ', 'password.reset':'ขอลิงก์เปลี่ยนรหัสผ่าน',
  'news.create':'เพิ่มข่าว', 'news.update':'แก้ไขข่าว', 'news.publish':'เผยแพร่ข่าว', 'news.unpublish':'ซ่อนข่าว', 'news.delete':'ลบข่าว', 'news.seed':'นำเข้าข่าวตัวอย่าง',
  'user.approve':'อนุมัติผู้ใช้', 'user.disable':'ระงับผู้ใช้', 'user.role':'เปลี่ยนสิทธิ์ผู้ใช้',
};
const STATUS = { pending:['รออนุมัติ','b-warn'], approved:['ใช้งานได้','b-ok'], disabled:['ระงับ','b-danger'] };
const ROLE = { editor:['ผู้แก้ไขข่าว','b-off'], admin:['ผู้ดูแลระบบ','b-danger'] };
const VIEWS = { overview:'ภาพรวม', news:'ข่าว/หนังสือเวียน', users:'ผู้ใช้งาน', audit:'บันทึกความปลอดภัย', profile:'โปรไฟล์ของฉัน' };
const hasPlaceholder = s => /\[[^\]]*\]/.test(String(s || ''));
const urgBadge = u => u === 'most' ? '<span class="badge b-most">ด่วนที่สุด</span> ' : u === 'very' ? '<span class="badge b-very">ด่วนมาก</span> ' : '';
const catBadge = c => '<span class="badge b-cat c'+(CATEGORIES[c]?.color ?? 0)+'">'+esc(CATEGORIES[c]?.name || '-')+'</span>';
const pubBadge = p => p ? '<span class="badge b-ok">เผยแพร่</span>' : '<span class="badge b-off">ซ่อน</span>';
const ts = v => v?.toDate?.() || null;

if (!configured) {
  say(gate, 'warn', 'ระบบสมาชิกยังไม่เปิดใช้งาน ผู้ดูแลต้องตั้งค่า Firebase ใน assets/js/firebase-config.js ก่อน (ดูขั้นตอนใน README.md) ระหว่างนี้ลองใช้หลังบ้านด้วยข้อมูลตัวอย่างได้');
  // โหมดตัวอย่างมีเฉพาะตอนยังไม่ตั้งค่า Firebase: ตั้งค่าแล้วปุ่มนี้หายไป ไม่มีทางข้ามการเข้าสู่ระบบจริง
  $('demoBtn').hidden = false;
  $('demoBtn').addEventListener('click', async () => {
    const { demoBackend } = await import('./demo.js');
    $('demoBar').hidden = false;
    boot(demoBackend());
  });
} else {
  fb().then(boot).catch(err => say(gate, 'err', authMessage(err)));
}

async function boot({ auth, db, A, F }){
  let me = null, profile = null, isAdmin = false;
  let news = [], users = [], editing = null, pendingDelete = null;
  let leaving = false;  // ออกจากระบบเอง: ไม่ต้องให้ onAuthStateChanged พาไปหน้า login ซ้ำ
  const names = new Map();  // uid → ชื่อ (สำหรับคอลัมน์ "แก้ไขโดย")

  const audit = async (action, target = '') => {
    try {
      await F.addDoc(F.collection(db, 'audit'), { uid: me.uid, email: me.email, action, target: String(target).slice(0, 300), at: F.serverTimestamp() });
    } catch (e) { /* บันทึกไม่สำเร็จไม่ขวางงานหลัก */ }
  };
  const logout = async (to = 'login.html?out=1') => {
    leaving = true;
    try { sessionStorage.removeItem('hr-logged'); } catch (e) {}
    await A.signOut(auth);
    location.replace(to);
  };

  // ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน
  let idleTimer;
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => logout('login.html?timeout=1'), IDLE_MS); };
  ['pointerdown','keydown','scroll','touchstart'].forEach(ev => addEventListener(ev, resetIdle, { passive: true }));

  A.onAuthStateChanged(auth, async u => {
    if (!u) { if (!leaving) location.replace('login.html'); return; }
    if (!u.emailVerified) { await logout('login.html?verify=1'); return; }
    me = u; resetIdle();
    $('demoBtn').hidden = true;
    try {
      const ref = F.doc(db, 'users', u.uid);
      let snap = await F.getDoc(ref);
      // สมัครแล้วบันทึกโปรไฟล์ไม่สำเร็จ: สร้างใหม่ในสถานะรออนุมัติ
      if (!snap.exists()) {
        await F.setDoc(ref, { email: u.email, name: (u.displayName || u.email).slice(0, 100), org: '', status: 'pending', role: 'editor', createdAt: F.serverTimestamp() });
        snap = await F.getDoc(ref);
      }
      profile = snap.data();
      if (profile.status !== 'approved') {
        say(gate, profile.status === 'pending' ? 'warn' : 'err', profile.status === 'pending'
          ? 'บัญชี ' + u.email + ' ยืนยันอีเมลแล้ว และกำลังรอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะเข้าหลังบ้านได้'
          : 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
        $('gateLogout').hidden = false;
        return;
      }
      isAdmin = profile.role === 'admin';
      names.set(u.uid, profile.name);
      $('gateWrap').hidden = true; $('app').hidden = false;
      $('who').textContent = profile.name || u.email;
      $('roleBadge').textContent = ROLE[profile.role][0]; $('roleBadge').className = 'badge ' + ROLE[profile.role][1];
      $('welcome').textContent = 'ยินดีต้อนรับ ' + (profile.name || u.email);
      document.querySelectorAll('[data-admin]').forEach(el => { el.hidden = !isAdmin; });
      renderProfile();
      try { if (!sessionStorage.getItem('hr-logged')) { sessionStorage.setItem('hr-logged', '1'); audit('login'); } } catch (e) {}
      if (isAdmin) await loadUsers();
      await loadNews();
      const start = location.hash.slice(1);
      show(VIEWS[start] && (isAdmin || !['users','audit'].includes(start)) ? start : 'overview');
    } catch (err) {
      say(gate, 'err', authMessage(err));
    }
  });

  $('logoutBtn').addEventListener('click', async () => { if (me) await audit('logout'); logout(); });
  $('gateLogout').addEventListener('click', () => logout());

  // ---------- เมนูข้าง ----------
  function show(view){
    Object.keys(VIEWS).forEach(v => { $('v-' + v).hidden = v !== view; });
    document.querySelectorAll('.aside [data-view]').forEach(a => {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('viewTitle').textContent = VIEWS[view];
    $('aside').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', 'false');
    history.replaceState(null, '', '#' + view);
    if (view === 'users') loadUsers();
    if (view === 'audit') loadAudit();
  }
  $('aside').addEventListener('click', e => {
    const a = e.target.closest('[data-view]'); if (!a) return;
    e.preventDefault(); show(a.dataset.view);
  });

  // ---------- ภาพรวม ----------
  function renderOverview(){
    $('sAll').textContent = news.length;
    $('sPub').textContent = news.filter(n => n.published).length;
    $('sUrg').textContent = news.filter(n => n.urg).length;
    $('sHid').textContent = news.filter(n => !n.published).length;
    $('sPend').textContent = users.filter(u => u.status === 'pending').length;
    const todo = [];
    const ph = news.filter(n => hasPlaceholder(n.title) || hasPlaceholder(n.no) || hasPlaceholder(n.from) || hasPlaceholder(n.deadline));
    if (ph.length) todo.push(['news', 'ข่าว ' + ph.length + ' รายการยังมีข้อความในวงเล็บ [ ] ค้างอยู่ (หน้าเว็บซ่อนช่องที่เป็นข้อความตัวอย่างล้วน แต่ชื่อเรื่องยังแสดง)']);
    const pend = users.filter(u => u.status === 'pending').length;
    if (isAdmin && pend) todo.push(['users', 'มีผู้ใช้รออนุมัติ ' + pend + ' คน']);
    $('todoBox').hidden = !todo.length;
    $('todoList').innerHTML = todo.map(([v, t]) => '<li><button type="button" class="link-btn" data-go="'+v+'">'+esc(t)+'</button></li>').join('');
    const recent = news.slice().sort((a, b) => (ts(b.updatedAt) || 0) - (ts(a.updatedAt) || 0)).slice(0, 5);
    $('recentBody').innerHTML = recent.map(n =>
      '<tr><td class="title-cell"><button type="button" class="link-btn" data-edit="'+esc(n.id)+'">'+esc(n.title)+'</button></td><td>'+catBadge(n.cat)+'</td><td class="nowrap">'+esc(thaiDate(n.date))+'</td><td>'+pubBadge(n.published)+'</td></tr>'
    ).join('') || '<tr><td colspan="4" class="empty">ยังไม่มีข่าว</td></tr>';
  }
  $('v-overview').addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) {
      if (go.dataset.go === 'news') {
        $('filterForm').reset();
        if (go.dataset.filterStatus) $('fst').value = go.dataset.filterStatus;
        if (go.dataset.filterUrg) $('furg').value = go.dataset.filterUrg;
        renderNews();
      }
      show(go.dataset.go);
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) openForm(news.find(n => n.id === ed.dataset.edit));
  });

  // ---------- ข่าว ----------
  $('fcat').innerHTML = '<option value="">ทุกหมวด</option>' + CATEGORIES.map((c, i) => '<option value="'+i+'">'+esc(c.name)+'</option>').join('');
  $('nCat').innerHTML = CATEGORIES.map((c, i) => '<option value="'+i+'">'+esc(c.name)+'</option>').join('');

  async function loadNews(){
    const snap = await F.getDocs(F.collection(db, 'news'));
    news = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
    $('seedBtn').hidden = news.length > 0;
    renderNews(); renderOverview();
  }

  function renderNews(){
    const q = $('fq').value.trim().toLowerCase(), cat = $('fcat').value, urg = $('furg').value, st = $('fst').value;
    const rows = news.filter(n =>
      (!q || (String(n.title)+' '+n.no+' '+n.from).toLowerCase().includes(q)) &&
      (cat === '' || n.cat === +cat) &&
      (urg === '' || (urg === 'urgent' ? !!n.urg : urg === 'none' ? !n.urg : n.urg === urg)) &&
      (st === '' || (st === 'on') === !!n.published)
    );
    $('newsCount').textContent = 'พบ ' + rows.length + ' รายการ' + (rows.length !== news.length ? ' จากทั้งหมด ' + news.length : '');
    $('newsBody').innerHTML = rows.map(n =>
      '<tr>'+
        '<td class="nowrap">'+esc(thaiDate(n.date))+'</td>'+
        '<td class="title-cell">'+urgBadge(n.urg)+'<button type="button" class="link-btn" data-edit="'+esc(n.id)+'">'+esc(n.title)+'</button>'+(n.no ? '<br><span class="muted small">'+esc(n.no)+'</span>' : '')+'</td>'+
        '<td>'+catBadge(n.cat)+'</td>'+
        '<td>'+pubBadge(n.published)+'</td>'+
        '<td class="small">'+esc(n.updatedByName || names.get(n.updatedBy) || 'เจ้าหน้าที่')+'<br><span class="muted">'+esc(thaiDateTime(ts(n.updatedAt)))+'</span></td>'+
        '<td><div class="row-actions">'+
          '<button type="button" class="btn btn-soft btn-sm" data-edit="'+esc(n.id)+'">แก้ไข</button>'+
          '<button type="button" class="btn btn-soft btn-sm" data-pub="'+esc(n.id)+'">'+(n.published ? 'ซ่อน' : 'เผยแพร่')+'</button>'+
          (isAdmin ? '<button type="button" class="btn btn-danger btn-sm" data-del="'+esc(n.id)+'">ลบ</button>' : '')+
        '</div></td>'+
      '</tr>'
    ).join('') || '<tr><td colspan="6" class="empty">ไม่พบข่าวตามเงื่อนไข</td></tr>';
  }
  $('filterForm').addEventListener('input', renderNews);
  $('filterForm').addEventListener('submit', e => { e.preventDefault(); renderNews(); });
  $('filterForm').addEventListener('reset', () => setTimeout(renderNews, 0));

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
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => openForm(null)));
  $('formCancel').addEventListener('click', () => $('newsDlg').close());

  const stampFields = () => ({ updatedBy: me.uid, updatedByName: String(profile.name || me.email).slice(0, 100), updatedAt: F.serverTimestamp() });

  $('newsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      cat: Number($('nCat').value), title: $('nTitle').value.trim(), no: $('nNo').value.trim(), from: $('nFrom').value.trim(),
      urg: $('nUrg').value, date: $('nDate').value, deadline: $('nDeadline').value.trim(), published: $('nPub').checked,
      ...stampFields(),
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
        await F.updateDoc(F.doc(db, 'news', n.id), { published: !n.published, ...stampFields() });
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
          createdBy: me.uid, createdAt: F.serverTimestamp(), ...stampFields(),
        });
      });
      await batch.commit();
      await audit('news.seed', SEED_NEWS.length + ' รายการ');
      toast('นำเข้าข่าวตัวอย่าง ' + SEED_NEWS.length + ' รายการแล้ว');
      await loadNews();
    } catch (err) { toast(authMessage(err)); }
    finally { $('seedBtn').disabled = false; }
  });

  // ---------- ผู้ใช้งาน (ผู้ดูแลระบบ) ----------
  async function loadUsers(){
    if (!isAdmin) return;
    try {
      const snap = await F.getDocs(F.collection(db, 'users'));
      users = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || String(a.email).localeCompare(String(b.email)));
      users.forEach(u => names.set(u.id, u.name));
      renderUsers(); renderOverview();
    } catch (err) { toast(authMessage(err)); }
  }
  function renderUsers(){
    $('pendingCount').textContent = 'ผู้ใช้ทั้งหมด ' + users.length + ' คน · รออนุมัติ ' + users.filter(u => u.status === 'pending').length + ' คน';
    $('usersBody').innerHTML = users.map(u => {
      const st = STATUS[u.status] || ['-', 'b-off'], role = ROLE[u.role] || ['-', 'b-off'], self = u.id === me.uid;
      return '<tr>'+
        '<td>'+esc(u.name)+(u.org ? '<br><span class="muted small">'+esc(u.org)+'</span>' : '')+'</td>'+
        '<td>'+esc(u.email)+'</td>'+
        '<td class="nowrap small">'+esc(thaiDateTime(ts(u.createdAt)))+'</td>'+
        '<td><span class="badge '+st[1]+'">'+st[0]+'</span></td>'+
        '<td><span class="badge '+role[1]+'">'+role[0]+'</span></td>'+
        '<td>'+(self ? '<span class="muted small">บัญชีของคุณ</span>' : '<div class="row-actions">'+
          (u.status !== 'approved' ? '<button type="button" class="btn btn-sm" data-approve="'+esc(u.id)+'">อนุมัติ</button>' : '')+
          (u.status !== 'disabled' ? '<button type="button" class="btn btn-danger btn-sm" data-disable="'+esc(u.id)+'">ระงับ</button>' : '')+
          '<button type="button" class="btn btn-soft btn-sm" data-role="'+esc(u.id)+'">'+(u.role === 'admin' ? 'ลดเป็นผู้แก้ไขข่าว' : 'ตั้งเป็นผู้ดูแลระบบ')+'</button>'+
        '</div>')+'</td>'+
      '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">ยังไม่มีผู้ใช้</td></tr>';
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

  // ---------- บันทึกความปลอดภัย (ผู้ดูแลระบบ) ----------
  async function loadAudit(){
    if (!isAdmin) return;
    try {
      const snap = await F.getDocs(F.query(F.collection(db, 'audit'), F.orderBy('at', 'desc'), F.limit(200)));
      $('auditBody').innerHTML = snap.docs.map(d => {
        const a = d.data();
        return '<tr><td class="nowrap small">'+esc(thaiDateTime(ts(a.at)))+'</td><td>'+esc(a.email)+'</td><td>'+esc(ACTIONS[a.action] || a.action)+'</td><td class="title-cell">'+esc(a.target)+'</td></tr>';
      }).join('') || '<tr><td colspan="4" class="empty">ยังไม่มีบันทึก</td></tr>';
    } catch (err) { toast(authMessage(err)); }
  }
  $('auditReload').addEventListener('click', loadAudit);

  // ---------- โปรไฟล์ของฉัน ----------
  function renderProfile(){
    $('pName').textContent = profile.name || '-';
    $('pOrg').textContent = profile.org || '-';
    $('pEmail').textContent = me.email;
    $('pRole').textContent = ROLE[profile.role][0];
    $('pCreated').textContent = thaiDateTime(ts(profile.createdAt)) || '-';
  }
  $('pwBtn').addEventListener('click', async () => {
    $('pwBtn').disabled = true;
    try {
      await A.sendPasswordResetEmail(auth, me.email);
      await audit('password.reset', me.email);
      say($('pwMsg'), 'ok', 'ส่งลิงก์เปลี่ยนรหัสผ่านไปที่ ' + me.email + ' แล้ว (ตรวจสอบจดหมายขยะด้วย)');
    } catch (err) {
      say($('pwMsg'), 'err', authMessage(err));
    } finally {
      $('pwBtn').disabled = false;
    }
  });
}
