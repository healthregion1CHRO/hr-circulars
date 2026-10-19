// โหมดตัวอย่างหลังบ้าน: จำลอง Firebase Auth/Firestore ในหน่วยความจำ ให้ลองใช้ก่อนตั้งค่า Firebase
// เปิดได้เฉพาะตอนที่ยังไม่ตั้งค่า Firebase (admin.js ตรวจ) ข้อมูลหายเมื่อรีเฟรช ไม่มีการบันทึกที่ใดเลย
import { SEED_NEWS } from './seed.js';

const stamp = d => ({ toDate: () => d });
const daysAgo = n => stamp(new Date(Date.now() - n * 86400000));

export function demoBackend(){
  const me = { uid: 'demo-admin', email: 'admin@example.com', displayName: 'ผู้ดูแลระบบ (ตัวอย่าง)', emailVerified: true };
  const store = {
    news: new Map(SEED_NEWS.map((s, i) => [s.id, {
      cat: s.cat, title: s.title, no: s.no, from: s.from, urg: s.urg, date: s.date, deadline: s.deadline,
      published: i !== 7, createdBy: me.uid, createdAt: daysAgo(5), updatedBy: i % 3 ? me.uid : 'demo-2', updatedByName: i % 3 ? me.displayName : 'สมชาย ตัวอย่าง', updatedAt: daysAgo(5 - i % 5),
    }])),
    users: new Map([
      [me.uid, { email: me.email, name: me.displayName, org: 'กลุ่มงานบริหารทรัพยากรบุคคล', status: 'approved', role: 'admin', createdAt: daysAgo(30) }],
      ['demo-2', { email: 'staff1@example.com', name: 'สมชาย ตัวอย่าง', org: 'กลุ่มงานบรรจุแต่งตั้ง', status: 'approved', role: 'editor', createdAt: daysAgo(12) }],
      ['demo-3', { email: 'staff2@example.com', name: 'สมหญิง ตัวอย่าง', org: 'กลุ่มงานพัฒนาบุคลากร', status: 'pending', role: 'editor', createdAt: daysAgo(1) }],
      ['demo-4', { email: 'staff3@example.com', name: 'สมศักดิ์ ตัวอย่าง', org: 'โรงพยาบาลตัวอย่าง', status: 'pending', role: 'editor', createdAt: daysAgo(0) }],
    ]),
    audit: new Map([
      ['a1', { uid: 'demo-2', email: 'staff1@example.com', action: 'news.create', target: 's1 ' + SEED_NEWS[0].title, at: daysAgo(5) }],
      ['a2', { uid: me.uid, email: me.email, action: 'user.approve', target: 'staff1@example.com', at: daysAgo(12) }],
    ]),
  };
  let seq = 0;
  const newId = () => 'demo' + Date.now().toString(36) + (seq++);
  const snapOf = (id, data) => ({ id, data: () => ({ ...data }), exists: () => data !== undefined });

  const F = {
    collection: (db, name) => ({ col: name }),
    doc: (a, name, id) => a.col ? { col: a.col, id: newId() } : { col: name, id },
    query: (col, ...mods) => ({ col: col.col, mods }),
    orderBy: (field, dir) => ({ orderBy: field, dir }),
    limit: n => ({ limit: n }),
    where: () => ({}),
    serverTimestamp: () => stamp(new Date()),
    async getDoc(ref){ return snapOf(ref.id, store[ref.col].get(ref.id)); },
    async getDocs(ref){
      let rows = [...store[ref.col].entries()];
      for (const m of ref.mods || []) {
        if (m.orderBy) rows.sort((a, b) => (b[1][m.orderBy].toDate() - a[1][m.orderBy].toDate()) * (m.dir === 'desc' ? 1 : -1));
        if (m.limit) rows = rows.slice(0, m.limit);
      }
      return { docs: rows.map(([id, d]) => snapOf(id, d)) };
    },
    async setDoc(ref, data){ store[ref.col].set(ref.id, { ...data }); },
    async addDoc(col, data){ const id = newId(); store[col.col].set(id, { ...data }); return { id }; },
    async updateDoc(ref, data){ store[ref.col].set(ref.id, { ...store[ref.col].get(ref.id), ...data }); },
    async deleteDoc(ref){ store[ref.col].delete(ref.id); },
    writeBatch(){
      const ops = [];
      return { set: (ref, data) => ops.push([ref, data]), async commit(){ ops.forEach(([r, d]) => store[r.col].set(r.id, { ...d })); } };
    },
  };
  let listener = null;
  const A = {
    onAuthStateChanged(auth, cb){ listener = cb; setTimeout(() => cb(me), 0); return () => { listener = null; }; },
    async signOut(){ listener?.(null); },
    async sendPasswordResetEmail(){},
  };
  return { auth: {}, db: {}, A, F };
}
