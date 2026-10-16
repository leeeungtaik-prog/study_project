(() => {
  'use strict';

  const GRID = 20;
  const CELL = 24;
  const SIZE = GRID * CELL;
  const FOOD_LIMIT_MS = 10000;
  const FOOD_POINTS = 10;
  const PENALTY = 10;
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 10;
  const TIME_STEP_MS = 15000;  // 이 시간마다 한 단계씩 빨라짐
  const TIME_SPEEDUP = 8;      // 시간 단계당 단축되는 ms
  const SCORE_PER_LEVEL = 50;  // 이 점수마다 레벨 +1
  const MIN_INTERVAL = 45;
  const STORAGE_KEY = 'snakeScores';

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const el = {
    score: $('score'), best: $('best'), level: $('level'), timer: $('timer'),
    overlay: $('overlay'), title: $('overlay-title'), sub: $('overlay-sub'),
    start: $('btn-start'), pause: $('btn-pause'), stop: $('btn-stop'),
    lvDown: $('btn-level-down'), lvUp: $('btn-level-up'),
    scores: $('btn-scores'), modal: $('modal'), list: $('score-list'), close: $('btn-close'),
  };

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  let state = 'idle'; // idle | running | paused | over
  let snake, dir, queue, food, score, level = 3, foodLeft, tickId, elapsed = 0, bonusLevel = 0;

  // ---------- 사운드 (WebAudio 합성, 외부 파일 없음) ----------
  const Sound = (() => {
    const BEAT = 0.2; // 한 스텝(초)
    // [MIDI 음, 스텝 길이] — 0은 쉼표. 통통 튀는 "방귀차" 풍 멜로디
    const TUNE = [
      [55, 1], [55, 1], [52, 1], [55, 1], [60, 2], [0, 1], [55, 1],
      [57, 1], [57, 1], [53, 1], [57, 1], [55, 2], [0, 1], [52, 1],
      [50, 1], [50, 1], [53, 1], [57, 1], [60, 1], [57, 1], [53, 2],
      [55, 1], [52, 1], [48, 1], [52, 1], [55, 1], [48, 3],
    ];
    let ac = null, master = null, timer = null, nextTime = 0, idx = 0, alarm = 0, sirenHigh = false;

    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.25;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return true;
    }
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

    // 톱니파 + 로우패스 + 끝에서 음이 툭 떨어지는 "뿡" 음색
    function toot(t, freq, dur) {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.8, t + dur);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(300, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function bass(t, freq) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 0.9);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + BEAT);
    }
    // 삐뽀삐뽀: 두 음을 번갈아 내는 사이렌
    function siren(t, freq, dur) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      g.gain.setValueAtTime(0.35, t + dur * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function pump() {
      while (nextTime < ac.currentTime + 0.25) {
        if (alarm) {
          // 1단계: 느린 삐뽀, 2단계(1.5초 이하): 심장이 뛰듯 더 빠르게
          const dur = alarm === 2 ? 0.14 : 0.24;
          siren(nextTime, sirenHigh ? 988 : 740, dur);
          sirenHigh = !sirenHigh;
          nextTime += dur;
          continue;
        }
        const [m, len] = TUNE[idx];
        if (m) toot(nextTime, hz(m), Math.max(0.08, len * BEAT * 0.85));
        if (idx % 2 === 0) bass(nextTime, hz(m ? m - 24 : 36));
        nextTime += len * BEAT;
        idx = (idx + 1) % TUNE.length;
      }
    }
    // 0: 평상시 음악, 1/2: 사이렌 (단계가 올라갈수록 빨라짐)
    function setAlarm(level) { alarm = level; }
    function startMusic() {
      if (!ensure() || timer) return;
      nextTime = ac.currentTime + 0.05;
      timer = setInterval(pump, 100);
      pump();
    }
    function stopMusic() {
      clearInterval(timer);
      timer = null;
      alarm = 0;
    }
    function resetMusic() { idx = 0; }

    // 꿀꺽: 목구멍으로 넘어가는 듯 두 번 낮아지는 소리
    function gulp() {
      if (!ensure()) return;
      const t = ac.currentTime;
      [0, 0.09].forEach((d, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
        o.type = 'sine';
        o.frequency.setValueAtTime(i ? 380 : 520, t + d);
        o.frequency.exponentialRampToValueAtTime(110, t + d + 0.11);
        f.type = 'lowpass'; f.frequency.value = 1200;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(1, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.13);
        o.connect(f); f.connect(g); g.connect(master);
        o.start(t + d); o.stop(t + d + 0.15);
      });
    }

    // 게임 종료: 내려가는 음 + 마지막에 길게 처지는 소리
    function gameOver() {
      if (!ensure()) return;
      const t = ac.currentTime + 0.05;
      [72, 67, 64].forEach((m, i) => toot(t + i * 0.18, hz(m), 0.16));
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz(60), t + 0.54);
      o.frequency.exponentialRampToValueAtTime(hz(36), t + 1.3);
      g.gain.setValueAtTime(0.6, t + 0.54);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g); g.connect(master);
      o.start(t + 0.54); o.stop(t + 1.35);
    }

    // 시간 종료: "띠로로로로~" 빠르게 떨리며 내려가는 소리
    function timeUp() {
      if (!ensure()) return;
      const t = ac.currentTime + 0.05;
      const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(hz(79), t);
      o.frequency.exponentialRampToValueAtTime(hz(55), t + 1.2);
      lfo.frequency.value = 24;       // 떨림(트릴) 속도
      lg.gain.value = 90;             // 떨림 폭(Hz)
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.setValueAtTime(0.4, t + 1.0);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g); g.connect(master);
      o.start(t); lfo.start(t);
      o.stop(t + 1.35); lfo.stop(t + 1.35);
    }

    let noiseBuf = null;
    function noise(t, dur, type, freq, vol) {
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      n.buffer = noiseBuf;
      f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(g); g.connect(master);
      n.start(t); n.stop(t + dur);
    }
    function tone(t, type, f0, f1, dur, vol) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    // 벽 충돌: "쾅!" 하는 묵직한 충격음 + 또렷하게 내려가는 사망 멜로디
    function wallCrash() {
      if (!ensure()) return;
      const t = ac.currentTime + 0.02;
      noise(t, 0.35, 'lowpass', 1800, 1);
      tone(t, 'sine', 180, 40, 0.4, 1);
      [67, 64, 60, 55].forEach((m, i) => tone(t + 0.3 + i * 0.16, 'square', hz(m), hz(m) * 0.97, 0.15, 0.3));
      tone(t + 0.95, 'square', hz(48), hz(36), 0.6, 0.3);
    }

    // 몸 충돌: "아삭!" 깨무는 소리 두 번 + 풀 죽은 "뿌우웅~" 보잉 소리
    function bodyCrash() {
      if (!ensure()) return;
      const t = ac.currentTime + 0.02;
      noise(t, 0.07, 'bandpass', 3000, 0.9);
      noise(t + 0.1, 0.07, 'bandpass', 2200, 0.9);
      const o = ac.createOscillator(), v = ac.createOscillator(), vg = ac.createGain(), g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, t + 0.22);
      o.frequency.exponentialRampToValueAtTime(110, t + 1.0);
      v.frequency.value = 9; vg.gain.value = 25;   // 출렁이는 떨림
      v.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
      o.connect(g); g.connect(master);
      o.start(t + 0.22); v.start(t + 0.22);
      o.stop(t + 1.1); v.stop(t + 1.1);
    }

    return { startMusic, stopMusic, resetMusic, setAlarm, gulp, gameOver, timeUp, wallCrash, bodyCrash };
  })();

  // ---------- 저장소 ----------
  function loadScores() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveScore(value) {
    try {
      const arr = loadScores();
      arr.push({ score: value, date: new Date().toISOString() });
      arr.sort((a, b) => b.score - a.score);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 50)));
    } catch (e) { /* 저장 불가 환경 무시 */ }
  }
  function bestScore() {
    return loadScores().reduce((m, s) => Math.max(m, s.score), 0);
  }

  // ---------- 배경(풀밭) 미리 그리기 ----------
  const bg = document.createElement('canvas');
  bg.width = bg.height = SIZE;
  (function paintGrass() {
    const g = bg.getContext('2d');
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        g.fillStyle = (x + y) % 2 ? '#3b7d2f' : '#347328';
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    // 풀잎
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, h = 4 + rnd() * 7;
      g.strokeStyle = rnd() > 0.5 ? 'rgba(120,200,90,0.55)' : 'rgba(20,70,20,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (rnd() - 0.5) * 4, y - h / 2, x + (rnd() - 0.5) * 6, y - h);
      g.stroke();
    }
    // 작은 꽃
    const colors = ['#fff6a8', '#ffffff', '#ffb3d1', '#c9a8ff'];
    for (let i = 0; i < 40; i++) {
      g.fillStyle = colors[Math.floor(rnd() * colors.length)];
      g.beginPath();
      g.arc(rnd() * SIZE, rnd() * SIZE, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    // 가장자리 덤불(어두운 비네트)
    const v = g.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.35, SIZE / 2, SIZE / 2, SIZE * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,30,0,0.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, SIZE, SIZE);
  })();

  // ---------- 렌더링 ----------
  function draw() {
    ctx.drawImage(bg, 0, 0);
    if (!snake) return;
    drawFood();
    for (let i = snake.length - 1; i >= 1; i--) drawBody(snake[i], i);
    drawHead(snake[0]);
  }

  function drawFood() {
    const cx = food.x * CELL + CELL / 2, cy = food.y * CELL + CELL / 2 + 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    const grd = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 10);
    grd.addColorStop(0, '#ff8a80'); grd.addColorStop(1, '#c4161c');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 1, cy - 11); ctx.stroke();
    ctx.fillStyle = '#4caf50';
    ctx.beginPath(); ctx.ellipse(cx + 5, cy - 10, 5, 2.5, -0.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawBody(seg, i) {
    const pad = 2, r = 7;
    const x = seg.x * CELL + pad, y = seg.y * CELL + pad, s = CELL - pad * 2;
    ctx.fillStyle = i % 2 ? '#7fd24a' : '#68bd38';
    roundRect(x, y, s, s, r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(x + 3, y + 2, s - 6, 5, 3); ctx.fill();
    ctx.fillStyle = 'rgba(30,90,20,0.45)';
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  function drawHead(seg) {
    const pad = 1, x = seg.x * CELL + pad, y = seg.y * CELL + pad, s = CELL - pad * 2;
    ctx.fillStyle = '#3e9a2a';
    roundRect(x, y, s, s, 9); ctx.fill();
    // 눈 위치(진행 방향 기준)
    const cx = seg.x * CELL + CELL / 2, cy = seg.y * CELL + CELL / 2;
    const fx = dir.x, fy = dir.y, px = -fy, py = fx; // 전방, 측면 벡터
    const eyes = [1, -1].map((sgn) => ({
      x: cx + fx * 4 + px * 5 * sgn,
      y: cy + fy * 4 + py * 5 * sgn,
    }));
    // 혀
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + fx * 10, cy + fy * 10);
    ctx.lineTo(cx + fx * 15 + px * 2, cy + fy * 15 + py * 2);
    ctx.moveTo(cx + fx * 13, cy + fy * 13);
    ctx.lineTo(cx + fx * 16 - px * 2, cy + fy * 16 - py * 2);
    ctx.stroke();
    for (const e of eyes) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(e.x, e.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(e.x + fx, e.y + fy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- HUD ----------
  function updateHud() {
    el.score.textContent = score ?? 0;
    el.level.textContent = currentLevel();
    el.best.textContent = Math.max(bestScore(), score ?? 0);
    const secs = state === 'idle' || state === 'over' ? 10 : Math.max(0, Math.ceil(foodLeft / 1000));
    el.timer.textContent = secs;
    el.timer.parentElement.classList.toggle('warn', state === 'running' && secs <= 3);
  }

  function showOverlay(title, sub) {
    el.title.textContent = title;
    el.sub.textContent = sub || '';
    el.overlay.classList.remove('hidden');
  }
  function hideOverlay() { el.overlay.classList.add('hidden'); }

  function updateButtons() {
    el.start.textContent = state === 'idle' || state === 'over' ? '시작' : '다시 시작';
    el.pause.disabled = !(state === 'running' || state === 'paused');
    el.pause.textContent = state === 'paused' ? '계속하기' : '일시정지';
    el.stop.disabled = !(state === 'running' || state === 'paused');
    // 레벨은 게임 시작 전(대기/종료 상태)에만 조정 가능
    const locked = state === 'running' || state === 'paused';
    el.lvDown.disabled = locked;
    el.lvUp.disabled = locked;
  }

  // ---------- 게임 흐름 ----------
  // 레벨이 기본 속도, 먹이를 먹을 때마다 조금씩 빨라진다 (최소 간격 제한)
  function tickInterval() {
    const base = 220 - (currentLevel() - 1) * (160 / (MAX_LEVEL - 1));
    const timeSteps = Math.floor(elapsed / TIME_STEP_MS);
    return Math.round(Math.max(MIN_INTERVAL, base - timeSteps * TIME_SPEEDUP));
  }

  // 설정 레벨 + 점수로 올라간 레벨 (한 번 오른 레벨은 감점되어도 유지)
  function currentLevel() {
    return level + bonusLevel;
  }

  function spawnFood() {
    const free = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function startGame() {
    clearTimeout(tickId);
    const mid = Math.floor(GRID / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = DIRS.right;
    queue = [];
    score = 0;
    elapsed = 0;
    bonusLevel = 0;
    food = spawnFood();
    foodLeft = FOOD_LIMIT_MS;
    state = 'running';
    hideOverlay();
    updateButtons();
    updateHud();
    draw();
    scheduleTick();
    Sound.resetMusic();
    Sound.startMusic();
  }

  function scheduleTick() {
    tickId = setTimeout(step, tickInterval());
  }

  function step() {
    if (state !== 'running') return;
    elapsed += tickInterval();
    if (queue.length) dir = queue.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    // 꼬리는 이번 이동에서 비켜나므로 (먹이를 먹지 않는 경우) 충돌 대상에서 제외
    const willEat = food && head.x === food.x && head.y === food.y;
    const body = willEat ? snake : snake.slice(0, -1);
    if (hitWall || body.some((s) => s.x === head.x && s.y === head.y)) {
      return hitWall ? endGame('벽에 부딪혔어요!', 'wall') : endGame('몸에 부딪혔어요!', 'body');
    }

    snake.unshift(head);
    if (willEat) {
      score += FOOD_POINTS;
      Sound.gulp();
      bonusLevel = Math.max(bonusLevel, Math.floor(score / SCORE_PER_LEVEL));
      food = spawnFood();
      foodLeft = FOOD_LIMIT_MS;
      if (!food) return endGame('모든 칸을 채웠어요! 🎉');
    } else {
      snake.pop();
      foodLeft -= tickInterval();
      if (foodLeft <= 0) {
        score -= PENALTY;
        foodLeft = FOOD_LIMIT_MS;
        if (score <= 0) {
          score = 0;
          updateHud();
          draw();
          return endGame('10초 안에 먹이를 못 먹어 0점이 되었어요!', 'time');
        }
      }
    }
    Sound.setAlarm(foodLeft <= 1500 ? 2 : foodLeft <= 3000 ? 1 : 0);
    updateHud();
    draw();
    scheduleTick();
  }

  function endGame(reason, kind) {
    clearTimeout(tickId);
    Sound.stopMusic();
    if (state !== 'over') {
      const sfx = { time: Sound.timeUp, wall: Sound.wallCrash, body: Sound.bodyCrash }[kind];
      (sfx || Sound.gameOver)();
    }
    state = 'over';
    saveScore(score);
    updateButtons();
    updateHud();
    draw();
    showOverlay('게임 종료', `${reason} 최종 점수: ${score}`);
  }

  function togglePause() {
    if (state === 'running') {
      clearTimeout(tickId);
      state = 'paused';
      Sound.stopMusic();
      showOverlay('일시정지', '스페이스바 또는 버튼으로 계속');
    } else if (state === 'paused') {
      state = 'running';
      hideOverlay();
      scheduleTick();
      Sound.startMusic();
    }
    updateButtons();
    updateHud();
  }

  function changeLevel(delta) {
    if (state === 'running' || state === 'paused') return;
    level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level + delta));
    bonusLevel = 0;
    updateHud();
  }

  // ---------- 점수기록 ----------
  function openScores() {
    const top = loadScores().sort((a, b) => b.score - a.score).slice(0, 5);
    el.list.innerHTML = '';
    if (!top.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '아직 기록이 없어요';
      el.list.appendChild(li);
    }
    for (const s of top) {
      const li = document.createElement('li');
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = `${s.score}점`;
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = new Date(s.date).toLocaleString('ko-KR');
      li.append(pts, date);
      el.list.appendChild(li);
    }
    el.modal.classList.remove('hidden');
    if (state === 'running') togglePause();
  }
  function closeScores() { el.modal.classList.add('hidden'); }

  // ---------- 이벤트 ----------
  el.start.addEventListener('click', () => { el.start.blur(); startGame(); });
  el.pause.addEventListener('click', () => { el.pause.blur(); togglePause(); });
  el.stop.addEventListener('click', () => { el.stop.blur(); endGame('게임을 종료했어요.'); });
  el.lvDown.addEventListener('click', () => changeLevel(-1));
  el.lvUp.addEventListener('click', () => changeLevel(1));
  el.scores.addEventListener('click', openScores);
  el.close.addEventListener('click', closeScores);
  el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeScores(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closeScores();
    if (e.key === 'Enter') {
      if (!el.modal.classList.contains('hidden')) return;
      e.preventDefault();
      if (state === 'idle' || state === 'over') startGame();
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (state === 'running' || state === 'paused') togglePause();
      return;
    }
    const name = KEYMAP[e.key];
    if (!name) return;
    e.preventDefault();
    if (state !== 'running') return;
    const next = DIRS[name];
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (next.x === -last.x && next.y === -last.y) return; // 반대 방향 금지
    if (next === last) return;
    if (queue.length < 2) queue.push(next);
  });

  // 초기 화면
  score = 0;
  updateButtons();
  updateHud();
  draw();
  showOverlay('숲속 스네이크', '레벨을 고른 뒤 시작 버튼 또는 엔터키를 누르세요');
})();
