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
    // قطرة ماء وحدة بلا كوب ولا أي إناء - تضغطها يطلع لك خيار تختار بروده
    // الماء (بارد/دافئ/حار) بمنبثقة صغيرة، بلا حنفية ولا مغسلة ولا أنيميشن
    id: 'water', nameKey: 'sl_item_water_name', descKey: 'sl_item_water_desc', usageKey: 'sl_item_water_usage',
    build() {
      const g = new THREE.Group();
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 16, 16),
        new THREE.MeshPhysicalMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.88, roughness: 0.1, clearcoat: 1 })
      );
      drop.scale.set(1, 1.35, 1);
      drop.position.y = 0.05;
      g.add(drop);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.16, 16),
        new THREE.MeshPhysicalMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.88, roughness: 0.1 })
      );
      tip.position.y = 0.32;
      g.add(tip);
      return g;
    },
  },
  {
    id: 'paper', nameKey: 'sl_item_paper_name', descKey: 'sl_item_paper_desc', usageKey: 'sl_item_paper_usage',
    build() {
      const g = new THREE.Group();
      const sheet = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.012, 0.44),
        new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.7 })
      );
      sheet.position.y = 0.02;
      sheet.rotation.z = 0.05;
      g.add(sheet);
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

// قطرة الماء وحدها مو مادة تتفاعل - وقت ما تنضاف للصينية تكون فعليًا
// بأحد أشكالها الثلاثة (باردة/دافئة/حارة) حسب اختيار الطالب بالمنبثقة
const SL_WATER_VARIANTS = { water_cold: 'sl_item_water_cold_name', water_warm: 'sl_item_water_warm_name', water_hot: 'sl_item_water_hot_name' };
function slItemNameKey(id) {
  const shelfItem = SL_SHELF_ITEMS.find(i => i.id === id);
  return shelfItem ? shelfItem.nameKey : SL_WATER_VARIANTS[id];
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
};

// ---------- تصنيف عام لكل قطعة - يُستخدم لتوليد رد تعليمي معقول لأي مزيج
// ما له تفاعل محدد بالضبط أعلاه، بدل "جرّب شي ثاني" لكل مزيج غير مغطّى -
// كذا أغلب المحاولات تطلع لها فايدة تعليمية حتى لو ما كانت بقاعدة البيانات ----------
const SL_ITEM_CATEGORY = {
  beaker: 'container', flask: 'container',
  vinegar: 'liquid', food_coloring: 'liquid', water_cold: 'liquid', water_warm: 'liquid', water_hot: 'liquid',
  baking_soda: 'solid', salt: 'solid', sugar: 'solid',
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

  // صحن تفاعل ثابت قدام الرف مباشرة بمجال الرؤية - كل تفاعل يصير فعليًا
  // بمكان واحد واضح (يتلوّن، يفور، يطلع فقاعات) بدل ما يكون تأثير عائم
  // بالهواء بلا مصدر - عشان التفاعل "يصير" فعلًا مو مجرد نص
  const dishBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.5, 0.12, 28),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f2, metalness: 0.1, roughness: 0.3 })
  );
  dishBase.position.set(0, -0.44, 2.1);
  SL.scene.add(dishBase);
  const dishLiquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.4, 0.5, 28),
    new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0.88 })
  );
  dishLiquid.position.set(0, -0.42, 2.1);
  dishLiquid.scale.y = 0.001;
  dishLiquid.visible = false;
  SL.scene.add(dishLiquid);
  SL.reactionDish = { liquid: dishLiquid, baseY: -0.42, x: 0, z: 2.1 };

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
  while (o && !o.userData.slItem) o = o.parent;
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
  const picker = document.getElementById('slWaterPicker');
  if (!root || !root.userData.slItem) { picker.classList.add('hidden'); return; }
  const item = root.userData.slItem;
  if (item.id === 'water') {
    // بدل ما نحطها بالصينية مباشرة، نطلع منبثقة صغيرة بس (بلا حنفية ولا
    // مغسلة ولا أي انيميشن) تختار منها بروده الماء
    const wrapRect = document.getElementById('slSceneWrap').getBoundingClientRect();
    picker.style.left = (e.clientX - wrapRect.left) + 'px';
    picker.style.top = (e.clientY - wrapRect.top) + 'px';
    picker.classList.remove('hidden');
  } else {
    picker.classList.add('hidden');
    slAddToTray(item.id);
  }
}
document.querySelectorAll('#slWaterPicker [data-temp]').forEach(btn => {
  btn.addEventListener('click', () => {
    slAddToTray('water_' + btn.dataset.temp);
    document.getElementById('slWaterPicker').classList.add('hidden');
  });
});

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
  const involved = [];
  for (let i = 0; i < SL.tray.length; i++) {
    for (let j = i + 1; j < SL.tray.length; j++) {
      const key = slPairKey(SL.tray[i], SL.tray[j]);
      const reactionKey = SL_REACTIONS[key];
      const text = reactionKey ? t(reactionKey) : slGenericReactionText(SL.tray[i], SL.tray[j]);
      results.push({ a: SL.tray[i], b: SL.tray[j], text });
      involved.push(SL.tray[i], SL.tray[j]);
      SL.sessionLog.push(`${t('sl_log_reaction_prefix')}: ${t(slItemNameKey(SL.tray[i]))} + ${t(slItemNameKey(SL.tray[j]))} → ${text}`);
    }
  }
  const box = document.getElementById('slReactionResult');
  box.innerHTML = results.map(r => `<p>${escapeHtml(r.text)}</p>`).join('');
  box.classList.remove('hidden');
  slPlayReactionEffect(involved);
  SL.tray = [];
  slRenderTray();
});

// ---------- تأثير بصري وقت التفاعل - يصير فعليًا بصحن التفاعل الثابت
// قدام الرف: يتلوّن حسب المواد، يفور ويهتز، يطلع منه فقاعات ورذاذ صاعد،
// موجة ضوئية تتوسع، وومضة إضاءة قصيرة - كل شي مصدره نقطة واحدة واضحة
// بمنتصف المشهد، مو مجرد فقاعات عائمة بالهواء بلا مصدر ----------
function slPlayReactionEffect(itemIds) {
  if (!SL.scene || !SL.reactionDish) return;
  const dish = SL.reactionDish;
  const cats = (itemIds || []).map(id => SL_ITEM_CATEGORY[id]);
  let colors = [0x8be08b, 0xffffff, 0x9fe6ff, 0xffe14d];
  let dishColor = 0x9fe6ff;
  if (itemIds && itemIds.includes('vinegar') && itemIds.includes('baking_soda')) {
    colors = [0xffffff, 0xd6f5ff, 0x9fe6ff, 0xffffff]; dishColor = 0xeafcff;
  } else if (cats.includes('heat')) {
    colors = [0xff8c1a, 0xff5500, 0xffd24d, 0xff2e2e]; dishColor = 0xff8c1a;
  } else if (itemIds && itemIds.includes('food_coloring')) {
    colors = [0xe0473a, 0xff7a6b, 0xffb199, 0xffffff]; dishColor = 0xe0473a;
  }

  // الصحن نفسه يتعبى ويفور وينزل
  dish.liquid.material.color.setHex(dishColor);
  dish.liquid.visible = true;
  dish.liquid.scale.y = 0.001;
  const dishStart = performance.now();
  const tickDish = () => {
    const el = (performance.now() - dishStart) / 1000;
    if (el < 0.35) {
      dish.liquid.scale.y = Math.max(0.001, el / 0.35);
    } else if (el < 1.6) {
      dish.liquid.scale.y = 1 + Math.sin(el * 14) * 0.07;
      dish.liquid.position.y = dish.baseY + Math.sin(el * 14) * 0.02;
    } else if (el < 2.2) {
      dish.liquid.scale.y = Math.max(0.001, 1 - (el - 1.6) / 0.6);
    } else {
      dish.liquid.visible = false;
      return;
    }
    requestAnimationFrame(tickDish);
  };
  requestAnimationFrame(tickDish);

  // رذاذ/فقاعات تطلع من فوق الصحن مباشرة
  for (let i = 0; i < 26; i++) {
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 + Math.random() * 0.08, 10, 10),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.9 })
    );
    bubble.position.set(dish.x + (Math.random() - 0.5) * 0.6, dish.baseY + 0.15, dish.z + (Math.random() - 0.5) * 0.6);
    SL.scene.add(bubble);
    const start = performance.now();
    const delay = Math.random() * 250;
    const riseSpeed = 1.1 + Math.random() * 1.2;
    const drift = (Math.random() - 0.5) * 1.1;
    const startX = bubble.position.x, startZ = bubble.position.z;
    const tick = () => {
      const elapsed = performance.now() - start - delay;
      if (elapsed < 0) { requestAnimationFrame(tick); return; }
      const sec = elapsed / 1000;
      if (sec > 1.3) { SL.scene.remove(bubble); bubble.geometry.dispose(); bubble.material.dispose(); return; }
      bubble.position.y = dish.baseY + 0.15 + sec * riseSpeed;
      bubble.position.x = startX + drift * sec;
      bubble.position.z = startZ + drift * 0.4 * sec;
      bubble.material.opacity = 0.9 * (1 - sec / 1.3);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // موجة ضوئية دائرية تتوسع من الصحن
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.18, 32),
    new THREE.MeshBasicMaterial({ color: dishColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(dish.x, dish.baseY + 0.13, dish.z);
  SL.scene.add(ring);
  const ringStart = performance.now();
  const tickRing = () => {
    const el = (performance.now() - ringStart) / 1000;
    if (el > 1) { SL.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); return; }
    const s = 1 + el * 9;
    ring.scale.set(s, s, 1);
    ring.material.opacity = 0.85 * (1 - el / 1);
    requestAnimationFrame(tickRing);
  };
  requestAnimationFrame(tickRing);

  // ومضة إضاءة قصيرة تبرز لحظة التفاعل
  const flash = new THREE.PointLight(dishColor, 3.2, 7);
  flash.position.set(dish.x, dish.baseY + 1, dish.z + 0.5);
  SL.scene.add(flash);
  const flashStart = performance.now();
  const tickFlash = () => {
    const el = (performance.now() - flashStart) / 1000;
    if (el > 0.5) { SL.scene.remove(flash); return; }
    flash.intensity = 3.2 * (1 - el / 0.5);
    requestAnimationFrame(tickFlash);
  };
  requestAnimationFrame(tickFlash);
}

// ---------- تبديل التبويب (كيمياء ⇄ أحياء) ----------
function slSwitchTab(tab) {
  document.getElementById('slTabChemistryBtn').classList.toggle('active', tab === 'chemistry');
  document.getElementById('slTabBiologyBtn').classList.toggle('active', tab === 'biology');
  document.getElementById('slChemPanel').classList.toggle('hidden', tab !== 'chemistry');
  document.getElementById('slBioPanel').classList.toggle('hidden', tab !== 'biology');
  if (tab === 'chemistry') {
    setTimeout(slOnSceneResize, 0);
    if (SL.bodySceneHandle) { SL.bodySceneHandle.stop(); SL.bodySceneHandle = null; }
  }
}
document.getElementById('slTabChemistryBtn').addEventListener('click', () => slSwitchTab('chemistry'));
document.getElementById('slTabBiologyBtn').addEventListener('click', () => slSwitchTab('biology'));

// ---------- مشاريع جاهزة (نفس فكرة أمثلة معمل الروبوتات) - تحمّل قطع
// جاهزة بصينية التفاعل مباشرة عشان تجرّب سيناريو تعليمي بضغطة وحدة ----------
const SL_PROJECTS = {
  volcano: ['vinegar', 'baking_soda'],
  dissolve_race: ['sugar', 'water_hot'],
  diffusion: ['food_coloring', 'water_cold'],
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
  animal_generic: ['heart', 'lungs', 'brain', 'stomach', 'liver', 'intestines', 'kidneys', 'skin'],
  human: ['heart', 'lungs', 'brain', 'stomach', 'liver', 'intestines', 'kidneys', 'skin'],
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
// ============================================================================
// ---------- جسم الإنسان: نموذج 3D حقيقي (مو صورة، مو أشكال هندسية بدائية)
// مبني من بيانات تشريحية طبية فعلية (BodyParts3D/Anatomography، مشروع
// قاعدة بيانات علوم الحياة اليابانية DBCLS، رخصة CC BY-SA 2.1 اليابان).
// الملفات مبسّطة الشبكة (quadric decimation) عشان تحمّل بسرعة بالمتصفح -
// كل عضو شكله الحقيقي (مو كرة/كبسولة)، وكلها بنفس نظام إحداثيات الجسم
// الأصلي فتترتب صح تلقائيًا بدون أي تخمين مواضع يدوي. تقدر تسحب الجسم
// تدوّره، وتضغط على أي عضو حقيقي الشكل من جواه فيطلع اسمه ووظيفته تحت.
// ============================================================================
const SL_ORGANS_BASE_URL = '/assets/organs/';
const SL_HUMAN_ORGAN_MODELS = [
  { part: 'heart', file: 'heart.stl', color: 0xd81e3e },
  { part: 'lungs', file: 'lungs.stl', color: 0xef6b6b },
  { part: 'liver', file: 'liver.stl', color: 0x8a5a2b },
  { part: 'stomach', file: 'stomach.stl', color: 0xe8a33f },
  { part: 'kidneys', file: 'kidneys.stl', color: 0x7b3f8c },
  { part: 'intestines', file: 'intestines.stl', color: 0xe0a868 },
];
// محلّل ملفات STL الثنائية - صيغة بسيطة وثابتة (لا تحتاج مكتبة خارجية):
// 80 بايت هيدر + 4 بايت عدد المثلثات، وبعدها لكل مثلث 12 بايت اتجاه
// عمودي + 3×12 بايت رؤوس + 2 بايت attribute
function slParseSTL(buffer) {
  const dv = new DataView(buffer);
  const triCount = dv.getUint32(80, true);
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const nx = dv.getFloat32(offset, true), ny = dv.getFloat32(offset + 4, true), nz = dv.getFloat32(offset + 8, true);
    offset += 12;
    for (let v = 0; v < 3; v++) {
      const vi = i * 9 + v * 3;
      positions[vi] = dv.getFloat32(offset, true);
      positions[vi + 1] = dv.getFloat32(offset + 4, true);
      positions[vi + 2] = dv.getFloat32(offset + 8, true);
      normals[vi] = nx; normals[vi + 1] = ny; normals[vi + 2] = nz;
      offset += 12;
    }
    offset += 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}
async function slFetchSTL(file) {
  const res = await fetch(SL_ORGANS_BASE_URL + file);
  if (!res.ok) throw new Error('fetch ' + file + ' failed');
  return slParseSTL(await res.arrayBuffer());
}
async function slBuildHumanBodyScene3D(canvas) {
  const wrap = canvas.parentElement;
  const [skinGeo, ...organGeos] = await Promise.all([
    slFetchSTL('skin.stl'),
    ...SL_HUMAN_ORGAN_MODELS.map(o => slFetchSTL(o.file)),
  ]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, wrap.clientWidth / Math.max(1, wrap.clientHeight), 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9);
  dl.position.set(3, 6, 4);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dl2.position.set(-3, -1, -4);
  scene.add(dl2);

  const bodyGroup = new THREE.Group();
  const skinMesh = new THREE.Mesh(skinGeo, new THREE.MeshPhysicalMaterial({
    color: 0xf0c9a0, transparent: true, opacity: 0.22, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false,
  }));
  bodyGroup.add(skinMesh);

  const hoverables = [];
  SL_HUMAN_ORGAN_MODELS.forEach((def, i) => {
    const mesh = new THREE.Mesh(organGeos[i], new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, flatShading: true }));
    mesh.userData.slBodyPart = def.part;
    bodyGroup.add(mesh);
    hoverables.push(mesh);
  });

  // الدماغ - الاستثناء الوحيد: بيانات المصدر تقسّمه لأكثر من 100 قطعة
  // تلافيف صغيرة بلا نصف-كرة واحدة متاحة، فتركته شكل بيضاوي بسيط بمكان
  // الرأس (كل الأعضاء الست الثانية + الجلد حقيقية 100%)
  const brainMesh = new THREE.Mesh(
    new THREE.SphereGeometry(60, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xc04f8c, roughness: 0.5 })
  );
  brainMesh.scale.set(1.1, 0.85, 1.3);
  brainMesh.position.set(0, 1555, 95);
  brainMesh.userData.slBodyPart = 'brain';
  bodyGroup.add(brainMesh);
  hoverables.push(brainMesh);

  // البيانات الأصلية بالميليمتر (طول ~1650) - نصغّرها لمقياس مريح ونوسّطها
  const box = new THREE.Box3().setFromObject(bodyGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // مهم: نحسب المقياس أول، وبعدين نطبّق الإزاحة "بعد" ضربها بنفس المقياس -
  // لأن تحويل three.js يطبّق (Scale) على الإحداثيات المحلية قبل (Position)،
  // فلو حطينا مركز الجسم كموضع بوحدات المليمتر الأصلية الضخمة بدون تصغيرها
  // بيفضل الجسم "بعيد" آلاف الوحدات عن الكاميرا رغم إنه صغّرناه بصريًا
  const scale = 3.4 / size.y;
  bodyGroup.scale.setScalar(scale);
  bodyGroup.position.copy(center).multiplyScalar(-scale);
  scene.add(bodyGroup);

  camera.position.set(0, 0, 6.2);
  camera.lookAt(0, 0, 0);

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
function slRenderHumanBodyScene3D(containerEl) {
  containerEl.classList.remove('hidden');
  containerEl.innerHTML = `
    <p class="desc">${t('sl_body_hint_3d')}</p>
    <div class="sl-body-canvas-wrap"><canvas id="slBodyCanvas3D"></canvas></div>
    <p class="sl-body-credit">${t('sl_body_credit_human3d')}</p>
    <div class="sl-bio-part-desc hidden" id="slPartDescBox"></div>
  `;
  if (SL.bodySceneHandle) { SL.bodySceneHandle.stop(); SL.bodySceneHandle = null; }
  slBuildHumanBodyScene3D(containerEl.querySelector('#slBodyCanvas3D'))
    .then(handle => { SL.bodySceneHandle = handle; })
    .catch(() => {
      const w = containerEl.querySelector('.sl-body-canvas-wrap');
      if (w) w.innerHTML = `<p class="desc">${t('sl_body_img_error')}</p>`;
    });
}

// ---------- رسم تشريحي للحيوانات - صورة طبية فعلية (مرخّصة استخدام حر)
// عليها نقاط ضغط شفافة بمواضع الأعضاء، تضغط على أي عضو "من جوا الجسم
// مباشرة" فيكبّر (zoom) عليه ويطلع اسمه ووظيفته تحت (ما فيه بيانات 3D
// حرة الترخيص لحيوانات متاحة زي الإنسان، فهذا أفضل بديل واقعي) ----------
const SL_BODY_IMAGES = {
  // صور تشريح حسب أقرب تصنيف حيوان حقيقي متوفر - بدل صورة واحدة عامة
  // لكل الحيوانات (كانت تطلع "كلب" حتى لو فاتح صفحة أسد) نستخدم أقرب قريب
  // حقيقي متوفر له صورة تشريح موثوقة: قطط فعلية للأسد والقطة (نفس الفصيلة)،
  // كلب كمرجع عام لباقي الثدييات، أفعى للزواحف، سمكة للأسماك
  dog: {
    // كلب - رخصة CC BY-SA 4.0 من ويكيميديا كومنز
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Dog_Internal_Anatomy.svg',
    credit: 'sl_body_credit_dog',
    hotspots: [
      { part: 'brain', x: 16.7, y: 9.2 },
      { part: 'lungs', x: 17.8, y: 26.7 },
      { part: 'heart', x: 20.6, y: 35 },
      { part: 'liver', x: 29.4, y: 28.3 },
      { part: 'stomach', x: 31.1, y: 34.2 },
      { part: 'kidneys', x: 36.1, y: 25 },
      { part: 'intestines', x: 39.4, y: 31.7 },
      { part: 'skin', x: 33.3, y: 46.7 },
    ],
  },
  cat: {
    // قطة - رخصة CC BY-SA 3.0 من ويكيميديا كومنز (لا يوجد تشريح مخصص
    // للأسد فعليًا بأي مصدر حر، والقطة أقرب قريب حقيقي له - نفس الفصيلة)
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Scheme_cat_anatomy.svg',
    credit: 'sl_body_credit_cat',
    hotspots: [
      { part: 'brain', x: 27.9, y: 25.5 },
      { part: 'lungs', x: 43.3, y: 40.5 },
      { part: 'heart', x: 53.9, y: 45.1 },
      { part: 'liver', x: 59.1, y: 42.8 },
      { part: 'stomach', x: 63.3, y: 40.5 },
      { part: 'kidneys', x: 65.1, y: 34.7 },
      { part: 'intestines', x: 67.3, y: 44 },
      { part: 'skin', x: 45.2, y: 76.4 },
    ],
  },
  reptile: {
    // أفعى - رخصة CC BY-SA 3.0 من ويكيميديا كومنز (ما فيه دماغ ظاهر
    // بهذا الرسم التشريحي، عادي - الزواحف تختلف كثير عن بعض)
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Snake-anatomy.svg',
    credit: 'sl_body_credit_reptile',
    hotspots: [
      { part: 'heart', x: 50, y: 15 },
      { part: 'lungs', x: 33.3, y: 26.7 },
      { part: 'liver', x: 25, y: 50 },
      { part: 'stomach', x: 54.2, y: 40 },
      { part: 'intestines', x: 82.8, y: 33.7 },
      { part: 'kidneys', x: 73.3, y: 76.7 },
      { part: 'skin', x: 83.3, y: 10 },
    ],
  },
  fish: {
    // سمكة - رخصة CC BY-SA 3.0 من ويكيميديا كومنز (ما فيها رئتين ولا
    // دماغ ظاهر بالرسم - الأسماك تتنفس بالخياشيم مو رئتين)
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Fish-anatomy.svg',
    credit: 'sl_body_credit_fish',
    hotspots: [
      { part: 'heart', x: 45.8, y: 60.1 },
      { part: 'liver', x: 57.8, y: 80.4 },
      { part: 'stomach', x: 76.1, y: 91.5 },
      { part: 'intestines', x: 63.1, y: 69.3 },
      { part: 'kidneys', x: 92.5, y: 49.9 },
      { part: 'skin', x: 28.9, y: 37 },
    ],
  },
};
// أي حيوان يستخدم أي صورة - أقرب تصنيف حقيقي متوفر له
const SL_ANIMAL_BODY_KEY = {
  lion: 'cat', cat: 'cat',
  elephant: 'dog', whale: 'dog', bat: 'dog',
  crocodile: 'reptile', turtle: 'reptile', snake: 'reptile', chameleon: 'reptile',
  frog: 'dog', salamander: 'dog',
  eagle: 'dog', penguin: 'dog', parrot: 'dog',
  shark: 'fish', goldfish: 'fish',
};
function slShowOrganInfo(partId) {
  const info = SL_PARTS_INFO[partId];
  if (!info) return;
  SL.sessionLog.push(`${t('sl_log_part_prefix')}: ${t(info.nameKey)}`);
  const box = document.getElementById('slPartDescBox');
  if (!box) return;
  box.innerHTML = `<b>${t(info.nameKey)}</b><br>${t(info.descKey)}`;
  box.classList.remove('hidden');
}
function slRenderBodyScene(containerEl, kind, organIds) {
  const data = SL_BODY_IMAGES[kind];
  const hotspots = data.hotspots.filter(h => organIds.includes(h.part));
  containerEl.classList.remove('hidden');
  containerEl.innerHTML = `
    <p class="desc" data-i18n="sl_body_hint">${t('sl_body_hint')}</p>
    <div class="sl-body-img-wrap" id="slBodyImgWrap">
      <button type="button" class="ghost sl-body-zoom-out hidden" id="slBodyZoomOutBtn">${t('sl_zoom_out')}</button>
      <img class="sl-body-img" id="slBodyImg" src="${data.url}" alt="">
      ${hotspots.map(h => `<button type="button" class="sl-body-hotspot" data-part="${h.part}" style="left:${h.x}%;top:${h.y}%" title="${escapeHtml(t(SL_PARTS_INFO[h.part].nameKey))}"></button>`).join('')}
    </div>
    ${data.credit ? `<p class="sl-body-credit">${t(data.credit)}</p>` : ''}
    <div class="sl-bio-part-desc hidden" id="slPartDescBox"></div>
  `;
  const wrap = containerEl.querySelector('#slBodyImgWrap');
  const img = containerEl.querySelector('#slBodyImg');
  const zoomOutBtn = containerEl.querySelector('#slBodyZoomOutBtn');
  img.addEventListener('error', () => { wrap.innerHTML = `<p class="desc">${t('sl_body_img_error')}</p>`; });
  function zoomOut() {
    img.classList.remove('zoomed');
    wrap.classList.remove('zoomed');
    zoomOutBtn.classList.add('hidden');
    wrap.querySelectorAll('.sl-body-hotspot').forEach(b => b.classList.remove('active'));
  }
  wrap.querySelectorAll('.sl-body-hotspot').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.sl-body-hotspot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wrap.style.setProperty('--sl-zoom-x', btn.style.left);
      wrap.style.setProperty('--sl-zoom-y', btn.style.top);
      img.classList.add('zoomed');
      wrap.classList.add('zoomed');
      zoomOutBtn.classList.remove('hidden');
      slShowOrganInfo(btn.dataset.part);
    });
  });
  zoomOutBtn.addEventListener('click', zoomOut);
}
function slOpenBioDetail(kind, animalId) {
  document.getElementById('slBioCategoryView').classList.add('hidden');
  document.getElementById('slBioGridView').classList.add('hidden');
  document.getElementById('slBioDetailView').classList.remove('hidden');
  const content = document.getElementById('slBioDetailContent');
  if (kind === 'human') {
    content.innerHTML = `<h3 class="sub-heading">${t('sl_cat_human')}</h3><div id="slHumanPartsWrap"></div>`;
    slRenderHumanBodyScene3D(content.querySelector('#slHumanPartsWrap'));
  } else {
    SL.bioItem = animalId;
    const a = SL_ANIMALS[animalId];
    SL.sessionLog.push(`${t('sl_log_animal_prefix')}: ${t(a.nameKey)}`);
    content.innerHTML = `
      <div class="sl-bio-detail-header"><span class="sl-bio-detail-icon">${a.icon}</span><h3>${t(a.nameKey)}</h3></div>
      <ul class="sl-bio-fact-list">${a.factsKeys.map(k => `<li>${t(k)}</li>`).join('')}</ul>
      <div id="slAnimalPartsWrap"></div>
    `;
    const bodyKey = SL_ANIMAL_BODY_KEY[animalId] || 'dog';
    slRenderBodyScene(content.querySelector('#slAnimalPartsWrap'), bodyKey, SL_BODY_PARTS.animal_generic);
  }
}
document.getElementById('slBioBackToCategoriesBtn').addEventListener('click', () => {
  document.getElementById('slBioGridView').classList.add('hidden');
  document.getElementById('slBioCategoryView').classList.remove('hidden');
});
document.getElementById('slBioBackToGridBtn').addEventListener('click', () => {
  if (SL.bodySceneHandle) { SL.bodySceneHandle.stop(); SL.bodySceneHandle = null; }
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
