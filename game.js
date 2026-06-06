/* ═══════════════════════════════════════════════════════
   SIMON SAYS — Enhanced Game Logic
   Features: Sound (Web Audio API), Difficulty, Leaderboard,
             Streak, Combo, Progress Ring, Particles
═══════════════════════════════════════════════════════ */

// ── DOM refs ────────────────────────────────────────────
const pads        = document.querySelectorAll('.pad');
const levelDisp   = document.getElementById('level-display');
const bestDisp    = document.getElementById('best-display');
const statusMsg   = document.getElementById('status-msg');
const startBtn    = document.getElementById('start-btn');
const ringFill    = document.getElementById('ring-fill');
const comboDisp   = document.getElementById('combo-display');
const streakVal   = document.getElementById('streak-val');
const diffRow     = document.getElementById('difficulty-row');
const soundToggle = document.getElementById('sound-toggle');
const lbBtn       = document.getElementById('leaderboard-btn');
const modalOv     = document.getElementById('modal-overlay');
const modalClose  = document.getElementById('modal-close');
const lbList      = document.getElementById('lb-list');
const lbTabs      = document.querySelectorAll('.lb-tab');
const clearBtn    = document.getElementById('clear-scores');
const goOverlay   = document.getElementById('gameover-overlay');
const goScore     = document.getElementById('go-score');
const goBest      = document.getElementById('go-best');
const goBestWrap  = document.getElementById('go-best-wrap');
const goStreak    = document.getElementById('go-streak');
const goRestart   = document.getElementById('go-restart');
const boardEl     = document.querySelector('.board');
const canvas      = document.getElementById('particles');
const ctx         = canvas.getContext('2d');

// ── Game state ──────────────────────────────────────────
const COLORS  = ['red', 'blue', 'green', 'yellow'];
let gameSeq   = [];
let userSeq   = [];
let level     = 0;
let started   = false;
let accepting = false;   // true when player can press
let streak    = 0;
let combo     = 0;
let soundOn   = true;
let currentDiff = 'easy';

const DIFFICULTY = {
  easy:   { speed: 700, flashDur: 400 },
  medium: { speed: 500, flashDur: 300 },
  hard:   { speed: 320, flashDur: 200 },
};

// ── Audio (Web Audio API) ───────────────────────────────
let audioCtx;
const PAD_FREQ = { red: 261.6, blue: 329.6, green: 392, yellow: 523.3 };

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(color, duration = 250) {
  if (!soundOn) return;
  ensureAudio();
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.value = PAD_FREQ[color];
  gain.gain.setValueAtTime(.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration / 1000);
  osc.start();
  osc.stop(audioCtx.currentTime + duration / 1000);
}

function playError() {
  if (!soundOn) return;
  ensureAudio();
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + .4);
  gain.gain.setValueAtTime(.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .4);
  osc.start();
  osc.stop(audioCtx.currentTime + .45);
}

function playSuccess() {
  if (!soundOn) return;
  ensureAudio();
  [523.3, 659.3, 783.9].forEach((freq, i) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(.25, audioCtx.currentTime + i * .1);
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + i * .1 + .25);
    osc.start(audioCtx.currentTime + i * .1);
    osc.stop(audioCtx.currentTime + i * .1 + .3);
  });
}

// ── Leaderboard (localStorage) ──────────────────────────
function getScores(diff) {
  return JSON.parse(localStorage.getItem(`simon_scores_${diff}`) || '[]');
}
function saveScore(diff, score) {
  const scores = getScores(diff);
  scores.push({ score, date: new Date().toLocaleDateString() });
  scores.sort((a, b) => b.score - a.score);
  scores.splice(10); // keep top 10
  localStorage.setItem(`simon_scores_${diff}`, JSON.stringify(scores));
}
function getBest(diff) {
  const scores = getScores(diff);
  return scores.length ? scores[0].score : 0;
}

function renderLeaderboard(diff) {
  lbTabs.forEach(t => t.classList.toggle('active', t.dataset.diff === diff));
  const scores = getScores(diff);
  if (!scores.length) {
    lbList.innerHTML = '<li class="lb-empty">No scores yet!</li>';
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  lbList.innerHTML = scores.map((s, i) => `
    <li>
      <span class="lb-rank">${medals[i] || (i + 1)}</span>
      <span>${s.date}</span>
      <span class="lb-score">${s.score}</span>
    </li>
  `).join('');
}

lbTabs.forEach(t => t.addEventListener('click', () => renderLeaderboard(t.dataset.diff)));
lbBtn.addEventListener('click', () => {
  renderLeaderboard(currentDiff);
  modalOv.classList.add('visible');
});
modalClose.addEventListener('click', () => modalOv.classList.remove('visible'));
modalOv.addEventListener('click', e => { if (e.target === modalOv) modalOv.classList.remove('visible'); });
clearBtn.addEventListener('click', () => {
  const activeTab = document.querySelector('.lb-tab.active');
  if (activeTab) {
    localStorage.removeItem(`simon_scores_${activeTab.dataset.diff}`);
    renderLeaderboard(activeTab.dataset.diff);
  }
});

// ── Difficulty buttons ──────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (started) return;
    currentDiff = btn.dataset.diff;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bestDisp.textContent = getBest(currentDiff) || 0;
  });
});

// ── Sound toggle ────────────────────────────────────────
soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  soundToggle.textContent = soundOn ? '🔊' : '🔇';
});

// ── Progress ring ────────────────────────────────────────
const RING_CIRC = 213.6;
function setRing(progress) { // 0..1
  ringFill.style.strokeDashoffset = RING_CIRC * (1 - progress);
}
function pulseRing(color) {
  const colors = { red: '#ff2d5a', blue: '#2d7fff', green: '#00e676', yellow: '#ffe600' };
  ringFill.style.stroke = colors[color];
}

// ── Flash pad ────────────────────────────────────────────
function flashPad(color, duration) {
  return new Promise(resolve => {
    const pad = document.getElementById(`pad-${color}`);
    pad.classList.add(`flash-${color}`);
    playTone(color, duration * .9);
    setTimeout(() => {
      pad.classList.remove(`flash-${color}`);
      setTimeout(resolve, 60);
    }, duration);
  });
}

// ── Play the game sequence ───────────────────────────────
async function playSequence() {
  accepting = false;
  statusMsg.textContent = 'WATCH...';
  const { speed, flashDur } = DIFFICULTY[currentDiff];
  const delay = Math.max(speed - level * 8, 220);

  setRing(0);

  for (let i = 0; i < gameSeq.length; i++) {
    const color = gameSeq[i];
    pulseRing(color);
    setRing((i + 1) / gameSeq.length);
    await flashPad(color, flashDur);
    await wait(delay - flashDur - 60);
  }

  accepting = true;
  userSeq = [];
  statusMsg.textContent = 'YOUR TURN!';
  setRing(0);
}

// ── Level up ─────────────────────────────────────────────
function levelUp() {
  level++;
  levelDisp.textContent = level;
  gameSeq.push(COLORS[Math.floor(Math.random() * 4)]);
  if (level % 5 === 0) playSuccess();
  setTimeout(playSequence, 800);
}

// ── Check answer ─────────────────────────────────────────
function checkAnswer(color) {
  if (!accepting) return;

  const idx = userSeq.length - 1;
  const pad = document.getElementById(`pad-${color}`);

  if (userSeq[idx] !== gameSeq[idx]) {
    // Wrong!
    accepting = false;
    playError();
    boardEl.classList.add('shake');
    setTimeout(() => boardEl.classList.remove('shake'), 450);

    statusMsg.textContent = 'WRONG!';

    // Save score
    if (level > 1) {
      const prev = getBest(currentDiff);
      saveScore(currentDiff, level);
      const newBest = getBest(currentDiff);
      bestDisp.textContent = newBest;

      goScore.textContent  = level;
      goStreak.textContent = streak;
      goBestWrap.classList.toggle('show', newBest > prev);
      goBest.textContent = newBest;
      goOverlay.classList.add('visible');
    }

    // Reset
    streak = 0;
    streakVal.textContent = 0;
    combo = 0;
    comboDisp.textContent = '';
    started = false;
    level = 0;
    gameSeq = [];
    userSeq = [];
    diffRow.classList.remove('hidden');
    startBtn.style.display = '';
    return;
  }

  // Correct press visual feedback
  pad.classList.add(`flash-${color}`);
  setTimeout(() => pad.classList.remove(`flash-${color}`), 120);

  // Completed sequence?
  if (userSeq.length === gameSeq.length) {
    accepting = false;
    streak++;
    combo++;
    streakVal.textContent = streak;
    statusMsg.textContent = 'NICE! ✓';
    showCombo();

    // ring fill
    setRing(1);
    setTimeout(levelUp, 900);
  } else {
    // Update ring progress as user goes
    setRing(userSeq.length / gameSeq.length);
  }
}

// ── Combo display ────────────────────────────────────────
const COMBO_MSGS = ['GOOD!','GREAT!','AWESOME!','PERFECT!','INSANE!','GODLIKE!'];
function showCombo() {
  if (combo < 2) { comboDisp.textContent = ''; return; }
  const msg = COMBO_MSGS[Math.min(combo - 2, COMBO_MSGS.length - 1)];
  comboDisp.textContent = `${combo}x ${msg}`;
  comboDisp.classList.remove('combo-pop');
  void comboDisp.offsetWidth; // reflow
  comboDisp.classList.add('combo-pop');
}

// ── Pad input ────────────────────────────────────────────
pads.forEach(pad => {
  const color = pad.dataset.color;
  const press = () => {
    if (!accepting) return;
    playTone(color, 120);
    userSeq.push(color);
    checkAnswer(color);
  };
  pad.addEventListener('click', press);
  pad.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
});

// ── Start / restart ──────────────────────────────────────
function startGame() {
  ensureAudio();
  started   = true;
  level     = 0;
  gameSeq   = [];
  userSeq   = [];
  combo     = 0;
  comboDisp.textContent = '';
  statusMsg.textContent = 'GET READY...';
  levelDisp.textContent = '—';
  diffRow.classList.add('hidden');
  startBtn.style.display = 'none';
  goOverlay.classList.remove('visible');
  setRing(0);
  setTimeout(levelUp, 600);
}

startBtn.addEventListener('click', startGame);
goRestart.addEventListener('click', startGame);
document.addEventListener('keydown', e => {
  if (!started && e.key !== 'Tab') startGame();
});

// Update best display on load
bestDisp.textContent = getBest(currentDiff) || 0;

// ── Utility ──────────────────────────────────────────────
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Particle background ──────────────────────────────────
const particles = [];
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

for (let i = 0; i < 60; i++) {
  particles.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.5 + .3,
    dx: (Math.random() - .5) * .3,
    dy: (Math.random() - .5) * .3,
    a: Math.random(),
  });
}

function animParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.dx; p.y += p.dy;
    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width) p.x = 0;
    if (p.y < 0) p.y = canvas.height;
    if (p.y > canvas.height) p.y = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,255,231,${p.a * .6})`;
    ctx.fill();
  });
  requestAnimationFrame(animParticles);
}
animParticles();
