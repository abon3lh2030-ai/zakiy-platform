// ============================================================================
// ---------- معمل الروبوتات - محاكي دوائر أردوينو (زي Tinkercad Circuits) ----------
// تصميم مبسّط عن قصد: بدل محاكاة كهربائية حقيقية (قوانين كيرشوف) نستخدم
// نموذج "شبكة اتصال" - كل سلك يربط طرفين، والمقاومة تُعامل كموصّل (passthrough)
// بالنسبة لحساب الاتصال بس (مو حساب فرق جهد حقيقي) - كافي تمامًا لأغراض
// تعليمية (LED يضوي / زر / بوتنشيومتر / سيرفو / بازر) بدون تعقيد غير لازم.
// الكود اللي يكتبه المستخدم "شبه-أردوينو" - JS حقيقي تحت الغطاء مع تحويل بسيط
// (regex) لأنماط C++ الشائعة (void setup()، أنواع المتغيرات، Servo x;) عشان
// يقرب لأردوينو الحقيقي بدون بناء مترجم C++ كامل.
// ============================================================================

const RL_PIN_TOP = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13'];
const RL_PIN_BOTTOM = ['GND', '5V', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const RL_PWM_PINS = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
const RL_BOARD_W = 300, RL_BOARD_H = 170;

// ---------- تعريف أنواع القطع: pins نسبية لموقع القطعة (dx, dy) + الرسم ----------
const RL_PART_DEFS = {
  arduino: {
    labelKey: 'rl_part_arduino', icon: '🔷', w: RL_BOARD_W, h: RL_BOARD_H, removable: false,
    pins() {
      const pins = [];
      RL_PIN_TOP.forEach((name, i) => pins.push({ name, dx: 20 + i * ((RL_BOARD_W - 40) / (RL_PIN_TOP.length - 1)), dy: 0, role: 'io' }));
      RL_PIN_BOTTOM.forEach((name, i) => pins.push({ name, dx: 20 + i * ((RL_BOARD_W - 40) / (RL_PIN_BOTTOM.length - 1)), dy: RL_BOARD_H, role: name === 'GND' ? 'gnd' : (name === '5V' ? 'vcc' : 'io') }));
      return pins;
    },
    render(c) {
      return `
        <div class="rl-board">
          <div class="rl-board-label">ARDUINO UNO</div>
          <div class="rl-board-usb"></div>
        </div>
      `;
    },
  },
  led: {
    labelKey: 'rl_part_led', icon: '💡', w: 40, h: 60, removable: true,
    defaultProps: { color: 'red' },
    pins() { return [{ name: 'A', dx: 12, dy: 60, role: 'anode' }, { name: 'C', dx: 28, dy: 60, role: 'cathode' }]; },
    render(c) {
      const brightness = c.state.lit || 0;
      const glowOpacity = brightness / 255;
      const filter = brightness > 0 ? `brightness(${0.55 + (brightness / 255) * 0.65})` : 'brightness(.55) saturate(.7)';
      const glowColors = { red: '#ff4d4d', green: '#4dff88', blue: '#4d9dff', yellow: '#ffe14d' };
      const glowColor = glowColors[c.props.color] || '#ffffff';
      return `<div class="rl-led-bulb rl-led-${c.props.color}" data-lit="${brightness > 0 ? 1 : 0}" style="filter:${filter};">
                <div class="rl-led-glow" style="opacity:${glowOpacity}; box-shadow: 0 0 18px 8px ${glowColor};"></div>
              </div>
              <div class="rl-led-legs"></div>`;
    },
  },
  resistor: {
    labelKey: 'rl_part_resistor', icon: '🟫', w: 60, h: 24, removable: true,
    defaultProps: { ohms: 220 },
    pins() { return [{ name: '1', dx: 0, dy: 12, role: 'passthrough' }, { name: '2', dx: 60, dy: 12, role: 'passthrough' }]; },
    render(c) { return `<div class="rl-resistor-body"><span>${c.props.ohms}Ω</span></div>`; },
  },
  button: {
    labelKey: 'rl_part_button', icon: '🔘', w: 46, h: 46, removable: true,
    pins() { return [{ name: '1', dx: 6, dy: 46, role: 'passthrough' }, { name: '2', dx: 40, dy: 46, role: 'passthrough' }]; },
    render(c) { return `<div class="rl-button-cap ${c.state && c.state.pressed ? 'pressed' : ''}"></div>`; },
  },
  potentiometer: {
    labelKey: 'rl_part_potentiometer', icon: '🎛️', w: 60, h: 60, removable: true,
    pins() { return [{ name: 'GND', dx: 0, dy: 60, role: 'gnd' }, { name: 'OUT', dx: 30, dy: 60, role: 'pot-out' }, { name: 'VCC', dx: 60, dy: 60, role: 'vcc' }]; },
    render(c) {
      const angle = -135 + ((c.state.value || 0) / 1023) * 270;
      return `<div class="rl-pot-body"><div class="rl-pot-knob" style="transform:rotate(${angle}deg)"></div></div>`;
    },
  },
  servo: {
    labelKey: 'rl_part_servo', icon: '⚙️', w: 60, h: 50, removable: true,
    pins() { return [{ name: 'GND', dx: 8, dy: 50, role: 'gnd' }, { name: 'SIG', dx: 30, dy: 50, role: 'servo-sig' }, { name: 'VCC', dx: 52, dy: 50, role: 'vcc' }]; },
    render(c) {
      const angle = (c.state.angle ?? 90) - 90;
      return `<div class="rl-servo-body"><div class="rl-servo-arm" style="transform:rotate(${angle}deg)"></div></div>`;
    },
  },
  buzzer: {
    labelKey: 'rl_part_buzzer', icon: '🔊', w: 44, h: 44, removable: true,
    pins() { return [{ name: '+', dx: 12, dy: 44, role: 'buzzer-sig' }, { name: '-', dx: 32, dy: 44, role: 'gnd' }]; },
    render(c) { return `<div class="rl-buzzer-body ${c.state && c.state.on ? 'on' : ''}"><span class="rl-buzzer-wave"></span></div>`; },
  },
};

const RL_EXAMPLES = {
  blink: {
    nameKey: 'rl_example_blink',
    components: [
      { type: 'arduino', x: 40, y: 40 },
      { type: 'resistor', x: 400, y: 60, props: { ohms: 220 } },
      { type: 'led', x: 470, y: 40, props: { color: 'red' } },
    ],
    wireDefs: [['arduino', 'D13', 'resistor', '1'], ['resistor', '2', 'led', 'A'], ['led', 'C', 'arduino', 'GND']],
    code: `function setup() {\n  pinMode(13, OUTPUT);\n}\n\nfunction loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n`,
    blocksSetup: [{ type: 'pinMode', pin: 'D13', mode: 'OUTPUT' }],
    blocksLoop: [
      { type: 'digitalWrite', pin: 'D13', value: 'HIGH' }, { type: 'delay', ms: 500 },
      { type: 'digitalWrite', pin: 'D13', value: 'LOW' }, { type: 'delay', ms: 500 },
    ],
  },
  button_led: {
    nameKey: 'rl_example_button_led',
    components: [
      { type: 'arduino', x: 40, y: 40 },
      { type: 'button', x: 400, y: 140 },
      { type: 'resistor', x: 400, y: 60, props: { ohms: 220 } },
      { type: 'led', x: 470, y: 40, props: { color: 'green' } },
    ],
    wireDefs: [
      ['arduino', 'D13', 'resistor', '1'], ['resistor', '2', 'led', 'A'], ['led', 'C', 'arduino', 'GND'],
      ['arduino', 'D2', 'button', '1'], ['button', '2', 'arduino', 'GND'],
    ],
    code: `function setup() {\n  pinMode(13, OUTPUT);\n  pinMode(2, INPUT_PULLUP);\n}\n\nfunction loop() {\n  if (digitalRead(2) == LOW) {\n    digitalWrite(13, HIGH);\n  } else {\n    digitalWrite(13, LOW);\n  }\n}\n`,
    blocksSetup: [{ type: 'pinMode', pin: 'D13', mode: 'OUTPUT' }, { type: 'pinMode', pin: 'D2', mode: 'INPUT_PULLUP' }],
    blocksLoop: [{ type: 'ifElse', condLeft: 'digitalRead(D2)', condOp: '==', condRight: 'LOW', then: [{ type: 'digitalWrite', pin: 'D13', value: 'HIGH' }], otherwise: [{ type: 'digitalWrite', pin: 'D13', value: 'LOW' }] }],
  },
  pot_servo: {
    nameKey: 'rl_example_pot_servo',
    components: [
      { type: 'arduino', x: 40, y: 40 },
      { type: 'potentiometer', x: 400, y: 120 },
      { type: 'servo', x: 500, y: 40 },
    ],
    wireDefs: [['arduino', 'A0', 'potentiometer', 'OUT'], ['arduino', 'D9', 'servo', 'SIG']],
    code: `let myServo = new Servo();\n\nfunction setup() {\n  myServo.attach(9);\n}\n\nfunction loop() {\n  int value = analogRead(A0);\n  int angle = map(value, 0, 1023, 0, 180);\n  myServo.write(angle);\n  delay(15);\n}\n`,
    blocksSetup: [{ type: 'servoAttach', varName: 'myServo', pin: 'D9' }],
    blocksLoop: [{ type: 'servoWriteMapped', varName: 'myServo', pin: 'A0' }, { type: 'delay', ms: 15 }],
  },
};

const RL = {
  components: [], wires: [], nextId: 1, mode: 'blocks', running: false, runId: 0,
  pinState: {}, connecting: null, dragging: null, code: '', blocksSetup: [], blocksLoop: [],
  audioCtx: null, oscillators: {},
};

function rlResetPinState() {
  RL.pinState = {};
  [...RL_PIN_TOP, ...RL_PIN_BOTTOM].forEach(name => {
    RL.pinState[name] = { mode: null, digital: 0, pwm: null, servoAngle: null, toneFreq: null };
  });
}

function rlNewProject() {
  RL.components = [{ id: RL.nextId++, type: 'arduino', x: 40, y: 40, props: {}, state: {} }];
  RL.wires = [];
  RL.blocksSetup = [];
  RL.blocksLoop = [];
  RL.code = 'function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n';
  rlResetPinState();
  rlStopExecution();
  rlSaveProject();
  rlRenderAll();
}

function rlLoadExample(key) {
  const ex = RL_EXAMPLES[key];
  if (!ex) return;
  RL.components = [];
  RL.nextId = 1;
  const byLocalRef = {};
  ex.components.forEach(cd => {
    const comp = { id: RL.nextId++, type: cd.type, x: cd.x, y: cd.y, props: { ...(RL_PART_DEFS[cd.type].defaultProps || {}), ...(cd.props || {}) }, state: {} };
    RL.components.push(comp);
    if (!byLocalRef[cd.type]) byLocalRef[cd.type] = comp;
  });
  RL.wires = (ex.wireDefs || []).map(([t1, p1, t2, p2]) => ({
    id: RL.nextId++, fromComp: byLocalRef[t1].id, fromPin: p1, toComp: byLocalRef[t2].id, toPin: p2,
  }));
  RL.blocksSetup = JSON.parse(JSON.stringify(ex.blocksSetup || []));
  RL.blocksLoop = JSON.parse(JSON.stringify(ex.blocksLoop || []));
  RL.code = ex.code;
  rlResetPinState();
  rlStopExecution();
  rlSaveProject();
  rlRenderAll();
}

// ---------- تخزين محلي (بدون سيرفر - المشروع يبقى بجهازك بس) ----------
function rlSaveProject() {
  try {
    localStorage.setItem('zakiy_robotics_project', JSON.stringify({
      components: RL.components, wires: RL.wires, mode: RL.mode,
      blocksSetup: RL.blocksSetup, blocksLoop: RL.blocksLoop, code: RL.code,
    }));
  } catch (e) { /* تخزين محلي فاشل (خاص/مساحة ممتلئة) - نتجاهل بصمت */ }
}
function rlLoadSavedOrDefault() {
  try {
    const raw = localStorage.getItem('zakiy_robotics_project');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.components && data.components.length) {
        RL.components = data.components;
        RL.wires = data.wires || [];
        RL.mode = data.mode || 'blocks';
        RL.blocksSetup = data.blocksSetup || [];
        RL.blocksLoop = data.blocksLoop || [];
        RL.code = data.code || 'function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n';
        RL.nextId = Math.max(1, ...RL.components.map(c => c.id + 1), ...RL.wires.map(w => w.id + 1));
        rlResetPinState();
        return;
      }
    }
  } catch (e) { /* بيانات محفوظة تالفة - نبدأ مشروع جديد بدل ما نكسر الصفحة */ }
  rlNewProject();
}

function loadRoboticsLabScreen() {
  if (!RL.components.length) rlLoadSavedOrDefault();
  rlRenderAll();
  document.getElementById('rlModeBlocksBtn').classList.toggle('active', RL.mode === 'blocks');
  document.getElementById('rlModeCodeBtn').classList.toggle('active', RL.mode === 'code');
  document.getElementById('rlBlocksEditor').classList.toggle('hidden', RL.mode !== 'blocks');
  document.getElementById('rlCodeEditorWrap').classList.toggle('hidden', RL.mode !== 'code');
}

// ---------- رسم الكانفس (قطع + أسلاك) ----------
function rlPinAbsPos(comp, pinName) {
  const def = RL_PART_DEFS[comp.type];
  const pin = def.pins().find(p => p.name === pinName);
  if (!pin) return { x: comp.x, y: comp.y };
  return { x: comp.x + pin.dx, y: comp.y + pin.dy };
}

function rlRenderAll() {
  rlRenderCanvas();
  rlRenderWires();
  rlRenderPartsBin();
  if (RL.mode === 'blocks') rlRenderBlocks();
  else document.getElementById('rlCodeTextarea').value = RL.code;
}

function rlRenderPartsBin() {
  const wrap = document.getElementById('rlPartsList');
  wrap.innerHTML = Object.entries(RL_PART_DEFS).filter(([type]) => type !== 'arduino').map(([type, def]) => `
    <button class="rl-part-chip" draggable="true" data-type="${type}" title="${t(def.labelKey)}">
      <span class="rl-part-icon">${def.icon}</span><span class="rl-part-name">${t(def.labelKey)}</span>
    </button>
  `).join('');
  wrap.querySelectorAll('.rl-part-chip').forEach(btn => {
    btn.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/rl-part', btn.dataset.type); });
    btn.addEventListener('click', () => rlAddComponent(btn.dataset.type, 340 + Math.random() * 120, 100 + Math.random() * 100));
  });
}

function rlAddComponent(type, x, y) {
  const def = RL_PART_DEFS[type];
  if (!def) return;
  RL.components.push({ id: RL.nextId++, type, x, y, props: { ...(def.defaultProps || {}) }, state: {} });
  rlSaveProject();
  rlRenderAll();
}

function rlRemoveComponent(id) {
  RL.components = RL.components.filter(c => c.id !== id);
  RL.wires = RL.wires.filter(w => w.fromComp !== id && w.toComp !== id);
  rlSaveProject();
  rlRenderAll();
}

function rlRenderCanvas() {
  const canvas = document.getElementById('rlCanvas');
  canvas.innerHTML = RL.components.map(c => {
    const def = RL_PART_DEFS[c.type];
    const pinsHtml = def.pins().map(p => {
      const isConnecting = RL.connecting && RL.connecting.compId === c.id && RL.connecting.pin === p.name;
      return `<span class="rl-pin ${isConnecting ? 'connecting' : ''}" data-comp="${c.id}" data-pin="${p.name}" style="left:${p.dx}px; top:${p.dy}px;" title="${p.name}"></span>`;
    }).join('');
    return `
      <div class="rl-component rl-type-${c.type}" data-id="${c.id}" style="left:${c.x}px; top:${c.y}px; width:${def.w}px; height:${def.h}px;">
        ${def.removable ? `<button class="rl-comp-remove" data-id="${c.id}" title="${t('btn_remove')}">✕</button>` : ''}
        ${def.render(c)}
        ${pinsHtml}
      </div>
    `;
  }).join('');

  canvas.querySelectorAll('.rl-component').forEach(el => {
    const id = Number(el.dataset.id);
    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('rl-pin') || e.target.classList.contains('rl-comp-remove')) return;
      const comp = RL.components.find(c => c.id === id);
      RL.dragging = { id, offX: e.clientX - comp.x, offY: e.clientY - comp.y };
      e.preventDefault();
    });
    if (el.querySelector('.rl-pot-body')) {
      el.querySelector('.rl-pot-body').addEventListener('mousedown', (e) => { e.stopPropagation(); rlStartPotDrag(id, e); });
    }
    if (el.querySelector('.rl-button-cap')) {
      const btn = el.querySelector('.rl-button-cap');
      const comp = RL.components.find(c => c.id === id);
      const press = (v) => { comp.state.pressed = v; rlRenderCanvas(); };
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); press(true); });
      btn.addEventListener('mouseup', () => press(false));
      btn.addEventListener('mouseleave', () => { if (comp.state.pressed) press(false); });
    }
  });
  canvas.querySelectorAll('.rl-comp-remove').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); rlRemoveComponent(Number(btn.dataset.id)); });
  });
  canvas.querySelectorAll('.rl-pin').forEach(pinEl => {
    pinEl.addEventListener('click', (e) => {
      e.stopPropagation();
      rlHandlePinClick(Number(pinEl.dataset.comp), pinEl.dataset.pin);
    });
  });
}

function rlStartPotDrag(id, e) {
  const move = (ev) => {
    const comp = RL.components.find(c => c.id === id);
    const rect = document.querySelector(`.rl-component[data-id="${id}"] .rl-pot-body`).getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let deg = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
    if (deg < 0) deg += 360;
    let value = Math.round(((Math.min(270, Math.max(0, deg))) / 270) * 1023);
    comp.state.value = value;
    rlRenderCanvas();
  };
  const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); rlSaveProject(); };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function rlHandlePinClick(compId, pinName) {
  if (!RL.connecting) {
    RL.connecting = { compId, pin: pinName };
    rlRenderCanvas();
    return;
  }
  if (RL.connecting.compId === compId && RL.connecting.pin === pinName) {
    RL.connecting = null; rlRenderCanvas(); return;
  }
  const exists = RL.wires.some(w =>
    (w.fromComp === RL.connecting.compId && w.fromPin === RL.connecting.pin && w.toComp === compId && w.toPin === pinName) ||
    (w.toComp === RL.connecting.compId && w.toPin === RL.connecting.pin && w.fromComp === compId && w.fromPin === pinName)
  );
  if (!exists) {
    RL.wires.push({ id: RL.nextId++, fromComp: RL.connecting.compId, fromPin: RL.connecting.pin, toComp: compId, toPin: pinName });
  }
  RL.connecting = null;
  rlSaveProject();
  rlRenderAll();
}

function rlRenderWires() {
  const svg = document.getElementById('rlWiresSvg');
  const paths = RL.wires.map(w => {
    const fromComp = RL.components.find(c => c.id === w.fromComp);
    const toComp = RL.components.find(c => c.id === w.toComp);
    if (!fromComp || !toComp) return '';
    const p1 = rlPinAbsPos(fromComp, w.fromPin), p2 = rlPinAbsPos(toComp, w.toPin);
    const midY = (p1.y + p2.y) / 2;
    return `<path d="M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}" class="rl-wire" data-wire="${w.id}"/>`;
  }).join('');
  svg.innerHTML = paths;
  svg.querySelectorAll('.rl-wire').forEach(path => {
    path.addEventListener('click', () => {
      RL.wires = RL.wires.filter(w => w.id !== Number(path.dataset.wire));
      rlSaveProject();
      rlRenderWires();
    });
  });
}

document.getElementById('rlCanvasWrap').addEventListener('click', (e) => {
  if (RL.connecting && (e.target.id === 'rlCanvasWrap' || e.target.id === 'rlCanvas')) {
    RL.connecting = null;
    rlRenderCanvas();
  }
});
document.getElementById('rlCanvasWrap').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('rlCanvasWrap').addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer.getData('text/rl-part');
  if (!type) return;
  const rect = document.getElementById('rlCanvas').getBoundingClientRect();
  rlAddComponent(type, e.clientX - rect.left - 20, e.clientY - rect.top - 20);
});
document.addEventListener('mousemove', (e) => {
  if (!RL.dragging) return;
  const comp = RL.components.find(c => c.id === RL.dragging.id);
  if (!comp) return;
  comp.x = Math.max(0, e.clientX - RL.dragging.offX);
  comp.y = Math.max(0, e.clientY - RL.dragging.offY);
  rlRenderCanvas();
  rlRenderWires();
});
document.addEventListener('mouseup', () => {
  if (RL.dragging) { RL.dragging = null; rlSaveProject(); }
});

// ---------- تتبع الشبكة (أي طرف متصل بأي طرف، عبر أسلاك + قطع تمريرية) ----------
function rlTraceNet(startCompId, startPin) {
  const visited = new Set();
  const stack = [[startCompId, startPin]];
  const reached = { pins: [], arduinoPins: new Set(), gnd: false, vcc: false };
  while (stack.length) {
    const [compId, pin] = stack.pop();
    const key = `${compId}:${pin}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const comp = RL.components.find(c => c.id === compId);
    if (!comp) continue;
    reached.pins.push({ compId, pin });
    if (comp.type === 'arduino') {
      if (pin === 'GND') reached.gnd = true;
      else if (pin === '5V') reached.vcc = true;
      else reached.arduinoPins.add(pin);
    }
    // تمرير داخلي بالمقاومة (طرفاها موصولان دايمًا لبعض لأغراض الاتصال)
    const def = RL_PART_DEFS[comp.type];
    if (comp.type === 'resistor') {
      const otherPin = pin === '1' ? '2' : '1';
      stack.push([compId, otherPin]);
    }
    RL.wires.forEach(w => {
      if (w.fromComp === compId && w.fromPin === pin) stack.push([w.toComp, w.toPin]);
      if (w.toComp === compId && w.toPin === pin) stack.push([w.fromComp, w.fromPin]);
    });
  }
  return reached;
}

function rlIsPinHigh(pinName) {
  const st = RL.pinState[pinName];
  if (!st) return false;
  if (st.pwm !== null && st.pwm > 0) return true;
  return st.digital === 1;
}

// ---------- تحديث حالة كل قطعة بناءً على الشبكة (يُنادى كل فريم أثناء التشغيل) ----------
function rlSimulateStep() {
  RL.components.forEach(comp => {
    if (comp.type === 'led') {
      const netA = rlTraceNet(comp.id, 'A');
      const netC = rlTraceNet(comp.id, 'C');
      const groundedC = netC.gnd || [...netC.arduinoPins].some(p => RL.pinState[p].mode === 'OUTPUT' && RL.pinState[p].digital === 0 && !rlIsPinHigh(p));
      let brightness = 0;
      if (netA.vcc) brightness = 255;
      else {
        [...netA.arduinoPins].forEach(p => {
          if (RL.pinState[p].pwm !== null) brightness = Math.max(brightness, RL.pinState[p].pwm);
          else if (RL.pinState[p].digital === 1) brightness = 255;
        });
      }
      comp.state.lit = groundedC && brightness > 0 ? brightness : 0;
    } else if (comp.type === 'servo') {
      const net = rlTraceNet(comp.id, 'SIG');
      let angle = comp.state.angle ?? 90;
      net.arduinoPins.forEach(p => { if (RL.pinState[p].servoAngle !== null) angle = RL.pinState[p].servoAngle; });
      comp.state.angle = angle;
    } else if (comp.type === 'buzzer') {
      const net = rlTraceNet(comp.id, '+');
      let freq = null;
      net.arduinoPins.forEach(p => { if (RL.pinState[p].toneFreq) freq = RL.pinState[p].toneFreq; });
      comp.state.on = !!freq;
      rlHandleBuzzerAudio(comp.id, freq);
    }
  });
  // مدخلات: البوتنشيومتر يحدّث قيمة analogRead لأي طرف أردوينو موصول بـ OUT
  RL.components.forEach(comp => {
    if (comp.type === 'potentiometer') {
      const net = rlTraceNet(comp.id, 'OUT');
      net.arduinoPins.forEach(p => { RL.pinState[p].potValue = comp.state.value || 0; });
    }
    if (comp.type === 'button') {
      const net1 = rlTraceNet(comp.id, '1');
      if (comp.state.pressed) {
        // الزر مضغوط = طرفاه متوصلين لبعض فعليًا الحين
        const net2 = rlTraceNet(comp.id, '2');
        net1.arduinoPins.forEach(p => { RL.pinState[p]._buttonBridge = { gnd: net2.gnd, vcc: net2.vcc, pins: [...net2.arduinoPins] }; });
        net2.arduinoPins.forEach(p => { RL.pinState[p]._buttonBridge = { gnd: net1.gnd, vcc: net1.vcc, pins: [...net1.arduinoPins] }; });
      } else {
        net1.arduinoPins.forEach(p => { delete RL.pinState[p]._buttonBridge; });
      }
    }
  });
  rlRenderCanvas();
}

let rlSimInterval = null;
function rlStartSimLoop() {
  if (rlSimInterval) return;
  rlSimInterval = setInterval(rlSimulateStep, 100);
}
function rlStopSimLoop() {
  if (rlSimInterval) { clearInterval(rlSimInterval); rlSimInterval = null; }
  Object.keys(RL.oscillators).forEach(k => rlHandleBuzzerAudio(Number(k), null));
}

function rlHandleBuzzerAudio(compId, freq) {
  if (!RL.audioCtx) {
    try { RL.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (freq) {
    if (!RL.oscillators[compId]) {
      const osc = RL.audioCtx.createOscillator();
      const gain = RL.audioCtx.createGain();
      gain.gain.value = 0.05;
      osc.type = 'square';
      osc.connect(gain).connect(RL.audioCtx.destination);
      osc.start();
      RL.oscillators[compId] = osc;
    }
    RL.oscillators[compId].frequency.value = freq;
  } else if (RL.oscillators[compId]) {
    try { RL.oscillators[compId].stop(); } catch (e) { /* already stopped */ }
    delete RL.oscillators[compId];
  }
}

// ---------- محرك تشغيل الكود (شبه-أردوينو → JS حقيقي، تنفيذ غير متزامن) ----------
function rlPreprocessCode(src) {
  let code = src;
  // أنماط C++ شائعة → JS: void setup/loop، Servo x;، أنواع المتغيرات
  code = code.replace(/\bvoid\s+setup\s*\(\s*\)/g, 'function setup()');
  code = code.replace(/\bvoid\s+loop\s*\(\s*\)/g, 'function loop()');
  code = code.replace(/\bvoid\s+(\w+)\s*\(/g, 'function $1(');
  code = code.replace(/\bServo\s+(\w+)\s*;/g, 'let $1 = new Servo();');
  code = code.replace(/\b(int|float|double|long|bool|boolean|byte|char|unsigned\s+int|unsigned\s+long|String)\s+(\w+)\s*=/g, 'let $2 =');
  code = code.replace(/\b(int|float|double|long|bool|boolean|byte|char|unsigned\s+int|unsigned\s+long|String)\s+(\w+)\s*;/g, 'let $2;');
  // setup()/loop() لازم تصير async عشان delay() تقدر توقف التنفيذ بدون
  // ما تجمّد المتصفح - سواء كتب المستخدم "void setup()" (تحوّل فوق لـ
  // "function setup()") أو كتبها JS-style مباشرة "function setup()"
  code = code.replace(/(?<!async\s)\bfunction\s+setup\s*\(/g, 'async function setup(');
  code = code.replace(/(?<!async\s)\bfunction\s+loop\s*\(/g, 'async function loop(');
  code = code.replace(/\bdelay\s*\(/g, 'await delay(');
  code = code.replace(/\bawait\s+await\s+delay\s*\(/g, 'await delay(');
  if (!/async function setup/.test(code)) code += '\nasync function setup() {}\n';
  if (!/async function loop/.test(code)) code += '\nasync function loop() {}\n';
  return code;
}

function rlSerialPrint(text) {
  const box = document.getElementById('rlSerialOutput');
  const line = document.createElement('div');
  line.textContent = text;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

async function rlRunCode() {
  rlStopExecution();
  clearError('rlError');
  document.getElementById('rlSerialOutput').innerHTML = '';
  const source = RL.mode === 'blocks' ? rlCompileBlocksToCode() : document.getElementById('rlCodeTextarea').value;
  RL.code = source;
  rlSaveProject();

  let transpiled;
  try {
    transpiled = rlPreprocessCode(source);
  } catch (e) {
    showError('rlError', t('rl_err_run') + ': ' + e.message);
    return;
  }

  const myRunId = ++RL.runId;
  RL.running = true;
  document.getElementById('rlRunBtn').classList.add('hidden');
  document.getElementById('rlStopBtn').classList.remove('hidden');
  rlStartSimLoop();

  const delay = (ms) => new Promise(r => setTimeout(r, Math.max(0, Math.min(5000, ms || 0))));
  const HIGH = 1, LOW = 0, INPUT = 'INPUT', OUTPUT = 'OUTPUT', INPUT_PULLUP = 'INPUT_PULLUP', LED_BUILTIN = 'D13';
  const A0 = 'A0', A1 = 'A1', A2 = 'A2', A3 = 'A3', A4 = 'A4', A5 = 'A5';
  const rlPin = (p) => (typeof p === 'number' ? 'D' + p : String(p));
  const pinMode = (p, mode) => { const pin = rlPin(p); if (RL.pinState[pin]) RL.pinState[pin].mode = mode; };
  const digitalWrite = (p, v) => {
    const pin = rlPin(p);
    if (!RL.pinState[pin]) return;
    RL.pinState[pin].digital = v ? 1 : 0;
    RL.pinState[pin].pwm = null; RL.pinState[pin].servoAngle = null;
  };
  const digitalRead = (p) => {
    const pin = rlPin(p);
    const st = RL.pinState[pin];
    if (!st) return LOW;
    const bridge = st._buttonBridge;
    if (bridge) {
      if (bridge.gnd) return LOW;
      if (bridge.vcc) return HIGH;
    }
    return st.mode === 'INPUT_PULLUP' ? HIGH : LOW;
  };
  const analogWrite = (p, v) => { const pin = rlPin(p); if (RL.pinState[pin]) { RL.pinState[pin].pwm = Math.max(0, Math.min(255, v)); RL.pinState[pin].digital = 0; } };
  const analogRead = (p) => { const pin = rlPin(p); return (RL.pinState[pin] && RL.pinState[pin].potValue) || 0; };
  const tone = (p, freq) => { const pin = rlPin(p); if (RL.pinState[pin]) RL.pinState[pin].toneFreq = freq; };
  const noTone = (p) => { const pin = rlPin(p); if (RL.pinState[pin]) RL.pinState[pin].toneFreq = null; };
  const map = (x, inMin, inMax, outMin, outMax) => (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
  const constrain = (x, a, b) => Math.max(a, Math.min(b, x));
  function Servo() {
    let attachedPin = null;
    return {
      attach(p) { attachedPin = rlPin(p); },
      write(angle) { if (attachedPin && RL.pinState[attachedPin]) RL.pinState[attachedPin].servoAngle = Math.max(0, Math.min(180, angle)); },
    };
  }
  const Serial = { begin() {}, println(x) { rlSerialPrint(String(x)); }, print(x) { rlSerialPrint(String(x)); } };

  let userFns;
  try {
    const factory = new Function(
      'delay', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
      'pinMode', 'digitalWrite', 'digitalRead', 'analogWrite', 'analogRead', 'tone', 'noTone', 'map', 'constrain', 'Servo', 'Serial',
      transpiled + '\nreturn { setup, loop };'
    );
    userFns = factory(delay, HIGH, LOW, INPUT, OUTPUT, INPUT_PULLUP, LED_BUILTIN, A0, A1, A2, A3, A4, A5,
      pinMode, digitalWrite, digitalRead, analogWrite, analogRead, tone, noTone, map, constrain, Servo, Serial);
  } catch (e) {
    showError('rlError', t('rl_err_syntax') + ': ' + e.message);
    rlStopExecution();
    return;
  }

  try {
    await userFns.setup();
    while (RL.running && RL.runId === myRunId) {
      await userFns.loop();
      await delay(0);
    }
  } catch (e) {
    if (RL.runId === myRunId) showError('rlError', t('rl_err_run') + ': ' + e.message);
    rlStopExecution();
  }
}

function rlStopExecution() {
  RL.running = false;
  RL.runId++;
  rlStopSimLoop();
  document.getElementById('rlRunBtn').classList.remove('hidden');
  document.getElementById('rlStopBtn').classList.add('hidden');
}

document.getElementById('rlRunBtn').addEventListener('click', rlRunCode);
document.getElementById('rlStopBtn').addEventListener('click', rlStopExecution);
document.getElementById('rlNewProjectBtn').addEventListener('click', () => {
  if (confirm(t('rl_confirm_new'))) rlNewProject();
});
document.getElementById('rlExampleSelect').addEventListener('change', (e) => {
  if (e.target.value) { rlLoadExample(e.target.value); e.target.value = ''; }
});
document.getElementById('rlModeBlocksBtn').addEventListener('click', () => {
  RL.mode = 'blocks'; rlSaveProject();
  document.getElementById('rlModeBlocksBtn').classList.add('active');
  document.getElementById('rlModeCodeBtn').classList.remove('active');
  document.getElementById('rlBlocksEditor').classList.remove('hidden');
  document.getElementById('rlCodeEditorWrap').classList.add('hidden');
  rlRenderBlocks();
});
document.getElementById('rlModeCodeBtn').addEventListener('click', () => {
  RL.code = rlCompileBlocksToCode();
  RL.mode = 'code'; rlSaveProject();
  document.getElementById('rlModeCodeBtn').classList.add('active');
  document.getElementById('rlModeBlocksBtn').classList.remove('active');
  document.getElementById('rlCodeEditorWrap').classList.remove('hidden');
  document.getElementById('rlBlocksEditor').classList.add('hidden');
  document.getElementById('rlCodeTextarea').value = RL.code;
});
document.getElementById('rlCodeTextarea').addEventListener('input', (e) => { RL.code = e.target.value; rlSaveProject(); });

// ============================================================================
// ---------- محرر البلوكات (زي Scratch مبسّط) - يبني كود شبه-أردوينو تلقائيًا ----------
// ============================================================================
const RL_BLOCK_TYPES = {
  pinMode: { labelKey: 'rl_block_pinmode' },
  digitalWrite: { labelKey: 'rl_block_digitalwrite' },
  analogWrite: { labelKey: 'rl_block_analogwrite' },
  delay: { labelKey: 'rl_block_delay' },
  tone: { labelKey: 'rl_block_tone' },
  noTone: { labelKey: 'rl_block_notone' },
  serialPrint: { labelKey: 'rl_block_serialprint' },
  ifElse: { labelKey: 'rl_block_ifelse' },
  repeat: { labelKey: 'rl_block_repeat' },
  servoAttach: { labelKey: 'rl_block_servoattach' },
  servoWriteMapped: { labelKey: 'rl_block_servowritemapped' },
};
function rlAllPinOptions() { return [...RL_PIN_TOP]; }
function rlAllAnalogOptions() { return ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']; }

function rlNewBlock(type) {
  switch (type) {
    case 'pinMode': return { type, pin: 'D13', mode: 'OUTPUT' };
    case 'digitalWrite': return { type, pin: 'D13', value: 'HIGH' };
    case 'analogWrite': return { type, pin: 'D9', value: 128 };
    case 'delay': return { type, ms: 500 };
    case 'tone': return { type, pin: 'D8', freq: 440 };
    case 'noTone': return { type, pin: 'D8' };
    case 'serialPrint': return { type, text: 'hello' };
    case 'ifElse': return { type, condLeft: 'digitalRead(D2)', condOp: '==', condRight: 'LOW', then: [], otherwise: [] };
    case 'repeat': return { type, times: 3, body: [] };
    case 'servoAttach': return { type, varName: 'myServo', pin: 'D9' };
    case 'servoWriteMapped': return { type, varName: 'myServo', pin: 'A0' };
    default: return { type };
  }
}

function rlBlockHtml(block, path) {
  const pinOpts = (sel) => rlAllPinOptions().map(p => `<option value="${p}" ${sel === p ? 'selected' : ''}>${p}</option>`).join('');
  const analogOpts = (sel) => rlAllAnalogOptions().map(p => `<option value="${p}" ${sel === p ? 'selected' : ''}>${p}</option>`).join('');
  let inner = '';
  if (block.type === 'pinMode') {
    inner = `${t('rl_block_pinmode')} <select class="rl-b-field" data-f="pin">${pinOpts(block.pin)}</select>
      <select class="rl-b-field" data-f="mode">
        <option value="OUTPUT" ${block.mode === 'OUTPUT' ? 'selected' : ''}>OUTPUT</option>
        <option value="INPUT" ${block.mode === 'INPUT' ? 'selected' : ''}>INPUT</option>
        <option value="INPUT_PULLUP" ${block.mode === 'INPUT_PULLUP' ? 'selected' : ''}>INPUT_PULLUP</option>
      </select>`;
  } else if (block.type === 'digitalWrite') {
    inner = `${t('rl_block_digitalwrite')} <select class="rl-b-field" data-f="pin">${pinOpts(block.pin)}</select>
      <select class="rl-b-field" data-f="value">
        <option value="HIGH" ${block.value === 'HIGH' ? 'selected' : ''}>HIGH</option>
        <option value="LOW" ${block.value === 'LOW' ? 'selected' : ''}>LOW</option>
      </select>`;
  } else if (block.type === 'analogWrite') {
    inner = `${t('rl_block_analogwrite')} <select class="rl-b-field" data-f="pin">${pinOpts(block.pin)}</select>
      <input type="number" class="rl-b-field rl-b-num" data-f="value" min="0" max="255" value="${block.value}">`;
  } else if (block.type === 'delay') {
    inner = `${t('rl_block_delay')} <input type="number" class="rl-b-field rl-b-num" data-f="ms" min="0" max="10000" value="${block.ms}"> ms`;
  } else if (block.type === 'tone') {
    inner = `${t('rl_block_tone')} <select class="rl-b-field" data-f="pin">${pinOpts(block.pin)}</select>
      <input type="number" class="rl-b-field rl-b-num" data-f="freq" min="20" max="20000" value="${block.freq}"> Hz`;
  } else if (block.type === 'noTone') {
    inner = `${t('rl_block_notone')} <select class="rl-b-field" data-f="pin">${pinOpts(block.pin)}</select>`;
  } else if (block.type === 'serialPrint') {
    inner = `${t('rl_block_serialprint')} <input type="text" class="rl-b-field rl-b-text" data-f="text" value="${escapeHtml(block.text)}">`;
  } else if (block.type === 'servoAttach') {
    inner = `${t('rl_block_servoattach')} <input type="text" class="rl-b-field rl-b-text" data-f="varName" value="${escapeHtml(block.varName)}" style="width:80px;"> → <select class="rl-b-field" data-f="pin">${pinOpts(block.pin)}</select>`;
  } else if (block.type === 'servoWriteMapped') {
    inner = `${t('rl_block_servowritemapped')} <input type="text" class="rl-b-field rl-b-text" data-f="varName" value="${escapeHtml(block.varName)}" style="width:80px;"> ← <select class="rl-b-field" data-f="pin">${analogOpts(block.pin)}</select>`;
  } else if (block.type === 'repeat') {
    inner = `
      <div>${t('rl_block_repeat')} <input type="number" class="rl-b-field rl-b-num" data-f="times" min="1" max="1000" value="${block.times}"></div>
      <div class="rl-b-nested" data-nested="body">${rlBlockListHtml(block.body, [...path, 'body'])}</div>
      <button class="rl-b-add-inner ghost" data-add-path="${[...path, 'body'].join('.')}">${t('rl_add_block_here')}</button>
    `;
  } else if (block.type === 'ifElse') {
    inner = `
      <div>${t('rl_block_ifelse_if')}
        <select class="rl-b-field" data-f="condLeftKind">
          <option value="digitalRead" ${block.condLeft.startsWith('digitalRead') ? 'selected' : ''}>digitalRead</option>
          <option value="analogRead" ${block.condLeft.startsWith('analogRead') ? 'selected' : ''}>analogRead</option>
        </select>
        (<select class="rl-b-field" data-f="condPin">${[...pinOpts(block.condLeft.match(/\(([^)]+)\)/)?.[1]), ...analogOpts(block.condLeft.match(/\(([^)]+)\)/)?.[1])].join('')}</select>)
        <select class="rl-b-field" data-f="condOp">
          <option value="==" ${block.condOp === '==' ? 'selected' : ''}>=</option>
          <option value="!=" ${block.condOp === '!=' ? 'selected' : ''}>≠</option>
          <option value=">" ${block.condOp === '>' ? 'selected' : ''}>&gt;</option>
          <option value="<" ${block.condOp === '<' ? 'selected' : ''}>&lt;</option>
        </select>
        <input type="text" class="rl-b-field rl-b-text" data-f="condRight" value="${escapeHtml(block.condRight)}" style="width:60px;">
      </div>
      <div class="rl-b-nested-label">${t('rl_block_ifelse_then')}</div>
      <div class="rl-b-nested" data-nested="then">${rlBlockListHtml(block.then, [...path, 'then'])}</div>
      <button class="rl-b-add-inner ghost" data-add-path="${[...path, 'then'].join('.')}">${t('rl_add_block_here')}</button>
      <div class="rl-b-nested-label">${t('rl_block_ifelse_else')}</div>
      <div class="rl-b-nested" data-nested="otherwise">${rlBlockListHtml(block.otherwise, [...path, 'otherwise'])}</div>
      <button class="rl-b-add-inner ghost" data-add-path="${[...path, 'otherwise'].join('.')}">${t('rl_add_block_here')}</button>
    `;
  }
  return `
    <div class="rl-block rl-block-${block.type}" draggable="true" data-path="${path.join('.')}">
      <div class="rl-block-row">${inner}</div>
      <div class="rl-block-actions">
        <button class="rl-b-up" data-path="${path.join('.')}" title="⬆️">⬆️</button>
        <button class="rl-b-down" data-path="${path.join('.')}" title="⬇️">⬇️</button>
        <button class="rl-b-del" data-path="${path.join('.')}" title="🗑️">🗑️</button>
      </div>
    </div>
  `;
}

function rlBlockListHtml(list, path) {
  return `<div class="rl-block-list" data-list-path="${path.join('.')}">${list.map((b, i) => rlBlockHtml(b, [...path, i])).join('')}</div>`;
}

// مسار البلوك مكوّن من: 'setup'|'loop' ثم أزواج (index, container-key) لكل
// مستوى تعشيش ('body'/'then'/'otherwise') - نفصّل هنا بين "امشِ على المسار
// وارجع القائمة اللي هو يشير لها مباشرة" (تُستخدم لأزرار "أضف بلوك هنا"،
// المسار ينتهي بمفتاح حاوية) و"ارجع القائمة الأب + index لبلوك معيّن" (تُستخدم
// لأزرار فوق/تحت/حذف، المسار ينتهي برقم index)
function rlResolveContainer(parts) {
  let list = parts[0] === 'setup' ? RL.blocksSetup : RL.blocksLoop;
  let i = 1;
  while (i < parts.length) {
    const idx = Number(parts[i]); i++;
    const key = parts[i]; i++;
    list = list[idx][key];
  }
  return list;
}
function rlListForPath(pathStr) {
  return rlResolveContainer(pathStr.split('.'));
}
function rlParentListAndIndex(pathStr) {
  const parts = pathStr.split('.');
  const idx = Number(parts[parts.length - 1]);
  const list = rlResolveContainer(parts.slice(0, -1));
  return { list, idx };
}

function rlRenderBlocks() {
  document.getElementById('rlBlocksSetupList').innerHTML = rlBlockListHtml(RL.blocksSetup, ['setup']);
  document.getElementById('rlBlocksLoopList').innerHTML = rlBlockListHtml(RL.blocksLoop, ['loop']);
  wireRlBlockEvents();
}

function wireRlBlockEvents() {
  document.querySelectorAll('.rl-b-field').forEach(field => {
    field.addEventListener('change', (e) => {
      const blockEl = field.closest('.rl-block');
      const path = blockEl.dataset.path;
      const { list, idx } = rlParentListAndIndex(path);
      const block = list[idx];
      const f = field.dataset.f;
      if (block.type === 'ifElse' && (f === 'condLeftKind' || f === 'condPin')) {
        const kind = f === 'condLeftKind' ? field.value : blockEl.querySelector('[data-f="condLeftKind"]').value;
        const pin = f === 'condPin' ? field.value : blockEl.querySelector('[data-f="condPin"]').value;
        block.condLeft = `${kind}(${pin})`;
      } else if (field.classList.contains('rl-b-num')) {
        block[f] = Number(field.value);
      } else {
        block[f] = field.value;
      }
      rlSaveProject();
      rlRenderBlocks();
    });
  });
  document.querySelectorAll('.rl-b-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const { list, idx } = rlParentListAndIndex(btn.dataset.path);
      list.splice(idx, 1);
      rlSaveProject(); rlRenderBlocks();
    });
  });
  document.querySelectorAll('.rl-b-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const { list, idx } = rlParentListAndIndex(btn.dataset.path);
      if (idx > 0) { [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]; rlSaveProject(); rlRenderBlocks(); }
    });
  });
  document.querySelectorAll('.rl-b-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const { list, idx } = rlParentListAndIndex(btn.dataset.path);
      if (idx < list.length - 1) { [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]]; rlSaveProject(); rlRenderBlocks(); }
    });
  });
  document.querySelectorAll('.rl-b-add-inner').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = rlListForPath(btn.dataset.addPath);
      rlOpenBlockPicker((type) => { list.push(rlNewBlock(type)); rlSaveProject(); rlRenderBlocks(); });
    });
  });
}

function rlCloseBlockPicker() {
  document.getElementById('rlBlockPickerOverlay').classList.add('hidden');
}
function rlOpenBlockPicker(onPick) {
  const overlay = document.getElementById('rlBlockPickerOverlay');
  const picker = document.getElementById('rlBlockPicker');
  picker.innerHTML = `
    <div class="rl-picker-header">
      <span>${t('rl_pick_block_title')}</span>
      <button class="rl-picker-close" id="rlPickerCloseBtn">✕</button>
    </div>
    <div class="rl-picker-grid">
      ${Object.entries(RL_BLOCK_TYPES).map(([type, def]) => `<button class="rl-picker-item" data-type="${type}">${t(def.labelKey)}</button>`).join('')}
    </div>
  `;
  overlay.classList.remove('hidden');
  picker.querySelector('#rlPickerCloseBtn').addEventListener('click', rlCloseBlockPicker);
  picker.querySelectorAll('.rl-picker-item').forEach(btn => {
    btn.addEventListener('click', () => { onPick(btn.dataset.type); rlCloseBlockPicker(); }, { once: true });
  });
}
document.getElementById('rlAddSetupBlockBtn').addEventListener('click', () => {
  rlOpenBlockPicker((type) => { RL.blocksSetup.push(rlNewBlock(type)); rlSaveProject(); rlRenderBlocks(); });
});
document.getElementById('rlAddLoopBlockBtn').addEventListener('click', () => {
  rlOpenBlockPicker((type) => { RL.blocksLoop.push(rlNewBlock(type)); rlSaveProject(); rlRenderBlocks(); });
});
document.getElementById('rlBlockPickerOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'rlBlockPickerOverlay') rlCloseBlockPicker();
});

// "D13" → "13" (رقم صريح، نفس أسلوب أردوينو الحقيقي pinMode(13, ...))، و"A0"
// تبقى كما هي (ثابت موجود فعليًا وقت التنفيذ) - لازم نحوّل أطراف D قبل ما
// نطبعها بالكود المولّد من البلوكات، وإلا تصير متغير JS غير معرّف
function rlPinLiteral(pin) {
  return /^D\d+$/.test(pin) ? pin.slice(1) : pin;
}
function rlEmitBlock(b, indent) {
  const pad = '  '.repeat(indent);
  const pin = rlPinLiteral(b.pin);
  switch (b.type) {
    case 'pinMode': return `${pad}pinMode(${pin}, ${b.mode});\n`;
    case 'digitalWrite': return `${pad}digitalWrite(${pin}, ${b.value});\n`;
    case 'analogWrite': return `${pad}analogWrite(${pin}, ${b.value});\n`;
    case 'delay': return `${pad}delay(${b.ms});\n`;
    case 'tone': return `${pad}tone(${pin}, ${b.freq});\n`;
    case 'noTone': return `${pad}noTone(${pin});\n`;
    case 'serialPrint': return `${pad}Serial.println("${b.text.replace(/"/g, '\\"')}");\n`;
    // تصريح متغير السيرفو نفسه يُرفع لأعلى الكود (خارج setup/loop) بواسطة
    // rlCompileBlocksToCode - هنا نصدر استدعاء attach() بس، مطابق للطريقة
    // اللي تشتغل فعليًا بأردوينو الحقيقي (Servo تُصرَّح على مستوى الملف)
    case 'servoAttach': return `${pad}${b.varName}.attach(${pin});\n`;
    case 'servoWriteMapped': return `${pad}${b.varName}.write(map(analogRead(${pin}), 0, 1023, 0, 180));\n`;
    case 'repeat': return `${pad}for (let i = 0; i < ${b.times}; i++) {\n${b.body.map(x => rlEmitBlock(x, indent + 1)).join('')}${pad}}\n`;
    case 'ifElse': {
      const condLeft = b.condLeft.replace(/\((\w+)\)/, (m, p) => `(${rlPinLiteral(p)})`);
      return `${pad}if (${condLeft} ${b.condOp} ${b.condRight}) {\n${b.then.map(x => rlEmitBlock(x, indent + 1)).join('')}${pad}} else {\n${b.otherwise.map(x => rlEmitBlock(x, indent + 1)).join('')}${pad}}\n`;
    }
    default: return '';
  }
}
// أي بلوك "اربط سيرفو" جوا setup/loop (أو أي تعشيش) لازم متغيره يُصرَّح على
// مستوى الملف كامل (خارج الدالتين) عشان يشوفه setup() وloop() الاثنين مع
// بعض - نفس ما يصير فعليًا بأردوينو الحقيقي (Servo x; بأعلى الملف)
function rlCollectServoVars(list, found) {
  list.forEach(b => {
    if (b.type === 'servoAttach') found.add(b.varName);
    if (b.body) rlCollectServoVars(b.body, found);
    if (b.then) rlCollectServoVars(b.then, found);
    if (b.otherwise) rlCollectServoVars(b.otherwise, found);
  });
}
function rlCompileBlocksToCode() {
  if (RL.mode !== 'blocks') return RL.code;
  const servoVars = new Set();
  rlCollectServoVars(RL.blocksSetup, servoVars);
  rlCollectServoVars(RL.blocksLoop, servoVars);
  const servoDecls = [...servoVars].map(v => `let ${v} = new Servo();\n`).join('');
  const setupBody = RL.blocksSetup.map(b => rlEmitBlock(b, 1)).join('');
  const loopBody = RL.blocksLoop.map(b => rlEmitBlock(b, 1)).join('');
  return `${servoDecls}\nfunction setup() {\n${setupBody}}\n\nfunction loop() {\n${loopBody}}\n`;
}
