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

/* ================= ANLIK BİLDİRİMLER (FCM web push) =================
   Cihazlar push_token/{token} belgesine kaydolur (uid, email). Olaylar Firestore tetikleyicileriyle yakalanır,
   alıcının bildirim tercihleri (reads/{uid}.notifPrefs) kontrol edilir ve telefon/bilgisayara bildirim gönderilir.
   Etiketler (tag) uygulamanın kendi bildirimleriyle aynıdır: aynı olay iki kez görünmez. */
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const BOOT = ["planlama.karmen@gmail.com"];
let UYE = null, UYE_AT = 0;
async function uyeler() {
  if (UYE && Date.now() - UYE_AT < 5 * 60e3) return UYE;
  const s = await db.doc("config/access").get(), M = (s.exists && s.data().members) || {};
  UYE = Object.entries(M).map(([e, m]) => ({ email: e.toLowerCase(), name: (m && m.name) || "", admin: (m && m.role === "admin") || BOOT.includes(e.toLowerCase()), acts: (m && m.acts) || {}, mods: (m && m.mods) || null }));
  BOOT.forEach(b => { if (!UYE.some(u => u.email === b)) UYE.push({ email: b, name: "", admin: true, acts: {}, mods: null }); });
  UYE_AT = Date.now(); return UYE;
}
const adiyla = (U, ad) => ad ? U.filter(u => u.name && u.name.trim().toLocaleLowerCase("tr") === String(ad).trim().toLocaleLowerCase("tr")).map(u => u.email) : [];
const yetkili = (U, act, mod) => U.filter(u => u.admin || u.acts[act] === true || (mod && u.mods && u.mods[mod] && u.mods[mod] !== "none" && !act)).map(u => u.email);
const kisalt = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// alıcılara gönder: kat = tercih anahtarı (msg, disis, proje), haric = olayı yapan kişinin e-postası
async function gonder(epostalar, { title, body, mod, ref, tag, kat, ttl = 86400, haric }) {
  const E = [...new Set((epostalar || []).map(e => String(e || "").toLowerCase()).filter(e => e && e !== haric))];
  if (!E.length) return 0;
  const T = [];
  for (let i = 0; i < E.length; i += 30) { const s = await db.collection("push_token").where("email", "in", E.slice(i, i + 30)).get(); s.docs.forEach(d => T.push({ id: d.id, ...d.data() })); }
  if (!T.length) return 0;
  const tercih = new Map();
  for (const uid of new Set(T.map(t => t.uid))) { const r = await db.doc("reads/" + uid).get(); tercih.set(uid, (r.exists && r.data().notifPrefs) || {}); }
  const tokens = T.filter(t => { const p = tercih.get(t.uid) || {}; return p.system !== false && (!kat || p[kat] !== false); }).map(t => t.id);
  if (!tokens.length) return 0;
  const data = { title: kisalt(title, 120), body: kisalt(body, 240), mod: mod || "", ref: ref || "", tag: tag || "" };
  let n = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const part = tokens.slice(i, i + 500);
    const r = await admin.messaging().sendEachForMulticast({ tokens: part, data, webpush: { headers: { Urgency: "high", TTL: String(ttl) } } });
    n += r.successCount;
    const sil = r.responses.map((x, k) => !x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test((x.error && x.error.code) || "") ? part[k] : null).filter(Boolean);
    await Promise.all(sil.map(t => db.doc("push_token/" + t).delete().catch(() => {})));
  }
  return n;
}
const tetikOpt = { region: "europe-west3", database: "(default)" };
// Mesajlar
exports.pushMesaj = onDocumentCreated({ ...tetikOpt, document: "messages/{id}" }, async ev => {
  const m = ev.data && ev.data.data(); if (!m || m.call) return;
  const U = await uyeler(), from = String(m.from || "").toLowerCase(), ad = (U.find(u => u.email === from) || {}).name || from;
  const alici = m.to === "all" ? U.map(u => u.email) : [m.to];
  const metin = m.text ? m.text : m.att ? "📎 " + (m.att.name || "Dosya") : "";
  await gonder(alici, { title: ad + (m.to === "all" ? " · Tüm ekip" : ""), body: metin, mod: "msg", ref: m.to === "all" ? "all" : from, tag: m.to === "all" ? "all" : from, kat: "msg", haric: from });
});
// Gelen arama
exports.pushArama = onDocumentCreated({ ...tetikOpt, document: "calls/{id}" }, async ev => {
  const c = ev.data && ev.data.data(); if (!c || c.status !== "ringing") return;
  const U = await uyeler(), from = String(c.from || "").toLowerCase(), ad = c.fromName || (U.find(u => u.email === from) || {}).name || from;
  await gonder([c.to], { title: "Gelen arama · " + ad, body: (c.type === "video" ? "Görüntülü" : "Sesli") + " arama. Açmak için dokunun.", mod: "msg", ref: from, tag: "call-" + ev.params.id, kat: "msg", ttl: 45, haric: from });
});
// Dış iş: yeni kayıt, çıkış, dönüş, iptal…
exports.pushDisis = onDocumentWritten({ ...tetikOpt, document: "disis/{id}" }, async ev => {
  const a = ev.data.after.exists ? ev.data.after.data() : null; if (!a) return;
  const b = ev.data.before.exists ? ev.data.before.data() : {}, L0 = (b.log || []).length, L = a.log || [];
  if (L.length <= L0) return;
  const U = await uyeler(), ilgili = [...adiyla(U, a.personel), ...adiyla(U, a.createdBy), ...yetkili(U, "d.edit.all")];
  const ozet = `#${a.no || ""} · ${a.personel || ""}`;
  for (let k = L0; k < L.length; k++) { const l = L[k]; if (!l || !l.at) continue;
    const haric = (adiyla(U, l.by)[0]) || "";
    const t = /oluşturuldu/.test(l.t) ? `${l.by} yeni dış iş açtı` : /^Çıkış yapıldı/.test(l.t) ? `${a.personel} çıkış yaptı` : /^Giriş yapıldı/.test(l.t) ? `${a.personel} döndü` : `${l.by}: ${l.t}`;
    // personele özel başlık
    const P = adiyla(U, a.personel);
    if (/oluşturuldu/.test(l.t) && P.length) await gonder(P, { title: `${l.by} size yeni dış iş atadı`, body: ozet, mod: "disis", ref: ev.params.id, tag: `d:${ev.params.id}:${l.at}:${k}`, kat: "disis", haric });
    await gonder(ilgili.filter(e => !(/oluşturuldu/.test(l.t) && P.includes(e))), { title: t, body: ozet, mod: "disis", ref: ev.params.id, tag: `d:${ev.params.id}:${l.at}:${k}`, kat: "disis", haric });
  }
});
// Dış iş: dönüş saati geçti (10 dakikada bir kontrol)
exports.pushDisisGec = onSchedule({ region: "europe-west3", schedule: "every 10 minutes", timeZone: "Europe/Istanbul" }, async () => {
  const now = Date.now(), s = await db.collection("disis").where("cikis", ">", now - 3 * 864e5).get();
  const U = await uyeler();
  for (const d of s.docs) { const j = d.data(); if (j.iptal || j.giris || !j.donusSaat || j.gecBildirim) continue;
    const gun = new Date(j.cikis + 3 * 36e5).toISOString().slice(0, 10), p = Date.parse(`${gun}T${j.donusSaat}:00+03:00`);
    if (!p || p > now) continue;
    const ozet = `#${j.no || ""} · ${j.personel || ""} · tahmini ${j.donusSaat}`, P = adiyla(U, j.personel);
    await gonder(P, { title: "Dönüş saatiniz geçti", body: ozet, mod: "disis", ref: d.id, tag: `dl:${d.id}:${p}`, kat: "disis" });
    await gonder([...adiyla(U, j.createdBy), ...yetkili(U, "d.edit.all")].filter(e => !P.includes(e)), { title: `${j.personel} dönmedi, dönüş saati geçti`, body: ozet, mod: "disis", ref: d.id, tag: `dl:${d.id}:${p}`, kat: "disis" });
    await d.ref.update({ gecBildirim: true });
  }
});
// Proje takip: geri bildirim
exports.pushGeriBildirim = onDocumentCreated({ ...tetikOpt, document: "feedback/{id}" }, async ev => {
  const f = ev.data && ev.data.data(); if (!f || !f.taskId) return;
  const t = await db.doc("tasks/" + f.taskId).get(); if (!t.exists) return; const T = t.data();
  const U = await uyeler(), alici = [...(T.owners || []).flatMap(o => adiyla(U, o)), ...yetkili(U, "p.task")];
  await gonder(alici, { title: `${f.author} geri bildirim yazdı`, body: `${T.no}. ${kisalt(T.title, 40)} · ${f.text || ""}`, mod: "proje", ref: f.taskId, tag: `f:${ev.params.id}`, kat: "proje", haric: adiyla(U, f.author)[0] || "" });
});
// Web sitesinden teklif isteği
exports.pushWebTalep = onDocumentCreated({ ...tetikOpt, document: "web_talep/{id}" }, async ev => {
  const w = ev.data && ev.data.data(); if (!w) return;
  const U = await uyeler();
  await gonder(yetkili(U, "sp.teklif"), { title: `Web sitesinden teklif isteği · ${w.no}`, body: `${(w.kisi || {}).firma || ""} · ${(w.kalemler || []).length} kalem`, mod: "web", ref: ev.params.id, tag: `w:${ev.params.id}`, kat: "system" });
});

// Deneme bildirimi: kullanıcı "Deneme bildirimi"ne basınca kendi cihazlarına gönderilir
exports.pushDeneme = onDocumentCreated({ ...tetikOpt, document: "push_test/{id}" }, async ev => {
  const t = ev.data && ev.data.data(); if (!t) return;
  await gonder([t.email], { title: "Kar-Men · deneme bildirimi", body: "Anlık bildirim bu cihazda çalışıyor.", mod: "", ref: "", tag: "test-" + ev.params.id, ttl: 300 });
  await ev.data.ref.delete().catch(() => {});
});
