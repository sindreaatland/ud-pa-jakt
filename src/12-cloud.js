// ---------- konto og lagring i skyen (Firebase) ----------
// Logger du inn med Google på tittelskjermen, legges jakta (samme tekst som i localStorage, se save) også i Firestore
// under saves/{bruker-ID}, så du kan fortsette på en annen enhet. localStorage er fortsatt det spillet leser og skriver;
// skyen er en kopi som følger etter. Den nyeste av de to vinner (t i lagringen), og når kontoens er nyest, legges den
// i localStorage og siden lastes på nytt. Uten FB_CONFIG er alt dette av, og knappen vises ikke.
// FB_CONFIG er firebaseConfig fra Firebase-konsollen (Prosjektinnstillinger → Dine apper). Den er ikke hemmelig:
// reglene i Firestore sørger for at hver bruker bare når sin egen lagring.
const FB_CONFIG = {
  apiKey: 'AIzaSyAeTNedLzHg30A6t89Z6rD9qw9kAs983Q8',
  authDomain: 'jakt-acbf1.firebaseapp.com',
  projectId: 'jakt-acbf1',
  storageBucket: 'jakt-acbf1.firebasestorage.app',
  messagingSenderId: '75554842344',
  appId: '1:75554842344:web:c28bd66d2f48d29b788b5d',
};
const FB_URL = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-';
const CLOUD_EVERY = 60000;
// ready: første sammenlikning med kontoen er gjort. t: tidsstempelet på det som sist ble hentet eller sendt.
// dirty: det er lagret noe lokalt som ikke er sendt. asked: du trykket nettopp på «Logg inn» (da spør vi før vi bytter)
const CLOUD = { api: null, user: null, ready: false, t: 0, dirty: false, sentAt: 0, timer: 0, asked: false };
const cloudLocal = () => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } };
const cloudT = raw => { try { return (JSON.parse(raw || 'null') || {}).t || 0; } catch (e) { return 0; } };

async function cloudInit() {
  if (!FB_CONFIG) return;
  try {
    const [A, U, F] = await Promise.all(['app', 'auth', 'firestore-lite'].map(n => import(FB_URL + n + '.js')));
    const app = A.initializeApp(FB_CONFIG), auth = U.getAuth(app);
    CLOUD.api = { U, F, auth, db: F.getFirestore(app) };
    $('loginBtn').onclick = () => {
      if (CLOUD.user) return U.signOut(auth);
      CLOUD.asked = true;
      U.signInWithPopup(auth, new U.GoogleAuthProvider()).catch(() => { CLOUD.asked = false; cloudUi('Innloggingen ble avbrutt.'); });
    };
    U.onAuthStateChanged(auth, u => { CLOUD.user = u; CLOUD.ready = false; CLOUD.t = 0; cloudUi(); if (u) cloudPull(CLOUD.asked); CLOUD.asked = false; });
    // fanen skjules: send det siste. Den kommer fram igjen: se om en annen enhet har spilt videre i mellomtiden
    document.addEventListener('visibilitychange', () => { if (document.hidden) cloudPush(true); else if (CLOUD.ready) cloudPull(false); });
    $('acct').hidden = false; cloudUi();
  } catch (e) { }
}
function cloudUi(note) {
  const u = CLOUD.user;
  setText('acctTxt', note || (u ? 'Logget inn som ' + (u.displayName || u.email || 'jeger') + '. Jakta lagres i kontoen.' : 'Logg inn for å fortsette jakta på andre enheter.'));
  $('loginBtn').textContent = u ? 'Logg ut' : 'Logg inn med Google';
}
// Henter kontoens lagring. Rett etter at du selv logget inn (ask), og enheten har en annen jakt enn kontoen, velger du
// hvilken som skal gjelde; ellers vinner den nyeste
async function cloudPull(ask) {
  const { F, db } = CLOUD.api, u = CLOUD.user;
  try {
    const d = (await F.getDoc(F.doc(db, 'saves', u.uid))).data(), raw = cloudLocal(), lt = cloudT(raw);
    if (CLOUD.user !== u) return;
    if (d && d.save && d.save !== raw) {
      const take = ask && raw
        ? confirm('Kontoen har en lagret jakt fra ' + new Date(d.t).toLocaleString('nb-NO') + '.\n\nOK: fortsett på den.\nAvbryt: behold jakta på denne enheten. Da overskrives den i kontoen.')
        : d.t > (CLOUD.ready ? CLOUD.t : lt);
      // G.started slås av så siden ikke lagrer den gamle jakta over den nye idet den lastes på nytt
      if (take) { G.started = false; localStorage.setItem(SAVE_KEY, d.save); location.reload(); return; }
    }
    CLOUD.t = Math.max(CLOUD.t, d && d.save === raw ? d.t : 0); CLOUD.ready = true;
    if (raw && (!d || d.save !== raw)) { CLOUD.dirty = true; cloudPush(true); }
  } catch (e) { cloudUi('Fikk ikke kontakt med kontoen. Jakta lagres på denne enheten.'); }
}
// Sender lagringen til kontoen, høyst én gang per CLOUD_EVERY om det ikke haster (now)
function cloudPush(now) {
  if (!CLOUD.ready || !CLOUD.user || !CLOUD.dirty) return;
  const wait = CLOUD.sentAt + CLOUD_EVERY - Date.now();
  if (!now && wait > 0) { if (!CLOUD.timer) CLOUD.timer = setTimeout(() => { CLOUD.timer = 0; cloudPush(); }, wait); return; }
  const raw = cloudLocal(); if (!raw) return;
  const { F, db } = CLOUD.api, t = cloudT(raw);
  CLOUD.dirty = false; CLOUD.sentAt = Date.now(); CLOUD.t = Math.max(CLOUD.t, t);
  F.setDoc(F.doc(db, 'saves', CLOUD.user.uid), { save: raw, t }).catch(() => { CLOUD.dirty = true; });
}
