// Kar-Men ERP · sunucu fonksiyonları (bölge: europe-west3, Firestore ile aynı)
// Yükleme: Cloud Shell'de proje klasöründe  ->  cd functions && npm install && cd .. && firebase deploy --only functions
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: "europe-west3", maxInstances: 3, memory: "256MiB" });

// Formun gömülebileceği siteler (WordPress siteleri ve GitHub Pages)
const IZINLI = [/^https:\/\/([a-z0-9-]+\.)?kar-men\.com\.tr$/i, /^https:\/\/karmenairtech\.github\.io$/i, /^http:\/\/localhost(:\d+)?$/i];
const LIMIT_SAAT = 5;   // aynı bağlantıdan saatte en fazla teklif isteği

let KAT = null, KAT_AT = 0;
async function katalog() {
  if (KAT && Date.now() - KAT_AT < 10 * 60e3) return KAT;
  const s = await db.doc("web_katalog/v1").get();
  const j = s.exists ? JSON.parse(s.data().json || "{}") : { u: [] }; j.u = j.u || [];
  for (let i = 0; i < (Number(j.parca) || 0); i++) { const p = await db.doc("web_katalog/p" + i).get(); if (p.exists) j.u.push(...JSON.parse(p.data().json || "[]")); }
  KAT = new Map((j.u || []).map(u => [u[0], { id: u[0], kod: u[1], ad: u[2], birim: u[3] || "Adet" }])); KAT_AT = Date.now();
  return KAT;
}
const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

exports.webTeklif = onRequest({ cors: IZINLI, invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false, hata: "Yalnızca POST" }); return; }
  try {
    const b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    if (JSON.stringify(b).length > 60000) { res.status(413).json({ ok: false, hata: "İstek çok büyük" }); return; }
    // bot önlemleri: gizli alan doluysa ya da form 3 saniyeden kısa sürede doldurulduysa sessizce kabul edilmiş gibi dön
    if (b.site || Number(b.sure) < 3000) { res.json({ ok: true, no: "WT-" + new Date().getFullYear() + "-0000" }); return; }
    const k = b.kisi || {}, kisi = { firma: str(k.firma, 120), ad: str(k.ad, 80), tel: str(k.tel, 20), eposta: str(k.eposta, 120).toLowerCase(), il: str(k.il, 40), proje: str(k.proje, 120) };
    if (!kisi.firma || !kisi.ad) { res.status(400).json({ ok: false, hata: "Firma adı ve ad soyad zorunludur" }); return; }
    if (kisi.tel.replace(/\D/g, "").length < 10) { res.status(400).json({ ok: false, hata: "Geçerli bir telefon numarası yazın" }); return; }
    if (kisi.eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kisi.eposta)) { res.status(400).json({ ok: false, hata: "E-posta adresini kontrol edin" }); return; }
    if (b.kvkk !== true) { res.status(400).json({ ok: false, hata: "KVKK onayı gerekli" }); return; }
    const K = await katalog(), Lg = Array.isArray(b.kalemler) ? b.kalemler.slice(0, 80) : [];
    const kalemler = Lg.map(x => { const u = K.get(String(x && x.id)); if (!u) return null; const r = x.renk || {}, v = {};
      Object.entries(x.var || {}).slice(0, 12).forEach(([a, val]) => { const ka = str(a, 40), va = str(val, 60); if (ka && va) v[ka] = va; });
      return { sid: u.id, kod: u.kod, ad: u.ad, birim: u.birim, miktar: Math.max(1, Math.min(1e6, Math.round(Number(x.miktar) || 1))),
        renk: r.yuzey ? { yuzey: str(r.yuzey, 40), ...(r.kod ? { kod: str(r.kod, 6) } : {}) } : null, var: v, not: str(x.not, 300) }; }).filter(Boolean);
    if (!kalemler.length) { res.status(400).json({ ok: false, hata: "Listenizde geçerli ürün yok" }); return; }
    // aynı bağlantıdan saatte en fazla LIMIT_SAAT istek (IP saklanmaz, yalnızca özeti)
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const ipH = crypto.createHash("sha256").update(ip + "|karmen").digest("hex").slice(0, 32);
    const yil = new Date().getFullYear();
    const no = await db.runTransaction(async t => {
      const lr = db.doc("web_limit/" + ipH), sr = db.doc("sayac/WT-" + yil);
      const [ls, ss] = await Promise.all([t.get(lr), t.get(sr)]);
      const now = Date.now(), L = ((ls.exists && ls.data().t) || []).filter(x => now - x < 3600e3);
      if (L.length >= LIMIT_SAAT) return null;
      const n = ((ss.exists && ss.data().n) || 0) + 1;
      t.set(lr, { t: [...L, now] }); t.set(sr, { n, at: now });
      const no = `WT-${yil}-${String(n).padStart(4, "0")}`;
      t.set(db.collection("web_talep").doc(), { no, at: now, durum: "yeni", kaynak: "web", kisi, not: str(b.not, 1000), kalemler, ipH, sayfa: str(b.sayfa, 200), ua: str(req.headers["user-agent"], 160), log: [{ at: now, by: "Web sitesi", t: "Teklif isteği alındı" }] });
      return no;
    });
    if (!no) { res.status(429).json({ ok: false, hata: "Çok fazla istek gönderildi, lütfen bir süre sonra tekrar deneyin" }); return; }
    logger.info("web teklif", { no, kalem: kalemler.length });
    res.json({ ok: true, no });
  } catch (e) { logger.error(e); res.status(500).json({ ok: false, hata: "Sunucu hatası" }); }
});
