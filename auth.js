const AUTH_KEY = 'starosta_auth';
const SESSION_KEY = 'starosta_session';
const LOCK_KEY = 'starosta_lock';
const SESSION_DAYS_REMEMBER = 30;
const SESSION_DAYS_NORMAL = 1;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30000;

function bufToHex(b){return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function randomSalt(){const a=new Uint8Array(16);crypto.getRandomValues(a);return bufToHex(a);}
async function hashPassword(p,s){const d=new TextEncoder().encode(s+':'+p);const h=await crypto.subtle.digest('SHA-256',d);return bufToHex(h);}
function getAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null');}catch{return null;}}
async function createAccount(u,p){const salt=randomSalt();const passwordHash=await hashPassword(p,salt);const a={username:u.trim(),salt,passwordHash,createdAt:Date.now()};localStorage.setItem(AUTH_KEY,JSON.stringify(a));return a;}
async function verifyCredentials(u,p){const a=getAuth();if(!a)return false;if(a.username.toLowerCase()!==u.trim().toLowerCase())return false;return (await hashPassword(p,a.salt))===a.passwordHash;}
function startSession(u,r){const days=r?SESSION_DAYS_REMEMBER:SESSION_DAYS_NORMAL;localStorage.setItem(SESSION_KEY,JSON.stringify({username:u,loginAt:Date.now(),expiresAt:Date.now()+days*86400000}));}
function getSession(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(!s)return null;if(s.expiresAt<Date.now()){localStorage.removeItem(SESSION_KEY);return null;}return s;}catch{return null;}}
function endSession(){localStorage.removeItem(SESSION_KEY);}
function getLock(){try{return JSON.parse(localStorage.getItem(LOCK_KEY)||'null');}catch{return null;}}
function isLocked(){const l=getLock();if(!l)return{locked:false};if(l.until>Date.now())return{locked:true,secondsLeft:Math.ceil((l.until-Date.now())/1000)};localStorage.removeItem(LOCK_KEY);return{locked:false};}
function registerFailedAttempt(){const l=getLock()||{attempts:0,until:0};l.attempts=(l.attempts||0)+1;if(l.attempts>=MAX_ATTEMPTS){l.until=Date.now()+LOCK_MS;l.attempts=0;}localStorage.setItem(LOCK_KEY,JSON.stringify(l));}
function clearFailedAttempts(){localStorage.removeItem(LOCK_KEY);}

window.Auth = { getAuth, createAccount, verifyCredentials, startSession, getSession, endSession, isLocked, registerFailedAttempt, clearFailedAttempts };
