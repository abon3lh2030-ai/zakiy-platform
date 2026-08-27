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
    id: 'sugar', nameKey: 'sl_item_sugar_name', descKey: 'sl_item_sugar_desc', usageKey: 'sl_item_sugar_usage',
    build() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      box.position.y = 0.04;
      g.add(box);
      return g;
    },
  },
  {
    id: 'ice', nameKey: 'sl_item_ice_name', descKey: 'sl_item_ice_desc', usageKey: 'sl_item_ice_usage',
    build() {
      const g = new THREE.Group();
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, roughness: 0.05 }));
      cube.rotation.y = 0.4;
      cube.position.y = 0.05;
      g.add(cube);
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
  [slPairKey('sugar', 'water_hot')]: 'sl_reaction_sugar_hot',
  [slPairKey('sugar', 'water_cold')]: 'sl_reaction_sugar_cold',
  [slPairKey('ice', 'bunsen_burner')]: 'sl_reaction_ice_burner',
  [slPairKey('ice', 'water_hot')]: 'sl_reaction_ice_hot',
  [slPairKey('ice', 'water_cold')]: 'sl_reaction_ice_cold',
};

// ---------- تصنيف عام لكل قطعة - يُستخدم لتوليد رد تعليمي معقول لأي مزيج
// ما له تفاعل محدد بالضبط أعلاه، بدل "جرّب شي ثاني" لكل مزيج غير مغطّى -
// كذا أغلب المحاولات تطلع لها فايدة تعليمية حتى لو ما كانت بقاعدة البيانات ----------
const SL_ITEM_CATEGORY = {
  beaker: 'container', flask: 'container',
  vinegar: 'liquid', food_coloring: 'liquid', water_cold: 'liquid', water_warm: 'liquid', water_hot: 'liquid',
  baking_soda: 'solid', salt: 'solid', sugar: 'solid', ice: 'solid',
  bunsen_burner: 'heat', thermometer: 'tool', paper: 'tool',
};
function slGenericReactionText(a, b) {
  const catA = SL_ITEM_CATEGORY[a], catB = SL_ITEM_CATEGORY[b];
  const nameA = t(slItemNameKey(a)), nameB = t(slItemNameKey(b));
  if ((catA === 'tool' && catB === 'liquid') || (catB === 'tool' && catA === 'liquid')) {
    const tool = catA === 'tool' ? a : b, liquid = catA === 'liquid' ? nameA : nameB;
    if (tool === 'thermometer') return t('sl_reaction_generic_measure', { liquid, tool: t(slItemNameKey(tool)) });
    return t('sl_reaction_generic_tool_liquid', { tool: t(slItemNameKey(tool)), liquid });
  }
  if ((catA === 'heat' && catB === 'solid') || (catB === 'heat' && catA === 'solid')) {
    const solid = catA === 'solid' ? nameA : nameB;
    return t('sl_reaction_generic_heat_solid', { solid });
  }
  if ((catA === 'container' && (catB === 'liquid' || catB === 'solid')) || (catB === 'container' && (catA === 'liquid' || catA === 'solid'))) {
    const content = catA === 'container' ? nameB : nameA, container = catA === 'container' ? nameA : nameB;
    return t('sl_reaction_generic_container', { content, container });
  }
  if (catA === 'solid' && catB === 'solid') return t('sl_reaction_generic_two_solids', { a: nameA, b: nameB });
  if (catA === 'liquid' && catB === 'liquid') return t('sl_reaction_generic_two_liquids', { a: nameA, b: nameB });
  return t('sl_reaction_none_pair', { a: nameA, b: nameB });
}

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

  // كوب + نافورة ماء متحركة تحت الحنفية - تشتغل وقت اختيار نوع الماء
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.11, 0.28, 16, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide })
  );
  cup.position.set(4.6 + 0.16, 0.14, -0.4 - 0.35);
  SL.scene.add(cup);
  SL.cupWaterBaseY = 0.02;
  SL.cupWaterFullHeight = 0.22;
  SL.cupWaterMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.09, SL.cupWaterFullHeight, 16),
    new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 })
  );
  SL.cupWaterMesh.position.set(cup.position.x, SL.cupWaterBaseY, cup.position.z);
  SL.cupWaterMesh.visible = false;
  SL.scene.add(SL.cupWaterMesh);

  SL.streamMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0.75 })
  );
  SL.streamMesh.position.set(4.6 + 0.16, 1.0, -0.4 - 0.75);
  SL.streamMesh.visible = false;
  SL.scene.add(SL.streamMesh);

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
  if (SL.waterAnim) slUpdateWaterAnim();
  SL.renderer.render(SL.scene, SL.camera);
}

// ---------- أنيميشن ماء يجي من الحنفية ويتعبى بكوب ----------
const SL_WATER_COLORS = { cold: 0x66ccff, warm: 0x5fb0e0, hot: 0xff9a66 };
function slPourWaterAnimation(temp, onDone) {
  const color = SL_WATER_COLORS[temp] || 0x66ccff;
  SL.streamMesh.material.color.setHex(color);
  SL.cupWaterMesh.material.color.setHex(color);
  SL.cupWaterMesh.scale.y = 0.001;
  SL.cupWaterMesh.visible = true;
  SL.streamMesh.visible = true;
  SL.waterAnim = { startTime: performance.now(), duration: 1100, onDone };
}
function slUpdateWaterAnim() {
  const elapsed = performance.now() - SL.waterAnim.startTime;
  const progress = Math.min(1, elapsed / SL.waterAnim.duration);
  SL.cupWaterMesh.scale.y = Math.max(0.001, progress);
  SL.cupWaterMesh.position.y = SL.cupWaterBaseY - (SL.cupWaterFullHeight * (1 - progress)) / 2;
  if (progress >= 1) {
    SL.streamMesh.visible = false;
    const done = SL.waterAnim.onDone;
    SL.waterAnim = null;
    if (done) done();
  }
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
const SL_TRAY_MAX = 4;
function slAddToTray(id) {
  if (SL.tray.length >= SL_TRAY_MAX || SL.tray.includes(id)) return;
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
  document.getElementById('slReactBtn').classList.toggle('hidden', SL.tray.length < 2);
  document.getElementById('slClearTrayBtn').classList.toggle('hidden', SL.tray.length === 0);
}
document.getElementById('slClearTrayBtn').addEventListener('click', () => {
  SL.tray = [];
  slRenderTray();
  document.getElementById('slReactionResult').classList.add('hidden');
});
document.getElementById('slReactBtn').addEventListener('click', () => {
  // نفاعل كل زوج ممكن بين القطع المختارة (مو بس أول قطعتين) - تقدر تحط
  // أكثر من مكونين وتشوف كل التفاعلات الممكنة بينهم دفعة وحدة
  const results = [];
  for (let i = 0; i < SL.tray.length; i++) {
    for (let j = i + 1; j < SL.tray.length; j++) {
      const key = slPairKey(SL.tray[i], SL.tray[j]);
      const reactionKey = SL_REACTIONS[key];
      const text = reactionKey ? t(reactionKey) : slGenericReactionText(SL.tray[i], SL.tray[j]);
      results.push({ a: SL.tray[i], b: SL.tray[j], text });
      SL.sessionLog.push(`${t('sl_log_reaction_prefix')}: ${t(slItemNameKey(SL.tray[i]))} + ${t(slItemNameKey(SL.tray[j]))} → ${text}`);
    }
  }
  const box = document.getElementById('slReactionResult');
  box.innerHTML = results.map(r => `<p>${escapeHtml(r.text)}</p>`).join('');
  box.classList.remove('hidden');
  slPlayReactionEffect();
  SL.tray = [];
  slRenderTray();
});

// ---------- تأثير بصري عام وقت أي تفاعل (فقاعات ملوّنة تطلع فوق الرف) ----------
function slPlayReactionEffect() {
  if (!SL.scene) return;
  const colors = [0x66ccff, 0xff8a5c, 0x8be08b, 0xffe14d];
  for (let i = 0; i < 14; i++) {
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 10, 10),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.85 })
    );
    bubble.position.set(-2 + Math.random() * 4, 1.9, Math.random() * 0.6 - 0.3);
    SL.scene.add(bubble);
    const start = performance.now();
    const riseSpeed = 0.9 + Math.random() * 0.8;
    const drift = (Math.random() - 0.5) * 0.6;
    const startX = bubble.position.x;
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 1.4) { SL.scene.remove(bubble); bubble.geometry.dispose(); bubble.material.dispose(); return; }
      bubble.position.y = 1.9 + elapsed * riseSpeed;
      bubble.position.x = startX + drift * elapsed;
      bubble.material.opacity = 0.85 * (1 - elapsed / 1.4);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ---------- المغسلة ----------
document.querySelectorAll('#slSinkPanel [data-temp]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('slSinkPanel').classList.add('hidden');
    slPourWaterAnimation(btn.dataset.temp, () => slAddToTray('water_' + btn.dataset.temp));
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

// ---------- مشاريع جاهزة (نفس فكرة أمثلة معمل الروبوتات) - تحمّل قطع
// جاهزة بصينية التفاعل مباشرة عشان تجرّب سيناريو تعليمي بضغطة وحدة ----------
const SL_PROJECTS = {
  volcano: ['vinegar', 'baking_soda'],
  dissolve_race: ['sugar', 'water_hot'],
  diffusion: ['food_coloring', 'water_cold'],
  melting: ['ice', 'bunsen_burner'],
};
document.getElementById('slProjectSelect').addEventListener('change', (e) => {
  const key = e.target.value;
  e.target.value = '';
  if (!key || !SL_PROJECTS[key]) return;
  slSwitchTab('chemistry');
  SL.tray = [...SL_PROJECTS[key]];
  slRenderTray();
  document.getElementById('slReactionResult').classList.add('hidden');
});

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
  liver: { nameKey: 'sl_part_liver_name', descKey: 'sl_part_liver_desc' },
  intestines: { nameKey: 'sl_part_intestines_name', descKey: 'sl_part_intestines_desc' },
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
// ---------- رسم تشريحي ثلاثي الأبعاد حقيقي (three.js) - جسم شفاف قليل
// الأضلاع (low-poly) والأعضاء كرات ملوّنة بداخله فعليًا، تقدر تدوّره
// بالسحب وتضغط على أي عضو "من جواه مباشرة" (نفس تقنية رف الكيمياء
// بالضبط - أشكال هندسية + Raycasting - مو رسم يدوي مسطّح) ---------- */
const SL_ORGAN_3D_DEFS = {
  brain: { pos: [0, 1.72, 0.05], color: 0xc04f8c, r: 0.1 },
  heart: { pos: [-0.07, 1.22, 0.2], color: 0xd81e3e, r: 0.09 },
  lungs: { pos: [0.13, 1.22, 0.15], color: 0xef6b6b, r: 0.13, mirror: true },
  liver: { pos: [0.14, 0.98, 0.2], color: 0x8a5a2b, r: 0.12 },
  stomach: { pos: [-0.11, 0.95, 0.2], color: 0xe8a33f, r: 0.1 },
  intestines: { pos: [0, 0.75, 0.2], color: 0xe0a868, r: 0.15 },
  kidneys: { pos: [0.19, 0.88, -0.05], color: 0x7b3f8c, r: 0.06, mirror: true },
  skin: { pos: [0, 1.4, 0.35], color: 0xf0c9a0, r: 0.001 }, // نقطة وهمية، الجلد نفسه هو جسم الشفافية الخارجي
};
function slBuildBodyScene(canvas, organIds) {
  const wrap = canvas.parentElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, wrap.clientWidth / Math.max(1, wrap.clientHeight), 0.1, 50);
  camera.position.set(0, 1.15, 3.6);
  camera.lookAt(0, 1.1, 0);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dl = new THREE.DirectionalLight(0xffffff, 0.75);
  dl.position.set(3, 5, 4);
  scene.add(dl);

  const bodyGroup = new THREE.Group();
  const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xf0c9a0, transparent: true, opacity: 0.3, roughness: 0.3, side: THREE.DoubleSide });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 20), skinMat);
  head.position.y = 1.72;
  bodyGroup.add(head);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 8, 16), skinMat);
  torso.position.y = 1.05;
  bodyGroup.add(torso);
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.7, 6, 10);
  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-0.5, 1.05, 0);
  bodyGroup.add(armL);
  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(0.5, 1.05, 0);
  bodyGroup.add(armR);
  const legGeo = new THREE.CapsuleGeometry(0.13, 0.85, 6, 10);
  const legL = new THREE.Mesh(legGeo, skinMat);
  legL.position.set(-0.17, 0.15, 0);
  bodyGroup.add(legL);
  const legR = new THREE.Mesh(legGeo, skinMat);
  legR.position.set(0.17, 0.15, 0);
  bodyGroup.add(legR);
  scene.add(bodyGroup);

  const hoverables = [];
  organIds.forEach(id => {
    const def = SL_ORGAN_3D_DEFS[id];
    if (!def || id === 'skin') return;
    const geo = new THREE.SphereGeometry(def.r, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
    mesh.userData.slBodyPart = id;
    bodyGroup.add(mesh);
    hoverables.push(mesh);
    if (def.mirror) {
      const mesh2 = new THREE.Mesh(geo, mat);
      mesh2.position.set(-def.pos[0], def.pos[1], def.pos[2]);
      mesh2.userData.slBodyPart = id;
      bodyGroup.add(mesh2);
      hoverables.push(mesh2);
    }
  });
  // الجلد نفسه (جسم الشفافية الخارجي) قابل للضغط لو ما ضغطنا عضو محدد
  [head, torso, armL, armR, legL, legR].forEach(m => { m.userData.slBodyPart = 'skin'; hoverables.push(m); });

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let dragging = false, lastX = 0, lastY = 0;

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(hoverables, false);
  }
  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      bodyGroup.rotation.y += (e.clientX - lastX) * 0.012;
      lastX = e.clientX; lastY = e.clientY;
      return;
    }
    canvas.style.cursor = pick(e).length ? 'pointer' : 'grab';
  });
  canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('click', (e) => {
    if (Math.abs(e.clientX - lastX) > 3 || Math.abs(e.clientY - lastY) > 3) return; // كانت سحب دوران، مو ضغطة عضو
    const hits = pick(e);
    if (hits.length) slShowOrganInfo(hits[0].object.userData.slBodyPart);
  });

  let frameId;
  (function animate() {
    frameId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  })();

  function onResize() {
    if (!wrap.clientWidth) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }
  window.addEventListener('resize', onResize);
  return { stop() { cancelAnimationFrame(frameId); window.removeEventListener('resize', onResize); } };
}
function slShowOrganInfo(partId) {
  const info = SL_PARTS_INFO[partId];
  if (!info) return;
  SL.sessionLog.push(`${t('sl_log_part_prefix')}: ${t(info.nameKey)}`);
  const box = document.getElementById('slPartDescBox');
  if (!box) return;
  box.innerHTML = `<b>${t(info.nameKey)}</b><br>${t(info.descKey)}`;
  box.classList.remove('hidden');
}
function slRenderBodyScene(containerEl, organIds) {
  containerEl.classList.remove('hidden');
  containerEl.innerHTML = `
    <p class="desc" data-i18n="sl_body_hint">${t('sl_body_hint')}</p>
    <div class="sl-body-svg-wrap"><canvas id="slBodyCanvas"></canvas></div>
    <div class="sl-bio-part-desc hidden" id="slPartDescBox"></div>
  `;
  if (SL.bodySceneHandle) { SL.bodySceneHandle.stop(); SL.bodySceneHandle = null; }
  try {
    SL.bodySceneHandle = slBuildBodyScene(containerEl.querySelector('#slBodyCanvas'), organIds);
  } catch (e) {
    containerEl.querySelector('.sl-body-svg-wrap').innerHTML = `<p class="desc">${t('sl_err_3d_unsupported')}</p>`;
  }
}
function slOpenBioDetail(kind, animalId) {
  document.getElementById('slBioCategoryView').classList.add('hidden');
  document.getElementById('slBioGridView').classList.add('hidden');
  document.getElementById('slBioDetailView').classList.remove('hidden');
  const content = document.getElementById('slBioDetailContent');
  if (kind === 'human') {
    content.innerHTML = `<h3 class="sub-heading">${t('sl_cat_human')}</h3><div id="slHumanPartsWrap"></div>`;
    slRenderBodyScene(content.querySelector('#slHumanPartsWrap'), SL_BODY_PARTS.human);
  } else {
    SL.bioItem = animalId;
    const a = SL_ANIMALS[animalId];
    SL.sessionLog.push(`${t('sl_log_animal_prefix')}: ${t(a.nameKey)}`);
    content.innerHTML = `
      <div class="sl-bio-detail-header"><span class="sl-bio-detail-icon">${a.icon}</span><h3>${t(a.nameKey)}</h3></div>
      <ul class="sl-bio-fact-list">${a.factsKeys.map(k => `<li>${t(k)}</li>`).join('')}</ul>
      <div id="slAnimalPartsWrap"></div>
    `;
    slRenderBodyScene(content.querySelector('#slAnimalPartsWrap'), SL_BODY_PARTS.animal_generic);
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
