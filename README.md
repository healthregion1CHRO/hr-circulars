# หนังสือเวียนและข่าวสาร กลุ่มงานบริหารทรัพยากรบุคคล สำนักงานเขตสุขภาพที่ 1

เว็บ static บน GitHub Pages: https://healthregion1chro.github.io/hr-circulars/
ใช้ Firebase (Authentication + Firestore) ทำระบบสมาชิก (เข้าสู่ระบบ / สมัคร) และหลังบ้านจัดการข่าว

| หน้า | ใช้ทำอะไร |
|---|---|
| `index.html` | หน้าแรก แสดงข่าวที่เผยแพร่ (ยังไม่ตั้งค่า Firebase = แสดงข่าวตัวอย่าง) |
| `login.html` | เข้าสู่ระบบ / ลืมรหัสผ่าน |
| `register.html` | สมัครสมาชิก (ต้องยืนยันอีเมล + รอแอดมินอนุมัติ) |
| `admin.html` | หลังบ้าน: เพิ่ม/แก้/ซ่อน/ลบข่าว, อนุมัติผู้ใช้, บันทึกการใช้งาน |

## ตั้งค่าครั้งแรก (ทำครั้งเดียว ประมาณ 15 นาที)

1. **สร้างโปรเจกต์** ที่ https://console.firebase.google.com › Add project (ไม่ต้องเปิด Google Analytics)
2. **เพิ่มเว็บแอป**: Project settings › Your apps › ไอคอน `</>` › ตั้งชื่อ › คัดลอกค่า `firebaseConfig`
   ไปวางใน `assets/js/firebase-config.js` (ค่านี้ไม่ใช่ความลับ เปิดเผยได้)
3. **เปิด Authentication**: Build › Authentication › Get started › Sign-in method › เปิด **Email/Password** (ไม่ต้องเปิด Email link)
   - Settings › **Authorized domains**: เพิ่ม `healthregion1chro.github.io` และลบ domain ที่ไม่ใช้
   - Settings › **User actions**: เปิด *Email enumeration protection* (ปกติเปิดอยู่แล้วในโปรเจกต์ใหม่)
   - Settings › **Password policy**: เลือก *Require enforcement* ความยาวอย่างน้อย 12 + ตัวพิมพ์เล็ก/ใหญ่/ตัวเลข/อักขระพิเศษ
   - Templates: เปลี่ยนภาษาอีเมลเป็นภาษาไทยได้
4. **สร้าง Firestore**: Build › Firestore Database › Create database › เลือก **Production mode**, ตำแหน่ง `asia-southeast1` (สิงคโปร์)
   - แท็บ **Rules**: วางเนื้อหาทั้งไฟล์ `firestore.rules` › Publish
5. **commit + push** ไฟล์ `firebase-config.js` ขึ้น GitHub (หน้าเว็บอัปเดตใน 1–2 นาที)
6. **ตั้งแอดมินคนแรก**
   1. เปิด `register.html` สมัครด้วยอีเมลของผู้ดูแล › เปิดลิงก์ยืนยันในอีเมล
   2. ใน Firestore console › คอลเลกชัน `users` › เอกสารของตัวเอง › แก้ `status` = `approved` และ `role` = `admin`
      (แก้ใน console ได้เพราะ console ไม่ผ่านกฎ — ในเว็บไม่มีใครตั้งตัวเองเป็นแอดมินได้)
   3. เข้า `login.html` › หลังบ้าน › กด **นำเข้าข่าวตัวอย่าง 12 รายการ** (ถ้าต้องการ)
7. **(แนะนำ) App Check** กันบอท/สคริปต์ที่ไม่ได้มาจากเว็บนี้:
   สร้าง reCAPTCHA v3 site key ที่ https://www.google.com/recaptcha/admin (domain `healthregion1chro.github.io`)
   › Firebase › App Check › Register เว็บแอปด้วย secret key › ใส่ site key ใน `appCheckSiteKey` ใน `firebase-config.js`
   › ดูยอดใช้งานสัก 1–2 วันว่าคำขอผ่านหมด แล้วกด **Enforce** ให้ Firestore และ Authentication

## ความปลอดภัยที่มี

**การยืนยันตัวตน (Firebase Authentication)**
- รหัสผ่านเก็บแบบ hash (scrypt) ที่ Google ไม่มีใครเห็นรหัสผ่านจริง ส่งผ่าน HTTPS เท่านั้น
- นโยบายรหัสผ่าน: อย่างน้อย 12 ตัว มีตัวพิมพ์เล็ก/ใหญ่ ตัวเลข อักขระพิเศษ ไม่ใช่รหัสยอดนิยม/ไม่มีชื่ออีเมล (ตรวจในหน้าเว็บ + บังคับที่ Firebase เมื่อเปิด Password policy)
- ต้องยืนยันอีเมลก่อน และแอดมินต้องอนุมัติก่อนจึงเข้าหลังบ้านได้
- ล็อกชั่วคราวเมื่อใส่รหัสผิดหลายครั้ง (Firebase ฝั่งเซิร์ฟเวอร์) + หน่วงเวลาเพิ่มขึ้นเรื่อยๆ ในหน้าเว็บ
- ข้อความผิดพลาดไม่บอกว่าอีเมลมีในระบบหรือไม่ (เข้าระบบ / สมัคร / ลืมรหัสผ่าน) กันการเดารายชื่อบัญชี
- session หมดเมื่อปิดแท็บ และออกจากระบบอัตโนมัติเมื่อไม่ใช้งาน 30 นาที

**สิทธิ์และข้อมูล (`firestore.rules` บังคับที่เซิร์ฟเวอร์)**
- คนทั่วไปอ่านได้เฉพาะข่าวที่เผยแพร่ ห้ามเขียนทุกอย่าง
- ผู้ที่สมัครตั้งสิทธิ์ตัวเองไม่ได้ (บังคับ `pending` + `editor`) แอดมินเปลี่ยนสิทธิ์ตัวเองไม่ได้
- ตรวจชนิดและความยาวทุกช่องของข่าว ห้ามมีช่องเกิน เวลาสร้าง/แก้ไขต้องเป็นเวลาเซิร์ฟเวอร์ ผู้แก้ไขต้องเป็นตัวเอง
- ลบข่าวได้เฉพาะแอดมิน, บันทึกการใช้งานเพิ่มได้อย่างเดียว แก้/ลบไม่ได้ อ่านได้เฉพาะแอดมิน
- คอลเลกชันอื่นปิดทั้งหมด

**หน้าเว็บ**
- Content-Security-Policy: สคริปต์มาจากเว็บนี้และ Firebase SDK เท่านั้น ห้ามสคริปต์ในบรรทัด `object-src 'none'`, `base-uri 'none'`
- ข้อความทุกช่องผ่านการ escape ก่อนแสดง (กัน XSS)
- หน้าเข้าสู่ระบบ/สมัคร/หลังบ้าน ไม่ยอมแสดงใน iframe ของเว็บอื่น (กัน clickjacking) และมี `noindex`
- Firebase SDK pin เวอร์ชัน (10.12.2) โหลดจาก `www.gstatic.com` ของ Google

## ข้อจำกัดที่ควรรู้
- GitHub Pages ตั้ง HTTP security header เองไม่ได้ (เช่น HSTS, X-Frame-Options) จึงใช้ `<meta>` CSP + สคริปต์กัน iframe แทน ถ้าต้องการ header เต็มรูปแบบ ย้ายไป Firebase Hosting (ฟรี) ได้
- บันทึกการใช้งานเขียนจากหน้าเว็บ คนที่มีสิทธิ์เจ้าหน้าที่และแก้โค้ดในเบราว์เซอร์เองอาจข้ามการบันทึกได้ (แต่ปลอมชื่อ/เวลาไม่ได้) ถ้าต้องการบันทึกที่ข้ามไม่ได้ ต้องใช้ Cloud Functions (แผน Blaze)
- การยืนยันตัวตน 2 ชั้น (MFA) ต้องอัปเกรดเป็น Identity Platform ใน Firebase ก่อน
- โควตาฟรี (Spark): อ่าน 50,000 / เขียน 20,000 ครั้งต่อวัน เพียงพอสำหรับเว็บข่าวของหน่วยงาน
