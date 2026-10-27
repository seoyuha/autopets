/* 전통문화 Auto Pets — 서버와 브라우저가 함께 쓰는 규칙 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AP = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const CH = {
    song:   { name: '송편 요정', en: 'songpyeon', cost: 3, hp: 3, atk: 1, role: '팀원 체력 회복', sk: '송편 비', color: '#ef6f8f',
      lv: ['매 턴, 체력이 가장 낮은 친구 1명 체력 +1', '매 턴, 체력이 낮은 친구 2명 체력 +2', '매 턴, 친구 전체 체력 +2'] },
    tuho:   { name: '투호 명인', en: 'tuho', cost: 3, hp: 2, atk: 2, role: '원거리 공격', sk: '연속 투호', color: '#3fae4a',
      lv: ['매 턴, 뒤에서도 적 1명에게 화살 1발 (피해 1)', '매 턴, 화살 2발 (피해 1씩)', '매 턴, 화살 2발 (피해 2씩)'] },
    hanbok: { name: '한복 검사', en: 'hanbok', cost: 4, hp: 4, atk: 3, role: '방어력 증가', sk: '화려한 검술', color: '#e45a8a',
      lv: ['전투 시작 때, 자신과 바로 뒤 친구 방어력 +1', '전투 시작 때, 친구 전체 방어력 +1', '전투 시작 때, 친구 전체 방어력 +2'] },
    gat:    { name: '갓 도사', en: 'gat', cost: 3, hp: 2, atk: 2, role: '마법 공격', sk: '부채 바람', color: '#2f7fe0',
      lv: ['전투 시작 때, 적 전체에게 마법 피해 1', '전투 시작 때, 적 전체에게 마법 피해 2', '전투 시작 때, 적 전체에게 마법 피해 3'] },
    hanji:  { name: '한지 마법사', en: 'hanji', cost: 3, hp: 3, atk: 2, role: '보호막 생성', sk: '한지 소환', color: '#e6a21c',
      lv: ['전투 시작 때, 맨 앞 친구에게 보호막 3', '전투 시작 때, 앞쪽 친구 2명에게 보호막 3', '전투 시작 때, 앞쪽 친구 3명에게 보호막 4'] },
    kimchi: { name: '김치 전사', en: 'kimchi', cost: 4, hp: 4, atk: 3, role: '지속 공격', sk: '매운 김치', color: '#e2412f',
      lv: ['전투 시작·공격 때, 적에게 매운맛 1 (매 턴 피해 1)', '매운맛 2 (매 턴 피해 2)', '매운맛 3 (매 턴 피해 3)'] }
  };
  const KEYS = ['song', 'gat', 'hanbok', 'hanji', 'kimchi', 'tuho'];
  const XP_LV = [0, 2, 5];            // 합성 횟수: Lv2 = 2번(3마리), Lv3 = 5번(6마리)
  const lvOf = xp => xp >= XP_LV[2] ? 3 : xp >= XP_LV[1] ? 2 : 1;
  const TEAM_MAX = 5, SHOP_SIZE = 5;

  const DEFAULT_SETTINGS = { rounds: 6, qPer: 4, fastSec: 8, baseCoin: 2, coinOk: 3, coinFast: 1, waitSec: 25 };

  /* 기본 문제 (선생님 화면에서 수정 가능)
     q: 질문, a: 정답, w: 오답 3개, pic: 그림(선택), hint: 힌트(선택) */
  const DEFAULT_QUESTIONS = [
    { q: 'Do you know about songpyeon?', a: 'Yes, I do.', w: ['Yes, I am.', 'Yes, I can.', 'Yes, I have.'], pic: 'song', hint: '“Do you ~?”에는 do로 대답해요.' },
    { q: 'Do you know about hanbok?', a: 'Yes, I do.', w: ['Yes, I am.', 'Yes, I can.', 'Yes, I have.'], pic: 'hanbok', hint: '“Do you ~?”에는 do로 대답해요.' },
    { q: 'Do you know about tuho? No, I ___.', a: "don't", w: ['am not', "can't", "doesn't"], pic: 'tuho', hint: '모른다고 할 때는 No, I don’t.' },
    { q: '___ you know about Chuseok?', a: 'Do', w: ['Are', 'Is', 'Does'], hint: '“너는 ~에 대해 알고 있니?”' },
    { q: 'Do you know ___ hanji?', a: 'about', w: ['at', 'on', 'in'], pic: 'hanji', hint: '“~에 대해” = about' },
    { q: 'Tuho is a traditional Korean ___.', a: 'game', w: ['food', 'hat', 'paper'], pic: 'tuho' },
    { q: 'Hanbok is traditional Korean ___.', a: 'clothes', w: ['food', 'game', 'paper'], pic: 'hanbok' },
    { q: 'A gat is a traditional Korean ___.', a: 'hat', w: ['food', 'game', 'house'], pic: 'gat' },
    { q: 'Hanji is traditional Korean ___.', a: 'paper', w: ['food', 'game', 'clothes'], pic: 'hanji' },
    { q: 'Kimchi is a traditional Korean ___.', a: 'food', w: ['game', 'hat', 'paper'], pic: 'kimchi' },
    { q: 'What is it?', a: "It's songpyeon.", w: ["It's kimchi.", "It's a gat.", "It's hanji."], pic: 'song', hint: '그림을 잘 보세요!' },
    { q: 'What is it?', a: "It's hanbok.", w: ["It's hanji.", "It's tuho.", "It's songpyeon."], pic: 'hanbok', hint: '그림을 잘 보세요!' },
    { q: 'What is it?', a: "It's a gat.", w: ["It's hanbok.", "It's kimchi.", "It's tuho."], pic: 'gat', hint: '그림을 잘 보세요!' },
    { q: 'What is it?', a: "It's hanji.", w: ["It's a gat.", "It's songpyeon.", "It's kimchi."], pic: 'hanji', hint: '그림을 잘 보세요!' },
    { q: 'What is it?', a: "It's kimchi.", w: ["It's tuho.", "It's hanbok.", "It's a gat."], pic: 'kimchi', hint: '그림을 잘 보세요!' },
    { q: 'What is it?', a: "It's tuho.", w: ["It's hanji.", "It's kimchi.", "It's songpyeon."], pic: 'tuho', hint: '그림을 잘 보세요!' },
    { q: 'We eat songpyeon on ___.', a: 'Chuseok', w: ['Christmas', 'Halloween', 'Monday'], pic: 'song' },
    { q: 'You throw arrows into a jar. What is it?', a: 'tuho', w: ['kimchi', 'hanbok', 'hanji'], hint: 'arrow = 화살, jar = 항아리' },
    { q: 'It is a rice cake. We eat it on Chuseok. What is it?', a: 'songpyeon', w: ['tuho', 'gat', 'hanji'], hint: 'rice cake = 떡' },
    { q: 'Does she know about kimchi?', a: 'Yes, she does.', w: ['Yes, she do.', 'Yes, I do.', 'Yes, she is.'], pic: 'kimchi', hint: 'she에는 does를 써요.' },
    { q: 'Does he know about the gat? No, he ___.', a: "doesn't", w: ["don't", "isn't", "can't"], pic: 'gat', hint: 'he에는 does / doesn’t' },
    { q: 'Which sentence is correct?', a: 'Do you know about hanji?', w: ['Do you know hanji about?', 'You do know about hanji?', 'About do you know hanji?'] },
    { q: 'A: Do you know about yut? B: No, I don’t. A: ___', a: 'Let me tell you about it.', w: ['Yes, I do.', "It's mine.", 'Good night.'], hint: '모르는 친구에게 설명해 줄 때' },
    { q: '“Tell me about it.”의 뜻은?', a: '그것에 대해 말해 줘.', w: ['그것을 보여 줘.', '그것을 먹어 봐.', '그것을 입어 봐.'] },
    { q: '“It’s made of rice.”의 뜻은?', a: '그것은 쌀로 만들어져.', w: ['그것은 종이로 만들어져.', '그것은 맛있어.', '그것은 내 것이야.'] },
    { q: '“Do you know about hanji?”의 뜻은?', a: '한지에 대해 알고 있니?', w: ['한지를 좋아하니?', '한지가 어디 있니?', '한지를 만들 수 있니?'], pic: 'hanji' },
    { q: "Let's ___ tuho together!", a: 'play', w: ['eat', 'wear', 'read'], pic: 'tuho' },
    { q: 'People ___ hanbok on Seollal.', a: 'wear', w: ['eat', 'play', 'write'], pic: 'hanbok', hint: 'wear = 입다' },
    { q: "Songpyeon is delicious! Let's ___ it.", a: 'eat', w: ['wear', 'play', 'throw'], pic: 'song' },
    { q: "Kimchi is very ___. It's hot!", a: 'spicy', w: ['sweet', 'sleepy', 'tall'], pic: 'kimchi', hint: '맵다 = spicy' },
    { q: 'Is tuho a food?', a: "No, it isn't. It's a game.", w: ['Yes, it is.', "No, I don't.", 'Yes, I do.'], pic: 'tuho' },
    { q: 'Hanji is made of ___.', a: 'trees', w: ['rice', 'milk', 'glass'], pic: 'hanji', hint: '한지는 닥나무로 만들어요.' },
    { q: 'Songpyeon is made of ___.', a: 'rice', w: ['paper', 'wood', 'water'], pic: 'song' },
    { q: 'Which one is a traditional Korean game?', a: 'yut', w: ['pizza', 'soccer', 'robot'] },
    { q: 'A: ___ B: No, I don’t. Tell me about it.', a: 'Do you know about the gat?', w: ["What's this?", 'Where is the gat?', 'Is it your gat?'], pic: 'gat' },
    { q: 'A: Do you know about songpyeon? B: Yes, I do. It’s a Korean ___.', a: 'rice cake', w: ['hat', 'game', 'paper'], pic: 'song' }
  ];

  /* ---------- 문장 읽기용 텍스트 ---------- */
  const hasHangul = s => /[가-힣]/.test(s);
  function cleanSpeak(s) {
    return String(s || '')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/\b[AB]\s*:\s*/g, ' ')
      .replace(/["]/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function englishPart(s) {
    s = String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    if (!hasHangul(s)) return s;
    const quoted = s.match(/"([^"]*[A-Za-z][^"]*)"/);
    if (quoted) return quoted[1];
    const runs = s.match(/[A-Za-z][A-Za-z0-9 ,.'?!-]*[A-Za-z.?!]/g);
    return runs ? runs.join(' ') : '';
  }
  /* 문제를 처음 보여 줄 때 읽는 문장 (빈칸은 잠깐 쉬기) */
  function speechQ(item) {
    let t = englishPart(item.q);
    if (!t || !/[A-Za-z]/.test(t)) return '';
    t = t.replace(/_{2,}/g, '…');
    return cleanSpeak(t);
  }
  /* 답한 뒤 읽는 문장 (빈칸을 정답으로 채운 완성 문장) */
  function speechA(item) {
    const qEn = englishPart(item.q), aEn = hasHangul(item.a) ? '' : item.a;
    if (/_{2,}/.test(item.q) && aEn && !hasHangul(item.q)) {
      let t = item.q.replace(/_{2,}/, aEn);
      if (/^[a-z]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
      return cleanSpeak(t);
    }
    if (aEn && !/[.?!]$/.test(aEn.trim()) && aEn.trim().split(/\s+/).length <= 2 && /what is it|which one/i.test(qEn)) return cleanSpeak("It's " + aEn.trim() + '.');
    if (aEn) return cleanSpeak(aEn);
    return cleanSpeak(qEn);
  }

  /* 한국어 낱말을 원어민 음성이 한국어에 가깝게 읽도록 바꾸기 (음성 합성에만 사용) */
  const RESPELL = { songpyeon: 'song-pyun', chuseok: 'choo-suk', hanji: 'hahn-jee', hanbok: 'hahn-bok', gat: 'gaht', tuho: 'too-ho', seollal: 'sull-lahl', yut: 'yoot', kimchi: 'kimchi' };
  function respell(t) { return String(t).replace(/[A-Za-z]+/g, w => RESPELL[w.toLowerCase()] || w); }

  /* ---------- 난수 ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const unitStats = u => ({ hp: CH[u.k].hp + (u.bh || 0), atk: CH[u.k].atk + (u.ba || 0), lv: lvOf(u.xp || 0) });

  /* ---------- 자동 전투 ----------
     teamL / teamR: [{k,xp,bh,ba}]  앞(0) → 뒤
     반환: { units:[초기 상태], steps:[{d:ms, ev:[...]}], winner:'L'|'R'|'D', hpL, hpR } */
  function simulate(teamL, teamR, seed) {
    const R = rng(seed || 1);
    let uid = 0;
    const mk = (u, side) => { const s = unitStats(u); return { id: ++uid, k: u.k, lv: s.lv, hp: s.hp, max: s.hp, atk: s.atk, arm: 0, sh: 0, burn: 0, side }; };
    const L = teamL.filter(Boolean).map(u => mk(u, 'L')), Rt = teamR.filter(Boolean).map(u => mk(u, 'R'));
    const units = [...L, ...Rt].map(u => ({ ...u }));
    const steps = [];
    let cur = null;
    const step = d => { cur = { d, ev: [] }; steps.push(cur); };
    const ev = e => cur.ev.push(e);
    const snap = u => ({ t: 'set', u: u.id, hp: u.hp, max: u.max, sh: u.sh, arm: u.arm, burn: u.burn, atk: u.atk });
    const team = s => s === 'L' ? L : Rt, foe = s => s === 'L' ? Rt : L;
    const alive = arr => arr.filter(u => u.hp > 0);

    function dmg(u, n, type) {
      if (u.hp <= 0) return;
      let d = n;
      if ((type === 'hit' || type === 'arrow') && u.arm > 0) d = Math.max(1, d - u.arm);
      let blocked = 0;
      if (u.sh > 0) { blocked = Math.min(u.sh, d); u.sh -= blocked; d -= blocked; }
      u.hp -= d;
      ev({ t: 'hurt', u: u.id, n: d, blocked });
      ev(snap(u));
    }
    function cleanup() {
      const dead = [...L, ...Rt].filter(u => u.hp <= 0 && !u.gone);
      if (!dead.length) return;
      step(650);
      dead.forEach(u => { u.gone = true; ev({ t: 'die', u: u.id }); });
      for (const arr of [L, Rt]) for (let i = arr.length - 1; i >= 0; i--) if (arr[i].hp <= 0) arr.splice(i, 1);
      step(380); ev({ t: 'layout', L: L.map(u => u.id), R: Rt.map(u => u.id) });
    }

    step(700); ev({ t: 'layout', L: L.map(u => u.id), R: Rt.map(u => u.id) }); ev({ t: 'log', txt: '⚔️ 전투 시작! 친구들이 자동으로 싸워요.' });

    // 전투 시작 능력: 한복 → 한지 → 갓 → 김치
    for (const s of ['L', 'R']) for (const u of team(s).filter(u => u.k === 'hanbok')) {
      const al = team(s), amt = u.lv === 3 ? 2 : 1;
      const tg = u.lv === 1 ? al.slice(al.indexOf(u), al.indexOf(u) + 2) : al;
      step(850); ev({ t: 'skill', u: u.id, key: 'hanbok' });
      tg.forEach(t => { t.arm += amt; ev({ t: 'fx', key: 'fx_pink', to: t.id }); ev({ t: 'pop', u: t.id, txt: '방어 +' + amt, c: 'sh' }); ev(snap(t)); });
    }
    for (const s of ['L', 'R']) for (const u of team(s).filter(u => u.k === 'hanji')) {
      const al = team(s), cnt = u.lv, amt = u.lv === 3 ? 4 : 3;
      step(850); ev({ t: 'skill', u: u.id, key: 'hanji' });
      al.slice(0, cnt).forEach(t => { t.sh += amt; ev({ t: 'fx', key: 'fx_paper', to: t.id }); ev({ t: 'pop', u: t.id, txt: '보호막 +' + amt, c: 'sh' }); ev(snap(t)); });
    }
    for (const s of ['L', 'R']) for (const u of team(s).filter(u => u.k === 'gat' && u.hp > 0)) {
      const fs = alive(foe(s)); if (!fs.length) break;
      step(900); ev({ t: 'skill', u: u.id, key: 'gat' });
      fs.forEach(t => { ev({ t: 'fx', key: 'fx_blue', to: t.id }); dmg(t, u.lv, 'magic'); });
      cleanup();
    }
    for (const s of ['L', 'R']) for (const u of team(s).filter(u => u.k === 'kimchi' && u.hp > 0)) {
      const t = alive(foe(s))[0]; if (!t) break;
      step(800); ev({ t: 'skill', u: u.id, key: 'kimchi' }); ev({ t: 'shot', key: 'fx_fire', from: u.id, to: t.id });
      t.burn = Math.max(t.burn, u.lv); ev({ t: 'pop', u: t.id, txt: '매운맛 ' + u.lv, c: 'burn' }); ev(snap(t));
    }

    let turn = 0;
    while (L.length && Rt.length && turn < 30) {
      turn++;
      // 매운맛
      const burning = [...L, ...Rt].filter(u => u.burn > 0 && u.hp > 0);
      if (burning.length) { step(650); burning.forEach(u => { ev({ t: 'fx', key: 'fx_fire', to: u.id }); dmg(u, u.burn, 'burn'); }); cleanup(); if (!L.length || !Rt.length) break; }
      // 송편 회복
      for (const s of ['L', 'R']) for (const u of team(s).filter(u => u.k === 'song' && u.hp > 0)) {
        const al = alive(team(s)), amt = u.lv === 1 ? 1 : 2;
        let tg = u.lv === 3 ? al : al.slice().sort((a, b) => (a.hp / a.max) - (b.hp / b.max)).slice(0, u.lv);
        tg = tg.filter(t => t.hp < t.max); if (!tg.length) continue;
        step(750); ev({ t: 'skill', u: u.id, key: 'song' });
        tg.forEach(t => { const h = Math.min(amt, t.max - t.hp); t.hp += h; ev({ t: 'fx', key: 'fx_hearts', to: t.id }); ev({ t: 'pop', u: t.id, txt: '+' + h, c: 'heal' }); ev(snap(t)); });
      }
      // 투호 화살
      let shot = false;
      for (const s of ['L', 'R']) for (const u of team(s).filter(u => u.k === 'tuho' && u.hp > 0)) {
        const shots = u.lv === 1 ? 1 : 2, pw = u.lv === 3 ? 2 : 1;
        for (let i = 0; i < shots; i++) {
          const fs = alive(foe(s)); if (!fs.length) break;
          const t = fs[Math.floor(R() * fs.length)];
          step(520); if (i === 0) ev({ t: 'skill', u: u.id, key: 'tuho' });
          ev({ t: 'shot', key: 'fx_arrows', from: u.id, to: t.id }); dmg(t, pw, 'arrow'); shot = true;
        }
      }
      if (shot) cleanup();
      if (!L.length || !Rt.length) break;
      // 맞대결
      const a = L[0], b = Rt[0];
      step(850); ev({ t: 'clash', a: a.id, b: b.id, big: a.atk >= 6 || b.atk >= 6 });
      dmg(b, a.atk, 'hit'); dmg(a, b.atk, 'hit');
      if (a.k === 'kimchi' && b.hp > 0) { b.burn = Math.max(b.burn, a.lv); ev(snap(b)); }
      if (b.k === 'kimchi' && a.hp > 0) { a.burn = Math.max(a.burn, b.lv); ev(snap(a)); }
      cleanup();
    }
    const hpL = L.reduce((s, u) => s + Math.max(0, u.hp), 0), hpR = Rt.reduce((s, u) => s + Math.max(0, u.hp), 0);
    let winner = 'D';
    if (L.length && !Rt.length) winner = 'L';
    else if (Rt.length && !L.length) winner = 'R';
    else if (L.length && Rt.length) winner = hpL > hpR ? 'L' : hpR > hpL ? 'R' : 'D';
    return { units, steps, winner, hpL, hpR, turns: turn };
  }

  return { CH, KEYS, XP_LV, lvOf, TEAM_MAX, SHOP_SIZE, DEFAULT_SETTINGS, DEFAULT_QUESTIONS, speechQ, speechA, englishPart, respell, rng, unitStats, simulate };
});
