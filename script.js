/* ===========================================================
   MISSION ASTRA: LUNAR DESCENT
   Vanilla HTML/CSS/JavaScript
   =========================================================== */

(() => {
  'use strict';

  // ---------- DIFFICULTY ----------
  const DIFFICULTY = {
    easy: {
      label: 'EASY',
      // Stage 1 (Launch)
      windStrength: 0.28,        // angular kick magnitude
      windInterval: [0.9, 1.6],  // seconds between gusts
      tiltFailLimit: 1.25,       // radians before fail
      stage1Time: 9,
      // Stage 2 (Orbit raising)
      orbitSpeed: 0.95,
      orbitWindowHalf: 0.16,     // half-width in radians (window = 2x this)
      orbitTarget: 3,
      orbitMaxMisses: 5,
      // Stage 3 (TLI)
      tliTolerance: 10,          // degrees
      tliPowerWindow: [50, 95],
      // Stage 4 (LOI)
      loiInitialSpeed: 3.0,
      loiBrakeRate: 1.1,
      loiCaptureMin: 0.8,
      loiCaptureMax: 2.6,
      loiWindow: [0.4, 0.7],     // fractional
      loiCaptureFill: 70,        // per second
      // Stage 5 (Descent)
      descentFuel: 320,
      descentGravity: 4.5,
      descentSoftV: 5.0,
      descentUprightLimit: 0.6,
      descentPadW: 280,
    },
    normal: {
      label: 'NORMAL',
      windStrength: 0.5,
      windInterval: [0.6, 1.2],
      tiltFailLimit: 1.0,
      stage1Time: 12,
      orbitSpeed: 1.2,
      orbitWindowHalf: 0.10,
      orbitTarget: 4,
      orbitMaxMisses: 3,
      tliTolerance: 6,
      tliPowerWindow: [60, 90],
      loiInitialSpeed: 3.4,
      loiBrakeRate: 0.9,
      loiCaptureMin: 1.0,
      loiCaptureMax: 2.4,
      loiWindow: [0.45, 0.65],
      loiCaptureFill: 60,
      descentFuel: 220,
      descentGravity: 7,
      descentSoftV: 3.5,
      descentUprightLimit: 0.45,
      descentPadW: 200,
    },
    hard: {
      label: 'HARD',
      windStrength: 0.85,
      windInterval: [0.35, 0.8],
      tiltFailLimit: 0.85,
      stage1Time: 15,
      orbitSpeed: 1.7,
      orbitWindowHalf: 0.07,
      orbitTarget: 5,
      orbitMaxMisses: 2,
      tliTolerance: 3.5,
      tliPowerWindow: [70, 85],
      loiInitialSpeed: 4.0,
      loiBrakeRate: 0.7,
      loiCaptureMin: 1.2,
      loiCaptureMax: 2.0,
      loiWindow: [0.48, 0.6],
      loiCaptureFill: 50,
      descentFuel: 110,
      descentGravity: 13,
      descentSoftV: 2.0,
      descentUprightLimit: 0.22,
      descentPadW: 100,
    },
  };

  // ---------- STATE ----------
  const state = {
    soundOn: true,
    currentStage: 0,
    completed: [false, false, false, false, false],
    running: false,
    stageData: null,
    keys: {},
    rafId: null,
    difficulty: 'normal',
    // mission timing & scoring
    missionStart: 0,           // performance.now() when mission first started
    missionTotalMs: 0,         // accumulated total mission time
    stageStartMs: 0,           // performance.now() at current stage start
    stageTimes: [0, 0, 0, 0, 0],
    stageAttempts: [0, 0, 0, 0, 0],
    missionStartedOnce: false, // becomes true after first stage starts
    clockTimerId: null,
  };
  function D() { return DIFFICULTY[state.difficulty]; }

  // ---------- SCORING ----------
  // Target time per stage in seconds (for ranking)
  const TARGET_TIMES = [15, 25, 20, 25, 35]; // Normal baseline
  const DIFFICULTY_MULT = { easy: 1, normal: 1.5, hard: 2.2 };

  function formatTime(ms) {
    const s = Math.max(0, ms) / 1000;
    const m = Math.floor(s / 60);
    const sec = (s - m * 60);
    return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
  }

  function computeScore() {
    const totalSec = state.missionTotalMs / 1000;
    const targetTotal = TARGET_TIMES.reduce((a, b) => a + b, 0);
    // Base 5000 pts, lose points for going over target time
    let score = 5000;
    score -= Math.max(0, totalSec - targetTotal) * 8;
    // Penalty for retries
    const retries = state.stageAttempts.reduce((a, b) => a + Math.max(0, b - 1), 0);
    score -= retries * 250;
    score = Math.max(0, Math.round(score));
    // Difficulty multiplier
    score = Math.round(score * DIFFICULTY_MULT[state.difficulty]);
    return score;
  }

  function computeRank(score) {
    // Score thresholds calibrated against difficulty multipliers
    if (score >= 7000) return { name: 'Astra Elite', desc: 'Flawless execution. The mission archives will remember this run.' };
    if (score >= 5000) return { name: 'Mission Commander', desc: 'Decisive command from launch through touchdown.' };
    if (score >= 3000) return { name: 'Lead Pilot', desc: 'Steady hands brought the lander home.' };
    if (score >= 1500) return { name: 'Flight Officer', desc: 'A bumpy ride, but a successful landing.' };
    return { name: 'Cadet', desc: 'You made it down. Train harder, fly sharper.' };
  }

  // ---------- MISSION CLOCK ----------
  function showClock() {
    document.getElementById('missionClock').classList.remove('hidden');
  }
  function hideClock() {
    document.getElementById('missionClock').classList.add('hidden');
    if (state.clockTimerId) { clearInterval(state.clockTimerId); state.clockTimerId = null; }
  }
  function startClockTicker() {
    if (state.clockTimerId) return;
    const el = document.getElementById('clockValue');
    state.clockTimerId = setInterval(() => {
      const liveMs = state.running && state.stageStartMs
        ? state.missionTotalMs + (performance.now() - state.stageStartMs)
        : state.missionTotalMs;
      el.textContent = formatTime(liveMs);
    }, 100);
  }
  function resetMissionTiming() {
    state.missionStart = 0;
    state.missionTotalMs = 0;
    state.stageStartMs = 0;
    state.stageTimes = [0, 0, 0, 0, 0];
    state.stageAttempts = [0, 0, 0, 0, 0];
    state.missionStartedOnce = false;
    document.getElementById('clockValue').textContent = '00:00.0';
  }

  const STAGES = [
    {
      id: 1,
      title: 'Launch Phase',
      desc: 'Maintain rocket balance using thrust. Don\'t let it tip over.',
      tip: 'Use ← / → to counter the tilt. Hold ↑ to thrust upward.',
      story: {
        title: 'Vertical Ascent',
        body: 'A real lunar mission begins atop a heavy-lift rocket that fires multiple staged engines to escape Earth\'s atmosphere. The vehicle must remain perfectly aligned during the violent first minutes of flight; even small angular errors compound rapidly. Boosters drop away in stages to shed mass as the craft accelerates.'
      }
    },
    {
      id: 2,
      title: 'Orbit Raising',
      desc: 'Tap when the marker is in the green zone to raise your orbit.',
      tip: 'Time your taps. 4 successful burns complete the stage.',
      story: {
        title: 'Earth-Bound Orbit Raising',
        body: 'Rather than burning all the fuel in one trip to the Moon, the spacecraft repeatedly fires its engines at the closest point of its elliptical orbit. Each precisely-timed burn raises the orbit\'s far side a little further, gradually building energy. This phased approach saves enormous amounts of fuel.'
      }
    },
    {
      id: 3,
      title: 'Trans-Lunar Injection',
      desc: 'Aim the trajectory line into the Moon target, then SPACE to commit.',
      tip: 'Use ← / → to rotate the angle. Hold ↑ to grow thrust power.',
      story: {
        title: 'Trans-Lunar Injection',
        body: 'A final, powerful engine burn pushes the spacecraft out of Earth orbit and onto a long ballistic arc toward the Moon. The angle and velocity must be tuned within fine tolerances; too little and the craft falls back, too much and it overshoots its lunar rendezvous.'
      }
    },
    {
      id: 4,
      title: 'Lunar Orbit Insertion',
      desc: 'Apply retro-thrust at the right moment to be captured by the Moon.',
      tip: 'Hold ↑ to brake while inside the green capture window.',
      story: {
        title: 'Captured by the Moon',
        body: 'Approaching the Moon, the spacecraft is moving too fast to be held by lunar gravity. A retrograde burn — firing the engines opposite the direction of travel — bleeds off speed at exactly the right moment so the craft slows enough to enter a stable lunar orbit.'
      }
    },
    {
      id: 5,
      title: 'Final Descent',
      desc: 'Land softly on the surface. Vertical speed must be < 2.0 m/s on touchdown.',
      tip: '↑ thrust, ← / → rotate. Watch fuel and stay vertical near the ground.',
      story: {
        title: 'The Soft Landing',
        body: 'The most difficult phase. The lander must throttle its engines, sense its altitude and velocity, and gently lower itself to a chosen patch of regolith — all autonomously, with seconds of fuel to spare. A few extra meters per second of vertical speed at touchdown turns triumph into a crash.'
      }
    },
  ];

  // ---------- SOUND (Web Audio synthesized) ----------
  const Sound = (() => {
    let ctx = null;
    let ambientGain = null;
    let ambientOsc = null;
    let started = false;
    let bgm = null;

    function ensure() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function startAmbient() {
  if (!bgm) {
    bgm = new Audio('assets/bgm.mp3'); // your file path
    bgm.loop = true;
    bgm.volume = 0.3;
  }

  if (state.soundOn) {
    bgm.play().catch(() => {});
  }

  if (!ensure() || started) return;
  started = true;

  ambientOsc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  ambientGain = ctx.createGain();

  ambientOsc.type = 'sine';
  ambientOsc.frequency.value = 60;

  osc2.type = 'sine';
  osc2.frequency.value = 87;

  ambientGain.gain.value = state.soundOn ? 0.04 : 0;

  ambientOsc.connect(ambientGain);
  osc2.connect(ambientGain);
  ambientGain.connect(ctx.destination);

  ambientOsc.start();
  osc2.start();
}

// ✅ NEXT FUNCTION (unchanged)
function blip(freq = 660, dur = 0.08, type = 'sine', vol = 0.12) {
  if (!state.soundOn || !ensure()) return;

  const o = ctx.createOscillator();
  const g = ctx.createGain();

  o.type = type;
  o.frequency.value = freq;

  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

  o.connect(g);
  g.connect(ctx.destination);

  o.start();
  o.stop(ctx.currentTime + dur);
}

    let thrustOsc = null, thrustGain = null;
    function startThrust() {
      if (!state.soundOn || !ensure() || thrustOsc) return;
      thrustOsc = ctx.createOscillator();
      thrustGain = ctx.createGain();
      thrustOsc.type = 'sawtooth';
      thrustOsc.frequency.value = 90;
      thrustGain.gain.value = 0.0001;
      thrustGain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.08);
      thrustOsc.connect(thrustGain);
      thrustGain.connect(ctx.destination);
      thrustOsc.start();
    }
    function stopThrust() {
      if (!thrustOsc) return;
      try {
        thrustGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
        thrustOsc.stop(ctx.currentTime + 0.12);
      } catch (e) {}
      thrustOsc = null;
      thrustGain = null;
    }

    function explosion() {
      if (!state.soundOn || !ensure()) return;
      const bufferSize = ctx.sampleRate * 0.6;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = 0.4;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      noise.connect(filter); filter.connect(g); g.connect(ctx.destination);
      noise.start();
    }

    function chime() {
      if (!state.soundOn || !ensure()) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => blip(f, 0.25, 'triangle', 0.16), i * 110);
      });
    }

    function warning() {
      if (!state.soundOn || !ensure()) return;
      blip(880, 0.12, 'square', 0.1);
    }

    function setMuted(muted) {
      state.soundOn = !muted;

  // Ensure audio context
      ensure();

  // Ambient sound
    if (ambientGain) {
      ambientGain.gain.value = state.soundOn ? 0.04 : 0;
  }

  // Background music
    if (bgm) {
      if (muted) {
        bgm.pause();
    } else {
        bgm.play().catch(() => {});
    }
  }

  // Stop thrust if muted
    if (muted) {
      stopThrust();
  }
}
    return { ensure, startAmbient, setMuted, blip, startThrust, stopThrust, explosion, chime, warning };
  })();

  // ---------- LOADER ----------
  function runLoader() {
    const fill = document.getElementById('progressFill');
    const pct = document.getElementById('progressPercent');
    const status = document.getElementById('loaderStatus');
    const messages = [
      'Calibrating navigation...',
      'Fuel systems check...',
      'Trajectory alignment...',
      'Preparing descent modules...',
      'All systems nominal'
    ];
    let p = 0;
    let mIdx = 0;
    status.textContent = messages[0];
    const totalMs = 3200;
    const stepMs = 60;
    const inc = (stepMs / totalMs) * 100;
    const msgInterval = totalMs / messages.length;
    let lastMsgTime = 0;

    const t0 = performance.now();
    const tick = () => {
      p += inc;
      if (p > 100) p = 100;
      fill.style.width = p + '%';
      pct.textContent = Math.floor(p) + '%';

      const elapsed = performance.now() - t0;
      const idx = Math.min(messages.length - 1, Math.floor(elapsed / msgInterval));
      if (idx !== mIdx) {
        mIdx = idx;
        status.textContent = messages[mIdx];
      }

      if (p < 100) {
        setTimeout(tick, stepMs);
      } else {
        setTimeout(() => {
          const loader = document.getElementById('loader');
          loader.style.opacity = '0';
          setTimeout(() => loader.remove(), 1000);
        }, 350);
      }
    };
    tick();
  }

  // ---------- STARFIELD BG ----------
  function initStarfield() {
    const canvas = document.getElementById('bgStars');
    const ctx = canvas.getContext('2d');
    let stars = [];
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      stars = [];
      const count = Math.floor((w * h) / 5000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.4 + 0.2,
          a: Math.random(),
          s: Math.random() * 0.02 + 0.005
        });
      }
    }
    window.addEventListener('resize', resize);
    resize();

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.a += s.s;
        const alpha = 0.4 + Math.abs(Math.sin(s.a)) * 0.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ---------- SMOOTH SCROLL ----------
  function initScrollLinks() {
    document.querySelectorAll('[data-scroll]').forEach(btn => {
      btn.addEventListener('click', () => {
        Sound.blip(520, 0.06);
        const target = document.getElementById(btn.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ---------- STAGE SELECTOR + STORY ----------
  function renderStageSelector() {
    const sel = document.getElementById('stageSelector');
    sel.innerHTML = '';
    STAGES.forEach((s, i) => {
      const pill = document.createElement('button');
      pill.className = 'stage-pill';
      const locked = i > 0 && !state.completed[i - 1];
      if (state.completed[i]) pill.classList.add('completed');
      if (i === state.currentStage) pill.classList.add('active');
      if (locked) pill.classList.add('locked');
      pill.textContent = `Stage ${s.id}: ${s.title}`;
      pill.addEventListener('click', () => {
        if (locked) return;
        Sound.blip(440, 0.05);
        state.currentStage = i;
        loadStage(i);
      });
      sel.appendChild(pill);
    });
  }

  function renderStoryGrid() {
    const grid = document.getElementById('storyGrid');
    grid.innerHTML = '';
    STAGES.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'story-card ' + (state.completed[i] ? 'unlocked' : 'locked');
      card.innerHTML = `
        <p class="story-tag">Stage ${s.id} Briefing</p>
        <h4>${s.story.title}</h4>
        <div class="story-body">${s.story.body}</div>
      `;
      grid.appendChild(card);
    });
  }

  // ---------- STAGE LOADING ----------
  function loadStage(idx) {
    state.currentStage = idx;
    const s = STAGES[idx];
    document.getElementById('stageTag').textContent = `STAGE ${s.id} OF 5`;
    document.getElementById('stageTitle').textContent = s.title;
    document.getElementById('stageDesc').textContent = s.desc;
    setOverlay('Ready', s.tip, 'Start Stage', () => beginStage(idx));
    renderStageSelector();
    updateStats(idx);
  }

  function setOverlay(title, text, btnText, onClick, klass = '') {
    const overlay = document.getElementById('gameOverlay');
    overlay.classList.remove('success', 'fail');
    if (klass) overlay.classList.add(klass);
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    document.getElementById('overlayTitle').textContent = title;
    document.getElementById('overlayText').textContent = text;
    const btn = document.getElementById('overlayBtn');
    btn.textContent = btnText;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      Sound.blip(560, 0.06);
      Sound.startAmbient();
      onClick();
    });
  }

  function hideOverlay() {
    const overlay = document.getElementById('gameOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }

  function showAlert(text) {
    const a = document.getElementById('alertBanner');
    a.textContent = text;
    a.classList.remove('hidden');
  }
  function clearAlert() {
    document.getElementById('alertBanner').classList.add('hidden');
  }

  function updateStats(idx) {
    const wrap = document.getElementById('stageStats');
    wrap.innerHTML = '';
    const sd = state.stageData;
    const stats = [];
    if (idx === 0 && sd) {
      stats.push(['Tilt', Math.round(sd.angle * 57.3) + '°', Math.abs(sd.angle) > 0.5 ? 'warn' : '']);
      stats.push(['Time', sd.elapsed.toFixed(1) + 's']);
    } else if (idx === 1 && sd) {
      stats.push(['Burns', sd.successes + '/4']);
      stats.push(['Misses', sd.misses + '/3', sd.misses >= 2 ? 'warn' : '']);
    } else if (idx === 2 && sd) {
      stats.push(['Angle', Math.round(sd.angle) + '°']);
      stats.push(['Power', Math.round(sd.power) + '%']);
    } else if (idx === 3 && sd) {
      stats.push(['Speed', sd.speed.toFixed(1) + ' km/s', sd.speed > 2.5 ? 'danger' : '']);
      stats.push(['Capture', Math.round(sd.captureProgress) + '%']);
    } else if (idx === 4 && sd) {
      const fuelPct = Math.round((sd.fuel / sd.maxFuel) * 100);
      stats.push(['Altitude', Math.round(sd.altitude) + ' m']);
      stats.push(['V-Speed', sd.vy.toFixed(1) + ' m/s', sd.vy > sd.softV ? 'danger' : sd.vy > sd.softV * 0.6 ? 'warn' : '']);
      stats.push(['Fuel', fuelPct + '%', fuelPct < 20 ? 'warn' : '']);
    } else if (idx === 0) {
      stats.push(['Tilt', '0°']);
      stats.push(['Time', '0.0s']);
    } else if (idx === 1) {
      stats.push(['Burns', '0/4']);
    } else if (idx === 4) {
      stats.push(['Altitude', '— m']);
      stats.push(['V-Speed', '— m/s']);
      stats.push(['Fuel', '100%']);
    }
    for (const [label, value, klass] of stats) {
      const box = document.createElement('div');
      box.className = 'stat-box';
      box.innerHTML = `<div class="stat-label">${label}</div><div class="stat-value ${klass || ''}">${value}</div>`;
      wrap.appendChild(box);
    }
  }

  function completeStage(idx) {
    state.completed[idx] = true;
    // Bank time for this stage
    if (state.stageStartMs) {
      const elapsed = performance.now() - state.stageStartMs;
      state.stageTimes[idx] += elapsed;
      state.missionTotalMs += elapsed;
      state.stageStartMs = 0;
    }
    Sound.chime();
    renderStageSelector();
    renderStoryGrid();
    if (idx < STAGES.length - 1) {
      setTimeout(() => {
        loadStage(idx + 1);
      }, 1200);
    } else {
      // Final mission complete
      setTimeout(showFinalScreen, 1400);
    }
  }

  function failStage(reason) {
    Sound.explosion();
    // Bank time for this attempt
    if (state.stageStartMs) {
      const elapsed = performance.now() - state.stageStartMs;
      state.stageTimes[state.currentStage] += elapsed;
      state.missionTotalMs += elapsed;
      state.stageStartMs = 0;
    }
    setOverlay('Mission Aborted', reason + ' Try again.', 'Retry Stage', () => beginStage(state.currentStage), 'fail');
    state.running = false;
    Sound.stopThrust();
    if (state.rafId) cancelAnimationFrame(state.rafId);
  }

  function showFinalScreen() {
    const score = computeScore();
    const rank = computeRank(score);
    document.getElementById('rankTitle').textContent = rank.name;
    document.getElementById('rankDesc').textContent = rank.desc;
    document.getElementById('finalTime').textContent = formatTime(state.missionTotalMs);
    document.getElementById('finalDiff').textContent = D().label;
    document.getElementById('finalScore').textContent = score.toLocaleString();
    document.getElementById('finalStages').textContent = state.completed.filter(Boolean).length + ' / 5';

    const stageTimesEl = document.getElementById('stageTimes');
    stageTimesEl.innerHTML = '';
    STAGES.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'stage-time-row';
      const attempts = state.stageAttempts[i];
      const tries = attempts > 1 ? ` (${attempts} attempts)` : '';
      row.innerHTML = `
        <span class="st-name">S${s.id} · ${s.title}${tries}</span>
        <span class="st-time">${formatTime(state.stageTimes[i])}</span>
      `;
      stageTimesEl.appendChild(row);
    });

    hideClock();
    const final = document.getElementById('final');
    final.classList.remove('hidden');
    final.scrollIntoView({ behavior: 'smooth' });
  }

  // ---------- BEGIN STAGE ----------
  function beginStage(idx) {
    hideOverlay();
    clearAlert();
    state.running = true;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    Sound.startAmbient();

    // Timing
    if (!state.missionStartedOnce) {
      state.missionStartedOnce = true;
      state.missionStart = performance.now();
    }
    state.stageStartMs = performance.now();
    state.stageAttempts[idx]++;
    showClock();
    startClockTicker();

    if (idx === 0) startStage1();
    else if (idx === 1) startStage2();
    else if (idx === 2) startStage3();
    else if (idx === 3) startStage4();
    else if (idx === 4) startStage5();
  }

  // ---------- CANVAS HELPERS ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  function clearCanvas() {
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, W, H);
    drawCanvasStars();
  }

  // pre-built stars for canvas
  const canvasStars = [];
  for (let i = 0; i < 80; i++) {
    canvasStars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.3 });
  }
  function drawCanvasStars() {
    for (const s of canvasStars) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 255, 0.6)';
      ctx.fill();
    }
  }

  function drawRocket(x, y, angle, scale = 1, thrusting = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    // body
    ctx.fillStyle = '#cfe7ff';
    ctx.strokeStyle = '#9fd1ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(12, 10);
    ctx.lineTo(8, 22);
    ctx.lineTo(-8, 22);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // window
    ctx.fillStyle = '#1a4ea0';
    ctx.beginPath();
    ctx.arc(0, -8, 4, 0, Math.PI * 2);
    ctx.fill();

    // fins
    ctx.fillStyle = '#5fb0ff';
    ctx.beginPath();
    ctx.moveTo(-12, 10); ctx.lineTo(-20, 22); ctx.lineTo(-8, 22); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, 10); ctx.lineTo(20, 22); ctx.lineTo(8, 22); ctx.closePath();
    ctx.fill();

    // thrust flame
    if (thrusting) {
      const len = 18 + Math.random() * 12;
      ctx.fillStyle = '#ffb84a';
      ctx.beginPath();
      ctx.moveTo(-6, 22);
      ctx.lineTo(0, 22 + len);
      ctx.lineTo(6, 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff5a3a';
      ctx.beginPath();
      ctx.moveTo(-3, 22);
      ctx.lineTo(0, 22 + len * 0.7);
      ctx.lineTo(3, 22);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawLander(x, y, angle, thrusting = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // body box
    ctx.fillStyle = '#cfe7ff';
    ctx.strokeStyle = '#9fd1ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-14, -10, 28, 18);
    ctx.fill();
    ctx.stroke();

    // top dome
    ctx.fillStyle = '#9fd1ff';
    ctx.beginPath();
    ctx.arc(0, -10, 8, Math.PI, 0);
    ctx.fill();

    // legs
    ctx.strokeStyle = '#9fd1ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 8); ctx.lineTo(-22, 22);
    ctx.moveTo(14, 8); ctx.lineTo(22, 22);
    ctx.moveTo(-6, 8); ctx.lineTo(-10, 22);
    ctx.moveTo(6, 8); ctx.lineTo(10, 22);
    ctx.stroke();
    // pads
    ctx.fillStyle = '#9fd1ff';
    [[-22,22],[-10,22],[10,22],[22,22]].forEach(([px,py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // thrust
    if (thrusting) {
      const len = 14 + Math.random() * 10;
      ctx.fillStyle = '#ffb84a';
      ctx.beginPath();
      ctx.moveTo(-6, 8);
      ctx.lineTo(0, 8 + len);
      ctx.lineTo(6, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // STAGE 1 — LAUNCH (balance the rising rocket)
  // ============================================================
  function startStage1() {
    const d = D();
    const sd = state.stageData = {
      x: W / 2,
      y: H - 80,
      angle: 0,
      angleVel: 0,
      windTimer: 0,
      elapsed: 0,
      target: d.stage1Time,
      thrusting: false,
    };

    let last = performance.now();
    function loop(now) {
      if (!state.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sd.elapsed += dt;

      // wind / drift (difficulty-scaled)
      sd.windTimer -= dt;
      if (sd.windTimer <= 0) {
        sd.angleVel += (Math.random() - 0.5) * d.windStrength;
        const [wMin, wMax] = d.windInterval;
        sd.windTimer = wMin + Math.random() * (wMax - wMin);
      }

      // controls
      if (state.keys['ArrowLeft']) sd.angleVel -= 1.2 * dt;
      if (state.keys['ArrowRight']) sd.angleVel += 1.2 * dt;
      sd.thrusting = !!state.keys['ArrowUp'];
      if (sd.thrusting) {
        if (Math.random() < 0.05) Sound.blip(120, 0.04, 'sawtooth', 0.05);
        sd.y -= 22 * dt;
      }

      sd.angleVel *= 0.96;
      sd.angle += sd.angleVel * dt;

      // alerts
      if (Math.abs(sd.angle) > d.tiltFailLimit * 0.55) showAlert('Warning: Stabilize Lander');
      else clearAlert();

      // fail
      if (Math.abs(sd.angle) > d.tiltFailLimit) {
        return failStage('The rocket lost stability and tumbled.');
      }

      // success
      if (sd.elapsed >= sd.target) {
        state.running = false;
        Sound.stopThrust();
        setOverlay('Stage Cleared', 'Stable ascent achieved.', 'Continue', () => completeStage(0), 'success');
        return;
      }

      // draw
      clearCanvas();
      // ground
      ctx.fillStyle = '#1a2b4a';
      ctx.fillRect(0, H - 30, W, 30);
      ctx.strokeStyle = '#5fb0ff';
      ctx.beginPath(); ctx.moveTo(0, H - 30); ctx.lineTo(W, H - 30); ctx.stroke();
      // launch tower
      ctx.strokeStyle = '#5fb0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W/2 + 50, H - 30); ctx.lineTo(W/2 + 50, H - 200);
      ctx.moveTo(W/2 + 50, H - 100); ctx.lineTo(W/2 + 30, H - 100);
      ctx.moveTo(W/2 + 50, H - 150); ctx.lineTo(W/2 + 30, H - 150);
      ctx.stroke();

      // clamp y
      if (sd.y < H * 0.3) sd.y = H * 0.3;

      drawRocket(sd.x, sd.y, sd.angle, 1.4, sd.thrusting);

      // tilt indicator
      drawTiltMeter(sd.angle);

      updateStats(0);
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }

  function drawTiltMeter(angle) {
    const cx = 80, cy = 60;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(10,21,48,0.7)';
    ctx.fillRect(-50, -22, 100, 44);
    ctx.strokeStyle = '#5fb0ff';
    ctx.strokeRect(-50, -22, 100, 44);
    ctx.fillStyle = '#9fd1ff';
    ctx.font = '10px monospace';
    ctx.fillText('TILT', -14, -8);
    // needle
    ctx.rotate(Math.max(-Math.PI/2, Math.min(Math.PI/2, angle)));
    ctx.strokeStyle = Math.abs(angle) > 0.55 ? '#ff5a5a' : '#6dffb0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 14);
    ctx.stroke();
    ctx.restore();
  }

  // ============================================================
  // STAGE 2 — ORBIT RAISING (timing minigame)
  // ============================================================
  function startStage2() {
    const d = D();
    const halfW = d.orbitWindowHalf;
    const winA1 = Math.PI * 1.5 - halfW;
    const winA2 = Math.PI * 1.5 + halfW;
    const sd = state.stageData = {
      angle: 0,        // 0..2pi rocket position around earth
      speed: d.orbitSpeed,
      orbitR: 100,
      successes: 0,
      misses: 0,
      target: d.orbitTarget,
      maxMisses: d.orbitMaxMisses,
      winA1,
      winA2,
      tapPressed: false,
    };

    let last = performance.now();
    function loop(now) {
      if (!state.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      sd.angle += sd.speed * dt;
      if (sd.angle > Math.PI * 2) sd.angle -= Math.PI * 2;

      const inWindow = sd.angle > sd.winA1 && sd.angle < sd.winA2;

      // tap detection
      const tapNow = !!state.keys['Space'];
      if (tapNow && !sd.tapPressed) {
        sd.tapPressed = true;
        if (inWindow) {
          sd.successes++;
          sd.orbitR += 22;
          Sound.blip(880, 0.12, 'triangle', 0.18);
        } else {
          sd.misses++;
          Sound.warning();
        }
      }
      if (!tapNow) sd.tapPressed = false;

      if (sd.misses >= sd.maxMisses) {
        return failStage('Too many mis-timed burns wasted critical fuel.');
      }
      if (sd.successes >= sd.target) {
        state.running = false;
        setOverlay('Stage Cleared', 'Orbit successfully raised.', 'Continue', () => completeStage(1), 'success');
        return;
      }

      // draw
      clearCanvas();
      const cx = W / 2, cy = H / 2;
      // earth
      const earthGrad = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, 50);
      earthGrad.addColorStop(0, '#5fb0ff');
      earthGrad.addColorStop(1, '#1a4ea0');
      ctx.fillStyle = earthGrad;
      ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill();

      // orbit ring
      ctx.strokeStyle = 'rgba(159, 209, 255, 0.4)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, sd.orbitR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // green window arc
      ctx.strokeStyle = '#6dffb0';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, sd.orbitR, sd.winA1, sd.winA2);
      ctx.stroke();
      ctx.lineWidth = 1;

      // rocket dot
      const rx = cx + Math.cos(sd.angle) * sd.orbitR;
      const ry = cy + Math.sin(sd.angle) * sd.orbitR;
      ctx.fillStyle = inWindow ? '#6dffb0' : '#cfe7ff';
      ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = inWindow ? '#6dffb0' : '#9fd1ff';
      ctx.beginPath(); ctx.arc(rx, ry, 10, 0, Math.PI * 2); ctx.stroke();

      // hud
      ctx.fillStyle = '#9fd1ff';
      ctx.font = '12px monospace';
      ctx.fillText(`Burns: ${sd.successes}/${sd.target}   Misses: ${sd.misses}/${sd.maxMisses}`, 16, 24);
      ctx.fillStyle = inWindow ? '#6dffb0' : '#7da7d8';
      ctx.fillText(inWindow ? 'BURN NOW (SPACE / TAP)' : 'wait for green window...', 16, 44);

      updateStats(1);
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }

  // ============================================================
  // STAGE 3 — TRANS-LUNAR INJECTION (aim trajectory)
  // ============================================================
  function startStage3() {
    const d = D();
    const sd = state.stageData = {
      angle: -45,    // degrees from horizontal
      power: 50,
      committed: false,
      moonAngle: -30 + (Math.random() - 0.5) * 14, // target angle
      tolerance: d.tliTolerance,
      powerMin: d.tliPowerWindow[0],
      powerMax: d.tliPowerWindow[1],
      spacePressed: false,
      animProgress: 0,
      animRunning: false,
    };

    let last = performance.now();
    function loop(now) {
      if (!state.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!sd.committed) {
        if (state.keys['ArrowLeft']) sd.angle -= 30 * dt;
        if (state.keys['ArrowRight']) sd.angle += 30 * dt;
        if (state.keys['ArrowUp']) sd.power = Math.min(100, sd.power + 30 * dt);
        else sd.power = Math.max(20, sd.power - 10 * dt);

        const sp = !!state.keys['Space'];
        if (sp && !sd.spacePressed) {
          sd.spacePressed = true;
          sd.committed = true;
          sd.animRunning = true;
          Sound.blip(220, 0.4, 'sawtooth', 0.16);
        }
        if (!sp) sd.spacePressed = false;
      } else if (sd.animRunning) {
        sd.animProgress += dt * 0.6;
        if (sd.animProgress >= 1) {
          sd.animRunning = false;
          const angleOk = Math.abs(sd.angle - sd.moonAngle) <= sd.tolerance;
          const powerOk = sd.power >= sd.powerMin && sd.power <= sd.powerMax;
          if (angleOk && powerOk) {
            state.running = false;
            setOverlay('Stage Cleared', 'Trajectory locked. Spacecraft is on course for the Moon.', 'Continue', () => completeStage(2), 'success');
            return;
          } else {
            const reason = !angleOk ? 'Trajectory angle was off-target.' : 'Burn power was outside the safe window.';
            return failStage(reason);
          }
        }
      }

      // draw
      clearCanvas();
      const ex = 80, ey = H - 80; // earth at lower-left
      // earth
      const eg = ctx.createRadialGradient(ex - 6, ey - 6, 2, ex, ey, 28);
      eg.addColorStop(0, '#5fb0ff');
      eg.addColorStop(1, '#1a4ea0');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(ex, ey, 26, 0, Math.PI * 2); ctx.fill();

      // moon at upper-right based on moonAngle
      const moonDist = 600;
      const ma = sd.moonAngle * Math.PI / 180;
      const mx = ex + Math.cos(ma) * moonDist;
      const my = ey + Math.sin(ma) * moonDist;
      // clamp moon to canvas
      const mxC = Math.min(W - 40, Math.max(40, mx));
      const myC = Math.min(H - 40, Math.max(40, my));
      const mg = ctx.createRadialGradient(mxC - 6, myC - 6, 2, mxC, myC, 22);
      mg.addColorStop(0, '#e0e6f0');
      mg.addColorStop(1, '#7d8aa0');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mxC, myC, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#cfe7ff';
      ctx.beginPath(); ctx.arc(mxC, myC, 30, 0, Math.PI * 2); ctx.stroke();

      // trajectory line based on chosen angle/power
      const ta = sd.angle * Math.PI / 180;
      const len = (sd.power / 100) * 700;
      const tx = ex + Math.cos(ta) * len;
      const ty = ey + Math.sin(ta) * len;
      ctx.strokeStyle = sd.committed ? '#6dffb0' : '#ffb84a';
      ctx.lineWidth = 2;
      ctx.setLineDash(sd.committed ? [] : [6, 6]);
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.setLineDash([]);

      // moving rocket along trajectory if committed
      if (sd.committed) {
        const px = ex + Math.cos(ta) * len * sd.animProgress;
        const py = ey + Math.sin(ta) * len * sd.animProgress;
        drawRocket(px, py, ta + Math.PI / 2, 0.8, true);
      }

      // hud
      ctx.fillStyle = '#9fd1ff';
      ctx.font = '12px monospace';
      ctx.fillText(`Angle: ${Math.round(sd.angle)}°   Target: ${Math.round(sd.moonAngle)}° ±${sd.tolerance}°`, 16, 24);
      ctx.fillText(`Power: ${Math.round(sd.power)}%   Window: ${sd.powerMin}–${sd.powerMax}%`, 16, 44);
      ctx.fillStyle = '#7da7d8';
      ctx.fillText(sd.committed ? 'BURN COMMITTED' : 'SPACE to commit burn', 16, 64);

      updateStats(2);
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }

  // ============================================================
  // STAGE 4 — LUNAR ORBIT INSERTION (brake during window)
  // ============================================================
  function startStage4() {
    const d = D();
    const sd = state.stageData = {
      x: 60,
      y: H / 2,
      speed: d.loiInitialSpeed,
      vx: 240,
      braking: false,
      captureWindowX: [W * d.loiWindow[0], W * d.loiWindow[1]],
      captureProgress: 0,
      captured: false,
      escaped: false,
      brakeRate: d.loiBrakeRate,
      capMin: d.loiCaptureMin,
      capMax: d.loiCaptureMax,
      capFill: d.loiCaptureFill,
    };

    let last = performance.now();
    function loop(now) {
      if (!state.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      sd.braking = !!state.keys['ArrowUp'];
      const inWindow = sd.x >= sd.captureWindowX[0] && sd.x <= sd.captureWindowX[1];

      if (sd.braking) {
        sd.vx -= 60 * dt;
        sd.speed -= sd.brakeRate * dt;
        if (Math.random() < 0.1) Sound.blip(120, 0.05, 'sawtooth', 0.06);
      }

      sd.x += sd.vx * dt;
      // Clamp speed so the player CAN'T over-brake below the safe minimum.
      // This makes brake feel like an autopilot floor — hold ↑ as long as you want.
      if (sd.speed < sd.capMin) sd.speed = sd.capMin;
      // Same idea for forward momentum: keep a tiny floor so the craft can't freeze in place.
      if (sd.vx < 30) sd.vx = 30;

      // capture logic
      const speedOk = sd.speed < sd.capMax && sd.speed >= sd.capMin;
      if (inWindow && speedOk) {
        sd.captureProgress += sd.capFill * dt;
        if (sd.captureProgress >= 100) {
          sd.captured = true;
        }
      }

      // alerts
      if (sd.speed > sd.capMax + 0.1) showAlert('Warning: High Velocity — Brake!');
      else clearAlert();

      // Success
      if (sd.captured) {
        state.running = false;
        setOverlay('Stage Cleared', 'Captured by lunar gravity. Now in stable lunar orbit.', 'Continue', () => completeStage(3), 'success');
        return;
      }

      // FAIL: flew past the entire capture window without being captured
      if (sd.x > sd.captureWindowX[1] + 40) {
        // If they made meaningful progress, give them the win — they were close enough
        if (sd.captureProgress >= 70) {
          state.running = false;
          setOverlay('Stage Cleared', 'Just captured — barely inside lunar orbit. Excellent work.', 'Continue', () => completeStage(3), 'success');
          return;
        }
        return failStage('Flew past the Moon without enough braking. Hold ↑ inside the green window.');
      }
      if (sd.x > W + 40) {
        return failStage('Spacecraft overshot the Moon and escaped into deep space.');
      }

      // draw
      clearCanvas();
      // moon (right side)
      const mx = W * 0.78, my = H / 2;
      const mg = ctx.createRadialGradient(mx - 12, my - 12, 4, mx, my, 90);
      mg.addColorStop(0, '#e0e6f0');
      mg.addColorStop(0.7, '#9aa6bc');
      mg.addColorStop(1, '#5a667a');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, 90, 0, Math.PI * 2); ctx.fill();
      // craters
      ctx.fillStyle = 'rgba(50,60,80,0.4)';
      [[-30,-20,12],[20,30,8],[-10,40,6],[40,-10,10],[10,-40,7]].forEach(([dx,dy,r]) => {
        ctx.beginPath(); ctx.arc(mx+dx, my+dy, r, 0, Math.PI*2); ctx.fill();
      });

      // capture window
      ctx.fillStyle = 'rgba(109, 255, 176, 0.08)';
      ctx.fillRect(sd.captureWindowX[0], 0, sd.captureWindowX[1] - sd.captureWindowX[0], H);
      ctx.strokeStyle = '#6dffb0';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(sd.captureWindowX[0], 0); ctx.lineTo(sd.captureWindowX[0], H);
      ctx.moveTo(sd.captureWindowX[1], 0); ctx.lineTo(sd.captureWindowX[1], H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6dffb0';
      ctx.font = '10px monospace';
      ctx.fillText('CAPTURE WINDOW', sd.captureWindowX[0] + 6, 16);

      // spacecraft
      drawLander(sd.x, sd.y, -Math.PI / 2, sd.braking);

      // hud
      const speedColor = speedOk ? '#6dffb0' : (sd.speed > sd.capMax ? '#ff8a8a' : '#ffd76d');
      ctx.fillStyle = speedColor;
      ctx.font = '12px monospace';
      ctx.fillText(`Speed: ${sd.speed.toFixed(2)} km/s   Safe: ${sd.capMin.toFixed(1)}–${sd.capMax.toFixed(1)}`, 16, 24);
      ctx.fillStyle = '#9fd1ff';
      ctx.fillText(`Capture: ${Math.round(sd.captureProgress)}%`, 16, 44);
      ctx.fillStyle = '#7da7d8';
      ctx.fillText('Hold ↑ to brake — stop when speed turns GREEN', 16, H - 16);

      // capture progress bar
      ctx.fillStyle = 'rgba(120,180,255,0.15)';
      ctx.fillRect(W - 220, 16, 200, 10);
      ctx.fillStyle = '#6dffb0';
      ctx.fillRect(W - 220, 16, 200 * (sd.captureProgress / 100), 10);

      updateStats(3);
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }

  // ============================================================
  // STAGE 5 — FINAL DESCENT
  // ============================================================
  function startStage5() {
    const d = D();
    const padW = d.descentPadW;
    const sd = state.stageData = {
      x: W / 2 - padW / 2 + Math.random() * padW * 0.4,
      y: 80,
      vx: 6,
      vy: 3,
      angle: 0,
      angleVel: 0,
      fuel: d.descentFuel,
      maxFuel: d.descentFuel,
      altitude: 0,
      thrusting: false,
      groundY: H - 60,
      landingPad: { x: W / 2 - padW / 2, w: padW },
      gravity: d.descentGravity,
      softV: d.descentSoftV,
      uprightLimit: d.descentUprightLimit,
    };

    let last = performance.now();
    let warningTimer = 0;

    function loop(now) {
      if (!state.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // controls — very gentle rotation, strong damping, tight clamp
      if (state.keys['ArrowLeft']) sd.angleVel -= 0.6 * dt;
      if (state.keys['ArrowRight']) sd.angleVel += 0.6 * dt;
      sd.angleVel *= 0.82;
      sd.angle += sd.angleVel * dt;
      // AUTO-STABILIZE when near ground (final descent assist)
      if (sd.altitude < 80) {
        sd.angle += (-sd.angle) * 4 * dt;   // snap to vertical
        sd.angleVel *= 0.3;
      }
      // tighter tilt clamp so the lander can't flip wildly
      const angleMax = 0.55;
      if (sd.angle > angleMax) { sd.angle = angleMax; sd.angleVel = 0; }
      if (sd.angle < -angleMax) { sd.angle = -angleMax; sd.angleVel = 0; }

      sd.thrusting = !!state.keys['ArrowUp'] && sd.fuel > 0;
      if (sd.thrusting) {
        sd.fuel -= 8 * dt;
        const tx = Math.sin(sd.angle) * 38 * dt;
        const ty = -Math.cos(sd.angle) * 38 * dt;
        sd.vx += tx;
        sd.vy += ty;
        if (!Sound.thrustOn) { Sound.startThrust(); Sound.thrustOn = true; }
      } else {
        if (Sound.thrustOn) { Sound.stopThrust(); Sound.thrustOn = false; }
      }

      // gravity
      sd.vy += sd.gravity * dt;
      sd.x += sd.vx * dt;
      sd.y += sd.vy * dt;

      // walls
      if (sd.x < 14) { sd.x = 14; sd.vx = Math.abs(sd.vx) * 0.4; }
      if (sd.x > W - 14) { sd.x = W - 14; sd.vx = -Math.abs(sd.vx) * 0.4; }

      // FAIL: flew off the top of the screen — show retry immediately
      if (sd.y < -30) {
        return failStage('Lander flew off the screen. Use shorter taps on ↑ to control altitude.');
      }

      sd.altitude = Math.max(0, sd.groundY - sd.y - 22);

      // warnings
      warningTimer -= dt;
      if (sd.vy > 4 && sd.altitude < 200) {
        showAlert('Warning: High Velocity');
        if (warningTimer <= 0) { Sound.warning(); warningTimer = 0.5; }
      } else if (Math.abs(sd.angle) > 0.4 && sd.altitude < 250) {
        showAlert('Warning: Stabilize Lander');
      } else {
        clearAlert();
      }

      // fuel out warning
      if (sd.fuel <= 0 && sd.altitude > 0) {
        showAlert('Warning: Fuel Depleted');
      }

      // touchdown
      if (sd.y + 22 >= sd.groundY) {
        sd.y = sd.groundY - 22;
        Sound.stopThrust();
        Sound.thrustOn = false;
        const onPad = sd.x > sd.landingPad.x && sd.x < sd.landingPad.x + sd.landingPad.w;
        const softV = sd.vy < sd.softV;
        const upright = Math.abs(sd.angle) < sd.uprightLimit;

        if (softV && upright && onPad) {
          state.running = false;
          setOverlay('Touchdown!', 'Astra Lander has soft-landed on the lunar surface.', 'View Mission Report', () => completeStage(4), 'success');
          return;
        } else {
          let reason = 'The lander struck the surface too hard.';
          if (!onPad) reason = 'Missed the landing pad.';
          else if (!upright) reason = 'The lander toppled on touchdown.';
          else if (!softV) reason = 'Vertical speed exceeded safe limit.';
          return failStage(reason);
        }
      }

      // draw
      clearCanvas();

      // lunar terrain
      ctx.fillStyle = '#3a3f4a';
      ctx.beginPath();
      ctx.moveTo(0, sd.groundY);
      ctx.lineTo(0, H);
      ctx.lineTo(W, H);
      ctx.lineTo(W, sd.groundY);
      // add bumps
      for (let i = W; i >= 0; i -= 30) {
        const bump = Math.sin(i * 0.05) * 6;
        ctx.lineTo(i, sd.groundY + bump);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7d8aa0';
      ctx.beginPath();
      ctx.moveTo(0, sd.groundY);
      for (let i = 0; i <= W; i += 30) {
        const bump = Math.sin(i * 0.05) * 6;
        ctx.lineTo(i, sd.groundY + bump);
      }
      ctx.stroke();

      // landing pad
      ctx.fillStyle = '#6dffb0';
      ctx.fillRect(sd.landingPad.x, sd.groundY - 4, sd.landingPad.w, 4);
      ctx.strokeStyle = '#6dffb0';
      ctx.beginPath();
      ctx.moveTo(sd.landingPad.x, sd.groundY - 4); ctx.lineTo(sd.landingPad.x, sd.groundY - 16);
      ctx.moveTo(sd.landingPad.x + sd.landingPad.w, sd.groundY - 4); ctx.lineTo(sd.landingPad.x + sd.landingPad.w, sd.groundY - 16);
      ctx.stroke();
      ctx.fillStyle = '#6dffb0';
      ctx.font = '10px monospace';
      ctx.fillText('LZ', sd.landingPad.x + sd.landingPad.w/2 - 6, sd.groundY - 22);

      // distant earth
      ctx.fillStyle = 'rgba(95,176,255,0.3)';
      ctx.beginPath(); ctx.arc(80, 80, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(95,176,255,0.5)';
      ctx.beginPath(); ctx.arc(80, 80, 22, 0, Math.PI * 2); ctx.stroke();

      drawLander(sd.x, sd.y, sd.angle, sd.thrusting);

      // hud (top-right)
      ctx.fillStyle = 'rgba(10,21,48,0.7)';
      ctx.fillRect(W - 180, 12, 168, 84);
      ctx.strokeStyle = 'rgba(120,180,255,0.3)';
      ctx.strokeRect(W - 180, 12, 168, 84);
      ctx.fillStyle = '#9fd1ff';
      ctx.font = '11px monospace';
      ctx.fillText(`ALT: ${Math.round(sd.altitude)} m`, W - 170, 30);
      ctx.fillStyle = sd.vy > 2 ? '#ff5a5a' : sd.vy > 1.2 ? '#ffb84a' : '#9fd1ff';
      ctx.fillText(`V-VEL: ${sd.vy.toFixed(2)} m/s`, W - 170, 48);
      ctx.fillStyle = '#9fd1ff';
      ctx.fillText(`H-VEL: ${sd.vx.toFixed(2)} m/s`, W - 170, 66);
      // fuel bar
      ctx.fillText('FUEL', W - 170, 84);
      ctx.fillStyle = 'rgba(120,180,255,0.15)';
      ctx.fillRect(W - 130, 76, 110, 10);
      const fuelRatio = Math.max(0, sd.fuel / sd.maxFuel);
      ctx.fillStyle = fuelRatio < 0.2 ? '#ff5a5a' : fuelRatio < 0.4 ? '#ffb84a' : '#6dffb0';
      ctx.fillRect(W - 130, 76, 110 * fuelRatio, 10);

      updateStats(4);
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }

  // ---------- INPUT ----------
  function initInput() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space',' '].includes(e.key) || e.code === 'Space') {
        e.preventDefault();
      }
      const k = e.code === 'Space' ? 'Space' : e.key;
      state.keys[k] = true;
    });
    window.addEventListener('keyup', e => {
      const k = e.code === 'Space' ? 'Space' : e.key;
      state.keys[k] = false;
    });

    // touch buttons
    document.querySelectorAll('.touch-btn').forEach(btn => {
      const k = btn.dataset.key;
      const press = (e) => { e.preventDefault(); state.keys[k] = true; };
      const release = (e) => { e.preventDefault(); state.keys[k] = false; };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    });
  }

  // ---------- MUTE ----------
  function initMute() {
  const btn = document.getElementById('muteBtn');
  const icon = document.getElementById('muteIcon');

  btn.addEventListener('click', () => {
    // 🔁 toggle state
    state.soundOn = !state.soundOn;

    // 🔊 apply mute/unmute
    Sound.setMuted(!state.soundOn);

    // 🎛 update UI
    icon.textContent = state.soundOn ? 'SOUND ON' : 'SOUND OFF';
  });
}

  // ---------- DIFFICULTY UI ----------
  function updateDiffBadge() {
    const badge = document.getElementById('diffBadge');
    if (!badge) return;
    badge.textContent = D().label;
    badge.classList.remove('easy', 'hard');
    if (state.difficulty === 'easy') badge.classList.add('easy');
    if (state.difficulty === 'hard') badge.classList.add('hard');
  }

  function initDifficulty() {
    const opts = document.getElementById('difficultyOptions');
    if (!opts) return;
    opts.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.diff;
        if (!DIFFICULTY[diff] || diff === state.difficulty) return;
        Sound.blip(620, 0.06);
        state.difficulty = diff;
        opts.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
        updateDiffBadge();
        // Stop any running stage and fully reset progress + timing for a fair score
        if (state.running) {
          state.running = false;
          Sound.stopThrust();
          if (state.rafId) cancelAnimationFrame(state.rafId);
        }
        state.completed = [false, false, false, false, false];
        state.currentStage = 0;
        resetMissionTiming();
        hideClock();
        document.getElementById('final').classList.add('hidden');
        renderStageSelector();
        renderStoryGrid();
        loadStage(0);
      });
    });
    updateDiffBadge();
  }

  // ---------- REPLAY ----------
  function initReplay() {
    document.getElementById('replayBtn').addEventListener('click', () => {
      Sound.blip(520, 0.06);
      state.completed = [false, false, false, false, false];
      state.currentStage = 0;
      resetMissionTiming();
      document.getElementById('final').classList.add('hidden');
      renderStageSelector();
      renderStoryGrid();
      loadStage(0);
      document.getElementById('simulation').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', () => {
    runLoader();
    initStarfield();
    initScrollLinks();
    initInput();
    initMute();
    initDifficulty();
    initReplay();
    renderStageSelector();
    renderStoryGrid();
    loadStage(0);

    // start ambient on first interaction (browser autoplay policy)
    const startAudio = () => {
      Sound.ensure();
      Sound.startAmbient();
      window.removeEventListener('click', startAudio);
      window.removeEventListener('keydown', startAudio);
      window.removeEventListener('touchstart', startAudio);
    };
    window.addEventListener('click', startAudio);
    window.addEventListener('keydown', startAudio);
    window.addEventListener('touchstart', startAudio);
  });

})();
