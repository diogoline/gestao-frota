/**
 * Servidor de testes local (Node.js).
 * Roda o código do Apps Script (src/*.gs) com simulações em memória da planilha,
 * do Drive e do cache, e serve a tela em http://localhost:8080.
 * Uso: node dev/servidor-local.js
 * Login inicial: admin@teste.com / Senha1234
 * Nada aqui é usado em produção.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), crypto = require('crypto');
const SRC = path.join(__dirname, '..', 'src');

// ---------- Simulações ----------
function criarAba(nome) {
  let dados = []; let maxRows = 1000;
  const aba = {
    _nome: nome, _dados: () => dados,
    getName: () => nome,
    getLastRow: () => { for (let r = dados.length; r > 0; r--) if ((dados[r - 1] || []).some(v => v !== '' && v !== undefined)) return r; return 0; },
    getLastColumn: () => dados.reduce((m, l) => { let c = 0; (l || []).forEach((v, i) => { if (v !== '' && v !== undefined) c = i + 1; }); return Math.max(m, c); }, 0),
    getMaxRows: () => maxRows,
    insertRowsAfter: (_, n) => { maxRows += n; },
    setFrozenRows: () => {},
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const l = []; for (let j = 0; j < nc; j++) { const v = (dados[r - 1 + i] || [])[c - 1 + j]; l.push(v === undefined ? '' : v); } out.push(l); } return out; },
      setValues: (vals) => { vals.forEach((l, i) => { dados[r - 1 + i] = dados[r - 1 + i] || []; l.forEach((v, j) => { dados[r - 1 + i][c - 1 + j] = v; }); }); },
      setValue: (v) => { dados[r - 1] = dados[r - 1] || []; dados[r - 1][c - 1] = v; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }, setBackground() { return this; }
    })
  };
  return aba;
}
const abas = [criarAba('Página1')];
const ui = { alert: (...a) => console.log('[UI]', a.filter(x => typeof x === 'string').join(' | ')), ButtonSet: { OK: 1 } };
const ss = {
  getSheetByName: n => abas.find(a => a._nome === n) || null,
  insertSheet: n => { const a = criarAba(n); abas.push(a); return a; },
  getSheets: () => abas, deleteSheet: a => abas.splice(abas.indexOf(a), 1)
};
const signed = b => Array.from(b).map(x => x > 127 ? x - 256 : x);
const unsigned = a => Buffer.from(a.map(x => x < 0 ? x + 256 : x));
const pad = n => String(n).padStart(2, '0');
const cache = new Map(), props = new Map(), drive = new Map();
function pasta(nome) {
  const id = crypto.randomUUID(), filhos = [];
  const p = { getId: () => id, nome,
    getFoldersByName: n => { const f = filhos.filter(x => x.nome === n); let i = 0; return { hasNext: () => i < f.length, next: () => f[i++] }; },
    createFolder: n => { const f = pasta(n); filhos.push(f); return f; },
    createFile: blob => { const fid = crypto.randomUUID(); drive.set(fid, blob); return { getId: () => fid }; } };
  drive.set(id, p); return p;
}
const contexto = {
  console, Date, JSON, Math, String, Number, Object, Array, Error, RegExp, isNaN,
  SpreadsheetApp: { getActive: () => ss, getUi: () => ui },
  Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
  DriveApp: { createFolder: n => pasta(n), getFolderById: id => { if (!drive.has(id)) throw new Error('nao'); return drive.get(id); },
    getFileById: id => ({ getBlob: () => drive.get(id) }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, s) => signed(crypto.createHash(alg).update(s, 'utf8').digest()),
    base64Encode: b => unsigned(b).toString('base64'),
    base64Decode: s => signed(Buffer.from(s, 'base64')),
    newBlob: (bytes, mime, nome) => ({ getBytes: () => bytes, mime, nome }),
    formatDate: (d, tz, fmt) => {
      const l = new Date(d.toLocaleString('en-US', { timeZone: tz }));
      const data = l.getFullYear() + '-' + pad(l.getMonth() + 1) + '-' + pad(l.getDate());
      return fmt === 'yyyy-MM-dd' ? data : data + 'T' + pad(l.getHours()) + ':' + pad(l.getMinutes()) + ':' + pad(l.getSeconds());
    }
  }
};
vm.createContext(contexto);
fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).forEach(f => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), contexto, { filename: f }));

vm.runInContext(`instalar(); auth_criarUsuario({nome:'Diogo Admin', email:'admin@teste.com', perfil:'administrador'}, 'Senha1234', 'teste');`, contexto);

// ---------- Tela ----------
function montarHtml() {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const shim = `<script>
  window.google = { script: { run: (function criar(ok, falha) {
    return { withSuccessHandler: f => criar(f, falha), withFailureHandler: f => criar(ok, f),
      api: (...args) => fetch('/api', { method: 'POST', body: JSON.stringify(args) })
        .then(r => r.json()).then(r => ok && ok(r)).catch(e => falha && falha(e)) };
  })() } };</script>`;
  html = html.replace('<!-- ===================== LÓGICA DA TELA', shim + '\n<!-- ===================== LÓGICA DA TELA');
  return html.replace('<base target="_top">', '<meta name="viewport" content="width=device-width, initial-scale=1">');
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let corpo = ''; req.on('data', c => corpo += c); req.on('end', () => {
      contexto.__args = JSON.parse(corpo);
      const r = vm.runInContext('api.apply(null, __args)', contexto);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(r));
    });
    return;
  }
  if (req.url === '/dump') { res.end(JSON.stringify(Object.fromEntries(abas.map(a => [a._nome, a._dados()])), null, 1)); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(montarHtml());
}).listen(process.env.PORTA || 8080, () => console.log('http://localhost:' + (process.env.PORTA || 8080)));
