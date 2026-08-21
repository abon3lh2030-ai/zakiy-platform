// ---------- مؤقت بومودورو (وضع فردي بس) ----------
let pomodoroIntervalId = null;
let pomodoroRemaining = 25 * 60; // بالثواني
let pomodoroPhase = 'focus'; // 'focus' | 'break'
let pomodoroRunning = false;

function pomodoroDurations() {
  const focusMin = Math.max(1, parseInt(document.getElementById('pomodoroFocusInput').value, 10) || 25);
  const breakMin = Math.max(1, parseInt(document.getElementById('pomodoroBreakInput').value, 10) || 5);
  return { focus: focusMin * 60, break: breakMin * 60 };
}

function updatePomodoroDisplay() {
  document.getElementById('pomodoroTimeDisplay').textContent = formatTime(pomodoroRemaining);
  const label = document.getElementById('pomodoroPhaseLabel');
  label.textContent = t(pomodoroPhase === 'focus' ? 'pomodoro_phase_focus' : 'pomodoro_phase_break');
  label.classList.toggle('break', pomodoroPhase === 'break');
}

// نغمة تنبيه بسيطة بدون ملف صوت خارجي - Web Audio API
function playPomodoroSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.5].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.35);
    });
  } catch (err) { /* المتصفح ما يدعم Web Audio - نتجاهل بصمت */ }
}

function showPomodoroAlert() {
  const wasFocus = pomodoroPhase === 'focus';
  document.getElementById('pomodoroAlertText').textContent = t(wasFocus ? 'pomodoro_focus_done' : 'pomodoro_break_done');
  document.getElementById('pomodoroNextBtn').textContent = t(wasFocus ? 'btn_pomodoro_start_break' : 'btn_pomodoro_start_focus');
  show('pomodoroAlert');
}

function pomodoroTick() {
  pomodoroRemaining--;
  if (pomodoroRemaining <= 0) {
    clearInterval(pomodoroIntervalId);
    pomodoroIntervalId = null;
    pomodoroRunning = false;
    updatePomodoroDisplay();
    document.getElementById('pomodoroStartBtn').classList.remove('hidden');
    document.getElementById('pomodoroPauseBtn').classList.add('hidden');
    playPomodoroSound();
    showPomodoroAlert();
    return;
  }
  updatePomodoroDisplay();
}

function pomodoroStart() {
  if (pomodoroRunning) return;
  pomodoroRunning = true;
  hide('pomodoroAlert');
  document.getElementById('pomodoroStartBtn').classList.add('hidden');
  document.getElementById('pomodoroPauseBtn').classList.remove('hidden');
  pomodoroIntervalId = setInterval(pomodoroTick, 1000);
}

function pomodoroPause() {
  pomodoroRunning = false;
  clearInterval(pomodoroIntervalId);
  pomodoroIntervalId = null;
  document.getElementById('pomodoroStartBtn').classList.remove('hidden');
  document.getElementById('pomodoroPauseBtn').classList.add('hidden');
}

function pomodoroReset() {
  pomodoroPause();
  pomodoroPhase = 'focus';
  pomodoroRemaining = pomodoroDurations().focus;
  updatePomodoroDisplay();
  hide('pomodoroAlert');
}

function pomodoroSwitchPhase() {
  const durations = pomodoroDurations();
  pomodoroPhase = pomodoroPhase === 'focus' ? 'break' : 'focus';
  pomodoroRemaining = durations[pomodoroPhase];
  updatePomodoroDisplay();
  hide('pomodoroAlert');
  pomodoroStart();
}

document.getElementById('pomodoroStartBtn').addEventListener('click', pomodoroStart);
document.getElementById('pomodoroPauseBtn').addEventListener('click', pomodoroPause);
document.getElementById('pomodoroResetBtn').addEventListener('click', pomodoroReset);
document.getElementById('pomodoroNextBtn').addEventListener('click', pomodoroSwitchPhase);
document.getElementById('pomodoroDismissBtn').addEventListener('click', () => hide('pomodoroAlert'));

// تعديل مدة المذاكرة/الراحة يدويًا (بس إذا المؤقت واقف على نفس المرحلة) ينعكس فورًا
document.getElementById('pomodoroFocusInput').addEventListener('change', () => {
  if (!pomodoroRunning && pomodoroPhase === 'focus') {
    pomodoroRemaining = pomodoroDurations().focus;
    updatePomodoroDisplay();
  }
});
document.getElementById('pomodoroBreakInput').addEventListener('change', () => {
  if (!pomodoroRunning && pomodoroPhase === 'break') {
    pomodoroRemaining = pomodoroDurations().break;
    updatePomodoroDisplay();
  }
});

document.getElementById('pomodoroHeader').addEventListener('click', () => {
  const widget = document.getElementById('pomodoroWidget');
  widget.classList.toggle('collapsed');
  document.getElementById('pomodoroToggleBtn').textContent = widget.classList.contains('collapsed') ? '+' : '−';
});

updatePomodoroDisplay();

