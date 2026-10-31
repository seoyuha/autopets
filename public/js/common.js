/* 화면 크기 맞추기 · 효과음 · 원어민 음성 · 작은 도우미 */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const IMG = k => `img/${k}.webp`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k, d) { try { const v = localStorage.getItem('ap_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ap_' + k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem('ap_' + k); } catch (e) { } }
};
function fit() { const s = Math.min(innerWidth / 1672, innerHeight / 941); $('#stage').style.transform = `scale(${s})`; }
addEventListener('resize', fit);
function toast(msg, ms = 1800) { const t = $('#toast'); t.innerHTML = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); }
function stagePos(el) { const s = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / 1672; return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }; }
function praise(good, x = 686, y = 260, w = 300) {
  const k = good ? ['t_great', 't_nice', 't_good', 't_well'][Math.floor(Math.random() * 4)] : ['t_oops', 't_try'][Math.floor(Math.random() * 2)];
  const p = document.createElement('img'); p.src = IMG(k); p.className = 'praise'; p.style.cssText = `left:${x}px;top:${y}px;width:${w}px`;
  $('#stage').appendChild(p); setTimeout(() => p.remove(), 1150);
}
function fxAt(key, x, y, w, ms = 1100) { const p = document.createElement('img'); p.src = IMG(key); p.className = 'praise'; p.style.cssText = `left:${x - w / 2}px;top:${y}px;width:${w}px`; $('#stage').appendChild(p); setTimeout(() => p.remove(), ms); }
function coinFly(fromEl, toEl, n) {
  if (!fromEl || !toEl) return;
  const a = stagePos(fromEl), b = stagePos(toEl);
  for (let i = 0; i < Math.min(n, 5); i++) {
    const c = document.createElement('img'); c.src = IMG('i_coin'); c.className = 'coinfly';
    c.style.left = (a.x + a.w / 2 - 32 + (i - 2) * 16) + 'px'; c.style.top = (a.y + a.h / 2 - 32) + 'px';
    $('#stage').appendChild(c);
    setTimeout(() => { c.style.left = (b.x + 8) + 'px'; c.style.top = (b.y + 4) + 'px'; c.style.opacity = .3; }, 40 + i * 80);
    setTimeout(() => { c.remove(); SND.coin(); }, 820 + i * 80);
  }
}

/* ---------- 효과음 (선생님이 준 효과음 파일) ----------
   - 모든 소리는 작게(게임을 방해하지 않게) 재생해요. 설정에서 크게/보통/작게/끄기를 고를 수 있어요.
   - 원어민 문장을 읽는 동안에는 효과음을 더 작게 줄여요.
   - 같은 소리가 빠르게 겹치면 한 번만 나요. */
const SFX_FILES = {
  tap: 'button_tap', back: 'button_back', select: 'select_character', coin: 'coin_gain', buy: 'shop_buy', refresh: 'shop_refresh',
  correct: 'quiz_correct', wrong: 'quiz_wrong', battle: 'battle_start', hit: 'hit_normal', sword: 'hanbok_sword', wind: 'gat_wind',
  heal: 'songpyeon_heal', spell: 'hanji_spell', fire: 'kimchi_fire', arrow: 'tuho_arrow', shield: 'shield_up', levelup: 'level_up',
  victory: 'victory', defeat: 'defeat', countdown: 'countdown', timeup: 'time_up', chest: 'reward_chest', assigned: 'team_assigned'
};
/* 소리마다 크기 (효과음 패키지 권장 볼륨 기준: 버튼·코인 작게, 정답·오답 중간, 전투 작게, 승리 조금 크게) */
const SFX_GAIN = {
  tap: .30, back: .30, select: .35, coin: .32, buy: .38, refresh: .32, correct: .45, wrong: .40, battle: .40, hit: .26,
  sword: .30, wind: .30, heal: .30, spell: .30, fire: .28, arrow: .26, shield: .30, levelup: .45, victory: .52, defeat: .42,
  countdown: .30, timeup: .32, chest: .45, assigned: .42
};
const SND_LEVELS = { big: .8, mid: .5, small: .28 };
const SND = {
  on: store.get('sound', true), hush: false, level: store.get('sndLevel', 'mid'), ctx: null, bufs: {}, last: {}, live: 0, duck: 1, master: null, loading: false,
  c() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(this.ctx.destination); } catch (e) { } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx && !this.loading) this.load();
    return this.ctx;
  },
  load() {
    this.loading = true;
    for (const [k, f] of Object.entries(SFX_FILES)) {
      fetch('sfx/' + f + '.mp3').then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej))).then(buf => { this.bufs[k] = buf; }).catch(() => { });
    }
  },
  setLevel(l) { this.level = l; store.set('sndLevel', l); },
  setDuck(on) { this.duck = on ? .35 : 1; if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.duck, this.ctx.currentTime, .08); },
  play(k, opt = {}) {
    if (!this.on || (this.hush && !opt.force)) return;
    const c = this.c(); if (!c) return;
    const buf = this.bufs[k]; if (!buf) return;
    const now = performance.now(), gap = opt.gap ?? 90;
    if (this.last[k] && now - this.last[k] < gap) return;     // 같은 소리 겹침 막기
    if (this.live >= 4) return;                                // 한꺼번에 너무 많이 나지 않게
    this.last[k] = now;
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; if (opt.rate) src.playbackRate.value = opt.rate;
    g.gain.value = (SFX_GAIN[k] ?? .3) * (SND_LEVELS[this.level] ?? .5) * (opt.vol ?? 1);
    src.connect(g); g.connect(this.master);
    this.live++; src.onended = () => { this.live = Math.max(0, this.live - 1); };
    src.start();
  },
  /* 게임 곳곳에서 부르는 이름 */
  click() { this.play('tap'); }, back() { this.play('back'); }, select() { this.play('select'); },
  ok() { this.play('correct'); }, no() { this.play('wrong'); }, fast() { this.play('select', { rate: 1.25 }); },
  coin() { this.play('coin', { vol: .8, gap: 220 }); }, buy() { this.play('buy'); }, refresh() { this.play('refresh'); },
  merge() { this.play('levelup'); }, hit() { this.play('hit', { gap: 140 }); }, match() { this.play('battle'); },
  win() { this.play('victory'); }, lose() { this.play('defeat'); }, chest() { this.play('chest'); }, assigned() { this.play('assigned'); },
  timeup() { this.play('timeup'); }, countdown() { this.play('countdown'); },
  heal() { this.play('heal'); }, arrow() { this.play('arrow', { gap: 160 }); }, sword() { this.play('sword'); }, wind() { this.play('wind'); },
  spell() { this.play('spell'); }, fire() { this.play('fire', { gap: 200 }); }, shield() { this.play('shield', { gap: 200 }); }, magic() { this.play('wind'); }
};
document.addEventListener('pointerdown', () => SND.c(), { once: true });
document.addEventListener('keydown', () => SND.c(), { once: true });

/* ---------- 원어민 음성 ----------
   1) 미리 만든 원어민 음성 파일 → 2) 서버의 원어민 음성 → 3) 기기 음성(가장 자연스러운 목소리로) */
const VOICE = {
  audio: null, bestVoice: null,
  pickVoice() {
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
      const pref = [/natural/i, /neural/i, /google us english/i, /samantha/i, /aria/i, /jenny/i, /zira/i, /en-us/i];
      for (const p of pref) { const v = vs.find(v => p.test(v.name) || p.test(v.lang)); if (v) return (this.bestVoice = v); }
      this.bestVoice = vs[0] || null;
    } catch (e) { }
    return this.bestVoice;
  },
  stop() { try { if (this.audio) { this.audio.pause(); this.audio = null; } speechSynthesis.cancel(); } catch (e) { } try { SND.setDuck(false); } catch (e) { } },
  say(text) {
    this.stop();
    clearTimeout(this._dt);
    if (!text || !store.get('voice', true)) { SND.setDuck(false); return Promise.resolve(); }
    SND.setDuck(true);
    return new Promise(resolve => {
      const a = new Audio('tts?t=' + encodeURIComponent(text));
      this.audio = a; let done = false;
      const fin = () => { if (!done) { done = true; this._dt = setTimeout(() => SND.setDuck(false), 250); resolve(); } };
      a.onended = fin;
      a.onerror = () => { if (this.audio === a) this.fallback(text).then(fin); else fin(); };
      a.play().catch(() => { if (this.audio === a) { a.onerror = null; this.fallback(text).then(fin); } });
      setTimeout(fin, 9000);
    });
  },
  fallback(text) {
    return new Promise(res => {
      try {
        const u = new SpeechSynthesisUtterance(text.replace(/…/g, ', '));
        const v = this.bestVoice || this.pickVoice(); if (v) u.voice = v;
        u.lang = 'en-US'; u.rate = .9; u.onend = res; u.onerror = res;
        speechSynthesis.speak(u);
      } catch (e) { res(); }
    });
  }
};
try { speechSynthesis.onvoiceschanged = () => VOICE.pickVoice(); } catch (e) { }

/* ---------- 모달 ---------- */
function modal(title, html, w = 1200, h = 780) {
  $('#mtitle').textContent = title; $('#mbody').innerHTML = html;
  const b = $('#mbox'); b.style.width = w + 'px'; b.style.height = h + 'px'; b.style.left = (1672 - w) / 2 + 'px'; b.style.top = Math.max(70, (941 - h) / 2 + 20) + 'px';
  $('#modal').classList.add('on'); SND.click();
}
function closeModal() { if ($('#modal').classList.contains('on')) SND.back(); $('#modal').classList.remove('on'); }
function dexHtml() {
  return AP.KEYS.map(k => { const c = AP.CH[k]; return `<div class="dex"><img src="${IMG('c_' + k)}"><div class="d"><div style="display:flex;align-items:center"><img class="nm" src="${IMG('n_' + k)}" style="width:auto"><span class="role">${c.role} · ${c.sk}</span></div>${c.lv.map((t, i) => `<div class="lvl"><img src="${IMG('lv' + (i + 1))}">${t}</div>`).join('')}</div><div class="side"><div class="stats"><img src="${IMG('i_heart')}"><span>${c.hp}</span><img src="${IMG('i_sword')}"><span>${c.atk}</span></div><div class="stats"><img src="${IMG('i_coin')}"><span>${c.cost}</span></div></div></div>`; }).join('')
    + `<p style="text-align:center;font-size:24px;color:#8a5a2b">같은 친구를 3마리 모으면 <b>Lv.2</b>, 6마리 모으면 <b>Lv.3</b>! 합성할 때마다 체력·공격 +1</p>`;
}
