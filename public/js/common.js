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

/* ---------- 효과음 (따로 파일 없이 만들어요) ---------- */
const SND = {
  on: store.get('sound', true), ctx: null,
  c() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
  t(f, d, type = 'sine', v = .16, when = 0, f2) { if (!this.on) return; const c = this.c(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; const s = c.currentTime + when; o.frequency.setValueAtTime(f, s); if (f2) o.frequency.exponentialRampToValueAtTime(f2, s + d); g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(.001, s + d); o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + d + .02); },
  noise(d = .15, v = .2, when = 0, hp = 800) { if (!this.on) return; const c = this.c(); if (!c) return; const b = c.createBuffer(1, c.sampleRate * d, c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = c.createGain(); g.gain.value = v; s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime + when); },
  click() { this.t(660, .07, 'triangle', .1); },
  ok() { [523, 659, 784, 1047].forEach((f, i) => this.t(f, .16, 'triangle', .15, i * .08)); },
  fast() { [784, 988, 1175, 1568].forEach((f, i) => this.t(f, .12, 'square', .07, i * .05)); },
  no() { this.t(220, .25, 'sawtooth', .1, 0, 140); this.t(180, .3, 'square', .05, .12, 110); },
  coin() { this.t(988, .08, 'square', .06); this.t(1319, .2, 'square', .06, .07); },
  buy() { [392, 523, 659].forEach((f, i) => this.t(f, .12, 'triangle', .13, i * .06)); },
  merge() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.t(f, .14, 'sine', .14, i * .06)); },
  hit() { this.noise(.12, .22, 0, 500); this.t(160, .12, 'square', .08, 0, 80); },
  magic() { this.t(400, .4, 'sine', .11, 0, 1200); this.t(600, .4, 'triangle', .07, .05, 1600); },
  heal() { this.t(700, .2, 'sine', .11, 0, 1100); this.t(900, .25, 'sine', .09, .1, 1400); },
  shield() { this.t(300, .3, 'triangle', .11, 0, 700); },
  arrow() { this.noise(.18, .1, 0, 2500); this.t(1200, .12, 'sine', .04, 0, 500); },
  fire() { this.noise(.3, .16, 0, 300); },
  match() { [440, 554, 659, 880].forEach((f, i) => this.t(f, .18, 'triangle', .14, i * .1)); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.t(f, .22, 'triangle', .15, i * .12)); },
  lose() { [392, 349, 311, 262].forEach((f, i) => this.t(f, .3, 'sine', .13, i * .18)); }
};
document.addEventListener('pointerdown', () => SND.c(), { once: true });

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
  stop() { try { if (this.audio) { this.audio.pause(); this.audio = null; } speechSynthesis.cancel(); } catch (e) { } },
  say(text) {
    this.stop();
    if (!text || !store.get('voice', true)) return Promise.resolve();
    return new Promise(resolve => {
      const a = new Audio('tts?t=' + encodeURIComponent(text));
      this.audio = a; let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
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
function closeModal() { $('#modal').classList.remove('on'); }
function dexHtml() {
  return AP.KEYS.map(k => { const c = AP.CH[k]; return `<div class="dex"><img src="${IMG('c_' + k)}"><div class="d"><div style="display:flex;align-items:center"><img class="nm" src="${IMG('n_' + k)}" style="width:auto"><span class="role">${c.role} · ${c.sk}</span></div>${c.lv.map((t, i) => `<div class="lvl"><img src="${IMG('lv' + (i + 1))}">${t}</div>`).join('')}</div><div class="side"><div class="stats"><img src="${IMG('i_heart')}"><span>${c.hp}</span><img src="${IMG('i_sword')}"><span>${c.atk}</span></div><div class="stats"><img src="${IMG('i_coin')}"><span>${c.cost}</span></div></div></div>`; }).join('')
    + `<p style="text-align:center;font-size:24px;color:#8a5a2b">같은 친구를 3마리 모으면 <b>Lv.2</b>, 6마리 모으면 <b>Lv.3</b>! 합성할 때마다 체력·공격 +1</p>`;
}
