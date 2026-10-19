// Kar-Men Proje Takip — Firebase sürümü
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, query, where, getDoc, getDocs, increment, orderBy, limit, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, BOOT_ADMINS, EXTRA_ICE } from "./config.js";

/* ================= Sürüm kontrolü ================= */
// index.html ile app.js farklı sürümden gelirse (tarayıcı/GitHub önbelleği) sayfayı bir kez tazele
const APP_V = "21";
(() => {
  const m = document.querySelector('meta[name="app-version"]');
  const k = "karmen-reload-" + APP_V;
  if (m && m.content !== APP_V) { try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); location.reload(); } } catch (e) {} }
})();

/* ================= Firebase ================= */
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
auth.languageCode = "tr";
let fs;
try { fs = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { fs = initializeFirestore(fb, {}); }

/* ================= Yardımcılar ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MON = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const MON_L = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const DAYS_L = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
function todayISO() { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
let TODAY = todayISO();
const dnum = iso => { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const fmtS = iso => { if (!iso) return "—"; const [y, m, d] = iso.split("-").map(Number); return String(d).padStart(2, "0") + "." + String(m).padStart(2, "0") + "." + y; };
const COLORS = ["#1747c9","#14866d","#b0367a","#b26b00","#6b45c9","#0f7aa8","#c24a1e","#4a6b12"];
const colorOf = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initials = n => String(n).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toLocaleUpperCase("tr")).join("");
const avatar = n => `<span class="av" style="--c:${colorOf(n)}"><i>${esc(initials(n))}</i>${esc(n)}</span>`;
const lower = s => String(s || "").trim().toLowerCase();
let tt; function toast(m) { const el = $("#toast"); el.textContent = m; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 3200); }
const GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/* ================= Durum ================= */
const state = { tasks: [], feedback: [], access: null, accessExists: false, ready: false };
let ME = null;            // {uid,email,name,role}
let unsubs = [];
/* ================= Yetki modeli ================= */
// Modül seviyesi: none (erişim yok) · view (gözlemci) · use (kullanıcı) · edit (düzenleyici). Sistem yöneticisi her şeyi yapar.
const PERM_MODS = ["proje", "stok", "satinalma", "disis", "personel", "planlama", "siparis"];
const PERM_LEVELS = [["none", "Erişim yok"], ["view", "Gözlemci"], ["use", "Kullanıcı"], ["edit", "Düzenleyici"]];
const PERM_ACTS = {
  proje: [["p.task", "İş ekleme, düzenleme ve silme"], ["p.progress.all", "Tüm işlerin tamamlanma oranını güncelleme"], ["p.progress.own", "Sorumlusu olduğu işin oranını güncelleme"], ["p.feedback", "Günlük geri bildirim yazma"]],
  disis: [["d.create", "Dış iş oluşturma"], ["d.inout", "Çıkış / giriş kaydetme"], ["d.edit.own", "Kendi açtığı işleri düzenleme"], ["d.edit.all", "Tüm işleri düzenleme"], ["d.cancel", "İş iptal etme"], ["d.delete", "İş silme"], ["d.cfg", "Araç ve personel listesini düzenleme"], ["d.report", "Günlük rapor (PDF) alma"]],
  stok: [["s.edit", "Stok kartı ekleme ve düzenleme"], ["s.move", "Stok giriş / çıkış hareketi"], ["s.count", "Sayım ve stok düzeltme"], ["s.price", "Alış fiyatlarını görme ve düzenleme"], ["s.delete", "Stok kartı silme"], ["s.cfg", "Grup ve depo listesini düzenleme"]],
  planlama: [["pl.ie", "İş emri oluşturma ve düzenleme"], ["pl.op", "Operasyon başlatma / bitirme (üretim)"], ["pl.akis", "İş akış şemalarını düzenleme"], ["pl.ist", "İş istasyonlarını ve ayarları düzenleme"], ["pl.delete", "İş emri silme"]],
  personel: [["k.yoklama", "Günlük yoklama girme (geldi, geç, gelmedi)"], ["k.izin", "İzin kaydı girme, düzenleme ve silme"], ["k.list", "Personel listesini ve ayarları düzenleme"], ["k.ozel", "Kişisel bilgileri görme (TC, adres, telefon)"]]
};
// Modülden bağımsız genel yetkiler
const PERM_GLOBAL = [["p.msg", "Mesaj gönderme (üst çubuktaki Mesajlar)"]];
const PERM_DEF = {
  proje: { none: [], view: [], use: ["p.progress.own", "p.feedback", "p.msg"], edit: PERM_ACTS.proje.map(a => a[0]) },
  disis: { none: [], view: ["d.report"], use: ["d.create", "d.inout", "d.edit.own", "d.report"], edit: PERM_ACTS.disis.map(a => a[0]) },
  stok: { none: [], view: [], use: ["s.move"], edit: PERM_ACTS.stok.map(a => a[0]) },
  planlama: { none: [], view: [], use: ["pl.op"], edit: PERM_ACTS.planlama.map(a => a[0]) },
  personel: { none: [], view: [], use: ["k.yoklama"], edit: PERM_ACTS.personel.map(a => a[0]) }
};
function effPerms(e) {
  if (!e) return null;
  if (e.role === "admin") return { role: "admin", mods: {}, acts: {} };
  if (e.mods && typeof e.mods === "object") return { role: "user", mods: { ...e.mods }, acts: { ...(e.acts || {}) } };
  const L = e.role === "viewer" ? "view" : "use", mods = {}, acts = {};   // eski kayıt (üye / izleyici)
  PERM_MODS.forEach(m => { if (m === "personel") { mods[m] = "none"; return; } mods[m] = L; if (m !== "stok" && m !== "planlama") ((PERM_DEF[m] || {})[L] || []).forEach(a => acts[a] = true); });  // kişisel veriler eski kayıtlara açılmaz
  return { role: "user", mods, acts };
}
const isAdmin = () => !!ME && ME.role === "admin";
const can = a => !!ME && (ME.role === "admin" || !!(ME.acts && ME.acts[a]));
const lvl = m => !ME ? "none" : ME.role === "admin" ? "edit" : ((ME.mods && ME.mods[m]) || "none");
const canFeedback = () => can("p.feedback");
const canProgress = t => can("p.progress.all") || (can("p.progress.own") && (t.owners || []).includes(ME.name));
const isBoot = email => BOOT_ADMINS.map(lower).includes(lower(email));

/* ================= Giriş ekranları ================= */
const gate = $("#gate"), card = $("#gateCard");
const LOGO = '<div class="gate-logo"><img src="logo.jpg" alt="Kar-Men Airtech"></div>';
function showGate(html) { $("#app").hidden = true; gate.hidden = false; card.innerHTML = LOGO + html; }
function showApp() { gate.hidden = true; $("#app").hidden = false; route(); }
function authErr(e) {
  const c = e && e.code || "";
  const M = {
    "auth/invalid-credential": "E-posta veya şifre hatalı.", "auth/wrong-password": "E-posta veya şifre hatalı.", "auth/user-not-found": "Bu e-posta ile kayıt bulunamadı.",
    "auth/email-already-in-use": "Bu e-posta ile zaten hesap var. Giriş yapın veya şifrenizi sıfırlayın.", "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/invalid-email": "E-posta adresi geçerli değil.", "auth/too-many-requests": "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.",
    "auth/popup-closed-by-user": "Google penceresi kapatıldı.", "auth/network-request-failed": "İnternet bağlantısı yok.",
    "auth/unauthorized-domain": "Bu site adresi Firebase'de yetkili değil. Firebase > Authentication > Settings > Authorized domains bölümüne site adresini ekleyin."
  };
  return M[c] || ("Giriş yapılamadı" + (c ? " (" + c + ")" : "") + ".");
}
function loginScreen(mode = "login", msg = "") {
  const reg = false;
  showGate(`
    <h2>${reg ? "Hesap oluştur" : "Giriş yap"}</h2>
    <p>KARMEN MRP-ERP Dönüşüm Projesi takip ekranı</p>
    ${msg ? `<div class="gate-err" role="alert">${esc(msg)}</div>` : ""}
    <button class="gbtn" id="gBtn" type="button">${GOOGLE_SVG}Google ile ${reg ? "kaydol" : "giriş yap"}</button>
    <div class="or">veya e-posta ile</div>
    <form id="lf" style="display:flex;flex-direction:column;gap:10px">
      ${reg ? '<div class="field"><label for="lName">Ad Soyad</label><input id="lName" autocomplete="name" required></div>' : ""}
      <div class="field"><label for="lMail">E-posta</label><input id="lMail" type="email" autocomplete="email" required></div>
      <div class="field"><label for="lPass">Şifre</label><input id="lPass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="6" required></div>
      <button class="btn" type="submit" id="lSub">${reg ? "Hesap oluştur" : "Giriş yap"}</button>
    </form>
    <div class="gate-row">
      <button class="linkbtn" id="fgt" type="button">Şifremi unuttum</button>
    </div>
    <p class="note" style="font-size:12.5px">E-posta hesabınız yoksa proje yöneticisinden isteyin.</p>`);
  $("#gBtn").onclick = googleLogin;
  if (!reg) $("#fgt").onclick = async () => {
    const m = $("#lMail").value.trim(); if (!m) { loginScreen("login", "Şifre sıfırlama için önce e-posta adresinizi yazın."); return; }
    try { await sendPasswordResetEmail(auth, m); toast("Şifre sıfırlama bağlantısı gönderildi"); } catch (e) { loginScreen("login", authErr(e)); }
  };
  $("#lf").onsubmit = async ev => {
    ev.preventDefault(); $("#lSub").disabled = true;
    const m = $("#lMail").value.trim(), p = $("#lPass").value;
    try {
      if (reg) {
        const cr = await createUserWithEmailAndPassword(auth, m, p);
        const nm = $("#lName").value.trim(); if (nm) await updateProfile(cr.user, { displayName: nm });

      } else await signInWithEmailAndPassword(auth, m, p);
    } catch (e) { loginScreen(mode, authErr(e)); }
  };
}
async function googleLogin() {
  const pr = new GoogleAuthProvider(); pr.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, pr); }
  catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) {
      try { await signInWithRedirect(auth, pr); } catch (e2) { loginScreen("login", authErr(e2)); }
    } else loginScreen("login", authErr(e));
  }
}
getRedirectResult(auth).catch(e => loginScreen("login", authErr(e)));

function verifyScreen(user, msg = "") {
  showGate(`
    <h2>E-postanızı doğrulayın</h2>
    <p>Doğrulama bağlantısı şu adrese gönderildi. Bağlantıya tıkladıktan sonra aşağıdaki düğmeye basın. Gelen kutusunda yoksa istenmeyen klasörüne bakın.</p>
    <div class="copybox">${esc(user.email)}</div>
    ${msg ? `<div class="gate-err" role="alert">${esc(msg)}</div>` : ""}
    <button class="btn" id="vOk">Doğruladım, devam et</button>
    <div class="gate-row"><button class="linkbtn" id="vRe">Tekrar gönder</button><button class="linkbtn" id="vOut">Çıkış</button></div>`);
  $("#vOk").onclick = async () => {
    await user.reload();
    if (auth.currentUser && auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); enter(auth.currentUser); }
    else verifyScreen(user, "E-posta henüz doğrulanmamış görünüyor.");
  };
  $("#vRe").onclick = async () => { try { await sendEmailVerification(user); toast("Doğrulama e-postası tekrar gönderildi"); } catch (e) { verifyScreen(user, authErr(e)); } };
  $("#vOut").onclick = () => signOut(auth);
}
function noAccessScreen(email) {
  showGate(`
    <h2>Erişim izni bekleniyor</h2>
    <p>Giriş yaptınız ancak bu hesap henüz proje ekibine eklenmemiş. Aşağıdaki e-posta adresini proje yöneticisine iletin. Yönetici ekledikten sonra sayfa kendiliğinden açılır.</p>
    <div class="copybox">${esc(email)}</div>
    <div class="gate-row"><button class="btn ghost" id="naCopy">Adresi kopyala</button><button class="btn ghost" id="naOut">Çıkış</button></div>`);
  $("#naOut").onclick = () => signOut(auth);
  $("#naCopy").onclick = () => navigator.clipboard.writeText(email).then(() => toast("Kopyalandı"), () => toast("Adresi seçip kopyalayın"));
}

/* ================= Oturum akışı ================= */
function stopSubs() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; }
onAuthStateChanged(auth, user => {
  stopSubs(); state.ready = false; ME = null;
  if (!user) { loginScreen(); return; }
  enter(user);
});
let dataStarted = false, permSig = "";
function enter(user) {
  stopSubs(); dataStarted = false;
  const email = lower(user.email);
  const boot = isBoot(email);
  if (!boot) showGate("<p>Yetkiler kontrol ediliyor…</p>");
  if (boot) { ME = { uid: user.uid, email, name: user.displayName || email, role: "admin", mods: {}, acts: {} }; startData(); }
  unsubs.push(onSnapshot(doc(fs, "config", "access"), s => {
    state.accessExists = s.exists();
    state.access = s.exists() ? (s.data().members || {}) : {};
    const entry = state.access[email];
    if (boot) { ME = { uid: user.uid, email, name: (entry && entry.name) || user.displayName || email, role: "admin", mods: {}, acts: {} }; }
    else if (!entry || !entry.role) { ME = null; dataStarted = false; permSig = ""; stopDataSubs(); noAccessScreen(email); return; }
    else ME = { uid: user.uid, email, name: entry.name || user.displayName || email, ...effPerms(entry) };
    const sig = JSON.stringify([ME.role, ME.mods]);
    if (permSig && sig !== permSig) { stopDataSubs(); dataStarted = false; }
    permSig = sig;
    startData();
    render(); if (!$("#app").hidden) route();
  }, err => {
    if (boot) return;
    noAccessScreen(email);
  }));
}
let dataUnsubs = [];
function stopDataSubs() { dataUnsubs.forEach(u => { try { u(); } catch (e) {} }); dataUnsubs = []; }
function startData() {
  if (dataStarted) { showApp(); paintUser(); return; }
  dataStarted = true; showApp(); paintUser(); render();
  state.tasks = []; state.feedback = []; state.ready = false;
  startNotif();
  startMessages();
  startIncoming();
  if (lvl("disis") !== "none") startDisis(); else { DT.jobs = []; DT.ready = true; }
  if (lvl("planlama") !== "none") startPlan(); else { PL.ie = []; PL.ready = true; }
  if (lvl("stok") !== "none") startStok(); else { SK.page = []; SK.stocked = []; SK.cache.clear(); SK.ready = true; }
  if (lvl("personel") !== "none") startPersonel(); else { PT.people = []; PT.izin = []; PT.ozel = {}; PT.ready = true; }
  if (lvl("proje") === "none") { state.ready = true; render(); return; }
  let got = 0; const first = () => { if (++got === 2) { state.ready = true; render(); } };
  let t1 = false, t2 = false;
  dataUnsubs.push(onSnapshot(collection(fs, "tasks"), s => {
    state.tasks = s.docs.map(d => ({ id: d.id, ...d.data() })); if (!t1) { t1 = true; first(); } else render();
  }, e => toast("İşler okunamadı: " + (e.code || e.message))));
  dataUnsubs.push(onSnapshot(collection(fs, "feedback"), s => {
    state.feedback = s.docs.map(d => ({ id: d.id, ...d.data() })); if (!t2) { t2 = true; first(); } else render();
  }, e => toast("Geri bildirimler okunamadı: " + (e.code || e.message))));
}
const _stop = stopSubs; // çıkışta veri aboneliklerini de kapat
stopSubs = function () { _stop(); stopDataSubs(); };
function paintUser() {
  if (!ME) return;
  const roleL = ME.role === "admin" ? "Yönetici" : "Kullanıcı";
  $("#uChip").style.setProperty("--c", colorOf(ME.name));
  $("#uChip").innerHTML = `<i>${esc(initials(ME.name))}</i><span class="nm">${esc(ME.name)}</span> <small>· ${roleL}</small>`;
  $("#uChip").title = ME.name + " · " + roleL;
  const hr = istNow().h, hi = hr < 12 ? "Günaydın" : hr < 18 ? "İyi günler" : "İyi akşamlar";
  $("#hello").textContent = hi + ", " + String(ME.name).split(/\s+/)[0];
  $("#addBtn").hidden = !can("p.task");
}
$("#outBtn").onclick = () => signOut(auth);

/* ================= Tarih / saat ================= */
function istNow() { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value])); return { h: +p.hour % 24, m: +p.minute }; } catch (e) { const d = new Date(); return { h: d.getHours(), m: d.getMinutes() }; } }
const setAll = (sel, txt) => document.querySelectorAll(sel).forEach(el => el.textContent = txt);
function paintDate() { const [y, m, d] = TODAY.split("-").map(Number); setAll(".js-dday", d); setAll(".js-dwd", DAYS_L[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]); setAll(".js-dmy", MON_L[m - 1] + " " + y); }
function tick() {
  const nt = todayISO(); if (nt !== TODAY) { if (PT.date === TODAY) PT.date = nt; TODAY = nt; paintDate(); render(); pkWatch(); pkChanged(); skWatch(); }
  const n = istNow(), pad = x => String(x).padStart(2, "0");
  setAll(".js-dclk", pad(n.h) + ":" + pad(n.m));
  const mins = 17 * 60 + 45 - (n.h * 60 + n.m), cd = $("#dlCd");
  if (mins > 0) cd.textContent = "Bugün için kalan: " + (mins >= 60 ? Math.floor(mins / 60) + " sa " : "") + (mins % 60) + " dk";
  else { const miss = state.ready ? missingToday().length : 0; cd.textContent = miss ? "Süre doldu · " + miss + " işte bugün geri bildirim eksik" : "Süre doldu · tüm geri bildirimler girildi"; }
}

/* ================= Durum hesapları ================= */
function info(t) {
  const p = Math.max(0, Math.min(100, Number(t.progress) || 0));
  const s = dnum(t.start), e = dnum(t.end), now = dnum(TODAY);
  const r = { p, left: null, expected: null, key: "on", label: "Yolunda", cls: "p-ok", fill: "var(--brand)" };
  if (e != null) r.left = e - now;
  if (s != null && e != null && e >= s) { const tot = e - s + 1; r.expected = Math.max(0, Math.min(100, Math.round((now - s + 1) / tot * 100))); if (now < s) r.expected = 0; }
  if (p >= 100) { Object.assign(r, { key: "done", label: "Tamamlandı", cls: "p-brand", fill: "var(--ok)" }); return r; }
  if (e == null) { Object.assign(r, { key: "nodate", label: "Tarih belirsiz", cls: "p-muted" }); return r; }
  if (r.left < 0) { Object.assign(r, { key: "late", label: Math.abs(r.left) + " gün gecikti", cls: "p-bad", fill: "var(--bad)" }); return r; }
  if (s != null && now < s) { Object.assign(r, { key: "on", label: "Başlamadı", cls: "p-muted" }); return r; }
  if (r.expected != null && p < r.expected - 15) { Object.assign(r, { key: "risk", label: "Plandan geride", cls: "p-warn", fill: "var(--warn)" }); return r; }
  if (r.left <= 2 && p < 80) { Object.assign(r, { key: "risk", label: "Süre daralıyor", cls: "p-warn", fill: "var(--warn)" }); return r; }
  return r;
}
function leftText(t, i) {
  if (i.p >= 100) return { txt: "Bitti", cls: "p-brand" };
  if (i.left == null) return { txt: "Belirsiz", cls: "p-muted" };
  if (i.left < 0) return { txt: Math.abs(i.left) + " gün geçti", cls: "p-bad" };
  if (i.left === 0) return { txt: "Bugün son gün", cls: "p-warn" };
  return { txt: i.left + " gün kaldı", cls: i.left <= 2 ? "p-warn" : "p-ok" };
}
const fbOf = id => state.feedback.filter(f => f.taskId === id).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
function allPeople() {
  const s = new Set();
  Object.values(state.access || {}).forEach(m => m && m.name && s.add(m.name));
  state.tasks.forEach(t => (t.owners || []).forEach(o => s.add(o)));
  return [...s].sort((a, b) => a.localeCompare(b, "tr"));
}
const isActive = t => info(t).p < 100 && t.start && t.start <= TODAY;
const missingToday = () => { const s = new Set(state.feedback.filter(f => f.date === TODAY).map(f => f.taskId)); return state.tasks.filter(t => isActive(t) && !s.has(t.id)); };

/* ================= Sıralama + sütun filtreleri ================= */
let VIEW = "list"; try { VIEW = localStorage.getItem("karmen-view") || "list"; } catch (e) {}
if (VIEW !== "list" && VIEW !== "tl") VIEW = "list";
const F = { no: "", title: "", owner: "", start: "", end: "", left: "", fb: "", prog: "" };
let SORT = { key: "left", dir: 1 };
const COLS = [["no","No"],["title","İşin tanımı"],["owner","Sorumlu"],["start","Başlangıç"],["end","Bitiş"],["left","Kalan süre"],["fb","Son geri bildirim"],["prog","Tamamlanma"]];
const lastFb = t => fbOf(t.id)[0];
function sortVal(t, k) {
  const i = info(t);
  switch (k) {
    case "no": return Number(t.no) || 9999;
    case "title": return (t.title || "").toLocaleLowerCase("tr");
    case "owner": return ((t.owners || [])[0] || "￿").toLocaleLowerCase("tr");
    case "start": return t.start || null;
    case "end": return t.end || null;
    case "left": return i.p >= 100 ? null : i.left;
    case "fb": { const f = lastFb(t); return f ? (f.date || "") + String(f.at || 0).padStart(15, "0") : null; }
    case "prog": return i.p;
  }
}
function cmp(a, b) {
  const k = SORT.key, va = sortVal(a, k), vb = sortVal(b, k);
  const na = va == null || va === "", nb = vb == null || vb === "";
  if (na && !nb) return 1; if (nb && !na) return -1;
  if (!na && !nb && va !== vb) { const r = typeof va === "string" ? va.localeCompare(vb, "tr") : va - vb; if (r) return r * SORT.dir; }
  if (k === "left" && na && nb) { const da = info(a).p >= 100, db = info(b).p >= 100; if (da !== db) return da ? 1 : -1; }
  return (Number(a.no) || 999) - (Number(b.no) || 999);
}
function weekRange() { const n = dnum(TODAY), wd = (new Date(n * 864e5).getUTCDay() + 6) % 7; return [n - wd, n - wd + 6]; }
function dateMatch(iso, f) {
  if (!f) return true; if (f === "none") return !iso; if (!iso) return false; const d = dnum(iso), n = dnum(TODAY);
  if (f === "past") return d < n; if (f === "today") return d === n; if (f === "future") return d > n;
  if (f === "week") { const [a, b] = weekRange(); return d >= a && d <= b; }
  if (f === "month") return iso.slice(0, 7) === TODAY.slice(0, 7); return true;
}
function filtered() {
  const q = F.title.trim().toLocaleLowerCase("tr");
  return state.tasks.filter(t => {
    const i = info(t);
    if (F.no && String(t.no ?? "") !== F.no.trim()) return false;
    if (q && !((t.title || "") + " " + (t.desc || "") + " " + (t.group || "")).toLocaleLowerCase("tr").includes(q)) return false;
    if (F.owner === "__none" && (t.owners || []).length) return false;
    if (F.owner === "__me" && !(ME && (t.owners || []).includes(ME.name))) return false;
    if (F.owner && !F.owner.startsWith("__") && !(t.owners || []).includes(F.owner)) return false;
    if (!dateMatch(t.start, F.start) || !dateMatch(t.end, F.end)) return false;
    if (F.left) {
      const L = i.left;
      if (F.left === "late" && !(i.p < 100 && L != null && L < 0)) return false;
      if (F.left === "0-3" && !(i.p < 100 && L != null && L >= 0 && L <= 3)) return false;
      if (F.left === "4-7" && !(i.p < 100 && L != null && L >= 4 && L <= 7)) return false;
      if (F.left === "8+" && !(i.p < 100 && L != null && L >= 8)) return false;
      if (F.left === "none" && !(i.p < 100 && L == null)) return false;
      if (F.left === "done" && i.p < 100) return false;
      if (F.left === "risk" && i.key !== "risk") return false;
    }
    if (F.fb) {
      const f = lastFb(t), today = f && f.date === TODAY;
      if (F.fb === "today" && !today) return false;
      if (F.fb === "missing" && !(isActive(t) && !today)) return false;
      if (F.fb === "never" && f) return false;
    }
    if (F.prog) {
      const p = i.p;
      if (F.prog === "0" && p !== 0) return false; if (F.prog === "1-49" && !(p > 0 && p < 50)) return false;
      if (F.prog === "50-99" && !(p >= 50 && p < 100)) return false; if (F.prog === "100" && p < 100) return false;
    }
    return true;
  }).sort(cmp);
}
const anyFilter = () => Object.values(F).some(Boolean);
function headHtml() {
  return `<div class="lhead" role="row">` + COLS.map(([k, l]) => {
    const on = SORT.key === k; const ar = on ? (SORT.dir > 0 ? "▲" : "▼") : "↕";
    return `<div role="columnheader" aria-sort="${on ? (SORT.dir > 0 ? "ascending" : "descending") : "none"}"><button class="sort" data-sort="${k}" ${on ? "data-on" : ""} title="Sırala">${l}<span class="ar">${ar}</span></button></div>`;
  }).join("") + `</div>`;
}
const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(l)}</option>`;
function filterHtml() {
  const dOpts = c => opt("", "Tümü", c) + opt("past", "Geçmiş", c) + opt("today", "Bugün", c) + opt("week", "Bu hafta", c) + opt("month", "Bu ay", c) + opt("future", "Gelecek", c) + opt("none", "Tarih yok", c);
  const on = v => v ? ' class="on"' : "";
  return `<div class="lfilter">
    <select class="mob" id="mSort" aria-label="Sırala">${COLS.map(([k, l]) => opt(k + ":1", l + " ↑", SORT.key + ":" + SORT.dir) + opt(k + ":-1", l + " ↓", SORT.key + ":" + SORT.dir)).join("")}</select>
    <input id="cfNo"${on(F.no)} placeholder="No" value="${esc(F.no)}" inputmode="numeric" aria-label="No filtresi">
    <input id="cfTitle"${on(F.title)} type="search" placeholder="Ara…" value="${esc(F.title)}" aria-label="İş tanımı filtresi">
    <select id="cfOwner"${on(F.owner)} aria-label="Sorumlu filtresi">${opt("", "Tüm sorumlular", F.owner)}${opt("__me", "Benim işlerim", F.owner)}${allPeople().map(p => opt(p, p, F.owner)).join("")}${opt("__none", "Atanmamış", F.owner)}</select>
    <select id="cfStart"${on(F.start)} aria-label="Başlangıç filtresi">${dOpts(F.start)}</select>
    <select id="cfEnd"${on(F.end)} aria-label="Bitiş filtresi">${dOpts(F.end)}</select>
    <select id="cfLeft"${on(F.left)} aria-label="Kalan süre filtresi">${opt("", "Tümü", F.left) + opt("late", "Geciken", F.left) + opt("0-3", "0–3 gün", F.left) + opt("4-7", "4–7 gün", F.left) + opt("8+", "8+ gün", F.left) + opt("risk", "Plandan geride", F.left) + opt("none", "Süresiz", F.left) + opt("done", "Biten", F.left)}</select>
    <select id="cfFb"${on(F.fb)} aria-label="Geri bildirim filtresi">${opt("", "Tümü", F.fb) + opt("today", "Bugün girildi", F.fb) + opt("missing", "Bugün eksik", F.fb) + opt("never", "Hiç girilmedi", F.fb)}</select>
    <select id="cfProg"${on(F.prog)} aria-label="Tamamlanma filtresi">${opt("", "Tümü", F.prog) + opt("0", "%0", F.prog) + opt("1-49", "%1–49", F.prog) + opt("50-99", "%50–99", F.prog) + opt("100", "%100", F.prog)}</select>
  </div>`;
}
function wireLedger(v) {
  v.querySelectorAll("[data-sort]").forEach(b => b.onclick = () => {
    const k = b.dataset.sort;
    if (SORT.key !== k) SORT = { key: k, dir: 1 }; else if (SORT.dir === 1) SORT = { key: k, dir: -1 }; else SORT = { key: "left", dir: 1 };
    render();
  });
  const ms = v.querySelector("#mSort"); if (ms) ms.onchange = () => { const [k, d] = ms.value.split(":"); SORT = { key: k, dir: Number(d) }; render(); };
  const map = { cfNo: "no", cfTitle: "title", cfOwner: "owner", cfStart: "start", cfEnd: "end", cfLeft: "left", cfFb: "fb", cfProg: "prog" };
  for (const [id, k] of Object.entries(map)) {
    const el = v.querySelector("#" + id); if (!el) continue;
    if (el.tagName === "INPUT") el.oninput = () => { F[k] = el.value; renderRowsOnly(); }; else el.onchange = () => { F[k] = el.value; render(); };
  }
}

/* ================= Ekran ================= */
function renderKpis() {
  const T = state.tasks, n = T.length;
  const avg = n ? Math.round(T.reduce((a, t) => a + info(t).p, 0) / n) : 0;
  const late = T.filter(t => info(t).key === "late").length;
  const soon = T.filter(t => { const i = info(t); return i.p < 100 && i.left != null && i.left >= 0 && i.left <= 3; }).length;
  const active = T.filter(isActive);
  const fbToday = new Set(state.feedback.filter(f => f.date === TODAY).map(f => f.taskId));
  $("#kAvg").textContent = avg + "%"; $("#kTotal").textContent = n; $("#kDone").textContent = T.filter(t => info(t).p >= 100).length + " tamamlandı";
  const kl = $("#kLate"); kl.textContent = late; kl.className = "v" + (late ? " bad" : "");
  $("#kSoon").textContent = soon;
  $("#kFb").textContent = active.filter(t => fbToday.has(t.id)).length + " / " + active.length;
  $("#kFbS").textContent = active.length ? "Devam eden işlerde girildi" : "Devam eden iş yok";
  const C = 2 * Math.PI * 26; $("#ringArc").setAttribute("stroke-dasharray", (C * avg / 100).toFixed(1) + " " + C.toFixed(1));
}
function sortInfoText(n) { return n + " / " + state.tasks.length + " iş · Sıralama: " + COLS.find(c => c[0] === SORT.key)[1] + (SORT.dir > 0 ? " ↑" : " ↓"); }
function render() {
  if ($("#app").hidden) return;
  if (typeof notifSoon === "function") notifSoon();
  renderHome();
  const pm = MODULES.find(m => m.id === ROUTE && !m.active); if (pm) renderPh(pm);
  renderKpis(); tick();
  $("#vList").setAttribute("aria-pressed", VIEW === "list"); $("#vTl").setAttribute("aria-pressed", VIEW === "tl");
  const v = $("#view");
  if (!state.ready) { v.innerHTML = '<div class="empty"><h3>İşler yükleniyor</h3><p>Veritabanına bağlanılıyor.</p></div>'; return; }
  if (!state.tasks.length) {
    v.innerHTML = `<div class="empty"><h3>Henüz iş yok</h3><p>${can("p.task") ? "İlk işi ekleyin" + (isAdmin() ? " veya önceki kayıtları <b>Yetkilendirme</b> ekranından içe aktarın." : ".") : "Proje yöneticisi işleri eklediğinde burada görünecek."}</p>${can("p.task") ? '<button class="btn" id="emptyAdd">+ İlk işi ekle</button>' : ""}</div>`;
    if (can("p.task")) $("#emptyAdd").onclick = () => openDrawer(null); return;
  }
  const rows = filtered();
  $("#clearF").hidden = !anyFilter(); $("#sortInfo").textContent = sortInfoText(rows.length);
  const ae = document.activeElement, keep = ae && ae.id && v.contains(ae) ? { id: ae.id, s: ae.selectionStart } : null;
  if (VIEW === "tl") v.innerHTML = rows.length ? timeline(rows) : '<div class="empty"><h3>Bu filtreye uyan iş yok</h3><p>Liste görünümündeki sütun filtrelerini değiştirin.</p></div>';
  else {
    v.innerHTML = `<div class="ledger" role="table">${headHtml()}${filterHtml()}<div id="rows">${rowsHtml(rows)}</div></div><p class="note" style="margin:-18px 0 28px">Çubuktaki ince çizgi, tarihlere göre bugün olması gereken tamamlanma oranını gösterir. Sütun başlığına tıklayınca sıralama değişir.</p>`;
    wireLedger(v);
  }
  wireRows(v);
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { if (keep.s != null) el.setSelectionRange(keep.s, keep.s); } catch (e) {} } }
}
function wireRows(scope) { scope.querySelectorAll("[data-id]").forEach(el => { el.onclick = () => openDrawer(el.dataset.id); el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(el.dataset.id); } }; }); }
function renderRowsOnly() {
  const box = $("#rows"); if (!box) { render(); return; }
  const rows = filtered(); box.innerHTML = rowsHtml(rows); wireRows(box);
  $("#clearF").hidden = !anyFilter(); $("#sortInfo").textContent = sortInfoText(rows.length);
  ["cfNo", "cfTitle"].forEach(id => { const el = $("#" + id); if (el) el.classList.toggle("on", !!el.value); });
}
function rowsHtml(rows) {
  if (!rows.length) return '<div class="row" style="cursor:default;display:block;color:var(--ink-2)">Bu filtrelere uyan iş yok.</div>';
  return rows.map(t => {
    const i = info(t), L = leftText(t, i), fb = fbOf(t.id)[0], active = isActive(t);
    const stripe = i.key === "late" ? "var(--bad)" : i.key === "risk" ? "var(--warn)" : i.key === "done" ? "var(--ok)" : "transparent";
    const fbHtml = fb ? `<div class="when">${fmtS(fb.date)} · ${esc(fb.author || "")}</div><div class="txt">${esc(fb.text)}</div>` : '<span class="when">Kayıt yok</span>';
    const missing = active && !(fb && fb.date === TODAY);
    return `<div class="row" role="row" tabindex="0" data-id="${esc(t.id)}" style="--stripe:${stripe}">
      <div class="no">${esc(t.no ?? "")}</div>
      <div class="cell-t"><div class="ttl">${t.group ? `<span class="grp">${esc(t.group)}</span>` : ""}${esc(t.title)}</div>${t.desc ? `<div class="desc">${esc(t.desc)}</div>` : ""}</div>
      <div><span class="lbl">Sorumlu</span><div class="people">${(t.owners || []).map(avatar).join("") || '<span class="date none">Atanmadı</span>'}</div></div>
      <div><span class="lbl">Başlangıç</span><span class="date ${t.start ? "" : "none"}">${fmtS(t.start)}</span></div>
      <div><span class="lbl">Bitiş</span><span class="date ${t.end ? "" : "none"}">${fmtS(t.end)}</span></div>
      <div><span class="lbl">Kalan süre</span><span class="pill ${L.cls}">${L.txt}</span></div>
      <div class="cell-fb fb ${missing ? "missing" : ""}"><span class="lbl">Son geri bildirim</span>${missing ? `<div>Bugün geri bildirim girilmedi</div>${fb ? `<div class="when">Son: ${fmtS(fb.date)}</div>` : ""}` : fbHtml}</div>
      <div class="cell-p"><span class="lbl">Tamamlanma · ${esc(i.label)}</span><div class="prog"><div class="bar" title="Gerçekleşen ${i.p}%${i.expected != null ? " · plan " + i.expected + "%" : ""}"><span style="width:${i.p}%;--fill:${i.fill}"></span>${i.expected != null && i.p < 100 ? `<em style="left:calc(${i.expected}% - 1px)"></em>` : ""}</div><span class="pct">${i.p}%</span></div></div>
    </div>`;
  }).join("");
}
function timeline(rows) {
  const dated = rows.filter(t => t.start || t.end);
  let lo = dnum(TODAY) - 3, hi = dnum(TODAY) + 10;
  dated.forEach(t => { const s = dnum(t.start || t.end), e = dnum(t.end || t.start); lo = Math.min(lo, s - 1); hi = Math.max(hi, e + 2); });
  const span = hi - lo + 1, pos = d => ((d - lo) / span * 100);
  const step = span > 90 ? 14 : span > 45 ? 7 : span > 20 ? 2 : 1;
  let ticks = "";
  for (let d = lo; d <= hi; d += step) { const dt = new Date(d * 864e5); ticks += `<span class="${dt.getUTCDay() === 1 ? "wk" : ""}" style="left:${pos(d)}%">${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}</span>`; }
  const today = `<div class="tl-today" style="left:calc(260px + (100% - 260px) * ${pos(dnum(TODAY)) / 100})"></div>`;
  const body = rows.map(t => {
    const i = info(t); let bar;
    if (t.start || t.end) { const s = dnum(t.start || t.end), e = dnum(t.end || t.start); bar = `<div class="tl-bar" style="left:${pos(s)}%;width:${Math.max(pos(e + 1) - pos(s), 1.2)}%;--fill:${i.fill}"><b style="width:${i.p}%"></b><i>${i.p}%</i></div>`; }
    else bar = '<span class="tl-none">Tarih girilmedi</span>';
    return `<div class="tl-row" tabindex="0" data-id="${esc(t.id)}"><div class="lab" title="${esc(t.title)}"><small>${esc(t.no ?? "")}</small>${esc(t.title)}</div><div class="tl-track">${bar}</div></div>`;
  }).join("");
  return `<div class="tl"><div class="tl-in">${today}<div class="tl-scale"><div class="lab">İş</div><div class="tl-days">${ticks}</div></div>${body}</div></div>`;
}

/* ================= İş detayı ================= */
let cur = null;
function writeErr(e) { const c = e && e.code; if (c === "permission-denied") return "Bu işlem için yetkiniz yok."; if (c === "unavailable") return "Bağlantı yok; bağlantı gelince tekrar deneyin."; return "Kaydedilemedi: " + ((e && e.message) || "bilinmeyen hata"); }
let onDrawerClose = null;
function closeDrawer() { const f = onDrawerClose; onDrawerClose = null; if (f) { try { f(); } catch (e) { console.error(e); } } $("#drawerHost").innerHTML = ""; cur = null; }
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const vw = document.querySelector(".viewer"); if (vw) { vw.remove(); e.preventDefault(); return; }
  if ($("#drawerHost").innerHTML) closeDrawer();
});
function openDrawer(id) {
  const t = id ? state.tasks.find(x => x.id === id) : null;
  if (id && !t) return;
  if (!id && !can("p.task")) return;
  const adm = can("p.task"), prog = t ? canProgress(t) : adm;
  const dis = adm ? "" : " disabled";
  const nextNo = Math.max(0, ...state.tasks.map(x => Number(x.no) || 0)) + 1;
  cur = { id, owners: t ? (t.owners || []).slice() : [] };
  const i = t ? info(t) : null, L = t ? leftText(t, i) : null;
  const fbs = t ? fbOf(t.id) : [];
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">
    <div class="dh"><h2 id="dTitle">${t ? "İş detayı" : "Yeni iş"}</h2><button class="x" id="dClose" aria-label="Kapat">×</button></div>
    <div class="db">
      ${t ? `<div class="factbox"><div><div class="k">Durum</div><div class="v"><span class="pill ${i.cls}">${esc(i.label)}</span></div></div><div><div class="k">Kalan süre</div><div class="v">${L.txt}</div></div><div><div class="k">Plan / gerçek</div><div class="v">${i.expected ?? "—"}${i.expected != null ? "%" : ""} / ${i.p}%</div></div></div>` : ""}
      <div class="fgrid">
        <div class="field"><label for="iNo">İş no</label><input id="iNo" type="number" min="1" value="${esc(t ? t.no : nextNo)}"${dis}></div>
        <div class="field"><label for="iGroup">Grup</label><input id="iGroup" list="groupList" value="${esc(t ? t.group || "" : "")}" placeholder="Örn. G1 Stok"${dis}><datalist id="groupList">${[...new Set(state.tasks.map(x => x.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join("")}</datalist></div>
        <div class="field full"><label for="iTitle">İşin adı</label><input id="iTitle" value="${esc(t ? t.title : "")}" placeholder="Örn. Stok kodlama standardı"${dis}></div>
        <div class="field full"><label for="iDesc">İşin tanımı</label><textarea id="iDesc" rows="3" placeholder="Kapsam, beklenen çıktı, onay şartı…"${dis}>${esc(t ? t.desc || "" : "")}</textarea></div>
        <div class="field full"><label for="iOwner">Sorumlu kişi(ler)</label>${adm ? `<div class="chips" id="chips"></div><datalist id="peopleList">${allPeople().map(p => `<option value="${esc(p)}">`).join("")}</datalist>` : `<div class="people">${cur.owners.map(avatar).join("") || '<span class="note">Atanmadı</span>'}</div>`}</div>
        <div class="field"><label for="iStart">Başlangıç tarihi</label><input id="iStart" type="date" value="${esc(t ? t.start || "" : TODAY)}"${dis}></div>
        <div class="field"><label for="iEnd">Bitirme tarihi</label><input id="iEnd" type="date" value="${esc(t ? t.end || "" : "")}"${dis}></div>
        <div class="field full"><label for="iProg">Tamamlanma oranı</label>
          <div class="slider"><input id="iProg" type="range" min="0" max="100" step="5" value="${t ? Number(t.progress) || 0 : 0}"${prog ? "" : " disabled"}><span class="num" id="iProgV">${t ? Number(t.progress) || 0 : 0}%</span></div>
          ${prog ? `<div class="quick">${[0, 25, 50, 75, 100].map(v => `<button type="button" data-q="${v}">${v}%</button>`).join("")}</div>` : '<p class="note">Oranı yalnızca işin sorumluları ve yönetici değiştirebilir.</p>'}</div>
      </div>
      ${t ? `<section><h3 class="sec-t">Günlük geri bildirim <small>${fbs.length} kayıt</small></h3>
        ${canFeedback() ? `<form class="fbform" id="fbForm">
          <div class="field"><label for="fDate">Tarih</label><input id="fDate" type="date" value="${TODAY}" max="${TODAY}" required></div>
          <div class="field"><label>Yazan</label><input value="${esc(ME.name)}" disabled></div>
          <div class="field full"><label for="fText">Bugün ne yapıldı, engel var mı?</label><textarea id="fText" rows="2" required maxlength="3000" placeholder="Örn. Hammadde rafı sayıldı, 3 kodda fark var; yarın ikinci sayım."></textarea></div>
          ${prog ? `<div class="field"><label for="fProg">Güncel oran (isteğe bağlı)</label><input id="fProg" type="number" min="0" max="100" step="5" placeholder="${i.p}"></div>` : "<div></div>"}
          <div class="field" style="justify-content:flex-end"><button class="btn" type="submit" id="fSubmit">Geri bildirim ekle</button></div>
        </form>` : '<p class="note">İzleyici olarak geri bildirim ekleyemezsiniz.</p>'}
        <ul class="log" style="margin-top:16px">${fbs.map(f => `<li><div class="meta"><span class="num">${fmtS(f.date)}</span><b>${esc(f.author || "—")}</b>${f.progress != null ? `<span class="pill p-brand" style="padding:1px 8px;font-size:11.5px">${f.progress}%</span>` : ""}${(adm || f.uid === ME.uid) ? `<button class="del" data-fb="${esc(f.id)}">Sil</button>` : ""}</div><p>${esc(f.text)}</p></li>`).join("") || '<li><p class="note">Henüz geri bildirim yok.</p></li>'}</ul>
      </section>` : `<p class="note">Kaydettikten sonra bu işe günlük geri bildirim eklenebilir.</p>`}
    </div>
    <div class="df">${t && adm ? `<button class="btn danger" id="dDel">İşi sil</button>` : "<span></span>"}<div class="r"><button class="btn ghost" id="dCancel">${adm || prog ? "Vazgeç" : "Kapat"}</button>${adm || prog ? '<button class="btn" id="dSave">Kaydet</button>' : ""}</div></div>
  </aside>`;
  if (adm) renderChips();
  $("#scrim").onclick = closeDrawer; $("#dClose").onclick = closeDrawer; $("#dCancel").onclick = closeDrawer;
  const pr = $("#iProg"); pr.oninput = () => $("#iProgV").textContent = pr.value + "%";
  document.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { pr.value = b.dataset.q; pr.oninput(); });
  const save = $("#dSave");
  if (save) save.onclick = async () => {
    save.disabled = true;
    try {
      if (adm) {
        const title = $("#iTitle").value.trim(); if (!title) { toast("İşin adını yazın"); $("#iTitle").focus(); save.disabled = false; return; }
        const pend = $("#iOwner").value.trim(); if (pend && !cur.owners.includes(pend)) cur.owners.push(pend);
        const s = $("#iStart").value || null, e = $("#iEnd").value || null;
        if (s && e && e < s) { toast("Bitiş tarihi başlangıçtan önce olamaz"); save.disabled = false; return; }
        const body = { no: Number($("#iNo").value) || nextNo, group: $("#iGroup").value.trim(), title, desc: $("#iDesc").value.trim(), owners: cur.owners, start: s, end: e, progress: Number(pr.value), updatedAt: Date.now(), updatedBy: ME.name };
        const ref = id ? doc(fs, "tasks", id) : doc(collection(fs, "tasks"));
        await setDoc(ref, body);
        toast(id ? "İş güncellendi" : "İş eklendi");
      } else {
        await updateDoc(doc(fs, "tasks", id), { progress: Number(pr.value), updatedAt: Date.now(), updatedBy: ME.name });
        toast("Tamamlanma oranı güncellendi");
      }
      closeDrawer();
    } catch (err) { save.disabled = false; toast(writeErr(err)); }
  };
  if (t && adm) {
    const del = $("#dDel"); let armed = false;
    del.onclick = async () => {
      if (!armed) { armed = true; del.textContent = "Silmeyi onayla"; setTimeout(() => { armed = false; del.textContent = "İşi sil"; }, 4000); return; }
      try { const b = writeBatch(fs); b.delete(doc(fs, "tasks", id)); fbOf(id).forEach(f => b.delete(doc(fs, "feedback", f.id))); await b.commit(); toast("İş silindi"); closeDrawer(); }
      catch (err) { toast(writeErr(err)); }
    };
  }
  if (t && canFeedback()) {
    $("#fbForm").onsubmit = async ev => {
      ev.preventDefault();
      const text = $("#fText").value.trim(), date = $("#fDate").value; if (!text || !date) return;
      const pe = $("#fProg"); const pv = pe && pe.value !== "" ? Math.max(0, Math.min(100, Math.round(Number(pe.value)))) : null;
      $("#fSubmit").disabled = true;
      try {
        const f = { taskId: id, date, author: ME.name, text, at: Date.now(), uid: ME.uid }; if (pv != null) f.progress = pv;
        await addDoc(collection(fs, "feedback"), f);
        if (pv != null) await updateDoc(doc(fs, "tasks", id), { progress: pv, updatedAt: Date.now(), updatedBy: ME.name });
        toast("Geri bildirim eklendi"); openDrawer(id);
      } catch (err) { $("#fSubmit").disabled = false; toast(writeErr(err)); }
    };
  }
  document.querySelectorAll("[data-fb]").forEach(b => {
    let armed = false;
    b.onclick = async () => { if (!armed) { armed = true; b.textContent = "Emin misiniz?"; return; } try { await deleteDoc(doc(fs, "feedback", b.dataset.fb)); openDrawer(id); } catch (err) { toast(writeErr(err)); } };
  });
  (adm ? $("#iTitle") : $("#dClose")).focus();
}
function renderChips() {
  const box = $("#chips");
  box.innerHTML = cur.owners.map((o, k) => `<span class="av" style="--c:${colorOf(o)}"><i>${esc(initials(o))}</i>${esc(o)}<button type="button" data-rm="${k}" aria-label="${esc(o)} kaldır">×</button></span>`).join("") + `<input id="iOwner" list="peopleList" placeholder="İsim yazıp Enter'a basın">`;
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { cur.owners.splice(Number(b.dataset.rm), 1); renderChips(); $("#iOwner").focus(); });
  const inp = $("#iOwner");
  const commit = () => { const v = inp.value.trim().replace(/,$/, ""); if (v && !cur.owners.includes(v)) { cur.owners.push(v); renderChips(); $("#iOwner").focus(); } else inp.value = ""; };
  inp.onkeydown = e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !inp.value && cur.owners.length) { cur.owners.pop(); renderChips(); $("#iOwner").focus(); } };
  inp.onchange = () => { if (allPeople().includes(inp.value.trim())) commit(); };
}

/* ================= Ekip ve yetkiler (yönetici) ================= */
let admRows = [];
function openAdmin() {
  if (!isAdmin()) return;
  admRows = Object.entries(state.access || {}).map(([email, m]) => ({ email, name: m.name || "", role: m.role || "member" }));
  if (!admRows.length) {
    const names = new Set(); state.tasks.forEach(t => (t.owners || []).forEach(o => names.add(o)));
    admRows = [{ email: ME.email, name: ME.name, role: "admin" }, ...[...names].filter(n => n !== ME.name).map(n => ({ email: "", name: n, role: "member" }))];
  }
  paintAdmin();
}
function paintAdmin(msg = "") {
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer adm" role="dialog" aria-modal="true" aria-labelledby="aTitle">
    <div class="dh"><h2 id="aTitle">Ekip ve yetkiler</h2><button class="x" id="aClose" aria-label="Kapat">×</button></div>
    <div class="db">
      <section>
        <h3 class="sec-t">Ekip üyeleri <small>${admRows.length} kişi</small></h3>
        <div class="roles"><div><b>Yönetici:</b> iş ekler, düzenler, siler; ekibi yönetir.</div><div><b>Üye:</b> geri bildirim yazar; sorumlusu olduğu işlerin oranını günceller.</div><div><b>İzleyici:</b> yalnızca görür.</div></div>
        <div class="tw" style="margin-top:10px"><table><thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th></th></tr></thead><tbody>
        ${admRows.map((r, k) => `<tr><td><input id="aN${k}" value="${esc(r.name)}" aria-label="Ad Soyad"></td><td><input id="aE${k}" type="email" value="${esc(r.email)}" placeholder="ad@ornek.com" aria-label="E-posta"></td><td><select id="aR${k}" aria-label="Rol">${opt("admin", "Yönetici", r.role)}${opt("member", "Üye", r.role)}${opt("viewer", "İzleyici", r.role)}</select></td><td><button class="rm" data-rm="${k}" aria-label="Kaldır">×</button></td></tr>`).join("")}
        </tbody></table></div>
        <p class="hint">Ad Soyad, işlerdeki "Sorumlu" adıyla birebir aynı olmalı; üye kendi işlerini bu eşleşmeyle tanır. Kişi, burada yazan e-posta ile giriş yapmalı (Google hesabı veya e-posta/şifre).</p>
        ${msg ? `<div class="gate-err" role="alert" style="margin-top:8px">${esc(msg)}</div>` : ""}
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn ghost" id="aAdd">+ Kişi ekle</button><button class="btn" id="aSave">Ekibi kaydet</button></div>
      </section>
      <section>
        <h3 class="sec-t">Kayıtları içe aktar</h3>
        <p class="note" style="margin:0 0 8px">Önceki takip ekranından alınan <b>karmen-veri.json</b> dosyasını seçin. Aynı numaralı kayıtların üzerine yazılır; diğer kayıtlar korunur.</p>
        <input type="file" id="impFile" accept="application/json,.json">
      </section>
    </div>
  </aside>`;
  const close = closeDrawer;
  $("#scrim").onclick = close; $("#aClose").onclick = close;
  const collect = () => { admRows = admRows.map((r, k) => ({ name: $("#aN" + k).value.trim(), email: lower($("#aE" + k).value), role: $("#aR" + k).value })); };
  $("#aAdd").onclick = () => { collect(); admRows.push({ name: "", email: "", role: "member" }); paintAdmin(); $("#aN" + (admRows.length - 1)).focus(); };
  document.querySelectorAll(".adm [data-rm]").forEach(b => b.onclick = () => { collect(); admRows.splice(Number(b.dataset.rm), 1); paintAdmin(); });
  $("#aSave").onclick = async () => {
    collect();
    const members = {}; const errs = [];
    for (const r of admRows) {
      if (!r.email && !r.name) continue;
      if (!r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) { errs.push((r.name || "Adsız") + ": e-posta eksik veya hatalı"); continue; }
      if (!r.name) { errs.push(r.email + ": ad soyad eksik"); continue; }
      if (members[r.email]) { errs.push(r.email + " iki kez yazılmış"); continue; }
      members[r.email] = { name: r.name, role: r.role };
    }
    if (errs.length) { paintAdmin(errs.join(" · ")); return; }
    const admins = Object.values(members).filter(m => m.role === "admin").length;
    if (!admins && !isBoot(ME.email)) { paintAdmin("En az bir yönetici kalmalı."); return; }
    $("#aSave").disabled = true;
    try { await setDoc(doc(fs, "config", "access"), { members, updatedAt: Date.now(), updatedBy: ME.email }); toast("Ekip kaydedildi"); closeDrawer(); }
    catch (e) { paintAdmin(writeErr(e)); }
  };
  $("#impFile").onchange = async () => {
    const f = $("#impFile").files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.tasks)) throw new Error("Dosya biçimi tanınmadı");
      const ops = [];
      data.tasks.forEach(t => { const { id, ...body } = t; if (id) ops.push(["tasks", id, body]); });
      (data.feedback || []).forEach(x => { const { id, ...body } = x; if (id) ops.push(["feedback", id, { ...body, uid: body.uid || ME.uid }]); });
      for (let k = 0; k < ops.length; k += 400) { const b = writeBatch(fs); ops.slice(k, k + 400).forEach(([c, id, body]) => b.set(doc(fs, c, id), body)); await b.commit(); }
      toast(data.tasks.length + " iş ve " + (data.feedback || []).length + " geri bildirim içe aktarıldı");
      closeDrawer();
    } catch (e) { paintAdmin("İçe aktarılamadı: " + (e.code ? writeErr(e) : e.message)); }
  };
}

/* ================= Mesajlar ================= */
const MSG = { map: new Map(), reads: {}, peer: "all", first: { all: true, mine: true }, sig: "", readTimer: null };
const safeKey = s => s.replace(/[^a-z0-9_]/g, "_");
const dmKey = (a, b) => "dm_" + safeKey([lower(a), lower(b)].sort().join("__"));
const keyOfPeer = peer => peer === "all" ? "all" : dmKey(ME.email, peer);
const convOf = m => m.to === "all" ? "all" : dmKey(m.from, m.to);
const peerOf = m => m.to === "all" ? "all" : (lower(m.from) === ME.email ? lower(m.to) : lower(m.from));
function nameOf(email) {
  email = lower(email);
  const a = state.access || {};
  if (a[email] && a[email].name) return a[email].name;
  if (ME && email === ME.email) return ME.name;
  for (const m of MSG.map.values()) if (lower(m.from) === email && m.fromName) return m.fromName;
  return email;
}
function msgPeople() {
  const s = new Map();
  Object.entries(state.access || {}).forEach(([e, m]) => { if (e !== ME.email) s.set(e, (m && m.name) || e); });
  BOOT_ADMINS.map(lower).forEach(e => { if (e !== ME.email && !s.has(e)) s.set(e, nameOf(e)); });
  for (const m of MSG.map.values()) { const p = peerOf(m); if (p !== "all" && p !== ME.email && !s.has(p)) s.set(p, nameOf(p)); }
  return [...s].map(([email, name]) => ({ email, name }));
}
const convMsgs = key => [...MSG.map.values()].filter(m => convOf(m) === key).sort((a, b) => (a.at || 0) - (b.at || 0));
function unreadOf(key) { const r = MSG.reads[key] || 0; let n = 0; for (const m of MSG.map.values()) if (convOf(m) === key && lower(m.from) !== ME.email && (m.at || 0) > r) n++; return n; }
function totalUnread() { const ks = new Set([...MSG.map.values()].map(convOf)); let n = 0; ks.forEach(k => n += unreadOf(k)); return n; }
const hhmm = ts => { try { return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)); } catch (e) { return ""; } };
const dayOf = ts => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(ts)); } catch (e) { return ""; } };
function dayLabel(iso) { const d = dnum(iso), n = dnum(TODAY); if (d === n) return "Bugün"; if (d === n - 1) return "Dün"; return fmtS(iso); }
function shortWhen(ts) { const iso = dayOf(ts); return iso === TODAY ? hhmm(ts) : dayLabel(iso); }

function startMessages() {
  MSG.map.clear(); MSG.first = { all: true, mine: true }; MSG.sig = "";
  const onSnap = which => snap => {
    const initial = MSG.first[which];
    snap.docChanges().forEach(ch => {
      const d = { id: ch.doc.id, ...ch.doc.data() };
      if (ch.type === "removed") MSG.map.delete(d.id);
      else { MSG.map.set(d.id, d); if (ch.type === "added" && !initial && lower(d.from) !== ME.email) incoming(d); }
    });
    MSG.first[which] = false; msgChanged();
  };
  const err = e => toast("Mesajlar okunamadı: " + (e.code || e.message));
  dataUnsubs.push(onSnapshot(query(collection(fs, "messages"), where("to", "==", "all")), onSnap("all"), err));
  dataUnsubs.push(onSnapshot(query(collection(fs, "messages"), where("participants", "array-contains", ME.email)), onSnap("mine"), err));
  dataUnsubs.push(onSnapshot(doc(fs, "reads", ME.uid), s => { MSG.reads = s.exists() ? (s.data().convs || {}) : {}; msgChanged(); }, () => {}));
}
const msgOpen = () => !$("#msgPanel").hidden;
function viewingConv(key) { return msgOpen() && !document.hidden && keyOfPeer(MSG.peer) === key && !(innerWidth <= 760 && !$("#msgwrap")?.classList.contains("show-thread")); }
function incoming(m) {
  const key = convOf(m);
  if (viewingConv(key)) return;
  const who = nameOf(m.from) + (m.to === "all" ? " · Tüm ekip" : "");
  toast(who + ": " + String(msgText(m)).slice(0, 90));
  try {
    if (document.hidden && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(r => r.showNotification(who, { body: String(msgText(m)).slice(0, 160), icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: key }));
    }
  } catch (e) {}
}
function msgChanged() {
  const n = totalUnread();
  const b = $("#mBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n;
  document.title = (n ? "(" + n + ") " : "") + "Kar-Men Proje Takip";
  notifSoon();
  if (msgOpen() && !$("#app").hidden) renderMessages();
  if (!$("#app").hidden) renderHome();
}
function markReadSoon() { clearTimeout(MSG.readTimer); MSG.readTimer = setTimeout(markRead, 400); }
function markRead() {
  if (!msgOpen() || document.hidden || !ME) return;
  const key = keyOfPeer(MSG.peer);
  if (!viewingConv(key)) return;
  const list = convMsgs(key); if (!list.length) return;
  const last = Math.max(...list.map(m => m.at || 0));
  if ((MSG.reads[key] || 0) >= last) return;
  MSG.reads = { ...MSG.reads, [key]: last };
  setDoc(doc(fs, "reads", ME.uid), { convs: { [key]: last } }, { merge: true }).catch(() => {});
  msgChanged();
}
const fmtSec = s => Math.floor((s || 0) / 60) + ":" + String(Math.round(s || 0) % 60).padStart(2, "0");
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
function msgText(m) {
  if (m.call) { const c = m.call, k = c.type === "video" ? "görüntülü arama" : "sesli arama";
    return c.st === "answered" ? (c.type === "video" ? "Görüntülü" : "Sesli") + " arama · " + fmtSec(c.dur) : c.st === "rejected" ? "Reddedilen " + k : c.st === "busy" ? "Meşgul · " + k : "Cevapsız " + k; }
  if (!m.att) return m.text || "";
  const a = m.att, k = (a.type || "").startsWith("image/") ? "Fotoğraf" : (a.type || "").startsWith("audio/") ? "Sesli mesaj (" + fmtSec(a.dur) + ")" : "Dosya: " + a.name;
  return m.text ? k + " · " + m.text : k;
}
async function sendMsg(peer, text, att, call) {
  text = String(text || "").trim(); if (!text && !att && !call) return false;
  const m = { to: peer === "all" ? "all" : lower(peer), from: ME.email, fromName: ME.name, text, at: Date.now(), participants: peer === "all" ? [] : [ME.email, lower(peer)] };
  if (att) m.att = att;
  if (call) m.call = call;
  try { await addDoc(collection(fs, "messages"), m); return true; }
  catch (e) { toast(e.code === "permission-denied" ? "Mesaj gönderilemedi: bu kişiye mesaj atma yetkiniz yok." : writeErr(e)); return false; }
}
// Dosyayı msg_files koleksiyonuna yazar, mesaja eklenecek bilgiyi döndürür
async function msgUpload(peer, data, meta) {
  const fid = doc(collection(fs, "msg_files")).id;
  await setDoc(doc(fs, "msg_files", fid), { data, name: meta.name, type: meta.type, size: data.length, at: Date.now(), uid: ME.uid, from: ME.email,
    to: peer === "all" ? "all" : lower(peer), participants: peer === "all" ? [] : [ME.email, lower(peer)] });
  const att = { id: fid, name: meta.name, type: meta.type, size: meta.size || data.length };
  if (meta.thumb) att.thumb = meta.thumb; if (meta.dur) att.dur = meta.dur;
  return att;
}
function msgBusy(t) { const el = $("#thBusy"); if (!el) return; el.hidden = !t; el.textContent = t || ""; }
async function msgSendFiles(list) {
  const peer = MSG.peer;
  for (const f of list) {
    const type = f.type || "application/octet-stream", isImg = type.startsWith("image/");
    if (!isImg && f.size > 700 * 1024) { toast(f.name + ": dosya 700 KB'tan büyük. Daha küçük bir dosya seçin ya da fotoğrafını çekip gönderin."); continue; }
    msgBusy("Gönderiliyor: " + f.name);
    try {
      let data, meta = { name: f.name, type, size: f.size };
      if (isImg) { const img = await loadImage(f); data = shrinkImg(img, 1600, 760000); meta.thumb = shrinkImg(img, 360, 45000); meta.type = "image/jpeg"; meta.size = data.length; }
      else data = await readDataURL(f);
      const cap = $("#thText") ? $("#thText").value : "";
      const att = await msgUpload(peer, data, meta);
      if (await sendMsg(peer, cap, att) && $("#thText")) { $("#thText").value = ""; }
    } catch (e) { toast(f.name + " gönderilemedi: " + (e.code ? writeErr(e) : e.message || e)); }
  }
  msgBusy("");
}
/* --- ses kaydı --- */
const REC = { mr: null, stream: null, chunks: [], t0: 0, timer: null, cancel: false };
const recMime = () => { const c = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]; try { return c.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || ""; } catch (e) { return ""; } };
async function recStart() {
  if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast("Bu tarayıcı ses kaydını desteklemiyor."); return; }
  try { REC.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { toast("Mikrofon izni verilmedi. Tarayıcı ayarlarından bu site için mikrofona izin verin."); return; }
  const mime = recMime();
  try { REC.mr = new MediaRecorder(REC.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }); }
  catch (e) { REC.mr = new MediaRecorder(REC.stream); }
  REC.chunks = []; REC.cancel = false; REC.t0 = Date.now();
  REC.mr.ondataavailable = ev => { if (ev.data && ev.data.size) REC.chunks.push(ev.data); };
  REC.mr.onstop = recDone;
  REC.mr.start(1000);
  $("#thRec").hidden = false; $("#thForm").classList.add("recording");
  const tick2 = () => { const s = (Date.now() - REC.t0) / 1000; $("#recT").textContent = fmtSec(s); if (s >= 120) recStop(false); };
  tick2(); REC.timer = setInterval(tick2, 250);
}
function recStop(cancel) { REC.cancel = !!cancel; clearInterval(REC.timer); try { if (REC.mr && REC.mr.state !== "inactive") REC.mr.stop(); } catch (e) { recDone(); } }
async function recDone() {
  const dur = Math.round((Date.now() - REC.t0) / 1000);
  try { REC.stream && REC.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  const thRec = $("#thRec"); if (thRec) thRec.hidden = true; const tf = $("#thForm"); if (tf) tf.classList.remove("recording");
  const chunks = REC.chunks; REC.mr = null; REC.stream = null; REC.chunks = [];
  if (REC.cancel || !chunks.length) return;
  if (dur < 1) { toast("Kayıt çok kısa"); return; }
  const type = (chunks[0].type || recMime() || "audio/webm").split(";")[0];
  const blob = new Blob(chunks, { type });
  if (blob.size > 720 * 1024) { toast("Ses kaydı çok uzun. En fazla 2 dakika kaydedin."); return; }
  msgBusy("Sesli mesaj gönderiliyor…");
  try {
    const data = await readDataURL(blob);
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const att = await msgUpload(MSG.peer, data, { name: "sesli-mesaj." + ext, type, size: blob.size, dur });
    await sendMsg(MSG.peer, "", att);
  } catch (e) { toast("Sesli mesaj gönderilemedi: " + (e.code ? writeErr(e) : e.message || e)); }
  msgBusy("");
}
const AUD = new Map();
async function playAudio(btn, att) {
  const box = btn.closest(".aud");
  try {
    btn.disabled = true; btn.textContent = "…";
    let u = AUD.get(att.id);
    if (!u) { const s = await getDoc(doc(fs, "msg_files", att.id)); if (!s.exists()) throw new Error("Kayıt bulunamadı"); u = URL.createObjectURL(dataToBlob(s.data().data)); AUD.set(att.id, u); }
    box.innerHTML = `<audio controls autoplay src="${u}"></audio>`;
  } catch (e) { btn.disabled = false; btn.textContent = "▶"; toast("Ses açılamadı: " + (e.code ? writeErr(e) : e.message)); }
}
function convRows() {
  const rows = [{ peer: "all", name: "Tüm ekip", all: true }, ...msgPeople().map(p => ({ peer: p.email, name: p.name }))];
  rows.forEach(r => { const l = convMsgs(keyOfPeer(r.peer)); r.last = l[l.length - 1] || null; r.unread = unreadOf(keyOfPeer(r.peer)); });
  const all = rows.shift();
  rows.sort((a, b) => ((b.last && b.last.at) || 0) - ((a.last && a.last.at) || 0) || a.name.localeCompare(b.name, "tr"));
  return [all, ...rows];
}
function renderMessages() {
  const v = $("#msgHost");
  if (!v.querySelector("#msgwrap")) {
    MSG.sig = "";
    v.innerHTML = `<div class="msgwrap" id="msgwrap">
      <aside class="convs" aria-label="Sohbetler"><div class="convs-h">Sohbetler</div><div id="convList"></div></aside>
      <section class="thread" aria-label="Konuşma">
        <div class="th-h" id="thHead"></div>
        <div class="th-b" id="thBody" aria-live="polite"></div>
        <div class="th-busy" id="thBusy" hidden></div>
        <div class="th-rec" id="thRec" hidden><span class="recdot"></span><span>Kaydediliyor</span><b class="num" id="recT">0:00</b><span class="note">en fazla 2:00</span><button type="button" class="btn ghost" id="recCancel">İptal</button><button type="button" class="btn" id="recSend">Gönder</button></div>
        <form class="th-f" id="thForm">
          <button type="button" class="tbtn" id="thAtt" aria-label="Fotoğraf veya dosya ekle" title="Fotoğraf veya dosya ekle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7"/></svg></button>
          <input type="file" id="thFile" multiple hidden accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip">
          <textarea id="thText" rows="1" maxlength="2000" placeholder="Mesaj yazın…" aria-label="Mesaj"></textarea>
          <button type="button" class="tbtn" id="thMic" aria-label="Sesli mesaj kaydet" title="Sesli mesaj kaydet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg></button>
          <button class="btn" id="thSend" type="submit">Gönder</button></form>
      </section></div>
      <div class="msgnote" id="msgNote"></div>`;
    const ta = $("#thText");
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
    ta.oninput = grow;
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#thForm").requestSubmit(); } };
    $("#thForm").onsubmit = e => { e.preventDefault(); const t = ta.value; if (!t.trim()) return; ta.value = ""; grow(); sendMsg(MSG.peer, t); ta.focus(); };
    $("#thAtt").onclick = () => $("#thFile").click();
    $("#thFile").onchange = async () => { const fl = [...$("#thFile").files]; $("#thFile").value = ""; if (fl.length) { await msgSendFiles(fl); grow(); } };
    $("#thMic").onclick = () => recStart();
    $("#recCancel").onclick = () => recStop(true);
    $("#recSend").onclick = () => recStop(false);
    // panele sürükle-bırak ve yapıştırma ile dosya gönderme
    const wrap = $("#msgwrap");
    wrap.addEventListener("dragover", e => { if (can("p.msg")) { e.preventDefault(); wrap.classList.add("drop"); } });
    wrap.addEventListener("dragleave", e => { if (e.target === wrap || !wrap.contains(e.relatedTarget)) wrap.classList.remove("drop"); });
    wrap.addEventListener("drop", e => { e.preventDefault(); wrap.classList.remove("drop"); if (can("p.msg") && e.dataTransfer.files.length) msgSendFiles([...e.dataTransfer.files]); });
    ta.addEventListener("paste", e => { const fl = [...(e.clipboardData && e.clipboardData.files || [])]; if (fl.length && can("p.msg")) { e.preventDefault(); msgSendFiles(fl); } });
  }
  // sohbet listesi
  const rows = convRows();
  $("#convList").innerHTML = rows.map(r => {
    const prev = r.last ? (r.all && lower(r.last.from) !== ME.email ? nameOf(r.last.from) + ": " : lower(r.last.from) === ME.email ? "Siz: " : "") + msgText(r.last) : (r.all ? "Ekibin ortak kanalı" : "Henüz mesaj yok");
    return `<button class="conv${r.unread ? " unread" : ""}" data-peer="${esc(r.peer)}" aria-current="${r.peer === MSG.peer}">
      <span class="cav${r.all ? " all" : ""}" style="--c:${colorOf(r.name)}">${r.all ? "EKİP" : esc(initials(r.name))}</span>
      <span style="min-width:0"><span class="cn" style="display:block">${esc(r.name)}</span><span class="cp" style="display:block">${esc(prev)}</span></span>
      <span class="cr">${r.last ? esc(shortWhen(r.last.at)) : ""}${r.unread ? `<span class="mbadge">${r.unread}</span>` : ""}</span></button>`;
  }).join("");
  $("#convList").querySelectorAll("[data-peer]").forEach(b => b.onclick = () => {
    MSG.peer = b.dataset.peer; MSG.sig = ""; $("#msgwrap").classList.add("show-thread"); renderMessages(); $("#thText").focus();
  });
  // konuşma başlığı
  const key = keyOfPeer(MSG.peer), cur = rows.find(r => r.peer === MSG.peer) || rows[0];
  const memberCount = Object.keys(state.access || {}).length;
  $("#thHead").innerHTML = `<button class="back" id="thBack" type="button" aria-label="Sohbetlere dön">‹</button>
    <span class="cav${cur.all ? " all" : ""}" style="--c:${colorOf(cur.name)}">${cur.all ? "EKİP" : esc(initials(cur.name))}</span>
    <span style="min-width:0"><span class="tn" style="display:block">${esc(cur.name)}</span><span class="ts" style="display:block">${cur.all ? memberCount + " kişi · herkes görür" : "Özel mesaj · yalnızca ikiniz görürsünüz"}</span></span>`;
  if (!cur.all && can("p.msg")) {
    $("#thHead").insertAdjacentHTML("beforeend", `<span class="thcall"><button type="button" class="tbtn" id="thCallA" aria-label="${esc(cur.name)} ile sesli arama" title="Sesli arama">${CALL_SVG.audio}</button><button type="button" class="tbtn" id="thCallV" aria-label="${esc(cur.name)} ile görüntülü arama" title="Görüntülü arama">${CALL_SVG.video}</button></span>`);
    $("#thCallA").onclick = () => startCall(MSG.peer, "audio"); $("#thCallV").onclick = () => startCall(MSG.peer, "video");
  }
  $("#thBack").onclick = () => { $("#msgwrap").classList.remove("show-thread"); };
  // mesajlar
  const list = convMsgs(key);
  const sig = key + "|" + list.length + "|" + (list.length ? list[list.length - 1].id + (list[list.length - 1].at || 0) : "") + "|" + TODAY;
  if (sig !== MSG.sig) {
    const body = $("#thBody");
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80 || !MSG.sig.startsWith(key + "|");
    let lastDay = "", html = "";
    list.forEach(m => {
      const d = dayOf(m.at || 0); if (d !== lastDay) { html += `<div class="dsep">${esc(dayLabel(d))}</div>`; lastDay = d; }
      const mine = lower(m.from) === ME.email; const nm = nameOf(m.from);
      const canDel = mine || (isAdmin() && m.to === "all");
      const a = m.att; let ah = "";
      if (m.call) {
        const c = m.call, okc = c.st === "answered", peerE = mine ? lower(m.to) : lower(m.from);
        html += `<div class="bub callbub${mine ? " mine" : ""}${okc ? "" : " miss"}"><span class="cbi">${CALL_SVG[c.type === "video" ? "video" : "audio"]}</span><span class="cbt"><b>${esc(msgText(m))}</b><small>${mine ? "Giden" : "Gelen"} · ${esc(hhmm(m.at || 0))}</small></span>${can("p.msg") && m.to !== "all" ? `<button type="button" class="cback" data-callback="${esc(peerE)}" data-ct="${c.type === "video" ? "video" : "audio"}">Geri ara</button>` : ""}</div>`;
        return;
      }
      if (a && (a.type || "").startsWith("image/")) ah = `<button type="button" class="mimg" data-att="${esc(m.id)}" aria-label="Fotoğrafı büyüt">${a.thumb ? `<img src="${a.thumb}" alt="${esc(a.name)}">` : "Fotoğraf"}</button>`;
      else if (a && (a.type || "").startsWith("audio/")) ah = `<div class="aud"><button type="button" class="play" data-aud="${esc(m.id)}" aria-label="Sesli mesajı oynat">▶</button><span>Sesli mesaj</span><b class="num">${fmtSec(a.dur)}</b></div>`;
      else if (a) ah = `<button type="button" class="mfile" data-att="${esc(m.id)}"><span class="fx">${esc((String(a.name).split(".").pop() || "DOSYA").toUpperCase().slice(0, 4))}</span><span class="fn2"><b>${esc(a.name)}</b><small>${fmtSize(a.size || 0)}</small></span></button>`;
      html += `<div class="bub${mine ? " mine" : ""}${a ? " hasatt" : ""}" style="--c:${colorOf(nm)}">${!mine && m.to === "all" ? `<span class="who">${esc(nm)}</span>` : ""}${ah}${m.text ? `<p>${esc(m.text)}</p>` : ""}<span class="t">${esc(hhmm(m.at || 0))}${canDel ? `<button data-del="${esc(m.id)}">Sil</button>` : ""}</span></div>`;
    });
    body.innerHTML = html || `<div class="th-empty">${cur.all ? "Tüm ekibe ilk mesajı yazın. Buradaki mesajları ekipteki herkes görür." : esc(cur.name) + " ile henüz mesajlaşmadınız. İlk mesajı aşağıdan yazın."}</div>`;
    body.querySelectorAll("[data-del]").forEach(b => { let armed = false; b.onclick = async () => {
      if (!armed) { armed = true; b.textContent = "Silinsin mi?"; setTimeout(() => { armed = false; b.textContent = "Sil"; }, 3000); return; }
      const mm = MSG.map.get(b.dataset.del);
      try { await deleteDoc(doc(fs, "messages", b.dataset.del)); if (mm && mm.att && lower(mm.from) === ME.email) deleteDoc(doc(fs, "msg_files", mm.att.id)).catch(() => {}); } catch (e) { toast(writeErr(e)); } }; });
    body.querySelectorAll("[data-att]").forEach(b => b.onclick = () => { const mm = MSG.map.get(b.dataset.att); if (mm && mm.att) diViewFile(mm.att, "msg_files"); });
    body.querySelectorAll("[data-callback]").forEach(b => b.onclick = () => startCall(b.dataset.callback, b.dataset.ct));
    body.querySelectorAll("[data-aud]").forEach(b => b.onclick = () => { const mm = MSG.map.get(b.dataset.aud); if (mm && mm.att) playAudio(b, mm.att); });
    body.querySelectorAll(".mimg img").forEach(im => im.addEventListener("load", () => { if (nearBottom) body.scrollTop = body.scrollHeight; }, { once: true }));
    if (nearBottom) body.scrollTop = body.scrollHeight;
    MSG.sig = sig;
  }
  $("#thForm").hidden = !can("p.msg");
  if (!can("p.msg") && REC.mr) recStop(true);
  // bildirim izni notu
  const note = $("#msgNote");
  if ("Notification" in window && Notification.permission === "default") {
    note.innerHTML = 'Uygulama açıkken başka sekmedeyseniz yeni mesaj bildirimi alabilirsiniz. <button class="linkbtn" id="nPerm" type="button">Bildirimlere izin ver</button>';
    $("#nPerm").onclick = () => Notification.requestPermission().then(() => renderMessages());
  } else note.textContent = "Mesajlar anında iletilir. Enter gönderir, Shift+Enter alt satıra geçer.";
  markReadSoon();
}
/* ================= Ana ekran ve modüller ================= */
const ICONS = {
  proje: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  stok: '<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  satinalma: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12h12.1l2-8H6.1"/>',
  disis: '<path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  planlama: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M7 13h6M10 17h7"/>',
  siparis: '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 12h8M9 16h8"/>',
  personel: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.6a3.2 3.2 0 010 6.3"/><path d="M18 14.4c1.8.8 3 2.9 3 5.6"/>'
};
const svgIco = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
const MODULES = [
  { id: "proje", name: "PROJE TAKİP", desc: "İşler, sorumlular, günlük geri bildirim ve ekip mesajları", active: true },
  { id: "stok", name: "STOK MODÜLÜ", desc: "Stok kartları, depo adresleri, giriş–çıkış hareketleri ve alış fiyatları", active: true },
  { id: "satinalma", name: "SATINALMA MODÜLÜ", desc: "Talepler, tedarikçiler ve satın alma siparişleri",
    scope: ["Satın alma talepleri", "Tedarikçi kartları", "Satın alma siparişi ve teslim takibi"], tasks: [13] },
  { id: "disis", name: "DIŞ İŞ TAKİP MODÜLÜ", desc: "Dışarı çıkan personel, araç, çıkış–dönüş saatleri ve masraflar", active: true },
  { id: "personel", name: "PERSONEL TAKİP MODÜLÜ", desc: "Günlük devam, geç kalma, izinler ve personel listesi", active: true },
  { id: "planlama", name: "PLANLAMA MODÜLÜ", desc: "İş istasyonları, ürün iş akış şemaları ve iş emirleri", active: true },
  { id: "siparis", name: "SİPARİŞ TAKİP MODÜLÜ", desc: "Müşteri siparişleri ve termin takibi",
    scope: ["Müşteri siparişleri", "Termin takibi", "Acil sipariş görünürlüğü"], tasks: [9] }
];
let ROUTE = "home";
function route() {
  let r = (location.hash || "").replace(/^#/, "") || "home";
  if (r === "yetki" && !isAdmin()) { r = "home"; try { history.replaceState(null, "", "#home"); } catch (e) {} }
  if (r !== "home" && r !== "yetki" && !MODULES.some(m => m.id === r)) r = "home";
  let mod = MODULES.find(m => m.id === r);
  if (mod && lvl(mod.id) === "none") { toast(mod.name + " için yetkiniz yok"); r = "home"; mod = null; try { history.replaceState(null, "", "#home"); } catch (e) {} }
  const changed = r !== ROUTE; ROUTE = r;
  $("#home").hidden = r !== "home";
  $("#modProje").hidden = r !== "proje";
  $("#modDisis").hidden = r !== "disis";
  $("#modPersonel").hidden = r !== "personel";
  $("#modStok").hidden = r !== "stok";
  $("#modPlan").hidden = r !== "planlama";
  $("#modYetki").hidden = r !== "yetki";
  $("#modPh").hidden = !(mod && !mod.active);
  $("#crumb").innerHTML = r === "home" ? "<b>Ana ekran</b>" : `<a href="#home">‹ <span>Ana ekran</span></a><b>${esc(mod ? mod.name : "YETKİLENDİRME")}</b>`;
  if (mod && !mod.active) renderPh(mod);
  renderHome();
  if (r === "proje") render();
  if (r === "disis") renderDisis();
  if (r === "personel") { pkWatch(); renderPersonel(); }
  if (r === "stok") { skWatch(); renderStok(); }
  if (r === "planlama") renderPlan();
  if (r === "yetki") { if (!YT.dirty) ytLoad(); renderYetki(); }
  if (changed && r !== "yetki" && YT.dirty) toast("Yetkilendirmede kaydedilmemiş değişiklik var. Kaydetmek için Yetkilendirme ekranına dönün.");
  if (changed) { closeDrawer(); scrollTo(0, 0); }
}
addEventListener("hashchange", route);
function renderHome() {
  if (!ME || $("#home").hidden) return;
  const T = state.tasks, n = T.length;
  const avg = n ? Math.round(T.reduce((a, t) => a + info(t).p, 0) / n) : 0;
  const late = T.filter(t => info(t).key === "late").length;
  const active = T.filter(isActive), fbT = new Set(state.feedback.filter(f => f.date === TODAY).map(f => f.taskId));
  const unread = typeof totalUnread === "function" ? totalUnread() : 0;
  $("#tiles").innerHTML = MODULES.filter(m => lvl(m.id) !== "none").map(m => {
    if (m.id === "disis") return disisTile(m);
    if (m.id === "personel") return personelTile(m);
    if (m.id === "stok") return stokTile(m);
    if (m.id === "planlama") return planTile(m);
    if (m.active) return `<a class="tile on" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <svg class="wave" viewBox="0 0 180 120" aria-hidden="true"><path d="M0 70 C40 40 80 100 180 50 L180 120 L0 120Z" fill="#fff"/></svg>
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">${lvl(m.id) === "view" ? "GÖZLEMCİ" : "AKTİF"}</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>
        <div class="meter" title="Genel tamamlanma ${avg}%"><i style="width:${avg}%"></i></div>
        <div class="stats"><span>%${avg} tamam</span><span>${n} iş</span>${late ? `<span class="alert">${late} geciken</span>` : ""}${active.length ? `<span>Geri bildirim ${active.filter(t => fbT.has(t.id)).length}/${active.length}</span>` : ""}${unread ? `<span class="alert">${unread} yeni mesaj</span>` : ""}</div>
      </div></a>`;
    return `<a class="tile" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">HAZIRLANIYOR</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div></div></a>`;
  }).join("") + (isAdmin() ? yetkiTile() : "");
}
function renderPh(m) {
  $("#phEyebrow").textContent = "MODÜL · HAZIRLANIYOR";
  $("#phTitle").textContent = m.name;
  const rel = (m.tasks || []).map(no => state.tasks.find(t => Number(t.no) === no)).filter(Boolean);
  $("#phBody").innerHTML = `<div class="ph-card">
    <span class="ph-ico">${svgIco(m.id)}</span>
    <div>
      <div class="ph-state" role="status">Proje Devam Aşamasındadır</div>
      <p>${esc(m.name)} şu anda KARMEN MRP-ERP Dönüşüm Projesi kapsamında hazırlanıyor. Hazır olduğunda bu ekrandan kullanılabilecek.</p>
      <a class="btn ghost ph-back" href="#home" style="display:inline-block;margin-top:14px;text-decoration:none">‹ Ana ekrana dön</a>
    </div>
    <div class="ph-cols">
      <div class="ph-box"><h3>Planlanan kapsam</h3><ul>${(m.scope || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="ph-box"><h3>İlgili proje işleri</h3>${rel.length ? rel.map(t => { const i = info(t); return `<div class="ph-task" data-goto="${esc(t.id)}" tabindex="0" role="button"><span class="tt">${esc(t.no)}. ${esc(t.title)}</span><div class="prog"><div class="bar"><span style="width:${i.p}%;--fill:${i.fill}"></span></div><span class="pct">${i.p}%</span></div></div>`; }).join("") : '<p class="note" style="margin:0">Bağlı iş bulunamadı.</p>'}</div>
    </div>
  </div>`;
  $("#phBody").querySelectorAll("[data-goto]").forEach(el => { const go = () => { location.hash = "proje"; setTimeout(() => openDrawer(el.dataset.goto), 60); }; el.onclick = go; el.onkeydown = e => { if (e.key === "Enter") go(); }; });
}

function disisTile(m) {
  const J = DT.jobs, out = J.filter(diIsOut), late = J.filter(j => diStatus(j).key === "late").length;
  const wait = J.filter(j => diStatus(j).key === "wait").length, today = J.filter(j => !j.iptal && diRefDay(j) === TODAY).length;
  const done = J.filter(j => j.giris && !j.iptal && diRefDay(j) === TODAY).length;
  const pct = today ? Math.round(done / today * 100) : 0;
  return `<a class="tile on" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <svg class="wave" viewBox="0 0 180 120" aria-hidden="true"><path d="M0 70 C40 40 80 100 180 50 L180 120 L0 120Z" fill="#fff"/></svg>
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">${lvl(m.id) === "view" ? "GÖZLEMCİ" : "AKTİF"}</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>
        <div class="meter" title="Bugün tamamlanan ${done}/${today}"><i style="width:${pct}%"></i></div>
        <div class="stats"><span>${out.length} dışarıda</span><span>${wait} bekliyor</span>${late ? `<span class="alert">${late} gecikti</span>` : ""}<span>Bugün ${done}/${today}</span></div>
      </div></a>`;
}
/* ================= DIŞ İŞ TAKİP ================= */
const DI_TYPES = [
  { id: "temin", name: "Üretim Malzeme Temini", c: "#1747c9" },
  { id: "mutfak", name: "Mutfak / Gıda Temini", c: "#14866d" },
  { id: "kirtasiye", name: "Kırtasiye / Ofis Temini", c: "#6b45c9" },
  { id: "tamir", name: "Ekipman Tamir / Bakım", c: "#c24a1e" },
  { id: "kargo", name: "Kargo İşlemleri", c: "#b26b00" },
  { id: "arac", name: "Araç Servis / Bakım İşlemleri", c: "#b0367a" },
  { id: "diger", name: "Diğer", c: "#5b6578" }
];
const diType = id => DI_TYPES.find(t => t.id === (String(id || "").startsWith("kargo") ? "kargo" : id)) || { id, name: id || "—", c: "#5b6578" };
const NOVEH = ["Kendi aracı", "Araçsız (yaya / toplu taşıma)"];
const PAY = ["Nakit", "Kredi kartı", "Cari hesap", "Firma ödedi"];
const VEH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13l2-6h14l2 6v5H3z"/><path d="M3 13h18"/><circle cx="7.5" cy="16" r="1.2"/><circle cx="16.5" cy="16" r="1.2"/></svg>';
const CLIP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7"/></svg>';
const DT = { jobs: [], cfg: { vehicles: [], people: [] }, ready: false, F: { arch: false, date: "open", status: "", person: "", vehicle: "", type: "", q: "" }, SORT: { key: "auto", dir: 1 } };
const IST_OFF = 3 * 3600e3; // Türkiye saati (UTC+3, yaz saati yok)
const istTs = (iso, hm) => { if (!iso || !hm) return null; const [y, m, d] = iso.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - IST_OFF; };
const toLocalInput = ts => ts ? new Date(ts + IST_OFF).toISOString().slice(0, 16) : "";
const fromLocalInput = v => { if (!v) return null; const [a, b] = v.split("T"); return istTs(a, b); };
const fmtDur = ms => { if (ms == null || ms < 0) return "—"; const m = Math.round(ms / 60000); if (m < 60) return m + " dk"; const h = Math.floor(m / 60); return h + " sa " + String(m % 60).padStart(2, "0") + " dk"; };
const tl = (n, dec = 2) => { try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(n || 0); } catch (e) { return (n || 0) + " ₺"; } };
function diPlanTs(j) { if (!j.donusSaat) return null; return istTs(j.cikis ? dayOf(j.cikis) : (j.planTarih || TODAY), j.donusSaat); }
function diStatus(j) {
  if (j.iptal) return { key: "iptal", label: "İptal edildi", cls: "p-muted", rank: 4 };
  if (j.giris) return { key: "done", label: "Tamamlandı", cls: "p-ok", rank: 3 };
  if (j.cikis) {
    const p = diPlanTs(j), late = p ? Date.now() > p : dayOf(j.cikis) < TODAY;
    return late ? { key: "late", label: "Dönüş gecikti", cls: "p-bad", rank: 0 } : { key: "out", label: "Dışarıda", cls: "p-brand", rank: 1 };
  }
  return { key: "wait", label: "Çıkış bekliyor", cls: "p-warn", rank: 2 };
}
const G_DUR = [["bekliyor", "Bekliyor"], ["yapildi", "Yapıldı"], ["yapilamadi", "Yapılamadı"]];
// Bir dış işin görevleri (eski tek-görevli kayıtlar da tek görev olarak okunur)
const diGorev = j => Array.isArray(j.gorevler) && j.gorevler.length ? j.gorevler.map(g => (!g.odeme && j.odeme && g.masraf) ? { ...g, odeme: j.odeme } : g) : [{ tur: j.tur, tanim: j.tanim || "", yer: j.yer || "", masraf: j.masraf ?? null, odeme: j.odeme || null, not: "", durum: j.giris ? "yapildi" : "bekliyor" }];
const gNorm = g => ({ tur: g.tur || "", tanim: g.tanim || "", yer: g.yer || "", masraf: g.masraf ?? null, odeme: g.odeme || null, not: g.not || "", durum: g.durum || "bekliyor" });
const diCost = j => Array.isArray(j.gorevler) && j.gorevler.length ? j.gorevler.reduce((s, g) => s + (Number(g.masraf) || 0), 0) : (Number(j.masraf) || 0);
// Görevi bitirebilir mi: çıkış/giriş yetkisi olan, işi düzenleyebilen ya da işin personeli olan kişi
const diIsMine = j => !!ME && !!j.personel && j.personel === ME.name;
const diCanIO = j => !j.iptal && (can("d.inout") || diIsMine(j));
const diCanFinish = j => !j.iptal && (diCanIO(j) || can("d.edit.all") || (can("d.edit.own") && j.createdByUid === ME.uid));
async function diSetGorev(id, idx, durum, form) {
  const j = DT.jobs.find(x => x.id === id); if (!j) return;
  const G = diGorev(j).map(gNorm);
  // formdan gelen not / masraf / masraf tipi (işin kendisi değişmez)
  if (form) form.forEach((f, i) => { if (G[i]) { G[i].not = (f.not || "").trim(); G[i].masraf = f.masraf ?? null; G[i].odeme = f.odeme || null; } });
  if (idx != null && G[idx]) G[idx].durum = durum;
  const now = Date.now(), short = idx != null && G[idx] ? (G[idx].tanim || "").slice(0, 60) : "";
  const t = durum === "yapildi" ? "bitirildi" : durum === "yapilamadi" ? "yapılamadı olarak işaretlendi" : "yeniden bekliyor durumuna alındı";
  try {
    const msg = idx == null ? "İş notları / masrafları güncellendi" : `${G.length > 1 ? (idx + 1) + ". iş " : "İş "}${t}: ${short}`;
    await updateDoc(doc(fs, "disis", id), { gorevler: G, updatedAt: now, updatedBy: ME.name, log: [...(j.log || []), { at: now, by: ME.name, t: msg }].slice(-50) });
    if (idx == null) { toast("Kaydedildi"); return; }
    const left = G.filter(g => g.durum === "bekliyor").length;
    if (durum === "yapildi") toast(left ? `İş bitirildi. Kalan ${left} iş var.` : (j.cikis && !j.giris ? "Tüm işler bitti. Dönünce Giriş yap'a basın." : "Tüm işler bitti."));
  } catch (e) { toast(writeErr(e)); renderDisis(); }
}
const diRefDay = j => j.cikis ? dayOf(j.cikis) : (j.planTarih || dayOf(j.createdAt || Date.now()));
const diIsOpen = j => !j.iptal && !j.giris;
const diIsOut = j => { const k = diStatus(j).key; return k === "out" || k === "late"; };
const diDur = j => j.cikis ? ((j.giris || Date.now()) - j.cikis) : null;
const sortTr = a => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, "tr"));
const diPeople = () => sortTr([...DT.cfg.people, ...PT.people.filter(p => p.aktif !== false).map(p => p.ad), ...Object.values(state.access || {}).map(m => m && m.name), ...DT.jobs.map(j => j.personel)]);
// Araçlar: { plaka, ad, durum: musait | arizali | serviste, not } · işte araç etiketi "plaka · ad" olarak tutulur
const VDUR = { musait: ["Müsait", "ok"], arizali: ["Arızalı", "bad"], serviste: ["Serviste", "warn"] };
function normVeh(v) {
  if (typeof v === "string") { const [p, ...r] = v.split(" · "); return { plaka: (p || "").trim(), ad: r.join(" · ").trim(), durum: "musait", not: "" }; }
  return { plaka: String(v && v.plaka || "").trim(), ad: String(v && v.ad || "").trim(), durum: VDUR[v && v.durum] ? v.durum : "musait", not: String(v && v.not || "") };
}
const vLabel = v => v.ad ? v.plaka + " · " + v.ad : v.plaka;
const vByLabel = l => DT.cfg.vehicles.find(v => vLabel(v) === l) || null;
const vUsable = l => { const v = vByLabel(l); return !v || v.durum === "musait"; };
const diVehAll = () => sortTr([...DT.cfg.vehicles.map(vLabel), ...DT.jobs.map(j => j.arac)]);

function startDisis() {
  DT.ready = false; let a = false, b = false;
  const done = () => { DT.ready = a && b; diChanged(); };
  dataUnsubs.push(onSnapshot(collection(fs, "disis"), s => { DT.jobs = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(j => !j.mergedInto); a = true; done(); },
    e => { a = true; done(); toast("Dış işler okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(doc(fs, "config", "disis"), s => {
    const d = s.exists() ? s.data() : {};
    DT.cfg = { vehicles: (Array.isArray(d.vehicles) ? d.vehicles : []).map(normVeh).filter(v => v.plaka), people: Array.isArray(d.people) ? d.people : [] };
    b = true; done();
  }, () => { b = true; done(); }));
}
function diChanged() { if ($("#app").hidden) return; notifSoon(); renderHome(); if (ROUTE === "disis") renderDisis(); }

/* --- filtre ve sıralama --- */
function diFiltered() {
  const F = DT.F, q = F.q.trim().toLocaleLowerCase("tr"), wk = weekRange(), n = dnum(TODAY);
  return DT.jobs.filter(j => {
    const st = diStatus(j), day = diRefDay(j), dd = dnum(day);
    // Aktif liste yalnızca açık işleri, arşiv yalnızca tamamlanan / iptal edilenleri gösterir
    if (F.arch ? diIsOpen(j) : !diIsOpen(j)) return false;
    if (F.arch && (j.giris || j.updatedAt)) { const ad = dayOf(j.giris || j.updatedAt), an = dnum(ad);
      if (F.date === "today" && ad !== TODAY) return false;
      if (F.date === "yesterday" && an !== n - 1) return false;
      if (F.date === "week" && !(an >= wk[0] && an <= wk[1])) return false;
      if (F.date === "month" && ad.slice(0, 7) !== TODAY.slice(0, 7)) return false;
      if (F.date === "lastmonth") { const [yy, mm] = TODAY.split("-").map(Number), pm = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`; if (ad.slice(0, 7) !== pm) return false; }
    } else if (!F.arch) {
    if (F.date === "today" && day !== TODAY) return false;
    if (F.date === "yesterday" && dd !== n - 1) return false;
    if (F.date === "week" && !(dd >= wk[0] && dd <= wk[1])) return false;
    if (F.date === "month" && day.slice(0, 7) !== TODAY.slice(0, 7)) return false;
    }
    if (F.status === "open" && !diIsOpen(j)) return false;
    if (F.status === "out" && !diIsOut(j)) return false;
    if (F.status && F.status !== "open" && F.status !== "out" && st.key !== F.status) return false;
    if (F.person && j.personel !== F.person) return false;
    if (F.vehicle && j.arac !== F.vehicle) return false;
    if (F.type && !diGorev(j).some(g => diType(g.tur).id === F.type)) return false;
    if (q && ![j.personel, j.arac, j.not, "#" + j.no, ...diGorev(j).flatMap(g => [g.tanim, g.yer, diType(g.tur).name])].join(" ").toLocaleLowerCase("tr").includes(q)) return false;
    return true;
  }).sort(diCmp);
}
const DI_COLS = [["no", "No"], ["personel", "Personel / araç"], ["tur", "İşin türü ve tanımı"], ["cikis", "Çıkış"], ["giris", "Giriş"], ["sure", "Süre"], ["durum", "Durum"], ["", ""]];
function diSortVal(j, k) {
  switch (k) {
    case "no": return Number(j.no) || 0;
    case "personel": return (j.personel || "").toLocaleLowerCase("tr");
    case "tur": return diType(diGorev(j)[0].tur).name.toLocaleLowerCase("tr");
    case "cikis": return j.cikis || null;
    case "giris": return j.giris || null;
    case "sure": return diDur(j);
    case "durum": return diStatus(j).rank;
  }
}
function diCmp(a, b) {
  const k = DT.SORT.key;
  if (k === "auto" && DT.F.arch) return (b.giris || b.updatedAt || 0) - (a.giris || a.updatedAt || 0);
  if (k === "auto") {
    const sa = diStatus(a), sb = diStatus(b);
    if (sa.rank !== sb.rank) return sa.rank - sb.rank;
    if (sa.key === "wait") { const pa = a.oncelik === "acil" ? 0 : 1, pb = b.oncelik === "acil" ? 0 : 1; return pa - pb || (a.planTarih || "").localeCompare(b.planTarih || "") || (a.no || 0) - (b.no || 0); }
    if (sa.key === "out" || sa.key === "late") return (a.cikis || 0) - (b.cikis || 0);
    return (b.giris || b.updatedAt || 0) - (a.giris || a.updatedAt || 0);
  }
  const va = diSortVal(a, k), vb = diSortVal(b, k), na = va == null || va === "", nb = vb == null || vb === "";
  if (na && !nb) return 1; if (nb && !na) return -1;
  if (!na && !nb && va !== vb) { const r = typeof va === "string" ? va.localeCompare(vb, "tr") : va - vb; if (r) return r * DT.SORT.dir; }
  return (b.no || 0) - (a.no || 0);
}

/* --- ekran --- */
function fillSel(sel, first, items, cur) {
  const el = $(sel); el.innerHTML = `<option value="">${first}</option>` + items.map(([v, l]) => opt(v, l, cur)).join("");
  el.value = items.some(([v]) => v === cur) ? cur : ""; el.classList.toggle("on", !!el.value);
}
function renderDisis() {
  if (!ME || $("#modDisis").hidden) return;
  const J = DT.jobs, now = Date.now();
  const out = J.filter(diIsOut), late = J.filter(j => diStatus(j).key === "late"), wait = J.filter(j => diStatus(j).key === "wait");
  const doneToday = J.filter(j => j.giris && !j.iptal && dayOf(j.giris) === TODAY);
  const costToday = J.filter(j => !j.iptal && diRefDay(j) === TODAY).reduce((s, j) => s + diCost(j), 0);
  $("#diKpis").innerHTML = [
    ["Şu an dışarıda", out.length, out.length ? out.map(j => j.personel).slice(0, 3).join(", ") + (out.length > 3 ? "…" : "") : "Kimse dışarıda değil", ""],
    ["Dönüşü geciken", late.length, "Tahmini dönüş saati geçti", late.length ? "bad" : ""],
    ["Çıkış bekleyen", wait.length, wait.filter(j => j.oncelik === "acil").length + " acil iş", ""],
    ["Bugün tamamlanan", doneToday.length, "Dönüşü yapılan iş", doneToday.length ? "ok" : ""],
    ["Bugünkü masraf", tl(costToday, 0), "Bugünkü dış işlerde", ""]
  ].map(([k, v, s, c]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${c}">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join("");

  const vehs = DT.cfg.vehicles;
  $("#diVehicles").innerHTML = vehs.length ? vehs.map(vo => {
    const v = vLabel(vo), j = out.find(x => x.arac === v), st = j && diStatus(j), vd = VDUR[vo.durum];
    const cls = j ? (st.key === "late" ? "late" : "out") : vo.durum !== "musait" ? "v-" + vo.durum : "";
    const sub = j ? esc(j.personel) + " · " + fmtDur(now - j.cikis) + (st.key === "late" ? " · gecikti" : "") : esc(vd[0]) + (vo.not ? " · " + esc(vo.not) : "");
    const act = j ? ` data-dj="${esc(j.id)}" role="button" tabindex="0" title="#${esc(j.no)} işini aç"` : can("d.cfg") ? ` data-vcfg="1" role="button" tabindex="0" title="Araç durumunu değiştir"` : "";
    return `<div class="veh ${cls}"${act}><span class="vi">${VEH_SVG}</span><span style="min-width:0"><span class="vn">${esc(v)}</span><span class="vs">${sub}</span></span></div>`;
  }).join("") : (can("d.cfg") ? `<div class="veh empty">Araç listesi boş. Araç durumunu görmek için <button class="linkbtn" id="diCfg2" type="button">araçları ekleyin</button>.</div>` : "");
  const c2 = $("#diCfg2"); if (c2) c2.onclick = openDiCfg;
  document.querySelectorAll("#diVehicles [data-vcfg]").forEach(el => { el.onclick = openDiCfg; el.onkeydown = e => { if (e.key === "Enter") openDiCfg(); }; });

  const F = DT.F;
  fillSel("#diPerson", "Tüm personel", diPeople().map(p => [p, p]), F.person);
  fillSel("#diVehicle", "Tüm araçlar", diVehAll().map(p => [p, p]), F.vehicle);
  fillSel("#diType", "Tüm iş türleri", DI_TYPES.map(t => [t.id, t.name]), F.type);
  // aktif liste / arşiv için tarih ve durum seçenekleri
  const dOpts = F.arch ? [["all", "Tüm tarihler"], ["today", "Bugün tamamlanan"], ["yesterday", "Dün"], ["week", "Bu hafta"], ["month", "Bu ay"], ["lastmonth", "Geçen ay"]]
    : [["open", "Tüm açık işler"], ["today", "Bugün planlanan"], ["yesterday", "Dün planlanan"], ["week", "Bu hafta"]];
  const sOpts = F.arch ? [["", "Tümü"], ["done", "Tamamlandı"], ["iptal", "İptal edildi"]]
    : [["", "Tüm durumlar"], ["wait", "Çıkış bekliyor"], ["out", "Dışarıda"], ["late", "Dönüşü geciken"]];
  if (!dOpts.some(o => o[0] === F.date)) F.date = dOpts[0][0];
  if (!sOpts.some(o => o[0] === F.status)) F.status = "";
  $("#diDate").innerHTML = dOpts.map(([v2, l]) => opt(v2, l, F.date)).join(""); $("#diDate").value = F.date;
  $("#diStatus").innerHTML = sOpts.map(([v2, l]) => opt(v2, l, F.status)).join(""); $("#diStatus").value = F.status;
  $("#diDate").classList.toggle("on", F.date !== dOpts[0][0]); $("#diStatus").classList.toggle("on", !!F.status);
  const nArch = J.filter(j => !diIsOpen(j)).length, nOpen = J.length - nArch;
  const ab = $("#diArch"); ab.innerHTML = F.arch ? "‹ Aktif işlere dön" : `Tamamlanan işler <span class="acount num">${nArch}</span>`; ab.classList.toggle("on", F.arch);
  $("#diArchBar").hidden = !F.arch;
  $("#diAdd").hidden = !can("d.create"); $("#diCfgBtn").hidden = !can("d.cfg"); $("#diRepBtn").hidden = !can("d.report");

  const v = $("#diView");
  if (!DT.ready) { v.innerHTML = '<div class="empty"><h3>Dış işler yükleniyor</h3><p>Veritabanına bağlanılıyor.</p></div>'; $("#diInfo").textContent = ""; return; }
  if (!J.length) {
    $("#diInfo").textContent = "";
    v.innerHTML = `<div class="empty"><h3>Henüz dış iş yok</h3><p>Dışarı çıkan personelin işini buradan atayın: kim, hangi araçla, ne için çıkıyor. Çıkış ve dönüş saatini tek dokunuşla kaydedin.</p>${can("d.create") ? '<button class="btn" id="diEmptyAdd" type="button">+ İlk dış işi oluştur</button>' : ""}</div>`;
    const b = $("#diEmptyAdd"); if (b) b.onclick = () => openDisis(null); return;
  }
  const rows = diFiltered();
  $("#diInfo").textContent = rows.length + " / " + (F.arch ? nArch : nOpen) + (F.arch ? " arşiv kaydı" : " açık iş");
  const head = `<div class="lhead" role="row">` + DI_COLS.map(([k, l]) => {
    if (!k) return "<div></div>";
    const on = DT.SORT.key === k;
    return `<div role="columnheader" aria-sort="${on ? (DT.SORT.dir > 0 ? "ascending" : "descending") : "none"}"><button class="sort" data-dsort="${k}" ${on ? "data-on" : ""} title="Sırala">${l}<span class="ar">${on ? (DT.SORT.dir > 0 ? "▲" : "▼") : "↕"}</span></button></div>`;
  }).join("") + `</div>`;
  const emptyTxt = F.arch ? "Bu filtrelere uyan tamamlanmış iş yok." : (nOpen ? "Bu filtrelere uyan açık iş yok." : "Şu an açık dış iş yok. Tamamlanan işler <b>Tamamlanan işler</b> arşivinde.");
  v.innerHTML = `<div class="ledger dled${F.arch ? " arch" : ""}" role="table">${head}${rows.length ? rows.map(diRow).join("") : `<div class="row" style="display:block;cursor:default;color:var(--ink-2)">${emptyTxt}</div>`}</div>
    <p class="note" style="margin:-18px 0 28px">${F.arch ? "Arşiv en son tamamlanandan geriye doğru sıralanır." : "Varsayılan sıralama: dönüşü gecikenler, dışarıdakiler, çıkış bekleyenler (acil önce)."} Sütun başlığına tıklayınca sıralama değişir.</p>`;
  v.querySelectorAll("[data-dsort]").forEach(b => b.onclick = () => {
    const k = b.dataset.dsort;
    DT.SORT = DT.SORT.key !== k ? { key: k, dir: 1 } : DT.SORT.dir === 1 ? { key: k, dir: -1 } : { key: "auto", dir: 1 };
    renderDisis();
  });
  document.querySelectorAll("#modDisis [data-dj]").forEach(el => {
    el.onclick = () => openDisis(el.dataset.dj);
    el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDisis(el.dataset.dj); } };
  });
  v.querySelectorAll("[data-act]").forEach(b => b.onclick = e => { e.stopPropagation(); b.disabled = true; diQuick(b.dataset.id, b.dataset.act); });
  v.querySelectorAll("[data-gfin]").forEach(b => b.onclick = e => { e.stopPropagation(); b.disabled = true; b.textContent = "…"; diSetGorev(b.dataset.gfin, Number(b.dataset.gi), "yapildi"); });
}
function diRow(j) {
  const st = diStatus(j), G = diGorev(j), files = (j.files || []).length;
  const stripe = st.key === "late" ? "var(--bad)" : st.key === "out" ? "var(--brand)" : st.key === "wait" && j.oncelik === "acil" ? "var(--warn)" : st.key === "done" ? "var(--ok)" : "transparent";
  let act = "";
  if (diCanIO(j)) {
    if (!j.cikis) act = `<button class="rbtn go" type="button" data-act="out" data-id="${esc(j.id)}">Çıkış yap</button>`;
    else if (!j.giris) act = `<button class="rbtn back" type="button" data-act="in" data-id="${esc(j.id)}">Giriş yap</button>`;
  }
  const outCell = j.cikis
    ? `<span class="date">${hhmm(j.cikis)}</span>${dayOf(j.cikis) !== TODAY ? `<div class="when">${fmtS(dayOf(j.cikis))}</div>` : ""}`
    : `<span class="date none">—</span>${j.planTarih && j.planTarih !== TODAY ? `<div class="when">Plan ${fmtS(j.planTarih)}</div>` : ""}`;
  const inCell = j.giris ? `<span class="date">${hhmm(j.giris)}</span>${dayOf(j.giris) !== dayOf(j.cikis || j.giris) ? `<div class="when">${fmtS(dayOf(j.giris))}</div>` : ""}`
    : (j.donusSaat && !j.iptal ? `<span class="date none">—</span><div class="when">Tahmini ${esc(j.donusSaat)}</div>` : '<span class="date none">—</span>');
  return `<div class="row" role="row" tabindex="0" data-dj="${esc(j.id)}" style="--stripe:${stripe}">
    <div class="no">#${esc(j.no)}</div>
    <div class="dp"><div class="people">${j.personel ? avatar(j.personel) : '<span class="date none">Atanmadı</span>'}</div><div class="vh${j.arac ? "" : " noveh"}">${VEH_SVG}<span>${esc(j.arac || "Araç seçilmedi")}</span></div></div>
    <div class="dt">${G.length > 1 || j.oncelik === "acil" || files ? `<div class="dtop">${G.length > 1 ? `<span class="gcount">${G.length} iş</span>` : ""}${j.oncelik === "acil" ? '<span class="ttag" style="--tc:#c62f3a">ACİL</span>' : ""}${files ? `<span class="clip" title="${files} ek">${CLIP_SVG}${files}</span>` : ""}</div>` : ""}
      <ol class="glist${G.length > 1 ? " multi" : ""}">${G.map((g, gi) => { const t = diType(g.tur); const fin = diCanFinish(j) && (g.durum || "bekliyor") === "bekliyor"; return `<li class="g-${esc(g.durum || "bekliyor")}${fin ? " hasfin" : ""}">${fin ? `<button class="gfin" type="button" data-gfin="${esc(j.id)}" data-gi="${gi}" title="Bu işi bitir">✓ Bitir</button>` : ""}<span class="ttag" style="--tc:${t.c}">${esc(t.name)}</span>${g.durum === "yapildi" ? '<span class="gst ok" title="Yapıldı">✓</span>' : g.durum === "yapilamadi" ? '<span class="gst no" title="Yapılamadı">✕ yapılamadı</span>' : ""}<div class="ttl">${esc(g.tanim)}</div>${g.yer || g.masraf ? `<div class="desc">${[g.yer ? esc(g.yer) : "", g.masraf ? `<span class="gcost">${tl(g.masraf)}${g.odeme ? " · " + esc(g.odeme) : ""}</span>` : ""].filter(Boolean).join(" · ")}</div>` : ""}${g.not ? `<div class="gnote">${esc(g.not)}</div>` : ""}</li>`; }).join("")}</ol></div>
    <div><span class="lbl">Çıkış</span>${outCell}</div>
    <div><span class="lbl">Giriş</span>${inCell}</div>
    <div><span class="lbl">Süre</span><span class="date">${j.cikis && !j.iptal ? fmtDur(diDur(j)) : "—"}</span></div>
    <div class="dst"><span class="lbl">Durum</span><span class="pill ${st.cls}">${st.label}</span></div>
    <div class="dact">${act}</div>
  </div>`;
}
const MERGE_MS = 60000;
// Çıkışta araç seçtirme penceresi
function pickVehicle(j) {
  return new Promise(res => {
    const opts = DT.cfg.vehicles.map(v => ({ l: vLabel(v), d: v.durum, busy: DT.jobs.some(x => x.id !== j.id && x.arac === vLabel(v) && diIsOut(x)) }));
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="pvT" style="width:min(420px,100%)">
      <div class="dh"><h2 id="pvT">#${esc(j.no)} · Araç seçin</h2><button class="x" id="pvX" aria-label="Kapat">×</button></div>
      <div class="db"><p class="note" style="margin:0">Çıkış için aracı seçin. Aynı araçla 1 dakika içinde çıkışı yapılan işler tek çıkışta birleşir.</p>
        <div class="vpick">${opts.map(o => `<button type="button" class="vp v-${o.d}" data-v="${esc(o.l)}"${o.d !== "musait" ? " disabled" : ""}><span class="vi">${VEH_SVG}</span><span><b>${esc(o.l)}</b><small>${o.d !== "musait" ? VDUR[o.d][0] : o.busy ? "Dışarıda (başka işte)" : "Müsait"}</small></span></button>`).join("")}
        ${NOVEH.map(l => `<button type="button" class="vp" data-v="${esc(l)}"><span class="vi">${VEH_SVG}</span><span><b>${esc(l)}</b></span></button>`).join("")}</div></div>
    </aside>`;
    let done = false; const fin = v => { if (done) return; done = true; onDrawerClose = null; closeDrawer(); res(v); };
    onDrawerClose = () => { if (!done) { done = true; res(null); } };
    $("#scrim").onclick = () => fin(null); $("#pvX").onclick = () => fin(null);
    document.querySelectorAll(".vpick [data-v]").forEach(b => b.onclick = () => fin(b.dataset.v));
  });
}
// Aynı araçla (şirket aracı değilse aynı personelle) son 1 dakikada çıkış yapılmış açık işi bul
const mergeTarget = (j, arac, now) => DT.jobs.find(x => x.id !== j.id && !x.iptal && !x.giris && x.cikis && now - x.cikis <= MERGE_MS && x.arac === arac && (!NOVEH.includes(arac) || x.personel === j.personel));
async function diQuick(id, act) {
  let j = DT.jobs.find(x => x.id === id); if (!j) return;
  const now = Date.now();
  if (act === "out") {
    let arac = j.arac;
    if (!arac) { arac = await pickVehicle(j); if (!arac) { renderDisis(); return; } }
    if (!vUsable(arac)) { toast(arac + " şu an " + VDUR[vByLabel(arac).durum][0].toLowerCase() + ". Başka bir araç seçin."); renderDisis(); return; }
    const t = mergeTarget(j, arac, Date.now());
    if (t) { await diMerge(t, j); return; }
    if (arac !== j.arac) j = { ...j, arac };
    const busy = DT.jobs.find(x => x.id !== j.id && x.arac === arac && diIsOut(x) && !NOVEH.includes(arac));
    if (busy) toast(`Not: ${arac} şu an #${busy.no} (${busy.personel}) ile dışarıda görünüyor.`);
  }
  const patch = act === "out" ? { cikis: now, cikisBy: ME.name, arac: j.arac } : { giris: now, girisBy: ME.name };
  Object.assign(patch, { updatedAt: now, updatedBy: ME.name, log: [...(j.log || []), { at: now, by: ME.name, t: act === "out" ? "Çıkış yapıldı" : "Giriş yapıldı" }].slice(-50) });
  try {
    await updateDoc(doc(fs, "disis", id), patch);
    toast(act === "out" ? `#${j.no} · ${j.personel} çıkış yaptı (${hhmm(now)})` : `#${j.no} · ${j.personel} döndü (${hhmm(now)}). Masraf ve not için işi açın.`);
  } catch (e) { toast(writeErr(e)); renderDisis(); }
}

// İki çıkışı birleştir: kaynak işin görevleri ve ekleri hedef işe taşınır, kaynak listeden gizlenir
async function diMerge(t, j) {
  const now = Date.now();
  const G = [...diGorev(t).map(gNorm), ...diGorev(j).map(gNorm)];
  const files = [...(t.files || []), ...(j.files || [])].slice(0, 20);
  const others = j.personel && j.personel !== t.personel ? ` (${j.personel} da birlikte)` : "";
  const patch = { gorevler: G, files, tur: G[0].tur, tanim: G.map(g => g.tanim).join(" · ").slice(0, 2000), yer: G.map(g => g.yer).filter(Boolean).join(" · ").slice(0, 400),
    masraf: G.some(g => g.masraf != null) ? G.reduce((s2, g) => s2 + (Number(g.masraf) || 0), 0) : null, oncelik: t.oncelik === "acil" || j.oncelik === "acil" ? "acil" : (t.oncelik || "normal"),
    mergedFrom: [...(t.mergedFrom || []), j.id], updatedAt: now, updatedBy: ME.name,
    log: [...(t.log || []), { at: now, by: ME.name, t: `#${j.no} bu çıkışla birleştirildi${others}` }].slice(-50) };
  try {
    await updateDoc(doc(fs, "disis", t.id), patch);
    await updateDoc(doc(fs, "disis", j.id), { mergedInto: t.id, updatedAt: now, updatedBy: ME.name, log: [...(j.log || []), { at: now, by: ME.name, t: `#${t.no} ile birleştirildi` }].slice(-50) });
    toast(`#${j.no}, #${t.no} ile birleştirildi: ${t.arac} · ${G.length} iş tek çıkışta.`);
  } catch (e) { toast(writeErr(e)); renderDisis(); }
}

/* --- iş formu --- */
let DCUR = null;
function openDisis(id) {
  const j = id ? DT.jobs.find(x => x.id === id) : null; if (id && !j) return;
  const ed = j ? (can("d.edit.all") || (can("d.edit.own") && j.createdByUid === ME.uid)) : can("d.create"), dis = ed ? "" : " disabled";
  const io = j && !ed && diCanIO(j) && !j.giris ? (j.cikis ? "in" : "out") : "";
  const nextNo = Math.max(0, ...DT.jobs.map(x => Number(x.no) || 0)) + 1;
  DCUR = { ed: false, job: j, id: id || doc(collection(fs, "disis")).id, isNew: !id, files: j ? (j.files || []).slice() : [], added: [], removed: [], saved: false, busy: false };
  const st = j && diStatus(j);
  const vehs = DT.cfg.vehicles.map(v => ({ l: vLabel(v), d: v.durum })); if (j && j.arac && !vehs.some(v => v.l === j.arac) && !NOVEH.includes(j.arac)) vehs.push({ l: j.arac, d: "musait" });
  DCUR.ed = ed;
  const tnow = (fid) => ed ? `<button type="button" class="btn ghost" data-now="${fid}">Şimdi</button>` : "";
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">
    <div class="dh"><h2 id="dTitle">${j ? "Dış iş #" + esc(j.no) : "Yeni dış iş"}</h2><button class="x" id="dClose" aria-label="Kapat">×</button></div>
    <div class="db">
      ${j ? `<div class="factbox"><div><div class="k">Durum</div><div class="v"><span class="pill ${st.cls}">${st.label}</span></div></div><div><div class="k">Süre</div><div class="v">${j.cikis && !j.iptal ? fmtDur(diDur(j)) : "—"}</div></div><div><div class="k">Atayan</div><div class="v" style="font-size:13px;font-family:var(--body)">${esc(j.createdBy || "—")}</div></div></div>` : ""}
      <div class="fgrid">
        <div class="field"><label for="dPer">Personel</label><input id="dPer" list="dPerList" autocomplete="off" placeholder="Kim çıkıyor?"${dis}><datalist id="dPerList">${diPeople().map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
        <div class="field"><label for="dVeh">Çıktığı araç</label><select id="dVeh"${dis}><option value="">Sonra seçilecek</option>${vehs.map(v => `<option value="${esc(v.l)}"${v.d !== "musait" && !(j && j.arac === v.l) ? " disabled" : ""}>${esc(v.l)}${v.d !== "musait" ? " — " + VDUR[v.d][0] : ""}</option>`).join("")}<optgroup label="Şirket aracı değil">${NOVEH.map(v => `<option>${esc(v)}</option>`).join("")}</optgroup></select></div>
        <div class="field"><label for="dPri">Öncelik</label><select id="dPri"${dis}><option value="normal">Normal</option><option value="acil">Acil</option></select></div>
        <div class="field"><label for="dPlan">Plan tarihi</label><input id="dPlan" type="date"${dis}></div>
        <div class="field"><label for="dRet">Tahmini dönüş saati</label><input id="dRet" type="time"${dis}></div>
        <div class="fsec gsec"><span>Yapılacak işler</span><span class="gtot" id="gTot"></span></div>
        <div class="field full"><div class="glistf" id="gList"></div>${ed ? '<button type="button" class="btn ghost gadd" id="gAdd">+ İş ekle</button>' : ""}</div>
        <div class="fsec">Çıkış ve dönüş</div>
        <div class="field"><label for="dOut">Çıkış saati</label><div class="tnow"><input id="dOut" type="datetime-local"${dis}>${tnow("dOut")}</div></div>
        <div class="field"><label for="dIn">İş sonu giriş saati</label><div class="tnow"><input id="dIn" type="datetime-local"${dis}>${tnow("dIn")}</div></div>
        <div class="field"><label for="dKm1">Araç km (çıkış)</label><input id="dKm1" type="number" min="0" step="1" inputmode="numeric"${dis}></div>
        <div class="field"><label for="dKm2">Araç km (dönüş)</label><input id="dKm2" type="number" min="0" step="1" inputmode="numeric"${dis}></div>
        <div class="field full"><label class="chk" for="dRcpt"><input id="dRcpt" type="checkbox"${dis}> Fiş / fatura alındı</label></div>
        <div class="field full"><label for="dNot">Dönüş notu / sonuç</label><textarea id="dNot" rows="2" maxlength="2000" placeholder="Örn. Toner yoktu, yarın gelecek. Fatura muhasebeye verildi."${dis}></textarea></div>
        <div class="fsec">Resim ve doküman</div>
        <div class="field full"><div class="att" id="dAtt"></div><input id="dFile" type="file" accept="image/*,application/pdf" multiple hidden>
          <p class="note" style="margin:6px 0 0">Alınacak ürünün fotoğrafı, liste, irsaliye veya fiş ekleyebilirsiniz. Telefonda kamera açılır. Fotoğraflar küçültülerek kaydedilir; PDF en fazla 600 KB, iş başına en fazla 10 dosya.</p></div>
      </div>
      ${j && (j.log || []).length ? `<section><h3 class="sec-t">Hareketler <small>${j.log.length} kayıt</small></h3><ul class="log">${j.log.slice().reverse().map(l => `<li><div class="meta"><span class="num">${fmtS(dayOf(l.at))} ${hhmm(l.at)}</span><b>${esc(l.by)}</b></div><p>${esc(l.t)}</p></li>`).join("")}</ul></section>` : ""}
    </div>
    <div class="df"><div class="r">${j && can("d.cancel") && !j.iptal && !j.giris ? '<button class="btn ghost" id="dCancelJob" type="button">İşi iptal et</button>' : ""}${j && can("d.delete") ? '<button class="btn danger" id="dDel" type="button">Sil</button>' : ""}</div>
      <div class="r"><button class="btn ghost" id="dCancel" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="dSave" type="button">Kaydet</button>' : (j && diCanFinish(j) ? '<button class="btn" id="dGSave" type="button">Notları kaydet</button>' : "")}${io ? `<button class="rbtn ${io === "out" ? "go" : "back"}" id="dIO" type="button">${io === "out" ? "Çıkış yap" : "Giriş yap"}</button>` : ""}</div></div>
  </aside>`;
  // değerler
  const set = (sel, v) => { const el = $(sel); if (el) el.value = v ?? ""; };
  set("#dPer", j ? j.personel : ""); set("#dVeh", j ? j.arac : ""); set("#dPri", j ? j.oncelik || "normal" : "normal");
  set("#dPlan", j ? j.planTarih || diRefDay(j) : TODAY); set("#dRet", j ? j.donusSaat : "");
  set("#dOut", j ? toLocalInput(j.cikis) : ""); set("#dIn", j ? toLocalInput(j.giris) : ""); set("#dKm1", j ? j.kmCikis : ""); set("#dKm2", j ? j.kmDonus : "");
  DCUR.gorev = j ? diGorev(j).map(gNorm) : [gNorm({})];
  renderGorev();
  set("#dNot", j ? j.not : ""); $("#dRcpt").checked = !!(j && j.fis);
  renderAtt();
  onDrawerClose = () => { if (DCUR && !DCUR.saved) DCUR.added.forEach(fid => deleteDoc(doc(fs, "disis_files", fid)).catch(() => {})); DCUR = null; };
  $("#scrim").onclick = closeDrawer; $("#dClose").onclick = closeDrawer; $("#dCancel").onclick = closeDrawer;
  document.querySelectorAll("[data-now]").forEach(b => b.onclick = () => { $("#" + b.dataset.now).value = toLocalInput(Date.now()); });
  $("#dFile").onchange = async () => { const fl = [...$("#dFile").files]; $("#dFile").value = ""; await diAddFiles(fl); };
  const gs = $("#dGSave"); if (gs) gs.onclick = async () => {
    gCollect(); if (DCUR.gorev.some(g => g.masraf != null && g.masraf < 0)) { toast("Masraf eksi olamaz"); return; }
    gs.disabled = true; await diSetGorev(j.id, null, null, DCUR.gorev); closeDrawer();
  };
  const iob = $("#dIO"); if (iob) iob.onclick = async () => { iob.disabled = true; await diQuick(j.id, io); closeDrawer(); };
  const two = (btn, label, fn) => { let armed = false; btn.onclick = async () => { if (!armed) { armed = true; btn.textContent = label; setTimeout(() => { armed = false; btn.textContent = btn.dataset.l; }, 4000); return; } btn.disabled = true; try { await fn(); } catch (e) { btn.disabled = false; toast(writeErr(e)); } }; btn.dataset.l = btn.textContent; };
  const cj = $("#dCancelJob"); if (cj) two(cj, "İptali onayla", async () => {
    const now = Date.now();
    await updateDoc(doc(fs, "disis", j.id), { iptal: true, updatedAt: now, updatedBy: ME.name, log: [...(j.log || []), { at: now, by: ME.name, t: "İş iptal edildi" }].slice(-50) });
    toast("#" + j.no + " iptal edildi"); closeDrawer();
  });
  const dl = $("#dDel"); if (dl) two(dl, "Silmeyi onayla", async () => {
    const b = writeBatch(fs); b.delete(doc(fs, "disis", j.id)); (j.files || []).forEach(f => b.delete(doc(fs, "disis_files", f.id))); DCUR.added.forEach(fid => b.delete(doc(fs, "disis_files", fid)));
    await b.commit(); DCUR.saved = true; toast("#" + j.no + " silindi"); closeDrawer();
  });
  if (!ed) return;
  $("#dSave").onclick = async () => {
    const btn = $("#dSave");
    if (DCUR.busy) { toast("Dosya yükleniyor, birkaç saniye bekleyin"); return; }
    gCollect();
    const per = $("#dPer").value.trim(), veh = $("#dVeh").value;
    const gor = DCUR.gorev.filter(g => g.tur || g.tanim.trim() || g.yer.trim() || g.masraf != null || (g.not || "").trim()).map(g => ({ ...gNorm(g), tanim: g.tanim.trim(), yer: g.yer.trim(), not: (g.not || "").trim() }));
    const miss = []; if (!per) miss.push("personel"); if (!gor.length) miss.push("en az bir iş");
    if (fromLocalInput($("#dOut").value) && !veh) miss.push("çıkış için araç");
    gor.forEach((g, i) => { if (!g.tur) miss.push((i + 1) + ". işin türü"); if (!g.tanim) miss.push((i + 1) + ". işin tanımı"); if (g.masraf != null && g.masraf < 0) miss.push((i + 1) + ". iş masrafı eksi olamaz"); });
    if (miss.length) { toast("Eksik: " + miss.join(", ")); return; }
    const out = fromLocalInput($("#dOut").value), inn = fromLocalInput($("#dIn").value);
    if (inn && !out) { toast("Giriş saati için önce çıkış saatini girin"); return; }
    if (inn && out && inn < out) { toast("Giriş saati çıkış saatinden önce olamaz"); return; }
    const num = sel => { const v = $(sel).value; return v === "" ? null : Number(v); };
    const km1 = num("#dKm1"), km2 = num("#dKm2"), cost = gor.reduce((s, g) => s + (Number(g.masraf) || 0), 0);
    if (km1 != null && km2 != null && km2 < km1) { toast("Dönüş km, çıkış km'den küçük olamaz"); return; }
    const now = Date.now();
    const body = { personel: per, arac: veh, gorevler: gor, tur: gor[0].tur, tanim: gor.map(g => g.tanim).join(" · ").slice(0, 2000), yer: gor.map(g => g.yer).filter(Boolean).join(" · ").slice(0, 400), oncelik: $("#dPri").value, planTarih: $("#dPlan").value || TODAY,
      donusSaat: $("#dRet").value || null, cikis: out, giris: inn, kmCikis: km1, kmDonus: km2, masraf: gor.some(g => g.masraf != null) ? cost : null,
      fis: $("#dRcpt").checked, not: $("#dNot").value.trim(), files: DCUR.files, updatedAt: now, updatedBy: ME.name };
    const log = j ? (j.log || []).slice() : [];
    if (!j) { Object.assign(body, { no: nextNo, createdAt: now, createdBy: ME.name, createdByUid: ME.uid, iptal: false }); log.push({ at: now, by: ME.name, t: "İş oluşturuldu" }); }
    const newOut = out && (!j || !j.cikis), newIn = inn && (!j || !j.giris);
    if (newOut) { body.cikisBy = ME.name; log.push({ at: now, by: ME.name, t: "Çıkış yapıldı (" + hhmm(out) + ")" }); }
    if (newIn) { body.girisBy = ME.name; log.push({ at: now, by: ME.name, t: "Giriş yapıldı (" + hhmm(inn) + ")" }); }
    if (j && !newOut && !newIn) log.push({ at: now, by: ME.name, t: "Bilgiler güncellendi" });
    body.log = log.slice(-50);
    btn.disabled = true;
    try {
      if (j) await updateDoc(doc(fs, "disis", j.id), body); else await setDoc(doc(fs, "disis", DCUR.id), body);
      DCUR.saved = true;
      DCUR.removed.forEach(fid => deleteDoc(doc(fs, "disis_files", fid)).catch(() => {}));
      toast(j ? "#" + j.no + " güncellendi" : "#" + nextNo + " oluşturuldu"); closeDrawer();
    } catch (e) { btn.disabled = false; toast(writeErr(e)); }
  };
}

/* --- görev listesi (bir çıkışta birden fazla iş) --- */
function gCollect() {
  if (!DCUR || !DCUR.gorev) return;
  DCUR.gorev.forEach((g, i) => {
    const v = id => { const el = $("#" + id + i); return el ? el.value : null; };
    if (v("gT") != null) g.tur = v("gT"); if (v("gD") != null) g.tanim = v("gD"); if (v("gY") != null) g.yer = v("gY");
    const m = v("gM"); if (m != null) g.masraf = m === "" ? null : Number(m);
    if (v("gS") != null) g.durum = v("gS");
    if (v("gO") != null) g.odeme = v("gO") || null; if (v("gN") != null) g.not = v("gN");
  });
}
function gTotal() {
  const el = $("#gTot"); if (!el || !DCUR) return;
  const n = DCUR.gorev.length, c = DCUR.gorev.reduce((s, g) => s + (Number(g.masraf) || 0), 0);
  el.textContent = n + " iş" + (c ? " · " + tl(c) : "");
}
function renderGorev() {
  const box = $("#gList"); if (!box || !DCUR) return;
  const ed = DCUR.ed, dis = ed ? "" : " disabled", many = DCUR.gorev.length > 1;
  const fin = !ed && DCUR.job && diCanFinish(DCUR.job), dis2 = ed || fin ? "" : " disabled";
  box.innerHTML = DCUR.gorev.map((g, i) => `<div class="gcard">
    <div class="gh"><b>${i + 1}. iş</b>${ed && many ? `<button type="button" class="gx" data-gx="${i}" aria-label="${i + 1}. işi kaldır">Kaldır</button>` : ""}${!ed && DCUR.job && diCanFinish(DCUR.job) ? `<span class="gq">${(g.durum || "bekliyor") === "bekliyor" ? `<button type="button" class="gfin" data-gq="yapildi" data-i="${i}">✓ Bitir</button><button type="button" class="gno" data-gq="yapilamadi" data-i="${i}">Yapılamadı</button>` : `<button type="button" class="gno" data-gq="bekliyor" data-i="${i}">Geri al</button>`}</span>` : ""}</div>
    <div class="fgrid">
      <div class="field"><label for="gT${i}">İşin türü</label><select id="gT${i}"${dis}><option value="">Seçin…</option>${DI_TYPES.map(t => opt(t.id, t.name, diType(g.tur).id === t.id ? t.id : "")).join("")}</select></div>
      <div class="field"><label for="gS${i}">Sonuç</label><select id="gS${i}"${dis}>${G_DUR.map(([v, l]) => opt(v, l, g.durum || "bekliyor")).join("")}</select></div>
      <div class="field full"><label for="gD${i}">İşin tanımı</label><textarea id="gD${i}" rows="2" maxlength="1000" placeholder="Ne yapılacak, ne alınacak? Örn. 3 koli A4 kağıt ve 2 adet toner."${dis}></textarea></div>
      <div class="field"><label for="gY${i}">Gidilecek yer / firma</label><input id="gY${i}" maxlength="200" placeholder="Örn. Yurtiçi Kargo"${dis}></div>
      <div class="field gmx"><div><label for="gM${i}">Masraf (₺)</label><input id="gM${i}" type="number" min="0" step="0.01" inputmode="decimal"${dis2}></div><div><label for="gO${i}">Masraf tipi</label><select id="gO${i}"${dis2}><option value="">—</option>${PAY.map(p => opt(p, p, g.odeme || "")).join("")}</select></div></div>
      <div class="field full"><label for="gN${i}">Bu işin notu</label><textarea id="gN${i}" rows="2" maxlength="1000" placeholder="Örn. Toner yoktu, yarın gelecek. Fatura alındı."${dis2}></textarea></div>
    </div></div>`).join("");
  DCUR.gorev.forEach((g, i) => { $("#gD" + i).value = g.tanim || ""; $("#gY" + i).value = g.yer || ""; $("#gM" + i).value = g.masraf ?? ""; $("#gN" + i).value = g.not || ""; });
  box.querySelectorAll("input,select,textarea").forEach(el => el.addEventListener("input", () => { gCollect(); gTotal(); }));
  box.querySelectorAll("[data-gq]").forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.i), d = b.dataset.gq; b.disabled = true; gCollect();
    await diSetGorev(DCUR.job.id, i, d, DCUR.gorev);
    const nj = DT.jobs.find(x => x.id === DCUR.job.id); if (nj && DCUR) { DCUR.job = nj; DCUR.gorev = diGorev(nj).map(gNorm); renderGorev(); }
  });
  box.querySelectorAll("[data-gx]").forEach(b => b.onclick = () => { gCollect(); DCUR.gorev.splice(Number(b.dataset.gx), 1); renderGorev(); });
  const add = $("#gAdd"); if (add) add.onclick = () => {
    gCollect(); const last = DCUR.gorev[DCUR.gorev.length - 1] || {};
    DCUR.gorev.push(gNorm({})); renderGorev();
    const k = DCUR.gorev.length - 1; const el = $("#gT" + k); if (el) { el.focus(); el.closest(".gcard").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  };
  gTotal();
}

/* --- ekler --- */
function renderAtt() {
  const box = $("#dAtt"); if (!box || !DCUR) return;
  const ed = DCUR.ed;
  box.innerHTML = DCUR.files.map((f, k) => `<div class="th" data-k="${k}" role="button" tabindex="0" title="${esc(f.name)}">${f.thumb ? `<img src="${f.thumb}" alt="${esc(f.name)}">` : '<span class="pdf">PDF</span>'}<span class="fn">${esc(f.name)}</span>${ed ? `<button class="rmf" type="button" data-rm="${k}" aria-label="${esc(f.name)} kaldır">×</button>` : ""}</div>`).join("")
    + (DCUR.busy ? '<div class="th busy">Yükleniyor…</div>' : "")
    + (ed && !DCUR.busy && DCUR.files.length < 10 ? '<button type="button" class="th addf" id="dAddF"><span>+</span>Fotoğraf / belge</button>' : "")
    + (!ed && !DCUR.files.length ? '<p class="note" style="margin:0">Ek yok.</p>' : "");
  box.querySelectorAll("[data-k]").forEach(el => { const f = DCUR.files[Number(el.dataset.k)]; el.onclick = () => diViewFile(f); el.onkeydown = e => { if (e.key === "Enter") diViewFile(f); }; });
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = e => {
    e.stopPropagation(); const k = Number(b.dataset.rm), f = DCUR.files[k]; DCUR.files.splice(k, 1);
    const ai = DCUR.added.indexOf(f.id);
    if (ai >= 0) { DCUR.added.splice(ai, 1); deleteDoc(doc(fs, "disis_files", f.id)).catch(() => {}); } else DCUR.removed.push(f.id);
    renderAtt();
  });
  const add = $("#dAddF"); if (add) add.onclick = () => $("#dFile").click();
}
const readDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Dosya okunamadı")); r.readAsDataURL(f); });
function loadImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(u), 2000); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Görsel açılamadı. iPhone fotoğrafıysa Ayarlar > Kamera > Biçimler > En Uyumlu seçin.")); };
    i.src = u;
  });
}
function shrinkImg(img, side, maxLen) {
  let s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), q = 0.82, out = "";
  const c = document.createElement("canvas");
  for (let k = 0; k < 10; k++) {
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q); if (out.length <= maxLen) break;
    if (q > 0.5) q -= 0.12; else s *= 0.8;
  }
  return out;
}
async function diAddFiles(list) {
  for (const f of list) {
    if (!DCUR) return;
    if (DCUR.files.length >= 10) { toast("Bir işe en fazla 10 dosya eklenebilir"); break; }
    const type = f.type || "";
    if (!type.startsWith("image/") && type !== "application/pdf") { toast(f.name + ": yalnızca fotoğraf veya PDF eklenebilir"); continue; }
    if (type === "application/pdf" && f.size > 600 * 1024) { toast(f.name + ": PDF 600 KB'tan büyük. Daha küçük bir dosya seçin veya fotoğrafını çekin."); continue; }
    DCUR.busy = true; renderAtt();
    try {
      let data, thumb = null, t = type;
      if (type.startsWith("image/")) { const img = await loadImage(f); data = shrinkImg(img, 1600, 760000); thumb = shrinkImg(img, 260, 30000); t = "image/jpeg"; }
      else data = await readDataURL(f);
      const fid = doc(collection(fs, "disis_files")).id;
      await setDoc(doc(fs, "disis_files", fid), { jobId: DCUR.id, name: f.name, type: t, size: data.length, data, at: Date.now(), by: ME.name, uid: ME.uid });
      if (!DCUR) { deleteDoc(doc(fs, "disis_files", fid)).catch(() => {}); return; }
      DCUR.files.push({ id: fid, name: f.name, type: t, thumb }); DCUR.added.push(fid);
    } catch (e) { toast(f.name + " eklenemedi: " + (e.code ? writeErr(e) : e.message || e)); }
    finally { if (DCUR) { DCUR.busy = false; renderAtt(); } }
  }
}
function dataToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(","), mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
async function diViewFile(f, coll = "disis_files") {
  const host = document.createElement("div"); host.className = "viewer"; host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true");
  host.innerHTML = `<div class="vw-in"><div class="vw-h"><span>${esc(f.name)}</span><button class="x" type="button" aria-label="Kapat">×</button></div><div class="vw-b">Yükleniyor…</div></div>`;
  document.body.appendChild(host);
  const close = () => host.remove(); host.querySelector(".x").onclick = close; host.onclick = e => { if (e.target === host) close(); };
  host.querySelector(".x").focus();
  try {
    const s = await getDoc(doc(fs, coll, f.id)); if (!s.exists()) throw new Error("Dosya bulunamadı");
    const d = s.data(), b = host.querySelector(".vw-b");
    if ((d.type || "").startsWith("image/")) b.innerHTML = `<img src="${d.data}" alt="${esc(f.name)}">`;
    else { const u = URL.createObjectURL(dataToBlob(d.data)); const ext = (String(f.name).split(".").pop() || "DOSYA").toUpperCase().slice(0, 5); b.innerHTML = `<span class="pdf" style="font-family:var(--mono);font-weight:600;color:var(--bad)">${esc(ext)}</span><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn" href="${u}" target="_blank" rel="noopener">Yeni sekmede aç</a><a class="btn ghost" href="${u}" download="${esc(f.name)}">İndir</a></div>`; }
  } catch (e) { host.querySelector(".vw-b").textContent = "Dosya açılamadı: " + (e.code ? writeErr(e) : e.message); }
}

/* --- araçlar ve personel (yönetici) --- */
function openDiCfg() {
  if (!can("d.cfg")) return;
  let rows = DT.cfg.vehicles.map(v => ({ ...v }));
  const paint = (msg = "") => {
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="cfTitle" style="width:min(620px,100%)">
      <div class="dh"><h2 id="cfTitle">Araçlar ve personel</h2><button class="x" id="cfClose" aria-label="Kapat">×</button></div>
      <div class="db">
        <section><h3 class="sec-t">Şirket araçları <small>${rows.length} araç</small></h3>
          <div class="vrows">${rows.map((v, k) => `<div class="vrow">
            <div class="field"><label for="vP${k}">Plaka</label><input id="vP${k}" maxlength="20" placeholder="42 ABC 123"></div>
            <div class="field"><label for="vA${k}">Araç</label><input id="vA${k}" maxlength="40" placeholder="Doblo"></div>
            <div class="field"><label for="vD${k}">Durum</label><select id="vD${k}" class="vd-${v.durum}">${Object.entries(VDUR).map(([d, [l]]) => opt(d, l, v.durum)).join("")}</select></div>
            <div class="field vnot"><label for="vN${k}">Not</label><input id="vN${k}" maxlength="80" placeholder="Örn. fren balatası, 20 Ekim'de çıkar"></div>
            <button type="button" class="rm" data-vrm="${k}" aria-label="Aracı kaldır">×</button></div>`).join("") || '<p class="note" style="margin:0">Henüz araç yok.</p>'}</div>
          <button type="button" class="btn ghost gadd" id="vAdd">+ Araç ekle</button>
          <p class="note" style="margin:6px 0 0"><b>Arızalı</b> ve <b>Serviste</b> araçlar işe seçilemez ve çıkış yapılamaz. "Kendi aracı" ve "Araçsız" seçenekleri her zaman listededir.</p></section>
        <div class="field"><label for="cfPeo">Dışarı çıkan personel</label><textarea id="cfPeo" class="cfgta" placeholder="Ahmet Yılmaz"></textarea><p class="note" style="margin:4px 0 0">Her satıra bir kişi. Uygulamaya giriş yapmayan personeli de buraya yazabilirsiniz; ekip üyeleri listede zaten görünür.</p></div>
        ${msg ? `<div class="gate-err" role="alert">${esc(msg)}</div>` : ""}
      </div>
      <div class="df"><span></span><div class="r"><button class="btn ghost" id="cfCancel" type="button">Vazgeç</button><button class="btn" id="cfSave" type="button">Kaydet</button></div></div>
    </aside>`;
    rows.forEach((v, k) => { $("#vP" + k).value = v.plaka; $("#vA" + k).value = v.ad; $("#vN" + k).value = v.not || ""; });
    $("#cfPeo").value = peo;
    $("#scrim").onclick = closeDrawer; $("#cfClose").onclick = closeDrawer; $("#cfCancel").onclick = closeDrawer;
    document.querySelectorAll(".vrow select").forEach(el => el.onchange = () => { el.className = "vd-" + el.value; });
    $("#vAdd").onclick = () => { collect(); rows.push({ plaka: "", ad: "", durum: "musait", not: "" }); paint(); const el = $("#vP" + (rows.length - 1)); if (el) el.focus(); };
    document.querySelectorAll("[data-vrm]").forEach(b => b.onclick = () => { collect(); rows.splice(Number(b.dataset.vrm), 1); paint(); });
    $("#cfSave").onclick = async () => {
      collect();
      const clean = rows.map(v => ({ plaka: v.plaka.trim().toLocaleUpperCase("tr"), ad: v.ad.trim(), durum: v.durum, not: (v.not || "").trim() })).filter(v => v.plaka);
      const dup = clean.map(vLabel).find((l, i, a) => a.indexOf(l) !== i); if (dup) { paint(dup + " iki kez yazılmış."); return; }
      const people = [...new Set(peo.split("\n").map(x => x.trim()).filter(Boolean))].slice(0, 100);
      $("#cfSave").disabled = true;
      try { await setDoc(doc(fs, "config", "disis"), { vehicles: clean.slice(0, 60), people, updatedAt: Date.now(), updatedBy: ME.name }); toast("Araç ve personel listesi kaydedildi"); closeDrawer(); }
      catch (e) { $("#cfSave").disabled = false; toast(writeErr(e)); }
    };
  };
  let peo = DT.cfg.people.join("\n");
  const collect = () => { rows = rows.map((v, k) => ({ plaka: $("#vP" + k).value, ad: $("#vA" + k).value, durum: $("#vD" + k).value, not: $("#vN" + k).value })); peo = $("#cfPeo").value; };
  if (!rows.length) rows.push({ plaka: "", ad: "", durum: "musait", not: "" });
  paint();
}
/* --- günlük rapor (PDF) --- */
const LOGO_SRC = "logo.jpg";
function diReportJobs(day) {
  return DT.jobs.filter(j => diRefDay(j) === day || (j.giris && dayOf(j.giris) === day))
    .sort((a, b) => (a.cikis || 9e15) - (b.cikis || 9e15) || (a.no || 0) - (b.no || 0));
}
function openDiReport() {
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="rpTitle" style="width:min(440px,100%)">
    <div class="dh"><h2 id="rpTitle">Günlük dış iş raporu</h2><button class="x" id="rpClose" aria-label="Kapat">×</button></div>
    <div class="db">
      <div class="field"><label for="rpDay">Rapor tarihi</label><input id="rpDay" type="date" max="${TODAY}"></div>
      <div class="roles" id="rpSum"></div>
      <p class="note" style="margin:0">Rapor A4 yatay PDF olarak hazırlanır: özet, iş türü dağılımı, günün tüm dış işleri (çıkış–giriş saatleri, süre, masraf, notlar), personel bazında özet ve imza alanları.</p>
    </div>
    <div class="df"><span></span><div class="r"><button class="btn ghost" id="rpCancel" type="button">Vazgeç</button><button class="btn" id="rpGo" type="button">PDF oluştur</button></div></div>
  </aside>`;
  const day = $("#rpDay"); day.value = TODAY;
  const sum = () => {
    const J = diReportJobs(day.value || TODAY);
    const done = J.filter(j => j.giris && !j.iptal).length, cost = J.filter(j => !j.iptal).reduce((s, j) => s + diCost(j), 0);
    $("#rpSum").innerHTML = J.length ? `<div><b>${J.length}</b> dış iş · <b>${done}</b> tamamlandı</div><div>Toplam masraf: <b>${tl(cost)}</b></div>` : "<div>Bu tarihte dış iş kaydı yok.</div>";
    $("#rpGo").disabled = !J.length;
  };
  day.onchange = sum; sum();
  $("#scrim").onclick = closeDrawer; $("#rpClose").onclick = closeDrawer; $("#rpCancel").onclick = closeDrawer;
  $("#rpGo").onclick = async () => {
    const b = $("#rpGo"); b.disabled = true; b.textContent = "Hazırlanıyor…";
    try {
      const d = day.value || TODAY, blob = await diBuildPdf(d);
      const ok = await saveFile(blob, "dis-is-raporu-" + d + ".pdf");
      if (ok) { toast("Rapor hazırlandı"); closeDrawer(); } else { b.disabled = false; b.textContent = "PDF oluştur"; }
    } catch (e) { console.error(e); b.disabled = false; b.textContent = "PDF oluştur"; toast("Rapor hazırlanamadı: " + (e.message || e)); }
  };
}
async function saveFile(blob, name) {
  try {
    const dl = window.claude && typeof window.claude.use === "function" ? await window.claude.use("downloads") : null;
    if (dl) { await dl.save({ filename: name, data: blob }); return true; }
  } catch (e) { if (e && e.code === "declined") return false; if (e && e.code && e.code !== "unavailable" && e.code !== "not_granted") throw new Error(e.message || e.code); }
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  return true;
}
const loadSrc = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Logo yüklenemedi")); i.src = src; });

// Sayfaları canvas üzerinde çizer, JPEG görsel olarak tek bir PDF'e koyar (Türkçe karakterler sorunsuz).
async function diBuildPdf(day) {
  try { await document.fonts.ready; } catch (e) {}
  const W = 1754, H = 1240, M = 64, CW = W - 2 * M;            // A4 yatay, ~150 dpi
  const F = { b: "'IBM Plex Sans', 'Segoe UI', Roboto, Arial, sans-serif", d: "'Rubik', 'Segoe UI', Roboto, Arial, sans-serif", m: "'IBM Plex Mono', Consolas, monospace" };
  const C = { ink: "#0d1118", ink2: "#4a5466", ink3: "#7d8799", line: "#d8dee9", soft: "#eef2f8", brand: "#1747c9", bad: "#c62f3a", ok: "#14866d", warn: "#b26b00" };
  const J = diReportJobs(day), live = J.filter(j => !j.iptal);
  let logo = null; try { logo = await loadSrc(LOGO_SRC); } catch (e) {}
  const pages = []; let cv, x, y;
  const newPage = () => {
    cv = document.createElement("canvas"); cv.width = W; cv.height = H; x = cv.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.textBaseline = "top"; pages.push(cv); y = M;
    // üst bilgi
    if (logo) { const lh = 64, lw = logo.naturalWidth * lh / logo.naturalHeight; x.fillStyle = "#000"; x.fillRect(M, y, lw + 20, lh + 16); x.drawImage(logo, M + 10, y + 8, lw, lh); }
    x.fillStyle = C.ink; x.font = `700 34px ${F.d}`; x.textAlign = "right"; x.fillText("GÜNLÜK DIŞ İŞ RAPORU", W - M, y + 4);
    const [yy, mm, dd] = day.split("-").map(Number);
    x.font = `500 21px ${F.b}`; x.fillStyle = C.ink2;
    x.fillText(`${dd} ${MON_L[mm - 1]} ${yy}, ${DAYS_L[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()]}  ·  Kar-Men Airtech`, W - M, y + 48);
    x.textAlign = "left"; y += 100; x.fillStyle = C.brand; x.fillRect(M, y, CW, 4); y += 22;
  };
  const font = (w, s, f = F.b) => { x.font = `${w} ${s}px ${f}`; };
  const wrap = (text, maxW) => {
    const out = []; String(text || "").split("\n").forEach(par => {
      let line = ""; par.split(/\s+/).filter(Boolean).forEach(word => {
        let t = line ? line + " " + word : word;
        if (x.measureText(t).width <= maxW) { line = t; return; }
        if (line) out.push(line);
        while (x.measureText(word).width > maxW) { let k = word.length; while (k > 1 && x.measureText(word.slice(0, k)).width > maxW) k--; out.push(word.slice(0, k)); word = word.slice(k); }
        line = word;
      });
      out.push(line);
    });
    return out.length ? out : [""];
  };
  const ensure = h => { if (y + h > H - M - 40) { newPage(); return true; } return false; };
  newPage();

  // özet kutuları
  const outNow = live.filter(j => j.cikis && !j.giris), done = live.filter(j => j.giris), wait = live.filter(j => !j.cikis);
  const totDur = live.reduce((s, j) => s + (j.cikis ? ((j.giris || (day === TODAY ? Date.now() : j.cikis)) - j.cikis) : 0), 0);
  const cost = live.reduce((s, j) => s + diCost(j), 0);
  const km = live.reduce((s, j) => s + (j.kmCikis != null && j.kmDonus != null ? Math.max(0, j.kmDonus - j.kmCikis) : 0), 0);
  const boxes = [["Toplam iş", String(J.length)], ["Tamamlanan", String(done.length)], ["Dışarıda", String(outNow.length)], ["Çıkış bekleyen", String(wait.length)], ["İptal", String(J.length - live.length)], ["Dışarıda geçen süre", fmtDur(totDur)], ["Toplam masraf", tl(cost)], ["Araç km", km ? km.toLocaleString("tr-TR") + " km" : "—"]];
  const bw = (CW - 7 * 12) / 8;
  boxes.forEach(([k, v], i) => {
    const bx = M + i * (bw + 12); x.fillStyle = C.soft; x.fillRect(bx, y, bw, 92);
    font(500, 17); x.fillStyle = C.ink3; x.fillText(k, bx + 14, y + 14);
    font(700, 30, F.d); x.fillStyle = (k === "Dışarıda" && outNow.length) ? C.brand : C.ink; x.fillText(v, bx + 14, y + 44, bw - 28);
  });
  y += 112;
  // iş türü dağılımı
  const byType = {}; live.forEach(j => diGorev(j).forEach(g => { const t = diType(g.tur); byType[t.name] = (byType[t.name] || 0) + 1; }));
  font(600, 19); x.fillStyle = C.ink2; x.fillText("İş türleri:", M, y);
  let tx = M + x.measureText("İş türleri:").width + 14;
  Object.entries(byType).forEach(([n, c]) => { const t = `${n} (${c})`; font(500, 19); const tw = x.measureText(t).width + 24; if (tx + tw > W - M) { y += 34; tx = M; } x.fillStyle = C.soft; x.fillRect(tx, y - 5, tw, 30); x.fillStyle = C.ink; x.fillText(t, tx + 12, y); tx += tw + 10; });
  y += 40;
  const byPay = {}; live.forEach(j => diGorev(j).forEach(g => { if (Number(g.masraf)) { const k = g.odeme || "Belirtilmemiş"; byPay[k] = (byPay[k] || 0) + Number(g.masraf); } }));
  if (Object.keys(byPay).length) {
    font(600, 19); x.fillStyle = C.ink2; x.fillText("Masraf tipi:", M, y);
    let px = M + x.measureText("Masraf tipi:").width + 14;
    Object.entries(byPay).forEach(([k, v]) => { const t = `${k}: ${tl(v)}`; font(500, 19); const tw = x.measureText(t).width + 24; if (px + tw > W - M) { y += 34; px = M; } x.fillStyle = C.soft; x.fillRect(px, y - 5, tw, 30); x.fillStyle = C.ink; x.fillText(t, px + 12, y); px += tw + 10; });
    y += 40;
  }
  y += 8;

  // iş tablosu
  const cols = [["No", 62], ["Personel", 190], ["Araç", 185], ["İş türü", 200], ["İşin tanımı · yer · not", 400], ["Çıkış", 92], ["Giriş", 92], ["Süre", 144], ["Masraf", 120], ["Durum", 149]];
  const head = () => {
    x.fillStyle = C.ink; x.fillRect(M, y, CW, 40); font(600, 16); x.fillStyle = "#fff";
    let cx = M; cols.forEach(([n, w]) => { x.fillText(n.toLocaleUpperCase("tr"), cx + 10, y + 12); cx += w; }); y += 40;
  };
  font(700, 24, F.d); x.fillStyle = C.ink; x.fillText("Günün dış işleri", M, y); y += 40;
  head();
  const LH = 25, PAD = 12;
  J.forEach((j, idx) => {
    const st = diStatus(j), G = diGorev(j);
    font(400, 19); const per = wrap(j.personel || "—", 190 - 20), veh = wrap(j.arac || "—", 185 - 20);
    // her görev için tür (sol) ve tanım + yer (sağ) bloğu
    const blocks = G.map((g, gi) => {
      const t = diType(g.tur), mark = g.durum === "yapildi" ? "✓ " : g.durum === "yapilamadi" ? "✕ " : "";
      font(500, 18); const typ = wrap((G.length > 1 ? (gi + 1) + ". " : "") + t.name + (gi === 0 && j.oncelik === "acil" ? " · ACİL" : ""), 200 - 20);
      font(400, 19); const ds = wrap(mark + (g.tanim || ""), 400 - 20);
      font(400, 17); const yr = (g.yer || g.masraf || g.durum === "yapilamadi") ? wrap([g.yer, g.masraf ? tl(g.masraf) + (g.odeme ? " (" + g.odeme + ")" : "") : "", g.durum === "yapilamadi" ? "yapılamadı" : ""].filter(Boolean).join(" · "), 400 - 20) : [];
      const gn = g.not ? wrap("Not: " + g.not, 400 - 20) : [];
      return { t, typ, ds, yr, gn, n: Math.max(typ.length, ds.length + yr.length + gn.length) };
    });
    font(400, 17); const not = j.not ? wrap("Not: " + j.not, 400 - 20) : [];
    const gLines = blocks.reduce((s2, b) => s2 + b.n, 0) + not.length;
    const cost = diCost(j);
    const pays = [...new Set(G.filter(g => g.masraf).map(g => g.odeme).filter(Boolean))];
    const pay = cost ? [tl(cost)].concat(pays.length ? pays : (j.odeme ? [j.odeme] : [])).concat(j.fis ? ["Fiş var"] : []) : ["—"];
    const lines = Math.max(per.length, veh.length, gLines, pay.length, 1);
    const rh = lines * LH + PAD * 2;
    if (ensure(rh)) { head(); }
    if (idx % 2) { x.fillStyle = "#f7f9fc"; x.fillRect(M, y, CW, rh); }
    const stc = { late: C.bad, out: C.brand, wait: C.warn, done: C.ok, iptal: C.ink3 }[st.key];
    x.fillStyle = stc; x.fillRect(M, y, 5, rh);
    let cx = M; const ty = y + PAD;
    const col = (w, arr, style = [400, 19], color = C.ink, f = F.b) => { font(style[0], style[1], f); x.fillStyle = color; arr.forEach((l, k) => x.fillText(l, cx + 10, ty + k * LH)); cx += w; };
    col(62, ["#" + j.no], [500, 18], C.ink2, F.m);
    col(190, per); col(185, veh);
    const tx0 = cx, dx0 = cx + 200; let ln = 0;
    blocks.forEach((b, bi) => {
      if (bi) { x.fillStyle = C.line; x.fillRect(tx0 + 10, ty + ln * LH - 3, 580, 1); }
      font(500, 18); x.fillStyle = b.t.c; b.typ.forEach((l, k) => x.fillText(l, tx0 + 10, ty + (ln + k) * LH));
      font(400, 19); x.fillStyle = C.ink; b.ds.forEach((l, k) => x.fillText(l, dx0 + 10, ty + (ln + k) * LH));
      font(400, 17); x.fillStyle = C.ink2; b.yr.forEach((l, k) => x.fillText(l, dx0 + 10, ty + (ln + b.ds.length + k) * LH));
      x.fillStyle = C.ink3; b.gn.forEach((l, k) => x.fillText(l, dx0 + 10, ty + (ln + b.ds.length + b.yr.length + k) * LH));
      ln += b.n;
    });
    font(400, 17); x.fillStyle = C.ink3; not.forEach((l, k) => x.fillText(l, dx0 + 10, ty + (ln + k) * LH));
    cx = dx0 + 400;
    col(92, [j.cikis ? hhmm(j.cikis) : "—"].concat(j.cikis && dayOf(j.cikis) !== day ? [fmtS(dayOf(j.cikis)).slice(0, 5)] : []), [500, 19], C.ink, F.m);
    col(92, [j.giris ? hhmm(j.giris) : (j.donusSaat && !j.iptal ? "~" + j.donusSaat : "—")], [500, 19], j.giris ? C.ink : C.ink3, F.m);
    col(144, [j.cikis && !j.iptal ? fmtDur(diDur(j)) : "—"], [400, 18], C.ink, F.m);
    col(120, pay, [400, 18]);
    col(149, wrap(st.label, 129), [600, 18], stc);
    y += rh; x.fillStyle = C.line; x.fillRect(M, y, CW, 1);
  });
  y += 30;

  // personel bazında
  const byP = {}; live.forEach(j => { const p = byP[j.personel] = byP[j.personel] || { n: 0, d: 0, c: 0, s: 0 }; p.n++; if (j.cikis) p.s++; p.d += j.cikis ? ((j.giris || (day === TODAY ? Date.now() : j.cikis)) - j.cikis) : 0; p.c += diCost(j); });
  const pe = Object.entries(byP).sort((a, b) => b[1].n - a[1].n);
  if (pe.length) {
    ensure(90 + Math.min(pe.length, 3) * 36);
    font(700, 24, F.d); x.fillStyle = C.ink; x.fillText("Personel bazında", M, y); y += 40;
    const pc = [["Personel", 420], ["İş sayısı", 180], ["Dışarıda geçen süre", 260], ["Masraf", 220]], pw = pc.reduce((s, c) => s + c[1], 0);
    const ph = () => { x.fillStyle = C.soft; x.fillRect(M, y, pw, 36); font(600, 16); x.fillStyle = C.ink2; let cx = M; pc.forEach(([n, w]) => { x.fillText(n.toLocaleUpperCase("tr"), cx + 10, y + 10); cx += w; }); y += 36; };
    ph();
    pe.forEach(([name, v]) => {
      if (ensure(36)) ph();
      font(400, 19); x.fillStyle = C.ink; let cx = M;
      [[name, F.b], [String(v.n), F.m], [v.s ? fmtDur(v.d) : "—", F.m], [tl(v.c), F.m]].forEach(([tx2, f], i) => { font(400, 19, f); x.fillText(tx2, cx + 10, y + 8, pc[i][1] - 20); cx += pc[i][1]; });
      y += 36; x.fillStyle = C.line; x.fillRect(M, y, pw, 1);
    });
    y += 30;
  }
  // imza alanı
  ensure(140);
  const sw = (CW - 60) / 2;
  [["Hazırlayan", ME ? ME.name : ""], ["Onaylayan", ""]].forEach(([k, n], i) => {
    const sx = M + i * (sw + 60);
    font(600, 18); x.fillStyle = C.ink2; x.fillText(k, sx, y);
    font(400, 19); x.fillStyle = C.ink; x.fillText(n, sx, y + 30);
    x.fillStyle = C.ink3; x.fillRect(sx, y + 104, sw, 1.5);
    font(400, 15); x.fillText("İmza", sx, y + 112);
  });
  // alt bilgi
  const stamp = `${fmtS(TODAY)} ${hhmm(Date.now())}`;
  pages.forEach((p, i) => {
    const c = p.getContext("2d"); c.textBaseline = "top"; c.font = `400 15px ${F.b}`; c.fillStyle = C.ink3;
    c.fillText(`KARMEN MRP-ERP · Dış İş Takip · Oluşturan: ${ME ? ME.name : ""} · ${stamp}`, M, H - M);
    c.textAlign = "right"; c.fillText(`Sayfa ${i + 1} / ${pages.length}`, W - M, H - M); c.textAlign = "left";
  });
  return jpegPagesToPdf(pages.map(p => p.toDataURL("image/jpeg", 0.9)), W, H);
}
// Minimal PDF yazıcı: her sayfa tek JPEG görsel
function jpegPagesToPdf(dataUrls, pxW, pxH) {
  const PW = 841.89, PH = 595.28, enc = new TextEncoder(), parts = [], offs = [];
  let len = 0; const push = b => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = dataUrls.length, kids = [];
  for (let i = 0; i < n; i++) kids.push(`${3 + i * 3} 0 R`);
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>`));
  dataUrls.forEach((u, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
    const bin = atob(u.split(",")[1]), bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    obj(ct, () => { push(`<< /Length ${cs.length} >>\nstream\n`); push(cs); push("\nendstream"); });
    obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); push(bytes); push("\nendstream"); });
  });
  const total = 3 + n * 3, xref = len;
  let xr = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) xr += String(offs[i]).padStart(10, "0") + " 00000 n \n";
  push(xr); push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function wireDisisToolbar() {
  const bind = (sel, key, ev = "change") => $(sel).addEventListener(ev, () => { DT.F[key] = $(sel).value; renderDisis(); });
  $("#diArch").onclick = () => { DT.F.arch = !DT.F.arch; DT.F.date = DT.F.arch ? "all" : "open"; DT.F.status = ""; DT.SORT = { key: "auto", dir: 1 }; renderDisis(); scrollTo({ top: $("#diVehicles").offsetTop - 70, behavior: "smooth" }); };
  $("#diArchBack").onclick = () => $("#diArch").click();
  bind("#diDate", "date"); bind("#diStatus", "status"); bind("#diPerson", "person"); bind("#diVehicle", "vehicle"); bind("#diType", "type"); bind("#diQ", "q", "input");
  $("#diAdd").onclick = () => openDisis(null);
  $("#diCfgBtn").onclick = openDiCfg;
  $("#diRepBtn").onclick = openDiReport;
  setInterval(() => { if (ROUTE === "disis" && !$("#app").hidden) renderDisis(); else if (ROUTE === "home" && !$("#app").hidden) renderHome(); }, 30000);
}
wireDisisToolbar();

/* ================= YETKİLENDİRME (yalnızca yönetici) ================= */
const MOD_SHORT = { proje: "Proje Takip", stok: "Stok", satinalma: "Satınalma", disis: "Dış İş", personel: "Personel", planlama: "Planlama", siparis: "Sipariş" };
const LV_SHORT = { none: "Yok", view: "Gözlemci", use: "Kullanıcı", edit: "Düzenleyici" };
const YT = { rows: [], dirty: false, msg: "" };
function yetkiTile() {
  const n = Object.keys(state.access || {}).length;
  return `<a class="tile adm" href="#yetki" aria-label="Yetkilendirme ekranını aç">
    <div class="t-top"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><span class="st">YÖNETİCİ</span></div>
    <div><div class="nm">YETKİLENDİRME</div><div class="ds">Ekip, modül erişimleri ve işlem yetkileri</div><div class="stats"><span>${n} kişi</span></div></div></a>`;
}
const defActs = (m, L) => ((PERM_DEF[m] || {})[L] || []);
function ytLoad() {
  const acc = state.access || {};
  YT.rows = Object.entries(acc).map(([email, e]) => { const p = effPerms(e) || { role: "user", mods: {}, acts: {} }; return { email, name: e.name || "", role: p.role, mods: { ...p.mods }, acts: { ...p.acts }, orig: email }; })
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name, "tr"));
  if (ME && !YT.rows.some(r => r.email === ME.email)) YT.rows.unshift({ email: ME.email, name: ME.name, role: "admin", mods: {}, acts: {}, orig: ME.email });
  YT.rows.forEach(r => PERM_MODS.forEach(m => { if (!r.mods[m]) r.mods[m] = "none"; }));
  YT.dirty = false; YT.msg = "";
}
function ytCustom(r, m) {
  if (!PERM_ACTS[m]) return false;
  const d = new Set(defActs(m, r.mods[m]));
  return PERM_ACTS[m].some(([a]) => !!r.acts[a] !== d.has(a));
}
function ytSetLevel(r, m, L) {
  r.mods[m] = L;
  (PERM_ACTS[m] || []).forEach(([a]) => { delete r.acts[a]; });
  defActs(m, L).forEach(a => r.acts[a] = true);
}
function ytMark() { YT.dirty = true; const b = $("#ytSave"); if (b) b.disabled = false; const s = $("#ytState"); if (s) s.textContent = "Kaydedilmemiş değişiklik var"; }
function renderYetki() {
  if (!isAdmin() || $("#modYetki").hidden) return;
  const R = YT.rows;
  const adminN = R.filter(r => r.role === "admin").length;
  $("#ytSum").innerHTML = `<span><b>${R.length}</b> kişi</span><span><b>${adminN}</b> yönetici</span><span><b>${R.length - adminN}</b> kullanıcı</span>`;
  $("#ytBody").innerHTML = `
    <div class="yt-tw"><table class="ytt">
      <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Sistem rolü</th>${PERM_MODS.map(m => `<th class="c">${esc(MOD_SHORT[m])}${MODULES.find(x => x.id === m && x.active) ? "" : '<small>hazırlanıyor</small>'}</th>`).join("")}<th class="c">Mesaj</th><th></th></tr></thead>
      <tbody>${R.map((r, k) => {
        const adm = r.role === "admin", self = ME && r.email === ME.email;
        return `<tr class="${adm ? "isadm" : ""}">
          <td><input id="yN${k}" value="${esc(r.name)}" placeholder="Ad Soyad" aria-label="Ad Soyad"></td>
          <td><input id="yE${k}" type="email" value="${esc(r.email)}" placeholder="ad@ornek.com" aria-label="E-posta"${self ? " disabled" : ""}></td>
          <td><select id="yR${k}" aria-label="Sistem rolü"${self && !isBoot(ME.email) ? " disabled" : ""}>${opt("admin", "Yönetici", r.role)}${opt("user", "Kullanıcı", r.role)}</select></td>
          ${PERM_MODS.map(m => adm ? `<td class="c"><span class="lv lv-full">Tam yetki</span></td>`
            : `<td class="c"><select class="lv lv-${r.mods[m]}" data-k="${k}" data-m="${m}" aria-label="${esc(MOD_SHORT[m])} yetkisi">${PERM_LEVELS.map(([v, l]) => opt(v, l, r.mods[m])).join("")}</select>${ytCustom(r, m) ? '<span class="cust" title="Bu modülde işlem yetkileri özelleştirildi">özel</span>' : ""}</td>`).join("")}
          <td class="c">${adm ? '<span class="lv lv-full">Tam</span>' : `<input type="checkbox" class="ymsg" data-k="${k}" aria-label="${esc(r.name || r.email)} mesaj gönderebilir"${r.acts["p.msg"] ? " checked" : ""}>`}</td>
          <td class="act">${adm ? "" : `<button class="btn ghost sm" type="button" data-det="${k}">İşlemler</button>`}${self ? "" : `<button class="rm" type="button" data-rm="${k}" aria-label="${esc(r.name || r.email)} kişisini kaldır">×</button>`}</td>
        </tr>`; }).join("")}</tbody>
    </table></div>
    ${YT.msg ? `<div class="gate-err" role="alert" style="margin-top:12px">${esc(YT.msg)}</div>` : ""}`;
  const B = $("#ytBody");
  const collect = () => R.forEach((r, k) => { const n = $("#yN" + k), e = $("#yE" + k), ro = $("#yR" + k); if (n) r.name = n.value.trim(); if (e && !e.disabled) r.email = lower(e.value); if (ro && !ro.disabled) r.role = ro.value; });
  B.querySelectorAll("input").forEach(el => el.oninput = () => { collect(); ytMark(); });
  B.querySelectorAll("select[id^=yR]").forEach(el => el.onchange = () => { collect(); ytMark(); renderYetki(); });
  B.querySelectorAll("select.lv").forEach(el => el.onchange = () => { collect(); const r = R[Number(el.dataset.k)]; ytSetLevel(r, el.dataset.m, el.value); ytMark(); renderYetki(); });
  B.querySelectorAll("input.ymsg").forEach(el => el.onchange = () => { const r = R[Number(el.dataset.k)]; if (el.checked) r.acts["p.msg"] = true; else delete r.acts["p.msg"]; ytMark(); });
  B.querySelectorAll("[data-det]").forEach(b => b.onclick = () => { collect(); openYtDetail(Number(b.dataset.det)); });
  B.querySelectorAll("[data-rm]").forEach(b => { let armed = false; b.onclick = () => {
    if (!armed) { armed = true; b.textContent = "Kaldır?"; b.classList.add("armed"); setTimeout(() => { armed = false; b.textContent = "×"; b.classList.remove("armed"); }, 3000); return; }
    collect(); R.splice(Number(b.dataset.rm), 1); ytMark(); renderYetki(); }; });
  $("#ytSave").disabled = !YT.dirty;
  $("#ytState").textContent = YT.dirty ? "Kaydedilmemiş değişiklik var" : "Tüm değişiklikler kayıtlı";
}
function openYtDetail(k) {
  const r = YT.rows[k]; if (!r) return;
  const mods = PERM_MODS.filter(m => PERM_ACTS[m]);
  const paint = () => {
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="ydT" style="width:min(520px,100%)">
      <div class="dh"><h2 id="ydT">${esc(r.name || r.email || "Yeni kişi")} · işlem yetkileri</h2><button class="x" id="ydX" aria-label="Kapat">×</button></div>
      <div class="db">
        <p class="note" style="margin:0">Modül seviyesini seçince işlemler o seviyenin varsayılanına göre işaretlenir. Kutuları tek tek açıp kapatarak kişiye özel yetki verebilirsiniz.</p>
        ${mods.map(m => `<section class="ydm">
          <div class="ydh"><h3>${esc(MOD_SHORT[m])}</h3><select class="lv lv-${r.mods[m]}" data-m="${m}" aria-label="${esc(MOD_SHORT[m])} seviyesi">${PERM_LEVELS.map(([v, l]) => opt(v, l, r.mods[m])).join("")}</select></div>
          <div class="ydl">${PERM_ACTS[m].map(([a, l]) => `<label class="chk${r.mods[m] === "none" ? " off" : ""}"><input type="checkbox" data-a="${a}" data-m="${m}"${r.acts[a] && r.mods[m] !== "none" ? " checked" : ""}${r.mods[m] === "none" ? " disabled" : ""}> ${esc(l)}</label>`).join("")}</div>
          ${r.mods[m] === "none" ? '<p class="note" style="margin:6px 0 0">Bu modüle erişimi yok; ana ekranda kutusu görünmez.</p>' : r.mods[m] === "view" ? '<p class="note" style="margin:6px 0 0">Gözlemci kayıtları görür; işaretli olmayan hiçbir işlemi yapamaz.</p>' : ""}
        </section>`).join("")}
        <section class="ydm"><div class="ydh"><h3>Genel</h3></div>
          <div class="ydl">${PERM_GLOBAL.map(([a, l]) => `<label class="chk"><input type="checkbox" data-a="${a}" data-g="1"${r.acts[a] ? " checked" : ""}> ${esc(l)}</label>`).join("")}</div>
          <p class="note" style="margin:6px 0 0">Mesajları herkes okuyabilir; bu kutu işaretli değilse kişi mesaj gönderemez.</p></section>
        <section class="ydm"><div class="ydh"><h3>Hazırlanan modüller</h3></div>
          <div class="ydl">${PERM_MODS.filter(m => !PERM_ACTS[m]).map(m => `<div class="ydr"><span>${esc(MOD_SHORT[m])}</span><select class="lv lv-${r.mods[m]}" data-m="${m}" aria-label="${esc(MOD_SHORT[m])} seviyesi">${PERM_LEVELS.map(([v, l]) => opt(v, l, r.mods[m])).join("")}</select></div>`).join("")}</div>
          <p class="note" style="margin:6px 0 0">Bu modüller hazır olduğunda işlem listeleri buraya eklenecek. "Erişim yok" seçilirse kişinin ana ekranında kutusu görünmez.</p></section>
      </div>
      <div class="df"><span class="note">Değişiklikler ana ekrandaki <b>Kaydet</b> ile kalıcı olur.</span><div class="r"><button class="btn" id="ydOk" type="button">Tamam</button></div></div>
    </aside>`;
    const done = () => { closeDrawer(); renderYetki(); };
    $("#scrim").onclick = done; $("#ydX").onclick = done; $("#ydOk").onclick = done;
    document.querySelectorAll(".ydm select.lv").forEach(el => el.onchange = () => { ytSetLevel(r, el.dataset.m, el.value); ytMark(); paint(); });
    document.querySelectorAll(".ydm input[data-a]").forEach(el => el.onchange = () => { if (el.checked) r.acts[el.dataset.a] = true; else delete r.acts[el.dataset.a]; ytMark(); });
  };
  paint();
}
async function ytSave() {
  const errs = [], members = {};
  for (const r of YT.rows) {
    if (!r.email && !r.name) continue;
    if (!r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) { errs.push((r.name || "Adsız") + ": e-posta eksik veya hatalı"); continue; }
    if (!r.name) { errs.push(r.email + ": ad soyad eksik"); continue; }
    if (members[r.email]) { errs.push(r.email + " iki kez yazılmış"); continue; }
    if (r.role === "admin") { members[r.email] = { name: r.name, role: "admin" }; continue; }
    const mods = {}, acts = {};
    PERM_MODS.forEach(m => { mods[m] = r.mods[m] || "none"; if (mods[m] !== "none") (PERM_ACTS[m] || []).forEach(([a]) => { if (r.acts[a]) acts[a] = true; }); });
    PERM_GLOBAL.forEach(([a]) => { if (r.acts[a]) acts[a] = true; });
    members[r.email] = { name: r.name, role: "user", mods, acts };
  }
  if (errs.length) { YT.msg = errs.join(" · "); renderYetki(); return; }
  if (!Object.values(members).some(m => m.role === "admin") && !isBoot(ME.email)) { YT.msg = "En az bir yönetici kalmalı."; renderYetki(); return; }
  if (!isBoot(ME.email) && (!members[ME.email] || members[ME.email].role !== "admin")) { YT.msg = "Kendi yönetici yetkinizi bu ekrandan kaldıramazsınız."; renderYetki(); return; }
  $("#ytSave").disabled = true; YT.msg = "";
  try {
    await setDoc(doc(fs, "config", "access"), { members, updatedAt: Date.now(), updatedBy: ME.email });
    YT.dirty = false; toast("Yetkiler kaydedildi. Kişilerin ekranı hemen güncellenir.");
    ytLoad(); renderYetki();
  } catch (e) { YT.msg = writeErr(e); renderYetki(); }
}
async function ytImport(f) {
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.tasks)) throw new Error("Dosya biçimi tanınmadı");
    const ops = [];
    data.tasks.forEach(t => { const { id, ...body } = t; if (id) ops.push(["tasks", id, body]); });
    (data.feedback || []).forEach(x => { const { id, ...body } = x; if (id) ops.push(["feedback", id, { ...body, uid: body.uid || ME.uid }]); });
    for (let k = 0; k < ops.length; k += 400) { const b = writeBatch(fs); ops.slice(k, k + 400).forEach(([c, id, body]) => b.set(doc(fs, c, id), body)); await b.commit(); }
    toast(data.tasks.length + " iş ve " + (data.feedback || []).length + " geri bildirim içe aktarıldı");
  } catch (e) { toast("İçe aktarılamadı: " + (e.code ? writeErr(e) : e.message)); }
}
function wireYetki() {
  $("#ytAdd").onclick = () => {
    const r = { email: "", name: "", role: "user", mods: {}, acts: {}, orig: "" };
    PERM_MODS.forEach(m => ytSetLevel(r, m, PERM_ACTS[m] ? "use" : "none"));
    YT.rows.push(r); ytMark(); renderYetki(); const k = YT.rows.length - 1; const el = $("#yN" + k); if (el) el.focus();
  };
  $("#ytSave").onclick = ytSave;
  $("#ytReset").onclick = () => { ytLoad(); renderYetki(); toast("Değişiklikler geri alındı"); };
  $("#ytImpBtn").onclick = () => $("#ytImp").click();
  $("#ytImp").onchange = async () => { const f = $("#ytImp").files[0]; $("#ytImp").value = ""; if (f) await ytImport(f); };
  addEventListener("beforeunload", e => { if (YT.dirty && ROUTE === "yetki") { e.preventDefault(); e.returnValue = ""; } });
}
wireYetki();

/* ================= Bağlantı, PWA, olaylar ================= */
const net = () => { $("#offline").hidden = navigator.onLine; };
addEventListener("online", net); addEventListener("offline", net); net();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", e => { try { fn(e); } catch (err) { console.error(err); toast("Bir hata oluştu: " + (err && err.message || err)); } }); };
const setView = v => { VIEW = v; try { localStorage.setItem("karmen-view", VIEW); } catch (e) {} render(); };
on("#addBtn", () => openDrawer(null));
on("#vList", () => setView("list"));
on("#vTl", () => setView("tl"));
on("#clearF", () => { for (const k in F) F[k] = ""; render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && msgOpen()) markReadSoon(); });
paintDate(); setInterval(tick, 20000);

/* ================= BİLDİRİMLER (uygulama açıkken, ücretsiz) ================= */
// Olaylar sunucuya ayrıca yazılmaz; her cihaz zaten aldığı veriden (dış iş hareketleri, geri bildirimler, mesajlar) kendi bildirimlerini üretir.
// Görüldü bilgisi ve kişisel ayarlar reads/{uid} belgesinde tutulur.
const NT = { seen: 0, prefs: { disis: true, proje: true, msg: true, remind: true, system: true }, list: [], known: null, timer: null, startedAt: 0, loaded: false };
const NT_PREFS = [
  ["disis", "Dış iş hareketleri", "Size atanan işler; açtığınız işlerde çıkış, giriş, bitirilen görevler ve geciken dönüşler"],
  ["proje", "Proje takip", "Sorumlusu olduğunuz işlere yazılan geri bildirimler ve yapılan değişiklikler"],
  ["msg", "Mesajlar", "Size gelen özel mesajlar ve ekip kanalı"],
  ["remind", "17:45 hatırlatması", "Saat 17:00'den sonra, bugün geri bildirimi eksik işiniz varsa"],
  ["system", "Telefon / bilgisayar bildirimi", "Uygulama açıkken başka ekrandaysanız cihazın kendi bildirimiyle uyarır"]
];
const BELL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 003.4 0"/></svg>';
function startNotif() {
  NT.known = null; NT.startedAt = Date.now(); NT.loaded = false;
  dataUnsubs.push(onSnapshot(doc(fs, "reads", ME.uid), s => {
    const d = s.exists() ? s.data() : {};
    NT.seen = Number(d.notifSeen) || 0;
    NT.prefs = { ...NT.prefs, ...(d.notifPrefs || {}) };
    NT.loaded = true; notifSoon();
  }, () => { NT.loaded = true; notifSoon(); }));
}
function notifSoon() { clearTimeout(NT.timer); NT.timer = setTimeout(notifRefresh, 250); }
const shortTxt = (s, n = 70) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
function buildEvents() {
  const ev = []; if (!ME) return ev;
  const P = NT.prefs, since = Date.now() - 7 * 864e5, watchAll = isAdmin() || can("d.edit.all");
  // Dış iş
  if (P.disis && lvl("disis") !== "none") DT.jobs.forEach(j => {
    const mineP = diIsMine(j), mineC = j.createdByUid === ME.uid;
    if (!(mineP || mineC || watchAll)) return;
    const sum = `#${j.no} · ${j.personel || ""} · ${shortTxt(diGorev(j).map(g => g.tanim).join(", "), 60)}`;
    (j.log || []).forEach((l, k) => {
      if (!l || !l.at || l.at < since || l.by === ME.name) return;
      let title;
      if (/oluşturuldu/.test(l.t)) title = mineP ? `${l.by} size yeni dış iş atadı` : `${l.by} yeni dış iş açtı`;
      else if (/^Çıkış yapıldı/.test(l.t)) title = `${j.personel} çıkış yaptı`;
      else if (/^Giriş yapıldı/.test(l.t)) title = `${j.personel} döndü`;
      else title = `${l.by}: ${l.t}`;
      ev.push({ id: `d:${j.id}:${l.at}:${k}`, at: l.at, mod: "disis", ref: j.id, title, body: sum, kind: /iptal/.test(l.t) ? "warn" : /bitirildi|döndü|Giriş/.test(title) ? "ok" : "" });
    });
    if ((mineC || watchAll || mineP) && diStatus(j).key === "late") {
      const p = diPlanTs(j) || istTs(TODAY, "00:00");
      ev.push({ id: `dl:${j.id}:${p}`, at: p, mod: "disis", ref: j.id, title: mineP ? "Dönüş saatiniz geçti" : `${j.personel} dönmedi, dönüş saati geçti`, body: sum + (j.donusSaat ? ` · tahmini ${j.donusSaat}` : ""), kind: "bad" });
    }
  });
  // Proje takip
  if (P.proje && lvl("proje") !== "none") {
    const mine = t => (t.owners || []).includes(ME.name);
    const byId = new Map(state.tasks.map(t => [t.id, t]));
    state.feedback.forEach(f => {
      const t = byId.get(f.taskId); if (!t || !f.at || f.at < since || f.author === ME.name) return;
      if (!(mine(t) || isAdmin() || can("p.task"))) return;
      ev.push({ id: `f:${f.id}`, at: f.at, mod: "proje", ref: t.id, title: `${f.author} geri bildirim yazdı`, body: `${t.no}. ${shortTxt(t.title, 40)} · ${shortTxt(f.text, 70)}`, kind: "" });
    });
    state.tasks.forEach(t => {
      if (!mine(t) || !t.updatedAt || t.updatedAt < since || !t.updatedBy || t.updatedBy === ME.name) return;
      ev.push({ id: `t:${t.id}:${t.updatedAt}`, at: t.updatedAt, mod: "proje", ref: t.id, title: `${t.updatedBy} sorumlusu olduğunuz işi güncelledi`, body: `${t.no}. ${shortTxt(t.title, 70)} · %${Number(t.progress) || 0}`, kind: "" });
    });
  }
  // Mesajlar
  if (P.msg && typeof MSG !== "undefined") for (const m of MSG.map.values()) {
    if (!m.at || m.at < since || lower(m.from) === ME.email) continue;
    ev.push({ id: `m:${m.id}`, at: m.at, mod: "msg", ref: peerOf(m), title: m.to === "all" ? `${nameOf(m.from)} · Tüm ekip` : `${nameOf(m.from)} size mesaj gönderdi`, body: shortTxt(msgText(m), 90), kind: "" });
  }
  // 17:45 hatırlatması
  if (P.remind && lvl("proje") !== "none" && state.ready) {
    const n = istNow(), mins = n.h * 60 + n.m;
    if (mins >= 17 * 60) {
      const miss = missingToday().filter(t => (t.owners || []).includes(ME.name));
      if (miss.length) ev.push({ id: `r:${TODAY}`, at: istTs(TODAY, "17:00"), mod: "proje", ref: null, remind: true, title: mins < 17 * 60 + 45 ? `Bugün ${miss.length} işinize geri bildirim girilmedi` : `17:45 geçti: ${miss.length} işinizde bugünkü geri bildirim eksik`, body: miss.map(t => t.no + ". " + shortTxt(t.title, 30)).join(" · "), kind: "warn" });
    }
  }
  return ev.sort((a, b) => b.at - a.at).slice(0, 150);
}
function notifRefresh() {
  if (!ME || $("#app").hidden) return;
  const list = buildEvents(); NT.list = list;
  const unseen = list.filter(e => e.at > NT.seen).length;
  const b = $("#bellBadge"); if (b) { b.hidden = !unseen; b.textContent = unseen > 99 ? "99+" : unseen; }
  $("#bellBtn") && $("#bellBtn").classList.toggle("has", !!unseen);
  const msgN = typeof totalUnread === "function" ? totalUnread() : 0;
  try { if (navigator.setAppBadge) (unseen + msgN) ? navigator.setAppBadge(unseen + msgN) : navigator.clearAppBadge(); } catch (e) {}
  // ilk yüklemeden sonra gelen yeni olayları duyur (mesajlar zaten kendi uyarısını veriyor)
  const ready = NT.loaded && Date.now() - NT.startedAt > 4000;
  if (NT.known && ready) {
    const fresh = list.filter(e => !NT.known.has(e.id) && e.mod !== "msg" && (e.remind || Date.now() - e.at < 10 * 60e3));
    fresh.slice(0, 3).forEach(e => announce(e));
  }
  if (ready || NT.known) NT.known = new Set(list.map(e => e.id));
  if ($("#ntPanel")) paintNotifList();
}
function announce(e) {
  if (!(document.hidden && NT.prefs.system)) toast(e.title + (e.body ? " · " + shortTxt(e.body, 60) : ""));
  try {
    if (NT.prefs.system && document.hidden && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker)
      navigator.serviceWorker.ready.then(r => r.showNotification(e.title, { body: e.body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: e.id, data: { mod: e.mod, ref: e.ref } }));
  } catch (x) {}
}
function markSeen() {
  const top = NT.list.length ? Math.max(...NT.list.map(e => e.at)) : Date.now();
  const v = Math.max(top, NT.seen); if (v <= NT.seen) return;
  NT.seen = v; notifRefresh();
  setDoc(doc(fs, "reads", ME.uid), { notifSeen: v }, { merge: true }).catch(() => {});
}
function goEvent(e) {
  closeDrawer();
  if (e.mod === "disis") { location.hash = "disis"; setTimeout(() => { if (e.ref && DT.jobs.some(j => j.id === e.ref)) openDisis(e.ref); }, 80); }
  else if (e.mod === "msg") openMsgs(e.ref || "all");
  else { VIEW = "list"; location.hash = "proje"; setTimeout(() => { render(); if (e.ref) openDrawer(e.ref); }, 80); }
}
function relTime(ts) {
  const d = Date.now() - ts; if (d < 60e3) return "az önce"; if (d < 3600e3) return Math.round(d / 60e3) + " dk önce";
  const iso = dayOf(ts); return (iso === TODAY ? "bugün " : dayLabel(iso) + " ") + hhmm(ts);
}
function paintNotifList() {
  const box = $("#ntList"); if (!box) return;
  const L = NT.list;
  box.innerHTML = L.length ? L.map((e, i) => `<button type="button" class="nti${e.at > NT.seen ? " new" : ""} k-${e.kind || "n"}" data-ni="${i}">
      <span class="ntm">${{ disis: "DIŞ İŞ", proje: "PROJE", msg: "MESAJ" }[e.mod]}</span>
      <span class="ntt">${esc(e.title)}</span>${e.body ? `<span class="ntb">${esc(e.body)}</span>` : ""}<span class="ntw">${esc(relTime(e.at))}</span></button>`).join("")
    : '<div class="empty" style="margin:0"><h3>Bildirim yok</h3><p>Son 7 gündeki size ait hareketler burada görünür.</p></div>';
  box.querySelectorAll("[data-ni]").forEach(b => b.onclick = () => goEvent(L[Number(b.dataset.ni)]));
}
function openNotif() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" id="ntPanel" role="dialog" aria-modal="true" aria-labelledby="ntT" style="width:min(460px,100%)">
    <div class="dh"><h2 id="ntT">Bildirimler</h2><button class="x" id="ntX" aria-label="Kapat">×</button></div>
    <div class="db">
      <div class="nttabs" role="tablist"><button type="button" role="tab" aria-selected="true" id="ntTab1">Son hareketler</button><button type="button" role="tab" aria-selected="false" id="ntTab2">Ayarlar</button></div>
      <div id="ntList" class="ntlist"></div>
      <div id="ntSet" hidden>
        <div class="ntset">${NT_PREFS.map(([k, l, d]) => `<label class="ntsw"><input type="checkbox" data-np="${k}"${NT.prefs[k] ? " checked" : ""}><span><b>${esc(l)}</b><small>${esc(d)}</small></span></label>`).join("")}</div>
        <div class="roles" style="margin-top:12px">${perm === "granted" ? "<div>Bu cihazda bildirim izni <b>açık</b>.</div>" : perm === "denied" ? "<div>Bu cihazda bildirimler <b>engellenmiş</b>. Tarayıcı ayarlarından site için bildirim iznini açın.</div>" : perm === "unsupported" ? "<div>Bu tarayıcı cihaz bildirimini desteklemiyor. iPhone'da uygulamayı Ana Ekrana ekleyip oradan açın.</div>" : '<div>Bu cihazda bildirim izni henüz verilmedi.</div><button class="btn" id="ntPerm" type="button" style="margin-top:8px">Bildirimlere izin ver</button>'}</div>
        <p class="note" style="margin:10px 0 0">Bildirimler uygulama açıkken gelir (başka sekmede veya arka planda olsa da). Uygulama tamamen kapalıyken gelmez; açtığınızda burada görürsünüz.</p>
      </div>
    </div>
    <div class="df"><span class="note" id="ntCount"></span><div class="r"><button class="btn ghost" id="ntAll" type="button">Tümünü okundu say</button></div></div>
  </aside>`;
  const unseen = NT.list.filter(e => e.at > NT.seen).length;
  $("#ntCount").textContent = unseen ? unseen + " yeni bildirim" : "Yeni bildirim yok";
  paintNotifList();
  $("#scrim").onclick = closeDrawer; $("#ntX").onclick = closeDrawer;
  $("#ntAll").onclick = () => { markSeen(); $("#ntCount").textContent = "Yeni bildirim yok"; };
  const tab = n => { $("#ntTab1").setAttribute("aria-selected", n === 1); $("#ntTab2").setAttribute("aria-selected", n === 2); $("#ntList").hidden = n !== 1; $("#ntSet").hidden = n !== 2; };
  $("#ntTab1").onclick = () => tab(1); $("#ntTab2").onclick = () => tab(2);
  document.querySelectorAll("[data-np]").forEach(el => el.onchange = () => {
    NT.prefs = { ...NT.prefs, [el.dataset.np]: el.checked }; notifRefresh();
    setDoc(doc(fs, "reads", ME.uid), { notifPrefs: NT.prefs }, { merge: true }).catch(() => {});
  });
  const pb = $("#ntPerm"); if (pb) pb.onclick = () => Notification.requestPermission().then(() => openNotif());
  // panel açıldığında yeni bildirimler birkaç saniye vurgulu kalır, sonra okundu sayılır
  onDrawerClose = () => markSeen();
}
on("#bellBtn", () => { if (ME) openNotif(); });
setInterval(() => { if (ME && !$("#app").hidden) notifRefresh(); }, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", ev => { const d = ev.data || {}; if (d.type === "open" && d.mod) goEvent({ mod: d.mod, ref: d.ref }); });

/* ================= Mesaj paneli (her ekrandan) ================= */
function openMsgs(peer) {
  if (!ME) return;
  closeDrawer();
  if (peer) { MSG.peer = peer; MSG.sig = ""; }
  const p = $("#msgPanel"); p.hidden = false; document.body.classList.add("noscroll");
  renderMessages();
  if (peer) { const w = $("#msgwrap"); if (w) w.classList.add("show-thread"); }
  const t = $("#thText"); if (t && innerWidth > 760) t.focus();
  markReadSoon();
}
function closeMsgs() { if (REC.mr) recStop(true); $("#msgPanel").hidden = true; document.body.classList.remove("noscroll"); }
on("#msgBtn", () => { if (msgOpen()) closeMsgs(); else openMsgs(); });
on("#msgClose", closeMsgs);
$("#msgPanel").addEventListener("click", e => { if (e.target.id === "msgPanel") closeMsgs(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !e.defaultPrevented && msgOpen() && !$("#drawerHost").innerHTML && !document.querySelector(".viewer")) closeMsgs(); });

/* ================= BİREBİR ARAMA (sesli / görüntülü, WebRTC) ================= */
// Bağlantı bilgileri calls/{id} belgesi ve calls/{id}/ice alt koleksiyonu üzerinden değiş tokuş edilir.
const CALL = { st: null, pc: null, local: null, remote: null, id: null, role: null, peer: null, peerName: "", type: "audio", unsubs: [], qIce: [], t0: 0, timer: null, ringTimer: null, ring: null, muted: false, camOff: false, facing: "user", logged: false, seenIncoming: new Set() };
const CALL_RING_MS = 40000;
const CALL_SVG = { audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/></svg>' };
const iceServers = () => [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }].concat(typeof EXTRA_ICE !== "undefined" && Array.isArray(EXTRA_ICE) ? EXTRA_ICE : []);
const callDemo = () => !!window.__CALL_DEMO;

function callUI() {
  let el = $("#callUI");
  if (!el) {
    el = document.createElement("div"); el.id = "callUI"; el.className = "callui"; el.hidden = true;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Arama");
    el.innerHTML = `<video id="cRemoteV" class="c-rv" autoplay playsinline></video><audio id="cRemoteA" autoplay></audio>
      <div class="c-top"><span class="c-av" id="cAv"></span><div class="c-nm" id="cName"></div><div class="c-st" id="cState"></div></div>
      <video id="cLocalV" class="c-lv" autoplay playsinline muted hidden></video>
      <div class="c-ctl" id="cCtl"></div>`;
    document.body.appendChild(el);
  }
  return el;
}
function callPaint() {
  const el = callUI(), s = CALL.st;
  el.hidden = !s; document.body.classList.toggle("noscroll", !!s || msgOpen());
  if (!s) return;
  el.classList.toggle("video", CALL.type === "video"); el.classList.toggle("live", s === "live");
  $("#cAv").textContent = initials(CALL.peerName || "?"); $("#cAv").style.setProperty("--c", colorOf(CALL.peerName || ""));
  $("#cName").textContent = CALL.peerName;
  const txt = { calling: (CALL.type === "video" ? "Görüntülü" : "Sesli") + " arama · çalıyor…", incoming: (CALL.type === "video" ? "Görüntülü" : "Sesli") + " arama geliyor", connecting: "Bağlanıyor…", live: fmtSec((Date.now() - CALL.t0) / 1000), ended: CALL.endTxt || "Arama bitti" }[s] || "";
  $("#cState").textContent = txt;
  const B = (id, cls, label, svg, extra = "") => `<button type="button" class="cbtn ${cls}" id="${id}" aria-label="${label}" ${extra}>${svg}<span>${label}</span></button>`;
  const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>' + (CALL.muted ? '<path d="M4 4l16 16"/>' : "") + "</svg>";
  const CAM = CALL_SVG.video.replace("</svg>", (CALL.camOff ? '<path d="M3 3l18 18"/>' : "") + "</svg>");
  const FLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h11l-3-3M20 16H9l3 3"/></svg>';
  const END = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 9c-3.3 0-6.4.9-8.9 2.6-.7.5-.9 1.4-.5 2.1l1.2 2c.4.7 1.3.9 2 .6l2.6-1.2c.5-.2.8-.8.8-1.3v-2c1.8-.5 3.8-.5 5.6 0v2c0 .5.3 1.1.8 1.3l2.6 1.2c.7.3 1.6.1 2-.6l1.2-2c.4-.7.2-1.6-.5-2.1C18.4 9.9 15.3 9 12 9z"/></svg>';
  let h = "";
  if (s === "incoming") h = B("cRej", "red", "Reddet", END) + B("cAcc", "green", "Aç", CALL.type === "video" ? CALL_SVG.video : CALL_SVG.audio);
  else if (s === "ended") h = "";
  else h = B("cMute", CALL.muted ? "on" : "", CALL.muted ? "Mikrofon kapalı" : "Mikrofon", MIC)
    + (CALL.type === "video" ? B("cCam", CALL.camOff ? "on" : "", CALL.camOff ? "Kamera kapalı" : "Kamera", CAM) + B("cFlip", "", "Çevir", FLIP) : "")
    + B("cEnd", "red", "Kapat", END);
  $("#cCtl").innerHTML = h;
  const on2 = (id, fn) => { const b = $("#" + id); if (b) b.onclick = fn; };
  on2("cAcc", acceptCall); on2("cRej", () => endCall("rejected")); on2("cEnd", () => endCall("ended"));
  on2("cMute", () => { CALL.muted = !CALL.muted; CALL.local && CALL.local.getAudioTracks().forEach(t => t.enabled = !CALL.muted); callPaint(); });
  on2("cCam", () => { CALL.camOff = !CALL.camOff; CALL.local && CALL.local.getVideoTracks().forEach(t => t.enabled = !CALL.camOff); callPaint(); });
  on2("cFlip", flipCam);
  const lv = $("#cLocalV"); lv.hidden = !(CALL.type === "video" && CALL.local && !CALL.camOff);
  if (CALL.local && lv.srcObject !== CALL.local) lv.srcObject = CALL.local;
}
function callTimerStart() { clearInterval(CALL.timer); CALL.timer = setInterval(() => { if (CALL.st === "live") $("#cState").textContent = fmtSec((Date.now() - CALL.t0) / 1000); }, 1000); }
function ringTone(on) {
  try {
    if (!on) { if (CALL.ring) { clearInterval(CALL.ring.iv); CALL.ring.ctx.close(); } CALL.ring = null; return; }
    if (CALL.ring) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = CALL.role === "callee" ? 660 : 440; g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9); o.stop(ctx.currentTime + 1); };
    beep(); CALL.ring = { ctx, iv: setInterval(beep, CALL.role === "callee" ? 1600 : 3000) };
  } catch (e) {}
}
async function getMedia(type) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Bu tarayıcı arama desteklemiyor.");
  try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: type === "video" ? { facingMode: CALL.facing, width: { ideal: 640 }, height: { ideal: 480 } } : false }); }
  catch (e) { throw new Error(type === "video" ? "Kamera / mikrofon izni verilmedi. Tarayıcı ayarlarından bu site için izin verin." : "Mikrofon izni verilmedi. Tarayıcı ayarlarından bu site için izin verin."); }
}
function makePC(side) {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  pc.onicecandidate = e => { if (e.candidate && CALL.id) addDoc(collection(fs, `calls/${CALL.id}/ice`), { side, c: e.candidate.toJSON(), at: Date.now() }).catch(() => {}); };
  pc.ontrack = e => {
    const st = e.streams[0] || new MediaStream([e.track]); CALL.remote = st;
    const a = $("#cRemoteA"), v = $("#cRemoteV");
    if (CALL.type === "video") { v.srcObject = st; v.play && v.play().catch(() => {}); a.srcObject = null; } else { a.srcObject = st; a.play && a.play().catch(() => {}); }
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === "connected" && CALL.st !== "live") { CALL.st = "live"; CALL.t0 = Date.now(); ringTone(false); callPaint(); callTimerStart(); }
    else if (s === "disconnected" && CALL.st === "live") $("#cState").textContent = "Bağlantı zayıf…";
    else if (s === "failed") { CALL.endTxt = "Bağlantı kurulamadı. Ağ, doğrudan bağlantıya izin vermiyor olabilir."; endCall("ended", true); }
  };
  return pc;
}
function listenIce(otherSide) {
  CALL.unsubs.push(onSnapshot(query(collection(fs, `calls/${CALL.id}/ice`), where("side", "==", otherSide)), s => {
    s.docChanges().forEach(ch => { if (ch.type !== "added") return; const c = ch.doc.data().c;
      if (CALL.pc && CALL.pc.remoteDescription) CALL.pc.addIceCandidate(c).catch(() => {}); else CALL.qIce.push(c); });
  }, () => {}));
}
const flushIce = () => { const q = CALL.qIce.splice(0); q.forEach(c => CALL.pc.addIceCandidate(c).catch(() => {})); };

async function startCall(peer, type) {
  if (!can("p.msg")) { toast("Arama yapma yetkiniz yok."); return; }
  if (CALL.st) { toast("Zaten bir aramadasınız."); return; }
  peer = lower(peer);
  Object.assign(CALL, { st: "calling", role: "caller", peer, peerName: nameOf(peer), type, muted: false, camOff: false, logged: false, qIce: [], endTxt: "" });
  callPaint(); ringTone(true);
  if (callDemo()) { CALL.id = "demo"; CALL.ringTimer = setTimeout(() => { CALL.st = "live"; CALL.t0 = Date.now(); ringTone(false); callPaint(); callTimerStart(); }, 2500); return; }
  try {
    CALL.local = await getMedia(type); callPaint();
    const ref = doc(collection(fs, "calls")); CALL.id = ref.id;
    CALL.pc = makePC("from");
    CALL.local.getTracks().forEach(t => CALL.pc.addTrack(t, CALL.local));
    const offer = await CALL.pc.createOffer(); await CALL.pc.setLocalDescription(offer);
    const now = Date.now();
    await setDoc(ref, { from: ME.email, fromName: ME.name, to: peer, toName: CALL.peerName, participants: [ME.email, peer], type, status: "ringing", offer: { type: offer.type, sdp: offer.sdp }, createdAt: now, updatedAt: now });
    CALL.unsubs.push(onSnapshot(ref, async s => {
      if (!s.exists() || !CALL.pc) return; const d = s.data();
      if (d.answer && !CALL.pc.currentRemoteDescription) { CALL.st = "connecting"; ringTone(false); callPaint(); await CALL.pc.setRemoteDescription(d.answer); flushIce(); }
      if (d.status === "rejected") { CALL.endTxt = CALL.peerName + " aramayı reddetti"; endCall(null, true, "rejected"); }
      else if (d.status === "busy") { CALL.endTxt = CALL.peerName + " başka bir aramada"; endCall(null, true, "busy"); }
      else if (d.status === "ended" && d.endedBy !== ME.email) { CALL.endTxt = "Arama bitti"; endCall(null, true); }
    }, () => {}));
    listenIce("to");
    CALL.ringTimer = setTimeout(() => { if (CALL.st === "calling") { CALL.endTxt = "Cevap yok"; endCall("missed"); } }, CALL_RING_MS);
  } catch (e) { CALL.endTxt = e.message || "Arama başlatılamadı"; toast(CALL.endTxt); endCall(null, true); }
}
function startIncoming() {
  dataUnsubs.push(onSnapshot(query(collection(fs, "calls"), where("to", "==", ME.email)), s => {
    s.docChanges().forEach(ch => {
      const d = { id: ch.doc.id, ...ch.doc.data() };
      if (CALL.id === d.id && CALL.role === "callee" && CALL.st === "incoming" && d.status !== "ringing") { CALL.endTxt = d.status === "missed" ? "Cevapsız arama" : "Arayan kapattı"; endCall(null, true); return; }
      if (d.status !== "ringing" || CALL.seenIncoming.has(d.id) || Date.now() - (d.createdAt || 0) > CALL_RING_MS + 5000) return;
      CALL.seenIncoming.add(d.id);
      if (CALL.st) { updateDoc(doc(fs, "calls", d.id), { status: "busy", updatedAt: Date.now() }).catch(() => {}); return; }
      showIncoming(d);
    });
  }, () => {}));
}
function showIncoming(d) {
  Object.assign(CALL, { st: "incoming", role: "callee", id: d.id, call: d, peer: lower(d.from), peerName: d.fromName || nameOf(d.from), type: d.type || "audio", muted: false, camOff: false, logged: false, qIce: [], endTxt: "" });
  callPaint(); ringTone(true);
  try { if (document.hidden && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker)
    navigator.serviceWorker.ready.then(r => r.showNotification("Gelen arama · " + CALL.peerName, { body: (CALL.type === "video" ? "Görüntülü" : "Sesli") + " arama. Açmak için dokunun.", icon: "icons/icon-192.png", tag: "call-" + d.id, requireInteraction: true, data: { mod: "call" } })); } catch (e) {}
  clearTimeout(CALL.ringTimer); CALL.ringTimer = setTimeout(() => { if (CALL.st === "incoming" && CALL.id === d.id) { CALL.endTxt = "Cevapsız arama"; endCall(null, true); } }, CALL_RING_MS + 2000);
}
async function acceptCall() {
  ringTone(false); CALL.st = "connecting"; callPaint();
  if (callDemo()) { setTimeout(() => { CALL.st = "live"; CALL.t0 = Date.now(); callPaint(); callTimerStart(); }, 1200); return; }
  try {
    CALL.local = await getMedia(CALL.type); callPaint();
    CALL.pc = makePC("to");
    CALL.local.getTracks().forEach(t => CALL.pc.addTrack(t, CALL.local));
    await CALL.pc.setRemoteDescription(CALL.call.offer);
    const ans = await CALL.pc.createAnswer(); await CALL.pc.setLocalDescription(ans);
    await updateDoc(doc(fs, "calls", CALL.id), { answer: { type: ans.type, sdp: ans.sdp }, status: "accepted", acceptedAt: Date.now(), updatedAt: Date.now() });
    listenIce("from"); flushIce();
    CALL.unsubs.push(onSnapshot(doc(fs, "calls", CALL.id), s => { const d = s.exists() ? s.data() : null; if (d && d.status === "ended" && d.endedBy !== ME.email) { CALL.endTxt = "Arama bitti"; endCall(null, true); } }, () => {}));
  } catch (e) { toast(e.message || "Arama açılamadı"); endCall("rejected"); }
}
async function flipCam() {
  if (!CALL.local || CALL.type !== "video") return;
  CALL.facing = CALL.facing === "user" ? "environment" : "user";
  try {
    const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CALL.facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    const nt = ns.getVideoTracks()[0], old = CALL.local.getVideoTracks()[0];
    const snd = CALL.pc && CALL.pc.getSenders().find(x => x.track && x.track.kind === "video"); if (snd) await snd.replaceTrack(nt);
    if (old) { CALL.local.removeTrack(old); old.stop(); } CALL.local.addTrack(nt); nt.enabled = !CALL.camOff;
    $("#cLocalV").srcObject = CALL.local;
  } catch (e) { toast("Kamera değiştirilemedi"); }
}
// status: veritabanına yazılacak durum (null: yazma) · local: yalnızca bu cihazı kapat
async function endCall(status, local, why) {
  const wasLive = CALL.st === "live", dur = wasLive ? Math.round((Date.now() - CALL.t0) / 1000) : 0;
  const id = CALL.id, role = CALL.role, peer = CALL.peer, type = CALL.type, logged = CALL.logged;
  if (!CALL.st) return;
  CALL.logged = true;
  ringTone(false); clearTimeout(CALL.ringTimer); clearInterval(CALL.timer);
  CALL.unsubs.forEach(u => { try { u(); } catch (e) {} }); CALL.unsubs = [];
  try { CALL.pc && CALL.pc.close(); } catch (e) {}
  try { CALL.local && CALL.local.getTracks().forEach(t => t.stop()); } catch (e) {}
  CALL.pc = null; CALL.local = null; CALL.remote = null;
  if (status && id && !callDemo()) updateDoc(doc(fs, "calls", id), { status, endedBy: ME.email, endedAt: Date.now(), updatedAt: Date.now(), dur }).catch(() => {});
  // arama kaydını mesaj olarak yalnızca arayan yazar
  if (role === "caller" && !logged && peer && can("p.msg")) {
    const st = wasLive ? "answered" : (why || status || "missed");
    sendMsg(peer, "", null, { type, dur, st }).catch(() => {});
  }
  CALL.st = "ended"; callPaint();
  setTimeout(() => { if (CALL.st === "ended") { CALL.st = null; CALL.id = null; CALL.role = null; callPaint(); const v = $("#cRemoteV"); if (v) v.srcObject = null; const a = $("#cRemoteA"); if (a) a.srcObject = null; } }, wasLive ? 1500 : 2200);
}
addEventListener("beforeunload", () => { if (CALL.st && CALL.id && !callDemo()) updateDoc(doc(fs, "calls", CALL.id), { status: CALL.st === "incoming" ? "rejected" : "ended", endedBy: ME && ME.email, updatedAt: Date.now() }).catch(() => {}); });

/* ================= PERSONEL TAKİP ================= */
// Durumlar: kod, ad, kısa harf. Renkler styles.css içindeki --k-<kod> değişkenlerinden gelir.
const PK = [
  ["fabrikada", "Fabrikada", "F"], ["gec", "Geç geldi", "G"], ["izinsiz", "İzinsiz gelmedi", "X"],
  ["gunluk", "Günlük izinli", "İ"], ["yillik", "Yıllık izinli", "Y"], ["rapor", "Raporlu", "R"], ["ucretsiz", "Ücretsiz izinli", "Ü"]
];
const PKS = Object.fromEntries(PK.map(([id, l, k]) => [id, { id, l, k, c: `var(--k-${id})` }]));
const IZ_TUR = ["gunluk", "yillik", "rapor", "ucretsiz"];
const DAYS_S = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const IZ_L = { gunluk: "Günlük izin", yillik: "Yıllık izin", rapor: "Sağlık raporu", ucretsiz: "Ücretsiz izin" };
const PK_SEBEP = ["Hastalık", "Ailevi mazeret", "Ulaşım sorunu", "Okulda", "Resmi işlem / mahkeme", "Doktor randevusu", "Cenaze", "Düğün / nişan", "Askerlik işlemi", "Habersiz gelmedi", "Diğer"];
// Sebep alanının altındaki hızlı seçim düğmeleri
const PK_SEBQ = ["Hastalık", "Ailevi mazeret", "Ulaşım sorunu", "Okulda", "Resmi işlem / mahkeme", "Habersiz gelmedi", "Diğer"];
const sebQ = (id, dis) => dis ? "" : `<div class="sebq" data-for="${id}">${PK_SEBQ.map(x => `<button type="button" data-seb="${esc(x)}">${esc(x)}</button>`).join("")}</div>`;
function bindSebQ() {
  document.querySelectorAll(".sebq").forEach(w => {
    const inp = $("#" + w.dataset.for); if (!inp) return;
    const mark = () => w.querySelectorAll("[data-seb]").forEach(b => b.classList.toggle("on", inp.value === b.dataset.seb || (b.dataset.seb === "Diğer" && inp.value.startsWith("Diğer"))));
    w.querySelectorAll("[data-seb]").forEach(b => b.onclick = () => {
      if (b.dataset.seb === "Diğer") { inp.value = "Diğer: "; inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} }
      else inp.value = b.dataset.seb;
      mark();
    });
    inp.addEventListener("input", mark); mark();
  });
}
const PT = { people: [], ozel: {}, izin: [], yok: {}, cfg: { mesai: "08:00", tolerans: 5, cumartesi: true }, ready: false, subs: {},
  view: "gun", date: null, month: null, F: { dep: "", st: "", q: "", ayr: false }, IF: { when: "aktif", tur: "", pid: "" } };
const ayOf = iso => String(iso || "").slice(0, 7);
const prevAy = ay => { let [y, m] = ay.split("-").map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const nextAy = ay => { let [y, m] = ay.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
const isoOf = n => new Date(n * 864e5).toISOString().slice(0, 10);
const addDays = (iso, k) => isoOf(dnum(iso) + k);
const wdOf = iso => new Date(dnum(iso) * 864e5).getUTCDay();
const pkWork = iso => { const w = wdOf(iso); return w !== 0 && (w !== 6 || PT.cfg.cumartesi); };
const hm2m = s => { if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null; const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const nowHM = () => { const n = istNow(); return String(n.h).padStart(2, "0") + ":" + String(n.m).padStart(2, "0"); };
const pkLateMin = saat => { const a = hm2m(saat), b = hm2m(PT.cfg.mesai); return a == null || b == null ? null : a - b; };
// Kişi o gün kadroda mı (işe girişten önce ve ayrılış tarihinden sonra değil)
const pkActiveOn = (p, iso) => (!p.iseGiris || p.iseGiris <= iso) && (p.aktif !== false || (!!p.ayrilis && p.ayrilis >= iso));
const pkDeps = () => sortTr(PT.people.map(p => p.departman));
const pkIzinOn = (pid, iso) => PT.izin.find(z => z.pid === pid && z.bas <= iso && (z.bit || z.bas) >= iso) || null;
// Bir kişinin belirli gündeki durumu: elle girilen yoklama > izin kaydı > tatil > işaretlenmedi
function pkEff(p, iso) {
  const e = (PT.yok[iso] || {})[p.id];
  if (e && PKS[e.d]) return { ...e, src: "yok" };
  const z = pkIzinOn(p.id, iso);
  if (z && pkWork(iso)) return { d: z.tur, sebep: z.sebep || "", saat: "", src: "izin", izin: z };
  if (!pkWork(iso)) return { d: "tatil", src: "tatil" };
  return { d: "", src: "" };
}
function pkWorkDays(bas, bit) { if (!bas) return 0; const a = dnum(bas), b = dnum(bit || bas); let n = 0; for (let d = a; d <= b && d - a < 400; d++) if (pkWork(isoOf(d))) n++; return n; }
// Yıllık izin hakkı: elle girilmişse o, yoksa işe giriş tarihine göre (İş Kanunu 53: 1–5 yıl 14, 5–15 yıl 20, 15+ yıl 26 gün)
function pkHak(p) {
  if (p.yillikHak != null && p.yillikHak !== "") return Number(p.yillikHak);
  if (!p.iseGiris) return null;
  const y = (dnum(TODAY) - dnum(p.iseGiris)) / 365.25;
  return y < 1 ? 0 : y < 5 ? 14 : y < 15 ? 20 : 26;
}
const pkUsed = (pid, yil) => PT.izin.filter(z => z.pid === pid && z.tur === "yillik" && String(z.bas).slice(0, 4) === String(yil)).reduce((s, z) => s + (Number(z.gun) || pkWorkDays(z.bas, z.bit)), 0);
function pkMonthStats(p, ay) {
  const r = { geldi: 0, gec: 0, izinsiz: 0, izin: 0, rapor: 0, gecDk: 0, isgunu: 0 };
  const [y, m] = ay.split("-").map(Number), N = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= N; d++) {
    const iso = `${ay}-${String(d).padStart(2, "0")}`; if (iso > TODAY || !pkActiveOn(p, iso)) continue;
    const e = pkEff(p, iso); if (e.d !== "tatil") r.isgunu++;
    if (e.d === "fabrikada" || e.d === "gec") r.geldi++;
    if (e.d === "gec") { r.gec++; r.gecDk += Math.max(0, pkLateMin(e.saat) || 0); }
    if (e.d === "izinsiz") r.izinsiz++;
    if (e.d === "gunluk" || e.d === "yillik" || e.d === "ucretsiz") r.izin++;
    if (e.d === "rapor") r.rapor++;
  }
  return r;
}
const pkPill = (d, extra = "") => d && PKS[d] ? `<span class="kst" style="--tc:${PKS[d].c}">${esc(PKS[d].l)}${extra}</span>` : d === "tatil" ? '<span class="kst off">Hafta tatili</span>' : '<span class="kst none">İşaretlenmedi</span>';
const pkOut = p => (typeof DT !== "undefined" ? DT.jobs : []).find(j => j.personel === p.ad && diIsOut(j)) || null;

function startPersonel() {
  PT.ready = false; let a = false, b = false;
  const done = () => { PT.ready = a && b; pkChanged(); };
  dataUnsubs.push(onSnapshot(collection(fs, "personel"), s => { PT.people = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => (x.ad || "").localeCompare(y.ad || "", "tr")); a = true; done(); },
    e => { a = true; done(); toast("Personel listesi okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(collection(fs, "izinler"), s => { PT.izin = s.docs.map(d => ({ id: d.id, ...d.data() })); b = true; done(); },
    e => { b = true; done(); toast("İzinler okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(doc(fs, "config", "personel"), s => {
    const d = s.exists() ? s.data() : {};
    PT.cfg = { mesai: d.mesai || "08:00", tolerans: Number.isFinite(d.tolerans) ? d.tolerans : 5, cumartesi: d.cumartesi !== false }; pkChanged();
  }, () => {}));
  PT.ozel = {};
  if (can("k.ozel")) dataUnsubs.push(onSnapshot(collection(fs, "personel_ozel"), s => { PT.ozel = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); pkChanged(); }, () => {}));
  PT.subs = {}; PT.yok = {};
  dataUnsubs.push(() => { Object.values(PT.subs).forEach(u => { try { u(); } catch (e) {} }); PT.subs = {}; });
  pkWatch();
}
// Yoklama belgeleri gün başına bir belge (yoklama/YYYY-AA-GG); yalnızca gereken aylar dinlenir
function pkWatch() {
  if (!ME || lvl("personel") === "none") return;
  const need = new Set([ayOf(TODAY), prevAy(ayOf(TODAY)), ayOf(PT.date || TODAY), PT.month || ayOf(TODAY)]);
  for (const ay of Object.keys(PT.subs)) if (!need.has(ay)) { try { PT.subs[ay](); } catch (e) {} delete PT.subs[ay]; }
  for (const ay of need) if (!PT.subs[ay]) PT.subs[ay] = onSnapshot(query(collection(fs, "yoklama"), where("ay", "==", ay)), s => {
    Object.keys(PT.yok).forEach(k => { if (k.startsWith(ay)) delete PT.yok[k]; });
    s.docs.forEach(d => { const k = (d.data() || {}).k || {}; PT.yok[d.id] = Object.fromEntries(Object.entries(k).filter(([, v]) => v && v.d)); });
    pkChanged();
  }, e => toast("Yoklama okunamadı: " + (e.code || e.message)));
}
function pkChanged() { if ($("#app").hidden) return; renderHome(); if (ROUTE === "personel") renderPersonel(); }

async function pkSet(pid, iso, e) {
  const val = e ? { d: e.d, saat: e.saat || "", cikis: e.cikis || "", sebep: (e.sebep || "").trim().slice(0, 200), not: (e.not || "").trim().slice(0, 500), by: ME.name, at: Date.now() } : null;
  await setDoc(doc(fs, "yoklama", iso), { ay: ayOf(iso), k: { [pid]: val }, updatedAt: Date.now(), updatedBy: ME.name }, { merge: true });
}

function personelTile(m) {
  const P = PT.people.filter(p => pkActiveOn(p, TODAY)), c = { in: 0, gec: 0, izinsiz: 0, izin: 0, bos: 0 };
  P.forEach(p => { const d = pkEff(p, TODAY).d; if (d === "fabrikada" || d === "gec") c.in++; if (d === "gec") c.gec++; if (d === "izinsiz") c.izinsiz++; if (["gunluk", "yillik", "rapor", "ucretsiz"].includes(d)) c.izin++; if (!d) c.bos++; });
  const pct = P.length ? Math.round((P.length - c.bos) / P.length * 100) : 0;
  return `<a class="tile on" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <svg class="wave" viewBox="0 0 180 120" aria-hidden="true"><path d="M0 70 C40 40 80 100 180 50 L180 120 L0 120Z" fill="#fff"/></svg>
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">${lvl(m.id) === "view" ? "GÖZLEMCİ" : "AKTİF"}</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>
        <div class="meter" title="Bugün yoklaması girilen ${P.length - c.bos}/${P.length}"><i style="width:${pct}%"></i></div>
        <div class="stats"><span>${c.in}/${P.length} fabrikada</span>${c.gec ? `<span>${c.gec} geç</span>` : ""}${c.izinsiz ? `<span class="alert">${c.izinsiz} gelmedi</span>` : ""}${c.izin ? `<span>${c.izin} izinli</span>` : ""}${c.bos && P.length ? `<span>${c.bos} işaretlenmedi</span>` : ""}</div>
      </div></a>`;
}

/* --- ekran --- */
function renderPersonel() {
  if (!ME || $("#modPersonel").hidden) return;
  if (!PT.date) PT.date = TODAY; if (!PT.month) PT.month = ayOf(TODAY);
  const iso = PT.view === "gun" ? PT.date : TODAY;
  const P = PT.people.filter(p => pkActiveOn(p, iso)), c = {};
  P.forEach(p => { const d = pkEff(p, iso).d || "bos"; c[d] = (c[d] || 0) + 1; });
  const inn = (c.fabrikada || 0) + (c.gec || 0), izn = (c.gunluk || 0) + (c.yillik || 0) + (c.rapor || 0) + (c.ucretsiz || 0), work = P.length - (c.tatil || 0);
  const dl = iso === TODAY ? "Bugün" : fmtS(iso);
  $("#pkKpis").innerHTML = [
    ["Fabrikada", inn + " / " + work, work ? `${dl} · devam %${Math.round(inn / work * 100)}` : dl, inn && inn === work ? "ok" : ""],
    ["Geç geldi", c.gec || 0, `Mesai ${PT.cfg.mesai} · tolerans ${PT.cfg.tolerans} dk`, ""],
    ["İzinsiz gelmedi", c.izinsiz || 0, c.izinsiz ? "Sebep girilmesi gerekir" : "Habersiz devamsızlık yok", c.izinsiz ? "bad" : ""],
    ["İzinli / raporlu", izn, [c.yillik ? c.yillik + " yıllık" : "", c.gunluk ? c.gunluk + " günlük" : "", c.rapor ? c.rapor + " rapor" : "", c.ucretsiz ? c.ucretsiz + " ücretsiz" : ""].filter(Boolean).join(" · ") || "İzinde kimse yok", ""],
    ["İşaretlenmedi", c.bos || 0, `Kadro ${P.length} kişi`, ""]
  ].map(([k, v, s, cl]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${cl}">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join("");
  document.querySelectorAll("#pkTabs [data-pv]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.pv === PT.view ? "true" : "false"); b.onclick = () => { PT.view = b.dataset.pv; closeDrawer(); renderPersonel(); }; });
  const add = $("#pkAdd");
  const addL = { gun: can("k.izin") ? "+ İzin gir" : "", izin: can("k.izin") ? "+ İzin gir" : "", ay: "", liste: can("k.list") ? "+ Personel ekle" : "" }[PT.view];
  add.hidden = !addL; add.textContent = addL; add.onclick = () => PT.view === "liste" ? pkOpenPerson(null) : pkOpenIzin(null, {});
  $("#pkCfgBtn").hidden = !can("k.list"); $("#pkCfgBtn").onclick = pkOpenCfg;
  const v = $("#pkView");
  if (!PT.ready) { v.innerHTML = '<div class="empty"><h3>Personel bilgileri yükleniyor</h3><p>Veritabanına bağlanılıyor.</p></div>'; return; }
  if (!PT.people.length) {
    v.innerHTML = `<div class="empty"><h3>Personel listesi boş</h3><p>Önce personel listesini oluşturun: ad soyad, departman, iş tanımı ve iletişim bilgileri. Ardından her gün kimin fabrikada, geç, izinli ya da gelmemiş olduğunu tek dokunuşla işaretleyin.</p>${can("k.list") ? '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="pkE1" type="button">+ Personel ekle</button><button class="btn ghost" id="pkE2" type="button">Listeden toplu ekle</button></div>' : '<p class="note">Personel listesini yetkili kişi oluşturacak.</p>'}</div>`;
    const b1 = $("#pkE1"); if (b1) { b1.onclick = () => pkOpenPerson(null); $("#pkE2").onclick = pkOpenBulk; } return;
  }
  ({ gun: pkDayView, izin: pkIzinView, ay: pkMonthView, liste: pkListView })[PT.view](v);
}
function pkFiltBar(extra = "") {
  return `<select class="f${PT.F.dep ? " on" : ""}" id="pkDep" aria-label="Departman"><option value="">Tüm departmanlar</option>${pkDeps().map(d => opt(d, d, PT.F.dep)).join("")}</select>
    <input class="f" id="pkQ" type="search" placeholder="Personel ara…" aria-label="Personel ara" value="${esc(PT.F.q)}">${extra}`;
}
function pkBindFilt(redraw) {
  const d = $("#pkDep"); if (d) d.onchange = () => { PT.F.dep = d.value; renderPersonel(); };
  const q = $("#pkQ"); if (q) q.oninput = () => { PT.F.q = q.value; redraw(); };
}
const pkMatch = p => (!PT.F.dep || p.departman === PT.F.dep) && (!PT.F.q.trim() || [p.ad, p.departman, p.gorev].join(" ").toLocaleLowerCase("tr").includes(PT.F.q.trim().toLocaleLowerCase("tr")));

/* Günlük yoklama */
function pkDayView(v) {
  const iso = PT.date, P = PT.people.filter(p => pkActiveOn(p, iso) && pkMatch(p));
  const cnt = {}; P.forEach(p => { const d = pkEff(p, iso).d || "bos"; cnt[d] = (cnt[d] || 0) + 1; });
  const bos = P.filter(p => !pkEff(p, iso).d);
  const chips = [...PK.map(([id, l]) => [id, l, PKS[id].c]), ["bos", "İşaretlenmedi", "var(--ink-3)"]].map(([id, l, cc]) =>
    `<button type="button" class="kchip${PT.F.st === id ? " on" : ""}" data-kst="${id}" style="--tc:${cc}"${cnt[id] ? "" : " data-zero"}><b class="num">${cnt[id] || 0}</b>${esc(l)}</button>`).join("");
  v.innerHTML = `<div class="pkbar">
      <div class="pkdate"><button type="button" class="btn ghost sm" data-dd="-1" aria-label="Önceki gün">‹</button><input type="date" class="f" id="pkDate" value="${iso}" max="${addDays(TODAY, 60)}" aria-label="Tarih"><button type="button" class="btn ghost sm" data-dd="1" aria-label="Sonraki gün">›</button>${iso !== TODAY ? '<button type="button" class="btn ghost sm" id="pkToday">Bugün</button>' : ""}<span class="pkwd">${DAYS_L[wdOf(iso)]}${pkWork(iso) ? "" : " · hafta tatili"}</span></div>
      <div class="filters">${pkFiltBar()}${can("k.yoklama") && bos.length && pkWork(iso) && iso <= TODAY ? `<button type="button" class="btn sm okb" id="pkAll">✓ Kalan ${bos.length} kişiyi fabrikada işaretle</button>` : ""}</div>
    </div>
    <div class="kchips" role="group" aria-label="Duruma göre süz">${chips}</div>
    <div id="pkList"></div>
    <p class="note" style="margin:-18px 0 28px">İzin kayıtları ilgili günlere kendiliğinden işlenir. Satıra tıklayınca saat, sebep ve not girilir. ${can("k.yoklama") ? "Gelmeyen ya da geç gelen için sebep girmeyi unutmayın." : ""}</p>`;
  const draw = () => {
    const rows = PT.people.filter(p => pkActiveOn(p, iso) && pkMatch(p)).map(p => ({ p, e: pkEff(p, iso) }))
      .filter(r => !PT.F.st || (PT.F.st === "bos" ? !r.e.d : r.e.d === PT.F.st))
      .sort((a, b) => (a.p.departman || "").localeCompare(b.p.departman || "", "tr") || (a.p.ad || "").localeCompare(b.p.ad || "", "tr"));
    const ed = can("k.yoklama");
    let lastDep = null;
    $("#pkList").innerHTML = `<div class="ledger pled" role="table">${rows.length ? rows.map(({ p, e }) => {
      const dep = p.departman || "Departmansız", sep = dep !== lastDep ? `<div class="pdep">${esc(dep)}</div>` : ""; lastDep = dep;
      const lm = e.d === "gec" ? pkLateMin(e.saat) : null, out = iso === TODAY ? pkOut(p) : null;
      const det = [e.saat ? `<span class="num">${esc(e.saat)}</span>${lm > 0 ? ` <b class="late">+${lm} dk</b>` : ""}` : "", e.cikis ? `erken çıkış <span class="num">${esc(e.cikis)}</span>` : "", e.sebep ? esc(e.sebep) : "", e.src === "izin" ? `<span class="izsrc">${esc(IZ_L[e.izin.tur])} · ${fmtS(e.izin.bas)}${e.izin.bit && e.izin.bit !== e.izin.bas ? "–" + fmtS(e.izin.bit) : ""}</span>` : ""].filter(Boolean).join(" · ");
      const q = ed && iso <= TODAY && e.d !== "tatil" ? `<div class="pq">
          <button type="button" class="qb ok${e.d === "fabrikada" ? " on" : ""}" data-qk="fabrikada" data-pid="${esc(p.id)}" title="Fabrikada">✓<span> Geldi</span></button>
          <button type="button" class="qb wa${e.d === "gec" ? " on" : ""}" data-qk="gec" data-pid="${esc(p.id)}" title="Geç geldi">Geç</button>
          <button type="button" class="qb ba${e.d === "izinsiz" ? " on" : ""}" data-qk="izinsiz" data-pid="${esc(p.id)}" title="İzinsiz gelmedi">Gelmedi</button>
          <button type="button" class="qb mo" data-qk="" data-pid="${esc(p.id)}" title="İzin ve diğer durumlar">İzin…</button></div>` : '<div class="pq"></div>';
      return `${sep}<div class="row prow" role="row" tabindex="0" data-pk="${esc(p.id)}" style="--stripe:${e.d && PKS[e.d] ? PKS[e.d].c : "transparent"}">
        <div class="pp">${avatar(p.ad)}<div class="sub">${esc(p.gorev || "")}${out ? ` <span class="ttag" style="--tc:var(--brand)">Dış işte #${esc(out.no)}</span>` : ""}</div></div>
        <div class="pst">${pkPill(e.d)}${det ? `<div class="pdet">${det}</div>` : ""}${e.not ? `<div class="pnot">${esc(e.not)}</div>` : ""}</div>
        ${q}</div>`;
    }).join("") : `<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Bu filtrelere uyan personel yok.</div>`}</div>`;
    $("#pkList").querySelectorAll("[data-pk]").forEach(el => { const go = () => pkOpenEntry(el.dataset.pk, iso, null); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
    $("#pkList").querySelectorAll("[data-qk]").forEach(b => b.onclick = async ev => {
      ev.stopPropagation(); const k = b.dataset.qk, pid = b.dataset.pid;
      if (k === "fabrikada") { b.disabled = true; try { await pkSet(pid, iso, { d: "fabrikada" }); } catch (x) { toast(writeErr(x)); b.disabled = false; } return; }
      pkOpenEntry(pid, iso, k || "gunluk");
    });
  };
  draw();
  pkBindFilt(draw);
  v.querySelectorAll("[data-dd]").forEach(b => b.onclick = () => { PT.date = addDays(PT.date, Number(b.dataset.dd)); pkWatch(); renderPersonel(); });
  $("#pkDate").onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { PT.date = e.target.value; pkWatch(); renderPersonel(); } };
  const td = $("#pkToday"); if (td) td.onclick = () => { PT.date = TODAY; pkWatch(); renderPersonel(); };
  v.querySelectorAll("[data-kst]").forEach(b => b.onclick = () => { PT.F.st = PT.F.st === b.dataset.kst ? "" : b.dataset.kst; renderPersonel(); });
  const all = $("#pkAll"); if (all) all.onclick = async () => {
    const ids = PT.people.filter(p => pkActiveOn(p, iso) && pkMatch(p) && !pkEff(p, iso).d).map(p => p.id); if (!ids.length) return;
    all.disabled = true; const at = Date.now();
    try { await setDoc(doc(fs, "yoklama", iso), { ay: ayOf(iso), k: Object.fromEntries(ids.map(id => [id, { d: "fabrikada", saat: "", cikis: "", sebep: "", not: "", by: ME.name, at }])), updatedAt: at, updatedBy: ME.name }, { merge: true }); toast(ids.length + " kişi fabrikada olarak işaretlendi"); }
    catch (x) { all.disabled = false; toast(writeErr(x)); }
  };
}

/* Yoklama girişi (bir kişi, bir gün) */
function pkOpenEntry(pid, iso, preset) {
  const p = PT.people.find(x => x.id === pid); if (!p) return;
  const e = pkEff(p, iso), ed = can("k.yoklama") && e.d !== "tatil", izOk = can("k.izin");
  let d = preset || (e.d === "tatil" ? "" : e.d) || "";
  const st = pkMonthStats(p, ayOf(TODAY)), hak = pkHak(p), used = pkUsed(p.id, TODAY.slice(0, 4));
  const z = e.src === "izin" ? e.izin : null;
  const paint = () => {
    const izin = IZ_TUR.includes(d), lm = pkLateMin($("#eSaat") ? $("#eSaat").value : e.saat);
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="eT" style="width:min(560px,100%)">
      <div class="dh"><h2 id="eT">${esc(p.ad)}</h2><button class="x" id="eX" aria-label="Kapat">×</button></div>
      <div class="db">
        <div class="pkhead"><span>${fmtS(iso)} ${DAYS_L[wdOf(iso)]}</span><span>${esc([p.departman, p.gorev].filter(Boolean).join(" · "))}</span></div>
        ${e.d === "tatil" ? '<p class="note" style="margin:0">Bu gün hafta tatili. Çalışma günü ayarı <b>Ayarlar</b> bölümündedir.</p>' : ""}
        <div class="kopts" role="radiogroup" aria-label="Durum">${PK.map(([id, l]) => `<button type="button" role="radio" aria-checked="${d === id}" class="kopt${d === id ? " on" : ""}" data-kd="${id}" style="--tc:${PKS[id].c}"${ed ? "" : " disabled"}><i></i>${esc(l)}</button>`).join("")}</div>
        ${z ? `<div class="izbox" style="--tc:${PKS[z.tur].c}"><b>${esc(IZ_L[z.tur])}</b> ${fmtS(z.bas)}${z.bit && z.bit !== z.bas ? " – " + fmtS(z.bit) : ""} · ${z.gun || pkWorkDays(z.bas, z.bit)} iş günü${z.sebep ? " · " + esc(z.sebep) : ""}${izOk ? ` <button type="button" class="linkbtn" id="eIz">İzni düzenle</button>` : ""}</div>` : ""}
        <div class="fgrid">
          ${d === "fabrikada" || d === "gec" ? `<div class="field"><label for="eSaat">Geliş saati${d === "gec" ? " *" : ""}</label><input id="eSaat" type="time" value="${esc(e.saat || (d === "gec" && iso === TODAY ? nowHM() : ""))}"${ed ? "" : " disabled"}><span class="note" id="eLate">${lm > 0 ? `Mesai ${PT.cfg.mesai} · <b class="late">${lm} dk geç</b>` : `Mesai başlangıcı ${PT.cfg.mesai}`}</span></div>
            <div class="field"><label for="eCik">Erken çıkış saati</label><input id="eCik" type="time" value="${esc(e.cikis || "")}"${ed ? "" : " disabled"}><span class="note">Varsa</span></div>` : ""}
          ${izin && izOk ? `<div class="field"><label for="eBas">İzin başlangıcı</label><input id="eBas" type="date" value="${esc(z ? z.bas : iso)}"></div>
            <div class="field"><label for="eBit">İzin bitişi</label><input id="eBit" type="date" value="${esc(z ? (z.bit || z.bas) : iso)}"><span class="note" id="eGun"></span></div>` : ""}
          ${d && d !== "fabrikada" ? `<div class="field full"><label for="eSeb">${d === "gec" ? "Geç kalma sebebi" : izin ? "İzin sebebi" : "Gelmeme sebebi"}${d === "izinsiz" ? " *" : ""}</label><input id="eSeb" list="pkSebL" maxlength="200" value="${esc(e.sebep || (z && z.sebep) || "")}" placeholder="Örn. hastalık, ailevi mazeret"${ed ? "" : " disabled"}><datalist id="pkSebL">${PK_SEBEP.map(s => `<option value="${esc(s)}">`).join("")}</datalist>${d === "gec" ? "" : sebQ("eSeb", !ed)}</div>` : ""}
          <div class="field full"><label for="eNot">Not</label><textarea id="eNot" maxlength="500" placeholder="Örn. telefonla haber verdi, rapor getirecek"${ed ? "" : " disabled"}>${esc(e.not || (z && z.not) || "")}</textarea></div>
        </div>
        ${izin && !izOk && ed ? '<p class="note" style="margin:0">Yalnızca bu gün işaretlenir. Birden fazla günlük izin kaydını izin yetkisi olan kişi girer.</p>' : ""}
        ${izin && izOk ? '<p class="note" style="margin:0">Kaydedince izin kaydı oluşur ve tarih aralığındaki günler kendiliğinden işaretlenir.</p>' : ""}
        <section class="pksum"><h3 class="sec-t">Bu ay <small>${MON_L[Number(TODAY.slice(5, 7)) - 1]}</small></h3>
          <div class="pkst"><div><b class="num">${st.geldi}/${st.isgunu}</b><span>geldi</span></div><div class="${st.gec ? "w" : ""}"><b class="num">${st.gec}</b><span>geç${st.gecDk ? " · " + st.gecDk + " dk" : ""}</span></div><div class="${st.izinsiz ? "b" : ""}"><b class="num">${st.izinsiz}</b><span>izinsiz</span></div><div><b class="num">${st.izin + st.rapor}</b><span>izin / rapor</span></div><div><b class="num">${hak == null ? "—" : hak - used}</b><span>yıllık izin kalan</span></div></div>
          ${pkStrip(p)}</section>
        ${e.src === "yok" && e.by ? `<p class="note" style="margin:0">Son giriş: ${esc(e.by)} · ${new Date(e.at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })}</p>` : ""}
      </div>
      <div class="df"><span>${ed && e.src === "yok" ? '<button class="btn danger" id="eClr" type="button">İşareti kaldır</button>' : ""}</span><div class="r"><button class="btn ghost" id="eC" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="eS" type="button">Kaydet</button>' : ""}</div></div>
    </aside>`;
    $("#scrim").onclick = closeDrawer; $("#eX").onclick = closeDrawer; $("#eC").onclick = closeDrawer;
    document.querySelectorAll("[data-kd]").forEach(b => b.onclick = () => { keep(); d = b.dataset.kd; paint(); restore(); });
    const s = $("#eSaat"); if (s) s.oninput = () => { const m = pkLateMin(s.value); $("#eLate").innerHTML = m > 0 ? `Mesai ${PT.cfg.mesai} · <b class="late">${m} dk geç</b>${d === "fabrikada" && m > PT.cfg.tolerans ? " · Geç geldi olarak işaretleyin" : ""}` : `Mesai başlangıcı ${PT.cfg.mesai}`; };
    const gun = () => { const a = $("#eBas"), b = $("#eBit"); if (a && b) $("#eGun").textContent = pkWorkDays(a.value, b.value < a.value ? a.value : b.value) + " iş günü"; };
    if ($("#eBas")) { $("#eBas").onchange = () => { if ($("#eBit").value < $("#eBas").value) $("#eBit").value = $("#eBas").value; gun(); }; $("#eBit").onchange = gun; gun(); }
    const iz = $("#eIz"); if (iz) iz.onclick = () => pkOpenIzin(z.id, {});
    const clr = $("#eClr"); if (clr) clr.onclick = async () => { clr.disabled = true; try { await pkSet(pid, iso, null); toast("İşaret kaldırıldı"); closeDrawer(); } catch (x) { clr.disabled = false; toast(writeErr(x)); } };
    const sv = $("#eS"); if (sv) sv.onclick = save;
    bindSebQ();
  };
  const vals = {}; const keep = () => ["eSaat", "eCik", "eSeb", "eNot", "eBas", "eBit"].forEach(k => { const el = $("#" + k); if (el) vals[k] = el.value; });
  const restore = () => Object.entries(vals).forEach(([k, val]) => { const el = $("#" + k); if (el && val !== undefined && !(k === "eSaat" && !val && el.value)) el.value = val; });
  async function save() {
    if (!d) { toast("Bir durum seçin"); return; }
    const g = k => ($("#" + k) || {}).value || "";
    if (d === "gec" && !g("eSaat")) { toast("Geliş saatini girin"); $("#eSaat").focus(); return; }
    if (d === "izinsiz" && (!g("eSeb").trim() || g("eSeb").trim() === "Diğer:")) { toast("Gelmeme sebebini girin (bilinmiyorsa \"Habersiz gelmedi\")"); $("#eSeb").focus(); return; }
    $("#eS").disabled = true;
    try {
      if (IZ_TUR.includes(d) && can("k.izin")) {
        const bas = g("eBas") || iso, bit = g("eBit") < bas ? bas : (g("eBit") || bas);
        const data = { pid, ad: p.ad, tur: d, bas, bit, gun: pkWorkDays(bas, bit), sebep: g("eSeb").trim().slice(0, 200), not: g("eNot").trim().slice(0, 500), saatBas: "", saatBit: "", updatedAt: Date.now(), updatedBy: ME.name };
        if (z) await updateDoc(doc(fs, "izinler", z.id), data);
        else await setDoc(doc(collection(fs, "izinler")), { ...data, createdAt: Date.now(), createdBy: ME.name, createdByUid: ME.uid });
        if (e.src === "yok" && can("k.yoklama")) await pkSet(pid, iso, null);
        toast(`${IZ_L[d]} kaydedildi: ${fmtS(bas)}${bit !== bas ? " – " + fmtS(bit) : ""}`);
      } else {
        await pkSet(pid, iso, { d, saat: g("eSaat"), cikis: g("eCik"), sebep: d === "fabrikada" ? "" : g("eSeb"), not: g("eNot") });
        toast(`${p.ad}: ${PKS[d].l}`);
      }
      closeDrawer();
    } catch (x) { $("#eS").disabled = false; toast(writeErr(x)); }
  }
  paint();
}
// Son 30 günün renkli şeridi
function pkStrip(p) {
  let h = ""; for (let k = 29; k >= 0; k--) { const iso = addDays(TODAY, -k); const e = pkActiveOn(p, iso) ? pkEff(p, iso) : { d: "x" };
    h += `<i class="sq ${e.d === "tatil" ? "off" : !e.d ? "none" : e.d === "x" ? "x" : ""}" style="${PKS[e.d] ? `--tc:${PKS[e.d].c}` : ""}" title="${fmtS(iso)} · ${esc(PKS[e.d] ? PKS[e.d].l : e.d === "tatil" ? "Hafta tatili" : e.d === "x" ? "Kadroda değil" : "İşaretlenmedi")}">${PKS[e.d] && e.d !== "fabrikada" ? PKS[e.d].k : ""}</i>`; }
  return `<div class="strip" aria-label="Son 30 gün">${h}</div><div class="note" style="display:flex;justify-content:space-between"><span>${fmtS(addDays(TODAY, -29))}</span><span>Bugün</span></div>`;
}

/* İzinler */
function pkIzinView(v) {
  const IF = PT.IF, yil = TODAY.slice(0, 4);
  const ppl = PT.people.filter(p => p.aktif !== false || PT.izin.some(z => z.pid === p.id));
  v.innerHTML = `<div class="pkbar"><div class="filters">
      <select class="f${IF.when !== "aktif" ? " on" : ""}" id="izW" aria-label="Zaman">${[["aktif", "Şu an izinde"], ["yakin", "Yaklaşan"], ["ay", "Bu ay"], ["gecmis", "Geçmiş"], ["tum", "Tümü"]].map(([a, l]) => opt(a, l, IF.when)).join("")}</select>
      <select class="f${IF.tur ? " on" : ""}" id="izT" aria-label="İzin türü"><option value="">Tüm türler</option>${IZ_TUR.map(t => opt(t, IZ_L[t], IF.tur)).join("")}</select>
      <select class="f${IF.pid ? " on" : ""}" id="izP" aria-label="Personel"><option value="">Tüm personel</option>${ppl.map(p => opt(p.id, p.ad, IF.pid)).join("")}</select></div></div>
    <div id="izList"></div>
    <section><h3 class="sec-t">Yıllık izin bakiyeleri <small>${yil}</small></h3><div id="izBal"></div>
    <p class="note" style="margin:-18px 0 28px">Hak, personel kartında elle girilmemişse işe giriş tarihine göre hesaplanır (1–5 yıl 14, 5–15 yıl 20, 15 yıl üstü 26 gün). Kullanılan, bu yıl başlayan yıllık izinlerin iş günü toplamıdır.</p></section>`;
  const t = TODAY, wk = addDays(t, 30);
  const rows = PT.izin.filter(z => (!IF.tur || z.tur === IF.tur) && (!IF.pid || z.pid === IF.pid)).filter(z => {
    const b = z.bit || z.bas;
    if (IF.when === "aktif") return z.bas <= t && b >= t;
    if (IF.when === "yakin") return z.bas > t;
    if (IF.when === "ay") return ayOf(z.bas) === ayOf(t) || ayOf(b) === ayOf(t);
    if (IF.when === "gecmis") return b < t;
    return true;
  }).sort((a, b) => IF.when === "gecmis" || IF.when === "tum" ? b.bas.localeCompare(a.bas) : a.bas.localeCompare(b.bas));
  const nm = id => (PT.people.find(p => p.id === id) || {}).ad;
  const emp = { aktif: "Şu an izinde olan personel yok.", yakin: "Yaklaşan izin kaydı yok.", ay: "Bu ay izin kaydı yok.", gecmis: "Geçmiş izin kaydı yok.", tum: "Henüz izin kaydı yok." }[IF.when];
  $("#izList").innerHTML = `<div class="ledger izled" role="table"><div class="lhead" role="row"><div>Personel</div><div>İzin türü</div><div>Tarih</div><div>Gün</div><div>Sebep / not</div><div>Durum</div></div>${rows.length ? rows.map(z => {
    const b = z.bit || z.bas, s = z.bas > t ? ["Yaklaşan", "p-warn"] : b < t ? ["Bitti", "p-muted"] : ["Devam ediyor", "p-brand"], left = dnum(z.bas) - dnum(t);
    return `<div class="row" role="row" tabindex="0" data-iz="${esc(z.id)}" style="--stripe:${PKS[z.tur].c}">
      <div>${avatar(nm(z.pid) || z.ad || "?")}</div>
      <div><span class="kst" style="--tc:${PKS[z.tur].c}">${esc(IZ_L[z.tur])}</span></div>
      <div><span class="date">${fmtS(z.bas)}${b !== z.bas ? " – " + fmtS(b) : ""}</span>${z.saatBas ? `<div class="when">${esc(z.saatBas)}–${esc(z.saatBit || "")}</div>` : ""}${z.bas > t ? `<div class="when">${left} gün sonra</div>` : ""}</div>
      <div><span class="num">${z.gun || pkWorkDays(z.bas, b)}</span></div>
      <div class="izs">${esc(z.sebep || "—")}${z.not ? `<div class="when">${esc(z.not)}</div>` : ""}</div>
      <div><span class="pill ${s[1]}">${s[0]}</span></div></div>`;
  }).join("") : `<div class="row" style="display:block;cursor:default;color:var(--ink-2)">${emp}</div>`}</div>`;
  const bal = PT.people.filter(p => p.aktif !== false).map(p => ({ p, hak: pkHak(p), used: pkUsed(p.id, yil) })).sort((a, b) => (a.p.ad || "").localeCompare(b.p.ad || "", "tr"));
  $("#izBal").innerHTML = `<div class="ledger balled" role="table"><div class="lhead" role="row"><div>Personel</div><div>İşe giriş</div><div>Hak</div><div>Kullanılan</div><div>Kalan</div><div></div></div>${bal.map(({ p, hak, used }) => {
    const left = hak == null ? null : hak - used, pct = hak ? Math.min(100, Math.round(used / hak * 100)) : 0;
    return `<div class="row" role="row" data-pp="${esc(p.id)}" tabindex="0"><div>${avatar(p.ad)}</div><div><span class="date">${p.iseGiris ? fmtS(p.iseGiris) : "—"}</span></div><div class="num">${hak == null ? "—" : hak}${p.yillikHak != null && p.yillikHak !== "" ? ' <small class="note">elle</small>' : ""}</div><div class="num">${used}</div><div class="num ${left != null && left < 0 ? "late" : ""}"><b>${left == null ? "—" : left}</b></div>
      <div><div class="bar"><span style="width:${pct}%;--fill:${left != null && left < 0 ? "var(--bad)" : "var(--k-yillik)"}"></span></div></div></div>`;
  }).join("") || '<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Personel yok.</div>'}</div>`;
  $("#izW").onchange = e => { IF.when = e.target.value; renderPersonel(); };
  $("#izT").onchange = e => { IF.tur = e.target.value; renderPersonel(); };
  $("#izP").onchange = e => { IF.pid = e.target.value; renderPersonel(); };
  v.querySelectorAll("[data-iz]").forEach(el => { const go = () => pkOpenIzin(el.dataset.iz, {}); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  v.querySelectorAll("[data-pp]").forEach(el => { const go = () => pkOpenPerson(el.dataset.pp); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
}
function pkOpenIzin(id, pre) {
  const z = id ? PT.izin.find(x => x.id === id) : null; if (id && !z) return;
  const ed = can("k.izin"), dis = ed ? "" : " disabled";
  const ppl = PT.people.filter(p => p.aktif !== false || (z && p.id === z.pid));
  const cur = { pid: z ? z.pid : (pre.pid || ""), tur: z ? z.tur : (pre.tur || "yillik"), bas: z ? z.bas : (pre.bas || TODAY), bit: z ? (z.bit || z.bas) : (pre.bit || pre.bas || TODAY) };
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="izTt" style="width:min(520px,100%)">
    <div class="dh"><h2 id="izTt">${z ? "İzin kaydı" : "Yeni izin"}</h2><button class="x" id="izX" aria-label="Kapat">×</button></div>
    <div class="db"><div class="fgrid">
      <div class="field full"><label for="izPid">Personel *</label><select id="izPid"${dis}><option value="">Seçin</option>${ppl.map(p => opt(p.id, p.ad + (p.departman ? " · " + p.departman : ""), cur.pid)).join("")}</select></div>
      <div class="field full"><label>İzin türü</label><div class="kopts sm" role="radiogroup">${IZ_TUR.map(t => `<button type="button" role="radio" class="kopt${cur.tur === t ? " on" : ""}" aria-checked="${cur.tur === t}" data-izt="${t}" style="--tc:${PKS[t].c}"${dis}><i></i>${esc(IZ_L[t])}</button>`).join("")}</div></div>
      <div class="field"><label for="izBas">Başlangıç *</label><input id="izBas" type="date" value="${esc(cur.bas)}"${dis}></div>
      <div class="field"><label for="izBit">Bitiş *</label><input id="izBit" type="date" value="${esc(cur.bit)}"${dis}></div>
      <div class="field" id="izSaatF"><label for="izSb">Saatlik izin (isteğe bağlı)</label><div style="display:flex;gap:6px"><input id="izSb" type="time" value="${esc(z ? z.saatBas || "" : "")}"${dis} aria-label="Başlangıç saati"><input id="izSe" type="time" value="${esc(z ? z.saatBit || "" : "")}"${dis} aria-label="Bitiş saati"></div></div>
      <div class="field"><label for="izGun">İş günü</label><input id="izGun" type="number" min="0" max="400" step="0.5"${dis}><span class="note" id="izGunN"></span></div>
      <div class="field full"><label for="izSeb">Sebep</label><input id="izSeb" list="pkSebL2" maxlength="200" value="${esc(z ? z.sebep || "" : "")}"${dis}><datalist id="pkSebL2">${PK_SEBEP.map(s => `<option value="${esc(s)}">`).join("")}</datalist>${sebQ("izSeb", !ed)}</div>
      <div class="field full"><label for="izNot">Not</label><textarea id="izNot" maxlength="500" placeholder="Örn. rapor aslı İK'ya teslim edildi"${dis}>${esc(z ? z.not || "" : "")}</textarea></div>
    </div>
    <div class="izbal" id="izBalBox"></div>
    ${z ? `<p class="note" style="margin:0">Giren: ${esc(z.createdBy || z.updatedBy || "—")}${z.updatedBy && z.updatedBy !== z.createdBy ? " · son düzenleyen " + esc(z.updatedBy) : ""}</p>` : ""}
    </div>
    <div class="df"><span>${z && ed ? '<button class="btn danger" id="izDel" type="button">Sil</button>' : ""}</span><div class="r"><button class="btn ghost" id="izC" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="izS" type="button">Kaydet</button>' : ""}</div></div>
  </aside>`;
  let tur = cur.tur, gunEdited = !!(z && z.gun != null && z.gun !== pkWorkDays(z.bas, z.bit || z.bas));
  const upd = () => {
    const a = $("#izBas").value, b = $("#izBit").value < a ? a : $("#izBit").value, auto = pkWorkDays(a, b);
    if (!gunEdited) $("#izGun").value = z && !$("#izGun").dataset.t ? (z.gun ?? auto) : auto;
    $("#izGun").dataset.t = "1";
    $("#izGunN").textContent = `Takvime göre ${auto} iş günü${PT.cfg.cumartesi ? " (Pazar hariç)" : " (hafta sonu hariç)"}. Resmi tatil varsa düzeltin.`;
    $("#izSaatF").hidden = tur !== "gunluk";
    const p = PT.people.find(x => x.id === $("#izPid").value), box = $("#izBalBox");
    if (p && tur === "yillik") { const hak = pkHak(p), used = pkUsed(p.id, a.slice(0, 4)) - (z && z.tur === "yillik" && z.bas.slice(0, 4) === a.slice(0, 4) ? (Number(z.gun) || 0) : 0), n = Number($("#izGun").value) || 0;
      box.innerHTML = hak == null ? `<span class="note">${esc(p.ad)} için işe giriş tarihi ya da yıllık izin hakkı girilmemiş; bakiye hesaplanamıyor.</span>` : `<b>${esc(p.ad)}</b> · ${a.slice(0, 4)} hakkı <b class="num">${hak}</b> gün · kullanılan <b class="num">${used}</b> · bu izinden sonra kalan <b class="num ${hak - used - n < 0 ? "late" : ""}">${hak - used - n}</b> gün${hak - used - n < 0 ? " · hak aşılıyor" : ""}`; box.hidden = false; }
    else box.hidden = true;
  };
  $("#scrim").onclick = closeDrawer; $("#izX").onclick = closeDrawer; $("#izC").onclick = closeDrawer;
  $("#izBas").onchange = () => { if ($("#izBit").value < $("#izBas").value) $("#izBit").value = $("#izBas").value; gunEdited = false; upd(); };
  $("#izBit").onchange = () => { gunEdited = false; upd(); }; $("#izPid").onchange = upd; $("#izGun").oninput = () => { gunEdited = true; upd(); };
  document.querySelectorAll("[data-izt]").forEach(b => b.onclick = () => { tur = b.dataset.izt; document.querySelectorAll("[data-izt]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); upd(); });
  upd(); bindSebQ();
  const del = $("#izDel"); if (del) { let armed = false; del.onclick = async () => { if (!armed) { armed = true; del.textContent = "Silmek için tekrar basın"; return; } del.disabled = true; try { await deleteDoc(doc(fs, "izinler", z.id)); toast("İzin kaydı silindi"); closeDrawer(); } catch (x) { del.disabled = false; toast(writeErr(x)); } }; }
  const sv = $("#izS"); if (sv) sv.onclick = async () => {
    const pid = $("#izPid").value, p = PT.people.find(x => x.id === pid); if (!p) { toast("Personeli seçin"); $("#izPid").focus(); return; }
    const bas = $("#izBas").value, bit = $("#izBit").value; if (!bas || !bit || bit < bas) { toast("Tarihleri kontrol edin"); return; }
    const clash = PT.izin.find(x => x.id !== (z && z.id) && x.pid === pid && x.bas <= bit && (x.bit || x.bas) >= bas);
    if (clash && !sv.dataset.ok) { sv.dataset.ok = "1"; sv.textContent = "Yine de kaydet"; toast(`Uyarı: ${p.ad} için ${fmtS(clash.bas)} tarihli ${IZ_L[clash.tur].toLowerCase()} ile çakışıyor.`); return; }
    const data = { pid, ad: p.ad, tur, bas, bit, gun: Math.max(0, Number($("#izGun").value) || 0), saatBas: tur === "gunluk" ? $("#izSb").value : "", saatBit: tur === "gunluk" ? $("#izSe").value : "", sebep: $("#izSeb").value.trim().slice(0, 200), not: $("#izNot").value.trim().slice(0, 500), updatedAt: Date.now(), updatedBy: ME.name };
    sv.disabled = true;
    try {
      if (z) await updateDoc(doc(fs, "izinler", z.id), data); else await setDoc(doc(collection(fs, "izinler")), { ...data, createdAt: Date.now(), createdBy: ME.name, createdByUid: ME.uid });
      toast(`${p.ad}: ${IZ_L[tur]} kaydedildi (${data.gun} gün)`); closeDrawer();
    } catch (x) { sv.disabled = false; toast(writeErr(x)); }
  };
}

/* Aylık özet */
function pkMonthView(v) {
  const ay = PT.month, [y, m] = ay.split("-").map(Number), N = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: N }, (_, i) => `${ay}-${String(i + 1).padStart(2, "0")}`);
  const P = PT.people.filter(p => days.some(d => pkActiveOn(p, d)) && pkMatch(p));
  const ed = can("k.yoklama");
  const S = P.map(p => ({ p, s: pkMonthStats(p, ay) }));
  const tot = S.reduce((a, { s }) => { a.g += s.geldi; a.i += s.isgunu; a.gec += s.gec; a.x += s.izinsiz; return a; }, { g: 0, i: 0, gec: 0, x: 0 });
  v.innerHTML = `<div class="pkbar"><div class="pkdate"><button type="button" class="btn ghost sm" id="mPrev" aria-label="Önceki ay">‹</button><b class="pkmon">${MON_L[m - 1]} ${y}</b><button type="button" class="btn ghost sm" id="mNext" aria-label="Sonraki ay"${ay >= ayOf(TODAY) ? " disabled" : ""}>›</button>
      <span class="pkwd">Devam %${tot.i ? Math.round(tot.g / tot.i * 100) : 0} · ${tot.gec} geç · ${tot.x} izinsiz</span></div>
      <div class="filters">${pkFiltBar()}<button type="button" class="btn ghost sm" id="mCsv">Excel'e aktar</button></div></div>
    <div class="mgrid-w"><table class="mgrid"><thead><tr><th class="mn">Personel</th>${days.map(d => `<th class="${pkWork(d) ? "" : "we"}${d === TODAY ? " td" : ""}"><span>${Number(d.slice(8))}</span><small>${DAYS_S[wdOf(d)]}</small></th>`).join("")}<th class="t">Geldi</th><th class="t">Geç</th><th class="t">İzinsiz</th><th class="t">İzin</th><th class="t">Rapor</th></tr></thead>
    <tbody>${S.map(({ p, s }) => `<tr><th class="mn" data-pp="${esc(p.id)}" tabindex="0">${esc(p.ad)}<small>${esc(p.departman || "")}</small></th>${days.map(d => {
      if (!pkActiveOn(p, d)) return '<td class="na"></td>';
      const e = pkEff(p, d), k = PKS[e.d];
      const tip = `${fmtS(d)} · ${k ? k.l : e.d === "tatil" ? "Hafta tatili" : d > TODAY ? "" : "İşaretlenmedi"}${e.saat ? " · " + e.saat : ""}${e.sebep ? " · " + e.sebep : ""}`;
      return `<td class="${e.d === "tatil" ? "we" : ""}${k ? " k" : ""}${e.d === "fabrikada" ? " fab" : ""}${!e.d && d <= TODAY ? " bos" : ""}" style="${k ? `--tc:${k.c}` : ""}" title="${esc(tip)}"${ed && e.d !== "tatil" ? ` data-md="${d}" data-mp="${esc(p.id)}"` : ""}>${k ? (e.d === "fabrikada" ? "" : k.k) : ""}</td>`;
    }).join("")}<td class="t"><b>${s.geldi}</b>/${s.isgunu}</td><td class="t${s.gec ? " w" : ""}">${s.gec || ""}</td><td class="t${s.izinsiz ? " b" : ""}">${s.izinsiz || ""}</td><td class="t">${s.izin || ""}</td><td class="t">${s.rapor || ""}</td></tr>`).join("") || `<tr><td colspan="${N + 6}" style="padding:16px;color:var(--ink-2)">Bu filtrelere uyan personel yok.</td></tr>`}</tbody></table></div>
    <div class="mleg">${PK.map(([id, l, k]) => `<span><i${id === "fabrikada" ? ' class="fab"' : ""} style="--tc:${PKS[id].c}">${id === "fabrikada" ? "" : k}</i>${esc(l)}</span>`).join("")}<span><i class="bos"></i>İşaretlenmedi</span><span><i class="we"></i>Hafta tatili</span></div>`;
  pkBindFilt(() => { clearTimeout(PT.qt); PT.qt = setTimeout(() => { const pos = $("#pkQ").selectionStart; renderPersonel(); const q = $("#pkQ"); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }, 250); });
  $("#mPrev").onclick = () => { PT.month = prevAy(ay); pkWatch(); renderPersonel(); };
  $("#mNext").onclick = () => { PT.month = nextAy(ay); pkWatch(); renderPersonel(); };
  $("#mCsv").onclick = () => pkCsv(ay, days, S);
  v.querySelectorAll("[data-md]").forEach(td => td.onclick = () => pkOpenEntry(td.dataset.mp, td.dataset.md, null));
  v.querySelectorAll("th[data-pp]").forEach(el => { const go = () => pkOpenPerson(el.dataset.pp); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
}
function pkCsv(ay, days, S) {
  const q = x => { const s = String(x ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ["Personel", "Departman", "İş tanımı", ...days.map(d => d.slice(8) + " " + DAYS_S[wdOf(d)]), "Geldi", "İş günü", "Geç", "Geç (dk)", "İzinsiz", "İzinli", "Raporlu"];
  const lines = [head, ...S.map(({ p, s }) => [p.ad, p.departman || "", p.gorev || "", ...days.map(d => { if (!pkActiveOn(p, d)) return ""; const e = pkEff(p, d); return PKS[e.d] ? PKS[e.d].l + (e.saat ? " " + e.saat : "") : e.d === "tatil" ? "Tatil" : ""; }), s.geldi, s.isgunu, s.gec, s.gecDk, s.izinsiz, s.izin, s.rapor])];
  const csv = "﻿" + lines.map(r => r.map(q).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `personel-devam-${ay}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast("Aylık devam tablosu indirildi (Excel ile açılır)");
}

/* Personel listesi */
function pkListView(v) {
  const oz = can("k.ozel");
  v.innerHTML = `<div class="pkbar"><div class="filters">${pkFiltBar(`<label class="chk sm"><input type="checkbox" id="pkAyr"${PT.F.ayr ? " checked" : ""}> Ayrılanlar da</label>`)}</div>
      <div class="filters">${can("k.list") ? '<button type="button" class="btn ghost sm" id="pkBulk">Listeden toplu ekle</button>' : ""}</div></div>
    <div id="pkList"></div>
    ${oz ? "" : '<p class="note" style="margin:-18px 0 28px">TC kimlik, adres ve telefon bilgileri yalnızca kişisel bilgi yetkisi olanlara görünür.</p>'}`;
  const draw = () => {
    const rows = PT.people.filter(p => (PT.F.ayr || p.aktif !== false) && pkMatch(p));
    $("#pkList").innerHTML = `<div class="ledger lsled${oz ? "" : " nooz"}" role="table"><div class="lhead" role="row"><div>Ad soyad</div><div>Departman</div><div>İş tanımı</div>${oz ? "<div>Telefon</div>" : ""}<div>İşe giriş</div><div>Yıllık izin</div><div>Bugün</div></div>${rows.length ? rows.map(p => {
      const o = PT.ozel[p.id] || {}, hak = pkHak(p), left = hak == null ? null : hak - pkUsed(p.id, TODAY.slice(0, 4)), e = pkEff(p, TODAY);
      return `<div class="row${p.aktif === false ? " gone" : ""}" role="row" tabindex="0" data-pp="${esc(p.id)}">
        <div>${avatar(p.ad)}${p.aktif === false ? `<div class="when">Ayrıldı ${p.ayrilis ? fmtS(p.ayrilis) : ""}</div>` : ""}</div>
        <div>${esc(p.departman || "—")}</div><div class="izs">${esc(p.gorev || "—")}</div>
        ${oz ? `<div>${o.telefon ? `<a class="tel num" href="tel:${esc(o.telefon.replace(/[^\d+]/g, ""))}">${esc(o.telefon)}</a>` : '<span class="date none">—</span>'}</div>` : ""}
        <div><span class="date">${p.iseGiris ? fmtS(p.iseGiris) : "—"}</span></div>
        <div class="num">${left == null ? "—" : `<b>${left}</b> / ${hak} gün`}</div>
        <div>${p.aktif === false ? "" : pkPill(e.d)}</div></div>`;
    }).join("") : `<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Bu filtrelere uyan personel yok.</div>`}</div>`;
    $("#pkList").querySelectorAll("[data-pp]").forEach(el => { const go = () => pkOpenPerson(el.dataset.pp); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
    $("#pkList").querySelectorAll("a.tel").forEach(a => a.onclick = e => e.stopPropagation());
  };
  draw(); pkBindFilt(draw);
  $("#pkAyr").onchange = e => { PT.F.ayr = e.target.checked; draw(); };
  const bk = $("#pkBulk"); if (bk) bk.onclick = pkOpenBulk;
}
// TC kimlik no doğrulaması (11 hane, algoritma)
function tcOk(s) {
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = s.split("").map(Number), o = d[0] + d[2] + d[4] + d[6] + d[8], e = d[1] + d[3] + d[5] + d[7];
  return ((o * 7 - e) % 10 + 10) % 10 === d[9] && d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}
function pkOpenPerson(id) {
  const p = id ? PT.people.find(x => x.id === id) : null; if (id && !p) return;
  const ed = can("k.list"), oz = can("k.ozel"), dis = ed ? "" : " disabled", o = (p && PT.ozel[p.id]) || {};
  const pid = p ? p.id : doc(collection(fs, "personel")).id;
  const hak = p ? pkHak(p) : null, used = p ? pkUsed(p.id, TODAY.slice(0, 4)) : 0, st = p ? pkMonthStats(p, ayOf(TODAY)) : null;
  const myIz = p ? PT.izin.filter(z => z.pid === p.id).sort((a, b) => b.bas.localeCompare(a.bas)).slice(0, 6) : [];
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="ppT" style="width:min(600px,100%)">
    <div class="dh"><h2 id="ppT">${p ? esc(p.ad) : "Yeni personel"}</h2><button class="x" id="ppX" aria-label="Kapat">×</button></div>
    <div class="db">
      ${p ? `<section class="pksum"><div class="pkst"><div><b class="num">${st.geldi}/${st.isgunu}</b><span>bu ay geldi</span></div><div class="${st.gec ? "w" : ""}"><b class="num">${st.gec}</b><span>geç</span></div><div class="${st.izinsiz ? "b" : ""}"><b class="num">${st.izinsiz}</b><span>izinsiz</span></div><div><b class="num">${hak == null ? "—" : hak - used}</b><span>yıllık izin kalan</span></div></div>${pkStrip(p)}</section>` : ""}
      <section><h3 class="sec-t">Kimlik ve görev</h3><div class="fgrid">
        <div class="field full"><label for="ppAd">Ad soyad *</label><input id="ppAd" maxlength="80" value="${esc(p ? p.ad : "")}" autocomplete="off"${dis}></div>
        ${oz ? `<div class="field"><label for="ppTc">TC kimlik no</label><input id="ppTc" inputmode="numeric" maxlength="11" value="${esc(o.tc || "")}" autocomplete="off"${dis}><span class="note" id="ppTcN"></span></div>` : ""}
        <div class="field"><label for="ppDep">Çalıştığı departman</label><input id="ppDep" list="ppDepL" maxlength="60" value="${esc(p ? p.departman || "" : "")}" placeholder="Örn. Üretim, Kaynakhane, Boyahane"${dis}><datalist id="ppDepL">${pkDeps().map(d => `<option value="${esc(d)}">`).join("")}</datalist></div>
        <div class="field full"><label for="ppGrv">İş tanımı</label><input id="ppGrv" maxlength="120" value="${esc(p ? p.gorev || "" : "")}" placeholder="Örn. Kaynak ustası, CNC operatörü"${dis}></div>
        <div class="field"><label for="ppGir">İşe giriş tarihi</label><input id="ppGir" type="date" value="${esc(p ? p.iseGiris || "" : "")}"${dis}></div>
        <div class="field"><label for="ppHak">Yıllık izin hakkı (gün)</label><input id="ppHak" type="number" min="0" max="60" value="${esc(p && p.yillikHak != null ? p.yillikHak : "")}" placeholder="Boşsa kıdeme göre"${dis}><span class="note">Devreden izin varsa toplamı yazın</span></div>
      </div></section>
      ${oz ? `<section><h3 class="sec-t">İletişim <small>kişisel bilgi</small></h3><div class="fgrid">
        <div class="field"><label for="ppTel">Telefon numarası</label><input id="ppTel" type="tel" maxlength="20" value="${esc(o.telefon || "")}" placeholder="05xx xxx xx xx"${dis}></div>
        <div class="field full"><label for="ppAdr">Ev adresi</label><textarea id="ppAdr" maxlength="300"${dis}>${esc(o.adres || "")}</textarea></div>
        <div class="field"><label for="ppYk">Acil durumda aranacak kişi</label><input id="ppYk" maxlength="80" value="${esc(o.yakin || "")}" placeholder="Ad soyad · yakınlığı"${dis}></div>
        <div class="field"><label for="ppYkT">Acil durum telefonu</label><input id="ppYkT" type="tel" maxlength="20" value="${esc(o.yakinTel || "")}"${dis}></div>
      </div>${o.telefon && !ed ? `<a class="btn ghost" href="tel:${esc(o.telefon.replace(/[^\d+]/g, ""))}" style="margin-top:10px;display:inline-block;text-decoration:none">Ara: ${esc(o.telefon)}</a>` : ""}</section>` : ""}
      <section><h3 class="sec-t">Çalışma durumu</h3><div class="fgrid">
        <label class="chk field"><input type="checkbox" id="ppAyr"${p && p.aktif === false ? " checked" : ""}${dis}> İşten ayrıldı</label>
        <div class="field" id="ppAyrF"><label for="ppAyrT">Ayrılış tarihi</label><input id="ppAyrT" type="date" value="${esc(p ? p.ayrilis || "" : "")}"${dis}></div>
      </div><p class="note" style="margin:6px 0 0">Ayrılan personel listeden ve yoklamadan çıkar; geçmiş kayıtları saklanır.</p></section>
      ${myIz.length ? `<section><h3 class="sec-t">Son izinler</h3>${myIz.map(z => `<div class="izmini" data-iz="${esc(z.id)}" role="button" tabindex="0"><span class="kst" style="--tc:${PKS[z.tur].c}">${esc(IZ_L[z.tur])}</span><span class="date">${fmtS(z.bas)}${z.bit && z.bit !== z.bas ? " – " + fmtS(z.bit) : ""}</span><span class="num">${z.gun ?? pkWorkDays(z.bas, z.bit)} gün</span><span class="izs">${esc(z.sebep || "")}</span></div>`).join("")}</section>` : ""}
    </div>
    <div class="df"><span>${p && ed ? '<button class="btn danger" id="ppDel" type="button">Sil</button>' : ""}${p && can("k.izin") && p.aktif !== false ? '<button class="btn ghost" id="ppIz" type="button">+ İzin gir</button>' : ""}</span><div class="r"><button class="btn ghost" id="ppC" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="ppS" type="button">Kaydet</button>' : ""}</div></div>
  </aside>`;
  $("#scrim").onclick = closeDrawer; $("#ppX").onclick = closeDrawer; $("#ppC").onclick = closeDrawer;
  const ayrF = () => { $("#ppAyrF").hidden = !$("#ppAyr").checked; }; $("#ppAyr").onchange = () => { if ($("#ppAyr").checked && !$("#ppAyrT").value) $("#ppAyrT").value = TODAY; ayrF(); }; ayrF();
  const tc = $("#ppTc"); if (tc) { const chk = () => { tc.value = tc.value.replace(/\D/g, ""); const n = $("#ppTcN"); n.textContent = !tc.value ? "" : tc.value.length < 11 ? tc.value.length + "/11 hane" : tcOk(tc.value) ? "✓ Geçerli" : "Geçersiz TC kimlik no"; n.className = "note " + (tc.value.length === 11 ? (tcOk(tc.value) ? "okt" : "late") : ""); }; tc.oninput = chk; chk(); }
  document.querySelectorAll(".izmini[data-iz]").forEach(el => { const go = () => pkOpenIzin(el.dataset.iz, {}); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  const iz = $("#ppIz"); if (iz) iz.onclick = () => pkOpenIzin(null, { pid: p.id });
  const del = $("#ppDel"); if (del) { let armed = false; del.onclick = async () => {
    if (!armed) { armed = true; del.textContent = "Kalıcı silinsin mi? Tekrar basın"; toast("Ayrılan personel için silmek yerine \"İşten ayrıldı\" işaretleyin; geçmişi korunur."); return; }
    del.disabled = true; try { await deleteDoc(doc(fs, "personel", p.id)); if (oz) await deleteDoc(doc(fs, "personel_ozel", p.id)).catch(() => {}); toast(p.ad + " silindi"); closeDrawer(); } catch (x) { del.disabled = false; toast(writeErr(x)); } }; }
  const sv = $("#ppS"); if (sv) sv.onclick = async () => {
    const ad = $("#ppAd").value.trim().replace(/\s+/g, " "); if (!ad) { toast("Ad soyad girin"); $("#ppAd").focus(); return; }
    if (PT.people.some(x => x.id !== pid && lower(x.ad) === lower(ad)) && !sv.dataset.ok) { sv.dataset.ok = "1"; sv.textContent = "Yine de kaydet"; toast("Aynı isimde personel zaten var. Yine de kaydetmek için tekrar basın."); return; }
    if (tc && tc.value && !tcOk(tc.value)) { toast("TC kimlik numarası geçersiz"); tc.focus(); return; }
    const hk = $("#ppHak").value, ayr = $("#ppAyr").checked;
    const data = { ad, departman: $("#ppDep").value.trim().slice(0, 60), gorev: $("#ppGrv").value.trim().slice(0, 120), iseGiris: $("#ppGir").value || "", yillikHak: hk === "" ? null : Math.max(0, Number(hk) || 0),
      aktif: !ayr, ayrilis: ayr ? ($("#ppAyrT").value || TODAY) : "", updatedAt: Date.now(), updatedBy: ME.name };
    if (!p) Object.assign(data, { createdAt: Date.now(), createdBy: ME.name });
    sv.disabled = true;
    try {
      await setDoc(doc(fs, "personel", pid), p ? { ...data, createdAt: p.createdAt || Date.now(), createdBy: p.createdBy || ME.name } : data);
      if (oz) await setDoc(doc(fs, "personel_ozel", pid), { tc: tc.value, telefon: $("#ppTel").value.trim(), adres: $("#ppAdr").value.trim(), yakin: $("#ppYk").value.trim(), yakinTel: $("#ppYkT").value.trim(), updatedAt: Date.now(), updatedBy: ME.name });
      toast(p ? "Personel bilgileri kaydedildi" : ad + " listeye eklendi"); closeDrawer();
    } catch (x) { sv.disabled = false; toast(writeErr(x)); }
  };
  if (!p && ed) setTimeout(() => $("#ppAd").focus(), 50);
}
function pkOpenBulk() {
  if (!can("k.list")) return;
  const oz = can("k.ozel");
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="bkT" style="width:min(600px,100%)">
    <div class="dh"><h2 id="bkT">Listeden toplu ekle</h2><button class="x" id="bkX" aria-label="Kapat">×</button></div>
    <div class="db"><div class="field"><label for="bkTa">Her satıra bir personel</label><textarea id="bkTa" class="cfgta" style="min-height:220px;font-family:var(--mono);font-size:13px" placeholder="Ad Soyad; Departman; İş tanımı${oz ? "; Telefon" : ""}\nAhmet Yılmaz; Üretim; Kaynak ustası${oz ? "; 0532 000 00 00" : ""}\nAyşe Demir; Muhasebe; Ön muhasebe"></textarea>
      <p class="note" style="margin:4px 0 0">Alanları noktalı virgül (;) ya da sekme ile ayırın; Excel'den kopyalayıp yapıştırabilirsiniz. Yalnızca ad soyad zorunludur. Listede zaten olan isimler atlanır.${oz ? " TC ve adres gibi bilgileri sonra kişi kartından girin." : ""}</p></div>
      <div id="bkPrev" class="note"></div></div>
    <div class="df"><span></span><div class="r"><button class="btn ghost" id="bkC" type="button">Vazgeç</button><button class="btn" id="bkS" type="button" disabled>Ekle</button></div></div>
  </aside>`;
  $("#scrim").onclick = closeDrawer; $("#bkX").onclick = closeDrawer; $("#bkC").onclick = closeDrawer;
  let list = [];
  $("#bkTa").oninput = () => {
    const seen = new Set(PT.people.map(p => lower(p.ad)));
    list = $("#bkTa").value.split("\n").map(l => l.split(/\t|;/).map(x => x.trim())).filter(a => a[0]).map(([ad, departman = "", gorev = "", telefon = ""]) => ({ ad: ad.replace(/\s+/g, " ").slice(0, 80), departman: departman.slice(0, 60), gorev: gorev.slice(0, 120), telefon: telefon.slice(0, 20) }))
      .filter(r => { const k = lower(r.ad); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 300);
    $("#bkPrev").textContent = list.length ? `${list.length} yeni personel eklenecek: ${list.slice(0, 5).map(r => r.ad).join(", ")}${list.length > 5 ? "…" : ""}` : "";
    $("#bkS").disabled = !list.length; $("#bkS").textContent = list.length ? list.length + " kişiyi ekle" : "Ekle";
  };
  $("#bkS").onclick = async () => {
    $("#bkS").disabled = true;
    try {
      for (let i = 0; i < list.length; i += 200) {
        const b = writeBatch(fs);
        list.slice(i, i + 200).forEach(r => { const ref = doc(collection(fs, "personel")); b.set(ref, { ad: r.ad, departman: r.departman, gorev: r.gorev, iseGiris: "", yillikHak: null, aktif: true, ayrilis: "", createdAt: Date.now(), createdBy: ME.name, updatedAt: Date.now(), updatedBy: ME.name });
          if (oz && r.telefon) b.set(doc(fs, "personel_ozel", ref.id), { tc: "", telefon: r.telefon, adres: "", yakin: "", yakinTel: "", updatedAt: Date.now(), updatedBy: ME.name }); });
        await b.commit();
      }
      toast(list.length + " personel eklendi"); closeDrawer();
    } catch (x) { $("#bkS").disabled = false; toast(writeErr(x)); }
  };
}
function pkOpenCfg() {
  if (!can("k.list")) return;
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="pcT" style="width:min(460px,100%)">
    <div class="dh"><h2 id="pcT">Personel takip ayarları</h2><button class="x" id="pcX" aria-label="Kapat">×</button></div>
    <div class="db"><div class="fgrid">
      <div class="field"><label for="pcM">Mesai başlangıcı</label><input id="pcM" type="time" value="${esc(PT.cfg.mesai)}"></div>
      <div class="field"><label for="pcT2">Geç sayılma toleransı (dk)</label><input id="pcT2" type="number" min="0" max="120" value="${esc(PT.cfg.tolerans)}"></div>
      <label class="chk field full"><input type="checkbox" id="pcC"${PT.cfg.cumartesi ? " checked" : ""}> Cumartesi çalışma günü</label>
    </div><p class="note" style="margin:0">Mesai başlangıcı geç kalma süresini hesaplamakta kullanılır. Pazar (ve Cumartesi çalışılmıyorsa Cumartesi) hafta tatili sayılır; izin günleri buna göre hesaplanır.</p></div>
    <div class="df"><span></span><div class="r"><button class="btn ghost" id="pcC2" type="button">Vazgeç</button><button class="btn" id="pcS" type="button">Kaydet</button></div></div>
  </aside>`;
  $("#scrim").onclick = closeDrawer; $("#pcX").onclick = closeDrawer; $("#pcC2").onclick = closeDrawer;
  $("#pcS").onclick = async () => {
    const m = $("#pcM").value; if (!hm2m(m)) { toast("Mesai saatini girin"); return; }
    $("#pcS").disabled = true;
    try { await setDoc(doc(fs, "config", "personel"), { mesai: m, tolerans: Math.max(0, Math.min(120, Number($("#pcT2").value) || 0)), cumartesi: $("#pcC").checked, updatedAt: Date.now(), updatedBy: ME.name }); toast("Ayarlar kaydedildi"); closeDrawer(); }
    catch (x) { $("#pcS").disabled = false; toast(writeErr(x)); }
  };
}

/* ================= STOK ================= */
// stok/{id}: kart bilgileri ve miktar · stok_fiyat/{id}: alış fiyatı ve fiyat arşivi (yalnızca fiyat yetkisi olanlar)
// stok_hareket/{id}: giriş, çıkış, sayım hareketleri (ay alanıyla aylık dinlenir) · stok_foto/{id}: ürün fotoğrafı
const ST_BIRIM = ["Adet", "Kg", "Metre", "m²", "Litre", "Paket", "Kutu", "Takım", "Rulo", "Levha", "Boy", "Çift"];
const ST_PB = ["TRY", "USD", "EUR"];
const ST_TIP = { acilis: ["Açılış", "var(--ink-3)"], giris: ["Giriş", "var(--k-fabrikada)"], cikis: ["Çıkış", "var(--k-izinsiz)"], sayim: ["Sayım düzeltme", "var(--k-gunluk)"] };
const ST_ACIK = { giris: ["Satın alma girişi", "Üretimden giriş", "Müşteri iadesi", "Transfer girişi", "Diğer"], cikis: ["Üretime verildi", "Satış / sevkiyat", "Fire / hurda", "Numune", "Tedarikçiye iade", "Bakım / onarım", "Diğer"], sayim: ["Dönem sayımı", "Ara sayım", "Hatalı giriş düzeltmesi"] };
const SK = { page: [], stocked: [], cache: new Map(), fiyat: {}, movBy: {}, cfg: { depolar: [], gruplar: {}, kodlar: {}, sema: 0, katalog: null }, ready: false, subs: {}, view: "liste", ay: null,
  lim: 200, more: false, cnt: { toplam: null, kritik: 0, yok: 0, deneme: 0 }, pageUnsub: null,
  F: { tip: "", ana: "", alt: "", depo: "", dur: "", q: "" }, HF: { tip: "", q: "" }, SORT: { key: "kod", dir: 1 } };
// Ekranda olan kartlar: geçerli sayfa + stoğu olanlar + son açılanlar (tüm koleksiyon hiç yüklenmez)
Object.defineProperty(SK, "items", { get() { const m = new Map(); [...SK.stocked, ...SK.cache.values(), ...SK.page].forEach(i => m.set(i.id, i)); return [...m.values()]; } });
// Genel kod (stok tipi): kodun ilk harf(ler)i
const STK_TIP = { M: "Mamul", YM: "Yarı mamul", H: "Hammadde", S: "Sarf malzeme", AS: "Al-sat", A: "Aksesuar" };
const nf = (n, d = 2) => { try { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(Number(n) || 0); } catch (e) { return String(n || 0); } };
const money = (n, pb = "TRY") => { try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: pb || "TRY", maximumFractionDigits: 2 }).format(Number(n) || 0); } catch (e) { return nf(n) + " " + pb; } };
const moneyR = n => { try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(n) || 0); } catch (e) { return Math.round(n) + " ₺"; } };
const skMov = () => Object.values(SK.movBy).flat();
const skKodAnas = () => Object.values(SK.cfg.kodlar || {}).flatMap(t => Object.values(t || {}).map(a => a && a.ad));
const skAnas = () => sortTr([...Object.keys(SK.cfg.gruplar), ...skKodAnas(), ...SK.items.map(i => i.anaGrup)]);
const skKodAlts = ana => Object.values(SK.cfg.kodlar || {}).flatMap(t => Object.values(t || {}).filter(a => a && (!ana || a.ad === ana)).flatMap(a => Object.values(a.alt || {})));
const skAlts = ana => sortTr([...(ana ? (SK.cfg.gruplar[ana] || []) : Object.values(SK.cfg.gruplar).flat()), ...skKodAlts(ana), ...SK.items.filter(i => !ana || i.anaGrup === ana).map(i => i.altGrup)]);
const skDepos = () => sortTr([...SK.cfg.depolar, ...SK.items.map(i => i.depo)]);
const SK_SEV = { yok: ["Stokta yok", "var(--k-izinsiz)"], kritik: ["Kritik seviye", "var(--k-gec)"], fazla: ["Fazla stok", "var(--k-gunluk)"], ok: ["Yeterli", "var(--k-fabrikada)"], bos: ["Stok yok", "var(--ink-3)"] };
// Seviye: minimum tanımlı kalem 0'a düşerse "stokta yok"; minimumu olmayan (siparişe üretilen) kalem 0 ise "stok yok" (uyarı değil)
const skSeviye = (m, mn, mx) => { m = Number(m) || 0; mn = Number(mn) || 0; mx = Number(mx) || 0; return m <= 0 ? (mn > 0 ? "yok" : "bos") : mn && m <= mn ? "kritik" : mx && m > mx ? "fazla" : "ok"; };
// Arama kelimeleri: ad, kod, grup, tedarikçi kelimeleri ve 3 harften başlayan önekleri
const skNorm = s => String(s || "").toLocaleLowerCase("tr").normalize("NFC");
// Sunucu aramasında en seçici kelime: ölçü (rakam içeren) önce, sonra en uzun kelime; kalan kelimeler ekranda süzülür
const skBestTok = q => { const t = skNorm(q).split(/[^0-9a-zçğıöşü]+/).filter(Boolean); return (t.filter(x => /\d/.test(x)).sort((a, b) => b.length - a.length)[0] || t.sort((a, b) => b.length - a.length)[0] || skNorm(q)).slice(0, 11); };
function skWords(it) {
  const src = [it.ad, it.kod, it.anaGrup, it.altGrup, it.olcu, it.barkod, it.ted && it.ted.firma, it.ted && it.ted.kod, STK_TIP[it.tip]].join(" ");
  const set = new Set(); skNorm(src).split(/[^0-9a-zçğıöşü]+/).filter(Boolean).forEach(w => { set.add(w); for (let k = 3; k < w.length && k < 12; k++) set.add(w.slice(0, k)); });
  return [...set].slice(0, 150);
}
function skLevel(it) {
  const k = skSeviye(it.miktar, it.minStok, it.maxStok); return { k, l: SK_SEV[k][0], c: SK_SEV[k][1] };
}
function _skLevelOld(it) {
  const m = Number(it.miktar) || 0, mn = Number(it.minStok) || 0, mx = Number(it.maxStok) || 0;
  if (m <= 0) return { k: "yok", l: "Stokta yok", c: "var(--k-izinsiz)" };
  if (mn && m <= mn) return { k: "kritik", l: "Kritik seviye", c: "var(--k-gec)" };
  if (mx && m > mx) return { k: "fazla", l: "Fazla stok", c: "var(--k-gunluk)" };
  return { k: "ok", l: "Yeterli", c: "var(--k-fabrikada)" };
}
const skPrice = id => SK.fiyat[id] || null;
const skValue = it => { const f = skPrice(it.id); return f && (f.pb || "TRY") === "TRY" ? (Number(f.alisFiyat) || 0) * Math.max(0, Number(it.miktar) || 0) : 0; };
const trFold = s => String(s || "").toLocaleUpperCase("tr").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/İ/g, "I").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U").replace(/[^A-Z0-9]/g, "");
// Sıradaki kod: kod sistemiyle (M-0101 + 5 haneli sıra) ya da ana grubun ilk 3 harfiyle; veritabanında o önekin son kodu sorgulanır
async function skSuggestCode(o) {
  const coded = o && o.tip && o.ana && o.alt, pre = coded ? `${o.tip}-${o.ana}${o.alt}` : ((trFold(o && o.anaAd).slice(0, 3) || "STK") + "-"), pad = coded ? 5 : 4;
  let mx = 0;
  try { const s = await getDocs(query(collection(fs, "stok"), where("kod", ">=", pre), where("kod", "<=", pre + "\uf8ff"), orderBy("kod", "desc"), limit(1)));
    s.docs.forEach(d => { const m = String(d.data().kod || "").slice(pre.length).match(/^(\d+)$/); if (m) mx = Number(m[1]); }); } catch (e) { console.warn(e); }
  SK.items.forEach(i => { const k = String(i.kod || ""); if (k.startsWith(pre)) { const m = k.slice(pre.length).match(/^(\d+)$/); if (m) mx = Math.max(mx, Number(m[1])); } });
  return pre + String(mx + 1).padStart(pad, "0");
}
const skKodExists = async (kod, notId) => { const s = await getDocs(query(collection(fs, "stok"), where("kod", "==", kod), limit(3))); const d = s.docs.find(x => x.id !== notId); return d ? { id: d.id, ...d.data() } : null; };

function startStok() {
  SK.ready = false; SK.page = []; SK.stocked = []; SK.cache.clear();
  // stoğu olan kalemler (stok değeri, kritik isimler, ana ekran) — genelde az sayıda
  dataUnsubs.push(onSnapshot(query(collection(fs, "stok"), where("miktar", ">", 0)), s => { SK.stocked = s.docs.map(d => ({ id: d.id, ...d.data() })); skChanged(); }, () => {}));
  SK.fiyat = {};
  if (can("s.price")) dataUnsubs.push(onSnapshot(collection(fs, "stok_fiyat"), s => { SK.fiyat = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); skChanged(); }, () => {}));
  dataUnsubs.push(onSnapshot(doc(fs, "config", "stok"), s => {
    const d = s.exists() ? s.data() : {};
    SK.cfg = { depolar: Array.isArray(d.depolar) ? d.depolar : [], gruplar: d.gruplar && typeof d.gruplar === "object" ? d.gruplar : {}, kodlar: d.kodlar && typeof d.kodlar === "object" ? d.kodlar : {}, sema: Number(d.sema) || 0, katalog: d.katalog || null };
    if (SK.cfg.sema < 2 && can("s.edit")) skMigrate();
    skChanged();
  }, () => {}));
  SK.subs = {}; SK.movBy = {};
  dataUnsubs.push(() => { Object.values(SK.subs).forEach(u => { try { u(); } catch (e) {} }); SK.subs = {}; if (SK.pageUnsub) { try { SK.pageUnsub(); } catch (e) {} SK.pageUnsub = null; } });
  skWatch(); skPageWatch(); skCounts();
}
// Eski kartlara seviye, arama kelimeleri ve aktif alanı bir kez eklenir (koleksiyon o sırada küçük)
let skMigrating = false;
async function skMigrate() {
  if (skMigrating) return; skMigrating = true;
  try {
    const s = await getDocs(collection(fs, "stok")); const L = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.seviye || !Array.isArray(i.kelimeler) || i.aktif == null);
    for (let k = 0; k < L.length; k += 400) { const b = writeBatch(fs); L.slice(k, k + 400).forEach(i => b.update(doc(fs, "stok", i.id), { seviye: skSeviye(i.miktar, i.minStok, i.maxStok), kelimeler: skWords(i), aktif: i.aktif !== false })); await b.commit(); }
    await setDoc(doc(fs, "config", "stok"), { sema: 2 }, { merge: true });
  } catch (e) { console.warn("stok geçişi", e); }
  skMigrating = false;
}
// Liste sorgusu: filtre ve aramaya göre en fazla SK.lim kart
function skQueryRef() {
  const F = SK.F, c = collection(fs, "stok"), qs = F.q.trim();
  if (qs) {
    if (/^[a-zçğıöşü]{1,4}-[0-9a-z]*$/i.test(qs) || /^[a-zçğıöşü]{1,4}-?\d{2,}/i.test(qs)) { const Q = qs.toLocaleUpperCase("tr"); return { q: query(c, where("kod", ">=", Q), where("kod", "<=", Q + "\uf8ff"), orderBy("kod"), limit(SK.lim)), kind: "kod" }; }
    const w = skBestTok(qs);
    return { q: query(c, where("kelimeler", "array-contains", w.slice(0, 11)), limit(SK.lim)), kind: "kelime" };
  }
  const w = [];
  if (F.tip) w.push(where("tip", "==", F.tip)); if (F.ana) w.push(where("anaGrup", "==", F.ana)); if (F.alt) w.push(where("altGrup", "==", F.alt)); if (F.depo) w.push(where("depo", "==", F.depo));
  if (F.dur === "pasif") w.push(where("aktif", "==", false));
  else if (["kritik", "yok", "fazla", "ok", "bos"].includes(F.dur)) w.push(where("seviye", "==", F.dur));
  else if (F.dur === "eksik") w.push(where("seviye", "in", ["kritik", "yok"]));
  if (F.dur === "stokta" && !w.length) return { q: query(c, where("miktar", ">", 0), limit(SK.lim)), kind: "f" };
  if (!w.length) return { q: query(c, orderBy("kod"), limit(SK.lim)), kind: "tum" };
  return { q: query(c, ...w, limit(SK.lim)), kind: "f" };
}
function skPageWatch() {
  if (!ME || lvl("stok") === "none") return;
  if (SK.pageUnsub) { try { SK.pageUnsub(); } catch (e) {} }
  const { q } = skQueryRef(); SK.pageLoading = true;
  SK.pageUnsub = onSnapshot(q, s => { SK.page = s.docs.map(d => ({ id: d.id, ...d.data() })); SK.more = s.docs.length >= SK.lim; SK.pageLoading = false; SK.ready = true; skChanged(); },
    e => { SK.pageLoading = false; SK.ready = true; skChanged(); toast("Stok kartları okunamadı: " + (e.code || e.message)); });
}
let skCntT = null;
function skCounts(delay = 0) {
  clearTimeout(skCntT); skCntT = setTimeout(async () => {
    const c = collection(fs, "stok"), n = async q => { try { return (await getCountFromServer(q)).data().count; } catch (e) { return null; } };
    const [toplam, kritik, yok, deneme] = await Promise.all([n(query(c, where("aktif", "==", true))), n(query(c, where("seviye", "==", "kritik"))), n(query(c, where("seviye", "==", "yok"))), n(query(c, where("deneme", "==", true)))]);
    SK.cnt = { toplam, kritik: kritik || 0, yok: yok || 0, deneme: deneme || 0 }; skChanged();
  }, delay);
}
const skFind = id => SK.items.find(x => x.id === id) || null;
async function skGet(id) { let it = skFind(id); if (it) return it; const d = await getDoc(doc(fs, "stok", id)); if (!d.exists()) return null; it = { id: d.id, ...d.data() }; SK.cache.set(id, it); return it; }
function skWatch() {
  if (!ME || lvl("stok") === "none") return;
  const need = new Set([ayOf(TODAY), SK.ay || ayOf(TODAY)]);
  for (const ay of Object.keys(SK.subs)) if (!need.has(ay)) { try { SK.subs[ay](); } catch (e) {} delete SK.subs[ay]; delete SK.movBy[ay]; }
  for (const ay of need) if (!SK.subs[ay]) SK.subs[ay] = onSnapshot(query(collection(fs, "stok_hareket"), where("ay", "==", ay)), s => {
    SK.movBy[ay] = s.docs.map(d => ({ id: d.id, ...d.data() })); skChanged();
  }, e => toast("Stok hareketleri okunamadı: " + (e.code || e.message)));
}
let skDrawerRefresh = null;
function skChanged() { if ($("#app").hidden) return; renderHome(); if (ROUTE === "stok") renderStok(); if (skDrawerRefresh) skDrawerRefresh(); }

// Hareket kaydı: hareket belgesi + stok miktarı (increment ile, aynı anda giriş yapılsa da doğru toplanır)
async function skMove(it, tip, qty, o = {}) {
  const cur = Number(it.miktar) || 0, delta = tip === "cikis" ? -qty : tip === "sayim" ? qty - cur : qty;
  const now = Date.now(), ts = o.ts || now, b = writeBatch(fs);
  b.set(doc(collection(fs, "stok_hareket")), { sid: it.id, kod: it.kod, ad: it.ad, birim: it.birim || "Adet", tip, miktar: delta, once: cur, sonra: cur + delta,
    belge: (o.belge || "").slice(0, 60), aciklama: (o.aciklama || "").slice(0, 300), depo: it.depo || "", ts, ay: ayOf(dayOf(ts)), by: ME.name, uid: ME.uid, ...(o.deneme ? { deneme: true } : {}) });
  b.update(doc(fs, "stok", it.id), { miktar: increment(delta), seviye: skSeviye(cur + delta, it.minStok, it.maxStok), sonHareket: now, updatedAt: now, updatedBy: ME.name });
  await b.commit(); if (SK.cache.has(it.id)) SK.cache.set(it.id, { ...it, miktar: cur + delta, seviye: skSeviye(cur + delta, it.minStok, it.maxStok) }); skCounts(1500);
  if (o.fiyat != null && o.fiyat !== "" && can("s.price")) await skSetPrice(it.id, Number(o.fiyat), o.pb || "TRY", o.tedarikci, "Giriş" + (o.belge ? " · " + o.belge : ""));
  return delta;
}
async function skSetPrice(id, fiyat, pb, ted, not, kdv) {
  const f = SK.fiyat[id] || {}, arsiv = Array.isArray(f.arsiv) ? f.arsiv.slice() : [];
  const same = Number(f.alisFiyat) === Number(fiyat) && (f.pb || "TRY") === pb;
  if (same && (kdv == null || Number(kdv) === Number(f.kdv))) return;
  if (!same) arsiv.push({ ts: Date.now(), fiyat: Number(fiyat), pb, tedarikci: ted || "", not: (not || "").slice(0, 120), by: ME.name });
  await setDoc(doc(fs, "stok_fiyat", id), { alisFiyat: Number(fiyat), pb, kdv: kdv != null ? Number(kdv) : (f.kdv ?? 20), arsiv: arsiv.slice(-100), updatedAt: Date.now(), updatedBy: ME.name });
}

function stokTile(m) {
  const C = SK.cnt, I = SK.stocked.filter(i => i.aktif !== false), val = I.reduce((s, i) => s + skValue(i), 0), tot = C.toplam;
  const ok = tot ? Math.max(0, Math.round((tot - C.kritik - C.yok) / tot * 100)) : 0;
  return `<a class="tile on" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <svg class="wave" viewBox="0 0 180 120" aria-hidden="true"><path d="M0 70 C40 40 80 100 180 50 L180 120 L0 120Z" fill="#fff"/></svg>
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">${lvl(m.id) === "view" ? "GÖZLEMCİ" : "AKTİF"}</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>
        <div class="meter" title="Uyarısız kalemler %${ok}"><i style="width:${ok}%"></i></div>
        <div class="stats"><span>${tot == null ? "…" : nf(tot, 0)} kalem</span><span>${I.length} stokta</span>${C.kritik ? `<span class="alert">${C.kritik} kritik</span>` : ""}${C.yok ? `<span class="alert">${C.yok} stokta yok</span>` : ""}${can("s.price") && val ? `<span>${moneyR(val)}</span>` : ""}</div>
      </div></a>`;
}

/* --- ekran --- */
function renderStok() {
  if (!ME || $("#modStok").hidden) return;
  if (!SK.ay) SK.ay = ayOf(TODAY);
  const C = SK.cnt, I = SK.stocked.filter(i => i.aktif !== false), M = SK.movBy[ayOf(TODAY)] || [];
  const krit = I.filter(i => skLevel(i).k === "kritik");
  const gi = M.filter(h => h.tip === "giris").length, ci = M.filter(h => h.tip === "cikis").length;
  const val = I.reduce((s, i) => s + skValue(i), 0), fx = I.filter(i => { const f = skPrice(i.id); return f && f.pb && f.pb !== "TRY"; }).length;
  $("#skKpis").innerHTML = [
    ["Stok kalemi", C.toplam == null ? "…" : nf(C.toplam, 0), `${I.length} kalem stokta · ${skDepos().length} depo`, ""],
    ["Kritik seviyede", C.kritik, krit.length ? krit.slice(0, 2).map(i => i.ad).join(", ") + (C.kritik > 2 ? "…" : "") : "Minimum altına düşen yok", C.kritik ? "bad" : ""],
    ["Stokta yok", C.yok, C.yok ? "Minimumu tanımlı, stoğu biten kalem" : "Minimumu tanımlı kalemlerin hepsi stokta", C.yok ? "bad" : ""],
    ["Bu ay hareket", gi + ci + M.filter(h => h.tip === "sayim").length, `${gi} giriş · ${ci} çıkış`, ""],
    can("s.price") ? ["Stok değeri", moneyR(val), fx ? `Alış fiyatıyla · ${fx} dövizli kalem hariç` : "Alış fiyatıyla (KDV hariç)", ""] : ["Depolar", skDepos().length, skDepos().slice(0, 3).join(", ") || "Depo girilmedi", ""]
  ].map(([k, v, s, cl]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${cl}">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join("");
  document.querySelectorAll("#skTabs [data-sv]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.sv === SK.view ? "true" : "false"); b.onclick = () => { SK.view = b.dataset.sv; closeDrawer(); renderStok(); }; });
  $("#skAdd").hidden = !can("s.edit"); $("#skAdd").onclick = () => skOpenCard(null);
  $("#skCfgBtn").hidden = !can("s.cfg"); $("#skCfgBtn").onclick = skOpenCfg;
  const v = $("#skView");
  if (!SK.ready) { v.innerHTML = '<div class="empty"><h3>Stok kartları yükleniyor</h3><p>Veritabanına bağlanılıyor.</p></div>'; return; }
  if (SK.cnt.toplam === 0 && !SK.page.length && !SK.F.q && !SK.F.dur) {
    v.innerHTML = `<div class="empty"><h3>Henüz stok kartı yok</h3><p>Stok kartlarını tek tek ekleyin, Excel'den toplu aktarın ya da mamul kod kataloğunu (${nf(skKatalog().length, 0)} kod) tek tuşla yükleyin. İşleyişi görmek için 5 deneme ürünü de ekleyebilirsiniz; tek düğmeyle silinir.</p>${can("s.edit") ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="skE4" type="button">Mamul kod kataloğunu yükle</button><button class="btn ghost" id="skE1" type="button">+ Stok kartı ekle</button><button class="btn ghost" id="skE2" type="button">Excel'den toplu aktar</button><button class="btn ghost" id="skE3" type="button">Deneme ürünlerini ekle</button></div>` : '<p class="note">Stok kartlarını yetkili kişi oluşturacak.</p>'}</div>`;
    const b1 = $("#skE1"); if (b1) { b1.onclick = () => skOpenCard(null); $("#skE2").onclick = skOpenBulk; $("#skE3").onclick = skSeed; $("#skE4").onclick = skKatalogYukle; } return;
  }
  (SK.view === "liste" ? skListView : skMovView)(v);
}

const SK_COLS = [["kod", "Stok kodu"], ["ad", "Stok adı / tanımı"], ["grup", "Ana / alt grup"], ["depo", "Depo / adres"], ["miktar", "Stok adedi"], ["fiyat", "Alış fiyatı"], ["", ""]];
function skSortVal(i, k) {
  switch (k) {
    case "kod": return String(i.kod || "").toLocaleLowerCase("tr");
    case "ad": return String(i.ad || "").toLocaleLowerCase("tr");
    case "grup": return ((i.anaGrup || "") + " " + (i.altGrup || "")).toLocaleLowerCase("tr");
    case "depo": return ((i.depo || "") + " " + (i.adres || "")).toLocaleLowerCase("tr");
    case "miktar": return Number(i.miktar) || 0;
    case "fiyat": { const f = skPrice(i.id); return f ? Number(f.alisFiyat) || 0 : null; }
  }
}
function skListView(v) {
  const F = SK.F, pr = can("s.price"), mv = can("s.move");
  const deneme = SK.cnt.deneme > 0 || SK.items.some(i => i.deneme);
  if (document.activeElement && document.activeElement.id === "skQ" && $("#skList")) { skDrawList && skDrawList(); return; }
  v.innerHTML = `<div class="pkbar"><div class="filters">
      <select class="f${F.tip ? " on" : ""}" id="skTip" aria-label="Stok tipi"><option value="">Tüm tipler</option>${Object.entries(STK_TIP).map(([k, l]) => opt(k, `${k} · ${l}`, F.tip)).join("")}</select>
      <select class="f${F.ana ? " on" : ""}" id="skAna" aria-label="Ana grup"><option value="">Tüm ana gruplar</option>${skAnas().map(a => opt(a, a, F.ana)).join("")}</select>
      <select class="f${F.alt ? " on" : ""}" id="skAlt" aria-label="Alt grup"><option value="">Tüm alt gruplar</option>${skAlts(F.ana).map(a => opt(a, a, F.alt)).join("")}</select>
      <select class="f${F.depo ? " on" : ""}" id="skDepo" aria-label="Depo"><option value="">Tüm depolar</option>${skDepos().map(a => opt(a, a, F.depo)).join("")}</select>
      <select class="f${F.dur ? " on" : ""}" id="skDur" aria-label="Stok durumu">${[["", "Tüm durumlar"], ["stokta", "Stokta olanlar"], ["kritik", "Kritik seviye"], ["yok", "Stokta yok"], ["eksik", "Kritik + stokta yok"], ["fazla", "Fazla stok"], ["pasif", "Pasif kartlar"]].map(([a, l]) => opt(a, l, F.dur)).join("")}</select>
      <input class="f" id="skQ" type="search" placeholder="Kod (M-0101…) ya da ad, ölçü ara…" aria-label="Stokta ara" value="${esc(F.q)}"></div>
    <div class="filters"><span class="sortinfo" id="skInfo"></span><button type="button" class="btn ghost sm" id="skCsv">Excel'e aktar</button>${can("s.edit") ? '<button type="button" class="btn ghost sm" id="skBulk">Toplu aktar</button>' : ""}${deneme && can("s.delete") ? '<button type="button" class="btn ghost sm dangerb" id="skUnseed">Deneme ürünlerini sil</button>' : ""}</div></div>
    <div id="skList"></div><div id="skMore"></div>
    <p class="note" style="margin:-18px 0 28px">Liste sunucuda süzülür; çok sayıda kart olduğu için en fazla ${nf(SK.lim, 0)} kart gösterilir, aramayla daraltın. Satır rengi stok seviyesini gösterir: <b style="color:var(--k-izinsiz)">stokta yok</b>, <b style="color:var(--k-gec)">kritik (minimum ve altı)</b>, <b style="color:var(--k-gunluk)">fazla (maksimum üstü)</b>. Miktar yalnızca giriş, çıkış ve sayım hareketleriyle değişir; her hareket kaydedilir.</p>`;
  const rowsOf = () => {
    const toks = skNorm(F.q.trim()).split(/[^0-9a-zçğıöşü]+/).filter(Boolean), kodQ = F.q.trim().toLocaleUpperCase("tr");
    return SK.page.filter(i => {
      if (F.tip && i.tip !== F.tip) return false;
      if (toks.length && !String(i.kod || "").startsWith(kodQ)) { const ws = new Set(i.kelimeler || skWords(i)); if (!toks.every(t => ws.has(t.slice(0, 11)) || [...ws].some(w => w.startsWith(t)))) return false; }
      if (F.dur === "stokta" && !(Number(i.miktar) > 0)) return false;
      if (F.dur === "pasif" ? i.aktif !== false : i.aktif === false) return false;
      if (F.ana && i.anaGrup !== F.ana) return false; if (F.alt && i.altGrup !== F.alt) return false; if (F.depo && i.depo !== F.depo) return false;
      const l = skLevel(i).k;
      if (F.dur === "kritik" && l !== "kritik") return false; if (F.dur === "yok" && l !== "yok") return false;
      if (F.dur === "eksik" && l !== "kritik" && l !== "yok") return false; if (F.dur === "fazla" && l !== "fazla") return false;
      return true;
    }).sort((a, b) => {
      const k = SK.SORT.key, va = skSortVal(a, k), vb = skSortVal(b, k), na = va == null || va === "", nb = vb == null || vb === "";
      if (na && !nb) return 1; if (nb && !na) return -1;
      const r = na && nb ? 0 : typeof va === "string" ? va.localeCompare(vb, "tr", { numeric: true }) : va - vb;
      return r * SK.SORT.dir || String(a.kod).localeCompare(String(b.kod), "tr", { numeric: true });
    });
  };
  const draw = () => {
    const rows = rowsOf(), cols = SK_COLS.filter(c => c[0] !== "fiyat" || pr);
    $("#skInfo").textContent = SK.pageLoading ? "Yükleniyor…" : `${nf(rows.length, 0)} kart gösteriliyor${SK.cnt.toplam != null ? " · toplam " + nf(SK.cnt.toplam, 0) : ""}`;
    $("#skMore").innerHTML = SK.more ? `<div style="text-align:center;margin:-16px 0 28px"><button type="button" class="btn ghost" id="skMoreB">Daha fazla göster (+${SK.lim >= 1000 ? 500 : 200})</button></div>` : "";
    const mb = $("#skMoreB"); if (mb) mb.onclick = () => { SK.lim += SK.lim >= 1000 ? 500 : 200; skPageWatch(); };
    const head = `<div class="lhead" role="row">${cols.map(([k, l]) => { if (!k) return "<div></div>"; const on = SK.SORT.key === k;
      return `<div role="columnheader"><button class="sort" data-ssort="${k}" ${on ? "data-on" : ""}>${l}<span class="ar">${on ? (SK.SORT.dir > 0 ? "▲" : "▼") : "↕"}</span></button></div>`; }).join("")}</div>`;
    $("#skList").innerHTML = `<div class="ledger skled${pr ? "" : " nopr"}" role="table">${head}${rows.length ? rows.map(i => {
      const L = skLevel(i), f = skPrice(i.id), mx = Math.max(Number(i.maxStok) || 0, (Number(i.minStok) || 0) * 2, Number(i.miktar) || 0, 1), pct = Math.max(0, Math.min(100, (Number(i.miktar) || 0) / mx * 100));
      return `<div class="row" role="row" tabindex="0" data-sk="${esc(i.id)}" style="--stripe:${L.k === "ok" ? "transparent" : L.c}">
        <div class="skc"><span class="num">${esc(i.kod)}</span>${i.deneme ? '<span class="ttag" style="--tc:var(--warn)">DENEME</span>' : ""}</div>
        <div class="ska"><b>${esc(i.ad)}</b>${i.tanim ? `<div class="desc">${esc(i.tanim)}</div>` : i.tip ? `<div class="desc">${esc(STK_TIP[i.tip] || i.tip)}</div>` : ""}</div>
        <div class="skg">${i.anaGrup ? `<span>${esc(i.anaGrup)}</span>` : '<span class="date none">—</span>'}${i.altGrup ? `<small>${esc(i.altGrup)}</small>` : ""}</div>
        <div class="skg">${i.depo ? `<span>${esc(i.depo)}</span>` : '<span class="date none">—</span>'}${i.adres ? `<small class="num">${esc(i.adres)}</small>` : ""}</div>
        <div class="skm"><span class="q num" style="color:${L.k === "ok" ? "var(--ink)" : L.c}">${nf(i.miktar)}</span> <span class="u">${esc(i.birim || "Adet")}</span>
          <div class="bar" title="Min ${nf(i.minStok)} · Max ${i.maxStok ? nf(i.maxStok) : "—"}"><span style="width:${pct}%;--fill:${L.c}"></span>${i.minStok ? `<em style="left:${Math.min(100, (Number(i.minStok) || 0) / mx * 100)}%"></em>` : ""}</div>
          ${L.k !== "ok" ? `<small style="color:${L.c}">${L.l}${i.minStok ? " · min " + nf(i.minStok) : ""}</small>` : ""}</div>
        ${pr ? `<div class="skp">${f ? `<span class="num">${money(f.alisFiyat, f.pb)}</span><small>${(f.arsiv || []).length > 1 ? skTrend(f) : "KDV %" + (f.kdv ?? 20)}</small>` : '<span class="date none">—</span>'}</div>` : ""}
        <div class="skact">${mv && i.aktif !== false ? `<button type="button" class="qb ok" data-mv="giris" data-id="${esc(i.id)}" title="Stok girişi">+ Giriş</button><button type="button" class="qb ba" data-mv="cikis" data-id="${esc(i.id)}" title="Stok çıkışı">− Çıkış</button>` : ""}</div>
      </div>`;
    }).join("") : `<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Bu filtrelere uyan stok kartı yok.</div>`}</div>`;
    $("#skList").querySelectorAll("[data-ssort]").forEach(b => b.onclick = () => { const k = b.dataset.ssort; SK.SORT = SK.SORT.key !== k ? { key: k, dir: 1 } : { key: k, dir: -SK.SORT.dir }; draw(); });
    $("#skList").querySelectorAll("[data-sk]").forEach(el => { const go = () => skOpenCard(el.dataset.sk); el.onclick = go; el.onkeydown = e => { if (e.key === "Enter") go(); }; });
    $("#skList").querySelectorAll("[data-mv]").forEach(b => b.onclick = e => { e.stopPropagation(); skOpenMove(b.dataset.id, b.dataset.mv); });
  };
  draw(); skDrawList = draw;
  const re = () => { SK.lim = 200; skPageWatch(); renderStok(); };
  $("#skTip").onchange = e => { F.tip = e.target.value; re(); };
  $("#skAna").onchange = e => { F.ana = e.target.value; F.alt = ""; re(); };
  $("#skAlt").onchange = e => { F.alt = e.target.value; re(); };
  $("#skDepo").onchange = e => { F.depo = e.target.value; re(); };
  $("#skDur").onchange = e => { F.dur = e.target.value; re(); };
  let qt = null; $("#skQ").oninput = e => { F.q = e.target.value; draw(); clearTimeout(qt); qt = setTimeout(() => { SK.lim = 200; skPageWatch(); }, 350); };
  $("#skCsv").onclick = () => skCsv(rowsOf());
  const bk = $("#skBulk"); if (bk) bk.onclick = skOpenBulk;
  const us = $("#skUnseed"); if (us) { let armed = false; us.onclick = async () => { if (!armed) { armed = true; us.textContent = "Silmek için tekrar basın"; return; } us.disabled = true; await skUnseed(); }; }
}
let skDrawList = null;
function skTrend(f) {
  const a = f.arsiv || [], n = a.length; if (n < 2) return "";
  const p = Number(a[n - 2].fiyat) || 0, c = Number(a[n - 1].fiyat) || 0; if (!p || a[n - 2].pb !== a[n - 1].pb) return "";
  const d = (c - p) / p * 100; return `<span class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} %${nf(Math.abs(d), 1)}</span>`;
}

/* Hareketler */
function skMovView(v) {
  const ay = SK.ay, [y, m] = ay.split("-").map(Number), HF = SK.HF;
  const all = (SK.movBy[ay] || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const q = HF.q.trim().toLocaleLowerCase("tr");
  v.innerHTML = `<div class="pkbar"><div class="pkdate"><button type="button" class="btn ghost sm" id="hPrev" aria-label="Önceki ay">‹</button><b class="pkmon">${MON_L[m - 1]} ${y}</b><button type="button" class="btn ghost sm" id="hNext" aria-label="Sonraki ay"${ay >= ayOf(TODAY) ? " disabled" : ""}>›</button>
      <span class="pkwd">${all.filter(h => h.tip === "giris").length} giriş · ${all.filter(h => h.tip === "cikis").length} çıkış · ${all.filter(h => h.tip === "sayim").length} sayım</span></div>
      <div class="filters"><select class="f${HF.tip ? " on" : ""}" id="hTip" aria-label="Hareket türü"><option value="">Tüm hareketler</option>${Object.entries(ST_TIP).map(([k, [l]]) => opt(k, l, HF.tip)).join("")}</select>
      <input class="f" id="hQ" type="search" placeholder="Stok, belge, açıklama ara…" aria-label="Hareketlerde ara" value="${esc(HF.q)}"><button type="button" class="btn ghost sm" id="hCsv">Excel'e aktar</button></div></div>
    <div id="hList"></div>`;
  const rowsOf = () => all.filter(h => (!HF.tip || h.tip === HF.tip) && (!q || [h.kod, h.ad, h.belge, h.aciklama, h.by, h.depo].join(" ").toLocaleLowerCase("tr").includes(q)));
  const draw = () => {
    const rows = rowsOf();
    $("#hList").innerHTML = `<div class="ledger hled" role="table"><div class="lhead" role="row"><div>Tarih</div><div>Hareket</div><div>Stok</div><div>Miktar</div><div>Kalan</div><div>Belge / açıklama</div><div>Kişi</div></div>${rows.length ? rows.map(skMovRow).join("") : '<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Bu ay için uygun hareket yok.</div>'}</div>`;
    $("#hList").querySelectorAll("[data-hs]").forEach(el => el.onclick = () => skOpenCard(el.dataset.hs, "har"));
  };
  draw();
  $("#hPrev").onclick = () => { SK.ay = prevAy(ay); skWatch(); renderStok(); };
  $("#hNext").onclick = () => { SK.ay = nextAy(ay); skWatch(); renderStok(); };
  $("#hTip").onchange = e => { HF.tip = e.target.value; draw(); };
  $("#hQ").oninput = e => { HF.q = e.target.value; draw(); };
  $("#hCsv").onclick = () => skCsvMov(rowsOf(), ay);
}
const skTs = ts => new Date(ts).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
function skMovRow(h, mini) {
  const t = ST_TIP[h.tip] || [h.tip, "var(--ink-3)"], d = Number(h.miktar) || 0;
  return `<div class="row" role="row"${mini ? "" : ` data-hs="${esc(h.sid)}" tabindex="0"`} style="--stripe:${t[1]}">
    <div><span class="date">${skTs(h.ts).split(" ")[0]}</span><div class="when">${skTs(h.ts).split(" ")[1] || ""}</div></div>
    <div><span class="kst" style="--tc:${t[1]}">${esc(t[0])}</span></div>
    ${mini ? "" : `<div class="ska"><span class="num skk">${esc(h.kod)}</span> <b>${esc(h.ad)}</b></div>`}
    <div class="num hq" style="color:${d > 0 ? "var(--k-fabrikada)" : d < 0 ? "var(--k-izinsiz)" : "var(--ink-3)"}">${d > 0 ? "+" : ""}${nf(d)} <small>${esc(h.birim || "")}</small></div>
    <div class="num">${nf(h.sonra)}</div>
    <div class="izs">${h.belge ? `<b class="num">${esc(h.belge)}</b> ` : ""}${esc(h.aciklama || "")}</div>
    <div class="izs">${esc(h.by || "")}</div></div>`;
}

/* Stok kartı */
function skOpenCard(id, tab) {
  const it = id ? skFind(id) : null; if (id && !it) { skGet(id).then(x => x ? skOpenCard(id, tab) : toast("Stok kartı bulunamadı")); return; }
  const ed = can("s.edit"), pr = can("s.price"), dis = ed ? "" : " disabled";
  const sid = it ? it.id : doc(collection(fs, "stok")).id;
  let T = it ? (tab || "kart") : "kart", hist = [], histUnsub = null, foto = null, fotoNew = undefined, form = null;
  if (it) {
    histUnsub = onSnapshot(query(collection(fs, "stok_hareket"), where("sid", "==", it.id)), s => { hist = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.ts || 0) - (a.ts || 0)); if (T !== "kart") paint(); else { const c = $("#skHc"); if (c) c.textContent = hist.length; } }, () => {});
    getDoc(doc(fs, "stok_foto", it.id)).then(s => { if (s.exists()) { foto = s.data().data; const b = $("#skFoto"); if (b && fotoNew === undefined) paintFoto(); } }).catch(() => {});
  }
  onDrawerClose = () => { if (histUnsub) histUnsub(); skDrawerRefresh = null; };
  skDrawerRefresh = () => { if (T !== "kart") paint(); };
  const keep = () => { if (!$("#cKod")) return; form = {}; document.querySelectorAll("#skForm [id]").forEach(el => { if ("value" in el) form[el.id] = el.type === "checkbox" ? el.checked : el.value; }); };
  const paintFoto = () => { const b = $("#skFoto"); if (!b) return; const src = fotoNew !== undefined ? fotoNew : foto;
    b.innerHTML = src ? `<img src="${src}" alt="Ürün fotoğrafı">` : `<span>${svgIco("stok")}<small>Fotoğraf yok</small></span>`; const r = $("#skFotoRm"); if (r) r.hidden = !src; };
  function paint() {
    const cur = SK.items.find(x => x.id === sid) || it, f = skPrice(sid) || {}, t = (cur && cur.ted) || {};
    const L = cur ? skLevel(cur) : null;
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer${$("#drawerHost .drawer") ? " noanim" : ""}" role="dialog" aria-modal="true" aria-labelledby="skT" style="width:min(760px,100%)">
      <div class="dh"><h2 id="skT">${cur ? `<span class="num skk">${esc(cur.kod)}</span> ${esc(cur.ad)}` : "Yeni stok kartı"}</h2><button class="x" id="skX" aria-label="Kapat">×</button></div>
      ${cur ? `<div class="skhead"><div class="skbig" style="--tc:${L.c}"><b class="num">${nf(cur.miktar)}</b><span>${esc(cur.birim || "Adet")} · ${L.l}</span></div>
        <div class="skhm"><span>${esc([cur.depo, cur.adres].filter(Boolean).join(" · ") || "Depo girilmedi")}</span><span>Min ${nf(cur.minStok)}${cur.maxStok ? " · Max " + nf(cur.maxStok) : ""}${cur.sonHareket ? " · son hareket " + skTs(cur.sonHareket) : ""}</span></div>
        <div class="skhb">${can("s.move") && cur.aktif !== false ? `<button type="button" class="qb ok" data-cmv="giris">+ Giriş</button><button type="button" class="qb ba" data-cmv="cikis">− Çıkış</button>` : ""}${can("s.count") && cur.aktif !== false ? '<button type="button" class="qb mo" data-cmv="sayim">Sayım</button>' : ""}</div></div>
        <div class="seg sktabs" role="tablist"><button type="button" data-ct="kart" aria-pressed="${T === "kart"}">Kart bilgileri</button><button type="button" data-ct="har" aria-pressed="${T === "har"}">Stok hareketleri <span class="acount num" id="skHc">${hist.length}</span></button>${pr ? `<button type="button" data-ct="fiy" aria-pressed="${T === "fiy"}">Alış fiyatı arşivi <span class="acount num">${(f.arsiv || []).length}</span></button>` : ""}</div>` : ""}
      <div class="db" id="skBody">${T === "kart" ? cardForm(cur, f, t) : T === "har" ? histHtml(cur) : priceHtml(cur, f)}</div>
      ${T === "kart" ? `<div class="df"><span>${cur && can("s.delete") ? '<button class="btn danger" id="cDel" type="button">Sil</button>' : ""}</span><div class="r"><button class="btn ghost" id="cC" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="cS" type="button">Kaydet</button>' : ""}</div></div>` : ""}
    </aside>`;
    $("#scrim").onclick = closeDrawer; $("#skX").onclick = closeDrawer;
    document.querySelectorAll("[data-ct]").forEach(b => b.onclick = () => { if (T === "kart") keep(); T = b.dataset.ct; paint(); });
    document.querySelectorAll("[data-cmv]").forEach(b => b.onclick = () => skOpenMove(sid, b.dataset.cmv, () => skOpenCard(sid, T === "kart" ? "har" : T)));
    if (T === "kart") bindForm(cur, f);
    if (T === "fiy") bindPrice(cur, f);
  }
  function cardForm(cur, f, t) {
    const v = (k, d = "") => form && k in form ? form[k] : d;
    const anaV = v("cAna", cur ? cur.anaGrup || "" : "");
    return `<div id="skForm">
      <div class="skf-top"><div class="skfoto"><div id="skFoto" class="ph"></div>${ed ? `<div class="r"><button type="button" class="btn ghost sm" id="skFotoAdd">Fotoğraf ekle</button><button type="button" class="btn ghost sm" id="skFotoRm" hidden>Kaldır</button><input type="file" id="skFotoF" accept="image/*" hidden></div>` : ""}</div>
      <div class="fgrid" style="flex:1">
        <div class="field"><label for="cKod">Stok kodu *</label><div style="display:flex;gap:6px"><input id="cKod" maxlength="40" value="${esc(v("cKod", cur ? cur.kod : ""))}" placeholder="M-010100001" style="text-transform:uppercase;font-family:var(--mono)"${dis}>${ed ? '<button type="button" class="btn ghost sm" id="cKodS" title="Stok tipi + ana grup kodu + alt grup kodu seçiliyse M-0101 00001 düzeninde, değilse ana grubun ilk harfleriyle sıradaki kodu verir">Öner</button>' : ""}</div></div>
        <div class="field"><label for="cTip">Stok tipi (genel kod)</label><select id="cTip"${dis}><option value="">Seçin</option>${Object.entries(STK_TIP).map(([k, l]) => opt(k, k + " · " + l, v("cTip", cur ? cur.tip || "" : ""))).join("")}</select></div>
        <div class="field full"><label for="cAd">Stok adı *</label><input id="cAd" maxlength="120" value="${esc(v("cAd", cur ? cur.ad : ""))}" placeholder="Örn. Galvaniz sac 0,8 mm 1000×2000"${dis}></div>
      </div></div>
      <div class="fgrid">
        <div class="field full"><label for="cTan">Stok tanımı</label><textarea id="cTan" maxlength="1000" placeholder="Ölçü, malzeme, kalite, kullanıldığı ürün…"${dis}>${esc(v("cTan", cur ? cur.tanim || "" : ""))}</textarea></div>
        <div class="field"><label for="cAk">Ana grup kodu</label><select id="cAk"${dis}>${skAnaKodOpts(v("cTip", cur ? cur.tip || "" : ""), v("cAk", cur ? cur.anaKod || "" : ""))}</select></div>
        <div class="field"><label for="cLk">Alt grup kodu</label><select id="cLk"${dis}>${skAltKodOpts(v("cTip", cur ? cur.tip || "" : ""), v("cAk", cur ? cur.anaKod || "" : ""), v("cLk", cur ? cur.altKod || "" : ""))}</select></div>
        <div class="field"><label for="cAna">Ana grup</label><input id="cAna" list="cAnaL" maxlength="60" value="${esc(anaV)}" placeholder="Örn. Hammadde"${dis}><datalist id="cAnaL">${skAnas().map(a => `<option value="${esc(a)}">`).join("")}</datalist></div>
        <div class="field"><label for="cAlt">Alt grup</label><input id="cAlt" list="cAltL" maxlength="60" value="${esc(v("cAlt", cur ? cur.altGrup || "" : ""))}" placeholder="Örn. Sac"${dis}><datalist id="cAltL">${skAlts(anaV).map(a => `<option value="${esc(a)}">`).join("")}</datalist></div>
        <div class="field"><label for="cBar">Barkod</label><input id="cBar" maxlength="40" value="${esc(v("cBar", cur ? cur.barkod || "" : ""))}" placeholder="İsteğe bağlı"${dis}></div>
        <div class="field"><label for="cDepo">Bulunduğu depo</label><input id="cDepo" list="cDepoL" maxlength="60" value="${esc(v("cDepo", cur ? cur.depo || "" : ""))}" placeholder="Örn. Ana depo"${dis}><datalist id="cDepoL">${skDepos().map(a => `<option value="${esc(a)}">`).join("")}</datalist></div>
        <div class="field"><label for="cAdr">Depo içi adres</label><input id="cAdr" maxlength="40" value="${esc(v("cAdr", cur ? cur.adres || "" : ""))}" placeholder="Raf-göz, örn. A-03-2" style="font-family:var(--mono)"${dis}></div>
        <div class="field"><label for="cBir">Birim</label><select id="cBir"${dis}>${[...new Set([...ST_BIRIM, cur && cur.birim].filter(Boolean))].map(b => opt(b, b, v("cBir", cur ? cur.birim || "Adet" : "Adet"))).join("")}</select></div>
        ${cur ? `<div class="field"><label>Stok adedi</label><input value="${esc(nf(cur.miktar))} ${esc(cur.birim || "")}" disabled><span class="note">Giriş, çıkış veya sayım ile değişir</span></div>`
          : `<div class="field"><label for="cMik">Açılış stok adedi</label><input id="cMik" type="number" step="any" min="0" value="${esc(v("cMik", ""))}" placeholder="0"${dis}><span class="note">Açılış hareketi olarak kaydedilir</span></div>`}
        <div class="field"><label for="cMin">Minimum stok (kritik seviye)</label><input id="cMin" type="number" step="any" min="0" value="${esc(v("cMin", cur && cur.minStok != null ? cur.minStok : ""))}"${dis}></div>
        <div class="field"><label for="cMax">Maksimum stok</label><input id="cMax" type="number" step="any" min="0" value="${esc(v("cMax", cur && cur.maxStok ? cur.maxStok : ""))}" placeholder="İsteğe bağlı"${dis}></div>
      </div>
      <section><h3 class="sec-t">Tedarikçi detayı</h3><div class="fgrid">
        <div class="field"><label for="tFir">Tedarikçi firma</label><input id="tFir" list="tFirL" maxlength="100" value="${esc(v("tFir", t.firma || ""))}"${dis}><datalist id="tFirL">${sortTr(SK.items.map(i => i.ted && i.ted.firma)).map(a => `<option value="${esc(a)}">`).join("")}</datalist></div>
        <div class="field"><label for="tYet">Yetkili kişi</label><input id="tYet" maxlength="80" value="${esc(v("tYet", t.yetkili || ""))}"${dis}></div>
        <div class="field"><label for="tTel">Telefon</label><input id="tTel" type="tel" maxlength="30" value="${esc(v("tTel", t.tel || ""))}"${dis}></div>
        <div class="field"><label for="tMail">E-posta</label><input id="tMail" type="email" maxlength="100" value="${esc(v("tMail", t.eposta || ""))}"${dis}></div>
        <div class="field"><label for="tKod">Tedarikçi ürün kodu</label><input id="tKod" maxlength="60" value="${esc(v("tKod", t.kod || ""))}"${dis}></div>
        <div class="field"><label for="tGun">Teslim süresi (gün)</label><input id="tGun" type="number" min="0" max="365" value="${esc(v("tGun", t.teslimGun ?? ""))}"${dis}></div>
        <div class="field"><label for="tMoq">Minimum sipariş miktarı</label><input id="tMoq" type="number" step="any" min="0" value="${esc(v("tMoq", t.moq ?? ""))}"${dis}></div>
        <div class="field"><label for="tAlt">Alternatif tedarikçi</label><input id="tAlt" maxlength="100" value="${esc(v("tAlt", t.alternatif || ""))}"${dis}></div>
      </div>${!ed && t.tel ? `<a class="btn ghost" href="tel:${esc(String(t.tel).replace(/[^\d+]/g, ""))}" style="display:inline-block;margin-top:10px;text-decoration:none">Ara: ${esc(t.tel)}</a>` : ""}</section>
      ${pr ? `<section><h3 class="sec-t">Alış fiyatı <small>değişiklikler arşive yazılır</small></h3><div class="fgrid three">
        <div class="field"><label for="pF">Alış fiyatı (birim)</label><input id="pF" type="number" step="any" min="0" value="${esc(v("pF", f.alisFiyat ?? ""))}"${dis}></div>
        <div class="field"><label for="pPb">Para birimi</label><select id="pPb"${dis}>${ST_PB.map(p => opt(p, p, v("pPb", f.pb || "TRY"))).join("")}</select></div>
        <div class="field"><label for="pK">KDV %</label><select id="pK"${dis}>${["0", "1", "10", "20"].map(k => opt(k, "%" + k, String(v("pK", f.kdv ?? 20)))).join("")}</select></div>
      </div>${f.updatedAt ? `<p class="note" style="margin:6px 0 0">Son değişiklik: ${esc(f.updatedBy || "")} · ${skTs(f.updatedAt)}</p>` : ""}</section>` : ""}
      <section><div class="fgrid">
        <div class="field full"><label for="cNot">Notlar</label><textarea id="cNot" maxlength="2000" placeholder="Kullanım, uyarı, muadil ürün, sipariş notları…"${dis}>${esc(v("cNot", cur ? cur.not || "" : ""))}</textarea></div>
        ${cur ? `<label class="chk field"><input type="checkbox" id="cPas"${(form ? form.cPas : cur.aktif === false) ? " checked" : ""}${dis}> Pasif (kullanımdan kalktı)</label>` : ""}
      </div></section>
      ${cur ? `<p class="note" style="margin:0">Oluşturan: ${esc(cur.createdBy || "—")}${cur.updatedBy ? " · son düzenleyen " + esc(cur.updatedBy) : ""}</p>` : ""}
    </div>`;
  }
  function histHtml(cur) {
    const g = hist.filter(h => h.tip === "giris").reduce((s, h) => s + h.miktar, 0), c = -hist.filter(h => h.tip === "cikis").reduce((s, h) => s + h.miktar, 0);
    return `<div class="pkst"><div><b class="num">${hist.length}</b><span>hareket</span></div><div><b class="num" style="color:var(--k-fabrikada)">+${nf(g)}</b><span>toplam giriş</span></div><div><b class="num" style="color:var(--k-izinsiz)">−${nf(c)}</b><span>toplam çıkış</span></div><div><b class="num">${nf(cur.miktar)}</b><span>mevcut ${esc(cur.birim || "")}</span></div></div>
      <div class="ledger hled mini" role="table"><div class="lhead" role="row"><div>Tarih</div><div>Hareket</div><div>Miktar</div><div>Kalan</div><div>Belge / açıklama</div><div>Kişi</div></div>${hist.length ? hist.map(h => skMovRow(h, true)).join("") : '<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Bu kalemde henüz hareket yok.</div>'}</div>`;
  }
  function priceHtml(cur, f) {
    const a = (f.arsiv || []).slice().sort((x, y) => x.ts - y.ts);
    return `${a.length > 1 ? skSpark(a) : ""}
      <div class="ledger fled" role="table"><div class="lhead" role="row"><div>Tarih</div><div>Alış fiyatı</div><div>Değişim</div><div>Tedarikçi</div><div>Not</div><div>Giren</div></div>${a.length ? a.slice().reverse().map((x, k, arr) => {
        const p = arr[k + 1], d = p && p.pb === x.pb && Number(p.fiyat) ? (x.fiyat - p.fiyat) / p.fiyat * 100 : null;
        return `<div class="row" role="row"><div><span class="date">${skTs(x.ts).split(" ")[0]}</span></div><div class="num"><b>${money(x.fiyat, x.pb)}</b></div><div class="num">${d == null ? "—" : `<span class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} %${nf(Math.abs(d), 1)}</span>`}</div><div class="izs">${esc(x.tedarikci || "—")}</div><div class="izs">${esc(x.not || "")}</div><div class="izs">${esc(x.by || "")}</div></div>`;
      }).join("") : '<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Henüz fiyat girilmedi.</div>'}</div>
      ${can("s.price") ? `<section class="pfadd"><h3 class="sec-t">Yeni fiyat ekle</h3><div class="fgrid three">
        <div class="field"><label for="nF">Alış fiyatı</label><input id="nF" type="number" step="any" min="0"></div>
        <div class="field"><label for="nPb">Para birimi</label><select id="nPb">${ST_PB.map(p => opt(p, p, f.pb || "TRY")).join("")}</select></div>
        <div class="field"><label for="nT">Tedarikçi</label><input id="nT" maxlength="100" value="${esc((cur.ted && cur.ted.firma) || "")}"></div>
        <div class="field full"><label for="nN">Not</label><input id="nN" maxlength="120" placeholder="Örn. teklif no, kampanya, zam"></div>
      </div><button type="button" class="btn" id="nS" style="margin-top:10px">Fiyatı kaydet</button></section>` : ""}`;
  }
  function bindPrice(cur, f) {
    const b = $("#nS"); if (!b) return;
    b.onclick = async () => { const v = $("#nF").value; if (v === "" || Number(v) < 0) { toast("Fiyatı girin"); return; } b.disabled = true;
      try { await skSetPrice(sid, Number(v), $("#nPb").value, $("#nT").value.trim(), $("#nN").value.trim()); toast("Fiyat kaydedildi ve arşive eklendi"); setTimeout(paint, 120); } catch (x) { b.disabled = false; toast(writeErr(x)); } };
  }
  function bindForm(cur, f) {
    paintFoto();
    $("#cC").onclick = closeDrawer;
    $("#cAna").addEventListener("change", () => { $("#cAltL").innerHTML = skAlts($("#cAna").value).map(a => `<option value="${esc(a)}">`).join(""); });
    const tipS = $("#cTip"), akS = $("#cAk"), lkS = $("#cLk");
    if (tipS) tipS.onchange = () => { akS.innerHTML = skAnaKodOpts(tipS.value, ""); lkS.innerHTML = skAltKodOpts(tipS.value, "", ""); };
    if (akS) akS.onchange = () => { lkS.innerHTML = skAltKodOpts(tipS.value, akS.value, ""); const a = ((SK.cfg.kodlar || {})[tipS.value] || {})[akS.value]; if (a) { $("#cAna").value = a.ad; $("#cAltL").innerHTML = skAlts(a.ad).map(x => `<option value="${esc(x)}">`).join(""); } };
    if (lkS) lkS.onchange = () => { const a = ((SK.cfg.kodlar || {})[tipS.value] || {})[akS.value]; if (a && a.alt && a.alt[lkS.value]) $("#cAlt").value = a.alt[lkS.value]; };
    const ks = $("#cKodS"); if (ks) ks.onclick = async () => { ks.disabled = true; $("#cKod").value = await skSuggestCode({ tip: tipS.value, ana: akS.value, alt: lkS.value, anaAd: $("#cAna").value }); ks.disabled = false; };
    const fa = $("#skFotoAdd"); if (fa) { fa.onclick = () => $("#skFotoF").click(); $("#skFotoF").onchange = async e => { const fl = e.target.files[0]; if (!fl) return; try { const img = await loadImage(fl); fotoNew = shrinkImg(img, 700, 180000); paintFoto(); } catch (x) { toast(x.message); } }; }
    const fr = $("#skFotoRm"); if (fr) fr.onclick = () => { fotoNew = null; paintFoto(); };
    const del = $("#cDel"); if (del) { let armed = false; del.onclick = async () => {
      if (!armed) { armed = true; del.textContent = "Kart ve hareketleri silinsin mi? Tekrar basın"; toast("Kullanılmayan kalemi silmek yerine Pasif yapabilirsiniz; geçmişi korunur."); return; }
      del.disabled = true; try { await skDelete([cur.id]); toast(cur.ad + " silindi"); closeDrawer(); } catch (x) { del.disabled = false; toast(writeErr(x)); } }; }
    const sv = $("#cS"); if (!sv) return;
    sv.onclick = async () => {
      const g = k => ($("#" + k) || {}).value ?? "";
      const kod = g("cKod").trim().toLocaleUpperCase("tr").replace(/\s+/g, ""), ad = g("cAd").trim();
      if (!kod) { toast("Stok kodu girin"); $("#cKod").focus(); return; } if (!ad) { toast("Stok adı girin"); $("#cAd").focus(); return; }
      sv.disabled = true; let dup = null; try { dup = await skKodExists(kod, sid); } catch (x) {} sv.disabled = false;
      if (dup) { toast(`${kod} kodu zaten kullanılıyor: ${dup.ad}`); $("#cKod").focus(); return; }
      const numOr = (x, d = null) => x === "" ? d : Math.max(0, Number(x) || 0);
      const data = { kod, ad, barkod: g("cBar").trim(), tanim: g("cTan").trim(), anaGrup: g("cAna").trim(), altGrup: g("cAlt").trim(), depo: g("cDepo").trim(), adres: g("cAdr").trim().toLocaleUpperCase("tr"), birim: g("cBir") || "Adet",
        minStok: numOr(g("cMin"), 0), maxStok: numOr(g("cMax"), null), not: g("cNot").trim(),
        ted: { firma: g("tFir").trim(), yetkili: g("tYet").trim(), tel: g("tTel").trim(), eposta: g("tMail").trim(), kod: g("tKod").trim(), teslimGun: numOr(g("tGun")), moq: numOr(g("tMoq")), alternatif: g("tAlt").trim() },
        aktif: cur ? !$("#cPas").checked : true, tip: g("cTip"), anaKod: g("cAk"), altKod: g("cLk"), updatedAt: Date.now(), updatedBy: ME.name };
      data.seviye = skSeviye(cur ? cur.miktar : numOr(g("cMik"), 0), data.minStok, data.maxStok); data.kelimeler = skWords({ ...data, olcu: cur ? cur.olcu : "" });
      sv.disabled = true;
      try {
        if (cur) await updateDoc(doc(fs, "stok", sid), data);
        else {
          const ac = numOr(g("cMik"), 0), b = writeBatch(fs);
          b.set(doc(fs, "stok", sid), { ...data, miktar: ac, createdAt: Date.now(), createdBy: ME.name, sonHareket: ac ? Date.now() : null });
          if (ac) b.set(doc(collection(fs, "stok_hareket")), { sid, kod, ad, birim: data.birim, tip: "acilis", miktar: ac, once: 0, sonra: ac, belge: "", aciklama: "Açılış stoku", depo: data.depo, ts: Date.now(), ay: ayOf(TODAY), by: ME.name, uid: ME.uid });
          await b.commit();
        }
        if (pr && g("pF") !== "") await skSetPrice(sid, Number(g("pF")), g("pPb") || "TRY", data.ted.firma, cur ? "Kartta güncellendi" : "İlk fiyat", Number(g("pK")));
        if (fotoNew !== undefined) { if (fotoNew) await setDoc(doc(fs, "stok_foto", sid), { data: fotoNew, updatedAt: Date.now(), updatedBy: ME.name }); else await deleteDoc(doc(fs, "stok_foto", sid)).catch(() => {}); }
        if (cur && SK.cache.has(sid)) SK.cache.set(sid, { ...cur, ...data }); skCounts(1200);
        toast(cur ? "Stok kartı kaydedildi" : `${kod} · ${ad} eklendi`); closeDrawer();
      } catch (x) { sv.disabled = false; toast(writeErr(x)); }
    };
    if (!cur && ed) setTimeout(() => $("#cKod").focus(), 50);
  }
  paint();
}
function skSpark(a) {
  const W = 640, H = 120, P = 26, ys = a.map(x => Number(x.fiyat) || 0), mn = Math.min(...ys), mx = Math.max(...ys), rg = mx - mn || 1;
  const t0 = a[0].ts, t1 = a[a.length - 1].ts, tr = t1 - t0 || 1;
  const pts = a.map(x => [P + (x.ts - t0) / tr * (W - 2 * P), H - P - ((Number(x.fiyat) || 0) - mn) / rg * (H - 2 * P)]);
  return `<figure class="spark"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Alış fiyatı geçmişi"><polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round"/>${pts.map((p, k) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--brand)" stroke-width="2"><title>${skTs(a[k].ts).split(" ")[0]} · ${money(a[k].fiyat, a[k].pb)}</title></circle>`).join("")}
    <text x="${P}" y="14" class="sp-l">${money(mx, a[a.length - 1].pb)}</text><text x="${P}" y="${H - 6}" class="sp-l">${money(mn, a[a.length - 1].pb)}</text></svg><figcaption>Fiyat geçmişi · ${skTs(t0).split(" ")[0]} – ${skTs(t1).split(" ")[0]}</figcaption></figure>`;
}

/* Hareket girişi */
function skOpenMove(id, tip, back) {
  const it = skFind(id); if (!it) { skGet(id).then(x => x && skOpenMove(id, tip, back)); return; }
  if (tip === "sayim" ? !can("s.count") : !can("s.move")) { toast("Bu işlem için yetkiniz yok."); return; }
  if ($("#drawerHost").innerHTML) closeDrawer();   // açık stok kartını kapat (dönüşte yeniden açılır)
  const f = skPrice(id) || {}, pr = can("s.price");
  const paint = () => {
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="mvT" style="width:min(500px,100%)">
      <div class="dh"><h2 id="mvT">${esc(ST_TIP[tip][0])} · <span class="num skk">${esc(it.kod)}</span></h2><button class="x" id="mvX" aria-label="Kapat">×</button></div>
      <div class="db">
        <div class="pkhead"><span>${esc(it.ad)}</span><span>Mevcut: <b class="num">${nf(it.miktar)}</b> ${esc(it.birim || "")}</span></div>
        <div class="kopts sm" role="radiogroup">${["giris", "cikis", ...(can("s.count") ? ["sayim"] : [])].filter(k => k === "sayim" || can("s.move")).map(k => `<button type="button" role="radio" class="kopt${tip === k ? " on" : ""}" aria-checked="${tip === k}" data-mt="${k}" style="--tc:${ST_TIP[k][1]}"><i></i>${esc(ST_TIP[k][0])}</button>`).join("")}</div>
        <div class="fgrid">
          <div class="field"><label for="mQ">${tip === "sayim" ? "Sayılan miktar *" : "Miktar *"}</label><input id="mQ" type="number" step="any" min="0" inputmode="decimal" placeholder="${esc(it.birim || "Adet")}"><span class="note" id="mQn"></span></div>
          <div class="field"><label for="mTs">Tarih / saat</label><input id="mTs" type="datetime-local" value="${toLocalInput(Date.now())}" max="${toLocalInput(Date.now() + 36e5)}"></div>
          ${tip !== "sayim" ? `<div class="field"><label for="mB">${tip === "giris" ? "İrsaliye / fatura no" : "Belge / iş emri no"}</label><input id="mB" maxlength="60"></div>` : ""}
          <div class="field${tip === "sayim" ? "" : ""}"><label for="mA">${tip === "giris" ? "Giriş nedeni" : tip === "cikis" ? "Çıkış nedeni / verilen yer" : "Açıklama"}</label><input id="mA" list="mAL" maxlength="300" value="${esc(ST_ACIK[tip][0])}"><datalist id="mAL">${ST_ACIK[tip].map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
          ${tip === "giris" && pr ? `<div class="field"><label for="mF">Birim alış fiyatı</label><input id="mF" type="number" step="any" min="0" placeholder="${f.alisFiyat != null ? esc(nf(f.alisFiyat)) : ""}"><span class="note">Değiştiyse yazın; fiyat arşivine eklenir</span></div>
            <div class="field"><label for="mPb">Para birimi</label><select id="mPb">${ST_PB.map(p => opt(p, p, f.pb || "TRY")).join("")}</select></div>` : ""}
        </div>
      </div>
      <div class="df"><span></span><div class="r"><button class="btn ghost" id="mvC" type="button">Vazgeç</button><button class="btn" id="mvS" type="button">${tip === "giris" ? "Girişi kaydet" : tip === "cikis" ? "Çıkışı kaydet" : "Sayımı kaydet"}</button></div></div>
    </aside>`;
    const close = () => { closeDrawer(); if (back) back(); };
    $("#scrim").onclick = close; $("#mvX").onclick = close; $("#mvC").onclick = close;
    document.querySelectorAll("[data-mt]").forEach(b => b.onclick = () => { tip = b.dataset.mt; paint(); });
    const q = $("#mQ"), qn = $("#mQn"), cur = Number(it.miktar) || 0;
    q.oninput = () => { const n = Number(q.value) || 0; if (q.value === "") { qn.textContent = ""; return; }
      const after = tip === "giris" ? cur + n : tip === "cikis" ? cur - n : n;
      qn.innerHTML = tip === "sayim" ? `Fark: <b class="${n - cur < 0 ? "late" : "okt"}">${n - cur > 0 ? "+" : ""}${nf(n - cur)}</b>` : after < 0 ? `<b class="late">Stokta yalnızca ${nf(cur)} var</b>` : `Sonra: <b>${nf(after)}</b> ${esc(it.birim || "")}${it.minStok && after <= it.minStok ? ' · <b class="late">kritik seviyeye düşer</b>' : ""}`; };
    setTimeout(() => q.focus(), 50);
    $("#mvS").onclick = async () => {
      const n = Number(q.value); if (q.value === "" || !(n >= 0) || (tip !== "sayim" && n <= 0)) { toast("Miktarı girin"); q.focus(); return; }
      if (tip === "cikis" && n > cur) { toast(`Stokta yalnızca ${nf(cur)} ${it.birim || ""} var. Fark varsa önce sayım yapın.`); return; }
      if (tip === "sayim" && n === cur) { toast("Sayılan miktar mevcutla aynı; düzeltme gerekmiyor."); return; }
      $("#mvS").disabled = true;
      try {
        const ts = fromLocalInput($("#mTs").value) || Date.now();
        const d = await skMove(it, tip, n, { ts, belge: ($("#mB") || {}).value || "", aciklama: $("#mA").value.trim(), fiyat: ($("#mF") || {}).value, pb: ($("#mPb") || {}).value, tedarikci: it.ted && it.ted.firma });
        toast(`${it.kod}: ${d > 0 ? "+" : ""}${nf(d)} ${it.birim || ""} · yeni stok ${nf(cur + d)}`); close();
      } catch (x) { $("#mvS").disabled = false; toast(writeErr(x)); }
    };
  };
  paint();
}

/* Silme (kart + fiyat + fotoğraf + hareketler) */
async function skDelete(ids) {
  for (const id of ids) {
    const hs = await getDocs(query(collection(fs, "stok_hareket"), where("sid", "==", id)));
    const refs = hs.docs.map(d => doc(fs, "stok_hareket", d.id));
    for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(fs); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
    const b = writeBatch(fs); b.delete(doc(fs, "stok", id)); if (can("s.price")) b.delete(doc(fs, "stok_fiyat", id)); await b.commit();
    await deleteDoc(doc(fs, "stok_foto", id)).catch(() => {});
  }
}

/* Excel çıktıları */
function csvDl(lines, name) {
  const q = x => { const s = String(x ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.map(r => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function skCsv(rows) {
  const pr = can("s.price");
  csvDl([["Stok kodu", "Stok adı", "Stok tanımı", "Ana grup", "Alt grup", "Depo", "Depo içi adres", "Stok adedi", "Birim", "Min stok", "Max stok", "Durum", "Tedarikçi", "Yetkili", "Telefon", "Tedarikçi kodu", ...(pr ? ["Alış fiyatı", "Para birimi", "KDV %", "Stok değeri (TL)"] : []), "Notlar"],
    ...rows.map(i => { const f = skPrice(i.id) || {}, t = i.ted || {}; return [i.kod, i.ad, i.tanim || "", i.anaGrup || "", i.altGrup || "", i.depo || "", i.adres || "", nf(i.miktar, 4), i.birim || "", i.minStok ?? "", i.maxStok ?? "", skLevel(i).l, t.firma || "", t.yetkili || "", t.tel || "", t.kod || "", ...(pr ? [f.alisFiyat != null ? nf(f.alisFiyat, 4) : "", f.pb || "", f.kdv ?? "", skValue(i) ? nf(skValue(i)) : ""] : []), i.not || ""]; })], `stok-listesi-${TODAY}.csv`);
  toast("Stok listesi indirildi (Excel ile açılır)");
}
function skCsvMov(rows, ay) {
  csvDl([["Tarih", "Hareket", "Stok kodu", "Stok adı", "Miktar", "Birim", "Önceki", "Sonraki", "Belge", "Açıklama", "Depo", "Kişi"],
    ...rows.map(h => [skTs(h.ts), (ST_TIP[h.tip] || [h.tip])[0], h.kod, h.ad, nf(h.miktar, 4), h.birim || "", nf(h.once, 4), nf(h.sonra, 4), h.belge || "", h.aciklama || "", h.depo || "", h.by || ""])], `stok-hareketleri-${ay}.csv`);
  toast("Hareketler indirildi (Excel ile açılır)");
}

/* Excel'den toplu stok kartı aktarma */
function skOpenBulk() {
  if (!can("s.edit")) return;
  const pr = can("s.price");
  const cols = ["Stok kodu", "Stok adı", "Stok tanımı", "Ana grup", "Alt grup", "Depo", "Depo içi adres", "Birim", "Stok adedi", "Min stok", "Tedarikçi", ...(pr ? ["Alış fiyatı"] : [])];
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="sbT" style="width:min(720px,100%)">
    <div class="dh"><h2 id="sbT">Excel'den toplu stok kartı aktar</h2><button class="x" id="sbX" aria-label="Kapat">×</button></div>
    <div class="db"><p class="note" style="margin:0">Excel'de sütunları şu sırayla hazırlayın, satırları seçip kopyalayın ve aşağıya yapıştırın (başlık satırı varsa atlanır):</p>
      <div class="colord">${cols.map((c, k) => `<span><b>${k + 1}</b>${esc(c)}</span>`).join("")}</div>
      <div class="field"><label for="sbTa">Yapıştırın</label><textarea id="sbTa" class="cfgta" style="min-height:200px;font-family:var(--mono);font-size:12.5px;white-space:pre" placeholder="HAM-0010\tSac 1 mm\t…"></textarea></div>
      <div id="sbPrev"></div></div>
    <div class="df"><span class="note">Stok kodu zaten varsa satır atlanır. Stok adedi açılış hareketi olarak yazılır.</span><div class="r"><button class="btn ghost" id="sbC" type="button">Vazgeç</button><button class="btn" id="sbS" type="button" disabled>Aktar</button></div></div>
  </aside>`;
  $("#scrim").onclick = closeDrawer; $("#sbX").onclick = closeDrawer; $("#sbC").onclick = closeDrawer;
  let list = [];
  const num = s => { s = String(s || "").trim().replace(/\s/g, ""); if (!s) return null; if (/,\d{1,4}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); const n = Number(s); return isFinite(n) ? n : null; };
  $("#sbTa").oninput = () => {
    const have = new Set(), seen = new Set(), skip = [];
    list = [];
    $("#sbTa").value.split(/\r?\n/).forEach((l, k) => { if (!l.trim()) return; const a = l.split(/\t|;/).map(x => x.trim());
      if (k === 0 && /stok\s*kodu/i.test(a[0])) return;
      const kod = (a[0] || "").toLocaleUpperCase("tr").replace(/\s+/g, ""), ad = a[1] || "";
      if (!kod || !ad) { skip.push(`${k + 1}. satır: kod veya ad eksik`); return; }
      if (have.has(kod) || seen.has(kod)) { skip.push(`${kod}: kod zaten var`); return; }
      seen.add(kod);
      list.push({ kod, ad: ad.slice(0, 120), tanim: a[2] || "", anaGrup: a[3] || "", altGrup: a[4] || "", depo: a[5] || "", adres: (a[6] || "").toLocaleUpperCase("tr"), birim: a[7] || "Adet", miktar: Math.max(0, num(a[8]) || 0), minStok: Math.max(0, num(a[9]) || 0), firma: a[10] || "", fiyat: pr ? num(a[11]) : null });
    });
    list = list.slice(0, 500);
    $("#sbPrev").innerHTML = (list.length ? `<div class="izbal"><b>${list.length}</b> yeni stok kartı aktarılacak: ${esc(list.slice(0, 4).map(r => r.kod + " " + r.ad).join(", "))}${list.length > 4 ? "…" : ""}</div>` : "") + (skip.length ? `<p class="note">Atlanan ${skip.length} satır: ${esc(skip.slice(0, 5).join(" · "))}${skip.length > 5 ? "…" : ""}</p>` : "");
    $("#sbS").disabled = !list.length; $("#sbS").textContent = list.length ? list.length + " kartı aktar" : "Aktar";
  };
  $("#sbS").onclick = async () => {
    $("#sbS").disabled = true; const now = Date.now();
    try {
      // veritabanında zaten olan kodlar atlanır
      const ex = new Set(); for (let i = 0; i < list.length; i += 30) { const s = await getDocs(query(collection(fs, "stok"), where("kod", "in", list.slice(i, i + 30).map(r => r.kod)))); s.docs.forEach(d => ex.add(d.data().kod)); }
      const atl = list.filter(r => ex.has(r.kod)).length; list = list.filter(r => !ex.has(r.kod));
      if (!list.length) { toast("Tüm kodlar zaten kayıtlı"); $("#sbS").disabled = false; return; }
      for (let i = 0; i < list.length; i += 120) {
        const b = writeBatch(fs);
        list.slice(i, i + 120).forEach(r => { const ref = doc(collection(fs, "stok"));
          const tp = (r.kod.match(/^([A-ZÇĞİÖŞÜ]{1,2})-/) || [])[1], d0 = { kod: r.kod, ad: r.ad, barkod: "", tanim: r.tanim, anaGrup: r.anaGrup, altGrup: r.altGrup, depo: r.depo, adres: r.adres, birim: r.birim, miktar: r.miktar, minStok: r.minStok, maxStok: null, not: "", ted: { firma: r.firma }, tip: STK_TIP[tp] ? tp : "", aktif: true, createdAt: now, createdBy: ME.name, updatedAt: now, updatedBy: ME.name, sonHareket: r.miktar ? now : null };
          b.set(ref, { ...d0, seviye: skSeviye(r.miktar, r.minStok, null), kelimeler: skWords(d0) });
          if (r.miktar) b.set(doc(collection(fs, "stok_hareket")), { sid: ref.id, kod: r.kod, ad: r.ad, birim: r.birim, tip: "acilis", miktar: r.miktar, once: 0, sonra: r.miktar, belge: "", aciklama: "Toplu aktarım · açılış", depo: r.depo, ts: now, ay: ayOf(TODAY), by: ME.name, uid: ME.uid });
          if (r.fiyat != null) b.set(doc(fs, "stok_fiyat", ref.id), { alisFiyat: r.fiyat, pb: "TRY", kdv: 20, arsiv: [{ ts: now, fiyat: r.fiyat, pb: "TRY", tedarikci: r.firma, not: "Toplu aktarım", by: ME.name }], updatedAt: now, updatedBy: ME.name });
        });
        await b.commit();
      }
      toast(list.length + " stok kartı aktarıldı" + (atl ? ` · ${atl} kod zaten vardı, atlandı` : "")); skCounts(800); closeDrawer();
    } catch (x) { $("#sbS").disabled = false; toast(writeErr(x)); }
  };
}

/* Gruplar ve depolar */
function skOpenCfg() {
  if (!can("s.cfg")) return;
  const g = Object.entries(SK.cfg.gruplar).map(([a, l]) => a + ": " + (l || []).join(", ")).join("\n");
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="scT" style="width:min(560px,100%)">
    <div class="dh"><h2 id="scT">Gruplar ve depolar</h2><button class="x" id="scX" aria-label="Kapat">×</button></div>
    <div class="db">
      <div class="field"><label for="scG">Ana gruplar ve alt grupları</label><textarea id="scG" class="cfgta" style="min-height:160px" placeholder="Hammadde: Sac, Alüminyum profil, Boru\nSarf malzeme: Bağlantı elemanı, Boya, Kaynak\nMamul: Menfez, Difüzör, Damper">${esc(g)}</textarea><p class="note" style="margin:4px 0 0">Her satıra bir ana grup; iki noktadan sonra alt grupları virgülle yazın. Kartlarda yazılan yeni gruplar listeye kendiliğinden eklenir.</p></div>
      <div class="field"><label for="scD">Depolar</label><textarea id="scD" class="cfgta" placeholder="Ana depo\nMamul deposu\nSarf deposu">${esc(SK.cfg.depolar.join("\n"))}</textarea><p class="note" style="margin:4px 0 0">Her satıra bir depo.</p></div>
      <div class="field"><label for="scK">Kod sistemi (genel kod · ana grup · alt grup)</label><textarea id="scK" class="cfgta" style="min-height:180px;font-family:var(--mono);font-size:12.5px" placeholder="M-01 Tek sıra kanatlı menfez: 01 Dampersiz, 02 Damperli, 03 Damper">${esc(skKodlarText())}</textarea><p class="note" style="margin:4px 0 0">Her satıra bir ana grup: <b>genel kod-ana grup kodu ad: alt grup kodu ad, …</b>. Kod düzeni: M-0101 00001 = Mamul · 01 ana grup · 01 alt grup · 5 haneli sıra. Genel kodlar: ${Object.entries(STK_TIP).map(([k, l]) => k + " " + l).join(", ")}.</p></div>
      ${can("s.edit") ? `<section><h3 class="sec-t">Mamul kod kataloğu <small>${nf(skKatalog().length, 0)} kod</small></h3><p class="note" style="margin:0 0 8px">Stok Tespit Formu'nda işaretlenen mamuller: TSK, ÇSK, Lineer menfez (dampersiz/damperli), dış hava panjurları — 100×100'den 2000×2000'e 50 mm adımlarla; lineer ve gizli tavan slot difüzör (tekli–5'li, 1000 mm); müdahale kapakları (200×200–800×800). Var olan kodlar atlanır.</p>${SK.cfg.katalog ? `<p class="note okt" style="margin:0 0 8px">Yüklendi: ${esc(SK.cfg.katalog.by || "")} · ${SK.cfg.katalog.at ? skTs(SK.cfg.katalog.at) : ""} · ${nf(SK.cfg.katalog.adet || 0, 0)} kod</p>` : ""}<button type="button" class="btn ghost" id="scKat">${SK.cfg.katalog ? "Eksik kodları tamamla" : "Kataloğu yükle"}</button></section>
      <section><h3 class="sec-t">Deneme ürünleri</h3><p class="note" style="margin:0 0 8px">Toplantıda işleyişi göstermek için 5 örnek ürün (hareketler ve fiyat geçmişiyle). "DENEME" etiketiyle görünür, tek düğmeyle silinir.</p>
        ${SK.cnt.deneme > 0 || SK.items.some(i => i.deneme) ? (can("s.delete") ? '<button type="button" class="btn danger" id="scUn">Deneme ürünlerini sil</button>' : '<p class="note">Deneme ürünleri ekli.</p>') : '<button type="button" class="btn ghost" id="scSeed">Deneme ürünlerini ekle</button>'}</section>` : ""}
    </div>
    <div class="df"><span></span><div class="r"><button class="btn ghost" id="scC" type="button">Vazgeç</button><button class="btn" id="scS" type="button">Kaydet</button></div></div>
  </aside>`;
  $("#scrim").onclick = closeDrawer; $("#scX").onclick = closeDrawer; $("#scC").onclick = closeDrawer;
  const sd = $("#scSeed"); if (sd) sd.onclick = () => { closeDrawer(); skSeed(); };
  const kt = $("#scKat"); if (kt) kt.onclick = () => { closeDrawer(); skKatalogYukle(); };
  const un = $("#scUn"); if (un) { let armed = false; un.onclick = async () => { if (!armed) { armed = true; un.textContent = "Silmek için tekrar basın"; return; } un.disabled = true; await skUnseed(); closeDrawer(); }; }
  $("#scS").onclick = async () => {
    const gr = {}; $("#scG").value.split("\n").forEach(l => { const [a, ...r] = l.split(":"); const ana = (a || "").trim(); if (!ana) return; gr[ana] = [...new Set(r.join(":").split(",").map(x => x.trim()).filter(Boolean))].slice(0, 60); });
    const dep = [...new Set($("#scD").value.split("\n").map(x => x.trim()).filter(Boolean))].slice(0, 60);
    $("#scS").disabled = true;
    const kod = skParseKodlar($("#scK").value);
    try { await setDoc(doc(fs, "config", "stok"), { gruplar: gr, depolar: dep, kodlar: kod, updatedAt: Date.now(), updatedBy: ME.name }, { merge: true }); toast("Gruplar, kod sistemi ve depolar kaydedildi"); closeDrawer(); }
    catch (x) { $("#scS").disabled = false; toast(writeErr(x)); }
  };
}

/* Deneme ürünleri (toplantıda işleyişi göstermek için) */
async function skSeed() {
  if (!can("s.edit")) return;
  if (SK.cnt.deneme > 0 || SK.items.some(i => i.deneme)) { toast("Deneme ürünleri zaten ekli"); return; }
  const now = Date.now(), D = 864e5, pr = can("s.price");
  const S = [
    { kod: "HAM-0001", ad: "Galvaniz sac 0,8 mm 1000×2000", tanim: "DX51D Z100 galvaniz sac levha. Menfez ve kanal gövdesinde kullanılır.", anaGrup: "Hammadde", altGrup: "Sac", depo: "Ana depo", adres: "A-01-1", birim: "Levha", minStok: 50, maxStok: 300,
      ted: { firma: "Örnek Sac Ticaret A.Ş.", yetkili: "Satış birimi", tel: "0332 000 00 01", eposta: "satis@ornek-sac.com", kod: "GLV-08-1020", teslimGun: 3, moq: 50, alternatif: "Örnek Metal Ltd." },
      moves: [["acilis", 120, 40, "", "Açılış stoku"], ["giris", 100, 13, "İRS-2026-1184", "Satın alma girişi"], ["cikis", 45, 12, "İE-0412", "Üretime verildi"], ["cikis", 30, 6, "İE-0431", "Üretime verildi"]],
      prices: [[1050, 120, "Yıllık anlaşma"], [1120, 60, "Hammadde zammı"], [1240, 13, "İRS-2026-1184"]] },
    { kod: "HAM-0002", ad: "Alüminyum menfez kanat profili 6 m", tanim: "6063 T5 eloksal, AK-24 kalıp. Tek sıra kanatlı menfezlerde kullanılır.", anaGrup: "Hammadde", altGrup: "Alüminyum profil", depo: "Ana depo", adres: "B-04-2", birim: "Boy", minStok: 100, maxStok: 400,
      ted: { firma: "Örnek Alüminyum San.", yetkili: "Proje satış", tel: "0332 000 00 02", eposta: "info@ornek-al.com", kod: "AK-24-6000", teslimGun: 10, moq: 200 },
      moves: [["acilis", 260, 40, "", "Açılış stoku"], ["cikis", 90, 14, "İE-0418", "Üretime verildi"], ["cikis", 85, 4, "İE-0440", "Üretime verildi"]],
      prices: [[3.2, 90, "USD/kg bazlı teklif"], [3.45, 30, "LME artışı"]], pb: "USD" },
    { kod: "YAR-0001", ad: "Fan motoru 220 V 0,37 kW", tanim: "Dış rotorlu, 1400 d/dk. Fan coil ve aspiratör montajında.", anaGrup: "Satın alınan parça", altGrup: "Elektrik / motor", depo: "Ana depo", adres: "C-02-3", birim: "Adet", minStok: 10, maxStok: 40,
      ted: { firma: "Örnek Elektrik Motor Ltd.", yetkili: "Teknik satış", tel: "0212 000 00 03", kod: "FM-037-220", teslimGun: 15, moq: 10, alternatif: "Örnek Fan Sistemleri" },
      moves: [["acilis", 18, 40, "", "Açılış stoku"], ["giris", 10, 11, "İRS-7741", "Satın alma girişi"], ["cikis", 8, 12, "İE-0425", "Üretime verildi"], ["cikis", 2, 3, "", "Numune"]],
      prices: [[3650, 100, ""], [3900, 11, "İRS-7741"]] },
    { kod: "SRF-0001", ad: "Alüminyum perçin 4×10 (1000'lik kutu)", tanim: "Kör perçin, alüminyum gövde çelik çivi.", anaGrup: "Sarf malzeme", altGrup: "Bağlantı elemanı", depo: "Sarf deposu", adres: "S-05-1", birim: "Kutu", minStok: 5, maxStok: 30,
      ted: { firma: "Örnek Hırdavat", yetkili: "Mağaza", tel: "0332 000 00 04", teslimGun: 1, moq: 5 },
      moves: [["acilis", 12, 40, "", "Açılış stoku"], ["cikis", 6, 9, "", "Üretime verildi"], ["cikis", 6, 2, "", "Üretime verildi"]],
      prices: [[420, 200, ""], [465, 40, "Zam"]] },
    { kod: "MAM-0001", ad: "Lineer slot difüzör 2 yarık 1000 mm", tanim: "RAL 9016 elektrostatik boyalı, damperli plenum hariç.", anaGrup: "Mamul", altGrup: "Difüzör", depo: "Mamul deposu", adres: "M-01-2", birim: "Adet", minStok: 20, maxStok: 80,
      ted: { firma: "Kar-Men üretim", yetkili: "", kod: "" },
      moves: [["acilis", 30, 40, "", "Açılış stoku"], ["giris", 24, 10, "İE-0420", "Üretimden giriş"], ["cikis", 16, 9, "SVK-2026-233", "Satış / sevkiyat"]],
      prices: [[1850, 60, "Maliyet hesabı"], [1980, 9, "Güncel maliyet"]] }
  ];
  try {
    const b = writeBatch(fs);
    for (const s of S) {
      const ref = doc(collection(fs, "stok")); let q = 0;
      const mv = s.moves.map(([tip, n, gun, belge, ac]) => { const d = tip === "cikis" ? -n : n, once = q; q += d; const ts = now - gun * D - 3600e3 * (2 + (n % 5));
        return { sid: ref.id, kod: s.kod, ad: s.ad, birim: s.birim, tip, miktar: d, once, sonra: q, belge, aciklama: ac, depo: s.depo, ts, ay: ayOf(dayOf(ts)), by: ME.name, uid: ME.uid, deneme: true }; });
      const tp = { HAM: "H", YAR: "YM", SRF: "S", MAM: "M" }[s.kod.slice(0, 3)] || "";
      b.set(ref, { kod: s.kod, ad: s.ad, barkod: "", tanim: s.tanim, anaGrup: s.anaGrup, altGrup: s.altGrup, depo: s.depo, adres: s.adres, birim: s.birim, miktar: q, minStok: s.minStok, maxStok: s.maxStok, tip: tp,
        seviye: skSeviye(q, s.minStok, s.maxStok), kelimeler: skWords({ ...s, tip: tp }),
        not: "DENEME ÜRÜNÜ: toplantıda işleyişi göstermek için eklendi. Gruplar ve depolar ekranından tek düğmeyle silinir.", ted: s.ted, aktif: true, deneme: true, createdAt: now, createdBy: ME.name, updatedAt: now, updatedBy: ME.name, sonHareket: Math.max(...mv.map(m => m.ts)) });
      mv.forEach(m => b.set(doc(collection(fs, "stok_hareket")), m));
      if (pr) { const pb = s.pb || "TRY", ar = s.prices.map(([f, gun, not]) => ({ ts: now - gun * D, fiyat: f, pb, tedarikci: s.ted.firma, not, by: ME.name }));
        b.set(doc(fs, "stok_fiyat", ref.id), { alisFiyat: ar[ar.length - 1].fiyat, pb, kdv: 20, arsiv: ar, updatedAt: now, updatedBy: ME.name }); }
    }
    await b.commit();
    toast("5 deneme ürünü eklendi"); SK.F = { tip: "", ana: "", alt: "", depo: "", dur: "", q: "" }; skPageWatch(); skCounts(800);
  } catch (x) { toast(writeErr(x)); }
}
async function skUnseed() {
  try { const s = await getDocs(query(collection(fs, "stok"), where("deneme", "==", true))); const ids = s.docs.map(d => d.id); await skDelete(ids); ids.forEach(id => SK.cache.delete(id)); toast(ids.length + " deneme ürünü silindi"); skCounts(800); }
  catch (x) { toast(writeErr(x)); }
}

/* ================= PLANLAMA ================= */
// istasyon/{id}: iş istasyonları · akis/{id}: ürün iş akış şemaları (rota) · isemri/{id}: iş emirleri (operasyonlar akıştan kopyalanır)
const PL_BOLUM = [["kesim", "Kesim", "#1747c9"], ["bukum", "Büküm ve şekillendirme", "#6b45c9"], ["pres", "Presler ve makineler", "#0f7aa8"], ["kaynak", "Kaynak ve taşlama", "#c24a1e"],
  ["boya", "Yüzey hazırlık ve boya", "#b0367a"], ["montaj", "Montaj", "#14866d"], ["kanal", "Kanal imalatı", "#4a6b12"], ["paket", "Paketleme ve taşıma", "#b26b00"], ["alan", "Depo ve bekleme alanları", "#68707f"], ["diger", "Diğer", "#5b6578"]];
const PL_BC = Object.fromEntries(PL_BOLUM.map(([k, l, c]) => [k, { l, c }]));
const PL_BMAP = { TST: "kesim", GYT: "kesim", LZR: "kesim", PLZ: "kesim", ABK: "bukum", MRD: "bukum", CK: "bukum", EP: "pres", MK: "pres", KYN: "kaynak", "TŞL": "kaynak", DLD: "boya", BTBC: "boya", FRN: "boya", MNT: "montaj", KKM: "kanal", SPR: "kanal", KNT: "kanal", PKT: "paket", ARB: "paket", DEPO: "alan", BKL: "alan" };
const plBolumOf = kod => PL_BMAP[String(kod || "").split("-")[0].trim().toLocaleUpperCase("tr")] || "diger";
// Kar-Men iş istasyonları listesi (İş İstasyonları.xlsx)
const PL_IST_SEED = [["ABK-1", "CNC BÜKÜM MAKİNESİ"], ["TST-1", "KASA KESİM"], ["TST-2", "KASA KESİM"], ["TŞL-1", "TAŞLAMA VE TÖRPÜ ALANI"], ["EP-1", "KASA KANAT DELİĞİ / DELİK DELME"], ["EP-2", "ÇSK VE TSK İÇİN TIRNAK MAKİNESİ"],
  ["EP-3", "MONTAJ DELİĞİ MAKİNESİ"], ["EP-4", "KASALAMA KÖŞE PRESİ"], ["EP-5", "LİNEER MENFEZ KANAT DELME MAKİNESİ"], ["EP-6", "ANEMOSTAT KAPAK VE KLİPİN KÖŞE YAPMA MAKİNESİ"], ["EP-7", "ANEMOSTAT DELME MAKİNESİ"],
  ["EP-8", "ANEMOSTAT DELME VE SLOT ŞERİT MAKİNESİ"], ["EP-9", "BÜYÜK PANJUR KASASI DELME"], ["EP-10", "VOLUM DELME MAKİNESİ"], ["EP-11", "PANJUR KANAT MAKİNESİ"], ["EP-12", "ÇSK VE TSK İÇİN KANAT MAKİNESİ"],
  ["MK-1", "LİNEER KANAT TOPLAMA VE KASALAMA MAKİNESİ"], ["KYN-1", "KAYNAK İSTASYONU / OKSİJEN"], ["KYN-2", "KAYNAK İSTASYONU / ARGON"], ["MNT-1", "MONTAJ İSTASYONU / VİDALAMA VE TOPLAMA"], ["MNT-2", "MONTAJ İSTASYONU / KANAT TAKMA VE AYAR"],
  ["MRD-1", "MERDANE / YUVARLAK MENFEZLER İÇİN BÜKÜM MAKİNESİ"], ["GYT-1", "GİYOTİN MAKAS / KESİM MAKİNESİ"], ["DLD-1", "BOYA ÖNCESİ KİMYASAL DALDIRMA MAKİNESİ"], ["DLD-2", "BOYA ÖNCESİ SU DALDIRMA MAKİNESİ"],
  ["BTBC-1", "BOYA TABANCASI"], ["BTBC-2", "BOYA TABANCASI"], ["FRN-1", "BOYA FIRINI"], ["PKT-1", "PAKETLEME İSTASYONU"], ["ARB-1", "MALZEME TAŞIMA ARABASI"], ["KKM-1", "KARE KANAL MAKİNESİ"], ["SPR-1", "SPİRO MAKİNESİ"],
  ["SPR-2", "SPİRO MAKİNESİ"], ["LZR-1", "LAZER KESİM TEZGAHI"], ["PLZ-1", "PLAZMA KESİM TEZGAHI"], ["CK-1", "CAKA"], ["GYT-2", "GİYOTİN MAKAS / KESİM MAKİNESİ"], ["KNT-1", "KENET MAKİNESİ"],
  // iş akış şemalarında geçen alanlar / istasyonlar (listede yoktu)
  ["DEPO-1", "DEPO / MALZEME HAZIRLIK VE SEVKİYAT ALANI"], ["BKL-1", "BOYAHANE ÖNCESİ BEKLEME ALANI"], ["MNT-3", "MONTAJ İSTASYONU / DAMPER MONTAJI"]];
// Kar-Men ürün iş akış şemaları (Ürün İş Akış Şemaları.xlsx · Taslak v1)
const PL_AKIS_SEED = [{"kod":"AKS-TSK","ad":"Tek sıra kanat menfez","grup":"Menfez","aciklama":"Tek sıra ayarlı kanatlı havalandırma menfezi (besleme/emiş)","malzeme":"Alüminyum profil / sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü.","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Kasa profil kesimi","tanim":"Kasalara ait alüminyum profillerin boyutlarına göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"Kanat profil kesimi","tanim":"Kanat profillerinin belirlenen boyutlara göre kesilmesi.","ist":"EP-11","alt":"","onceki":[1]},{"no":4,"ad":"Çapak alma / törpüleme","tanim":"Kesilen kasalara ve kanat uçlarına törpüleme (çapak alma) işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[2]},{"no":5,"ad":"Kanat deliği delme","tanim":"Kasalara kanatların takılacağı kanat deliklerinin açılması.","ist":"EP-1","alt":"","onceki":[4]},{"no":6,"ad":"Tırnak açma","tanim":"Kasalara tırnak açılması.","ist":"EP-2","alt":"","onceki":[5]},{"no":7,"ad":"Montaj deliği delme","tanim":"Kasalara montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[6]},{"no":8,"ad":"Köşe takozu takma","tanim":"Kasalara köşe takozlarının/köşelerin takılması.","ist":"EP-4","alt":"","onceki":[7]},{"no":9,"ad":"Kasalama (pres)","tanim":"Kasalama presinde çerçevenin preslenerek birleştirilmesi.","ist":"EP-4","alt":"","onceki":[8]},{"no":10,"ad":"Kanat montajı","tanim":"Kasalara kanatların montajının yapılması.","ist":"MNT-1","alt":"","onceki":[9,3]},{"no":11,"ad":"Kanat sıkılaştırma ve ayar teli","tanim":"Kanat sıkılaştırma ve ayar tellerinin takılması.","ist":"MNT-2","alt":"","onceki":[10]},{"no":12,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[11]},{"no":13,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[12]},{"no":14,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[13]},{"no":15,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[14]},{"no":16,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[15]},{"no":17,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[16]},{"no":18,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[17]}]},{"kod":"AKS-ÇSK","ad":"Çift sıra kanat menfez","grup":"Menfez","aciklama":"Ön ve arka sıra kanatlı, yön ayarlı menfez","malzeme":"Alüminyum profil / sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü.","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Kasa profil kesimi","tanim":"Kasalara ait alüminyum profillerin boyutlarına göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"Ön ve arka kanat profil kesimi","tanim":"Ön ve arka sıra kanat profillerinin belirlenen boyutlara göre kesilmesi.","ist":"EP-12","alt":"","onceki":[1]},{"no":4,"ad":"Çapak alma / törpüleme","tanim":"Kesilen kasalara ve kanat uçlarına törpüleme (çapak alma) işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[3]},{"no":5,"ad":"Kanat deliği delme","tanim":"Kasalara ön ve arka sıra kanatların takılacağı çift sıra kanat deliklerinin açılması.","ist":"EP-1","alt":"","onceki":[4]},{"no":6,"ad":"Tırnak açma","tanim":"Kasalara tırnak açılması.","ist":"EP-2","alt":"","onceki":[5]},{"no":7,"ad":"Montaj deliği delme","tanim":"Kasalara montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[6]},{"no":8,"ad":"Köşe takozu takma","tanim":"Kasalara köşe takozlarının/köşelerin takılması.","ist":"EP-4","alt":"","onceki":[7]},{"no":9,"ad":"Kasalama (pres)","tanim":"Kasalama presinde çerçevenin preslenerek birleştirilmesi.","ist":"EP-4","alt":"","onceki":[8]},{"no":10,"ad":"Arka ve ön sıra kanat montajı","tanim":"Kasalara sırasıyla arka ve ön sıra kanatların montajının yapılması.","ist":"MNT-1","alt":"","onceki":[3,9]},{"no":11,"ad":"Kanat sıkılaştırma ve ayar teli","tanim":"Her iki sıra kanat için kanat sıkılaştırma ve ayar tellerinin takılması.","ist":"MNT-2","alt":"","onceki":[10]},{"no":12,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[11]},{"no":13,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[12]},{"no":14,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[13]},{"no":15,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[14]},{"no":16,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[15]},{"no":17,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[16]},{"no":18,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[17]}]},{"kod":"AKS-LNR","ad":"Lineer menfez","grup":"Menfez","aciklama":"Uzun, ince hat görünümlü lineer menfez","malzeme":"Alüminyum profil","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre lineer profil ve kasa malzemelerinin depodan çekilmesi, ölçü ve kalite kontrolünün yapılması.","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Dış kasa profil kesimi","tanim":"Lineer menfezin dış kasa profillerinin  proje ölçülerine göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"İç kanat profil kesimi","tanim":"Lineer menfezin uzunluğuna uygun olarak iç kanat profillerinin kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[2]},{"no":4,"ad":"Yüzük kesimi","tanim":"lineer menfez için yüzüklerin kesilmesi","ist":"TST-1","alt":"TST-2","onceki":[3]},{"no":5,"ad":"Çapak alma / törpüleme","tanim":"Kesilen kasa ve lineer kanat profillerine çapak alma ve törpüleme işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[1,2]},{"no":6,"ad":"Kanat geçme yuvası delme","tanim":"Kasa profillerine, lineer kanatların yerleşeceği geçme yuvalarının veya tutucu deliklerin açılması.","ist":"EP-5","alt":"","onceki":[5]},{"no":7,"ad":"Montaj deliği (vidalı ise)","tanim":"(Eğer vidalı montaj isteniyorsa) Kasanın üstüne vidalama için montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[6]},{"no":8,"ad":"Lineer kanat dizimi","tanim":"Kesilen lineer kanatların, özel ara elemanlar (tarak/bağlantı elemanları) yardımıyla kasanın içine aralıkları eşit olacak şekilde monte edilmesi.","ist":"MNT-1","alt":"","onceki":[7,3]},{"no":9,"ad":"Kanat sıkılaştırma","tanim":"Lineer kanatların sallanmasını ve ses yapmasını önlemek amacıyla sıkıştırma veya perçinleme/bağlantı işlemlerinin yapılması.","ist":"MNT-1","alt":"","onceki":[8]},{"no":10,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[9]},{"no":11,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[10]},{"no":12,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[11]},{"no":13,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[12]},{"no":14,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[13]},{"no":15,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[15]}]},{"kod":"AKS-KPM","ad":"Kare petek menfez","grup":"Menfez","aciklama":"Petek (egg-crate) peteği ile kare menfez","malzeme":"Alüminyum / sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Dış kasanın proje boyutlarına göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"İç kısımdaki kare petek kafesini oluşturacak dikey ve yatay çıtaların (veya petek bloğunun) belirlenen iç ölçülere göre kesilmesi.","ist":"MNT-1","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"Kesilen kasa ve petek profillerinin çapaklarının törpülenmesi.","ist":"TŞL-1","alt":"","onceki":[3]},{"no":5,"ad":"","tanim":"Kasa profillerine iç petek bloğunun oturacağı kanal veya tutucu deliklerin açılması.","ist":"EP-1","alt":"","onceki":[4]},{"no":6,"ad":"","tanim":"Montaj türüne göre (vidallı/yaylı) kasa üzerine montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Kasa profillerinin uçlarına köşe birleştirme takozlarının takılması.","ist":"EP-4","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Kasalama presinde dış çerçevenin preslenerek birleştirilmesi.","ist":"EP-4","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Kesilen dikey ve yatay alüminyum çıtaların birbirine kilitlenerek kare petek matrisinin oluşturulması ve kasa içerisindeki kanala oturtulması.","ist":"MNT-1","alt":"","onceki":[8]},{"no":10,"ad":"","tanim":"Kare petek bloğunun kasa içinde oynamaması için sabitleme çıtalarının veya sıkıştırma tellerinin uygulanması.","ist":"MNT-2","alt":"","onceki":[9]},{"no":11,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[10]},{"no":12,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[11]},{"no":13,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[12]},{"no":14,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[13]},{"no":15,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[15]},{"no":17,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[16]}]},{"kod":"AKS-KPI","ad":"Kapı menfez","grup":"Menfez","aciklama":"Kapı üzerine monte edilen panjurlu menfez","malzeme":"Sac / alüminyum","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Lineer menfezin dış kasa profillerinin  proje ölçülerine göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Lineer menfezin uzunluğuna uygun olarak iç kanat profillerinin kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[2]},{"no":4,"ad":"","tanim":"lineer menfez için yüzüklerin kesilmesi","ist":"TST-1","alt":"TST-2","onceki":[3]},{"no":5,"ad":"","tanim":"Kesilen kasa ve lineer kanat profillerine çapak alma ve törpüleme işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[1,2]},{"no":6,"ad":"","tanim":"Kasa profillerine, lineer kanatların yerleşeceği geçme yuvalarının veya tutucu deliklerin açılması.","ist":"EP-5","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"(Eğer vidalı montaj isteniyorsa) Kasanın üstüne vidalama için montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Kesilen lineer kanatların, özel ara elemanlar (tarak/bağlantı elemanları) yardımıyla kasanın içine aralıkları eşit olacak şekilde monte edilmesi.","ist":"MNT-1","alt":"","onceki":[7,3]},{"no":9,"ad":"","tanim":"Lineer kanatların sallanmasını ve ses yapmasını önlemek amacıyla sıkıştırma veya perçinleme/bağlantı işlemlerinin yapılması.","ist":"MNT-1","alt":"","onceki":[8]},{"no":10,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[9]},{"no":11,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[10]},{"no":12,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[11]},{"no":13,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[12]},{"no":14,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[13]},{"no":15,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[15]}]},{"kod":"AKS-MDK","ad":"Müdahale kapağı","grup":"Menfez","aciklama":"Kanal/şaft müdahale (revizyon) kapağı","malzeme":"Galvaniz / paslanmaz sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Kasanın proje ölçülerine göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Kapak sacının kesilmesi.","ist":"LZR-1","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"Kesilen kasalara törpüleme (çapak alma) işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[3]},{"no":5,"ad":"","tanim":"Kapak sacının bükülmesi.","ist":"ABK-1","alt":"","onceki":[2]},{"no":6,"ad":"","tanim":"Kasalara köşe takozlarının/köşelerin takılması.","ist":"EP-4","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Kasalama presinde çerçevenin preslenerek birleştirilmesi.","ist":"EP-4","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Çerçeve ve parçaların kaynatılması","ist":"KYN-2","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Menteşe, kilit ve conta montajı","ist":"MNT-1","alt":"","onceki":[3]},{"no":10,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[4]},{"no":11,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[5]},{"no":12,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[6]},{"no":13,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[7]},{"no":14,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[13]},{"no":15,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[15]}]},{"kod":"AKS-YKM","ad":"Yuvarlak kanal menfezi","grup":"Menfez","aciklama":"Yuvarlak kanala doğrudan monte edilen menfez","malzeme":"Galvaniz / sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Kasalara ait alüminyum profillerin boyutlarına göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Kanat profillerinin belirlenen boyutlara göre kesilmesi.","ist":"EP-11","alt":"","onceki":[1]},{"no":4,"ad":"","tanim":"Kesilen kasalara ve kanat uçlarına törpüleme (çapak alma) işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[2]},{"no":5,"ad":"","tanim":"Kasa kenarının projedeki çapa göre ayarlanması.","ist":"MRD-1","alt":"","onceki":[3]},{"no":6,"ad":"","tanim":"Kasalara kanatların takılacağı kanat deliklerinin açılması.","ist":"EP-1","alt":"","onceki":[4]},{"no":7,"ad":"","tanim":"Kasalara tırnak açılması.","ist":"EP-2","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Kasalara montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Kasalara köşe takozlarının/köşelerin takılması.","ist":"EP-4","alt":"","onceki":[8]},{"no":10,"ad":"","tanim":"Kasalama presinde çerçevenin preslenerek birleştirilmesi.","ist":"EP-4","alt":"","onceki":[9]},{"no":11,"ad":"","tanim":"Preslenen kasanın Argon kaynagı ile sağlamlaştırılması.","ist":"KYN-2","alt":"","onceki":[10]},{"no":12,"ad":"","tanim":"Kasalara kanatların montajının yapılması.","ist":"MNT-1","alt":"","onceki":[3,10]},{"no":13,"ad":"","tanim":"Kanat sıkılaştırma ve ayar tellerinin takılması.","ist":"MNT-2","alt":"","onceki":[12]},{"no":14,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[13]},{"no":15,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[14]},{"no":16,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[15]},{"no":17,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[16]},{"no":18,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[17]}]},{"kod":"AKS-KAN","ad":"Kare anemostat","grup":"Difüzör","aciklama":"Kare, kademeli konik tavan difüzörü","malzeme":"Sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Kare anemostatın dış çerçevesini oluşturacak profillerin proje boyutlarına göre  kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Kesilen kasalara törpüleme (çapak alma) işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"İç kanatların birbirine ve iç çerçeveye sabitlenmesini sağlayacak perçin/köşe bağlantı deliklerinin açılması.","ist":"MNT-1","alt":"","onceki":[3]},{"no":5,"ad":"","tanim":"Dış kasaya köşe takozu yuvalarının ve sökülebilir iç göbeği tutacak olan klips/yay mekanizma deliklerinin açılması.","ist":"MNT-1","alt":"","onceki":[4]},{"no":6,"ad":"","tanim":"Tavan veya plenum kutusu montajı için kasaya montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Kasalama presinde çerçevenin preslenerek oluşturulması.","ist":"EP-4","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Preslenen kasanın Argon kaynagı ile sağlamlaştırılması.","ist":"KYN-2","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"İç içe geçen konik kanatların ara tutucu elemanlar yardımıyla birleştirilerek tek bir sökülebilir göbek bloğu haline getirilmesi.","ist":"MNT-1","alt":"","onceki":[8]},{"no":10,"ad":"","tanim":"İç göbeğin dış kasaya kolayca takılıp çıkarılmasını sağlayan yaprak yay veya klips mekanizmasının monte edilmesi.","ist":"MNT-1","alt":"","onceki":[9]},{"no":11,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[10]},{"no":12,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[11]},{"no":13,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[12]},{"no":14,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[13]},{"no":15,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[15]},{"no":17,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[16]}]},{"kod":"AKS-SLD","ad":"Slot difüzör","grup":"Difüzör","aciklama":"Dar hatlı slot (yarıklı) difüzör","malzeme":"Alüminyum profil","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Slot difüzörün dış çerçeve ve iç slot bölücü profillerinin proje boylarına göre hassas kesim makinelerinde kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Slotların içine yerleştirilecek olan hava yönlendirici silindirik veya kanat profillerinin ölçülerine göre kesilmesi.","ist":"EP-8","alt":"","onceki":[1]},{"no":4,"ad":"","tanim":"Kesilen alüminyum profil uçlarındaki çapakların temizlenmesi ve törpülenmesi.","ist":"TŞL-1","alt":"","onceki":[2]},{"no":5,"ad":"","tanim":"Kasa köşelerine uyumlu alüminyum köşe takozlarının yerleştirilmesi.","ist":"EP-4","alt":"","onceki":[4]},{"no":6,"ad":"","tanim":"Yönlendirici kanatların ve uç kapakların takılması","ist":"MNT-1","alt":"","onceki":[3,5]},{"no":7,"ad":"","tanim":"Hava yönlendirici mekanizmaların (deflektörlerin) slot kanallarına takılarak serbest hareket yeteneğinin kontrol edilmesi.","ist":"MNT-2","alt":"","onceki":[6]},{"no":8,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[7]},{"no":9,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[8]},{"no":10,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[9]},{"no":11,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[10]},{"no":12,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[11]},{"no":13,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[12]},{"no":14,"ad":"Müşteriye teslim","tanim":"Malzemenin müşteriye teslim edilmesi.","ist":"DEPO-1","alt":"","onceki":[13]}]},{"kod":"AKS-YRD","ad":"Yer difüzörü","grup":"Difüzör","aciklama":"Yere monte edilen ızgara/difüzör","malzeme":"Alüminyum / sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Profillerin kesilmesi","ist":"","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Köşe birleştirme","ist":"","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"Izgara ve taşıyıcıların takılması","ist":"","alt":"","onceki":[3]},{"no":5,"ad":"Toz boya / fırın","tanim":"Yüzey hazırlığı ve statik toz boya (veya eloksal) uygulaması","ist":"","alt":"","onceki":[4]},{"no":6,"ad":"","tanim":"Varsa altı plenum kutusunun üretimi","ist":"","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"","alt":"","onceki":[7]}]},{"kod":"AKS-D4Y","ad":"4 yönlü difüzör","grup":"Difüzör","aciklama":"Dört yöne hava veren tavan difüzörü","malzeme":"Sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Ön plaka, iç kanatlar ve gövde kesimi","ist":"","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Gövde ve kanatların bükülmesi","ist":"","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"Yönlendiricilerin takılması","ist":"","alt":"","onceki":[3]},{"no":5,"ad":"","tanim":"Bağlantı boynu kaynağı","ist":"","alt":"","onceki":[4]},{"no":6,"ad":"Toz boya / fırın","tanim":"Yüzey hazırlığı ve statik toz boya (veya eloksal) uygulaması","ist":"","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"","alt":"","onceki":[7]}]},{"kod":"AKS-TLD","ad":"Teleskopik difüzör","grup":"Difüzör","aciklama":"Ayarlanabilir yüksekliğe sahip teleskopik difüzör","malzeme":"Sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Dış ve iç gövde kesimi","ist":"","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Gövdelerin şekillendirilmesi","ist":"","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"İç-dış gövde ve ayar mekanizması","ist":"","alt":"","onceki":[3]},{"no":5,"ad":"","tanim":"Boyun ve çerçeve kaynakları","ist":"","alt":"","onceki":[4]},{"no":6,"ad":"Toz boya / fırın","tanim":"Yüzey hazırlığı ve statik toz boya (veya eloksal) uygulaması","ist":"","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"","alt":"","onceki":[7]}]},{"kod":"AKS-SWD","ad":"Swirl difüzör","grup":"Difüzör","aciklama":"Girdap (swirl) etkili dairesel difüzör","malzeme":"Sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Projeye göre difüzör sacının kesilmesi.","ist":"LZR-1","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Kesilen sacın bükülmesi.","ist":"ABK-1","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"Plastik kanatların takılması.","ist":"MNT-3","alt":"","onceki":[3]},{"no":5,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[4]},{"no":6,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[5]},{"no":7,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[6]},{"no":8,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[7]},{"no":9,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[8]},{"no":10,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[9]},{"no":11,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[10]}]},{"kod":"AKS-SKP","ad":"Sabit kanat panjur","grup":"Panjur","aciklama":"Sabit açılı kanatlı dış hava panjuru","malzeme":"Galvaniz / alüminyum","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Panjur dış kasa profillerinin istenen genişlik ve yükseklik ölçülerine göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Sabit kanat profillerin ölçüye göre  kesilmesi.","ist":"EP-11","alt":"","onceki":[1]},{"no":4,"ad":"","tanim":"Kesilen kasa ve panjur kanat profillerinin uç kısımlarına çapak alma ve törpüleme işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[2]},{"no":5,"ad":"","tanim":"Kasa iç profillerine sabit kanatların açılı bir şekilde oturacağı yuvaların (kanal veya tırnakların) açılması.","ist":"EP-1","alt":"","onceki":[4]},{"no":6,"ad":"","tanim":"Panjurun dış cepheye veya kanala montajı için kasaya montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Kasa köşelerine presleme öncesi köşe birleştirme elemanlarının (takozlarının) takılması.","ist":"EP-4","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Kasalama presinde dış çerçevenin preslenerek sabitlenmesi.","ist":"EP-4","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Açılı kesilmiş sabit kanatların kasa üzerindeki kanallara/yuvalara dizilerek monte edilmesi.","ist":"MNT-1","alt":"","onceki":[3,8]},{"no":10,"ad":"","tanim":"Kanatların sabitlenmesi ve panjurun arka kısmına kuş, yaprak veya haşere girişini engelleyen galvaniz/alüminyum tel telin kesilerek perçin/vida ile sabitlenmesi.","ist":"MNT-2","alt":"","onceki":[9]},{"no":11,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[10]},{"no":12,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[11]},{"no":13,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[12]},{"no":14,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[13]},{"no":15,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[15]},{"no":17,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[16]}]},{"kod":"AKS-HKP","ad":"Hareketli kanat panjur","grup":"Panjur","aciklama":"Kanat açısı ayarlanabilir panjur","malzeme":"Galvaniz / alüminyum","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Panjur dış kasa profillerinin istenen genişlik ve yükseklik ölçülerine göre kesilmesi.","ist":"TST-1","alt":"TST-2","onceki":[1]},{"no":3,"ad":"","tanim":"Hareketli kanat profillerin ölçüye göre  kesilmesi.","ist":"EP-11","alt":"","onceki":[1]},{"no":4,"ad":"","tanim":"Kesilen kasa ve panjur kanat profillerinin uç kısımlarına çapak alma ve törpüleme işlemi yapılması.","ist":"TŞL-1","alt":"","onceki":[2]},{"no":5,"ad":"","tanim":"Kasa iç profillerine sabit kanatların açılı bir şekilde oturacağı yuvaların (kanal veya tırnakların) açılması.","ist":"EP-1","alt":"","onceki":[4]},{"no":6,"ad":"","tanim":"Panjurun dış cepheye veya kanala montajı için kasaya montaj deliklerinin açılması.","ist":"EP-3","alt":"","onceki":[5]},{"no":7,"ad":"","tanim":"Kasa köşelerine presleme öncesi köşe birleştirme elemanlarının (takozlarının) takılması.","ist":"EP-4","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Kasalama presinde dış çerçevenin preslenerek sabitlenmesi.","ist":"EP-4","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Açılı kesilmiş hareketli kanatların kasa üzerindeki kanallara/yuvalara dizilerek monte edilmesi.","ist":"MNT-1","alt":"","onceki":[3,8]},{"no":10,"ad":"","tanim":"Panjurun arka kısmına kuş, yaprak veya haşere girişini engelleyen galvaniz/alüminyum tel telin kesilerek perçin/vida ile sabitlenmesi.","ist":"MNT-2","alt":"","onceki":[9]},{"no":11,"ad":"Boyahane öncesi bekleme","tanim":"Ürünün boyahane öncesi bekleme alanına alınması.","ist":"BKL-1","alt":"","onceki":[10]},{"no":12,"ad":"Kimyasal daldırma","tanim":"Boya öncesi kimyasal daldırma (yağ alma/yüzey hazırlık) yapılması.","ist":"DLD-1","alt":"","onceki":[11]},{"no":13,"ad":"Su daldırma (durulama)","tanim":"Boya öncesi suya daldırma (durulama) yapılması.","ist":"DLD-2","alt":"","onceki":[12]},{"no":14,"ad":"Toz boya / fırın","tanim":"Toz boya / boyama işleminin gerçekleştirilmesi.","ist":"FRN-1","alt":"","onceki":[13]},{"no":15,"ad":"Boya sonrası kalite kontrol","tanim":"Boya sonrası, kanat hareketlerinin ve montajın kalite kontrolünün yapılması.","ist":"PKT-1","alt":"","onceki":[14]},{"no":16,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[15]},{"no":17,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[16]}]},{"kod":"AKS-YRP","ad":"Yuvarlak panjur","grup":"Panjur","aciklama":"Yuvarlak kesitli panjur","malzeme":"Galvaniz / alüminyum","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Sac kesim","tanim":"Halka ve kanat sacı kesimi","ist":"LZR-1","alt":"GYT-1","onceki":[1]},{"no":3,"ad":"Yuvarlama ve büküm","tanim":"Çerçevenin yuvarlanması","ist":"ABK-1","alt":"","onceki":[2]},{"no":4,"ad":"Kanat montajı / birleştirme","tanim":"Kanatların çerçeveye bağlanması","ist":"","alt":"","onceki":[3]},{"no":5,"ad":"Boya / kaplama","tanim":"Yüzey hazırlığı ve statik toz boya (veya eloksal) uygulaması","ist":"FRN-1","alt":"","onceki":[4]},{"no":6,"ad":"Final kalite kontrol","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"PKT-1","alt":"","onceki":[5]},{"no":7,"ad":"Etiketleme ve paketleme","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"PKT-1","alt":"","onceki":[6]}]},{"kod":"AKS-HAD","ad":"Hava ayar damperi","grup":"Damper","aciklama":"Debi ayarı yapan hava ayar damperi","malzeme":"Galvaniz sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Çerçeve sacının kesilmesi.","ist":"LZR-1","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Kanat profilinin kesilmesi.","ist":"TST-1","alt":"","onceki":[1]},{"no":4,"ad":"","tanim":"Çerçeve bükümünün yapılması.","ist":"ABK-1","alt":"","onceki":[2]},{"no":5,"ad":"","tanim":"Çerçeve birleştirmeni yapılması.","ist":"MNT-3","alt":"","onceki":[3]},{"no":6,"ad":"","tanim":"Kanatların mil ve yataklara takılması.","ist":"MNT-3","alt":"","onceki":[2]},{"no":7,"ad":"","tanim":"Kanatların çerçeveye montajının yapılması.","ist":"MNT-3","alt":"","onceki":[5,6]},{"no":8,"ad":"","tanim":"Manuel kol veya motor bağlantısı yapılması.","ist":"MNT-3","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Kanat hareketi ve kapanma kontrolü yapılması.","ist":"MNT-3","alt":"","onceki":[8]},{"no":10,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[9]},{"no":11,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[10]}]},{"kod":"AKS-YND","ad":"Yangın damperi","grup":"Damper","aciklama":"Yangın durumunda kapanan sertifikalı damper","malzeme":"Galvaniz sac / yalıtım","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Gövde ve kanat sacının kesilmesi.","ist":"LZR-1","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Gövde ve kanat bükümünün yapılması.","ist":"ABK-1","alt":"","onceki":[2]},{"no":4,"ad":"","tanim":"Gövde birleştirmenin yapılması.","ist":"MNT-3","alt":"","onceki":[3]},{"no":5,"ad":"","tanim":"Kanat ve gövde yalıtım malzemelerinin takılması","ist":"MNT-3","alt":"","onceki":[3]},{"no":6,"ad":"","tanim":"Çerçeve ve kanatların montajının yapılması.","ist":"MNT-3","alt":"","onceki":[4,5]},{"no":7,"ad":"","tanim":"Termal sigorta, yay ve kol montajının yapılması.","ist":"MNT-3","alt":"","onceki":[6]},{"no":8,"ad":"","tanim":"Kapanma kontrolü yapılması.","ist":"MNT-3","alt":"","onceki":[7]},{"no":9,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[8]},{"no":10,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[9]}]},{"kod":"AKS-BDD","ad":"Backdraft","grup":"Damper","aciklama":"Tek yönlü hava geçişi sağlayan geri tepme damperi","malzeme":"Galvaniz / alüminyum","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"","tanim":"Çerçeve sacının kesilmesi.","ist":"LZR-1","alt":"","onceki":[1]},{"no":3,"ad":"","tanim":"Kanat profilinin kesilmesi.","ist":"TST-1","alt":"","onceki":[1]},{"no":4,"ad":"","tanim":"Çerçeve bükümünün yapılması.","ist":"ABK-1","alt":"","onceki":[2]},{"no":5,"ad":"","tanim":"Çerçeve birleştirmeni yapılması.","ist":"MNT-3","alt":"","onceki":[3]},{"no":6,"ad":"","tanim":"Kanatların mil ve yataklara takılması.","ist":"MNT-3","alt":"","onceki":[2]},{"no":7,"ad":"","tanim":"Kanatların çerçeveye montajının yapılması.","ist":"MNT-3","alt":"","onceki":[5,6]},{"no":8,"ad":"","tanim":"Manuel kol veya motor bağlantısı yapılması.","ist":"MNT-3","alt":"","onceki":[7]},{"no":9,"ad":"","tanim":"Kanat hareketi ve kapanma kontrolü yapılması.","ist":"MNT-3","alt":"","onceki":[8]},{"no":10,"ad":"Paketleme","tanim":"Paketleme alanında ürünün paketlenmesi.","ist":"PKT-1","alt":"","onceki":[9]},{"no":11,"ad":"Stok / sevkiyat alanına alma","tanim":"Stok-Sevkiyat alanına alınması","ist":"DEPO-1","alt":"","onceki":[10]}]},{"kod":"AKS-YRK","ad":"Yuvarlak kanal","grup":"Kanal","aciklama":"Yuvarlak (spiral / sac) havalandırma kanalı","malzeme":"Galvaniz sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Sac kesim / bobin hazırlama","tanim":"Sacın ölçüye kesilmesi veya bobin ayarı","ist":"LZR-1","alt":"GYT-1","onceki":[1]},{"no":3,"ad":"Kanal şekillendirme (spiral/yuvarlama)","tanim":"Kanalın sarılması veya yuvarlanması","ist":"SPR-1","alt":"SPR-2","onceki":[2]},{"no":4,"ad":"Kenet / kaynak","tanim":"Boyuna dikişin kenetlenmesi","ist":"","alt":"","onceki":[3]},{"no":5,"ad":"Flanş / geçme hazırlığı","tanim":"Birleştirme ucunun hazırlanması","ist":"","alt":"","onceki":[4]},{"no":6,"ad":"Sızdırmazlık","tanim":"Gerekli ise mastik/conta uygulaması","ist":"MNT-1","alt":"","onceki":[5]},{"no":7,"ad":"Final kalite kontrol","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"PKT-1","alt":"","onceki":[6]},{"no":8,"ad":"Etiketleme ve paketleme","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"PKT-1","alt":"","onceki":[7]}]},{"kod":"AKS-KRK","ad":"Kare kanal","grup":"Kanal","aciklama":"Dikdörtgen kesitli sac havalandırma kanalı","malzeme":"Galvaniz sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Sac kesim","tanim":"Kanal sacının ölçüye kesilmesi","ist":"LZR-1","alt":"GYT-1","onceki":[1]},{"no":3,"ad":"Köşe/kenet pres","tanim":"Köşe kilidi (pittsburgh) ve kenet işlemi","ist":"","alt":"","onceki":[2]},{"no":4,"ad":"Büküm","tanim":"Kanalın köşe katları","ist":"ABK-1","alt":"","onceki":[3]},{"no":5,"ad":"Birleştirme / kenet","tanim":"Boyuna dikiş birleştirme","ist":"","alt":"","onceki":[4]},{"no":6,"ad":"Flanş / bağlantı profili takma","tanim":"TDC/TDF flanş, köşe parçası","ist":"MNT-1","alt":"","onceki":[5]},{"no":7,"ad":"Sızdırmazlık ve conta","tanim":"Mastik/conta uygulaması","ist":"MNT-1","alt":"","onceki":[6]},{"no":8,"ad":"Final kalite kontrol","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"PKT-1","alt":"","onceki":[7]},{"no":9,"ad":"Etiketleme ve paketleme","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"PKT-1","alt":"","onceki":[8]}]},{"kod":"AKS-FIT","ad":"Fittings","grup":"Kanal","aciklama":"Dirsek, redüksiyon, T, ayrılma gibi kanal bağlantı parçaları","malzeme":"Galvaniz sac","rev":"Taslak v1 · 12.10.2026","adimlar":[{"no":1,"ad":"Malzeme hazırlık / depodan çıkış","tanim":"İş emrine göre malzemenin depodan çekilmesi ve ölçü-kalite kontrolü","ist":"DEPO-1","alt":"","onceki":[]},{"no":2,"ad":"Açınım hazırlama","tanim":"Parça açınımının çizimi/hazırlanması","ist":"DEPO-1","alt":"","onceki":[1]},{"no":3,"ad":"Sac kesim","tanim":"Açınıma göre kesim","ist":"LZR-1","alt":"GYT-1","onceki":[2]},{"no":4,"ad":"Büküm / pres","tanim":"Parçaların şekillendirilmesi","ist":"ABK-1","alt":"","onceki":[3]},{"no":5,"ad":"Birleştirme / kaynak","tanim":"Kenet, punto veya kaynak ile birleştirme","ist":"","alt":"","onceki":[4]},{"no":6,"ad":"Flanş / bağlantı hazırlığı","tanim":"Flanş veya geçme ucu","ist":"MNT-1","alt":"","onceki":[5]},{"no":7,"ad":"Final kalite kontrol","tanim":"Ölçü, yüzey ve çalışma kontrolü; kontrol formunun doldurulması","ist":"PKT-1","alt":"","onceki":[6]},{"no":8,"ad":"Etiketleme ve paketleme","tanim":"Ürün etiketi, koruyucu ambalaj, sevkiyata hazırlık","ist":"PKT-1","alt":"","onceki":[7]}]}];
const PL_IDUR = { aktif: ["Çalışıyor", "var(--k-fabrikada)"], bakim: ["Bakımda", "var(--k-gec)"], ariza: ["Arızalı", "var(--k-izinsiz)"], pasif: ["Pasif", "var(--ink-3)"] };
const PL_ODUR = { bekliyor: ["Bekliyor", "var(--ink-3)"], devam: ["Çalışılıyor", "var(--brand)"], durdu: ["Kısmen yapıldı", "var(--k-gec)"], bitti: ["Bitti", "var(--k-fabrikada)"] };
const PL_EDUR = { plan: ["Planlandı", "var(--ink-3)"], uretim: ["Üretimde", "var(--brand)"], bekle: ["Beklemede", "var(--k-gec)"], bitti: ["Tamamlandı", "var(--k-fabrikada)"], iptal: ["İptal", "var(--ink-3)"] };
const PL_ONC = { normal: ["Normal", "var(--ink-3)"], acil: ["Acil", "var(--k-gec)"], cokacil: ["Çok acil", "var(--k-izinsiz)"] };
const PL = { ist: [], akis: [], ie: [], cfg: { mesaiBas: "08:00", gunlukDk: 540, cumartesi: true }, ready: false, view: "genel",
  F: { dur: "aktif", q: "", sip: "" }, IF: { bolum: "", dur: "", q: "" } };
const plIst = kod => PL.ist.find(i => i.kod === kod) || null;
const plIstSorted = () => PL.ist.slice().sort((a, b) => PL_BOLUM.findIndex(x => x[0] === a.bolum) - PL_BOLUM.findIndex(x => x[0] === b.bolum) || String(a.kod).localeCompare(String(b.kod), "tr", { numeric: true }));
const plDk = m => { m = Math.round(Number(m) || 0); if (m < 60) return m + " dk"; const h = Math.floor(m / 60); return h + " sa" + (m % 60 ? " " + (m % 60) + " dk" : ""); };
const plIeOpen = e => e.durum !== "bitti" && e.durum !== "iptal";

// Adımlar öncül (önceki operasyon) listesiyle bağlanır; ilk adım dışında öncülü boş olan adım bir önceki adıma bağlı sayılır
const plNo = (s, i) => s.no != null ? Number(s.no) : i + 1;
function plDag(steps) {
  const idx = new Map(steps.map((s, i) => [plNo(s, i), i]));
  const pr = steps.map((s, i) => { const L = Array.isArray(s.onceki) ? s.onceki : (i ? [plNo(steps[i - 1], i - 1)] : []); return [...new Set(L.map(n => idx.get(Number(n))).filter(j => j != null && j !== i))]; });
  const lvl = [], st = [];
  const lv = i => { if (lvl[i] != null) return lvl[i]; if (st[i]) return 0; st[i] = 1; const v = pr[i].length ? Math.max(...pr[i].map(lv)) + 1 : 0; st[i] = 0; return (lvl[i] = v); };
  steps.forEach((_, i) => lv(i));
  const succ = steps.map(() => []); pr.forEach((L, i) => L.forEach(j => succ[j].push(i)));
  return { pr, lvl, succ };
}
// Kritik yol (en uzun öncül zinciri)
function plCrit(steps, fn) {
  if (!steps.length) return 0; const { pr } = plDag(steps), ef = [], st = [];
  const f = i => { if (ef[i] != null) return ef[i]; if (st[i]) return 0; st[i] = 1; const v = (pr[i].length ? Math.max(...pr[i].map(f)) : 0) + fn(steps[i], i); st[i] = 0; return (ef[i] = v); };
  return Math.max(...steps.map((_, i) => f(i)));
}
// Akışta bağlantısı kopuk adımlar (son adım dışında ardılı olmayanlar)
const plLoose = steps => { if (steps.length < 2) return []; const { succ } = plDag(steps); return steps.map((s, i) => i < steps.length - 1 && !succ[i].length ? plNo(s, i) : null).filter(n => n != null); };
const plStepPlan = (s, q) => (Number(s.hazirlik) || 0) + (Number(s.sure) || 0) * (Number(q) || 0);
const plOpDone = (op, q) => op.durum === "bitti" ? 1 : Math.max(0, Math.min(1, (Number(op.tamam) || 0) / (Number(q) || 1)));
// Gerçek süre: Başlat–Duraklat oturumları + gün sonu girişlerindeki dakikalar
const plOpAct = op => (op.calisma || []).reduce((s, c) => s + Math.max(0, ((c.bit || Date.now()) - c.bas)), 0) / 60000 + (op.kayit || []).reduce((s, k) => s + (Number(k.dk) || 0), 0) + (Number(op.ekDk) || 0);
const plOpGood = (op, q) => op.durum === "bitti" ? Number(q) || 0 : Number(op.tamam) || 0;
const plWorkDay = iso => { const w = wdOf(iso); return w !== 0 && (w !== 6 || PL.cfg.cumartesi); };
function plAddWork(ts, mins) {
  let day = dayOf(ts), t = ts, left = Math.max(0, mins);
  for (let g = 0; g < 500; g++) {
    if (plWorkDay(day)) { const s = istTs(day, PL.cfg.mesaiBas), e = s + PL.cfg.gunlukDk * 60000, st = Math.max(t, s);
      if (st < e) { const cap = (e - st) / 60000; if (left <= cap) return st + left * 60000; left -= cap; } }
    day = addDays(day, 1); t = istTs(day, PL.cfg.mesaiBas);
  }
  return t;
}
function plStats(e) {
  const q = Number(e.miktar) || 0, O = e.ops || [];
  let plan = O.reduce((s, o) => s + plStepPlan(o, q), 0), done = O.reduce((s, o) => s + plStepPlan(o, q) * plOpDone(o, q), 0);
  const noTime = plan === 0 || O.some(o => !(Number(o.sure) > 0));
  let earned = 0, act = 0; O.forEach(o => { const a = plOpAct(o); if (a > 0) { act += a; earned += plStepPlan(o, q) * plOpDone(o, q); } });
  const verim = act >= 5 && earned > 0 ? Math.round(earned / act * 100) : null;
  const crit = plCrit(O, o => plStepPlan(o, q)), rem = plCrit(O, o => plStepPlan(o, q) * (1 - plOpDone(o, q)));
  const f = verim ? Math.max(0.6, Math.min(2, 100 / verim)) : 1;
  const start = Math.max(Date.now(), e.plBas && e.durum === "plan" ? istTs(e.plBas, PL.cfg.mesaiBas) : 0);
  const eta = e.durum === "bitti" ? (e.bitis || e.updatedAt) : rem > 0 ? plAddWork(start, rem * f) : Date.now();
  const etaDay = dayOf(eta), late = e.termin && plIeOpen(e) && etaDay > e.termin, over = e.termin && plIeOpen(e) && e.termin < TODAY;
  const cur = O.find(o => o.durum === "devam") || O.find(o => o.durum === "durdu") || O.find(o => o.durum !== "bitti") || null;
  const pct = plan && !noTime ? Math.round(done / plan * 100) : O.length ? Math.round(O.reduce((s, o) => s + plOpDone(o, q), 0) / O.length * 100) : 0;
  const good = O.reduce((s, o) => s + plOpGood(o, q), 0), fire = O.reduce((s, o) => s + (Number(o.fire) || 0), 0);
  const kalite = good + fire > 0 && fire > 0 ? Math.round(good / (good + fire) * 1000) / 10 : null;
  return { q, plan, done, pct, noTime, verim, fire, kalite, act, crit, rem, eta, etaDay, late, over, cur, nBitti: O.filter(o => o.durum === "bitti").length };
}
const plNextNo = () => { const y = TODAY.slice(0, 4), mx = Math.max(0, ...PL.ie.map(e => { const m = String(e.no || "").match(new RegExp("^İE-" + y + "-(\\d+)$")); return m ? Number(m[1]) : 0; })); return `İE-${y}-${String(mx + 1).padStart(4, "0")}`; };

function startPlan() {
  PL.ready = false; let a = false, b = false, c = false;
  const done = () => { PL.ready = a && b && c; plChanged(); };
  dataUnsubs.push(onSnapshot(collection(fs, "istasyon"), s => { PL.ist = s.docs.map(d => ({ id: d.id, ...d.data() })); a = true; done(); }, e => { a = true; done(); toast("İş istasyonları okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(collection(fs, "akis"), s => { PL.akis = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => String(x.kod).localeCompare(String(y.kod), "tr")); b = true; done(); }, e => { b = true; done(); toast("İş akışları okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(collection(fs, "isemri"), s => { PL.ie = s.docs.map(d => ({ id: d.id, ...d.data() })); c = true; done(); }, e => { c = true; done(); toast("İş emirleri okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(doc(fs, "config", "planlama"), s => { const d = s.exists() ? s.data() : {}; PL.cfg = { mesaiBas: d.mesaiBas || "08:00", gunlukDk: Number(d.gunlukDk) || 540, cumartesi: d.cumartesi !== false }; plChanged(); }, () => {}));
}
let plDrawerRefresh = null;
function plChanged() { if ($("#app").hidden) return; renderHome(); if (ROUTE === "planlama") renderPlan(); if (plDrawerRefresh) plDrawerRefresh(); }

function planTile(m) {
  const A = PL.ie.filter(plIeOpen), S = A.map(plStats), risk = S.filter(s => s.late || s.over).length, ur = A.filter(e => e.durum === "uretim").length;
  const pct = A.length ? Math.round(S.reduce((s, x) => s + x.pct, 0) / A.length) : 0, ar = PL.ist.filter(i => i.durum === "ariza").length;
  return `<a class="tile on" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <svg class="wave" viewBox="0 0 180 120" aria-hidden="true"><path d="M0 70 C40 40 80 100 180 50 L180 120 L0 120Z" fill="#fff"/></svg>
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">${lvl(m.id) === "view" ? "GÖZLEMCİ" : "AKTİF"}</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>
        <div class="meter" title="Açık iş emirlerinin ortalama ilerlemesi %${pct}"><i style="width:${pct}%"></i></div>
        <div class="stats"><span>${A.length} açık iş emri</span><span>${ur} üretimde</span>${risk ? `<span class="alert">${risk} termin riski</span>` : ""}${ar ? `<span class="alert">${ar} arızalı istasyon</span>` : ""}</div>
      </div></a>`;
}

/* --- ekran --- */
function renderPlan() {
  if (!ME || $("#modPlan").hidden) return;
  const gt = document.querySelector('#plTabs [data-lv="gun"]'); if (gt) gt.hidden = !can("pl.op");
  if (PL.view === "gun" && !can("pl.op")) PL.view = "genel";
  const A = PL.ie.filter(plIeOpen), S = A.map(e => ({ e, s: plStats(e) }));
  const risk = S.filter(x => x.s.late || x.s.over), wk = weekRange();
  const doneW = PL.ie.filter(e => e.durum === "bitti" && e.bitis && dnum(dayOf(e.bitis)) >= wk[0]).length;
  const vs = PL.ie.filter(e => e.durum === "bitti" || e.durum === "uretim").map(plStats).filter(s => s.verim), avgV = vs.length ? Math.round(vs.reduce((s, x) => s + x.verim, 0) / vs.length) : null;
  $("#plKpis").innerHTML = [
    ["Açık iş emri", A.length, `${A.filter(e => e.durum === "uretim").length} üretimde · ${A.filter(e => e.durum === "plan").length} planlandı`, ""],
    ["Termin riski", risk.length, risk.length ? risk.slice(0, 2).map(x => x.e.no).join(", ") : "Tüm işler terminine yetişiyor", risk.length ? "bad" : "ok"],
    (() => { const f = plFireStats(30); return ["Fire oranı · 30 gün", f.oran == null ? "—" : "%" + nf(f.oran, 1), f.fire ? `${nf(f.fire)} adet fire · bu hafta ${doneW} iş emri bitti` : `Bu hafta ${doneW} iş emri tamamlandı`, f.oran >= 5 ? "bad" : ""]; })(),
    ["Ortalama verimlilik", avgV == null ? "—" : "%" + avgV, "Planlanan süre / gerçekleşen süre", avgV == null ? "" : avgV >= 90 ? "ok" : avgV < 75 ? "bad" : ""],
    ["İş istasyonu", PL.ist.length, `${PL.ist.filter(i => i.durum === "ariza").length} arızalı · ${PL.ist.filter(i => i.durum === "bakim").length} bakımda`, PL.ist.some(i => i.durum === "ariza") ? "bad" : ""]
  ].map(([k, v, s, cl]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${cl}">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join("");
  document.querySelectorAll("#plTabs [data-lv]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.lv === PL.view ? "true" : "false"); b.onclick = () => { PL.view = b.dataset.lv; closeDrawer(); renderPlan(); }; });
  const add = $("#plAdd"), L = { genel: ["pl.ie", "+ İş emri"], ie: ["pl.ie", "+ İş emri"], gun: ["pl.ie", "+ İş emri"], gantt: ["pl.ie", "+ İş emri"], akis: ["pl.akis", "+ İş akış şeması"], ist: ["pl.ist", "+ İstasyon"] }[PL.view];
  add.hidden = !can(L[0]); add.textContent = L[1]; add.onclick = () => PL.view === "akis" ? plOpenAkis(null) : PL.view === "ist" ? plOpenIst(null) : plOpenNewIe();
  $("#plCfgBtn").hidden = !(can("pl.ist") || can("pl.ie")); $("#plCfgBtn").onclick = plOpenCfg;
  const v = $("#plView");
  if (!PL.ready) { v.innerHTML = '<div class="empty"><h3>Planlama verileri yükleniyor</h3><p>Veritabanına bağlanılıyor.</p></div>'; return; }
  ({ genel: plGenelView, ie: plIeView, gun: plGunView, gantt: plGanttView, akis: plAkisView, ist: plIstView })[PL.view](v);
}

/* Genel bakış */
function plGenelView(v) {
  if (!PL.ie.length) {
    v.innerHTML = `<div class="empty"><h3>Henüz iş emri yok</h3><p>İş emirleri iş akış şemalarından açılır; operasyonlar şemadan kopyalanır. Toplantıda işleyişi göstermek için 15 deneme iş emri (farklı siparişler, ilerleme, fire ve gün sonu kayıtlarıyla) ekleyebilirsiniz; tek düğmeyle silinir.</p>${can("pl.ie") ? '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="plE1" type="button">+ İş emri aç</button><button class="btn ghost" id="plE2" type="button">15 deneme iş emri ekle</button></div>' : ""}</div>`;
    const b = $("#plE1"); if (b) { b.onclick = () => plOpenNewIe(); $("#plE2").onclick = plSeedDemo; } return;
  }
  const A = PL.ie.filter(plIeOpen);
  // siparişler: aynı sipariş numarasına bağlı iş emirleri
  const sip = {}; PL.ie.filter(e => e.siparisNo && (plIeOpen(e) || (e.bitis && Date.now() - e.bitis < 14 * 864e5))).forEach(e => (sip[e.siparisNo] = sip[e.siparisNo] || []).push(e));
  const sipRows = Object.entries(sip).map(([no, L]) => { const S = L.map(plStats), plan = S.reduce((s, x) => s + x.plan, 0), done = S.reduce((s, x) => s + x.done, 0);
    return { no, L, S, musteri: L[0].musteri || "", pct: plan ? Math.round(done / plan * 100) : 0, bitti: L.filter(e => e.durum === "bitti").length, termin: L.map(e => e.termin).filter(Boolean).sort()[0] || "", risk: S.some(s => s.late || s.over), eta: Math.max(...S.map(s => s.eta)) }; })
    .sort((a, b) => (b.risk - a.risk) || String(a.termin || "9").localeCompare(String(b.termin || "9")));
  // istasyon yükü: açık iş emirlerinde kalan planlı süre
  const load = {}; A.forEach(e => { const q = Number(e.miktar) || 0; (e.ops || []).forEach(o => { if (o.durum === "bitti") return; load[o.ist] = (load[o.ist] || 0) + plStepPlan(o, q) * (1 - plOpDone(o, q)); }); });
  const LR = Object.entries(load).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 10), mx = Math.max(1, ...LR.map(x => x[1]));
  const now = []; A.forEach(e => (e.ops || []).forEach((o, k) => { if (o.durum === "devam") now.push({ e, o, k }); }));
  v.innerHTML = `<div class="plgrid">
    <section class="plcard"><h3 class="sec-t">Siparişler <small>${sipRows.length} sipariş</small></h3>
      ${sipRows.length ? sipRows.map(r => `<div class="sipr" data-sip="${esc(r.no)}" role="button" tabindex="0">
        <div class="sipt"><b class="num">${esc(r.no)}</b><span>${esc(r.musteri)}</span>${r.risk ? '<span class="kst" style="--tc:var(--k-izinsiz)">Termin riski</span>' : ""}</div>
        <div class="prog"><div class="bar"><span style="width:${r.pct}%;--fill:${r.risk ? "var(--k-izinsiz)" : r.pct >= 100 ? "var(--k-fabrikada)" : "var(--brand)"}"></span></div><span class="pct num">%${r.pct}</span></div>
        <div class="sipm"><span>${r.bitti}/${r.L.length} iş emri tamamlandı</span><span>${r.termin ? "Termin " + fmtS(r.termin) : "Termin yok"}</span><span>Tahmini bitiş ${fmtS(dayOf(r.eta))}</span></div>
        <div class="sipl">${r.L.map((e, k) => `<span class="kst" style="--tc:${PL_EDUR[e.durum][1]}" title="${esc(e.urunAd)} · %${r.S[k].pct}">${esc(e.no.replace(/^İE-\d{4}-/, "#"))} · %${r.S[k].pct}</span>`).join("")}</div></div>`).join("") : '<p class="note">Siparişe bağlı açık iş emri yok.</p>'}</section>
    <section class="plcard"><h3 class="sec-t">İstasyon yükü <small>kalan planlı süre</small></h3>
      ${LR.length ? LR.map(([k, m]) => { const i = plIst(k), d = i ? PL_IDUR[i.durum || "aktif"] : null, gun = m / PL.cfg.gunlukDk;
        return `<div class="loadr" data-ist="${esc(i ? i.id : "")}" role="button" tabindex="0"><span class="lk num">${esc(k)}</span><div class="lb"><span style="width:${m / mx * 100}%;--fill:${i && i.durum !== "aktif" ? d[1] : PL_BC[plBolumOf(k)].c}"></span></div><span class="lv num">${plDk(m)}${gun >= 1 ? ` <small>· ${nf(gun, 1)} gün</small>` : ""}</span>${i && i.durum !== "aktif" ? `<span class="kst" style="--tc:${d[1]}">${d[0]}</span>` : ""}</div>`; }).join("")
        + '<p class="note" style="margin:8px 0 0">En uzun çubuk darboğazdır. Arızalı ya da bakımdaki istasyonda iş birikiyorsa kırmızı/turuncu görünür.</p>' : '<p class="note">Açık iş emri olmadığı için istasyon yükü yok.</p>'}</section>
    <section class="plcard"><h3 class="sec-t">Şu an çalışılan operasyonlar <small>${now.length}</small></h3>
      ${now.length ? now.map(({ e, o }) => { const c = (o.calisma || []).slice(-1)[0]; return `<div class="nowr" data-ie="${esc(e.id)}" role="button" tabindex="0"><span class="lk num">${esc(o.ist)}</span><div><b>${esc(o.ad)}</b><div class="note">${esc(e.no)} · ${esc(e.urunAd)} · ${nf(o.tamam || 0)}/${nf(e.miktar)}</div></div><span class="num note">${c && !c.bit ? fmtDur(Date.now() - c.bas) : ""}${o.operator ? " · " + esc(o.operator) : ""}</span></div>`; }).join("") : '<p class="note">Şu an başlatılmış operasyon yok.</p>'}</section>
    ${(() => { const f = plFireStats(30), L = Object.entries(f.ist).filter(([, x]) => x.fire > 0).sort((a, b) => b[1].oran - a[1].oran).slice(0, 8);
      return `<section class="plcard"><h3 class="sec-t">Fire / hurda <small>son 30 gün · istasyon bazında</small></h3>${L.length ? L.map(([k, x]) => `<div class="loadr"><span class="lk num">${esc(k)}</span><div class="lb"><span style="width:${Math.min(100, x.oran * 5)}%;--fill:${x.oran >= 5 ? "var(--k-izinsiz)" : x.oran >= 2 ? "var(--k-gec)" : "var(--k-fabrikada)"}"></span></div><span class="lv num">%${nf(x.oran, 1)} <small>· ${nf(x.fire)} / ${nf(x.fire + x.good)} adet</small></span></div>`).join("") + '<p class="note" style="margin:8px 0 0">Fire oranı = fire ÷ (sağlam + fire). Çubuk %20\'de dolar; %5 üstü kırmızı.</p>' : '<p class="note">Son 30 günde fire girilmedi. Gün sonu girişinde ya da operasyonda fire adedi yazılınca burada istasyon bazında görünür (özellikle lazer ve plazma).</p>'}</section>`; })()}
    <section class="plcard"><h3 class="sec-t">Termin sırası <small>açık iş emirleri</small></h3>
      ${A.length ? A.map(e => ({ e, s: plStats(e) })).sort((a, b) => String(a.e.termin || "9").localeCompare(String(b.e.termin || "9"))).slice(0, 8).map(({ e, s }) => `<div class="nowr" data-ie="${esc(e.id)}" role="button" tabindex="0"><span class="lk num">${esc(e.no.replace(/^İE-\d{4}-/, "#"))}</span><div><b>${esc(e.urunAd)}</b><div class="note">${nf(e.miktar)} ${esc(e.birim || "Adet")} · %${s.pct} · ${PL_EDUR[e.durum][0]}</div></div><span class="num ${s.late || s.over ? "late" : "note"}">${e.termin ? fmtS(e.termin) : "—"}</span></div>`).join("") : '<p class="note">Açık iş emri yok.</p>'}</section>
  </div>`;
  v.querySelectorAll("[data-sip]").forEach(el => { const go = () => { PL.view = "ie"; PL.F = { dur: "tum", q: "", sip: el.dataset.sip }; renderPlan(); }; el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  v.querySelectorAll("[data-ie]").forEach(el => { const go = () => plOpenIe(el.dataset.ie); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  v.querySelectorAll(".loadr[data-ist]").forEach(el => { if (el.dataset.ist) el.onclick = () => plOpenIst(el.dataset.ist); });
}

/* İş emirleri listesi */
function plIeView(v) {
  const F = PL.F, sips = sortTr(PL.ie.map(e => e.siparisNo));
  v.innerHTML = `<div class="pkbar"><div class="filters">
      <select class="f${F.dur !== "aktif" ? " on" : ""}" id="ieDur" aria-label="Durum">${[["aktif", "Açık iş emirleri"], ["plan", "Planlandı"], ["uretim", "Üretimde"], ["bekle", "Beklemede"], ["risk", "Termin riski olanlar"], ["bitti", "Tamamlananlar"], ["iptal", "İptal edilenler"], ["tum", "Tümü"]].map(([a, l]) => opt(a, l, F.dur)).join("")}</select>
      <select class="f${F.sip ? " on" : ""}" id="ieSip" aria-label="Sipariş"><option value="">Tüm siparişler</option><option value="__stok"${F.sip === "__stok" ? " selected" : ""}>Stoka üretim</option>${sips.map(s => opt(s, s, F.sip)).join("")}</select>
      <input class="f" id="ieQ" type="search" placeholder="İş emri, ürün, müşteri ara…" aria-label="İş emirlerinde ara" value="${esc(F.q)}"></div>
      <div class="filters"><span class="sortinfo" id="ieInfo"></span>${PL.ie.some(e => e.deneme) && can("pl.delete") ? '<button type="button" class="btn ghost sm dangerb" id="ieUnseed">Deneme iş emirlerini sil</button>' : ""}</div></div>
    <div id="ieList"></div>`;
  const us = $("#ieUnseed"); if (us) { let armed = false; us.onclick = () => { if (!armed) { armed = true; us.textContent = "Silmek için tekrar basın"; return; } us.disabled = true; plUnseedDemo(); }; }
  const draw = () => {
    const q = F.q.trim().toLocaleLowerCase("tr");
    const rows = PL.ie.map(e => ({ e, s: plStats(e) })).filter(({ e, s }) => {
      if (F.dur === "aktif" && !plIeOpen(e)) return false; if (["plan", "uretim", "bekle", "bitti", "iptal"].includes(F.dur) && e.durum !== F.dur) return false;
      if (F.dur === "risk" && !(s.late || s.over)) return false;
      if (F.sip === "__stok" ? e.siparisNo : F.sip && e.siparisNo !== F.sip) return false;
      if (q && ![e.no, e.urunAd, e.siparisNo, e.musteri, e.sorumlu, e.akisAd].join(" ").toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    }).sort((a, b) => (plIeOpen(b.e) - plIeOpen(a.e)) || (Object.keys(PL_ONC).indexOf(b.e.oncelik) - Object.keys(PL_ONC).indexOf(a.e.oncelik)) || String(a.e.termin || "9").localeCompare(String(b.e.termin || "9")) || String(b.e.no).localeCompare(String(a.e.no)));
    $("#ieInfo").textContent = rows.length + " iş emri";
    $("#ieList").innerHTML = `<div class="ledger ieled" role="table"><div class="lhead" role="row"><div>İş emri</div><div>Ürün / sipariş</div><div>Miktar</div><div>İlerleme</div><div>Verimlilik</div><div>Termin / tahmini bitiş</div><div>Durum</div></div>${rows.length ? rows.map(({ e, s }) => {
      const st = PL_EDUR[e.durum] || PL_EDUR.plan, risk = s.late || s.over;
      return `<div class="row" role="row" tabindex="0" data-ie="${esc(e.id)}" style="--stripe:${risk ? "var(--k-izinsiz)" : e.oncelik !== "normal" ? PL_ONC[e.oncelik][1] : "transparent"}">
        <div><b class="num">${esc(e.no)}</b>${e.deneme ? '<div><span class="ttag" style="--tc:var(--warn)">DENEME</span></div>' : ""}${e.oncelik && e.oncelik !== "normal" ? `<div><span class="ttag" style="--tc:${PL_ONC[e.oncelik][1]}">${PL_ONC[e.oncelik][0].toLocaleUpperCase("tr")}</span></div>` : ""}</div>
        <div class="ska"><b>${esc(e.urunAd)}</b><div class="desc">${e.siparisNo ? `${esc(e.siparisNo)}${e.musteri ? " · " + esc(e.musteri) : ""}` : "Stoka üretim"}</div></div>
        <div class="num">${nf(e.miktar)} <small class="note">${esc(e.birim || "Adet")}</small></div>
        <div><div class="prog"><div class="bar"><span style="width:${s.pct}%;--fill:${e.durum === "bitti" ? "var(--k-fabrikada)" : risk ? "var(--k-izinsiz)" : "var(--brand)"}"></span></div><span class="pct num">%${s.pct}</span></div>
          <div class="when">${s.nBitti}/${(e.ops || []).length} operasyon${s.cur && e.durum !== "bitti" ? " · " + esc(s.cur.ist) : ""}</div></div>
        <div class="num">${s.verim == null ? '<span class="date none">—</span>' : `<b style="color:${s.verim >= 90 ? "var(--k-fabrikada)" : s.verim < 75 ? "var(--k-izinsiz)" : "var(--k-gec)"}">%${s.verim}</b>`}</div>
        <div><span class="date">${e.termin ? fmtS(e.termin) : "—"}</span>${e.durum === "bitti" ? `<div class="when">Bitti ${fmtS(dayOf(s.eta))}</div>` : plIeOpen(e) ? `<div class="when ${risk ? "late" : ""}">Tahmini ${fmtS(s.etaDay)}</div>` : ""}</div>
        <div><span class="kst" style="--tc:${st[1]}">${st[0]}</span></div></div>`;
    }).join("") : '<div class="row" style="display:block;cursor:default;color:var(--ink-2)">Bu filtrelere uyan iş emri yok.</div>'}</div>`;
    $("#ieList").querySelectorAll("[data-ie]").forEach(el => { const go = () => plOpenIe(el.dataset.ie); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  };
  draw();
  $("#ieDur").onchange = e => { F.dur = e.target.value; draw(); $("#ieDur").classList.toggle("on", F.dur !== "aktif"); };
  $("#ieSip").onchange = e => { F.sip = e.target.value; draw(); $("#ieSip").classList.toggle("on", !!F.sip); };
  $("#ieQ").oninput = e => { F.q = e.target.value; draw(); };
}

/* Akış diyagramı: öncüllere göre katmanlı yerleşim, bağlantılar SVG ile */
let plFlowSeq = 0;
function plFlow(steps, o = {}) {
  if (!steps.length) return '<p class="note">Henüz adım yok.</p>';
  const { pr, lvl } = plDag(steps), mini = !!o.mini;
  const NW = mini ? 128 : 178, NH = mini ? 58 : (o.ops ? 100 : 92), GX = mini ? 28 : 48, GY = mini ? 12 : 18, P = 6;
  const cols = []; steps.forEach((_, i) => (cols[lvl[i]] = cols[lvl[i]] || []).push(i));
  const row = [];
  cols.forEach(c => { if (!c) return; c.sort((a, b) => { const ba = pr[a].length ? pr[a].reduce((s, j) => s + row[j], 0) / pr[a].length : 0, bb = pr[b].length ? pr[b].reduce((s, j) => s + row[j], 0) / pr[b].length : 0; return ba - bb || a - b; });
    const used = new Set(); c.forEach(i => { let want = pr[i].length ? Math.round(Math.min(...pr[i].map(j => row[j]))) : 0; while (used.has(want)) want++; row[i] = want; used.add(want); }); });
  const nR = Math.max(...row) + 1, W = P * 2 + cols.length * NW + (cols.length - 1) * GX, H = P * 2 + nR * NH + (nR - 1) * GY;
  const X = i => P + lvl[i] * (NW + GX), Y = i => P + row[i] * (NH + GY), id = "fa" + (++plFlowSeq);
  const edges = []; steps.forEach((_, i) => pr[i].forEach(j => { const x1 = X(j) + NW, y1 = Y(j) + NH / 2, x2 = X(i), y2 = Y(i) + NH / 2, xm = x2 - GX;
    const done = o.ops && steps[j].durum === "bitti";
    edges.push(`<path d="M${x1} ${y1} H${Math.max(x1, xm)} C${xm + GX / 2} ${y1} ${xm + GX / 2} ${y2} ${x2 - 3} ${y2}" class="${done ? "ed" : ""}" marker-end="url(#${id})"/>`); }));
  const node = i => {
    const s = steps[i], ist = plIst(s.ist), b = PL_BC[plBolumOf(s.ist)], od = o.ops ? PL_ODUR[s.durum || "bekliyor"] : null, dn = o.ops ? plOpDone(s, o.q) : 0;
    const warn = ist && ist.durum && ist.durum !== "aktif" ? PL_IDUR[ist.durum] : null, title = s.ad || s.tanim || (ist ? ist.ad : "");
    return `<div class="fnode${od ? " st-" + (s.durum || "bekliyor") : ""}${!s.ist ? " noist" : ""}" style="left:${X(i)}px;top:${Y(i)}px;width:${NW}px;height:${NH}px;--tc:${od ? od[1] : b.c}"${o.click ? ` data-fn="${i}" role="button" tabindex="0"` : ""} title="${esc(plNo(s, i) + ". " + (s.ad || "") + (s.tanim ? " — " + s.tanim : "") + " · " + (ist ? ist.kod + " " + ist.ad : s.ist || "istasyon seçilmedi") + (s.alt ? " (alternatif " + s.alt + ")" : "") + (warn ? " · " + warn[0] : ""))}">
      <div class="fh"><span class="fno num">${plNo(s, i)}</span><span class="fist num">${esc(s.ist || "?")}${s.alt && !mini ? `<em>/${esc(s.alt)}</em>` : ""}</span>${warn ? `<span class="fw" style="--tc:${warn[1]}">${mini ? "!" : warn[0]}</span>` : ""}</div>
      <b>${esc(title)}</b>
      ${mini ? "" : od ? `<div class="fbar"><span style="width:${dn * 100}%"></span></div><small>${od[0]}${s.durum !== "bitti" && s.tamam ? " · " + nf(s.tamam) + "/" + nf(o.q) : ""}</small>` : `<small>${Number(s.sure) > 0 ? nf(s.sure) + " dk/adet" + (s.hazirlik ? " + " + nf(s.hazirlik) + " dk hz." : "") : '<span class="nosure">süre girilmedi</span>'}</small>`}
    </div>`;
  };
  return `<div class="flow${mini ? " mini" : ""}"><div class="fcanvas" style="width:${W}px;height:${H}px"><svg class="fedges" width="${W}" height="${H}" aria-hidden="true"><defs><marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>${edges.join("")}</svg>${steps.map((_, i) => node(i)).join("")}</div></div>`;
}

/* İş emri detayı */
function plOpenIe(id) {
  const e0 = PL.ie.find(x => x.id === id); if (!e0) return;
  let T = "ops";
  plDrawerRefresh = () => { if (!$("#ieD")) { plDrawerRefresh = null; return; } paint(); };
  onDrawerClose = () => { plDrawerRefresh = null; };
  const opOk = can("pl.op"), ieOk = can("pl.ie");
  function paint() {
    const e = PL.ie.find(x => x.id === id); if (!e) { closeDrawer(); return; }
    const s = plStats(e), st = PL_EDUR[e.durum] || PL_EDUR.plan, q = Number(e.miktar) || 0, O = e.ops || [], risk = s.late || s.over;
    const sc = $("#drawerHost .db") ? $("#drawerHost .db").scrollTop : 0;
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer${$("#drawerHost .drawer") ? " noanim" : ""}" id="ieD" role="dialog" aria-modal="true" aria-labelledby="ieT" style="width:min(940px,100%)">
      <div class="dh"><h2 id="ieT"><span class="num">${esc(e.no)}</span> · ${esc(e.urunAd)}</h2><div style="display:flex;gap:8px;align-items:center"><button class="btn ghost sm" id="iePrint" type="button" title="Sahada kullanılacak iş emri kağıdını yazdır">Yazdır</button><button class="x" id="ieX" aria-label="Kapat">×</button></div></div>
      <div class="iehead">
        <div class="iek"><span>Durum</span><b><span class="kst" style="--tc:${st[1]}">${st[0]}</span></b>${e.oncelik !== "normal" ? `<small style="color:${PL_ONC[e.oncelik][1]}">${PL_ONC[e.oncelik][0]}</small>` : ""}</div>
        <div class="iek"><span>İlerleme</span><b class="num">%${s.pct}</b><small>${s.nBitti}/${O.length} operasyon</small></div>
        <div class="iek"><span>Miktar</span><b class="num">${nf(q)}</b><small>${esc(e.birim || "Adet")}</small></div>
        <div class="iek"><span>Verimlilik</span><b class="num" style="color:${s.verim == null ? "var(--ink-3)" : s.verim >= 90 ? "var(--k-fabrikada)" : s.verim < 75 ? "var(--k-izinsiz)" : "var(--k-gec)"}">${s.verim == null ? "—" : "%" + s.verim}</b><small>Plan ${plDk(s.done)} / gerçek ${plDk(s.act)}${s.fire ? ` · fire ${nf(s.fire)} (kalite %${nf(s.kalite, 1)})` : ""}</small></div>
        <div class="iek"><span>Termin</span><b class="num">${e.termin ? fmtS(e.termin) : "—"}</b><small>${e.siparisNo ? esc(e.siparisNo) : "Stoka üretim"}</small></div>
        <div class="iek${risk ? " bad" : ""}"><span>${e.durum === "bitti" ? "Bitiş" : "Tahmini bitiş"}</span><b class="num">${fmtS(s.etaDay)}</b><small>${e.durum === "bitti" ? "" : risk ? (s.over ? "Termin geçti" : `Termine ${dnum(s.etaDay) - dnum(e.termin)} gün geç`) : plIeOpen(e) ? "Kalan " + plDk(s.rem) : ""}</small></div>
      </div>
      <div class="seg sktabs" role="tablist"><button type="button" data-it="ops" aria-pressed="${T === "ops"}">Operasyonlar</button><button type="button" data-it="bilgi" aria-pressed="${T === "bilgi"}">Bilgiler</button><button type="button" data-it="mal" aria-pressed="${T === "mal"}">Malzeme ihtiyacı</button><button type="button" data-it="log" aria-pressed="${T === "log"}">Geçmiş</button></div>
      <div class="db">${T === "ops" ? `
        <div class="flowbox">${plFlow(O, { ops: true, q, click: true })}</div>
        <div class="ledger opled" role="table"><div class="lhead" role="row"><div>#</div><div>Operasyon / istasyon</div><div>Plan</div><div>Gerçek</div><div>Tamamlanan · fire</div><div>Durum</div><div></div></div>
        ${O.map((o, k) => { const od = PL_ODUR[o.durum || "bekliyor"], a = plOpAct(o), p = plStepPlan(o, q), run = (o.calisma || []).some(c => !c.bit);
          const opv = a >= 1 && plOpDone(o, q) > 0 ? Math.round(p * plOpDone(o, q) / a * 100) : null;
          return `<div class="row" role="row" id="op${k}" style="--stripe:${od[1]}">
            <div class="num">${plNo(o, k)}</div>
            <div class="ska"><b>${esc(o.ad)}</b><div class="desc"><span class="num">${esc(o.ist)}</span>${o.alt ? ` <span class="num">/ ${esc(o.alt)}</span>` : ""} · ${esc((plIst(o.ist) || {}).ad || "")}${o.onceki && o.onceki.length > 1 ? " · öncül " + o.onceki.join(", ") : ""}${o.kk ? " · KK: " + esc(o.kk) : ""}</div></div>
            <div class="num">${plDk(p)}<div class="when">${nf(o.sure)} dk/adet</div></div>
            <div class="num">${a ? plDk(a) : "—"}${opv != null ? `<div class="when" style="color:${opv >= 90 ? "var(--k-fabrikada)" : opv < 75 ? "var(--k-izinsiz)" : "var(--k-gec)"}">%${opv} verim</div>` : ""}</div>
            <div>${opOk && plIeOpen(e) ? `<input class="f opq num" type="number" min="0" max="${q}" step="any" value="${o.durum === "bitti" ? q : (o.tamam || 0)}" data-opq="${k}" aria-label="Tamamlanan adet"> <small class="note">/ ${nf(q)}</small><div class="opfr"><span>Fire</span><input class="f opq num" type="number" min="0" step="any" value="${o.fire || 0}" data-opf="${k}" aria-label="Fire adedi"></div>` : `<span class="num">${nf(o.durum === "bitti" ? q : o.tamam || 0)} / ${nf(q)}</span>${o.fire ? `<div class="when late">Fire ${nf(o.fire)}</div>` : ""}`}</div>
            <div><span class="kst" style="--tc:${od[1]}">${od[0]}</span>${o.operator ? `<div class="when">${esc(o.operator)}</div>` : ""}</div>
            <div class="opact">${opOk && plIeOpen(e) && e.durum !== "bekle" ? (o.durum === "bitti" ? `<button type="button" class="qb mo" data-op="geri" data-k="${k}" title="Yeniden aç">↺</button>`
              : `${run ? `<button type="button" class="qb wa" data-op="dur" data-k="${k}">Duraklat</button>` : `<button type="button" class="qb go" data-op="bas" data-k="${k}">${o.durum === "durdu" ? "Devam" : "Başlat"}</button>`}<button type="button" class="qb ok" data-op="bit" data-k="${k}">Bitir</button>`) : ""}</div>
          </div>`; }).join("")}</div>
        <p class="note" style="margin:-18px 0 0">Kağıtla çalışırken günlük girişleri <b>Gün sonu girişi</b> menüsünden toplu yapın (yapılan adet, fire, süre, operatör). Tablete geçince Başlat–Duraklat ile süre kendiliğinden tutulur. Verimlilik = planlanan süre ÷ gerçekleşen süre.</p>${(() => { const K = []; O.forEach((o, k) => (o.kayit || []).forEach(x => K.push({ ...x, op: o, k }))); K.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)) || b.at - a.at);
          return K.length ? `<section><h3 class="sec-t">Gün sonu kayıtları <small>${K.length}</small></h3><div class="loglist">${K.slice(0, 40).map(x => `<div class="logr gk"><span class="num">${fmtS(x.tarih)}</span><b>${plNo(x.op, x.k)}. ${esc(x.op.ad)}</b><span>${nf(x.adet)} adet${x.fire ? ` · <b class="late">${nf(x.fire)} fire</b>` : ""}${x.dk ? " · " + plDk(x.dk) : ""}${x.operator ? " · " + esc(x.operator) : ""} <small class="note">(${esc(x.by || "")})</small></span></div>`).join("")}</div></section>` : ""; })()}`
      : T === "bilgi" ? ieForm(e) : T === "mal" ? matHtml(e) : logHtml(e)}</div>
      ${T === "bilgi" && ieOk ? `<div class="df"><span>${can("pl.delete") ? '<button class="btn danger" id="ieDel" type="button">Sil</button>' : ""}</span><div class="r">${plIeOpen(e) ? (e.durum === "bekle" ? '<button class="btn ghost" id="ieRes" type="button">Beklemeden çıkar</button>' : '<button class="btn ghost" id="ieHold" type="button">Beklemeye al</button>') : ""}${plIeOpen(e) ? '<button class="btn ghost" id="ieCan" type="button">İptal et</button>' : ""}<button class="btn" id="ieS" type="button">Kaydet</button></div></div>` : ""}
    </aside>`;
    const db = $("#drawerHost .db"); if (db) db.scrollTop = sc;
    $("#scrim").onclick = closeDrawer; $("#ieX").onclick = closeDrawer;
    document.querySelectorAll("[data-it]").forEach(b => b.onclick = () => { T = b.dataset.it; paint(); });
    document.querySelectorAll("[data-fn]").forEach(el => el.onclick = () => { const r = $("#op" + el.dataset.fn); if (r) { r.scrollIntoView({ block: "center", behavior: "smooth" }); r.classList.add("flash"); setTimeout(() => r.classList.remove("flash"), 1200); } });
    document.querySelectorAll("[data-op]").forEach(b => b.onclick = () => { b.disabled = true; plOpAction(e, Number(b.dataset.k), b.dataset.op); });
    document.querySelectorAll("[data-opq]").forEach(inp => inp.onchange = () => plOpAction(e, Number(inp.dataset.opq), "adet", Number(inp.value)));
    document.querySelectorAll("[data-opf]").forEach(inp => inp.onchange = () => plOpAction(e, Number(inp.dataset.opf), "fire", Number(inp.value)));
    const pr = $("#iePrint"); if (pr) pr.onclick = () => plPrintIe(e);
    if (T === "bilgi" && ieOk) bindIe(e);
  }
  const ieForm = e => { const dis = ieOk ? "" : " disabled"; return `<div class="fgrid">
      <div class="field"><label>İş emri no</label><input value="${esc(e.no)}" disabled></div>
      <div class="field"><label for="iSip">Sipariş no</label><input id="iSip" maxlength="40" value="${esc(e.siparisNo || "")}" placeholder="Stoka üretimse boş"${dis}></div>
      <div class="field full"><label for="iMus">Müşteri</label><input id="iMus" maxlength="100" value="${esc(e.musteri || "")}"${dis}></div>
      <div class="field"><label>Ürün</label><input value="${esc(e.urunAd)}" disabled></div>
      <div class="field"><label>İş akış şeması</label><input value="${esc(e.akisAd || "—")}" disabled></div>
      <div class="field"><label for="iMik">Miktar</label><input id="iMik" type="number" min="1" step="any" value="${esc(e.miktar)}"${dis}></div>
      <div class="field"><label for="iOnc">Öncelik</label><select id="iOnc"${dis}>${Object.entries(PL_ONC).map(([k, [l]]) => opt(k, l, e.oncelik || "normal")).join("")}</select></div>
      <div class="field"><label for="iBas">Planlanan başlangıç</label><input id="iBas" type="date" value="${esc(e.plBas || "")}"${dis}></div>
      <div class="field"><label for="iTer">Termin</label><input id="iTer" type="date" value="${esc(e.termin || "")}"${dis}></div>
      <div class="field"><label for="iSor">Sorumlu</label><input id="iSor" list="iSorL" maxlength="80" value="${esc(e.sorumlu || "")}"${dis}><datalist id="iSorL">${sortTr([...Object.values(state.access || {}).map(m => m && m.name), ...PT.people.map(p => p.ad)]).map(n => `<option value="${esc(n)}">`).join("")}</datalist></div>
      <div class="field full"><label for="iNot">Not</label><textarea id="iNot" maxlength="1000"${dis}>${esc(e.not || "")}</textarea></div>
    </div><p class="note" style="margin:0">Oluşturan: ${esc(e.createdBy || "—")} · ${e.createdAt ? skTs(e.createdAt) : ""}. Operasyonlar iş emri açılırken iş akış şemasından kopyalanır; şema sonradan değişse de bu iş emri etkilenmez.</p>`; };
  const matHtml = e => `<div class="empty" style="margin:0"><h3>Ürün ağacı bağlanınca burada görünecek</h3><p>Ürün ağacı Stok modülünde mamul kartına tanımlandığında bu iş emri için gereken malzemeler (miktar × ağaç), stoktaki miktarlar ve eksikler burada listelenecek. İş emri başlarken malzeme ayrılacak, bittiğinde stoktan düşülüp mamul stoka girecek.</p></div>`;
  const logHtml = e => `<div class="loglist">${(e.log || []).slice().reverse().map(l => `<div class="logr"><span class="num note">${skTs(l.at)}</span><b>${esc(l.by || "")}</b><span>${esc(l.t)}</span></div>`).join("") || '<p class="note">Kayıt yok.</p>'}</div>`;
  function bindIe(e) {
    const save = async (patch, msg) => { try { await updateDoc(doc(fs, "isemri", e.id), { ...patch, updatedAt: Date.now(), updatedBy: ME.name, log: [...(e.log || []), { at: Date.now(), by: ME.name, t: msg }].slice(-80) }); toast(msg); } catch (x) { toast(writeErr(x)); } };
    $("#ieS").onclick = () => { const m = Number($("#iMik").value); if (!(m > 0)) { toast("Miktarı girin"); return; }
      save({ siparisNo: $("#iSip").value.trim(), musteri: $("#iMus").value.trim(), miktar: m, oncelik: $("#iOnc").value, plBas: $("#iBas").value, termin: $("#iTer").value, sorumlu: $("#iSor").value.trim(), not: $("#iNot").value.trim() }, "İş emri bilgileri güncellendi"); };
    const h = $("#ieHold"); if (h) h.onclick = () => save({ durum: "bekle", oncekiDurum: e.durum }, "Beklemeye alındı");
    const r = $("#ieRes"); if (r) r.onclick = () => save({ durum: e.oncekiDurum && e.oncekiDurum !== "bekle" ? e.oncekiDurum : "plan" }, "Beklemeden çıkarıldı");
    const c = $("#ieCan"); if (c) { let armed = false; c.onclick = () => { if (!armed) { armed = true; c.textContent = "İptal için tekrar basın"; return; } save({ durum: "iptal" }, "İş emri iptal edildi"); }; }
    const d = $("#ieDel"); if (d) { let armed = false; d.onclick = async () => { if (!armed) { armed = true; d.textContent = "Silmek için tekrar basın"; return; } try { await deleteDoc(doc(fs, "isemri", e.id)); toast(e.no + " silindi"); closeDrawer(); } catch (x) { toast(writeErr(x)); } }; }
  }
  paint();
}
// Operasyon işlemleri: başlat / duraklat / bitir / geri al / adet
async function plOpAction(e, k, act, val) {
  const O = (e.ops || []).map(o => ({ ...o, calisma: (o.calisma || []).map(c => ({ ...c })) })), o = O[k]; if (!o) return;
  const now = Date.now(), q = Number(e.miktar) || 0, close = () => o.calisma.forEach(c => { if (!c.bit) c.bit = now; });
  let msg = "";
  if (act === "bas") { if (!o.calisma.some(c => !c.bit)) o.calisma.push({ bas: now, by: ME.name }); o.durum = "devam"; o.operator = o.operator || ME.name; msg = `${k + 1}. ${o.ad} başlatıldı`; }
  if (act === "dur") { close(); o.durum = "durdu"; msg = `${k + 1}. ${o.ad} duraklatıldı`; }
  if (act === "bit") { close(); o.durum = "bitti"; o.tamam = q; o.bitis = now; msg = `${k + 1}. ${o.ad} bitirildi`; }
  if (act === "geri") { o.durum = o.calisma.length ? "durdu" : "bekliyor"; o.tamam = Math.min(Number(o.tamam) || 0, q); msg = `${k + 1}. ${o.ad} yeniden açıldı`; }
  if (act === "fire") { o.fire = Math.max(0, Number(val) || 0); msg = `${plNo(o, k)}. ${o.ad}: fire ${nf(o.fire)} adet`; }
  if (act === "adet") { const n = Math.max(0, Math.min(q, Number(val) || 0)); o.tamam = n; if (n >= q && q > 0) { close(); o.durum = "bitti"; o.bitis = now; } else if (o.durum === "bitti") o.durum = "durdu"; else if (o.durum === "bekliyor" && n > 0) o.durum = "durdu"; msg = `${k + 1}. ${o.ad}: ${nf(n)}/${nf(q)} tamamlandı`; }
  const all = O.every(x => x.durum === "bitti"), any = O.some(x => x.durum !== "bekliyor");
  const durum = all ? "bitti" : e.durum === "bekle" ? "bekle" : any ? "uretim" : "plan";
  const patch = { ops: O, durum, updatedAt: now, updatedBy: ME.name, log: [...(e.log || []), { at: now, by: ME.name, t: msg }, ...(all && e.durum !== "bitti" ? [{ at: now, by: ME.name, t: "İş emri tamamlandı" }] : [])].slice(-80) };
  if (all && e.durum !== "bitti") patch.bitis = now; if (any && !e.basladi) patch.basladi = now;
  try { await updateDoc(doc(fs, "isemri", e.id), patch); toast(all && e.durum !== "bitti" ? `${e.no} tamamlandı` : msg); } catch (x) { toast(writeErr(x)); plChanged(); }
}

/* Yeni iş emri */
function plOpenNewIe(pre = {}) {
  if (!can("pl.ie")) return;
  if (!PL.akis.length) { toast("Önce İş akış şemaları sekmesinden en az bir şema oluşturun."); PL.view = "akis"; renderPlan(); return; }
  let prods = (typeof SK !== "undefined" ? SK.items : []).filter(i => i.aktif !== false && (i.tip === "M" || /mamul/i.test(i.anaGrup || "") || PL.akis.some(a => (a.urunler || []).includes(i.id))));
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="niT" style="width:min(720px,100%)">
    <div class="dh"><h2 id="niT">Yeni iş emri · <span class="num">${esc(plNextNo())}</span></h2><button class="x" id="niX" aria-label="Kapat">×</button></div>
    <div class="db">
      <div class="kopts sm" role="radiogroup" aria-label="Üretim türü"><button type="button" role="radio" class="kopt on" aria-checked="true" data-nt="sip" style="--tc:var(--brand)"><i></i>Siparişe üretim</button><button type="button" role="radio" class="kopt" aria-checked="false" data-nt="stok" style="--tc:var(--k-gunluk)"><i></i>Stoka üretim</button></div>
      <div class="fgrid">
        <div class="field nsip"><label for="nSip">Sipariş no</label><input id="nSip" list="nSipL" maxlength="40" value="${esc(pre.siparisNo || "")}" placeholder="Örn. SP-2026-120"><datalist id="nSipL">${sortTr(PL.ie.map(e => e.siparisNo)).map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
        <div class="field nsip"><label for="nMus">Müşteri</label><input id="nMus" maxlength="100" value="${esc(pre.musteri || "")}"></div>
        <div class="field full"><label for="nAk">İş akış şeması *</label><select id="nAk"><option value="">Seçin</option>${PL.akis.map(a => opt(a.id, `${a.kod} · ${a.ad}`, pre.akisId || "")).join("")}</select></div>
        <div class="field full"><label for="nUr">Ürün *</label><input id="nUr" list="nUrL" maxlength="140" placeholder="Stok kodu (M-0101…) ya da ad yazın, listeden seçin" value="${esc(pre.urunAd || "")}"><datalist id="nUrL">${prods.map(i => `<option value="${esc(i.kod + " · " + i.ad)}">`).join("")}${PL.akis.map(a => a.urunAd ? `<option value="${esc(a.urunAd)}">` : "").join("")}</datalist></div>
        <div class="field"><label for="nMik">Miktar *</label><input id="nMik" type="number" min="1" step="any" value="${esc(pre.miktar || "")}"></div>
        <div class="field"><label for="nBir">Birim</label><select id="nBir">${["Adet", "Takım", "Metre", "m²", "Kg"].map(b => opt(b, b, "Adet")).join("")}</select></div>
        <div class="field"><label for="nBas">Planlanan başlangıç</label><input id="nBas" type="date" value="${TODAY}"></div>
        <div class="field"><label for="nTer">Termin</label><input id="nTer" type="date"></div>
        <div class="field"><label for="nOnc">Öncelik</label><select id="nOnc">${Object.entries(PL_ONC).map(([k, [l]]) => opt(k, l, "normal")).join("")}</select></div>
        <div class="field"><label for="nSor">Sorumlu</label><input id="nSor" list="nSorL" maxlength="80"><datalist id="nSorL">${sortTr([...Object.values(state.access || {}).map(m => m && m.name), ...PT.people.map(p => p.ad)]).map(n => `<option value="${esc(n)}">`).join("")}</datalist></div>
        <div class="field full"><label for="nNot">Not</label><textarea id="nNot" maxlength="1000" placeholder="Ölçü, renk, özel istek…"></textarea></div>
      </div>
      <div id="nPrev"></div>
    </div>
    <div class="df"><span class="note">Operasyonlar seçilen şemadan kopyalanır.</span><div class="r"><button class="btn ghost" id="niC" type="button">Vazgeç</button><button class="btn" id="niS" type="button">İş emrini aç</button></div></div>
  </aside>`;
  let tur = "sip";
  $("#scrim").onclick = closeDrawer; $("#niX").onclick = closeDrawer; $("#niC").onclick = closeDrawer;
  document.querySelectorAll("[data-nt]").forEach(b => b.onclick = () => { tur = b.dataset.nt; document.querySelectorAll("[data-nt]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); document.querySelectorAll(".nsip").forEach(x => x.hidden = tur !== "sip"); });
  const prev = () => {
    const a = PL.akis.find(x => x.id === $("#nAk").value), q = Number($("#nMik").value) || 0, box = $("#nPrev");
    if (!a) { box.innerHTML = ""; return; }
    const steps = a.adimlar || [], crit = plCrit(steps, s => plStepPlan(s, q)), tot = steps.reduce((s, x) => s + plStepPlan(x, q), 0);
    const start = Math.max(Date.now(), $("#nBas").value ? istTs($("#nBas").value, PL.cfg.mesaiBas) : 0), eta = q ? plAddWork(start, crit) : null, ter = $("#nTer").value;
    box.innerHTML = `<section class="plprev"><h3 class="sec-t">Plan önizlemesi <small>${esc(a.kod)}</small></h3><div class="flowbox">${plFlow(steps)}</div>
      ${q ? `<div class="pkst"><div><b class="num">${plDk(tot)}</b><span>toplam iş yükü</span></div><div><b class="num">${plDk(crit)}</b><span>akış süresi (paralel hatlarla)</span></div><div class="${eta && ter && dayOf(eta) > ter ? "b" : ""}"><b class="num">${eta ? fmtS(dayOf(eta)) : "—"}</b><span>tahmini bitiş</span></div><div><b class="num">${steps.length}</b><span>operasyon</span></div></div>
      ${eta && ter && dayOf(eta) > ter ? `<p class="late" style="margin:8px 0 0">Bu miktar mevcut mesaiyle termine yetişmiyor (tahmini ${fmtS(dayOf(eta))}). Diğer iş emirlerinin istasyon yükü hesaba katılmadı.</p>` : '<p class="note" style="margin:8px 0 0">Tahmin; mesai saatleri ve şemadaki birim sürelere göre, diğer iş emirlerinin istasyon yükü hariç hesaplanır.</p>'}` : '<p class="note">Miktarı girince süre ve tahmini bitiş hesaplanır.</p>'}</section>`;
  };
  $("#nAk").onchange = () => { const a = PL.akis.find(x => x.id === $("#nAk").value); if (a && !$("#nUr").value) $("#nUr").value = a.urunAd || a.ad; prev(); };
  let st = null;
  $("#nUr").oninput = () => { const v = $("#nUr").value, it = prods.find(i => i.kod + " · " + i.ad === v);
    if (it) { const a = PL.akis.find(x => (x.urunler || []).includes(it.id)) || plAkisForKod(it.kod); if (a) { $("#nAk").value = a.id; prev(); } return; }
    // stok kartlarında ara (kod öneki ya da kelime)
    clearTimeout(st); const q = v.trim(); if (q.length < 3 || lvl("stok") === "none") return;
    st = setTimeout(async () => { try { const c = collection(fs, "stok"), Q = q.toLocaleUpperCase("tr");
      const ref = /^[A-ZÇĞİÖŞÜ]{1,2}-/.test(Q) ? query(c, where("kod", ">=", Q), where("kod", "<=", Q + "\uf8ff"), orderBy("kod"), limit(25)) : query(c, where("kelimeler", "array-contains", skBestTok(q).slice(0, 11)), limit(25));
      const s = await getDocs(ref); const L = s.docs.map(d => ({ id: d.id, ...d.data() })); const ids = new Set(prods.map(p => p.id)); L.forEach(i => { if (!ids.has(i.id)) prods.push(i); });
      $("#nUrL").innerHTML = L.map(i => `<option value="${esc(i.kod + " · " + i.ad)}">`).join(""); } catch (e) { console.warn(e); } }, 300); };
  ["nMik", "nBas", "nTer"].forEach(k => $("#" + k).oninput = prev);
  if (pre.akisId) prev();
  $("#niS").onclick = async () => {
    const a = PL.akis.find(x => x.id === $("#nAk").value), q = Number($("#nMik").value), ur = $("#nUr").value.trim();
    if (!a) { toast("İş akış şemasını seçin"); return; } if (!ur) { toast("Ürünü girin"); return; } if (!(q > 0)) { toast("Miktarı girin"); return; }
    const it = prods.find(i => i.kod + " · " + i.ad === ur), now = Date.now(), no = plNextNo();
    const data = { no, tur, siparisNo: tur === "sip" ? $("#nSip").value.trim() : "", musteri: tur === "sip" ? $("#nMus").value.trim() : "", urunId: it ? it.id : "", urunAd: ur, akisId: a.id, akisAd: `${a.kod} · ${a.ad}`,
      miktar: q, birim: $("#nBir").value, plBas: $("#nBas").value, termin: $("#nTer").value, oncelik: $("#nOnc").value, sorumlu: $("#nSor").value.trim(), not: $("#nNot").value.trim(), durum: "plan",
      ops: (a.adimlar || []).map((s, i) => ({ no: plNo(s, i), onceki: Array.isArray(s.onceki) ? s.onceki : (i ? [plNo(a.adimlar[i - 1], i - 1)] : []), ad: s.ad || s.tanim || "", tanim: s.tanim || "", ist: s.ist, alt: s.alt || "", sure: Number(s.sure) || 0, hazirlik: Number(s.hazirlik) || 0, kk: s.kk || "", sop: s.sop || "", durum: "bekliyor", tamam: 0, fire: 0, calisma: [] })),
      log: [{ at: now, by: ME.name, t: "İş emri açıldı" }], createdAt: now, createdBy: ME.name, createdByUid: ME.uid, updatedAt: now, updatedBy: ME.name };
    $("#niS").disabled = true;
    try { const ref = doc(collection(fs, "isemri")); await setDoc(ref, data); toast(no + " açıldı"); closeDrawer(); setTimeout(() => plOpenIe(ref.id), 150); } catch (x) { $("#niS").disabled = false; toast(writeErr(x)); }
  };
}

/* İş akış şemaları */
const plAkisState = a => { const S = a.adimlar || []; if (!S.length) return ["Adım yok", "var(--ink-3)"]; if (S.some(s => !s.ist)) return ["İstasyon bekleniyor", "var(--k-izinsiz)"]; if (S.some(s => !(Number(s.sure) > 0))) return ["Süre bekleniyor", "var(--k-gec)"]; if (S.some(s => !s.sop)) return ["SOP bekleniyor", "var(--k-gunluk)"]; return ["Tamam", "var(--k-fabrikada)"]; };
function plAkisView(v) {
  if (!PL.akis.length) {
    v.innerHTML = `<div class="empty"><h3>Henüz iş akış şeması yok</h3><p>Her ürünün hangi operasyonlardan ve hangi iş istasyonlarından geçtiğini tanımlayın. İş emirleri bu şemalardan oluşturulur. Ürün İş Akış Şemaları Excel dosyasındaki ${PL_AKIS_SEED.length} ürünün akışını tek tuşla yükleyebilirsiniz.${PL.ist.length ? "" : " Önce İş istasyonları sekmesinden istasyonları yükleyin."}</p>${can("pl.akis") ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="akE2" type="button">${PL_AKIS_SEED.length} akış şemasını yükle</button><button class="btn ghost" id="akE" type="button">+ Boş şema oluştur</button></div>` : ""}</div>`;
    const b = $("#akE"); if (b) { b.onclick = () => plOpenAkis(null); $("#akE2").onclick = plSeedAkis; } return;
  }
  const AF = PL.AF = PL.AF || { grup: "", dur: "", q: "" };
  const used = id => PL.ie.filter(e => e.akisId === id);
  const grups = sortTr(PL.akis.map(a => a.grup));
  v.innerHTML = `<div class="pkbar"><div class="filters">
      <select class="f${AF.grup ? " on" : ""}" id="akG" aria-label="Ürün grubu"><option value="">Tüm ürün grupları</option>${grups.map(g => opt(g, g, AF.grup)).join("")}</select>
      <select class="f${AF.dur ? " on" : ""}" id="akD" aria-label="Durum"><option value="">Tüm durumlar</option>${["İstasyon bekleniyor", "Süre bekleniyor", "SOP bekleniyor", "Tamam"].map(d => opt(d, d, AF.dur)).join("")}</select>
      <input class="f" id="akQ" type="search" placeholder="Ürün, kod veya istasyon ara…" aria-label="Akışlarda ara" value="${esc(AF.q)}"></div>
      <div class="filters"><span class="sortinfo" id="akInfo"></span></div></div><div id="akList"></div>
    <p class="note" style="margin:-18px 0 28px">Durum, Excel'deki gibi hesaplanır: istasyonu boş adım varsa "İstasyon bekleniyor", süresi girilmemiş adım varsa "Süre bekleniyor", SOP numarası eksikse "SOP bekleniyor".</p>`;
  const draw = () => {
    const q = AF.q.trim().toLocaleLowerCase("tr");
    const L = PL.akis.filter(a => (!AF.grup || a.grup === AF.grup) && (!AF.dur || plAkisState(a)[0] === AF.dur) && (!q || [a.kod, a.ad, a.urunAd, a.grup, ...(a.adimlar || []).map(s => s.ist + " " + s.ad)].join(" ").toLocaleLowerCase("tr").includes(q)))
      .sort((a, b) => (a.sira ?? 99) - (b.sira ?? 99) || String(a.ad).localeCompare(String(b.ad), "tr"));
    $("#akInfo").textContent = L.length + " / " + PL.akis.length + " şema";
    $("#akList").innerHTML = `<div class="akgrid">${L.map(a => { const S = a.adimlar || [], c1 = plCrit(S, s => Number(s.sure) || 0), u = used(a.id), st = plAkisState(a), sop = S.length ? Math.round(S.filter(s => s.sop).length / S.length * 100) : 0, loose = plLoose(S);
      return `<article class="akcard" data-ak="${esc(a.id)}" role="button" tabindex="0">
        <div class="akh"><div><span class="num akk">${esc(a.kod)}</span>${a.grup ? ` <span class="ttag" style="--tc:var(--ink-3)">${esc(a.grup)}</span>` : ""}<h3>${esc(a.ad)}</h3>${a.aciklama ? `<div class="note">${esc(a.aciklama)}</div>` : ""}</div>
          <div class="akm">${c1 ? `<b class="num">${nf(c1, 1)} dk</b><span>adet başına akış</span>` : ""}<span class="kst" style="--tc:${st[1]}">${st[0]}</span></div></div>
        <div class="flowbox mini">${plFlow(S, { mini: true })}</div>
        <div class="akf"><span>${S.length} operasyon · ${new Set(S.map(s => s.ist).filter(Boolean)).size} istasyon</span><span>SOP %${sop}</span>${loose.length ? `<span class="late" title="Bu adımlardan sonra gelen adım yok; Önceki operasyon bağlantılarını kontrol edin">Kopuk bağlantı: ${loose.join(", ")}</span>` : ""}${u.filter(plIeOpen).length ? `<span>${u.filter(plIeOpen).length} açık iş emri</span>` : ""}${can("pl.ie") ? `<button type="button" class="btn ghost sm" data-akie="${esc(a.id)}">+ İş emri</button>` : ""}</div>
      </article>`; }).join("") || '<p class="note">Bu filtrelere uyan şema yok.</p>'}</div>`;
    $("#akList").querySelectorAll("[data-ak]").forEach(el => { const go = () => plOpenAkis(el.dataset.ak); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter" && ev.target === el) go(); }; });
    $("#akList").querySelectorAll("[data-akie]").forEach(b => b.onclick = ev => { ev.stopPropagation(); const a = PL.akis.find(x => x.id === b.dataset.akie); plOpenNewIe({ akisId: a.id, urunAd: a.urunAd || a.ad }); });
  };
  draw();
  $("#akG").onchange = e => { AF.grup = e.target.value; renderPlan(); };
  $("#akD").onchange = e => { AF.dur = e.target.value; renderPlan(); };
  $("#akQ").oninput = e => { AF.q = e.target.value; draw(); };
}
async function plSeedAkis() {
  if (!can("pl.akis")) return;
  const now = Date.now(), b = writeBatch(fs);
  PL_AKIS_SEED.forEach((a, k) => b.set(doc(collection(fs, "akis")), { kod: a.kod, ad: a.ad, grup: a.grup, urunAd: a.ad, aciklama: a.aciklama, malzeme: a.malzeme, rev: a.rev, sira: k + 1,
    adimlar: a.adimlar.map(s => ({ ...s, sure: 0, hazirlik: 0, sorumlu: "", kk: "", sop: "" })), urunler: [], createdAt: now, createdBy: ME.name, updatedAt: now, updatedBy: ME.name }));
  try { await b.commit(); toast(PL_AKIS_SEED.length + " iş akış şeması yüklendi. Süreleri sahada ölçüp girin."); } catch (x) { toast(writeErr(x)); }
}
const plParseOnceki = t => [...new Set(String(t || "").split(/[^\d]+/).filter(Boolean).map(Number))];
function plOpenAkis(id, copyFrom) {
  const src = id ? PL.akis.find(x => x.id === id) : copyFrom || null; if (id && !src) return;
  const ed = can("pl.akis"), dis = ed ? "" : " disabled";
  // adımlar her zaman 1..n numaralı tutulur; öncüller numaraya göre
  let steps = (src ? src.adimlar || [] : []).map((s, i) => ({ ...s, no: plNo(s, i), onceki: Array.isArray(s.onceki) ? s.onceki.slice() : (i ? [i] : []) }));
  if (!steps.length && ed) steps.push({ no: 1, ad: "", tanim: "", ist: "", alt: "", onceki: [], sure: "", hazirlik: "", sorumlu: "", kk: "", sop: "" });
  const linkable = (typeof SK !== "undefined" ? SK.items : []).filter(i => i.aktif !== false);
  let links = new Set(src ? src.urunler || [] : []), open = new Set();
  const renum = map => { steps.forEach((s, i) => { s.onceki = (s.onceki || []).map(n => map.has(n) ? map.get(n) : null).filter(n => n != null && n !== i + 1); }); steps.forEach((s, i) => s.no = i + 1); };
  const istOpts = cur => `<option value="">İstasyon seçin</option>${PL_BOLUM.map(([b, l]) => { const L = plIstSorted().filter(i => i.bolum === b); return L.length ? `<optgroup label="${esc(l)}">${L.map(i => opt(i.kod, `${i.kod} · ${i.ad}${i.durum && i.durum !== "aktif" ? " (" + PL_IDUR[i.durum][0] + ")" : ""}`, cur)).join("")}</optgroup>` : ""; }).join("")}${cur && !plIst(cur) ? opt(cur, cur + " (listede yok)", cur) : ""}`;
  const paint = () => {
    const sc = $("#drawerHost .db") ? $("#drawerHost .db").scrollTop : 0;
    $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
    <aside class="drawer${$("#drawerHost .drawer") ? " noanim" : ""}" role="dialog" aria-modal="true" aria-labelledby="akT" style="width:min(1040px,100%)">
      <div class="dh"><h2 id="akT">${id ? esc(src.kod + " · " + src.ad) : copyFrom ? "Kopyadan yeni şema" : "Yeni iş akış şeması"}</h2><button class="x" id="akX" aria-label="Kapat">×</button></div>
      <div class="db">
        <div class="fgrid four">
          <div class="field"><label for="aAd">Ürün / şema adı *</label><input id="aAd" maxlength="100" placeholder="Örn. Tek sıra kanat menfez" value="${esc(val("aAd", src ? src.ad + (copyFrom ? " (kopya)" : "") : ""))}"${dis}></div>
          <div class="field"><label for="aKod">Kod *</label><input id="aKod" maxlength="30" placeholder="AKS-TSK" style="font-family:var(--mono);text-transform:uppercase" value="${esc(val("aKod", src && !copyFrom ? src.kod : ""))}"${dis}></div>
          <div class="field"><label for="aGr">Ürün grubu</label><input id="aGr" list="aGrL" maxlength="40" value="${esc(val("aGr", src ? src.grup || "" : ""))}"${dis}><datalist id="aGrL">${sortTr(["Menfez", "Difüzör", "Panjur", "Damper", "Kanal", ...PL.akis.map(a => a.grup)]).map(g => `<option value="${esc(g)}">`).join("")}</datalist></div>
          <div class="field"><label for="aRev">Revizyon / tarih</label><input id="aRev" maxlength="60" value="${esc(val("aRev", src ? src.rev || "" : ""))}" placeholder="v1 · 17.10.2026"${dis}></div>
          <div class="field" style="grid-column:span 2"><label for="aAc">Ürün açıklaması</label><input id="aAc" maxlength="200" value="${esc(val("aAc", src ? src.aciklama || "" : ""))}"${dis}></div>
          <div class="field" style="grid-column:span 2"><label for="aMz">Ana malzeme</label><input id="aMz" maxlength="80" value="${esc(val("aMz", src ? src.malzeme || "" : ""))}"${dis}></div>
        </div>
        <section><h3 class="sec-t">İş akış diyagramı <small id="aSum"></small></h3><div class="flowbox" id="aFlow"></div><div id="aWarn"></div></section>
        <section><h3 class="sec-t">Operasyonlar <small>"Önceki" sütununa öncül operasyon numaralarını yazın (örn. 9, 3). Aynı öncülden çıkan adımlar paralel yürür.</small></h3>
          <div class="stp-h"><span>No</span><span>Operasyon adı</span><span>İstasyon / makine</span><span>Önceki</span><span>Dk/adet</span><span>Hazırlık dk</span><span></span></div>
          <div class="stps">${steps.map((s, k) => `<div class="stp${open.has(k) ? " open" : ""}" data-k="${k}">
            <span class="num stn">${k + 1}</span>
            <input data-f="ad" maxlength="80" value="${esc(s.ad || "")}" placeholder="${esc((s.tanim || "Operasyon adı").slice(0, 40))}" aria-label="Operasyon adı"${dis}>
            <select data-f="ist" aria-label="İş istasyonu"${dis}>${istOpts(s.ist)}</select>
            <input data-f="onceki" value="${esc((s.onceki || []).join(", "))}" placeholder="${k ? "—" : "başlangıç"}" aria-label="Önceki operasyon"${dis}>
            <input data-f="sure" type="number" min="0" step="any" value="${esc(s.sure || "")}" aria-label="Dakika / adet"${dis}>
            <input data-f="hazirlik" type="number" min="0" step="any" value="${esc(s.hazirlik || "")}" aria-label="Hazırlık dakikası"${dis}>
            <span class="stb"><button type="button" data-op="${k}" aria-label="Ayrıntılar" title="Tanım, alternatif istasyon, sorumlu, kalite kontrol, SOP">${open.has(k) ? "▴" : "▾"}</button>${ed ? `<button type="button" data-mv="-1" data-k="${k}" aria-label="Yukarı"${k ? "" : " disabled"}>↑</button><button type="button" data-mv="1" data-k="${k}" aria-label="Aşağı"${k < steps.length - 1 ? "" : " disabled"}>↓</button><button type="button" class="rm" data-rm="${k}" aria-label="Adımı sil">×</button>` : ""}</span>
            <div class="stx">
              <div class="field" style="grid-column:1/-1"><label>Operasyon tanımı</label><textarea data-f="tanim" maxlength="400" rows="2"${dis}>${esc(s.tanim || "")}</textarea></div>
              <div class="field"><label>Alternatif istasyon</label><select data-f="alt"${dis}>${istOpts(s.alt).replace("İstasyon seçin", "Yok")}</select></div>
              <div class="field"><label>Sorumlu</label><input data-f="sorumlu" maxlength="60" value="${esc(s.sorumlu || "")}"${dis}></div>
              <div class="field"><label>Kalite kontrol noktası</label><input data-f="kk" maxlength="120" value="${esc(s.kk || "")}" placeholder="Örn. ölçü ±1 mm"${dis}></div>
              <div class="field"><label>SOP no</label><input data-f="sop" maxlength="30" value="${esc(s.sop || "")}" placeholder="SOP-TSK-02"${dis}></div>
            </div>
          </div>`).join("")}</div>
          ${ed ? '<button type="button" class="btn ghost gadd" id="aAdd">+ Operasyon ekle</button>' : ""}</section>
        <div class="field"><label for="aKo">Bağlı stok kodu önekleri</label><input id="aKo" maxlength="200" value="${esc(val("aKo", ((src && src.kodOnek) || PL_KOD_AKIS_DEF[src && src.kod] || []).join(", ")))}" placeholder="Örn. M-0101, M-0102" style="font-family:var(--mono)"${dis}><span class="note">Bu öneklerle başlayan stok kodlarından iş emri açılınca bu şema kendiliğinden seçilir.</span></div>
      </div>
      <div class="df"><span>${id && ed ? '<button class="btn danger" id="aDel" type="button">Sil</button><button class="btn ghost" id="aCopy" type="button">Kopyala</button>' : ""}</span><div class="r"><button class="btn ghost" id="aC" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="aS" type="button">Kaydet</button>' : ""}</div></div>
    </aside>`;
    const db = $("#drawerHost .db"); if (db) db.scrollTop = sc;
    $("#scrim").onclick = closeDrawer; $("#akX").onclick = closeDrawer; $("#aC").onclick = closeDrawer;
    const redraw = () => { $("#aFlow").innerHTML = plFlow(steps); const S = steps, c = plCrit(S, s => Number(s.sure) || 0), tot = S.reduce((a, s) => a + (Number(s.sure) || 0), 0), miss = S.filter(s => !(Number(s.sure) > 0)).length, loose = plLoose(S), noi = S.filter(s => !s.ist).map(s => s.no);
      $("#aSum").textContent = `${S.length} operasyon${c ? ` · adet başına ${nf(c, 1)} dk akış · ${nf(tot, 1)} dk toplam iş` : ""}${miss ? ` · ${miss} operasyonda süre yok` : ""}`;
      $("#aWarn").innerHTML = (loose.length ? `<p class="late" style="margin:6px 0 0">Kopuk bağlantı: ${loose.join(", ")} numaralı operasyondan sonra gelen adım yok. "Önceki" sütununu kontrol edin.</p>` : "") + (noi.length ? `<p class="late" style="margin:6px 0 0">İstasyonu seçilmemiş operasyon: ${noi.join(", ")}</p>` : ""); };
    redraw();
    document.querySelectorAll(".stp [data-f]").forEach(el => { const ev = el.tagName === "SELECT" ? "change" : "input"; el.addEventListener(ev, () => {
      const k = Number(el.closest(".stp").dataset.k), f = el.dataset.f;
      steps[k][f] = f === "onceki" ? plParseOnceki(el.value).filter(n => n !== k + 1 && n <= steps.length) : el.value;
      redraw(); }); });
    document.querySelectorAll("[data-op]").forEach(b => b.onclick = () => { const k = Number(b.dataset.op); open.has(k) ? open.delete(k) : open.add(k); b.closest(".stp").classList.toggle("open"); b.textContent = open.has(k) ? "▴" : "▾"; });
    document.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { keepTop(); const k = Number(b.dataset.k), j = k + Number(b.dataset.mv); [steps[k], steps[j]] = [steps[j], steps[k]]; renum(new Map([[k + 1, j + 1], [j + 1, k + 1], ...steps.map((_, i) => [i + 1, i + 1]).filter(([n]) => n !== k + 1 && n !== j + 1)])); open.clear(); paint(); });
    document.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { keepTop(); const k = Number(b.dataset.rm), gone = steps[k], m = new Map(); steps.splice(k, 1);
      // silinen adımın öncülleri ardıllarına aktarılır
      steps.forEach(s => { if ((s.onceki || []).includes(k + 1)) s.onceki = [...new Set([...s.onceki.filter(n => n !== k + 1), ...(gone.onceki || [])])]; });
      for (let n = 1; n <= steps.length + 1; n++) if (n !== k + 1) m.set(n, n > k + 1 ? n - 1 : n); renum(m); open.clear(); paint(); });
    document.querySelectorAll("[data-ln]").forEach(c => c.onchange = () => { c.checked ? links.add(c.dataset.ln) : links.delete(c.dataset.ln); });
    const ad = $("#aAdd"); if (ad) ad.onclick = () => { keepTop(); steps.push({ no: steps.length + 1, ad: "", tanim: "", ist: "", alt: "", onceki: steps.length ? [steps.length] : [], sure: "", hazirlik: "", sorumlu: "", kk: "", sop: "" }); paint(); const r = document.querySelectorAll(".stp"); const el = r[r.length - 1]; if (el) { el.scrollIntoView({ block: "center" }); el.querySelector("select").focus(); } };
    const cp = $("#aCopy"); if (cp) cp.onclick = () => { keepTop(); plOpenAkis(null, { ...src, ad: $("#aAd").value, adimlar: steps.map(s => ({ ...s })), urunler: [] }); };
    const del = $("#aDel"); if (del) { let armed = false; del.onclick = async () => {
      if (!armed) { armed = true; del.textContent = "Silmek için tekrar basın"; if (PL.ie.some(e => e.akisId === id && plIeOpen(e))) toast("Bu şemayla açılmış iş emirleri etkilenmez (operasyonları kopyalandı)."); return; }
      try { await deleteDoc(doc(fs, "akis", id)); toast("Şema silindi"); closeDrawer(); } catch (x) { toast(writeErr(x)); } }; }
    const sv = $("#aS"); if (sv) sv.onclick = async () => {
      const ad = $("#aAd").value.trim(), kod = $("#aKod").value.trim().toLocaleUpperCase("tr").replace(/\s+/g, "");
      if (!ad) { toast("Şema adını girin"); return; } if (!kod) { toast("Kodu girin"); return; }
      if (PL.akis.some(a => a.id !== id && a.kod === kod)) { toast(kod + " kodu kullanılıyor"); return; }
      const S = steps.map((s, i) => ({ no: i + 1, ad: String(s.ad || "").trim(), tanim: String(s.tanim || "").trim(), ist: s.ist || "", alt: s.alt && s.alt !== s.ist ? s.alt : "", onceki: (s.onceki || []).filter(n => n >= 1 && n <= steps.length && n !== i + 1),
        sure: Math.max(0, Number(s.sure) || 0), hazirlik: Math.max(0, Number(s.hazirlik) || 0), sorumlu: String(s.sorumlu || "").trim(), kk: String(s.kk || "").trim(), sop: String(s.sop || "").trim() })).filter(s => s.ad || s.tanim || s.ist);
      if (!S.length) { toast("En az bir operasyon ekleyin"); return; }
      sv.disabled = true;
      try { await setDoc(doc(fs, "akis", id || doc(collection(fs, "akis")).id), { kod, ad, grup: $("#aGr").value.trim(), urunAd: src && src.urunAd && !copyFrom ? src.urunAd : ad, aciklama: $("#aAc").value.trim(), malzeme: $("#aMz").value.trim(), rev: $("#aRev").value.trim(), sira: src && src.sira != null ? src.sira : 99, adimlar: S, urunler: [...links], kodOnek: [...new Set(($("#aKo").value || "").toLocaleUpperCase("tr").split(/[\s,;]+/).filter(x => /^[A-ZÇĞİÖŞÜ]{1,2}-\d*$/.test(x)))], updatedAt: Date.now(), updatedBy: ME.name, ...(id ? { createdAt: src.createdAt || Date.now(), createdBy: src.createdBy || ME.name } : { createdAt: Date.now(), createdBy: ME.name }) });
        toast("İş akış şeması kaydedildi"); closeDrawer(); } catch (x) { sv.disabled = false; toast(writeErr(x)); }
    };
  };
  const top = {}; const val = (k, d) => k in top ? top[k] : d;
  const keepTop = () => ["aAd", "aKod", "aGr", "aRev", "aAc", "aMz", "aKo"].forEach(k => { const el = $("#" + k); if (el) top[k] = el.value; });
  paint();
}

/* İş istasyonları */
function plIstView(v) {
  if (!PL.ist.length) {
    v.innerHTML = `<div class="empty"><h3>İş istasyonu listesi boş</h3><p>Kar-Men iş istasyonları listesindeki (İş İstasyonları.xlsx) ${PL_IST_SEED.length} istasyonu tek tuşla yükleyebilir, sonra her istasyonu ayrı ayrı güncelleyebilirsiniz.</p>${can("pl.ist") ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="isE1" type="button">${PL_IST_SEED.length} istasyonu yükle</button><button class="btn ghost" id="isE2" type="button">+ Tek tek ekle</button></div>` : ""}</div>`;
    const b = $("#isE1"); if (b) { b.onclick = plSeedIst; $("#isE2").onclick = () => plOpenIst(null); } return;
  }
  const IF = PL.IF;
  const busy = {}; PL.ie.filter(plIeOpen).forEach(e => { const q = Number(e.miktar) || 0; (e.ops || []).forEach(o => { if (o.durum === "bitti") return; const b = busy[o.ist] = busy[o.ist] || { now: null, n: 0, dk: 0 }; b.n++; b.dk += plStepPlan(o, q) * (1 - plOpDone(o, q)); if (o.durum === "devam") b.now = { e, o }; }); });
  v.innerHTML = `<div class="pkbar"><div class="filters">
      <select class="f${IF.bolum ? " on" : ""}" id="isB" aria-label="Bölüm"><option value="">Tüm bölümler</option>${PL_BOLUM.filter(([b]) => PL.ist.some(i => i.bolum === b)).map(([b, l]) => opt(b, l, IF.bolum)).join("")}</select>
      <select class="f${IF.dur ? " on" : ""}" id="isD" aria-label="Durum"><option value="">Tüm durumlar</option>${Object.entries(PL_IDUR).map(([k, [l]]) => opt(k, l, IF.dur)).join("")}</select>
      <input class="f" id="isQ" type="search" placeholder="Kod veya ad ara…" aria-label="İstasyon ara" value="${esc(IF.q)}"></div>
      <div class="filters">${Object.entries(PL_IDUR).map(([k, [l, c]]) => { const n = PL.ist.filter(i => (i.durum || "aktif") === k).length; return n ? `<span class="kst" style="--tc:${c}">${n} ${l.toLocaleLowerCase("tr")}</span>` : ""; }).join("")}</div></div>
    <div id="isList"></div>`;
  const draw = () => {
    const q = IF.q.trim().toLocaleLowerCase("tr");
    const L = plIstSorted().filter(i => (!IF.bolum || i.bolum === IF.bolum) && (!IF.dur || (i.durum || "aktif") === IF.dur) && (!q || (i.kod + " " + i.ad + " " + (i.operator || "")).toLocaleLowerCase("tr").includes(q)));
    $("#isList").innerHTML = PL_BOLUM.map(([b, l, c]) => { const G = L.filter(i => i.bolum === b); if (!G.length) return "";
      return `<section class="isgrp"><h3 class="isgh" style="--tc:${c}"><i></i>${esc(l)} <small>${G.length}</small></h3><div class="isgrid">${G.map(i => { const d = PL_IDUR[i.durum || "aktif"], bz = busy[i.kod], bak = i.sonrakiBakim && i.sonrakiBakim <= TODAY;
        return `<div class="iscard${i.durum && i.durum !== "aktif" ? " off" : ""}" data-is="${esc(i.id)}" role="button" tabindex="0" style="--tc:${c};--sc:${d[1]}">
          <div class="ish"><span class="num isk">${esc(i.kod)}</span><span class="kst" style="--tc:${d[1]}">${d[0]}</span></div>
          <b class="isn">${esc(i.ad)}</b>
          <div class="isl">${bz && bz.now ? `<span class="isnow">▶ ${esc(bz.now.e.no.replace(/^İE-\d{4}-/, "#"))} · ${esc(bz.now.o.ad)}</span>` : ""}${bz ? `<span>Kuyruk: ${bz.n} operasyon · ${plDk(bz.dk)}</span>` : '<span class="note">Bekleyen iş yok</span>'}${i.operator ? `<span>Operatör: ${esc(i.operator)}</span>` : ""}${bak ? '<span class="late">Bakım zamanı geldi</span>' : ""}</div>
        </div>`; }).join("")}</div></section>`; }).join("") || '<p class="note">Bu filtrelere uyan istasyon yok.</p>';
    $("#isList").querySelectorAll("[data-is]").forEach(el => { const go = () => plOpenIst(el.dataset.is); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  };
  draw();
  $("#isB").onchange = e => { IF.bolum = e.target.value; renderPlan(); };
  $("#isD").onchange = e => { IF.dur = e.target.value; renderPlan(); };
  $("#isQ").oninput = e => { IF.q = e.target.value; draw(); };
}
async function plSeedIst() {
  if (!can("pl.ist")) return;
  const now = Date.now(), b = writeBatch(fs);
  PL_IST_SEED.forEach(([kod, ad]) => b.set(doc(collection(fs, "istasyon")), { kod, ad, bolum: plBolumOf(kod), durum: "aktif", operator: "", gunlukDk: null, hedefVerim: 85, sonBakim: "", sonrakiBakim: "", not: "", createdAt: now, createdBy: ME.name, updatedAt: now, updatedBy: ME.name }));
  try { await b.commit(); toast(PL_IST_SEED.length + " iş istasyonu yüklendi"); } catch (x) { toast(writeErr(x)); }
}
function plOpenIst(id) {
  const i = id ? PL.ist.find(x => x.id === id) : null; if (id && !i) return;
  const ed = can("pl.ist"), dis = ed ? "" : " disabled";
  const flows = i ? PL.akis.filter(a => (a.adimlar || []).some(s => s.ist === i.kod)) : [];
  const q = []; if (i) PL.ie.filter(plIeOpen).forEach(e => (e.ops || []).forEach((o, k) => { if (o.ist === i.kod && o.durum !== "bitti") q.push({ e, o, k }); }));
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="isT" style="width:min(600px,100%)">
    <div class="dh"><h2 id="isT">${i ? `<span class="num">${esc(i.kod)}</span> · ${esc(i.ad)}` : "Yeni iş istasyonu"}</h2><button class="x" id="isX" aria-label="Kapat">×</button></div>
    <div class="db">
      <div class="fgrid">
        <div class="field"><label for="sKod">Makine kodu *</label><input id="sKod" maxlength="20" value="${esc(i ? i.kod : "")}" style="font-family:var(--mono);text-transform:uppercase" placeholder="EP-13"${dis}></div>
        <div class="field"><label for="sBol">Bölüm</label><select id="sBol"${dis}>${PL_BOLUM.map(([b, l]) => opt(b, l, i ? i.bolum : "diger")).join("")}</select></div>
        <div class="field full"><label for="sAd">Makine tanımı *</label><input id="sAd" maxlength="100" value="${esc(i ? i.ad : "")}"${dis}></div>
        <div class="field full"><label>Durum</label><div class="kopts sm" role="radiogroup">${Object.entries(PL_IDUR).map(([k, [l, c]]) => `<button type="button" role="radio" class="kopt${(i ? i.durum || "aktif" : "aktif") === k ? " on" : ""}" aria-checked="${(i ? i.durum || "aktif" : "aktif") === k}" data-sd="${k}" style="--tc:${c}"${dis}><i></i>${l}</button>`).join("")}</div></div>
        <div class="field"><label for="sOp">Operatör / sorumlu</label><input id="sOp" list="sOpL" maxlength="80" value="${esc(i ? i.operator || "" : "")}"${dis}><datalist id="sOpL">${PT.people.map(p => `<option value="${esc(p.ad)}">`).join("")}</datalist></div>
        <div class="field"><label for="sDk">Günlük çalışma (dk)</label><input id="sDk" type="number" min="0" max="1440" value="${esc(i && i.gunlukDk ? i.gunlukDk : "")}" placeholder="Mesai: ${PL.cfg.gunlukDk}"${dis}></div>
        <div class="field"><label for="sHv">Hedef verimlilik %</label><input id="sHv" type="number" min="0" max="200" value="${esc(i && i.hedefVerim != null ? i.hedefVerim : 85)}"${dis}></div>
        <div class="field"><label for="sSb">Son bakım</label><input id="sSb" type="date" value="${esc(i ? i.sonBakim || "" : "")}"${dis}></div>
        <div class="field"><label for="sNb">Sonraki bakım</label><input id="sNb" type="date" value="${esc(i ? i.sonrakiBakim || "" : "")}"${dis}></div>
        <div class="field full"><label for="sNot">Not</label><textarea id="sNot" maxlength="1000" placeholder="Arıza açıklaması, kapasite, kalıp bilgisi…"${dis}>${esc(i ? i.not || "" : "")}</textarea></div>
      </div>
      ${i ? `<section><h3 class="sec-t">Kuyruk <small>${q.length} operasyon</small></h3>${q.length ? q.map(({ e, o }) => `<div class="nowr" data-ie="${esc(e.id)}" role="button" tabindex="0"><span class="kst" style="--tc:${PL_ODUR[o.durum || "bekliyor"][1]}">${PL_ODUR[o.durum || "bekliyor"][0]}</span><div><b>${esc(o.ad)}</b><div class="note">${esc(e.no)} · ${esc(e.urunAd)} · ${nf(e.miktar)} ${esc(e.birim || "")}</div></div><span class="num note">${plDk(plStepPlan(o, e.miktar) * (1 - plOpDone(o, e.miktar)))}</span></div>`).join("") : '<p class="note">Bu istasyonda bekleyen operasyon yok.</p>'}</section>
      <section><h3 class="sec-t">Kullanıldığı iş akışları <small>${flows.length}</small></h3>${flows.map(a => `<div class="izmini" data-akl="${esc(a.id)}"><span class="num">${esc(a.kod)}</span><b>${esc(a.ad)}</b></div>`).join("") || '<p class="note">Henüz bir akışta kullanılmıyor.</p>'}</section>` : ""}
    </div>
    <div class="df"><span>${i && ed ? '<button class="btn danger" id="sDel" type="button">Sil</button>' : ""}</span><div class="r"><button class="btn ghost" id="sC" type="button">${ed ? "Vazgeç" : "Kapat"}</button>${ed ? '<button class="btn" id="sS" type="button">Kaydet</button>' : ""}</div></div>
  </aside>`;
  let dur = i ? i.durum || "aktif" : "aktif";
  $("#scrim").onclick = closeDrawer; $("#isX").onclick = closeDrawer; $("#sC").onclick = closeDrawer;
  document.querySelectorAll("[data-sd]").forEach(b => b.onclick = () => { dur = b.dataset.sd; document.querySelectorAll("[data-sd]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); });
  document.querySelectorAll(".nowr[data-ie]").forEach(el => el.onclick = () => plOpenIe(el.dataset.ie));
  document.querySelectorAll("[data-akl]").forEach(el => el.onclick = () => plOpenAkis(el.dataset.akl));
  const kodIn = $("#sKod"); if (kodIn && !i) kodIn.oninput = () => { $("#sBol").value = plBolumOf(kodIn.value); };
  const del = $("#sDel"); if (del) { let armed = false; del.onclick = async () => {
    if (flows.length && !armed) toast(`Bu istasyon ${flows.length} iş akışında kullanılıyor. Silmek yerine Pasif yapabilirsiniz.`);
    if (!armed) { armed = true; del.textContent = "Silmek için tekrar basın"; return; }
    try { await deleteDoc(doc(fs, "istasyon", i.id)); toast(i.kod + " silindi"); closeDrawer(); } catch (x) { toast(writeErr(x)); } }; }
  const sv = $("#sS"); if (sv) sv.onclick = async () => {
    const kod = $("#sKod").value.trim().toLocaleUpperCase("tr").replace(/\s+/g, ""), ad = $("#sAd").value.trim();
    if (!kod || !ad) { toast("Makine kodu ve tanımı girin"); return; }
    if (PL.ist.some(x => x.id !== (i && i.id) && x.kod === kod)) { toast(kod + " kodu zaten var"); return; }
    const data = { kod, ad, bolum: $("#sBol").value, durum: dur, operator: $("#sOp").value.trim(), gunlukDk: $("#sDk").value ? Number($("#sDk").value) : null, hedefVerim: Number($("#sHv").value) || 85, sonBakim: $("#sSb").value, sonrakiBakim: $("#sNb").value, not: $("#sNot").value.trim(), updatedAt: Date.now(), updatedBy: ME.name };
    sv.disabled = true;
    try {
      if (i) { await updateDoc(doc(fs, "istasyon", i.id), data);
        // kod değiştiyse akışlardaki adımları da güncelle
        if (i.kod !== kod) for (const a of PL.akis.filter(a => (a.adimlar || []).some(s => s.ist === i.kod))) await updateDoc(doc(fs, "akis", a.id), { adimlar: a.adimlar.map(s => s.ist === i.kod ? { ...s, ist: kod } : s) });
      } else await setDoc(doc(collection(fs, "istasyon")), { ...data, createdAt: Date.now(), createdBy: ME.name });
      toast(i && i.durum !== dur ? `${kod}: ${PL_IDUR[dur][0]}` : "İş istasyonu kaydedildi"); closeDrawer();
    } catch (x) { sv.disabled = false; toast(writeErr(x)); }
  };
}
function plOpenCfg() {
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="pcfT" style="width:min(460px,100%)">
    <div class="dh"><h2 id="pcfT">Planlama ayarları</h2><button class="x" id="pcfX" aria-label="Kapat">×</button></div>
    <div class="db"><div class="fgrid">
      <div class="field"><label for="pcfM">Mesai başlangıcı</label><input id="pcfM" type="time" value="${esc(PL.cfg.mesaiBas)}"></div>
      <div class="field"><label for="pcfD">Günlük net çalışma (dk)</label><input id="pcfD" type="number" min="60" max="1440" value="${esc(PL.cfg.gunlukDk)}"></div>
      <label class="chk field full"><input type="checkbox" id="pcfC"${PL.cfg.cumartesi ? " checked" : ""}> Cumartesi çalışma günü</label>
    </div><p class="note" style="margin:0">Tahmini bitiş tarihi bu mesai bilgisine göre hesaplanır (molalar düşülmüş net süre).</p>
    ${can("pl.ie") ? `<section><h3 class="sec-t">Deneme iş emirleri</h3><p class="note" style="margin:0 0 8px">Toplantıda işleyişi göstermek için 15 örnek iş emri. "DENEME" etiketiyle görünür; örnek süreler yalnızca bu iş emirlerine yazılır, akış şemalarınız değişmez.</p>${PL.ie.some(e => e.deneme) ? (can("pl.delete") ? '<button type="button" class="btn danger" id="pcfUn">Deneme iş emirlerini sil</button>' : '<p class="note">Deneme iş emirleri ekli.</p>') : '<button type="button" class="btn ghost" id="pcfSeed">15 deneme iş emri ekle</button>'}</section>` : ""}</div>
    <div class="df"><span></span><div class="r"><button class="btn ghost" id="pcfCa" type="button">Vazgeç</button><button class="btn" id="pcfS" type="button">Kaydet</button></div></div>
  </aside>`;
  $("#scrim").onclick = closeDrawer; $("#pcfX").onclick = closeDrawer; $("#pcfCa").onclick = closeDrawer;
  const sd = $("#pcfSeed"); if (sd) sd.onclick = () => { closeDrawer(); plSeedDemo(); };
  const un = $("#pcfUn"); if (un) { let armed = false; un.onclick = async () => { if (!armed) { armed = true; un.textContent = "Silmek için tekrar basın"; return; } un.disabled = true; await plUnseedDemo(); closeDrawer(); }; }
  if (!can("pl.ist")) { ["pcfM", "pcfD", "pcfC"].forEach(k => $("#" + k).disabled = true); $("#pcfS").hidden = true; }
  $("#pcfS").onclick = async () => { try { await setDoc(doc(fs, "config", "planlama"), { mesaiBas: $("#pcfM").value || "08:00", gunlukDk: Math.max(60, Number($("#pcfD").value) || 540), cumartesi: $("#pcfC").checked, updatedAt: Date.now(), updatedBy: ME.name }); toast("Planlama ayarları kaydedildi"); closeDrawer(); } catch (x) { toast(writeErr(x)); } };
}

/* Fire istatistikleri (son N gün içinde güncellenen iş emirleri) */
function plFireStats(gun) {
  const from = Date.now() - gun * 864e5, r = { fire: 0, good: 0, ist: {} };
  PL.ie.filter(e => (e.updatedAt || 0) >= from && e.durum !== "iptal").forEach(e => { const q = Number(e.miktar) || 0; (e.ops || []).forEach(o => {
    const f = Number(o.fire) || 0, g = plOpGood(o, q); if (!f && !g) return; const x = r.ist[o.ist] = r.ist[o.ist] || { fire: 0, good: 0 }; x.fire += f; x.good += g; r.fire += f; r.good += g; }); });
  Object.values(r.ist).forEach(x => x.oran = x.fire + x.good ? x.fire / (x.fire + x.good) * 100 : 0);
  r.oran = r.fire + r.good && r.fire ? r.fire / (r.fire + r.good) * 100 : (r.good ? 0 : null);
  return r;
}

/* Gün sonu girişi: kağıt iş emirlerinden günlük toplu veri girişi */
function plGunView(v) {
  const GF = PL.GF = PL.GF || { tarih: TODAY, ie: "", q: "" };
  if (GF.tarih > TODAY) GF.tarih = TODAY;
  const open = PL.ie.filter(e => plIeOpen(e) && e.durum !== "bekle");
  const ppl = sortTr([...PT.people.filter(p => p.aktif !== false).map(p => p.ad), ...PL.ist.map(i => i.operator)]);
  v.innerHTML = `<div class="pkbar"><div class="pkdate"><button type="button" class="btn ghost sm" data-gd="-1" aria-label="Önceki gün">‹</button><input type="date" class="f" id="gTar" value="${GF.tarih}" max="${TODAY}" aria-label="Tarih"><button type="button" class="btn ghost sm" data-gd="1" aria-label="Sonraki gün"${GF.tarih >= TODAY ? " disabled" : ""}>›</button><span class="pkwd">${DAYS_L[wdOf(GF.tarih)]}</span></div>
      <div class="filters"><select class="f${GF.ie ? " on" : ""}" id="gIe" aria-label="İş emri"><option value="">Tüm açık iş emirleri (${open.length})</option>${open.map(e => opt(e.id, `${e.no} · ${e.urunAd}`, GF.ie)).join("")}</select>
      <input class="f" id="gQ" type="search" placeholder="İstasyon veya operasyon ara…" value="${esc(GF.q)}" aria-label="Ara"></div></div>
    <p class="note" style="margin:0 0 12px">Kağıt iş emirlerindeki günlük bilgileri yazın: o gün yapılan adet, fire, harcanan süre ve operatör. Yalnızca dolu satırlar kaydedilir; adet toplam tamamlanana eklenir. Operasyon bittiyse <b>Bitti</b> kutusunu işaretleyin.</p>
    <datalist id="gOpL">${ppl.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    <div id="gList"></div>
    <div class="gsave"><span class="note" id="gInfo"></span><button type="button" class="btn" id="gS">Gün sonu girişini kaydet</button></div>`;
  const draw = () => {
    const q = GF.q.trim().toLocaleLowerCase("tr");
    const L = open.filter(e => !GF.ie || e.id === GF.ie).sort((a, b) => String(a.termin || "9").localeCompare(String(b.termin || "9")) || String(a.no).localeCompare(String(b.no)));
    $("#gList").innerHTML = L.length ? L.map(e => { const qq = Number(e.miktar) || 0, ops = (e.ops || []).map((o, k) => ({ o, k })).filter(({ o }) => o.durum !== "bitti" && (!q || [o.ist, o.alt, o.ad].join(" ").toLocaleLowerCase("tr").includes(q)));
      if (!ops.length) return "";
      return `<section class="gcard"><div class="gh"><b class="num">${esc(e.no)}</b><span>${esc(e.urunAd)}</span><span class="note">${nf(qq)} ${esc(e.birim || "Adet")}${e.termin ? " · termin " + fmtS(e.termin) : ""}${e.siparisNo ? " · " + esc(e.siparisNo) : ""}</span></div>
        <div class="grow gheadr"><span>#</span><span>Operasyon / istasyon</span><span>Toplam</span><span>Yapılan adet</span><span>Fire</span><span>Süre (dk)</span><span>Operatör</span><span>Bitti</span></div>
        ${ops.map(({ o, k }) => { const today = (o.kayit || []).filter(x => x.tarih === GF.tarih), ta = today.reduce((s, x) => s + (Number(x.adet) || 0), 0), tf = today.reduce((s, x) => s + (Number(x.fire) || 0), 0), td = today.reduce((s, x) => s + (Number(x.dk) || 0), 0);
          return `<div class="grow" data-e="${esc(e.id)}" data-k="${k}">
            <span class="num stn">${plNo(o, k)}</span>
            <span class="ska"><b>${esc(o.ad)}</b><span class="desc"><span class="num">${esc(o.ist)}</span>${o.alt ? " / " + esc(o.alt) : ""}${today.length ? ` · <span class="okt">bu tarihte girildi: ${nf(ta)} adet${tf ? " · " + nf(tf) + " fire" : ""}${td ? " · " + nf(td) + " dk" : ""}</span>` : ""}</span></span>
            <span class="num">${nf(o.tamam || 0)} / ${nf(qq)}${o.fire ? `<small class="late"> · ${nf(o.fire)} fire</small>` : ""}</span>
            <input type="number" min="0" step="any" class="f" data-g="adet" aria-label="Yapılan adet">
            <input type="number" min="0" step="any" class="f" data-g="fire" aria-label="Fire adedi">
            <input type="number" min="0" step="any" class="f" data-g="dk" aria-label="Süre dakika" placeholder="${Number(o.sure) > 0 ? "~" + Math.round(Number(o.sure) * 10) / 10 + "/ad" : ""}">
            <input class="f" data-g="operator" list="gOpL" maxlength="60" value="${esc((plIst(o.ist) || {}).operator || o.operator || "")}" aria-label="Operatör">
            <label class="gchk"><input type="checkbox" data-g="bitti" aria-label="Operasyon bitti"></label>
          </div>`; }).join("")}</section>`; }).join("") || '<p class="note">Bu filtreye uyan bekleyen operasyon yok.</p>' : '<div class="empty"><h3>Açık iş emri yok</h3><p>Gün sonu girişi açık iş emirlerinin operasyonları için yapılır.</p></div>';
    const cnt = () => { const n = [...document.querySelectorAll("#gList .grow[data-e]")].filter(r => [...r.querySelectorAll("[data-g]")].some(i => i.type === "checkbox" ? i.checked : i.dataset.g !== "operator" && i.value !== "")).length; $("#gInfo").textContent = n ? n + " operasyon için giriş yapıldı" : ""; };
    $("#gList").querySelectorAll("[data-g]").forEach(i => i.addEventListener(i.type === "checkbox" ? "change" : "input", cnt));
  };
  draw();
  v.querySelectorAll("[data-gd]").forEach(b => b.onclick = () => { const d = addDays(GF.tarih, Number(b.dataset.gd)); if (d <= TODAY) { GF.tarih = d; renderPlan(); } });
  $("#gTar").onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= TODAY) { GF.tarih = e.target.value; renderPlan(); } };
  $("#gIe").onchange = e => { GF.ie = e.target.value; draw(); };
  $("#gQ").oninput = e => { GF.q = e.target.value; draw(); };
  $("#gS").onclick = async () => {
    const by = {}; let bad = "";
    document.querySelectorAll("#gList .grow[data-e]").forEach(r => {
      const g = n => r.querySelector(`[data-g="${n}"]`), adet = Number(g("adet").value) || 0, fire = Number(g("fire").value) || 0, dk = Number(g("dk").value) || 0, bit = g("bitti").checked;
      if (!adet && !fire && !dk && !bit) return; if (adet < 0 || fire < 0 || dk < 0) { bad = "Negatif değer girilemez"; return; }
      (by[r.dataset.e] = by[r.dataset.e] || []).push({ k: Number(r.dataset.k), adet, fire, dk, bit, operator: g("operator").value.trim() });
    });
    if (bad) { toast(bad); return; } const ids = Object.keys(by); if (!ids.length) { toast("Kaydedilecek giriş yok"); return; }
    $("#gS").disabled = true; let n = 0;
    try {
      for (const id of ids) {
        const e = PL.ie.find(x => x.id === id); if (!e) continue; const q = Number(e.miktar) || 0, now = Date.now();
        const O = (e.ops || []).map(o => ({ ...o, kayit: (o.kayit || []).slice(), calisma: (o.calisma || []).map(c => ({ ...c })) }));
        by[id].forEach(x => { const o = O[x.k]; if (!o) return; n++;
          o.kayit.push({ tarih: GF.tarih, adet: x.adet, fire: x.fire, dk: x.dk, operator: x.operator, by: ME.name, at: now });
          o.tamam = Math.min(q, (Number(o.tamam) || 0) + x.adet); o.fire = (Number(o.fire) || 0) + x.fire; if (x.operator) o.operator = x.operator;
          o.calisma.forEach(c => { if (!c.bit) c.bit = now; });
          if (x.bit || o.tamam >= q) { o.durum = "bitti"; o.tamam = q; o.bitis = istTs(GF.tarih, "17:00") || now; } else if (o.tamam > 0 || x.dk) o.durum = "durdu";
        });
        const all = O.every(o => o.durum === "bitti"), any = O.some(o => o.durum !== "bekliyor");
        const patch = { ops: O, durum: all ? "bitti" : any ? "uretim" : e.durum, updatedAt: now, updatedBy: ME.name,
          log: [...(e.log || []), { at: now, by: ME.name, t: `Gün sonu girişi (${fmtS(GF.tarih)}): ${by[id].length} operasyon` }, ...(all ? [{ at: now, by: ME.name, t: "İş emri tamamlandı" }] : [])].slice(-80) };
        if (all) patch.bitis = now; if (any && !e.basladi) patch.basladi = now;
        await updateDoc(doc(fs, "isemri", id), patch);
      }
      toast(`Gün sonu girişi kaydedildi: ${n} operasyon`);
    } catch (x) { toast(writeErr(x)); }
    $("#gS").disabled = false;
  };
}

/* Planlama çizelgesi: açık iş emirleri istasyonlara sırayla yerleştirilir (her istasyon aynı anda tek iş) */
function plSchedule() {
  const D = PL.cfg.gunlukDk, days = []; for (let d = TODAY, g = 0; days.length < 90 && g < 200; d = addDays(d, 1), g++) if (plWorkDay(d)) days.push(d);
  const n = istNow(), sm = hm2m(PL.cfg.mesaiBas) || 480, t0 = days[0] === TODAY ? Math.max(0, Math.min(D, n.h * 60 + n.m - sm)) : 0;
  const pri = { cokacil: 0, acil: 1, normal: 2 }, free = {}, bars = [], fin = {};
  const jobs = PL.ie.filter(e => plIeOpen(e) && e.durum !== "bekle").sort((a, b) => (pri[a.oncelik] ?? 2) - (pri[b.oncelik] ?? 2) || String(a.termin || "9").localeCompare(String(b.termin || "9")) || String(a.no).localeCompare(String(b.no)));
  jobs.forEach(e => {
    const q = Number(e.miktar) || 0, O = e.ops || [], { pr } = plDag(O), ef = [], st = [];
    const plb = e.plBas && e.plBas > TODAY ? Math.max(0, days.indexOf(e.plBas)) * D : 0;
    const go = i => { if (ef[i] != null) return ef[i]; if (st[i]) return t0; st[i] = 1;
      const ready = Math.max(t0, plb, ...pr[i].map(go)), o = O[i], rem = plStepPlan(o, q) * (1 - plOpDone(o, q));
      if (rem <= 0.01) { st[i] = 0; return (ef[i] = ready); }
      const cands = [o.ist, o.alt].filter(Boolean).filter(k => { const x = plIst(k); return !x || x.durum !== "pasif"; }); if (!cands.length) cands.push(o.ist || "?");
      let best = cands[0], bs = Math.max(free[best] || t0, ready); cands.slice(1).forEach(k => { const s = Math.max(free[k] || t0, ready); if (s < bs) { best = k; bs = s; } });
      const end = bs + rem; free[best] = end; bars.push({ e, i, o, ist: best, s: bs, end, alt: best !== o.ist }); st[i] = 0; return (ef[i] = end); };
    O.forEach((_, i) => go(i));
    const t = O.length ? Math.max(t0, ...ef) : t0, di = Math.floor(Math.max(0, t - 1e-6) / D);
    fin[e.id] = { t, day: days[Math.min(di, days.length - 1)] || days[days.length - 1] };
  });
  return { D, days, t0, bars, fin, jobs };
}
function plGanttView(v) {
  const S = plSchedule(), { D, days, t0, bars, fin, jobs } = S;
  if (!jobs.length) { v.innerHTML = '<div class="empty"><h3>Planlanacak açık iş emri yok</h3><p>Açık iş emirleri öncelik ve termin sırasına göre istasyonlara yerleştirilir.</p></div>'; return; }
  const maxT = Math.max(t0 + D, ...bars.map(b => b.end)), N = Math.max(5, Math.min(30, Math.ceil(maxT / D))), dw = PL.gzoom || 120, W = N * dw;
  const ord = PL_BOLUM.map(b => b[0]), used = [...new Set(bars.map(b => b.ist))].sort((a, b) => (ord.indexOf(plBolumOf(a)) - ord.indexOf(plBolumOf(b))) || a.localeCompare(b, "tr", { numeric: true }));
  const late = jobs.filter(e => e.termin && fin[e.id].day > e.termin);
  v.innerHTML = `<div class="pkbar"><div class="filters"><span class="kst" style="--tc:${late.length ? "var(--k-izinsiz)" : "var(--k-fabrikada)"}">${late.length ? late.length + " iş emri termine yetişmiyor" : "Tüm iş emirleri terminine yetişiyor"}</span><span class="note">${jobs.length} açık iş emri · ${used.length} istasyon · ${N} iş günü</span></div>
      <div class="filters"><button type="button" class="btn ghost sm" data-gz="-1" aria-label="Uzaklaştır">−</button><button type="button" class="btn ghost sm" data-gz="1" aria-label="Yakınlaştır">+</button></div></div>
    <div class="gtable"><div class="gjobs">${jobs.map(e => { const f = fin[e.id], lt = e.termin && f.day > e.termin;
      return `<div class="gjob${lt ? " lt" : ""}" data-ie="${esc(e.id)}" role="button" tabindex="0" style="--tc:${colorOf(e.no)}"><i></i><b class="num">${esc(e.no.replace(/^İE-\d{4}-/, "#"))}</b><span>${esc(e.urunAd)}</span><span class="num">${e.termin ? "termin " + fmtS(e.termin) : "termin yok"}</span><span class="num ${lt ? "late" : "okt"}">bitiş ${fmtS(f.day)}${lt ? ` · ${dnum(f.day) - dnum(e.termin)} gün geç` : ""}</span></div>`; }).join("")}</div></div>
    <div class="gantt"><div class="gl"><div class="gc gh0">İstasyon</div>${used.map(k => { const i = plIst(k), d = i && i.durum !== "aktif" ? PL_IDUR[i.durum] : null; return `<div class="gc" title="${esc(i ? i.ad : k)}"><b class="num">${esc(k)}</b>${d ? `<span class="kst" style="--tc:${d[1]}">${d[0]}</span>` : `<small>${esc(i ? i.ad : "")}</small>`}</div>`; }).join("")}</div>
      <div class="gr"><div class="gtrack" style="width:${W}px;--dw:${dw}px">
        <div class="gdays">${days.slice(0, N).map((d, k) => `<div class="gd${d === TODAY ? " td" : ""}" style="left:${k * dw}px;width:${dw}px"><b>${fmtS(d).slice(0, 5)}</b><small>${DAYS_S[wdOf(d)]}</small></div>`).join("")}</div>
        ${used.map(k => `<div class="grw">${bars.filter(b => b.ist === k).map(b => { const L = b.s / D * dw, Wd = Math.max(4, (b.end - b.s) / D * dw);
          return `<div class="gbar${b.o.durum === "devam" || b.o.durum === "durdu" ? " run" : ""}" data-ie="${esc(b.e.id)}" style="left:${L}px;width:${Wd}px;--tc:${colorOf(b.e.no)}" title="${esc(`${b.e.no} · ${plNo(b.o, b.i)}. ${b.o.ad} · ${b.ist}${b.alt ? " (alternatif)" : ""} · ${plDk(b.end - b.s)} · ${fmtS(days[Math.floor(b.s / D)] || "")} → ${fmtS(days[Math.floor((b.end - 1e-6) / D)] || "")}`)}">${Wd > 46 ? `${esc(b.e.no.replace(/^İE-\d{4}-/, "#"))}·${plNo(b.o, b.i)}` : ""}</div>`; }).join("")}</div>`).join("")}
        <div class="gnow" style="left:${t0 / D * dw}px" title="Şimdi"></div>
      </div></div></div>
    <p class="note">Çizelge, açık iş emirlerini öncelik (çok acil → acil → normal) ve termin sırasına göre, öncül operasyonlar bitmeden sonrakini başlatmadan ve her istasyon aynı anda tek iş yapacak şekilde yerleştirir. Alternatif istasyonu olan operasyon (örn. TST-1 / TST-2) erken boşalan istasyona verilir. Gün = ${plDk(D)} net mesai. Süre girilmemiş operasyonlar hesaba katılmaz; beklemedeki iş emirleri yerleştirilmez.</p>`;
  v.querySelectorAll("[data-ie]").forEach(el => { const go = () => plOpenIe(el.dataset.ie); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter") go(); }; });
  v.querySelectorAll("[data-gz]").forEach(b => b.onclick = () => { PL.gzoom = Math.max(50, Math.min(320, (PL.gzoom || 120) * (b.dataset.gz > 0 ? 1.4 : 1 / 1.4))); renderPlan(); });
}

/* İş emri kağıdı (sahada elle doldurulur) */
function plPrintIe(e) {
  const q = Number(e.miktar) || 0, O = e.ops || [], s = plStats(e);
  let host = $("#printHost"); if (!host) { host = document.createElement("div"); host.id = "printHost"; document.body.appendChild(host); }
  host.innerHTML = `<div class="pr-page">
    <div class="pr-h"><img src="logo.jpg" alt="Kar-Men Airtech"><div><div class="pr-t">İŞ EMRİ</div><div class="pr-no">${esc(e.no)}</div></div></div>
    <table class="pr-info"><tr><th>Ürün</th><td colspan="3"><b>${esc(e.urunAd)}</b></td><th>Miktar</th><td><b>${nf(q)} ${esc(e.birim || "Adet")}</b></td></tr>
      <tr><th>Sipariş no</th><td>${esc(e.siparisNo || "Stoka üretim")}</td><th>Müşteri</th><td>${esc(e.musteri || "—")}</td><th>Öncelik</th><td>${esc(PL_ONC[e.oncelik || "normal"][0])}</td></tr>
      <tr><th>Plan başlangıç</th><td>${e.plBas ? fmtS(e.plBas) : "—"}</td><th>Termin</th><td><b>${e.termin ? fmtS(e.termin) : "—"}</b></td><th>Sorumlu</th><td>${esc(e.sorumlu || "—")}</td></tr>
      <tr><th>İş akışı</th><td colspan="3">${esc(e.akisAd || "—")}</td><th>Plan süre</th><td>${s.noTime ? "—" : plDk(s.plan)}</td></tr>
      ${e.not ? `<tr><th>Not</th><td colspan="5">${esc(e.not)}</td></tr>` : ""}</table>
    <table class="pr-ops"><thead><tr><th>No</th><th>Operasyon</th><th>İstasyon</th><th>Önceki</th><th>Plan</th><th>Tarih</th><th>Yapılan adet</th><th>Fire</th><th>Süre (dk)</th><th>Operatör</th><th>İmza</th></tr></thead>
      <tbody>${O.map((o, k) => `<tr><td class="c">${plNo(o, k)}</td><td><b>${esc(o.ad)}</b>${o.kk ? `<div class="pr-kk">KK: ${esc(o.kk)}</div>` : ""}</td><td class="c">${esc(o.ist)}${o.alt ? "/" + esc(o.alt) : ""}</td><td class="c">${(o.onceki || []).join(", ") || "—"}</td><td class="c">${Number(o.sure) > 0 ? plDk(plStepPlan(o, q)) : ""}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}</tbody></table>
    <div class="pr-f"><div>Hazırlayan<br><br>……………………</div><div>Üretim sorumlusu<br><br>……………………</div><div>Kalite kontrol<br><br>……………………</div><div>Yazdırma: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })}</div></div>
  </div>`;
  const img = host.querySelector("img"), go = () => setTimeout(() => window.print(), 60);
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
}

/* Deneme iş emirleri (toplantıda işleyişi göstermek için) */
const PL_DEMO_SURE = { DEPO: [0.3, 10], BKL: [0.1, 0], TST: [1.2, 15], LZR: [1.5, 20], PLZ: [1.5, 20], GYT: [0.8, 10], ABK: [1.5, 20], MRD: [2, 20], CK: [1, 10], EP: [0.8, 10], MK: [2, 15], KYN: [3, 10], "TŞL": [0.8, 0], DLD: [0.3, 20], BTBC: [1, 15], FRN: [1.5, 30], MNT: [2.5, 0], PKT: [0.6, 0], KKM: [3, 20], SPR: [2, 20], KNT: [1.5, 10], ARB: [0.2, 0] };
function plDemoData(now, by, akisList) {
  const D = 864e5, M = 60000, iso = ts => dayOf(ts), A = kod => akisList.find(a => a.kod === kod);
  const plan = [
    ["SP-2026-130", "Örnek Hastane Projesi", "AKS-TSK", "Tek sıra kanat menfez 400×200 RAL 9016", 120, 0.6, 5, "normal"],
    ["SP-2026-130", "Örnek Hastane Projesi", "AKS-ÇSK", "Çift sıra kanat menfez 600×300", 60, 0, 7, "normal"],
    ["SP-2026-130", "Örnek Hastane Projesi", "AKS-SLD", "Slot difüzör 2 yarık 1200 mm", 40, 0.25, 6, "normal"],
    ["SP-2026-130", "Örnek Hastane Projesi", "AKS-HAD", "Hava ayar damperi 500×300", 25, 0, 9, "normal"],
    ["SP-2026-131", "Örnek AVM Projesi", "AKS-LNR", "Lineer menfez 3 slot 1500 mm", 80, 0.3, 2, "acil"],
    ["SP-2026-131", "Örnek AVM Projesi", "AKS-KAN", "Kare anemostat 600×600", 50, 0.45, 4, "normal"],
    ["SP-2026-131", "Örnek AVM Projesi", "AKS-SKP", "Sabit kanat panjur 800×600", 30, 0, 8, "normal"],
    ["SP-2026-127", "Örnek Otel", "AKS-TSK", "Tek sıra kanat menfez 500×250", 30, 1, -2, "normal"],
    ["SP-2026-127", "Örnek Otel", "AKS-KPM", "Kare petek menfez 400×400", 40, 1, -1, "normal"],
    ["SP-2026-127", "Örnek Otel", "AKS-YKM", "Yuvarlak kanal menfezi Ø250", 20, 1, -1, "normal"],
    ["SP-2026-133", "Örnek Fabrika Binası", "AKS-YND", "Yangın damperi 400×400 (sertifikalı)", 12, 0.5, 1, "cokacil"],
    ["SP-2026-133", "Örnek Fabrika Binası", "AKS-BDD", "Backdraft damper 300×300", 18, 0, 10, "normal", "bekle"],
    ["", "", "AKS-TSK", "Tek sıra kanat menfez 300×150 (stok)", 200, 0, 14, "normal"],
    ["", "", "AKS-SWD", "Swirl difüzör Ø400 (stok)", 60, 0, 12, "normal"],
    ["", "", "AKS-HKP", "Hareketli kanat panjur 600×400 (stok)", 24, 0.7, 6, "normal"]
  ];
  const y = TODAY.slice(0, 4), fireIst = /^(LZR|PLZ|TST|EP-11|EP-12|GYT)/;
  return plan.map(([sip, mus, kod, ur, q, p, ter, onc, dur], n) => {
    const a = A(kod); if (!a) return null;
    const steps = a.adimlar || [], { lvl } = plDag(steps), order = steps.map((_, i) => i).sort((i, j) => lvl[i] - lvl[j] || i - j);
    const ops = steps.map((s, i) => { const t = Number(s.sure) > 0 ? [Number(s.sure), Number(s.hazirlik) || 0] : (PL_DEMO_SURE[String(s.ist || "").split("-")[0]] || [1, 0]);
      return { no: plNo(s, i), onceki: Array.isArray(s.onceki) ? s.onceki : (i ? [i] : []), ad: s.ad || s.tanim || "", tanim: s.tanim || "", ist: s.ist || "", alt: s.alt || "", sure: t[0], hazirlik: t[1], kk: s.kk || "", sop: s.sop || "", durum: "bekliyor", tamam: 0, fire: 0, calisma: [], kayit: [] }; });
    const nDone = p >= 1 ? ops.length : Math.floor(p * ops.length), start = now - (p >= 1 ? 6 : 3) * D;
    order.forEach((i, k) => { const o = ops[i], pl = plStepPlan(o, q), f = 0.88 + ((n * 7 + k * 3) % 9) * 0.05, day = iso(start + Math.min(k, 3 + n % 3) * D * (p >= 1 ? 0.8 : 0.6));
      const fire = fireIst.test(o.ist) ? Math.max(1, Math.round(q * (0.02 + ((n + k) % 4) * 0.012))) : 0;
      if (k < nDone) Object.assign(o, { durum: "bitti", tamam: q, fire, bitis: start + k * 4 * 3600e3, operator: "", kayit: [{ tarih: day > TODAY ? TODAY : day, adet: q, fire, dk: Math.round(pl * f), operator: "", by, at: now - D }] });
      else if (k === nDone && p > 0 && p < 1) { const part = Math.round(q * 0.4); Object.assign(o, { durum: "durdu", tamam: part, fire: fire ? Math.max(1, Math.round(fire / 2)) : 0, kayit: [{ tarih: TODAY, adet: part, fire: fire ? Math.max(1, Math.round(fire / 2)) : 0, dk: Math.round(plStepPlan(o, part) * f), operator: "", by, at: now - 3600e3 }] }); } });
    const durum = dur || (p >= 1 ? "bitti" : p > 0 ? "uretim" : "plan");
    return { no: `İE-${y}-${String(901 + n).padStart(4, "0")}`, tur: sip ? "sip" : "stok", siparisNo: sip, musteri: mus, urunId: "", urunAd: ur, akisId: a.id, akisAd: `${a.kod} · ${a.ad}`, miktar: q, birim: "Adet",
      plBas: iso(p > 0 ? start : now + (n % 3) * D), termin: iso(now + ter * D), oncelik: onc, sorumlu: "", not: "DENEME İŞ EMRİ: toplantıda işleyişi göstermek için eklendi. Planlama ayarlarından tek düğmeyle silinir.", durum, ops,
      deneme: true, log: [{ at: start - D, by, t: "İş emri açıldı (deneme)" }], createdAt: start - D, createdBy: by, createdByUid: ME ? ME.uid : "", updatedAt: now - 3600e3, updatedBy: by, ...(p > 0 ? { basladi: start } : {}), ...(p >= 1 ? { bitis: now + ter * D - 12 * 3600e3 } : {}) };
  }).filter(Boolean);
}
async function plSeedDemo() {
  if (!can("pl.ie")) return;
  if (PL.ie.some(e => e.deneme)) { toast("Deneme iş emirleri zaten ekli"); return; }
  try {
    const now = Date.now();
    if (!PL.ist.length && can("pl.ist")) await plSeedIst();
    let akis = PL.akis;
    if (!akis.length) {
      if (!can("pl.akis")) { toast("Önce iş akış şemaları yüklenmeli"); return; }
      const b = writeBatch(fs); akis = PL_AKIS_SEED.map((a, k) => { const ref = doc(collection(fs, "akis")), d = { kod: a.kod, ad: a.ad, grup: a.grup, urunAd: a.ad, aciklama: a.aciklama, malzeme: a.malzeme, rev: a.rev, sira: k + 1, adimlar: a.adimlar.map(s => ({ ...s, sure: 0, hazirlik: 0, sorumlu: "", kk: "", sop: "" })), urunler: [], createdAt: now, createdBy: ME.name, updatedAt: now, updatedBy: ME.name }; b.set(ref, d); return { id: ref.id, ...d }; });
      await b.commit();
    }
    const L = plDemoData(now, ME.name, akis), b = writeBatch(fs);
    L.forEach(e => b.set(doc(collection(fs, "isemri")), e)); await b.commit();
    toast(L.length + " deneme iş emri eklendi");
  } catch (x) { toast(writeErr(x)); }
}
async function plUnseedDemo() {
  const L = PL.ie.filter(e => e.deneme); if (!L.length) return;
  try { const b = writeBatch(fs); L.forEach(e => b.delete(doc(fs, "isemri", e.id))); await b.commit(); toast(L.length + " deneme iş emri silindi"); } catch (x) { toast(writeErr(x)); }
}

/* Kod sistemi: config/stok.kodlar = { M: { "01": { ad, alt: { "01": "Dampersiz" } } } } */
const skAnaKodOpts = (tip, cur) => { const T = (SK.cfg.kodlar || {})[tip] || {}; return `<option value="">${tip ? "Seçin" : "Önce stok tipi"}</option>` + Object.keys(T).sort().map(k => opt(k, `${k} · ${T[k].ad || ""}`, cur)).join("") + (cur && !T[cur] ? opt(cur, cur, cur) : ""); };
const skAltKodOpts = (tip, ana, cur) => { const A = (((SK.cfg.kodlar || {})[tip] || {})[ana] || {}).alt || {}; return `<option value="">${ana ? "Seçin" : "Önce ana grup"}</option>` + Object.keys(A).sort().map(k => opt(k, `${k} · ${A[k]}`, cur)).join("") + (cur && !A[cur] ? opt(cur, cur, cur) : ""); };
function skKodlarText() {
  const K = SK.cfg.kodlar || {}, L = [];
  Object.keys(K).sort().forEach(t => Object.keys(K[t] || {}).sort().forEach(a => { const x = K[t][a] || {}; L.push(`${t}-${a} ${x.ad || ""}: ${Object.keys(x.alt || {}).sort().map(k => `${k} ${x.alt[k]}`).join(", ")}`); }));
  return L.join("\n");
}
function skParseKodlar(txt) {
  const K = {};
  String(txt || "").split("\n").forEach(l => { const m = l.trim().match(/^([A-ZÇĞİÖŞÜ]{1,2})-(\d{2})\s+([^:]+?)\s*(?::\s*(.*))?$/i); if (!m) return;
    const t = m[1].toLocaleUpperCase("tr"), alt = {}; String(m[4] || "").split(",").forEach(x => { const q = x.trim().match(/^(\d{2})\s+(.+)$/); if (q) alt[q[1]] = q[2].trim(); });
    (K[t] = K[t] || {})[m[2]] = { ad: m[3].trim(), alt }; });
  return K;
}
/* Mamul kod kataloğu (Stok Tespit Formu 14.10.2026, yeşil işaretli satırlar) */
const SK_KATALOG_DEF = [
  ["01", "Tek sıra kanatlı menfez", [["01", "Dampersiz", "TEK SIRA KANATLI MENFEZ - DAMPERSİZ"], ["02", "Damperli", "TEK SIRA KANATLI MENFEZ - DAMPERLİ"], ["03", "Damper", "TEK SIRA KANATLI MENFEZ DAMPERİ"]], "d"],
  ["02", "Çift sıra kanatlı menfez", [["01", "Dampersiz", "ÇİFT SIRA KANATLI MENFEZ - DAMPERSİZ"], ["02", "Damperli", "ÇİFT SIRA KANATLI MENFEZ - DAMPERLİ"]], "d"],
  ["03", "Lineer menfez", [["01", "Dampersiz", "LİNEER MENFEZ - DAMPERSİZ"], ["02", "Damperli", "LİNEER MENFEZ - DAMPERLİ"]], "d"],
  ["04", "Sabit kanatlı dış hava panjuru", [["01", "Küçük kanatlı", "SABİT KANATLI DIŞ HAVA PANJURU"]], "d"],
  ["05", "Sabit kanatlı dış hava panjuru (büyük kanatlı)", [["01", "Büyük kanatlı", "SABİT KANATLI DIŞ HAVA PANJURU - BÜYÜK KANATLI"]], "d"],
  ["06", "Lineer slot difüzör", [["01", "Tekli", "LİNEER SLOT DİFÜZÖR - TEKLİ"], ["02", "2'li", "LİNEER SLOT DİFÜZÖR - 2Lİ"], ["03", "3'lü", "LİNEER SLOT DİFÜZÖR - 3LÜ"], ["04", "4'lü", "LİNEER SLOT DİFÜZÖR - 4LÜ"], ["05", "5'li", "LİNEER SLOT DİFÜZÖR - 5Lİ"]], "s"],
  ["07", "Gizli tavan tipi slot difüzör", [["01", "Tekli", "GİZLİ TAVAN TİPİ SLOT DİFÜZÖR - TEKLİ"], ["02", "2'li", "GİZLİ TAVAN TİPİ SLOT DİFÜZÖR - 2Lİ"], ["03", "3'lü", "GİZLİ TAVAN TİPİ SLOT DİFÜZÖR - 3LÜ"], ["04", "4'lü", "GİZLİ TAVAN TİPİ SLOT DİFÜZÖR - 4LÜ"], ["05", "5'li", "GİZLİ TAVAN TİPİ SLOT DİFÜZÖR - 5Lİ"]], "s"],
  ["08", "Müdahale kapağı", [["01", "Düz tip", "DÜZ TİP MÜDAHALE KAPAĞI"], ["02", "Kare petek", "KARE PETEK MÜDAHALE KAPAĞI"]], "k"]
];
// Ölçü sırası: genişlik 50 mm adımla artar, her genişlikte yükseklik 100'den genişliğe kadar (100x100, 150x100, 150x150, 200x100 …)
function skOlculer(t) {
  const L = [];
  if (t === "d") for (let w = 100; w <= 2000; w += 50) for (let h = 100; h <= w; h += 50) L.push([w, h]);
  if (t === "s") L.push([1000, null]);
  if (t === "k") for (let w = 200; w <= 800; w += 50) L.push([w, w]);
  return L;
}
let skKatalogCache = null;
function skKatalog() {
  if (skKatalogCache) return skKatalogCache;
  const out = [];
  SK_KATALOG_DEF.forEach(([ana, anaAd, alts, t]) => alts.forEach(([alt, altAd, ad]) => skOlculer(t).forEach(([w, h], k) => {
    const olcu = h == null ? String(w) : `${w}X${h}`;
    out.push({ kod: `M-${ana}${alt}${String(k + 1).padStart(5, "0")}`, ad: `${ad} ${olcu} MM`, tip: "M", anaKod: ana, altKod: alt, anaGrup: anaAd, altGrup: altAd, olcu, olcuG: w, olcuY: h });
  })));
  return (skKatalogCache = out);
}
const skKatalogKodlar = () => { const M = {}; SK_KATALOG_DEF.forEach(([ana, anaAd, alts]) => { M[ana] = { ad: anaAd, alt: Object.fromEntries(alts.map(([a, l]) => [a, l])) }; }); return { M }; };
let skKatYuk = false;
async function skKatalogYukle() {
  if (!can("s.edit") || skKatYuk) return; skKatYuk = true;
  try {
    if (SK.cfg.sema < 2) await skMigrate();
    const all = skKatalog(), groups = {}; all.forEach(i => (groups[i.kod.slice(0, 6)] = groups[i.kod.slice(0, 6)] || []).push(i));
    const c = collection(fs, "stok"), todo = [];
    for (const [pre, L] of Object.entries(groups)) {
      let n = 0; try { n = (await getCountFromServer(query(c, where("kod", ">=", pre), where("kod", "<=", pre + "")))).data().count; } catch (e) { n = 0; }
      if (n >= L.length) continue;
      if (n > 0) { const s = await getDocs(query(c, where("kod", ">=", pre), where("kod", "<=", pre + ""))); const ex = new Set(s.docs.map(d => d.data().kod)); todo.push(...L.filter(i => !ex.has(i.kod))); }
      else todo.push(...L);
    }
    if (!todo.length) { toast("Katalogdaki tüm kodlar zaten kayıtlı"); skKatYuk = false; return; }
    const now = Date.now();
    for (let k = 0; k < todo.length; k += 400) {
      toast(`Mamul kodları yükleniyor: ${nf(Math.min(k + 400, todo.length), 0)} / ${nf(todo.length, 0)}`);
      const b = writeBatch(fs);
      todo.slice(k, k + 400).forEach(i => { const d0 = { ...i, tanim: "", barkod: "", birim: "Adet", miktar: 0, minStok: 0, maxStok: null, depo: "", adres: "", not: "", ted: {}, aktif: true, katalog: 1, createdAt: now, createdBy: ME.name, updatedAt: now, updatedBy: ME.name, sonHareket: null };
        b.set(doc(c), { ...d0, seviye: "bos", kelimeler: skWords(d0) }); });
      await b.commit();
    }
    try { await setDoc(doc(fs, "config", "stok"), { kodlar: skKatalogKodlar(), katalog: { v: 1, at: now, by: ME.name, adet: all.length } }, { merge: true }); } catch (e) { console.warn("kod sistemi kaydı", e); }
    toast(`${nf(todo.length, 0)} mamul kodu yüklendi`); SK.lim = 200; skPageWatch(); skCounts(800);
  } catch (x) { toast(writeErr(x)); }
  skKatYuk = false;
}

/* Stok kodu öneki → iş akış şeması (şemada önek girilmemişse varsayılan eşleşme) */
const PL_KOD_AKIS_DEF = { "AKS-TSK": ["M-0101", "M-0102"], "AKS-ÇSK": ["M-0201", "M-0202"], "AKS-LNR": ["M-0301", "M-0302"], "AKS-SKP": ["M-0401", "M-0501"], "AKS-SLD": ["M-06", "M-07"], "AKS-MDK": ["M-08"] };
function plAkisForKod(kod) {
  kod = String(kod || ""); let best = null, bl = 0;
  PL.akis.forEach(a => ((a.kodOnek && a.kodOnek.length ? a.kodOnek : PL_KOD_AKIS_DEF[a.kod]) || []).forEach(p => { if (kod.startsWith(p) && p.length > bl) { best = a; bl = p.length; } }));
  return best;
}
