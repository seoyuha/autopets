/* 전통문화 Auto Pets — 수업용 서버
   - 선생님이 방을 만들고 학생들이 방 번호로 들어와요.
   - 선생님이 1라운드 상대를 자동 배정하고, 그 뒤로는 준비를 마친 학생끼리 자동으로 맞붙어요.
   - 전투는 서버에서 계산하고 두 학생 화면에서 똑같이 재생돼요. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const AP = require('./public/js/shared.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', extensions: ['html'] }));
app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher.html')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

/* ===================== 원어민 음성 ===================== */
const AUDIO_DIR = path.join(__dirname, 'public', 'audio');
const CACHE_DIR = path.join(require('os').tmpdir(), 'autopets-tts');
fs.mkdirSync(CACHE_DIR, { recursive: true });
const normText = t => String(t || '').trim().replace(/\s+/g, ' ').slice(0, 300);
const hashText = t => crypto.createHash('sha1').update(normText(t)).digest('hex').slice(0, 16);
const pending = new Map();
let edgeOk = true;

async function edgeTts(text, file) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-US-AvaMultilingualNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const ssmlSafe = AP.respell(text).replace(/[<>&]/g, ' ');
  const { audioStream } = await tts.toStream(ssmlSafe, { rate: '-8%' });
  const chunks = [];
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout')), 12000);
    audioStream.on('data', c => chunks.push(c));
    audioStream.on('end', () => { clearTimeout(to); resolve(); });
    audioStream.on('error', e => { clearTimeout(to); reject(e); });
  });
  try { tts.close(); } catch (e) { }
  const buf = Buffer.concat(chunks);
  if (buf.length < 1500) throw new Error('empty audio');
  fs.writeFileSync(file, buf);
}

app.get('/tts', async (req, res) => {
  const text = normText(req.query.t);
  if (!text || !/[A-Za-z]/.test(text)) return res.status(400).end();
  const h = hashText(text);
  const pre = path.join(AUDIO_DIR, h + '.mp3');
  if (fs.existsSync(pre)) return res.set('Cache-Control', 'public, max-age=86400').sendFile(pre);
  const cached = path.join(CACHE_DIR, h + '.mp3');
  if (fs.existsSync(cached)) return res.set('Cache-Control', 'public, max-age=86400').sendFile(cached);
  if (!edgeOk) return res.status(404).end();
  try {
    if (!pending.has(h)) pending.set(h, edgeTts(text, cached).finally(() => pending.delete(h)));
    await pending.get(h);
    res.set('Cache-Control', 'public, max-age=86400').sendFile(cached);
  } catch (e) {
    console.warn('[tts] 실패:', (e && (e.message || e.reason || e.type)) || String(e));
    res.status(404).end();
  }
});

/* ===================== 방 / 학생 ===================== */
const rooms = new Map();
const now = () => Date.now();
const rid = () => crypto.randomBytes(9).toString('base64url');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

function newCode() {
  let c;
  do { c = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(c));
  return c;
}
function sanitizeQuestions(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const q of list) {
    if (!q || !q.q || !q.a) continue;
    const w = (Array.isArray(q.w) ? q.w : []).map(x => clean(x, 120)).filter(Boolean).slice(0, 3);
    if (w.length < 1) continue;
    out.push({ q: clean(q.q, 200), a: clean(q.a, 120), w, pic: AP.CH[q.pic] ? q.pic : '', hint: clean(q.hint, 80) });
  }
  return out.length >= 3 ? out : null;
}
function sanitizeSettings(s, base) {
  const o = { ...AP.DEFAULT_SETTINGS, ...(base || {}) };
  if (!s) return o;
  const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  o.rounds = num(s.rounds, 2, 15, o.rounds);
  o.qPer = num(s.qPer, 1, 8, o.qPer);
  o.fastSec = num(s.fastSec, 3, 30, o.fastSec);
  o.waitSec = num(s.waitSec, 10, 120, o.waitSec);
  return o;
}

function createRoom(questions, settings) {
  const code = newCode();
  const room = {
    code, teacherToken: rid(), created: now(), touched: now(),
    status: 'lobby',            // lobby | playing | ended
    paused: false,
    settings: sanitizeSettings(settings),
    questions: sanitizeQuestions(questions) || AP.DEFAULT_QUESTIONS.map(q => ({ ...q })),
    players: new Map(),          // id → player
    pairs: [],                   // [[idA,idB]] 1라운드 배정
    queue: [],                   // 상대를 기다리는 학생 id
    battles: [], log: [], teacherSockets: new Set(), seq: 0
  };
  rooms.set(code, room);
  return room;
}

function newPlayer(room, name, avatar) {
  const p = {
    id: rid().slice(0, 8), token: rid(), name, avatar: AP.CH[avatar] ? avatar : 'song',
    online: true, sockets: new Set(), joined: now(),
    phase: room.status === 'playing' ? 'quiz' : 'lobby',
    round: 1, coins: 0, team: [null, null, null, null, null], shop: [],
    bonusHp: 0, bonusAtk: 0, roundOk: 0, roundFast: 0, roundTime: 0,
    qOrder: [], qPtr: 0, qIdx: 0, cur: null, roundQ: [],
    wins: 0, losses: 0, draws: 0, ok: 0, asked: 0, fast: 0, totalTime: 0,
    partner: null, lastOpp: null, waitingSince: 0, battle: null, history: [], lastTeam: null
  };
  p.team[0] = { k: p.avatar, xp: 0, bh: 0, ba: 0 };   // 내가 고른 캐릭터가 첫 친구
  room.players.set(p.id, p);
  if (room.status === 'playing') startRoundFor(room, p, true);
  return p;
}

function addLog(room, who, txt, kind) {
  room.log.unshift({ t: now(), who, txt, kind: kind || '' });
  if (room.log.length > 80) room.log.length = 80;
}

/* ---------- 라운드 / 문제 ---------- */
function rollShop(p) {
  p.shop = Array.from({ length: AP.SHOP_SIZE }, () => ({ k: AP.KEYS[Math.floor(Math.random() * AP.KEYS.length)], sold: false }));
}
function nextQuestionIndex(room, p) {
  if (p.qPtr >= p.qOrder.length) { p.qOrder = shuffle(room.questions.map((_, i) => i)); p.qPtr = 0; }
  return p.qOrder[p.qPtr++];
}
function startRoundFor(room, p, first) {
  p.phase = 'quiz';
  p.coins += room.settings.baseCoin;
  p.roundOk = 0; p.roundFast = 0; p.roundTime = 0; p.qIdx = 0; p.roundQ = [];
  rollShop(p);
  sendQuestion(room, p);
}
function sendQuestion(room, p) {
  const qi = nextQuestionIndex(room, p);
  const item = room.questions[qi % room.questions.length];
  const opts = shuffle([item.a, ...item.w]);
  p.cur = { qi, opts, sent: now(), answered: false, item };
}
function publicQuestion(room, p) {
  if (!p.cur) return null;
  const it = p.cur.item;
  return { n: p.qIdx + 1, of: room.settings.qPer, q: it.q, opts: p.cur.opts, pic: it.pic || '', hint: it.hint || '', sayQ: AP.speechQ(it), sayA: AP.speechA(it), answered: p.cur.answered, fastSec: room.settings.fastSec };
}

/* ---------- 상점 ---------- */
function teamCount(p) { return p.team.filter(Boolean).length; }

/* ---------- 매칭 ---------- */
function cloneTeam(team) { return team.filter(Boolean).map(u => ({ k: u.k, xp: u.xp, bh: u.bh, ba: u.ba })); }
function applyBonus(p) {
  // 문제 보너스를 앞에서부터 차례로 나눠 줘요 (영구 강화)
  const units = p.team.filter(Boolean);
  const gained = [];
  if (!units.length) return gained;
  let i = 0;
  for (let n = 0; n < p.bonusHp; n++) { const u = units[i++ % units.length]; u.bh++; gained.push({ k: u.k, t: 'hp' }); }
  i = 0;
  for (let n = 0; n < p.bonusAtk; n++) { const u = units[i++ % units.length]; u.ba++; gained.push({ k: u.k, t: 'atk' }); }
  p.bonusHp = 0; p.bonusAtk = 0;
  return gained;
}

function tryMatch(room) {
  if (room.status !== 'playing' || room.paused) return;
  const waiting = room.queue.map(id => room.players.get(id)).filter(p => p && p.phase === 'waiting');
  room.queue = waiting.map(p => p.id);
  const used = new Set();
  // 1) 선생님이 배정한 짝이 둘 다 준비되면
  for (const p of waiting) {
    if (used.has(p.id) || !p.partner || p.round !== 1) continue;
    const q = room.players.get(p.partner);
    if (q && q.phase === 'waiting' && !used.has(q.id)) { used.add(p.id); used.add(q.id); startBattle(room, p, q); }
  }
  // 2) 준비를 마친 순서대로 서로 맞붙기
  const free = waiting.filter(p => !used.has(p.id) && !(p.partner && p.round === 1 && partnerStillPlaying(room, p)));
  free.sort((a, b) => a.waitingSince - b.waitingSince);
  while (free.length >= 2) {
    const a = free.shift();
    // 방금 만난 친구는 피하고, 라운드가 비슷한 친구를 먼저
    let bi = -1, best = 1e9;
    free.forEach((c, i) => { const s = Math.abs(c.round - a.round) * 10 + (c.id === a.lastOpp ? 50 : 0) + i * 0.1; if (s < best) { best = s; bi = i; } });
    const b = free.splice(bi, 1)[0];
    used.add(a.id); used.add(b.id);
    startBattle(room, a, b);
  }
  room.queue = room.queue.filter(id => !used.has(id));
}
function partnerStillPlaying(room, p) {
  // 배정된 짝이 아직 문제를 풀고 있으면 기다려요 (단, 너무 오래 기다리면 다른 친구와)
  const q = room.players.get(p.partner);
  if (!q || !q.online || q.round !== 1 || q.phase === 'battle' || q.phase === 'done') return false;
  return now() - p.waitingSince < 45000;
}

function startBattle(room, a, b, ghost) {
  room.queue = room.queue.filter(id => id !== a.id && (!b || id !== b.id));
  const gA = applyBonus(a), gB = b ? applyBonus(b) : [];
  const teamA = cloneTeam(a.team);
  const teamB = b ? cloneTeam(b.team) : ghost.team;
  const seed = (Math.random() * 2 ** 31) | 0;
  const sim = AP.simulate(teamA, teamB, seed);
  let winner = sim.winner;
  let tieNote = '';
  if (winner === 'D' && b) {
    // 무승부면 이번 라운드 문제를 더 많이, 더 빨리 맞힌 친구가 이겨요
    if (a.roundOk !== b.roundOk) { winner = a.roundOk > b.roundOk ? 'L' : 'R'; tieNote = '체력이 같아서 문제를 더 많이 맞힌 친구가 이겼어요!'; }
    else if (a.roundTime !== b.roundTime) { winner = a.roundTime < b.roundTime ? 'L' : 'R'; tieNote = '체력이 같아서 문제를 더 빨리 푼 친구가 이겼어요!'; }
  }
  const id = 'b' + (++room.seq);
  const base = { id, units: sim.units, steps: sim.steps, winner, tieNote, round: a.round };
  const infoA = { id: a.id, name: a.name, avatar: a.avatar, ok: a.roundOk, fast: a.roundFast };
  const infoB = b ? { id: b.id, name: b.name, avatar: b.avatar, ok: b.roundOk, fast: b.roundFast } : { id: 'ghost', name: ghost.name, avatar: ghost.avatar, ghost: true };
  a.battle = { ...base, me: 'L', mine: infoA, opp: infoB, gained: gA };
  a.phase = 'battle'; a.lastOpp = b ? b.id : null;
  record(room, a, winner === 'L' ? 'W' : winner === 'R' ? 'L' : 'D', infoB);
  if (b) {
    b.battle = { ...base, me: 'R', mine: infoB, opp: infoA, gained: gB };
    b.phase = 'battle'; b.lastOpp = a.id;
    record(room, b, winner === 'R' ? 'W' : winner === 'L' ? 'L' : 'D', infoA);
  }
  a.lastTeam = teamA; if (b) b.lastTeam = teamB;
  room.battles.unshift({ id, t: now(), a: a.name, b: infoB.name, round: a.round, winner: winner === 'L' ? a.name : winner === 'R' ? infoB.name : '무승부', ghost: !b });
  if (room.battles.length > 60) room.battles.length = 60;
  addLog(room, a.name, `${a.round}라운드 전투: ${a.name} vs ${infoB.name}${b ? '' : ' (기록 대결)'} → ${winner === 'L' ? a.name : winner === 'R' ? infoB.name : '무승부'}`, 'battle');
  pushPlayer(room, a); if (b) pushPlayer(room, b);
}
function record(room, p, res, opp) {
  if (res === 'W') p.wins++; else if (res === 'L') p.losses++; else p.draws++;
  p.history.push({ round: p.round, opp: opp.name, res });
}

function ghostFor(room, p) {
  // 혼자 남은 학생: 다른 친구의 가장 최근 팀 기록과 대결 (AI가 아닌 친구 팀)
  const cands = [...room.players.values()].filter(q => q.id !== p.id && q.lastTeam && q.lastTeam.length);
  if (!cands.length) return null;
  cands.sort((x, y) => Math.abs(x.round - p.round) - Math.abs(y.round - p.round) || (x.id === p.lastOpp ? 1 : 0) - (y.id === p.lastOpp ? 1 : 0));
  const q = cands[Math.floor(Math.random() * Math.min(2, cands.length))];
  return { name: q.name + '의 팀 기록', avatar: q.avatar, team: q.lastTeam.map(u => ({ ...u })) };
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status !== 'playing' || room.paused) continue;
    tryMatch(room);
    for (const id of room.queue.slice()) {
      const p = room.players.get(id);
      if (!p || p.phase !== 'waiting') continue;
      if (p.partner && p.round === 1 && partnerStillPlaying(room, p)) continue;
      const others = [...room.players.values()].filter(q => q.id !== p.id && q.online && q.phase !== 'done');
      const noOne = others.length === 0;
      if (noOne || now() - p.waitingSince > room.settings.waitSec * 1000) {
        const g = ghostFor(room, p);
        if (g && (noOne || !room.queue.some(x => x !== p.id))) { startBattle(room, p, null, g); }
      }
    }
  }
}, 1000);

/* ---------- 순위 ---------- */
function ranking(room) {
  const arr = [...room.players.values()].map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, wins: p.wins, losses: p.losses, draws: p.draws,
    ok: p.ok, asked: p.asked, fast: p.fast, round: Math.min(p.round, room.settings.rounds), phase: p.phase, online: p.online,
    rate: p.asked ? Math.round(p.ok / p.asked * 100) : 0, avg: p.ok ? +(p.totalTime / p.ok / 1000).toFixed(1) : 0,
    score: p.wins * 100 + p.draws * 40 + p.ok * 10 + p.fast * 5
  }));
  arr.sort((a, b) => b.score - a.score || b.ok - a.ok || a.avg - b.avg);
  arr.forEach((r, i) => r.rank = i + 1);
  return arr;
}

/* ---------- 상태 보내기 ---------- */
function playerView(room, p) {
  const opp = p.partner && p.round === 1 ? room.players.get(p.partner) : null;
  return {
    id: p.id, name: p.name, avatar: p.avatar, phase: room.status === 'ended' ? 'done' : p.phase, round: p.round, rounds: room.settings.rounds,
    coins: p.coins, team: p.team, shop: p.shop, bonusHp: p.bonusHp, bonusAtk: p.bonusAtk,
    roundOk: p.roundOk, roundFast: p.roundFast, qPer: room.settings.qPer, fastSec: room.settings.fastSec,
    wins: p.wins, losses: p.losses, draws: p.draws, ok: p.ok, asked: p.asked, fast: p.fast,
    question: p.phase === 'quiz' ? publicQuestion(room, p) : null,
    battle: p.phase === 'battle' ? p.battle : null,
    partner: opp ? { name: opp.name, avatar: opp.avatar } : null,
    paused: room.paused, status: room.status, code: room.code,
    queue: room.queue.map(id => room.players.get(id)).filter(Boolean).map(q => ({ name: q.name, avatar: q.avatar })),
    history: p.history.slice(-12)
  };
}
function pushPlayer(room, p) {
  const v = playerView(room, p);
  for (const sid of p.sockets) io.to(sid).emit('me', v);
  scheduleTeacher(room);
}
function pushAll(room) { for (const p of room.players.values()) pushPlayer(room, p); pushLobby(room); }
function pushLobby(room) {
  const list = [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, online: p.online, phase: p.phase }));
  io.to('room:' + room.code).emit('lobby', { players: list, status: room.status, paused: room.paused, rank: ranking(room).slice(0, 40) });
}
function teacherView(room) {
  return {
    code: room.code, status: room.status, paused: room.paused, settings: room.settings, questions: room.questions,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, online: p.online, phase: p.phase, round: p.round, coins: p.coins,
      team: p.team.filter(Boolean).map(u => ({ k: u.k, lv: AP.lvOf(u.xp) })), wins: p.wins, losses: p.losses, draws: p.draws,
      ok: p.ok, asked: p.asked, fast: p.fast, partner: p.partner, waitingSince: p.waitingSince
    })),
    pairs: room.pairs, queue: room.queue, battles: room.battles.slice(0, 20), log: room.log.slice(0, 40), rank: ranking(room)
  };
}
const tTimers = new Map();
function scheduleTeacher(room) {
  if (tTimers.has(room.code)) return;
  tTimers.set(room.code, setTimeout(() => {
    tTimers.delete(room.code);
    io.to('teacher:' + room.code).emit('t:state', teacherView(room));
    pushLobby(room);
  }, 250));
}

/* ===================== 소켓 ===================== */
io.on('connection', socket => {
  let room = null, player = null, isTeacher = false;
  const touch = () => { if (room) room.touched = now(); };
  const ok = (cb, d) => typeof cb === 'function' && cb({ ok: true, ...(d || {}) });
  const fail = (cb, msg) => typeof cb === 'function' && cb({ ok: false, msg });

  /* ----- 선생님 ----- */
  socket.on('t:create', (d, cb) => {
    room = createRoom(d && d.questions, d && d.settings);
    isTeacher = true; socket.join('teacher:' + room.code); room.teacherSockets.add(socket.id);
    addLog(room, '선생님', `방을 만들었어요 (방 번호 ${room.code})`);
    ok(cb, { code: room.code, token: room.teacherToken }); scheduleTeacher(room);
  });
  socket.on('t:resume', (d, cb) => {
    const r = rooms.get(String(d && d.code));
    if (!r || r.teacherToken !== (d && d.token)) return fail(cb, '방을 찾을 수 없어요.');
    room = r; isTeacher = true; socket.join('teacher:' + room.code); room.teacherSockets.add(socket.id);
    ok(cb, { code: room.code, token: room.teacherToken }); socket.emit('t:state', teacherView(room));
  });
  const T = (ev, fn) => socket.on(ev, (d, cb) => { if (!isTeacher || !room) return fail(cb, '선생님 연결이 끊겼어요.'); touch(); try { fn(d || {}, cb); } catch (e) { console.error(e); fail(cb, '오류가 생겼어요.'); } scheduleTeacher(room); });

  T('t:assign', (d, cb) => {
    const ids = shuffle([...room.players.values()].filter(p => p.online || room.status === 'lobby').map(p => p.id));
    room.pairs = [];
    for (const p of room.players.values()) p.partner = null;
    for (let i = 0; i + 1 < ids.length; i += 2) {
      room.pairs.push([ids[i], ids[i + 1]]);
      room.players.get(ids[i]).partner = ids[i + 1]; room.players.get(ids[i + 1]).partner = ids[i];
    }
    if (ids.length % 2) room.pairs.push([ids[ids.length - 1], null]);
    addLog(room, '선생님', `상대를 자동 배정했어요 (${Math.floor(ids.length / 2)}쌍${ids.length % 2 ? ', 1명은 먼저 끝난 친구와' : ''})`);
    pushAll(room); ok(cb);
  });
  T('t:start', (d, cb) => {
    if (room.status === 'playing') return ok(cb);
    if (!room.players.size) return fail(cb, '아직 들어온 학생이 없어요.');
    if (!room.pairs.length) { // 배정을 안 했으면 자동으로
      const ids = shuffle([...room.players.keys()]);
      for (let i = 0; i + 1 < ids.length; i += 2) { room.players.get(ids[i]).partner = ids[i + 1]; room.players.get(ids[i + 1]).partner = ids[i]; room.pairs.push([ids[i], ids[i + 1]]); }
      if (ids.length % 2) room.pairs.push([ids[ids.length - 1], null]);
    }
    room.status = 'playing'; room.paused = false;
    for (const p of room.players.values()) if (p.phase === 'lobby') startRoundFor(room, p, true);
    addLog(room, '선생님', '게임을 시작했어요!');
    pushAll(room); ok(cb);
  });
  T('t:pause', (d, cb) => { room.paused = !!d.paused; addLog(room, '선생님', room.paused ? '게임을 잠시 멈췄어요' : '게임을 다시 시작했어요'); pushAll(room); ok(cb); });
  T('t:end', (d, cb) => {
    room.status = 'ended'; room.paused = false; room.queue = [];
    for (const p of room.players.values()) p.phase = 'done';
    addLog(room, '선생님', '게임을 끝냈어요'); pushAll(room); ok(cb);
  });
  T('t:reset', (d, cb) => {
    room.status = 'lobby'; room.paused = false; room.queue = []; room.pairs = []; room.battles = [];
    for (const p of room.players.values()) {
      Object.assign(p, { phase: 'lobby', round: 1, coins: 0, team: [{ k: p.avatar, xp: 0, bh: 0, ba: 0 }, null, null, null, null], shop: [], bonusHp: 0, bonusAtk: 0,
        wins: 0, losses: 0, draws: 0, ok: 0, asked: 0, fast: 0, totalTime: 0, partner: null, lastOpp: null, battle: null, history: [], lastTeam: null, cur: null });
    }
    addLog(room, '선생님', '처음 상태로 되돌렸어요'); pushAll(room); ok(cb);
  });
  T('t:settings', (d, cb) => { room.settings = sanitizeSettings(d.settings, room.settings); pushAll(room); ok(cb); });
  T('t:questions', (d, cb) => {
    const q = sanitizeQuestions(d.questions);
    if (!q) return fail(cb, '문제를 3개 이상 넣어 주세요.');
    room.questions = q;
    for (const p of room.players.values()) { p.qOrder = []; p.qPtr = 0; }
    ok(cb, { n: q.length });
  });
  T('t:kick', (d, cb) => {
    const p = room.players.get(d.id); if (!p) return ok(cb);
    for (const sid of p.sockets) io.to(sid).emit('kicked');
    room.players.delete(p.id); room.queue = room.queue.filter(x => x !== p.id);
    for (const q of room.players.values()) if (q.partner === p.id) q.partner = null;
    room.pairs = room.pairs.map(pr => pr.map(x => x === p.id ? null : x)).filter(pr => pr[0] || pr[1]);
    addLog(room, '선생님', `${p.name} 학생을 내보냈어요`); pushAll(room); ok(cb);
  });
  T('t:matchNow', (d, cb) => {
    // 기다리는 학생들을 짝 상관없이 바로 매칭
    for (const id of room.queue) { const p = room.players.get(id); if (p) p.partner = null; }
    tryMatch(room);
    for (const id of room.queue.slice()) { const p = room.players.get(id); const g = p && ghostFor(room, p); if (g) startBattle(room, p, null, g); }
    ok(cb);
  });

  /* ----- 학생 ----- */
  socket.on('s:join', (d, cb) => {
    d = d || {};
    const r = rooms.get(String(d.code || '').trim());
    if (!r) return fail(cb, '방 번호를 다시 확인해 주세요.');
    let p = null;
    if (d.token) p = [...r.players.values()].find(x => x.token === d.token) || null;
    if (!p) {
      const name = clean(d.name, 10);
      if (!name) return fail(cb, '이름을 입력해 주세요.');
      if (r.status === 'ended') return fail(cb, '이미 끝난 게임이에요.');
      if ([...r.players.values()].some(x => x.name === name && x.online)) return fail(cb, '같은 이름의 친구가 있어요. 이름을 조금 바꿔 주세요.');
      const same = [...r.players.values()].find(x => x.name === name && !x.online);
      if (same) p = same; else p = newPlayer(r, name, d.avatar);
      if (!same) addLog(r, name, '입장했어요');
    }
    room = r; player = p; touch();
    p.online = true; p.sockets.add(socket.id);
    socket.join('room:' + r.code);
    ok(cb, { token: p.token, id: p.id });
    pushPlayer(r, p); pushLobby(r);
  });
  const S = (ev, fn) => socket.on(ev, (d, cb) => {
    if (!room || !player || !room.players.has(player.id)) return fail(cb, '연결이 끊겼어요.');
    if (room.paused && ev !== 's:battleDone') return fail(cb, '선생님이 잠시 멈췄어요.');
    touch();
    try { fn(d || {}, cb); } catch (e) { console.error(e); fail(cb, '오류가 생겼어요.'); }
    pushPlayer(room, player);
  });

  S('s:answer', (d, cb) => {
    const p = player;
    if (p.phase !== 'quiz' || !p.cur || p.cur.answered) return fail(cb);
    const choice = p.cur.opts[d.choice];
    if (choice === undefined) return fail(cb);
    const ms = now() - p.cur.sent;
    const good = choice === p.cur.item.a;
    const fast = good && ms <= room.settings.fastSec * 1000;
    p.cur.answered = true; p.asked++;
    let coin = 0;
    if (good) {
      coin = room.settings.coinOk + (fast ? room.settings.coinFast : 0);
      p.coins += coin; p.ok++; p.roundOk++; p.bonusHp++; p.totalTime += ms; p.roundTime += ms;
      if (fast) { p.fast++; p.roundFast++; p.bonusAtk++; }
      addLog(room, p.name, `정답 (+${coin}코인${fast ? ', 번개 정답' : ''})`, 'ok');
    } else {
      p.roundTime += ms + 5000;
      addLog(room, p.name, `오답 (정답: ${p.cur.item.a})`, 'no');
    }
    p.roundQ.push({ q: p.cur.item.q, a: p.cur.item.a, mine: choice, good, ms });
    ok(cb, { good, fast, coin, answer: p.cur.item.a, answerIdx: p.cur.opts.indexOf(p.cur.item.a), sec: +(ms / 1000).toFixed(1), sayA: AP.speechA(p.cur.item) });
  });
  S('s:next', (d, cb) => {
    const p = player;
    if (p.phase !== 'quiz' || !p.cur || !p.cur.answered) return fail(cb);
    p.qIdx++;
    if (p.qIdx >= room.settings.qPer) { p.cur = null; p.phase = 'shop'; ok(cb, { done: true }); }
    else { sendQuestion(room, p); ok(cb); }
  });
  S('s:buy', (d, cb) => {
    const p = player; if (p.phase !== 'shop') return fail(cb);
    const s = p.shop[d.i]; if (!s || s.sold) return fail(cb);
    const c = AP.CH[s.k];
    if (p.coins < c.cost) return fail(cb, '코인이 부족해요!');
    const same = p.team.findIndex(u => u && u.k === s.k && u.xp < 5);
    const empty = p.team.findIndex(u => !u);
    if (same < 0 && empty < 0) return fail(cb, '팀이 가득 찼어요! 같은 친구를 사서 합성하거나 친구를 보내 주세요.');
    p.coins -= c.cost; s.sold = true;
    if (same >= 0) {
      const u = p.team[same], before = AP.lvOf(u.xp);
      u.xp++; u.bh++; u.ba++;
      const after = AP.lvOf(u.xp);
      addLog(room, p.name, `${c.name} 합성${after > before ? ` (Lv.${after})` : ''}`, 'merge');
      ok(cb, { merged: same, levelUp: after > before ? after : 0 });
    } else {
      p.team[empty] = { k: s.k, xp: 0, bh: 0, ba: 0 };
      addLog(room, p.name, `${c.name} 데려옴`, 'buy');
      ok(cb, { placed: empty });
    }
  });
  S('s:sell', (d, cb) => {
    const p = player; if (p.phase !== 'shop') return fail(cb);
    const u = p.team[d.i]; if (!u) return fail(cb);
    if (teamCount(p) <= 1) return fail(cb, '친구가 1명은 있어야 해요!');
    const back = 1 + Math.floor(u.xp / 2);
    p.coins += back; p.team[d.i] = null;
    ok(cb, { coin: back });
  });
  S('s:swap', (d, cb) => {
    const p = player; if (p.phase !== 'shop') return fail(cb);
    const i = d.i | 0, j = d.j | 0; if (i < 0 || j < 0 || i > 4 || j > 4) return fail(cb);
    [p.team[i], p.team[j]] = [p.team[j], p.team[i]]; ok(cb);
  });
  S('s:refresh', (d, cb) => {
    const p = player; if (p.phase !== 'shop') return fail(cb);
    if (p.coins < 1) return fail(cb, '코인이 부족해요!');
    p.coins -= 1; rollShop(p); ok(cb);
  });
  S('s:ready', (d, cb) => {
    const p = player; if (p.phase !== 'shop') return fail(cb);
    if (!teamCount(p)) return fail(cb, '친구가 1명 이상 있어야 해요!');
    // 팀을 앞쪽으로 모아요
    const t = p.team.filter(Boolean); p.team = [...t, ...Array(5 - t.length).fill(null)];
    p.phase = 'waiting'; p.waitingSince = now();
    if (!room.queue.includes(p.id)) room.queue.push(p.id);
    addLog(room, p.name, `${p.round}라운드 준비 완료 — 상대를 기다려요`, 'ready');
    ok(cb);
    setTimeout(() => { tryMatch(room); pushAll(room); }, 50);
  });
  S('s:battleDone', (d, cb) => {
    const p = player; if (p.phase !== 'battle') return ok(cb);
    p.battle = null;
    if (p.round >= room.settings.rounds) { p.phase = 'done'; addLog(room, p.name, `모든 라운드를 마쳤어요! (${p.wins}승)`, 'done'); }
    else { p.round++; startRoundFor(room, p); }
    ok(cb);
  });

  socket.on('disconnect', () => {
    if (room) room.teacherSockets.delete(socket.id);
    if (player && room) {
      player.sockets.delete(socket.id);
      if (!player.sockets.size) {
        player.online = false;
        if (player.phase === 'waiting') { player.phase = 'shop'; room.queue = room.queue.filter(x => x !== player.id); }
        scheduleTeacher(room);
      }
    }
  });
});

/* 오래된 방 정리 (8시간) */
setInterval(() => { for (const [c, r] of rooms) if (now() - r.touched > 8 * 3600e3) rooms.delete(c); }, 600e3);

server.listen(PORT, () => console.log(`전통문화 Auto Pets 서버: http://localhost:${PORT}  (선생님: /teacher)`));
