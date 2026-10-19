// โหลดใน <head> แบบปกติ (ไม่ใช่ module) เพื่อใช้ธีม/ขนาดตัวอักษรที่บันทึกไว้ก่อนแสดงผล (ป้องกันหน้ากระพริบ)
(function () {
  try {
    var t = localStorage.getItem('hr-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    var s = localStorage.getItem('hr-size');
    if (s === 'sm' || s === 'lg') document.documentElement.setAttribute('data-size', s);
  } catch (e) {}
  // กัน clickjacking: GitHub Pages ตั้ง header X-Frame-Options ไม่ได้ หน้าที่มี data-noframe จึงไม่ยอมแสดงใน iframe ของเว็บอื่น
  if (document.documentElement.hasAttribute('data-noframe') && window.top !== window.self) {
    document.documentElement.setAttribute('hidden', '');
    try { window.top.location = window.self.location.href; } catch (e) {}
  }
})();
