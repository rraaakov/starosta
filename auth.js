const AUTH_KEY = 'starosta_auth';
const SESSION_KEY = 'starosta_session';
const LOCK_KEY = 'starosta_lock';
const SESSION_DAYS_REMEMBER = 30;
const SESSION_DAYS_NORMAL = 1;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 1000;

function bufToHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function randomSalt() { const arr = new Uint8Array(16); crypto.getRandomValues(arr); return bufToHex(arr); }

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(digest);
}

function getAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { return null; } }

async function createAccount(username, password) {
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  const auth = { username: username.trim(), salt, passwordHash, createdAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  return auth;
}

async function verifyCredentials(username, password) {
  const auth = getAuth();
  if (!auth) return false;
  if (auth.username.toLowerCase() !== username.trim().toLowerCase()) return false;
  const hash = await hashPassword(password, auth.salt);
  return hash === auth.passwordHash;
}

async function changePassword(oldPassword, newPassword) {
  const auth = getAuth();
  if (!auth) return false;
  const oldHash = await hashPassword(oldPassword, auth.salt);
  if (oldHash !== auth.passwordHash) return false;
  const salt = randomSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  localStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, salt, passwordHash }));
  return true;
}

function startSession(username, remember) {
  const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_NORMAL;
  const session = { username, loginAt: Date.now(), expiresAt: Date.now() + days * 24 * 60 * 60 * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s) return null;
    if (s.expiresAt < Date.now()) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

function endSession() { localStorage.removeItem(SESSION_KEY); }

function getLock() { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch { return null; } }
function isLocked() {
  const lock = getLock();
  if (!lock) return { locked: false };
  if (lock.until > Date.now()) return { locked: true, secondsLeft: Math.ceil((lock.until - Date.now()) / 1000) };
  localStorage.removeItem(LOCK_KEY);
  return { locked: false };
}
function registerFailedAttempt() {
  const lock = getLock() || { attempts: 0, until: 0 };
  lock.attempts = (lock.attempts || 0) + 1;
  if (lock.attempts >= MAX_ATTEMPTS) { lock.until = Date.now() + LOCK_MS; lock.attempts = 0; }
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}
function clearFailedAttempts() { localStorage.removeItem(LOCK_KEY); }

window.Auth = { getAuth, createAccount, verifyCredentials, changePassword, startSession, getSession, endSession, isLocked, registerFailedAttempt, clearFailedAttempts };
