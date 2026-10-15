// Kar-Men Proje Takip — Firebase sürümü
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, query, where, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, BOOT_ADMINS, EXTRA_ICE } from "./config.js";

/* ================= Sürüm kontrolü ================= */
// index.html ile app.js farklı sürümden gelirse (tarayıcı/GitHub önbelleği) sayfayı bir kez tazele
const APP_V = "16";
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
const PERM_MODS = ["proje", "stok", "satinalma", "disis", "planlama", "siparis"];
const PERM_LEVELS = [["none", "Erişim yok"], ["view", "Gözlemci"], ["use", "Kullanıcı"], ["edit", "Düzenleyici"]];
const PERM_ACTS = {
  proje: [["p.task", "İş ekleme, düzenleme ve silme"], ["p.progress.all", "Tüm işlerin tamamlanma oranını güncelleme"], ["p.progress.own", "Sorumlusu olduğu işin oranını güncelleme"], ["p.feedback", "Günlük geri bildirim yazma"]],
  disis: [["d.create", "Dış iş oluşturma"], ["d.inout", "Çıkış / giriş kaydetme"], ["d.edit.own", "Kendi açtığı işleri düzenleme"], ["d.edit.all", "Tüm işleri düzenleme"], ["d.cancel", "İş iptal etme"], ["d.delete", "İş silme"], ["d.cfg", "Araç ve personel listesini düzenleme"], ["d.report", "Günlük rapor (PDF) alma"]]
};
// Modülden bağımsız genel yetkiler
const PERM_GLOBAL = [["p.msg", "Mesaj gönderme (üst çubuktaki Mesajlar)"]];
const PERM_DEF = {
  proje: { none: [], view: [], use: ["p.progress.own", "p.feedback", "p.msg"], edit: PERM_ACTS.proje.map(a => a[0]) },
  disis: { none: [], view: ["d.report"], use: ["d.create", "d.inout", "d.edit.own", "d.report"], edit: PERM_ACTS.disis.map(a => a[0]) }
};
function effPerms(e) {
  if (!e) return null;
  if (e.role === "admin") return { role: "admin", mods: {}, acts: {} };
  if (e.mods && typeof e.mods === "object") return { role: "user", mods: { ...e.mods }, acts: { ...(e.acts || {}) } };
  const L = e.role === "viewer" ? "view" : "use", mods = {}, acts = {};   // eski kayıt (üye / izleyici)
  PERM_MODS.forEach(m => { mods[m] = L; ((PERM_DEF[m] || {})[L] || []).forEach(a => acts[a] = true); });
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
  const nt = todayISO(); if (nt !== TODAY) { TODAY = nt; paintDate(); render(); }
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
  siparis: '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 12h8M9 16h8"/>'
};
const svgIco = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
const MODULES = [
  { id: "proje", name: "PROJE TAKİP", desc: "İşler, sorumlular, günlük geri bildirim ve ekip mesajları", active: true },
  { id: "stok", name: "STOK MODÜLÜ", desc: "Stok kartları, sayım ve stok hareketleri",
    scope: ["Stok kodlama standardı ve stok kartları", "Kontrollü sayım ve açılış bakiyesi", "Ürün ağaçları (BOM)", "Minimum–maksimum stok seviyeleri"], tasks: [1, 2, 3] },
  { id: "satinalma", name: "SATINALMA MODÜLÜ", desc: "Talepler, tedarikçiler ve satın alma siparişleri",
    scope: ["Satın alma talepleri", "Tedarikçi kartları", "Satın alma siparişi ve teslim takibi"], tasks: [13] },
  { id: "disis", name: "DIŞ İŞ TAKİP MODÜLÜ", desc: "Dışarı çıkan personel, araç, çıkış–dönüş saatleri ve masraflar", active: true },
  { id: "planlama", name: "PLANLAMA MODÜLÜ", desc: "İş emirleri, iş istasyonları ve üretim planı",
    scope: ["İş emirleri", "Makine kodları ve iş istasyonları", "İş akışları ve süre ölçümü", "Verimlilik analizi"], tasks: [10, 11, 5, 4, 12] },
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
  $("#modYetki").hidden = r !== "yetki";
  $("#modPh").hidden = !(mod && !mod.active);
  $("#crumb").innerHTML = r === "home" ? "<b>Ana ekran</b>" : `<a href="#home">‹ <span>Ana ekran</span></a><b>${esc(mod ? mod.name : "YETKİLENDİRME")}</b>`;
  if (mod && !mod.active) renderPh(mod);
  renderHome();
  if (r === "proje") render();
  if (r === "disis") renderDisis();
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
const diPeople = () => sortTr([...DT.cfg.people, ...Object.values(state.access || {}).map(m => m && m.name), ...DT.jobs.map(j => j.personel)]);
const diVehAll = () => sortTr([...DT.cfg.vehicles, ...DT.jobs.map(j => j.arac)]);

function startDisis() {
  DT.ready = false; let a = false, b = false;
  const done = () => { DT.ready = a && b; diChanged(); };
  dataUnsubs.push(onSnapshot(collection(fs, "disis"), s => { DT.jobs = s.docs.map(d => ({ id: d.id, ...d.data() })); a = true; done(); },
    e => { a = true; done(); toast("Dış işler okunamadı: " + (e.code || e.message)); }));
  dataUnsubs.push(onSnapshot(doc(fs, "config", "disis"), s => {
    const d = s.exists() ? s.data() : {};
    DT.cfg = { vehicles: Array.isArray(d.vehicles) ? d.vehicles : [], people: Array.isArray(d.people) ? d.people : [] };
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
  $("#diVehicles").innerHTML = vehs.length ? vehs.map(v => {
    const j = out.find(x => x.arac === v), st = j && diStatus(j);
    return `<div class="veh ${j ? (st.key === "late" ? "late" : "out") : ""}"${j ? ` data-dj="${esc(j.id)}" role="button" tabindex="0" title="#${esc(j.no)} işini aç"` : ""}><span class="vi">${VEH_SVG}</span><span style="min-width:0"><span class="vn">${esc(v)}</span><span class="vs">${j ? esc(j.personel) + " · " + fmtDur(now - j.cikis) + (st.key === "late" ? " · gecikti" : "") : "Müsait"}</span></span></div>`;
  }).join("") : (can("d.cfg") ? `<div class="veh empty">Araç listesi boş. Araç durumunu görmek için <button class="linkbtn" id="diCfg2" type="button">araçları ekleyin</button>.</div>` : "");
  const c2 = $("#diCfg2"); if (c2) c2.onclick = openDiCfg;

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
    <div class="dp"><div class="people">${j.personel ? avatar(j.personel) : '<span class="date none">Atanmadı</span>'}</div><div class="vh">${VEH_SVG}<span>${esc(j.arac || "—")}</span></div></div>
    <div class="dt">${G.length > 1 || j.oncelik === "acil" || files ? `<div class="dtop">${G.length > 1 ? `<span class="gcount">${G.length} iş</span>` : ""}${j.oncelik === "acil" ? '<span class="ttag" style="--tc:#c62f3a">ACİL</span>' : ""}${files ? `<span class="clip" title="${files} ek">${CLIP_SVG}${files}</span>` : ""}</div>` : ""}
      <ol class="glist${G.length > 1 ? " multi" : ""}">${G.map((g, gi) => { const t = diType(g.tur); const fin = diCanFinish(j) && (g.durum || "bekliyor") === "bekliyor"; return `<li class="g-${esc(g.durum || "bekliyor")}${fin ? " hasfin" : ""}">${fin ? `<button class="gfin" type="button" data-gfin="${esc(j.id)}" data-gi="${gi}" title="Bu işi bitir">✓ Bitir</button>` : ""}<span class="ttag" style="--tc:${t.c}">${esc(t.name)}</span>${g.durum === "yapildi" ? '<span class="gst ok" title="Yapıldı">✓</span>' : g.durum === "yapilamadi" ? '<span class="gst no" title="Yapılamadı">✕ yapılamadı</span>' : ""}<div class="ttl">${esc(g.tanim)}</div>${g.yer || g.masraf ? `<div class="desc">${[g.yer ? esc(g.yer) : "", g.masraf ? `<span class="gcost">${tl(g.masraf)}${g.odeme ? " · " + esc(g.odeme) : ""}</span>` : ""].filter(Boolean).join(" · ")}</div>` : ""}${g.not ? `<div class="gnote">${esc(g.not)}</div>` : ""}</li>`; }).join("")}</ol></div>
    <div><span class="lbl">Çıkış</span>${outCell}</div>
    <div><span class="lbl">Giriş</span>${inCell}</div>
    <div><span class="lbl">Süre</span><span class="date">${j.cikis && !j.iptal ? fmtDur(diDur(j)) : "—"}</span></div>
    <div class="dst"><span class="lbl">Durum</span><span class="pill ${st.cls}">${st.label}</span></div>
    <div class="dact">${act}</div>
  </div>`;
}
async function diQuick(id, act) {
  const j = DT.jobs.find(x => x.id === id); if (!j) return;
  const now = Date.now();
  const patch = act === "out" ? { cikis: now, cikisBy: ME.name } : { giris: now, girisBy: ME.name };
  Object.assign(patch, { updatedAt: now, updatedBy: ME.name, log: [...(j.log || []), { at: now, by: ME.name, t: act === "out" ? "Çıkış yapıldı" : "Giriş yapıldı" }].slice(-50) });
  try {
    await updateDoc(doc(fs, "disis", id), patch);
    toast(act === "out" ? `#${j.no} · ${j.personel} çıkış yaptı (${hhmm(now)})` : `#${j.no} · ${j.personel} döndü (${hhmm(now)}). Masraf ve not için işi açın.`);
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
  const vehs = [...DT.cfg.vehicles]; if (j && j.arac && !vehs.includes(j.arac) && !NOVEH.includes(j.arac)) vehs.push(j.arac);
  DCUR.ed = ed;
  const tnow = (fid) => ed ? `<button type="button" class="btn ghost" data-now="${fid}">Şimdi</button>` : "";
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">
    <div class="dh"><h2 id="dTitle">${j ? "Dış iş #" + esc(j.no) : "Yeni dış iş"}</h2><button class="x" id="dClose" aria-label="Kapat">×</button></div>
    <div class="db">
      ${j ? `<div class="factbox"><div><div class="k">Durum</div><div class="v"><span class="pill ${st.cls}">${st.label}</span></div></div><div><div class="k">Süre</div><div class="v">${j.cikis && !j.iptal ? fmtDur(diDur(j)) : "—"}</div></div><div><div class="k">Atayan</div><div class="v" style="font-size:13px;font-family:var(--body)">${esc(j.createdBy || "—")}</div></div></div>` : ""}
      <div class="fgrid">
        <div class="field"><label for="dPer">Personel</label><input id="dPer" list="dPerList" autocomplete="off" placeholder="Kim çıkıyor?"${dis}><datalist id="dPerList">${diPeople().map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
        <div class="field"><label for="dVeh">Çıktığı araç</label><select id="dVeh"${dis}><option value="">Seçin…</option>${vehs.map(v => `<option>${esc(v)}</option>`).join("")}<optgroup label="Şirket aracı değil">${NOVEH.map(v => `<option>${esc(v)}</option>`).join("")}</optgroup></select></div>
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
    const miss = []; if (!per) miss.push("personel"); if (!veh) miss.push("araç"); if (!gor.length) miss.push("en az bir iş");
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
  $("#drawerHost").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="cfTitle" style="width:min(480px,100%)">
    <div class="dh"><h2 id="cfTitle">Araçlar ve personel</h2><button class="x" id="cfClose" aria-label="Kapat">×</button></div>
    <div class="db">
      <div class="field"><label for="cfVeh">Şirket araçları</label><textarea id="cfVeh" class="cfgta" placeholder="42 ABC 123 · Doblo"></textarea><p class="note" style="margin:4px 0 0">Her satıra bir araç yazın: plaka ve kısa ad. "Kendi aracı" ve "Araçsız" seçenekleri her zaman listede olur.</p></div>
      <div class="field"><label for="cfPeo">Dışarı çıkan personel</label><textarea id="cfPeo" class="cfgta" placeholder="Ahmet Yılmaz"></textarea><p class="note" style="margin:4px 0 0">Her satıra bir kişi. Uygulamaya giriş yapmayan personeli de buraya yazabilirsiniz; ekip üyeleri listede zaten görünür.</p></div>
    </div>
    <div class="df"><span></span><div class="r"><button class="btn ghost" id="cfCancel" type="button">Vazgeç</button><button class="btn" id="cfSave" type="button">Kaydet</button></div></div>
  </aside>`;
  $("#cfVeh").value = DT.cfg.vehicles.join("\n"); $("#cfPeo").value = DT.cfg.people.join("\n");
  $("#scrim").onclick = closeDrawer; $("#cfClose").onclick = closeDrawer; $("#cfCancel").onclick = closeDrawer;
  $("#cfSave").onclick = async () => {
    const lines = sel => [...new Set($(sel).value.split("\n").map(s => s.trim()).filter(Boolean))].slice(0, 100);
    $("#cfSave").disabled = true;
    try { await setDoc(doc(fs, "config", "disis"), { vehicles: lines("#cfVeh"), people: lines("#cfPeo"), updatedAt: Date.now(), updatedBy: ME.name }); toast("Araç ve personel listesi kaydedildi"); closeDrawer(); }
    catch (e) { $("#cfSave").disabled = false; toast(writeErr(e)); }
  };
  $("#cfVeh").focus();
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
const MOD_SHORT = { proje: "Proje Takip", stok: "Stok", satinalma: "Satınalma", disis: "Dış İş", planlama: "Planlama", siparis: "Sipariş" };
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
