// ============================================================================
// ---------- مختبر العلوم - محاكاة كيميائية/فيزيائية ثلاثية الأبعاد (three.js
// حقيقي) + مستكشف أحياء (تصميم تخطيطي أنيق - بطاقات ورسوم واضحة، مو محاولة
// واقعية 3D ما نقدر نحققها بدون أصول فنية جاهزة) + مساعد ذكيّ مستمر طول
// الجلسة + تلخيص نهائي بالذكاء الاصطناعي ----------
// ============================================================================
const SL = {
  scene: null, camera: null, renderer: null, raycaster: null, mouse: null,
  hoverables: [], tray: [], chatInteractionId: null, sessionLog: [],
  bioCategory: null, bioItem: null, animFrameId: null, initialized: false,
};

// ---------- قطع الرف (ثلاثي الأبعاد حقيقي) ----------
const SL_SHELF_ITEMS = [
  {
    id: 'beaker', nameKey: 'sl_item_beaker_name', descKey: 'sl_item_beaker_desc', usageKey: 'sl_item_beaker_usage',
    build() {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.3, 0.55, 20, 1, true),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.15, side: THREE.DoubleSide })
      );
      g.add(glass);
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.27, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 })
      );
      liquid.position.y = -0.13;
      g.add(liquid);
      return g;
    },
  },
  {
    id: 'flask', nameKey: 'sl_item_flask_name', descKey: 'sl_item_flask_desc', usageKey: 'sl_item_flask_usage',
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.32, 0.5, 20),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.15 })
      );
      body.position.y = 0.05;
      g.add(body);
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.25, 12),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.15 })
      );
      neck.position.y = 0.42;
      g.add(neck);
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.29, 0.2, 20),
        new THREE.MeshStandardMaterial({ color: 0x8be08b, transparent: true, opacity: 0.85 })
      );
      liquid.position.y = -0.1;
      g.add(liquid);
      return g;
    },
  },
  {
    id: 'vinegar', nameKey: 'sl_item_vinegar_name', descKey: 'sl_item_vinegar_desc', usageKey: 'sl_item_vinegar_usage',
    build() { return slBuildBottle(0xd9c26a, 0.55); },
  },
  {
    id: 'baking_soda', nameKey: 'sl_item_baking_soda_name', descKey: 'sl_item_baking_soda_desc', usageKey: 'sl_item_baking_soda_usage',
    build() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2f2ea }));
      box.position.y = 0.05;
      g.add(box);
      return g;
    },
  },
  {
    id: 'salt', nameKey: 'sl_item_salt_name', descKey: 'sl_item_salt_desc', usageKey: 'sl_item_salt_usage',
    build() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x3a6bb0 }));
      box.position.y = 0.02;
      g.add(box);
      return g;
    },
  },
  {
    id: 'food_coloring', nameKey: 'sl_item_food_coloring_name', descKey: 'sl_item_food_coloring_desc', usageKey: 'sl_item_food_coloring_usage',
    build() { return slBuildBottle(0xe0473a, 0.4, 0.13); },
  },
  {
    id: 'bunsen_burner', nameKey: 'sl_item_bunsen_burner_name', descKey: 'sl_item_bunsen_burner_desc', usageKey: 'sl_item_bunsen_burner_usage',
    build() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.5 }));
      g.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.5 }));
      stem.position.y = 0.24;
      g.add(stem);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff5500, emissiveIntensity: 0.6 }));
      flame.position.y = 0.5;
      g.add(flame);
      return g;
    },
  },
  {
    id: 'thermometer', nameKey: 'sl_item_thermometer_name', descKey: 'sl_item_thermometer_desc', usageKey: 'sl_item_thermometer_usage',
    build() {
      const g = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
      tube.position.y = 0.1;
      g.add(tube);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshStandardMaterial({ color: 0xdd3333 }));
      bulb.position.y = -0.2;
      g.add(bulb);
      return g;
    },
  },
  {
    id: 'magnifying_glass', nameKey: 'sl_item_magnifying_glass_name', descKey: 'sl_item_magnifying_glass_desc', usageKey: 'sl_item_magnifying_glass_usage',
    build() {
      const g = new THREE.Group();
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      lens.position.y = 0.25;
      g.add(lens);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, metalness: 0.4 }));
      ring.position.y = 0.25;
      g.add(ring);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
      handle.position.y = -0.15;
      handle.rotation.z = 0.3;
      g.add(handle);
      return g;
    },
  },
];

function slBuildBottle(liquidColor, height, radius) {
  radius = radius || 0.16;
  const g = new THREE.Group();
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.15 })
  );
  bottle.position.y = height / 2 - 0.1;
  g.add(bottle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  cap.position.y = height - 0.06;
  g.add(cap);
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, height * 0.6, 16),
    new THREE.MeshStandardMaterial({ color: liquidColor, transparent: true, opacity: 0.9 })
  );
  liquid.position.y = height * 0.2;
  g.add(liquid);
  return g;
}

function slBuildSink() {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.35, roughness: 0.4 }));
  basin.position.y = 0.25;
  g.add(basin);
  const basinHole = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.4, roughness: 0.5 }));
  basinHole.position.y = 0.4;
  g.add(basinHole);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.3 }));
  neck.position.set(0, 0.9, -0.35);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.3 }));
  head.rotation.z = Math.PI / 2;
  head.position.set(0.16, 1.28, -0.35);
  g.add(head);
  return g;
}

const SL_VIRTUAL_ITEMS = {
  water_cold: 'sl_item_water_cold_name', water_warm: 'sl_item_water_warm_name', water_hot: 'sl_item_water_hot_name',
  paper: 'sl_item_paper_name',
};
function slItemNameKey(id) {
  const shelfItem = SL_SHELF_ITEMS.find(i => i.id === id);
  return shelfItem ? shelfItem.nameKey : SL_VIRTUAL_ITEMS[id];
}

function slPairKey(a, b) { return [a, b].sort().join('+'); }
const SL_REACTIONS = {
  [slPairKey('vinegar', 'baking_soda')]: 'sl_reaction_vinegar_soda',
  [slPairKey('baking_soda', 'water_hot')]: 'sl_reaction_soda_hot',
  [slPairKey('baking_soda', 'water_cold')]: 'sl_reaction_soda_cold',
  [slPairKey('salt', 'water_hot')]: 'sl_reaction_salt_hot',
  [slPairKey('salt', 'water_cold')]: 'sl_reaction_salt_cold',
  [slPairKey('food_coloring', 'water_hot')]: 'sl_reaction_color_hot',
  [slPairKey('food_coloring', 'water_cold')]: 'sl_reaction_color_cold',
  [slPairKey('vinegar', 'food_coloring')]: 'sl_reaction_vinegar_color',
  [slPairKey('paper', 'water_warm')]: 'sl_reaction_paper_water',
  [slPairKey('bunsen_burner', 'water_hot')]: 'sl_reaction_burner_water',
  [slPairKey('bunsen_burner', 'beaker')]: 'sl_reaction_burner_beaker',
  [slPairKey('thermometer', 'water_hot')]: 'sl_reaction_thermo_hot',
  [slPairKey('thermometer', 'water_cold')]: 'sl_reaction_thermo_cold',
};

// ---------- تهيئة المشهد ثلاثي الأبعاد ----------
function slInitThreeScene() {
  const canvas = document.getElementById('slCanvas');
  const wrap = document.getElementById('slSceneWrap');
  SL.scene = new THREE.Scene();
  SL.camera = new THREE.PerspectiveCamera(42, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
  SL.camera.position.set(0, 3.2, 8.5);
  SL.camera.lookAt(0, 1.4, 0);

  SL.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  SL.renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  SL.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  SL.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(5, 8, 5);
  SL.scene.add(dirLight);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0xdccdb0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  SL.scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), new THREE.MeshStandardMaterial({ color: 0xeef2ef }));
  wall.position.set(0, 4.5, -2);
  SL.scene.add(wall);

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.18, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
  shelf.position.set(-1.4, 1.5, 0);
  SL.scene.add(shelf);
  const shelfSupportL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 1.4), new THREE.MeshStandardMaterial({ color: 0x6e4620 }));
  shelfSupportL.position.set(-5.9, 0.75, 0);
  SL.scene.add(shelfSupportL);
  const shelfSupportR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 1.4), new THREE.MeshStandardMaterial({ color: 0x6e4620 }));
  shelfSupportR.position.set(3.1, 0.75, 0);
  SL.scene.add(shelfSupportR);

  SL_SHELF_ITEMS.forEach((item, i) => {
    const group = item.build();
    group.position.set(-5.4 + i * 1.05, 1.6, 0);
    group.userData.slItem = item;
    SL.scene.add(group);
    SL.hoverables.push(group);
  });

  const sinkGroup = slBuildSink();
  sinkGroup.position.set(4.6, -0.25, -0.4);
  sinkGroup.userData.slSink = true;
  SL.scene.add(sinkGroup);
  SL.hoverables.push(sinkGroup);

  SL.raycaster = new THREE.Raycaster();
  SL.mouse = new THREE.Vector2();

  canvas.addEventListener('mousemove', slOnSceneMouseMove);
  canvas.addEventListener('click', slOnSceneClick);
  canvas.addEventListener('mouseleave', () => document.getElementById('slTooltip').classList.add('hidden'));
  window.addEventListener('resize', slOnSceneResize);

  slAnimate();
}

function slOnSceneResize() {
  const wrap = document.getElementById('slSceneWrap');
  if (!SL.renderer || !wrap.clientWidth) return;
  SL.camera.aspect = wrap.clientWidth / wrap.clientHeight;
  SL.camera.updateProjectionMatrix();
  SL.renderer.setSize(wrap.clientWidth, wrap.clientHeight);
}

function slAnimate() {
  SL.animFrameId = requestAnimationFrame(slAnimate);
  SL.renderer.render(SL.scene, SL.camera);
}

function slFindHoverableRoot(object) {
  let o = object;
  while (o && !o.userData.slItem && !o.userData.slSink) o = o.parent;
  return o;
}
function slPointerToNdc(e) {
  const rect = SL.renderer.domElement.getBoundingClientRect();
  SL.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  SL.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}
function slRaycastHoverables() {
  SL.raycaster.setFromCamera(SL.mouse, SL.camera);
  const intersects = SL.raycaster.intersectObjects(SL.hoverables, true);
  if (!intersects.length) return null;
  return slFindHoverableRoot(intersects[0].object);
}

function slOnSceneMouseMove(e) {
  slPointerToNdc(e);
  const root = slRaycastHoverables();
  const tooltip = document.getElementById('slTooltip');
  if (root && root.userData.slItem) {
    const item = root.userData.slItem;
    const wrapRect = document.getElementById('slSceneWrap').getBoundingClientRect();
    tooltip.style.left = (e.clientX - wrapRect.left) + 'px';
    tooltip.style.top = (e.clientY - wrapRect.top) + 'px';
    document.getElementById('slTooltipName').textContent = t(item.nameKey);
    document.getElementById('slTooltipDesc').textContent = t(item.descKey);
    document.getElementById('slTooltipUsage').textContent = t(item.usageKey);
    tooltip.classList.remove('hidden');
    SL.renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltip.classList.add('hidden');
    SL.renderer.domElement.style.cursor = root ? 'pointer' : 'default';
  }
}
function slOnSceneClick(e) {
  slPointerToNdc(e);
  const root = slRaycastHoverables();
  if (!root) return;
  if (root.userData.slSink) {
    document.getElementById('slSinkPanel').classList.remove('hidden');
  } else if (root.userData.slItem) {
    slAddToTray(root.userData.slItem.id);
  }
}

// ---------- صينية التفاعل ----------
function slAddToTray(id) {
  if (SL.tray.length >= 2 || SL.tray.includes(id)) return;
  SL.tray.push(id);
  slRenderTray();
}
function slRenderTray() {
  const wrap = document.getElementById('slTray');
  wrap.innerHTML = SL.tray.map(id => `
    <span class="sl-tray-item">${escapeHtml(t(slItemNameKey(id)))} <button data-id="${id}" type="button">✕</button></span>
  `).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => { SL.tray = SL.tray.filter(x => x !== btn.dataset.id); slRenderTray(); });
  });
  document.getElementById('slReactBtn').classList.toggle('hidden', SL.tray.length !== 2);
  document.getElementById('slClearTrayBtn').classList.toggle('hidden', SL.tray.length === 0);
}
document.getElementById('slClearTrayBtn').addEventListener('click', () => {
  SL.tray = [];
  slRenderTray();
  document.getElementById('slReactionResult').classList.add('hidden');
});
document.getElementById('slReactBtn').addEventListener('click', () => {
  const key = slPairKey(SL.tray[0], SL.tray[1]);
  const reactionKey = SL_REACTIONS[key];
  const text = reactionKey ? t(reactionKey) : t('sl_reaction_none');
  const box = document.getElementById('slReactionResult');
  box.textContent = text;
  box.classList.remove('hidden');
  SL.sessionLog.push(`${t('sl_log_reaction_prefix')}: ${t(slItemNameKey(SL.tray[0]))} + ${t(slItemNameKey(SL.tray[1]))} → ${text}`);
  SL.tray = [];
  slRenderTray();
});

// ---------- المغسلة ----------
document.querySelectorAll('#slSinkPanel [data-temp]').forEach(btn => {
  btn.addEventListener('click', () => {
    slAddToTray('water_' + btn.dataset.temp);
    document.getElementById('slSinkPanel').classList.add('hidden');
  });
});
document.getElementById('slGetPaperBtn').addEventListener('click', () => {
  slAddToTray('paper');
  document.getElementById('slSinkPanel').classList.add('hidden');
});
document.getElementById('slSinkCloseBtn').addEventListener('click', () => document.getElementById('slSinkPanel').classList.add('hidden'));

// ---------- تبديل التبويب (كيمياء ⇄ أحياء) ----------
function slSwitchTab(tab) {
  document.getElementById('slTabChemistryBtn').classList.toggle('active', tab === 'chemistry');
  document.getElementById('slTabBiologyBtn').classList.toggle('active', tab === 'biology');
  document.getElementById('slChemPanel').classList.toggle('hidden', tab !== 'chemistry');
  document.getElementById('slBioPanel').classList.toggle('hidden', tab !== 'biology');
  if (tab === 'chemistry') setTimeout(slOnSceneResize, 0);
}
document.getElementById('slTabChemistryBtn').addEventListener('click', () => slSwitchTab('chemistry'));
document.getElementById('slTabBiologyBtn').addEventListener('click', () => slSwitchTab('biology'));

// ============================================================================
// ---------- مستكشف الأحياء ----------
// ============================================================================
const SL_BIO_CATEGORIES = {
  mammals: { nameKey: 'sl_cat_mammals', icon: '🦁', animals: ['lion', 'elephant', 'cat', 'whale', 'bat'] },
  reptiles: { nameKey: 'sl_cat_reptiles', icon: '🐊', animals: ['crocodile', 'turtle', 'snake', 'chameleon'] },
  amphibians: { nameKey: 'sl_cat_amphibians', icon: '🐸', animals: ['frog', 'salamander'] },
  birds: { nameKey: 'sl_cat_birds', icon: '🦅', animals: ['eagle', 'penguin', 'parrot'] },
  fish: { nameKey: 'sl_cat_fish', icon: '🦈', animals: ['shark', 'goldfish'] },
  human: { nameKey: 'sl_cat_human', icon: '🧍', animals: [] },
};
const SL_ANIMALS = {
  lion: { nameKey: 'sl_animal_lion_name', icon: '🦁', quickFactKey: 'sl_animal_lion_quick', factsKeys: ['sl_animal_lion_fact1', 'sl_animal_lion_fact2', 'sl_animal_lion_fact3'] },
  elephant: { nameKey: 'sl_animal_elephant_name', icon: '🐘', quickFactKey: 'sl_animal_elephant_quick', factsKeys: ['sl_animal_elephant_fact1', 'sl_animal_elephant_fact2', 'sl_animal_elephant_fact3'] },
  cat: { nameKey: 'sl_animal_cat_name', icon: '🐱', quickFactKey: 'sl_animal_cat_quick', factsKeys: ['sl_animal_cat_fact1', 'sl_animal_cat_fact2', 'sl_animal_cat_fact3'] },
  whale: { nameKey: 'sl_animal_whale_name', icon: '🐋', quickFactKey: 'sl_animal_whale_quick', factsKeys: ['sl_animal_whale_fact1', 'sl_animal_whale_fact2', 'sl_animal_whale_fact3'] },
  bat: { nameKey: 'sl_animal_bat_name', icon: '🦇', quickFactKey: 'sl_animal_bat_quick', factsKeys: ['sl_animal_bat_fact1', 'sl_animal_bat_fact2', 'sl_animal_bat_fact3'] },
  crocodile: { nameKey: 'sl_animal_crocodile_name', icon: '🐊', quickFactKey: 'sl_animal_crocodile_quick', factsKeys: ['sl_animal_crocodile_fact1', 'sl_animal_crocodile_fact2', 'sl_animal_crocodile_fact3'] },
  turtle: { nameKey: 'sl_animal_turtle_name', icon: '🐢', quickFactKey: 'sl_animal_turtle_quick', factsKeys: ['sl_animal_turtle_fact1', 'sl_animal_turtle_fact2', 'sl_animal_turtle_fact3'] },
  snake: { nameKey: 'sl_animal_snake_name', icon: '🐍', quickFactKey: 'sl_animal_snake_quick', factsKeys: ['sl_animal_snake_fact1', 'sl_animal_snake_fact2', 'sl_animal_snake_fact3'] },
  chameleon: { nameKey: 'sl_animal_chameleon_name', icon: '🦎', quickFactKey: 'sl_animal_chameleon_quick', factsKeys: ['sl_animal_chameleon_fact1', 'sl_animal_chameleon_fact2', 'sl_animal_chameleon_fact3'] },
  frog: { nameKey: 'sl_animal_frog_name', icon: '🐸', quickFactKey: 'sl_animal_frog_quick', factsKeys: ['sl_animal_frog_fact1', 'sl_animal_frog_fact2', 'sl_animal_frog_fact3'] },
  salamander: { nameKey: 'sl_animal_salamander_name', icon: '🦎', quickFactKey: 'sl_animal_salamander_quick', factsKeys: ['sl_animal_salamander_fact1', 'sl_animal_salamander_fact2', 'sl_animal_salamander_fact3'] },
  eagle: { nameKey: 'sl_animal_eagle_name', icon: '🦅', quickFactKey: 'sl_animal_eagle_quick', factsKeys: ['sl_animal_eagle_fact1', 'sl_animal_eagle_fact2', 'sl_animal_eagle_fact3'] },
  penguin: { nameKey: 'sl_animal_penguin_name', icon: '🐧', quickFactKey: 'sl_animal_penguin_quick', factsKeys: ['sl_animal_penguin_fact1', 'sl_animal_penguin_fact2', 'sl_animal_penguin_fact3'] },
  parrot: { nameKey: 'sl_animal_parrot_name', icon: '🦜', quickFactKey: 'sl_animal_parrot_quick', factsKeys: ['sl_animal_parrot_fact1', 'sl_animal_parrot_fact2', 'sl_animal_parrot_fact3'] },
  shark: { nameKey: 'sl_animal_shark_name', icon: '🦈', quickFactKey: 'sl_animal_shark_quick', factsKeys: ['sl_animal_shark_fact1', 'sl_animal_shark_fact2', 'sl_animal_shark_fact3'] },
  goldfish: { nameKey: 'sl_animal_goldfish_name', icon: '🐠', quickFactKey: 'sl_animal_goldfish_quick', factsKeys: ['sl_animal_goldfish_fact1', 'sl_animal_goldfish_fact2', 'sl_animal_goldfish_fact3'] },
};
// أعضاء عامة تصلح لمعظم الحيوانات (تبسيط مقصود بدل تأليف مجموعة أعضاء
// مخصّصة لكل نوع) + مجموعة أكثر تفصيلًا خاصة بجسم الإنسان
const SL_BODY_PARTS = {
  animal_generic: ['heart', 'lungs', 'brain', 'stomach', 'skin'],
  human: ['heart', 'lungs', 'brain', 'stomach', 'kidneys', 'skin'],
};
const SL_PARTS_INFO = {
  heart: { nameKey: 'sl_part_heart_name', descKey: 'sl_part_heart_desc' },
  lungs: { nameKey: 'sl_part_lungs_name', descKey: 'sl_part_lungs_desc' },
  brain: { nameKey: 'sl_part_brain_name', descKey: 'sl_part_brain_desc' },
  stomach: { nameKey: 'sl_part_stomach_name', descKey: 'sl_part_stomach_desc' },
  kidneys: { nameKey: 'sl_part_kidneys_name', descKey: 'sl_part_kidneys_desc' },
  skin: { nameKey: 'sl_part_skin_name', descKey: 'sl_part_skin_desc' },
};

function slRenderBioCategories() {
  const wrap = document.getElementById('slBioCategories');
  wrap.innerHTML = Object.entries(SL_BIO_CATEGORIES).map(([id, cat]) => `
    <div class="sl-bio-cat-card" data-cat="${id}">
      <span class="sl-bio-cat-icon">${cat.icon}</span>
      <span class="sl-bio-cat-name">${t(cat.nameKey)}</span>
    </div>
  `).join('');
  wrap.querySelectorAll('.sl-bio-cat-card').forEach(card => {
    card.addEventListener('click', () => slOpenBioCategory(card.dataset.cat));
  });
}
function slOpenBioCategory(catId) {
  SL.bioCategory = catId;
  const cat = SL_BIO_CATEGORIES[catId];
  SL.sessionLog.push(`${t('sl_log_category_prefix')}: ${t(cat.nameKey)}`);
  if (catId === 'human') { slOpenBioDetail('human'); return; }
  document.getElementById('slBioCategoryView').classList.add('hidden');
  document.getElementById('slBioGridView').classList.remove('hidden');
  document.getElementById('slBioGridTitle').textContent = t(cat.nameKey);
  const grid = document.getElementById('slBioGrid');
  grid.innerHTML = cat.animals.map(id => {
    const a = SL_ANIMALS[id];
    return `
      <div class="sl-bio-item-card" data-animal="${id}">
        <span class="sl-bio-item-icon">${a.icon}</span>
        <span class="sl-bio-item-name">${t(a.nameKey)}</span>
      </div>
    `;
  }).join('');
  grid.querySelectorAll('.sl-bio-item-card').forEach(card => {
    let popover = null;
    card.addEventListener('mouseenter', () => {
      const a = SL_ANIMALS[card.dataset.animal];
      popover = document.createElement('div');
      popover.className = 'sl-bio-fact-popover';
      popover.textContent = t(a.quickFactKey);
      card.appendChild(popover);
    });
    card.addEventListener('mouseleave', () => { if (popover) { popover.remove(); popover = null; } });
    card.addEventListener('click', () => slOpenBioDetail('animal', card.dataset.animal));
  });
}
function slRenderBodyPartsInto(containerEl, partIds) {
  containerEl.classList.remove('hidden');
  containerEl.innerHTML = `
    <h4 class="sub-heading" data-i18n="sl_bio_pick_part">${t('sl_bio_pick_part')}</h4>
    <div class="sl-bio-parts-grid">${partIds.map(pid => `<div class="sl-bio-part-chip" data-part="${pid}">${t(SL_PARTS_INFO[pid].nameKey)}</div>`).join('')}</div>
    <div class="sl-bio-part-desc hidden" id="slPartDescBox"></div>
  `;
  containerEl.querySelectorAll('.sl-bio-part-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const info = SL_PARTS_INFO[chip.dataset.part];
      SL.sessionLog.push(`${t('sl_log_part_prefix')}: ${t(info.nameKey)}`);
      const box = containerEl.querySelector('#slPartDescBox');
      box.textContent = t(info.descKey);
      box.classList.remove('hidden');
    });
  });
}
function slOpenBioDetail(kind, animalId) {
  document.getElementById('slBioCategoryView').classList.add('hidden');
  document.getElementById('slBioGridView').classList.add('hidden');
  document.getElementById('slBioDetailView').classList.remove('hidden');
  const content = document.getElementById('slBioDetailContent');
  if (kind === 'human') {
    content.innerHTML = `
      <h3 class="sub-heading">${t('sl_cat_human')}</h3>
      <div class="sl-bio-gender-row">
        <div class="sl-bio-gender-btn" data-gender="male"><span>🧑</span>${t('sl_gender_male')}</div>
        <div class="sl-bio-gender-btn" data-gender="female"><span>🧑‍🦰</span>${t('sl_gender_female')}</div>
      </div>
      <div class="hidden" id="slHumanPartsWrap"></div>
    `;
    content.querySelectorAll('.sl-bio-gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        SL.sessionLog.push(`${t('sl_log_gender_prefix')}: ${t(btn.dataset.gender === 'male' ? 'sl_gender_male' : 'sl_gender_female')}`);
        slRenderBodyPartsInto(content.querySelector('#slHumanPartsWrap'), SL_BODY_PARTS.human);
      });
    });
  } else {
    SL.bioItem = animalId;
    const a = SL_ANIMALS[animalId];
    SL.sessionLog.push(`${t('sl_log_animal_prefix')}: ${t(a.nameKey)}`);
    content.innerHTML = `
      <div class="sl-bio-detail-header"><span class="sl-bio-detail-icon">${a.icon}</span><h3>${t(a.nameKey)}</h3></div>
      <ul class="sl-bio-fact-list">${a.factsKeys.map(k => `<li>${t(k)}</li>`).join('')}</ul>
      <div id="slAnimalPartsWrap"></div>
    `;
    slRenderBodyPartsInto(content.querySelector('#slAnimalPartsWrap'), SL_BODY_PARTS.animal_generic);
  }
}
document.getElementById('slBioBackToCategoriesBtn').addEventListener('click', () => {
  document.getElementById('slBioGridView').classList.add('hidden');
  document.getElementById('slBioCategoryView').classList.remove('hidden');
});
document.getElementById('slBioBackToGridBtn').addEventListener('click', () => {
  document.getElementById('slBioDetailView').classList.add('hidden');
  if (SL.bioCategory === 'human') document.getElementById('slBioCategoryView').classList.remove('hidden');
  else document.getElementById('slBioGridView').classList.remove('hidden');
});

// ============================================================================
// ---------- مساعد ذكيّ مستمر طول الجلسة ----------
// ============================================================================
function slAppendChatMessage(text, role, extraClass) {
  const wrap = document.getElementById('slChatMessages');
  const div = document.createElement('div');
  div.className = `sl-chat-msg ${role}` + (extraClass ? ' ' + extraClass : '');
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}
async function slSendChatMessage() {
  const input = document.getElementById('slChatInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  slAppendChatMessage(message, 'user');
  SL.sessionLog.push(`${t('sl_log_question_prefix')}: ${message}`);
  try {
    const contextParts = [];
    if (SL.bioItem) contextParts.push(t(SL_ANIMALS[SL.bioItem].nameKey));
    const body = { message, lang: currentLang, context: contextParts.join(', ') };
    if (SL.chatInteractionId) body.interaction_id = SL.chatInteractionId;
    const res = await apiCall('POST', '/api/science-lab/chat', body);
    SL.chatInteractionId = res.interaction_id;
    let cls = '';
    if (res.reply.startsWith('✅')) cls = 'correct';
    else if (res.reply.startsWith('❌')) cls = 'incorrect';
    slAppendChatMessage(res.reply, 'ai', cls);
  } catch (e) {
    slAppendChatMessage(e.message, 'ai', 'incorrect');
  }
}
document.getElementById('slChatSendBtn').addEventListener('click', slSendChatMessage);
document.getElementById('slChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') slSendChatMessage(); });

// ---------- تلخيص الجلسة ----------
document.getElementById('slSummaryBtn').addEventListener('click', async () => {
  const modal = document.getElementById('slSummaryModal');
  const content = document.getElementById('slSummaryContent');
  modal.classList.remove('hidden');
  if (!SL.sessionLog.length) { content.textContent = t('sl_summary_empty'); return; }
  content.textContent = t('loading');
  try {
    const res = await apiCall('POST', '/api/science-lab/summary', { log: SL.sessionLog, lang: currentLang });
    content.textContent = res.summary;
  } catch (e) {
    content.textContent = e.message;
  }
});
document.getElementById('slSummaryCloseBtn').addEventListener('click', () => document.getElementById('slSummaryModal').classList.add('hidden'));

// ---------- الرجوع ----------
document.getElementById('slBackBtn').addEventListener('click', () => document.getElementById('globalBackBtn').click());

// ---------- تحميل الشاشة ----------
function loadScienceLabScreen() {
  clearError('slError');
  if (!SL.initialized) {
    try {
      slInitThreeScene();
    } catch (e) {
      showError('slError', t('sl_err_3d_unsupported'));
    }
    slRenderBioCategories();
    slRenderTray();
    SL.initialized = true;
  } else {
    setTimeout(slOnSceneResize, 0);
  }
}
