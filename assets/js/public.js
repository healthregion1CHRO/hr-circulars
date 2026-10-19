// หน้าแรก: ตั้งค่าเว็บ หมวดข่าว เมนู/ลิงก์ และข่าวที่เผยแพร่ จาก Firestore (ยังไม่ตั้งค่า Firebase = ค่าเริ่มต้นใน seed.js)
import { $, esc, clean, icon, safeUrl, isDeadLink, parse, thaiDate, fiscalYear, initChrome } from './ui.js';
import { SEED_NEWS } from './seed.js';
import { configured, fb } from './fb.js';
import { loadSite, siteDefaults } from './site.js';

const DAY = 86400000;
let PER_PAGE = 10;
let NEW_DAYS = 7;
let CATS = [];            // หมวดที่เปิดใช้งาน เรียงตามลำดับ
let catIndex = new Map(); // key ของหมวด → ลำดับใน CATS

initChrome();

const ext = u => /^https?:/.test(u) ? ' target="_blank" rel="noopener noreferrer"' : '';
const setText = (id, v) => { const el = $(id); if (el) { el.textContent = v; el.hidden = !v; } };

function applySite({ settings: st, categories, links }){
  PER_PAGE = st.perPage; NEW_DAYS = st.newDays;
  setText('siteName', st.siteName); setText('orgName', st.orgName);
  setText('crumbTitle', st.heroTitle); setText('heroTitle', st.heroTitle); setText('heroSub', st.heroSubtitle);
  setText('footName', [st.siteName, st.orgName].filter(Boolean).join(' '));
  setText('footAddr', clean(st.address));
  setText('footContact', [clean(st.phone) && 'โทร ' + clean(st.phone), clean(st.email) && 'อีเมล ' + clean(st.email)].filter(Boolean).join(' · '));
  document.title = 'หนังสือเวียน ' + st.siteName;

  CATS = categories.filter(c => c.active);
  catIndex = new Map(CATS.map((c, i) => [c.key, i]));

  const on = links.filter(l => l.active);
  const grp = g => on.filter(l => l.grp === g);
  $('quick').innerHTML = grp('quick').map(l => { const u = safeUrl(l.url);
    return '<a class="qcard" href="'+esc(u)+'"'+ext(u)+'><span class="qicon c'+l.color+'">'+icon(l.icon, 28)+'</span><span class="qtext"><strong>'+esc(l.title)+'</strong><span>'+esc(l.sub)+'</span></span></a>';
  }).join('');
  $('quick').hidden = !grp('quick').length;
  $('side').innerHTML = [['main', 'เมนูหลัก'], ['service', 'บริการ']].map(([g, label]) => {
    const items = grp(g); if (!items.length) return '';
    return '<nav class="panel" aria-labelledby="nav-'+g+'"><h2 class="panel-title" id="nav-'+g+'">'+label+'</h2>'+
      items.map(l => { const u = safeUrl(l.url), cur = l.title === 'หนังสือเวียน';
        return '<a class="nav-link c'+l.color+'" href="'+esc(u)+'"'+(cur ? ' aria-current="page"' : '')+ext(u)+'><span class="nav-ico">'+icon(l.icon)+'</span>'+esc(l.title)+'</a>';
      }).join('')+'</nav>';
  }).join('');
  // ลิงก์ท้ายเว็บที่ยังไม่มีปลายทางไม่แสดง
  const foot = grp('footer').filter(l => !isDeadLink(l.url));
  $('footLinks').innerHTML = foot.map(l => '<a href="'+esc(safeUrl(l.url))+'"'+ext(l.url)+'>'+esc(l.title)+'</a>').join('');
  $('footLinksCol').hidden = !foot.length;
}

let NEWS = [];
let sorted = [];
const state = { tab:0, urg:'all', q:'', year:'all', page:1 };
const isNew = it => (Date.now() - parse(it.date).getTime()) / DAY <= NEW_DAYS;
const hay = it => (it.title+' '+clean(it.no)+' '+clean(it.from)).toLowerCase();
const catOf = it => CATS[it.ci];

function buildYears(){
  const ys = [...new Set(NEWS.map(n => fiscalYear(n.date)))].sort((a,b) => b - a);
  $('year').innerHTML = '<option value="all">ทุกปี</option>' + ys.map(y => '<option value="'+y+'">'+y+'</option>').join('');
}

function renderTabs(){
  $('tabs').innerHTML = CATS.map((c, i) => {
    const n = NEWS.filter(x => x.ci === i).length, sel = i === state.tab;
    return '<button type="button" role="tab" class="tab c'+c.color+'" data-tab="'+i+'" aria-selected="'+sel+'" tabindex="'+(sel ? 0 : -1)+'"><span class="dot" aria-hidden="true"></span>'+esc(c.name)+' <span class="count">'+n+'</span></button>';
  }).join('');
}

function filtered(){
  const q = state.q.trim().toLowerCase();
  return sorted.filter(it =>
    it.ci === state.tab &&
    (state.urg === 'all' || it.urg === state.urg) &&
    (state.year === 'all' || String(fiscalYear(it.date)) === state.year) &&
    (!q || hay(it).includes(q))
  );
}

function badges(it){
  return '<span class="card-ico">'+icon('doc')+'</span><div class="badges">'+
    '<span class="badge b-cat">'+esc(catOf(it).name)+'</span>'+
    (it.urg === 'most' ? '<span class="badge b-most">ด่วนที่สุด</span>' : '')+
    (it.urg === 'very' ? '<span class="badge b-very">ด่วนมาก</span>' : '')+
    (isNew(it) ? '<span class="badge b-new">ใหม่</span>' : '')+
  '</div>';
}
function metaRows(it){
  const no = clean(it.no), from = clean(it.from), dl = clean(it.deadline);
  return (no ? '<dt>เลขที่</dt><dd>'+esc(no)+'</dd>' : '')+
    (from ? '<dt>จาก</dt><dd>'+esc(from)+'</dd>' : '')+
    (dl ? '<dt class="dl">ปิดรับ</dt><dd class="dl">'+esc(dl)+'</dd>' : '');
}

function card(it){
  return '<article class="card c'+catOf(it).color+'">'+
    '<div class="card-top">'+badges(it)+'</div>'+
    '<h3><button type="button" class="card-link" data-id="'+esc(it.id)+'">'+esc(it.title)+'</button></h3>'+
    '<dl class="meta">'+metaRows(it)+'</dl>'+
    '<div class="card-foot"><span class="date">'+icon('calendar', 16)+'<time datetime="'+esc(it.date)+'">'+thaiDate(it.date)+'</time></span>'+
    '<span class="btn" aria-hidden="true">อ่านรายละเอียด</span></div>'+
  '</article>';
}

function render(){
  renderTabs();
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  if (state.page > pages) state.page = pages;
  $('list').innerHTML = rows.slice((state.page-1)*PER_PAGE, state.page*PER_PAGE).map(card).join('');
  $('empty').hidden = rows.length > 0;

  const parts = [], q = state.q.trim();
  if (q) parts.push('คำค้น “'+q+'”');
  if (state.urg !== 'all') parts.push(state.urg === 'most' ? 'ด่วนที่สุด' : 'ด่วนมาก');
  if (state.year !== 'all') parts.push('ปีงบประมาณ '+state.year);
  $('resultTitle').hidden = !parts.length;
  $('resultTitle').textContent = parts.length ? 'พบ '+rows.length+' รายการ · '+parts.join(' · ') : '';
  $('live').textContent = 'พบ '+rows.length+' รายการ';

  let p = '<button type="button" data-page="'+(state.page-1)+'" aria-label="หน้าก่อนหน้า"'+(state.page === 1 ? ' disabled' : '')+'>‹</button>';
  for (let i = 1; i <= pages; i++) p += '<button type="button" data-page="'+i+'"'+(i === state.page ? ' aria-current="page"' : '')+'>'+i+'</button>';
  p += '<button type="button" data-page="'+(state.page+1)+'" aria-label="หน้าถัดไป"'+(state.page === pages ? ' disabled' : '')+'>›</button>';
  $('pager').innerHTML = pages > 1 ? p : '';
}

function openDetail(id, opener){
  const it = NEWS.find(n => String(n.id) === id); if (!it) return;
  $('dTop').className = 'card-top c'+catOf(it).color;
  $('dTop').innerHTML = badges(it);
  $('dTitle').textContent = it.title;
  $('dMeta').innerHTML = metaRows(it)+'<dt>วันที่</dt><dd>'+thaiDate(it.date)+'</dd><dt>ปีงบประมาณ</dt><dd>'+fiscalYear(it.date)+'</dd>';
  $('detail').opener = opener;
  $('detail').showModal();
}
$('list').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  const b = c.querySelector('[data-id]'); openDetail(b.dataset.id, b);
});
$('dClose').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('click', e => { if (e.target === $('detail')) $('detail').close(); });
$('detail').addEventListener('close', () => $('detail').opener?.focus());

function setTab(i){ state.tab = i; state.page = 1; render(); $('tabs').querySelector('[aria-selected="true"]')?.focus(); }
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(+b.dataset.tab); });
$('tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft','ArrowRight'].includes(e.key) || !CATS.length) return;
  const n = CATS.length;
  setTab((state.tab + (e.key === 'ArrowRight' ? 1 : -1) + n) % n);
});
$('pills').addEventListener('click', e => {
  const b = e.target.closest('[data-urg]'); if (!b) return;
  state.urg = b.dataset.urg; state.page = 1;
  $('pills').querySelectorAll('[data-urg]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
});
$('q').addEventListener('input', e => { state.q = e.target.value; state.page = 1; render(); });
$('year').addEventListener('change', e => { state.year = e.target.value; state.page = 1; render(); });
$('pager').addEventListener('click', e => {
  const b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
  state.page = +b.dataset.page; render(); $('content').scrollIntoView({behavior:'smooth'});
});
// ช่องค้นหาบนหัวเว็บ: ไปที่หมวดแรกที่มีผลลัพธ์
$('gsearch').addEventListener('submit', e => {
  e.preventDefault();
  const raw = $('gq').value.trim().slice(0, 100), q = raw.toLowerCase(); if (!q) return;
  const hit = sorted.find(it => hay(it).includes(q));
  if (hit) state.tab = hit.ci;
  state.q = raw; state.page = 1;
  $('q').value = raw; $('gq').value = ''; render();
  $('content').focus({preventScroll:true}); $('content').scrollIntoView({behavior:'smooth'});
});
$('clearSearch').addEventListener('click', () => {
  state.q = ''; state.urg = 'all'; state.year = 'all'; state.page = 1;
  $('q').value = ''; $('year').value = 'all';
  $('pills').querySelectorAll('[data-urg]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.urg === 'all')));
  render(); $('q').focus();
});

// ข้อมูลจาก Firestore ตรวจรูปแบบอีกชั้นก่อนแสดง; ข่าวในหมวดที่ปิดใช้งานไม่แสดง
function normalize(id, d){
  const s = v => typeof v === 'string' ? v : '';
  if (!Number.isInteger(d.cat) || !catIndex.has(d.cat) || !/^\d{4}-\d{2}-\d{2}$/.test(s(d.date)) || !s(d.title)) return null;
  return { id, ci:catIndex.get(d.cat), date:d.date, urg:['very','most'].includes(d.urg) ? d.urg : '', no:s(d.no), from:s(d.from), deadline:s(d.deadline), title:d.title };
}

async function loadNews(){
  if (!configured) return SEED_NEWS.map(n => normalize(n.id, n)).filter(Boolean);
  const { db, F } = await fb();
  // ต้องกรอง published == true เสมอ กฎ Firestore อนุญาตให้คนทั่วไปอ่านเฉพาะข่าวที่เผยแพร่
  const snap = await F.getDocs(F.query(F.collection(db, 'news'), F.where('published', '==', true)));
  return snap.docs.map(d => normalize(d.id, d.data())).filter(Boolean);
}

function start(list){
  NEWS = list;
  sorted = NEWS.slice().sort((a,b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  $('lastUpdate').textContent = sorted.length ? thaiDate(sorted[0].date) : '-';
  if (state.tab >= CATS.length) state.tab = 0;
  buildYears();
  render();
}

$('empty').textContent = 'กำลังโหลดข่าว…'; $('empty').hidden = false;
loadSite().catch(() => siteDefaults()).then(async site => {
  applySite(site);
  const list = await loadNews();
  $('empty').textContent = 'ไม่พบรายการที่ตรงกับเงื่อนไข ลองเปลี่ยนคำค้นหรือตัวกรอง';
  start(list);
}).catch(() => {
  $('empty').textContent = 'โหลดข่าวไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วรีเฟรชหน้า';
  $('empty').hidden = false;
});
