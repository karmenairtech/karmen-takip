// Kar-Men Proje Takip — Firebase sürümü
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, BOOT_ADMINS } from "./config.js";

/* ================= Sürüm kontrolü ================= */
// index.html ile app.js farklı sürümden gelirse (tarayıcı/GitHub önbelleği) sayfayı bir kez tazele
const APP_V = "5";
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
const isAdmin = () => ME && ME.role === "admin";
const canFeedback = () => ME && (ME.role === "admin" || ME.role === "member");
const canProgress = t => isAdmin() || (ME && ME.role === "member" && (t.owners || []).includes(ME.name));
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
let dataStarted = false;
function enter(user) {
  stopSubs(); dataStarted = false;
  const email = lower(user.email);
  const boot = isBoot(email);
  if (!boot) showGate("<p>Yetkiler kontrol ediliyor…</p>");
  if (boot) { ME = { uid: user.uid, email, name: user.displayName || email, role: "admin" }; startData(); }
  unsubs.push(onSnapshot(doc(fs, "config", "access"), s => {
    state.accessExists = s.exists();
    state.access = s.exists() ? (s.data().members || {}) : {};
    const entry = state.access[email];
    if (boot) { ME = { uid: user.uid, email, name: (entry && entry.name) || user.displayName || email, role: "admin" }; }
    else if (!entry || !entry.role) { ME = null; dataStarted = false; stopDataSubs(); noAccessScreen(email); return; }
    else ME = { uid: user.uid, email, name: entry.name || user.displayName || email, role: entry.role };
    startData();
    render();
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
  let got = 0; const first = () => { if (++got === 2) { state.ready = true; render(); } };
  let t1 = false, t2 = false;
  dataUnsubs.push(onSnapshot(collection(fs, "tasks"), s => {
    state.tasks = s.docs.map(d => ({ id: d.id, ...d.data() })); if (!t1) { t1 = true; first(); } else render();
  }, e => toast("İşler okunamadı: " + (e.code || e.message))));
  dataUnsubs.push(onSnapshot(collection(fs, "feedback"), s => {
    state.feedback = s.docs.map(d => ({ id: d.id, ...d.data() })); if (!t2) { t2 = true; first(); } else render();
  }, e => toast("Geri bildirimler okunamadı: " + (e.code || e.message))));
  startMessages();
}
const _stop = stopSubs; // çıkışta veri aboneliklerini de kapat
stopSubs = function () { _stop(); stopDataSubs(); };
function paintUser() {
  if (!ME) return;
  const roleL = { admin: "Yönetici", member: "Üye", viewer: "İzleyici" }[ME.role] || ME.role;
  $("#uChip").style.setProperty("--c", colorOf(ME.name));
  $("#uChip").innerHTML = `<i>${esc(initials(ME.name))}</i><span class="nm">${esc(ME.name)}</span> <small>· ${roleL}</small>`;
  $("#uChip").title = ME.name + " · " + roleL;
  const hr = istNow().h, hi = hr < 12 ? "Günaydın" : hr < 18 ? "İyi günler" : "İyi akşamlar";
  $("#hello").textContent = hi + ", " + String(ME.name).split(/\s+/)[0];
  $("#admBtn").hidden = !isAdmin(); $("#addBtn").hidden = !isAdmin();
}
$("#outBtn").onclick = () => signOut(auth);
$("#admBtn").onclick = () => openAdmin();

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
  renderHome();
  const pm = MODULES.find(m => m.id === ROUTE && !m.active); if (pm) renderPh(pm);
  renderKpis(); tick();
  $("#vList").setAttribute("aria-pressed", VIEW === "list"); $("#vTl").setAttribute("aria-pressed", VIEW === "tl"); $("#vMsg") && $("#vMsg").setAttribute("aria-pressed", VIEW === "msg");
  const v = $("#view");
  if (VIEW === "msg") { $("#clearF").hidden = true; $("#sortInfo").textContent = ""; renderMessages(); return; }
  if (!state.ready) { v.innerHTML = '<div class="empty"><h3>İşler yükleniyor</h3><p>Veritabanına bağlanılıyor.</p></div>'; return; }
  if (!state.tasks.length) {
    v.innerHTML = `<div class="empty"><h3>Henüz iş yok</h3><p>${isAdmin() ? "İlk işi ekleyin veya önceki kayıtları <b>Ekip ve yetkiler</b> panelinden içe aktarın." : "Proje yöneticisi işleri eklediğinde burada görünecek."}</p>${isAdmin() ? '<button class="btn" id="emptyAdd">+ İlk işi ekle</button>' : ""}</div>`;
    if (isAdmin()) $("#emptyAdd").onclick = () => openDrawer(null); return;
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
function closeDrawer() { $("#drawerHost").innerHTML = ""; cur = null; }
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#drawerHost").innerHTML) closeDrawer(); });
function openDrawer(id) {
  const t = id ? state.tasks.find(x => x.id === id) : null;
  if (id && !t) return;
  if (!id && !isAdmin()) return;
  const adm = isAdmin(), prog = t ? canProgress(t) : adm;
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
function viewingConv(key) { return ROUTE === "proje" && VIEW === "msg" && !document.hidden && keyOfPeer(MSG.peer) === key && !(innerWidth <= 760 && !$("#msgwrap")?.classList.contains("show-thread")); }
function incoming(m) {
  const key = convOf(m);
  if (viewingConv(key)) return;
  const who = nameOf(m.from) + (m.to === "all" ? " · Tüm ekip" : "");
  toast(who + ": " + String(m.text).slice(0, 90));
  try {
    if (document.hidden && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(r => r.showNotification(who, { body: String(m.text).slice(0, 160), icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: key }));
    }
  } catch (e) {}
}
function msgChanged() {
  const n = totalUnread();
  const b = $("#mBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n;
  document.title = (n ? "(" + n + ") " : "") + "Kar-Men Proje Takip";
  try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) {}
  if (VIEW === "msg" && !$("#app").hidden) renderMessages();
  if (!$("#app").hidden) renderHome();
}
function markReadSoon() { clearTimeout(MSG.readTimer); MSG.readTimer = setTimeout(markRead, 400); }
function markRead() {
  if (VIEW !== "msg" || document.hidden || !ME) return;
  const key = keyOfPeer(MSG.peer);
  if (!viewingConv(key)) return;
  const list = convMsgs(key); if (!list.length) return;
  const last = Math.max(...list.map(m => m.at || 0));
  if ((MSG.reads[key] || 0) >= last) return;
  MSG.reads = { ...MSG.reads, [key]: last };
  setDoc(doc(fs, "reads", ME.uid), { convs: { [key]: last } }, { merge: true }).catch(() => {});
  msgChanged();
}
async function sendMsg(peer, text) {
  text = String(text || "").trim(); if (!text) return;
  const m = { to: peer === "all" ? "all" : lower(peer), from: ME.email, fromName: ME.name, text, at: Date.now(), participants: peer === "all" ? [] : [ME.email, lower(peer)] };
  try { await addDoc(collection(fs, "messages"), m); }
  catch (e) { toast(e.code === "permission-denied" ? "Mesaj gönderilemedi: bu kişiye mesaj atma yetkiniz yok." : writeErr(e)); }
}
function convRows() {
  const rows = [{ peer: "all", name: "Tüm ekip", all: true }, ...msgPeople().map(p => ({ peer: p.email, name: p.name }))];
  rows.forEach(r => { const l = convMsgs(keyOfPeer(r.peer)); r.last = l[l.length - 1] || null; r.unread = unreadOf(keyOfPeer(r.peer)); });
  const all = rows.shift();
  rows.sort((a, b) => ((b.last && b.last.at) || 0) - ((a.last && a.last.at) || 0) || a.name.localeCompare(b.name, "tr"));
  return [all, ...rows];
}
function renderMessages() {
  const v = $("#view");
  if (!v.querySelector("#msgwrap")) {
    MSG.sig = "";
    v.innerHTML = `<div class="msgwrap" id="msgwrap">
      <aside class="convs" aria-label="Sohbetler"><div class="convs-h">Sohbetler</div><div id="convList"></div></aside>
      <section class="thread" aria-label="Konuşma">
        <div class="th-h" id="thHead"></div>
        <div class="th-b" id="thBody" aria-live="polite"></div>
        <form class="th-f" id="thForm"><textarea id="thText" rows="1" maxlength="2000" placeholder="Mesaj yazın…" aria-label="Mesaj"></textarea><button class="btn" id="thSend" type="submit">Gönder</button></form>
      </section></div>
      <div class="msgnote" id="msgNote"></div>`;
    const ta = $("#thText");
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
    ta.oninput = grow;
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#thForm").requestSubmit(); } };
    $("#thForm").onsubmit = e => { e.preventDefault(); const t = ta.value; if (!t.trim()) return; ta.value = ""; grow(); sendMsg(MSG.peer, t); ta.focus(); };
  }
  // sohbet listesi
  const rows = convRows();
  $("#convList").innerHTML = rows.map(r => {
    const prev = r.last ? (r.all && lower(r.last.from) !== ME.email ? nameOf(r.last.from) + ": " : lower(r.last.from) === ME.email ? "Siz: " : "") + r.last.text : (r.all ? "Ekibin ortak kanalı" : "Henüz mesaj yok");
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
      html += `<div class="bub${mine ? " mine" : ""}" style="--c:${colorOf(nm)}">${!mine && m.to === "all" ? `<span class="who">${esc(nm)}</span>` : ""}<p>${esc(m.text)}</p><span class="t">${esc(hhmm(m.at || 0))}${canDel ? `<button data-del="${esc(m.id)}">Sil</button>` : ""}</span></div>`;
    });
    body.innerHTML = html || `<div class="th-empty">${cur.all ? "Tüm ekibe ilk mesajı yazın. Buradaki mesajları ekipteki herkes görür." : esc(cur.name) + " ile henüz mesajlaşmadınız. İlk mesajı aşağıdan yazın."}</div>`;
    body.querySelectorAll("[data-del]").forEach(b => { let armed = false; b.onclick = async () => {
      if (!armed) { armed = true; b.textContent = "Silinsin mi?"; setTimeout(() => { armed = false; b.textContent = "Sil"; }, 3000); return; }
      try { await deleteDoc(doc(fs, "messages", b.dataset.del)); } catch (e) { toast(writeErr(e)); } }; });
    if (nearBottom) body.scrollTop = body.scrollHeight;
    MSG.sig = sig;
  }
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
  { id: "disis", name: "DIŞ İŞ TAKİP MODÜLÜ", desc: "Boya, kaplama gibi fason işlerin gidiş–dönüş takibi",
    scope: ["Fasona gönderilen parçaların kaydı", "Dönüş tarihi ve miktar kontrolü", "Fasoncu bazında takip"], tasks: [14] },
  { id: "planlama", name: "PLANLAMA MODÜLÜ", desc: "İş emirleri, iş istasyonları ve üretim planı",
    scope: ["İş emirleri", "Makine kodları ve iş istasyonları", "İş akışları ve süre ölçümü", "Verimlilik analizi"], tasks: [10, 11, 5, 4, 12] },
  { id: "siparis", name: "SİPARİŞ TAKİP MODÜLÜ", desc: "Müşteri siparişleri ve termin takibi",
    scope: ["Müşteri siparişleri", "Termin takibi", "Acil sipariş görünürlüğü"], tasks: [9] }
];
let ROUTE = "home";
function route() {
  let r = (location.hash || "").replace(/^#/, "") || "home";
  if (r !== "home" && !MODULES.some(m => m.id === r)) r = "home";
  const changed = r !== ROUTE; ROUTE = r;
  const mod = MODULES.find(m => m.id === r);
  $("#home").hidden = r !== "home";
  $("#modProje").hidden = r !== "proje";
  $("#modPh").hidden = !(mod && !mod.active);
  $("#crumb").innerHTML = r === "home" ? "<b>Ana ekran</b>" : `<a href="#home">‹ <span>Ana ekran</span></a><b>${esc(mod.name)}</b>`;
  if (mod && !mod.active) renderPh(mod);
  renderHome();
  if (r === "proje") render();
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
  $("#tiles").innerHTML = MODULES.map(m => {
    if (m.active) return `<a class="tile on" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <svg class="wave" viewBox="0 0 180 120" aria-hidden="true"><path d="M0 70 C40 40 80 100 180 50 L180 120 L0 120Z" fill="#fff"/></svg>
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">AKTİF</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>
        <div class="meter" title="Genel tamamlanma ${avg}%"><i style="width:${avg}%"></i></div>
        <div class="stats"><span>%${avg} tamam</span><span>${n} iş</span>${late ? `<span class="alert">${late} geciken</span>` : ""}${active.length ? `<span>Geri bildirim ${active.filter(t => fbT.has(t.id)).length}/${active.length}</span>` : ""}${unread ? `<span class="alert">${unread} yeni mesaj</span>` : ""}</div>
      </div></a>`;
    return `<a class="tile" href="#${m.id}" aria-label="${esc(m.name)} modülünü aç">
      <div class="t-top"><span class="ico">${svgIco(m.id)}</span><span class="st">HAZIRLANIYOR</span></div>
      <div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div></div></a>`;
  }).join("");
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

/* ================= Bağlantı, PWA, olaylar ================= */
const net = () => { $("#offline").hidden = navigator.onLine; };
addEventListener("online", net); addEventListener("offline", net); net();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", e => { try { fn(e); } catch (err) { console.error(err); toast("Bir hata oluştu: " + (err && err.message || err)); } }); };
const setView = v => { VIEW = v; try { localStorage.setItem("karmen-view", VIEW); } catch (e) {} render(); };
on("#addBtn", () => openDrawer(null));
on("#vList", () => setView("list"));
on("#vTl", () => setView("tl"));
on("#vMsg", () => setView("msg"));
on("#clearF", () => { for (const k in F) F[k] = ""; render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && VIEW === "msg") markReadSoon(); });
paintDate(); setInterval(tick, 20000);
