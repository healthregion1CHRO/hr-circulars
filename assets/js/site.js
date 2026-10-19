// ค่าของเว็บ (ตั้งค่า/หมวดข่าว/เมนูและลิงก์) จาก Firestore — ยังไม่ตั้งค่า Firebase หรือยังไม่ได้นำเข้า = ค่าเริ่มต้นใน seed.js
import { configured, fb } from './fb.js';
import { LINK_ICONS, LINK_GROUPS } from './ui.js';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_LINKS } from './seed.js';

const s = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
const int = (v, min, max, dflt) => Number.isInteger(v) && v >= min && v <= max ? v : dflt;
export const byOrder = (a, b) => a.order - b.order || String(a.name || a.title).localeCompare(String(b.name || b.title), 'th');

// ตรวจรูปแบบข้อมูลอีกชั้นก่อนใช้ (กฎ Firestore ตรวจแล้ว แต่หน้าเว็บไม่เชื่อข้อมูลภายนอกโดยตรง)
export function cleanSettings(d = {}){
  return {
    siteName: s(d.siteName, 100) || DEFAULT_SETTINGS.siteName,
    orgName: s(d.orgName, 150),
    heroTitle: s(d.heroTitle, 150) || DEFAULT_SETTINGS.heroTitle,
    heroSubtitle: s(d.heroSubtitle, 300),
    address: s(d.address, 300),
    phone: s(d.phone, 100),
    email: s(d.email, 120),
    perPage: int(d.perPage, 1, 48, DEFAULT_SETTINGS.perPage),
    newDays: int(d.newDays, 0, 60, DEFAULT_SETTINGS.newDays),
  };
}
export function cleanCategory(d, id){
  if (!Number.isInteger(d.key) || !s(d.name, 60)) return null;
  return { id, key: d.key, name: s(d.name, 60), color: int(d.color, 0, 4, 0), order: int(d.order, -1000, 1000, 0), active: d.active !== false, updatedAt: d.updatedAt };
}
export function cleanLink(d, id){
  if (!LINK_GROUPS[d.grp] || !s(d.title, 80)) return null;
  return { id, grp: d.grp, title: s(d.title, 80), sub: s(d.sub, 120), url: s(d.url, 500), icon: LINK_ICONS.includes(d.icon) ? d.icon : 'link',
           color: int(d.color, 0, 4, 0), order: int(d.order, -1000, 1000, 0), active: d.active !== false, updatedAt: d.updatedAt };
}

export const siteDefaults = () => ({
  settings: { ...DEFAULT_SETTINGS },
  categories: DEFAULT_CATEGORIES.map(c => ({ ...c, id: String(c.key) })),
  links: DEFAULT_LINKS.map((l, i) => ({ ...l, id: 'd' + i })),
  fromDefaults: { settings: true, categories: true, links: true },
});

// ทั้งหมด รวมรายการที่ปิดใช้งาน (หลังบ้าน) — หน้าเว็บกรอง active เอง
export async function loadSite(){
  const out = siteDefaults();
  if (!configured) return out;
  const { db, F } = await fb();
  const [st, cs, ls] = await Promise.all([
    F.getDoc(F.doc(db, 'settings', 'site')),
    F.getDocs(F.collection(db, 'categories')),
    F.getDocs(F.collection(db, 'links')),
  ]);
  if (st.exists()) { out.settings = cleanSettings(st.data()); out.fromDefaults.settings = false; }
  const cats = cs.docs.map(d => cleanCategory(d.data(), d.id)).filter(Boolean);
  if (cats.length) { out.categories = cats; out.fromDefaults.categories = false; }
  const links = ls.docs.map(d => cleanLink(d.data(), d.id)).filter(Boolean);
  if (links.length) { out.links = links; out.fromDefaults.links = false; }
  out.categories.sort(byOrder); out.links.sort(byOrder);
  return out;
}
