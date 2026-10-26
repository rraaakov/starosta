const DB_KEY = 'starosta_db_v2';

const defaultDB = {
  students: [], events: [], attendance: [], tasks: [],
  funds: { totalAmount: 0, payments: [] },
  schedule: [],
};

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return structuredClone(defaultDB);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(defaultDB), ...parsed };
  } catch (e) { console.error('loadDB', e); return structuredClone(defaultDB); }
}

function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function resetDB() { localStorage.removeItem(DB_KEY); }

function exportDB() {
  const data = localStorage.getItem(DB_KEY) || JSON.stringify(defaultDB);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `starosta-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function importDB(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { const parsed = JSON.parse(reader.result); saveDB({ ...structuredClone(defaultDB), ...parsed }); resolve(); }
      catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

window.Store = { loadDB, saveDB, resetDB, exportDB, importDB, DB_KEY };
