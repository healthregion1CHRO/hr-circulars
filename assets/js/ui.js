// ตัวช่วยที่ใช้ร่วมกันทุกหน้า
export const $ = id => document.getElementById(id);
export function store(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
export function load(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
// ข้อความจากผู้ใช้/ฐานข้อมูลต้องผ่าน esc() ก่อนใส่ใน innerHTML ทุกครั้ง (กัน XSS)
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ค่าที่เป็นข้อความตัวอย่าง [ ... ] ทั้งช่อง ไม่แสดง
export const clean = s => /^\[[^\]]*\]$/.test(String(s || '').trim()) ? '' : String(s || '').trim();

export const CATEGORIES = [
  { name:'หนังสือเวียนทั่วไป', color:0 },
  { name:'ข่าวประชาสัมพันธ์', color:1 },
  { name:'ข่าวรับสมัครงาน', color:2 },
  { name:'รับสมัครข้าราชการ', color:3 },
  { name:'ข่าวโอนย้ายข้าราชการ', color:4 },
];
export const URG = { '':'ปกติ', very:'ด่วนมาก', most:'ด่วนที่สุด' };

const ICONS = {
  user:'<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-4 4-6 8-6s7 2 8 6"></path>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 11h18"></path>',
  doccheck:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><path d="M9 15l2 2 4-4"></path>',
  chart:'<path d="M3 20h18"></path><path d="M6 16V9M11 16V5M16 16v-4"></path>',
  home:'<path d="M3 11l9-7 9 7"></path><path d="M5 10v10h14V10"></path>',
  doc:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><path d="M8 13h8M8 17h5"></path>',
  swap:'<path d="M7 4L3 8l4 4"></path><path d="M3 8h14"></path><path d="M17 20l4-4-4-4"></path><path d="M21 16H7"></path>',
  target:'<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
  checklist:'<path d="M9 6h11M9 12h11M9 18h11"></path><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"></path>',
  award:'<circle cx="12" cy="9" r="5"></circle><path d="M8.5 13l-1.5 8 5-3 5 3-1.5-8"></path>',
  grad:'<path d="M2 8l10-5 10 5-10 5z"></path><path d="M6 10v6c3 2 9 2 12 0v-6"></path>',
  bulb:'<path d="M9 18h6M10 21h4"></path><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"></path>',
  download:'<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M4 21h16"></path>',
  help:'<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7"></path><path d="M12 17h.01"></path>',
  chat:'<path d="M4 4h16v12H8l-4 4z"></path>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1z"></path>',
  link:'<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"></path><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"></path>',
  settings:'<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>',
  search:'<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>',
  users:'<circle cx="9" cy="8" r="4"></circle><path d="M2 21c1-4 3.5-6 7-6s6 2 7 6"></path><path d="M16 4a4 4 0 0 1 0 8M22 21c-.5-3-2-5-4-5.7"></path>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
};
export const icon = (name, size = 20) => '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[name] || ICONS.link)+'</svg>';

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
export const thaiDate = s => { if (!isIso(s)) return ''; const d = parse(s); return d.getDate()+' '+MONTHS[d.getMonth()]+' '+(d.getFullYear()+543); };
// ปีงบประมาณเริ่ม 1 ต.ค.
export const fiscalYear = s => { const d = parse(s); return d.getFullYear()+543+(d.getMonth() >= 9 ? 1 : 0); };
export const thaiDateTime = d => d ? d.toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '';

// หัวเว็บ: ไอคอน ขนาดตัวอักษร ธีม เมนูมือถือ
export function initChrome(){
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, +(el.dataset.size || 20)); });
  const setSize = s => {
    if (s === 'md') document.documentElement.removeAttribute('data-size'); else document.documentElement.setAttribute('data-size', s);
    document.querySelectorAll('.seg [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === s)));
    store('hr-size', s);
  };
  const seg = document.querySelector('.seg');
  if (seg) { seg.addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (b) setSize(b.dataset.size); }); setSize(load('hr-size') || 'md'); }
  $('themeBtn')?.addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme');
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark'); store('hr-theme', dark ? 'light' : 'dark');
  });
  $('menuBtn')?.addEventListener('click', () => {
    const open = $($('menuBtn').getAttribute('aria-controls')).classList.toggle('open');
    $('menuBtn').setAttribute('aria-expanded', String(open));
  });
  // ลิงก์ที่ยังไม่มีปลายทาง ไม่ให้เด้งขึ้นบนสุดของหน้า
  document.addEventListener('click', e => { if (e.target.closest('a[href="#"]')) e.preventDefault(); });
}

export function toast(msg){
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3000);
}

// แสดงข้อความแจ้งเตือนในกล่อง .alert (ใช้ textContent เสมอ)
export function say(el, kind, msg){
  el.className = 'alert ' + kind; el.textContent = msg; el.hidden = !msg;
}
