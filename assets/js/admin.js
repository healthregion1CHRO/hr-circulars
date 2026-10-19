// หลังบ้าน: ภาพรวม, ข่าว (ผู้ใช้ที่อนุมัติแล้ว) / หมวดข่าว, เมนูและลิงก์, ตั้งค่าเว็บไซต์, ผู้ใช้งาน, บันทึกความปลอดภัย (ผู้ดูแลระบบ) / โปรไฟล์
// สิทธิ์จริงบังคับโดย firestore.rules — การซ่อนเมนู/ปุ่มในหน้านี้เป็นแค่ความสะดวก
import { $, esc, say, toast, icon, initChrome, URG, COLORS, LINK_GROUPS, LINK_ICONS, URL_RE, thaiDate, thaiDateTime, isIso } from './ui.js';
import { SEED_NEWS, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_LINKS } from './seed.js';
import { configured, fb, authMessage } from './fb.js';
import { cleanSettings, cleanCategory, cleanLink, byOrder } from './site.js';

initChrome();
const gate = $('gate');
const IDLE_MS = 30 * 60 * 1000;

const ACTIONS = {
  'login':'เข้าสู่ระบบ', 'logout':'ออกจากระบบ', 'password.reset':'ขอลิงก์เปลี่ยนรหัสผ่าน',
  'news.create':'เพิ่มข่าว', 'news.update':'แก้ไขข่าว', 'news.publish':'เผยแพร่ข่าว', 'news.unpublish':'ซ่อนข่าว', 'news.delete':'ลบข่าว', 'news.seed':'นำเข้าข่าวตัวอย่าง',
  'cat.create':'เพิ่มหมวดข่าว', 'cat.update':'แก้ไขหมวดข่าว', 'cat.delete':'ลบหมวดข่าว',
  'link.create':'เพิ่มลิงก์', 'link.update':'แก้ไขลิงก์', 'link.delete':'ลบลิงก์',
  'settings.update':'แก้ไขตั้งค่าเว็บไซต์', 'site.import':'นำเข้าค่าเริ่มต้นของเว็บ',
  'user.approve':'อนุมัติผู้ใช้', 'user.disable':'ระงับผู้ใช้', 'user.role':'เปลี่ยนสิทธิ์ผู้ใช้',
};
const STATUS = { pending:['รออนุมัติ','b-warn'], approved:['ใช้งานได้','b-ok'], disabled:['ระงับ','b-danger'] };
const ROLE = { editor:['ผู้แก้ไขข่าว','b-off'], admin:['ผู้ดูแลระบบ','b-danger'] };
const VIEWS = { overview:'ภาพรวม', news:'ข่าว/หนังสือเวียน', cats:'หมวดข่าว', links:'เมนูและลิงก์', settings:'ตั้งค่าเว็บไซต์', users:'ผู้ใช้งาน', audit:'บันทึกความปลอดภัย', profile:'โปรไฟล์ของฉัน' };
const ADMIN_VIEWS = ['cats', 'links', 'settings', 'users', 'audit'];
const hasPlaceholder = s => /\[[^\]]*\]/.test(String(s || ''));
const urgBadge = u => u === 'most' ? '<span class="badge b-most">ด่วนที่สุด</span> ' : u === 'very' ? '<span class="badge b-very">ด่วนมาก</span> ' : '';
const pubBadge = (p, on = 'เผยแพร่', off = 'ซ่อน') => p ? '<span class="badge b-ok">'+on+'</span>' : '<span class="badge b-off">'+off+'</span>';
const ts = v => v?.toDate?.() || null;
const opts = (list, sel) => list.map(([v, t]) => '<option value="'+esc(v)+'"'+(String(v) === String(sel) ? ' selected' : '')+'>'+esc(t)+'</option>').join('');
const num = (el, dflt) => { const v = Number(el.value); return Number.isInteger(v) ? v : dflt; };

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
  let me = null, profile = null, isAdmin = false, view = 'overview';
  let news = [], users = [], editing = null, pendingDelete = null;
  let cats = [], links = [], settings = { ...DEFAULT_SETTINGS }, fromDefaults = {};
  let leaving = false;  // ออกจากระบบเอง: ไม่ต้องให้ onAuthStateChanged พาไปหน้า login ซ้ำ
  const names = new Map();  // uid → ชื่อ (สำหรับคอลัมน์ "แก้ไขโดย")
  const catOf = key => cats.find(c => c.key === key);
  const catBadge = key => { const c = catOf(key); return '<span class="badge b-cat c'+(c ? c.color : 0)+'">'+esc(c ? c.name : 'ไม่มีหมวด')+'</span>'; };

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
  const stamp = () => ({ updatedBy: me.uid, updatedAt: F.serverTimestamp() });
  const stampNews = () => ({ ...stamp(), updatedByName: String(profile.name || me.email).slice(0, 100) });

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
      await loadSiteData();
      if (isAdmin) await loadUsers();
      await loadNews();
      const start = location.hash.slice(1);
      show(VIEWS[start] && (isAdmin || !ADMIN_VIEWS.includes(start)) ? start : 'overview');
    } catch (err) {
      say(gate, 'err', authMessage(err));
    }
  });

  $('logoutBtn').addEventListener('click', async () => { if (me) await audit('logout'); logout(); });
  $('gateLogout').addEventListener('click', () => logout());

  // ---------- เมนูข้าง ----------
  function show(v){
    view = v;
    Object.keys(VIEWS).forEach(k => { $('v-' + k).hidden = k !== v; });
    document.querySelectorAll('.aside [data-view]').forEach(a => {
      if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('viewTitle').textContent = VIEWS[v];
    $('aside').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', 'false');
    history.replaceState(null, '', '#' + v);
    renderDefaultsBox();
    if (v === 'users') loadUsers();
    if (v === 'audit') loadAudit();
  }
  $('aside').addEventListener('click', e => {
    const a = e.target.closest('[data-view]'); if (!a) return;
    e.preventDefault(); show(a.dataset.view);
  });
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  // ---------- ข้อมูลเว็บ: หมวด / ลิงก์ / ตั้งค่า ----------
  async function loadSiteData(){
    const [st, cs, ls] = await Promise.all([
      F.getDoc(F.doc(db, 'settings', 'site')),
      F.getDocs(F.collection(db, 'categories')),
      F.getDocs(F.collection(db, 'links')),
    ]);
    fromDefaults = { settings: !st.exists(), categories: cs.docs.length === 0, links: ls.docs.length === 0 };
    settings = st.exists() ? cleanSettings(st.data()) : { ...DEFAULT_SETTINGS };
    cats = (cs.docs.length ? cs.docs.map(d => cleanCategory(d.data(), d.id)).filter(Boolean) : DEFAULT_CATEGORIES.map(c => ({ ...c, id: String(c.key) }))).sort(byOrder);
    links = (ls.docs.length ? ls.docs.map(d => cleanLink(d.data(), d.id)).filter(Boolean) : DEFAULT_LINKS.map((l, i) => ({ ...l, id: null, tmp: 'd' + i }))).sort(byOrder);
    const catOpts = cats.map(c => [c.key, c.name + (c.active ? '' : ' (ปิดใช้งาน)')]);
    $('fcat').innerHTML = '<option value="">ทุกหมวด</option>' + opts(catOpts, '');
    $('nCat').innerHTML = opts(catOpts, cats[0]?.key);
    renderCats(); renderLinks(); renderSettings(); renderDefaultsBox();
  }
  const usingDefaults = () => fromDefaults.settings || fromDefaults.categories || fromDefaults.links;
  function renderDefaultsBox(){
    $('defaultsBox').hidden = !(isAdmin && usingDefaults() && ['cats', 'links', 'settings'].includes(view));
  }
  const needImport = () => { if (usingDefaults()) { toast('กด "นำเข้าค่าเริ่มต้น" ก่อน แล้วจึงแก้ไข'); return true; } return false; };

  $('importDefaults').addEventListener('click', async () => {
    const b = $('importDefaults'); b.disabled = true;
    try {
      const batch = F.writeBatch(db);
      if (fromDefaults.settings) batch.set(F.doc(db, 'settings', 'site'), { ...DEFAULT_SETTINGS, ...stamp() });
      if (fromDefaults.categories) DEFAULT_CATEGORIES.forEach(c => batch.set(F.doc(db, 'categories', String(c.key)), { ...c, ...stamp() }));
      if (fromDefaults.links) DEFAULT_LINKS.forEach(l => batch.set(F.doc(F.collection(db, 'links')), { ...l, ...stamp() }));
      await batch.commit();
      await audit('site.import', 'ตั้งค่า/หมวดข่าว/เมนูและลิงก์');
      toast('นำเข้าค่าเริ่มต้นแล้ว');
      await loadSiteData();
    } catch (err) { toast(authMessage(err)); }
    finally { b.disabled = false; }
  });

  // หมวดข่าว
  function renderCats(){
    $('catsBody').innerHTML = cats.map(c => {
      const n = news.filter(x => x.cat === c.key).length;
      return '<tr><td class="num">'+c.order+'</td>'+
        '<td><span class="badge b-cat c'+c.color+'">'+esc(c.name)+'</span></td>'+
        '<td class="c'+c.color+'"><span class="swatch"></span>'+esc(COLORS[c.color])+'</td>'+
        '<td class="num">'+n+'</td>'+
        '<td>'+pubBadge(c.active, 'เปิดใช้งาน', 'ปิดใช้งาน')+'</td>'+
        '<td><div class="row-actions">'+
          '<button type="button" class="btn btn-soft btn-sm" data-cat-edit="'+c.key+'">แก้ไข</button>'+
          '<button type="button" class="btn btn-soft btn-sm" data-cat-toggle="'+c.key+'">'+(c.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน')+'</button>'+
          (n ? '' : '<button type="button" class="btn btn-danger btn-sm" data-cat-del="'+c.key+'">ลบ</button>')+
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">ยังไม่มีหมวด</td></tr>';
  }
  $('cColor').innerHTML = opts(COLORS.map((t, i) => [i, t]), 0);
  let editingCat = null;
  function openCat(c){
    if (needImport()) return;
    editingCat = c ? c.key : null;
    $('catTitle').textContent = c ? 'แก้ไขหมวด' : 'เพิ่มหมวด';
    $('cName').value = c ? c.name : '';
    $('cColor').value = String(c ? c.color : 0);
    $('cOrder').value = String(c ? c.order : (cats.reduce((m, x) => Math.max(m, x.order), 0) + 1));
    $('cActive').checked = c ? c.active : true;
    say($('catMsg'), '', '');
    $('catDlg').showModal(); $('cName').focus();
  }
  const writeCat = async (key, data, action) => {
    await F.setDoc(F.doc(db, 'categories', String(key)), { key, ...data, ...stamp() });
    await audit(action, key + ' ' + data.name);
  };
  $('addCat').addEventListener('click', () => openCat(null));
  $('catForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { name: $('cName').value.trim(), color: num($('cColor'), 0), order: num($('cOrder'), 0), active: $('cActive').checked };
    if (!data.name || data.name.length > 60) return say($('catMsg'), 'err', 'กรุณากรอกชื่อหมวด (ไม่เกิน 60 ตัวอักษร)');
    if (data.order < -1000 || data.order > 1000) return say($('catMsg'), 'err', 'ลำดับต้องอยู่ระหว่าง -1000 ถึง 1000');
    const key = editingCat ?? Math.max(-1, ...cats.map(c => c.key)) + 1;
    if (key > 99) return say($('catMsg'), 'err', 'เพิ่มหมวดได้สูงสุด 100 หมวด');
    $('catSave').disabled = true;
    try {
      await writeCat(key, data, editingCat === null ? 'cat.create' : 'cat.update');
      $('catDlg').close(); toast('บันทึกแล้ว');
      await loadSiteData(); renderNews(); renderOverview();
    } catch (err) { say($('catMsg'), 'err', authMessage(err)); }
    finally { $('catSave').disabled = false; }
  });
  $('catsBody').addEventListener('click', async e => {
    const ed = e.target.closest('[data-cat-edit]'), tg = e.target.closest('[data-cat-toggle]'), del = e.target.closest('[data-cat-del]');
    if (ed) openCat(catOf(+ed.dataset.catEdit));
    if (tg) {
      if (needImport()) return;
      const c = catOf(+tg.dataset.catToggle); tg.disabled = true;
      try { await writeCat(c.key, { name: c.name, color: c.color, order: c.order, active: !c.active }, 'cat.update'); toast('บันทึกแล้ว'); await loadSiteData(); }
      catch (err) { toast(authMessage(err)); tg.disabled = false; }
    }
    if (del) {
      if (needImport()) return;
      const c = catOf(+del.dataset.catDel);
      askDelete('หมวด “' + c.name + '”', 'ลบได้เฉพาะหมวดที่ไม่มีข่าว ถ้าเพียงไม่ต้องการให้แสดง ให้กดปิดใช้งานแทน', async () => {
        if (news.some(n => n.cat === c.key)) throw { code: 'has-news' };
        await F.deleteDoc(F.doc(db, 'categories', String(c.key)));
        await audit('cat.delete', c.key + ' ' + c.name);
        await loadSiteData();
      });
    }
  });

  // เมนูและลิงก์
  $('lgrp').innerHTML = '<option value="">ทุกกลุ่ม</option>' + opts(Object.entries(LINK_GROUPS), '');
  $('kGrp').innerHTML = opts(Object.entries(LINK_GROUPS), 'quick');
  $('kIcon').innerHTML = opts(LINK_ICONS.map(i => [i, i]), 'link');
  $('kColor').innerHTML = opts(COLORS.map((t, i) => [i, t]), 0);
  $('lgrp').addEventListener('change', renderLinks);
  function renderLinks(){
    const g = $('lgrp').value;
    const rows = links.filter(l => !g || l.grp === g)
      .sort((a, b) => Object.keys(LINK_GROUPS).indexOf(a.grp) - Object.keys(LINK_GROUPS).indexOf(b.grp) || byOrder(a, b));
    let last = '';
    $('linksBody').innerHTML = rows.map(l => {
      const head = l.grp !== last ? '<tr><th colspan="5">'+esc(LINK_GROUPS[l.grp])+'</th></tr>' : '';
      last = l.grp;
      const id = esc(l.id || l.tmp);
      return head + '<tr><td class="num">'+l.order+'</td>'+
        '<td class="c'+l.color+'"><span class="badge b-cat">'+icon(l.icon, 14)+'</span> '+esc(l.title)+(l.sub ? '<br><span class="muted small">'+esc(l.sub)+'</span>' : '')+'</td>'+
        '<td class="title-cell small">'+(l.url === '#' ? '<span class="badge b-warn">ยังไม่มีลิงก์</span>' : esc(l.url))+'</td>'+
        '<td>'+pubBadge(l.active, 'เปิดใช้งาน', 'ปิดใช้งาน')+'</td>'+
        '<td><div class="row-actions">'+
          '<button type="button" class="btn btn-soft btn-sm" data-link-edit="'+id+'">แก้ไข</button>'+
          '<button type="button" class="btn btn-soft btn-sm" data-link-toggle="'+id+'">'+(l.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน')+'</button>'+
          '<button type="button" class="btn btn-danger btn-sm" data-link-del="'+id+'">ลบ</button>'+
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">ยังไม่มีลิงก์</td></tr>';
  }
  const linkById = id => links.find(l => (l.id || l.tmp) === id);
  let editingLink = null;
  function linkPreview(){
    $('kPreview').className = 'stat c' + $('kColor').value;
    $('kPreview').innerHTML = '<span class="ico">'+icon($('kIcon').value, 22)+'</span><span><strong>'+esc($('kTitle').value || 'ชื่อลิงก์')+'</strong><br><span>'+esc($('kSub').value)+'</span></span>';
  }
  ['kIcon', 'kColor', 'kTitle', 'kSub'].forEach(id => $(id).addEventListener('input', linkPreview));
  function openLink(l){
    if (needImport()) return;
    editingLink = l ? l.id : null;
    $('linkTitle').textContent = l ? 'แก้ไขลิงก์' : 'เพิ่มลิงก์';
    const grp = l ? l.grp : ($('lgrp').value || 'quick');
    $('kGrp').value = grp;
    $('kOrder').value = String(l ? l.order : (links.filter(x => x.grp === grp).reduce((m, x) => Math.max(m, x.order), 0) + 1));
    $('kTitle').value = l ? l.title : '';
    $('kSub').value = l ? l.sub : '';
    $('kUrl').value = l ? l.url : '#';
    $('kIcon').value = l ? l.icon : 'link';
    $('kColor').value = String(l ? l.color : 0);
    $('kActive').checked = l ? l.active : true;
    say($('linkMsg'), '', ''); linkPreview();
    $('linkDlg').showModal(); $('kTitle').focus();
  }
  const linkData = l => ({ grp: l.grp, title: l.title, sub: l.sub, url: l.url, icon: l.icon, color: l.color, order: l.order, active: l.active });
  $('addLink').addEventListener('click', () => openLink(null));
  $('linkForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      grp: $('kGrp').value, title: $('kTitle').value.trim(), sub: $('kSub').value.trim(), url: $('kUrl').value.trim() || '#',
      icon: $('kIcon').value, color: num($('kColor'), 0), order: num($('kOrder'), 0), active: $('kActive').checked,
    };
    const m = $('linkMsg');
    if (!LINK_GROUPS[data.grp]) return say(m, 'err', 'กรุณาเลือกกลุ่ม');
    if (!data.title || data.title.length > 80) return say(m, 'err', 'กรุณากรอกชื่อ (ไม่เกิน 80 ตัวอักษร)');
    if (!URL_RE.test(data.url) || /\.\./.test(data.url)) return say(m, 'err', 'ลิงก์ไม่ถูกต้อง ใช้ได้เฉพาะ https://… , #ชื่อส่วน หรือไฟล์ .html ในเว็บนี้');
    if (data.order < -1000 || data.order > 1000) return say(m, 'err', 'ลำดับต้องอยู่ระหว่าง -1000 ถึง 1000');
    $('linkSave').disabled = true;
    try {
      if (editingLink) {
        await F.setDoc(F.doc(db, 'links', editingLink), { ...data, ...stamp() });
        await audit('link.update', data.grp + ' ' + data.title);
      } else {
        await F.addDoc(F.collection(db, 'links'), { ...data, ...stamp() });
        await audit('link.create', data.grp + ' ' + data.title);
      }
      $('linkDlg').close(); toast('บันทึกแล้ว');
      await loadSiteData();
    } catch (err) { say(m, 'err', authMessage(err)); }
    finally { $('linkSave').disabled = false; }
  });
  $('linksBody').addEventListener('click', async e => {
    const ed = e.target.closest('[data-link-edit]'), tg = e.target.closest('[data-link-toggle]'), del = e.target.closest('[data-link-del]');
    if (ed) openLink(linkById(ed.dataset.linkEdit));
    if (tg) {
      if (needImport()) return;
      const l = linkById(tg.dataset.linkToggle); tg.disabled = true;
      try { await F.setDoc(F.doc(db, 'links', l.id), { ...linkData(l), active: !l.active, ...stamp() }); await audit('link.update', l.grp + ' ' + l.title); toast('บันทึกแล้ว'); await loadSiteData(); }
      catch (err) { toast(authMessage(err)); tg.disabled = false; }
    }
    if (del) {
      if (needImport()) return;
      const l = linkById(del.dataset.linkDel);
      askDelete('ลิงก์ “' + l.title + '” (' + LINK_GROUPS[l.grp] + ')', 'ลบแล้วกู้คืนไม่ได้ ถ้าเพียงไม่ต้องการให้แสดง ให้กดปิดใช้งานแทน', async () => {
        await F.deleteDoc(F.doc(db, 'links', l.id));
        await audit('link.delete', l.grp + ' ' + l.title);
        await loadSiteData();
      });
    }
  });

  // ตั้งค่าเว็บไซต์
  const SET_FIELDS = { sSite:'siteName', sOrg:'orgName', sHero:'heroTitle', sHeroSub:'heroSubtitle', sAddr:'address', sPhone:'phone', sEmail:'email' };
  function renderSettings(){
    Object.entries(SET_FIELDS).forEach(([id, k]) => { $(id).value = settings[k]; });
    $('sPer').value = String(settings.perPage); $('sNew').value = String(settings.newDays);
  }
  $('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (needImport()) return;
    const data = {};
    Object.entries(SET_FIELDS).forEach(([id, k]) => { data[k] = $(id).value.trim(); });
    data.perPage = num($('sPer'), 0); data.newDays = num($('sNew'), -1);
    const m = $('setMsg');
    if (!data.siteName) return say(m, 'err', 'กรุณากรอกชื่อหน่วยงาน');
    if (!data.heroTitle) return say(m, 'err', 'กรุณากรอกหัวข้อหลัก');
    if (data.email && !$('sEmail').checkValidity()) return say(m, 'err', 'รูปแบบอีเมลไม่ถูกต้อง');
    if (data.perPage < 1 || data.perPage > 48) return say(m, 'err', 'จำนวนข่าวต่อหน้าต้องอยู่ระหว่าง 1–48');
    if (data.newDays < 0 || data.newDays > 60) return say(m, 'err', 'จำนวนวันป้าย "ใหม่" ต้องอยู่ระหว่าง 0–60');
    $('setSave').disabled = true;
    try {
      await F.setDoc(F.doc(db, 'settings', 'site'), { ...data, ...stamp() });
      await audit('settings.update', data.siteName);
      say(m, 'ok', 'บันทึกการตั้งค่าแล้ว หน้าเว็บจะแสดงค่าใหม่เมื่อรีเฟรช');
      await loadSiteData();
    } catch (err) { say(m, 'err', authMessage(err)); }
    finally { $('setSave').disabled = false; }
  });

  // ยืนยันการลบ (ใช้ร่วมกันทุกหน้า)
  function askDelete(what, hint, run){
    pendingDelete = run;
    $('delText').textContent = what;
    $('delHint').textContent = hint;
    $('delDlg').showModal();
  }
  $('delCancel').addEventListener('click', () => $('delDlg').close());
  $('delOk').addEventListener('click', async () => {
    const run = pendingDelete; if (!run) return;
    $('delOk').disabled = true;
    try { await run(); $('delDlg').close(); toast('ลบแล้ว'); }
    catch (err) { toast(err.code === 'has-news' ? 'ยังมีข่าวในหมวดนี้ ย้ายข่าวไปหมวดอื่นก่อน' : authMessage(err)); }
    finally { $('delOk').disabled = false; pendingDelete = null; }
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
    if (isAdmin && !settings.email) todo.push(['settings', 'ยังไม่ได้กรอกอีเมล (ท้ายเว็บจะไม่แสดงช่องนี้)']);
    const dead = links.filter(l => l.active && l.url === '#').length;
    if (isAdmin && dead) todo.push(['links', 'ลิงก์ ' + dead + ' รายการยังไม่มีปลายทาง (ใส่ไว้เป็น #)']);
    if (isAdmin && usingDefaults()) todo.push(['settings', 'ยังใช้ค่าเริ่มต้นจากโค้ด — นำเข้าค่าเริ่มต้นเพื่อแก้หมวดข่าว เมนู และการตั้งค่า']);
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
  async function loadNews(){
    const snap = await F.getDocs(F.collection(db, 'news'));
    news = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
    $('seedBtn').hidden = news.length > 0;
    renderNews(); renderOverview(); renderCats();
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
    $('nCat').value = String(n ? n.cat : (cats.find(c => c.active) || cats[0])?.key);
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

  $('newsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      cat: Number($('nCat').value), title: $('nTitle').value.trim(), no: $('nNo').value.trim(), from: $('nFrom').value.trim(),
      urg: $('nUrg').value, date: $('nDate').value, deadline: $('nDeadline').value.trim(), published: $('nPub').checked,
      ...stampNews(),
    };
    const fm = $('formMsg');
    if (!Number.isInteger(data.cat) || !catOf(data.cat)) return say(fm, 'err', 'กรุณาเลือกหมวด');
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
        await F.updateDoc(F.doc(db, 'news', n.id), { published: !n.published, ...stampNews() });
        await audit(n.published ? 'news.unpublish' : 'news.publish', n.id + ' ' + n.title);
        toast(n.published ? 'ซ่อนข่าวแล้ว' : 'เผยแพร่ข่าวแล้ว');
        await loadNews();
      } catch (err) { toast(authMessage(err)); pub.disabled = false; }
    }
    if (del) {
      const n = news.find(x => x.id === del.dataset.del);
      askDelete(n.title, 'ลบแล้วกู้คืนไม่ได้ ถ้าเพียงไม่ต้องการให้แสดงบนเว็บ ให้กดปุ่มซ่อนแทน', async () => {
        await F.deleteDoc(F.doc(db, 'news', n.id));
        await audit('news.delete', n.id + ' ' + n.title);
        await loadNews();
      });
    }
  });

  $('seedBtn').addEventListener('click', async () => {
    $('seedBtn').disabled = true;
    try {
      const batch = F.writeBatch(db);
      SEED_NEWS.forEach(s => {
        batch.set(F.doc(F.collection(db, 'news')), {
          cat: s.cat, title: s.title, no: s.no, from: s.from, urg: s.urg, date: s.date, deadline: s.deadline, published: true,
          createdBy: me.uid, createdAt: F.serverTimestamp(), ...stampNews(),
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
