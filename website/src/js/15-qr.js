// ================= QR Code (مولّد مضمّن، بدون أي خدمة خارجية) =================
// نسخة مبسّطة ومركّزة على الصحة: يدعم إصدارات 1-5 (سعة تصل ~106 بايت) بمستوى
// تصحيح أخطاء L وقناع (mask) ثابت رقم 0 - يكفي بالكامل لرابط انضمام قصير،
// ويتفادى تعقيد جداول الإصدارات الكبيرة وحساب أفضل قناع (كلاهما مصدر أخطاء
// شائع بمولّدات QR المكتوبة يدويًا، وغير ضروريين لصحة القراءة).
const QR_EXP_TABLE = new Array(256);
const QR_LOG_TABLE = new Array(256);
(function () {
  for (let i = 0; i < 8; i++) QR_EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) {
    QR_EXP_TABLE[i] = QR_EXP_TABLE[i - 4] ^ QR_EXP_TABLE[i - 5] ^ QR_EXP_TABLE[i - 6] ^ QR_EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i++) QR_LOG_TABLE[QR_EXP_TABLE[i]] = i;
})();
function qrGlog(n) { return QR_LOG_TABLE[n]; }
function qrGexp(n) { n = ((n % 255) + 255) % 255; return QR_EXP_TABLE[n]; }

function qrPolyMultiply(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) {
      if (b[j] === 0) continue;
      result[i + j] ^= qrGexp(qrGlog(a[i]) + qrGlog(b[j]));
    }
  }
  return result;
}

function qrGeneratorPolynomial(eccCount) {
  let poly = [1];
  for (let i = 0; i < eccCount; i++) poly = qrPolyMultiply(poly, [1, qrGexp(i)]);
  return poly;
}

function qrComputeEcc(dataCodewords, eccCount) {
  const generator = qrGeneratorPolynomial(eccCount);
  const remainder = dataCodewords.slice();
  remainder.push(...new Array(eccCount).fill(0));
  for (let i = 0; i < dataCodewords.length; i++) {
    const coeff = remainder[i];
    if (coeff === 0) continue;
    for (let j = 0; j < generator.length; j++) {
      remainder[i + j] ^= qrGexp(qrGlog(generator[j]) + qrGlog(coeff));
    }
  }
  return remainder.slice(dataCodewords.length);
}

// [totalDataCodewords, eccCodewordsPerBlock] لكل إصدار 1-5، مستوى تصحيح L
// (بلوك واحد بدون تجزئة - يبدأ التجزئة بإصدارات أعلى ما نحتاجها هنا)
const QR_VERSION_INFO = {
  1: { size: 21, dataCodewords: 19, eccCodewords: 7, capacity: 17 },
  2: { size: 25, dataCodewords: 34, eccCodewords: 10, capacity: 32 },
  3: { size: 29, dataCodewords: 55, eccCodewords: 15, capacity: 53 },
  4: { size: 33, dataCodewords: 80, eccCodewords: 20, capacity: 78 },
  5: { size: 37, dataCodewords: 108, eccCodewords: 26, capacity: 106 },
};

function qrPickVersion(byteLength) {
  for (let v = 1; v <= 5; v++) {
    if (byteLength <= QR_VERSION_INFO[v].capacity) return v;
  }
  throw new Error('نص طويل جدًا لمولّد الـ QR المضمّن');
}

function qrBuildDataCodewords(text, version) {
  const info = QR_VERSION_INFO[version];
  const bytes = new TextEncoder().encode(text);
  const bits = [];
  const pushBits = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };

  pushBits(0b0100, 4); // مؤشر النمط: byte mode
  pushBits(bytes.length, 8); // عدّاد الأحرف (8 بت كافية لإصدارات 1-9)
  bytes.forEach(b => pushBits(b, 8));

  const totalBits = info.dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < totalBits; i++) bits.push(0); // منهي (terminator)
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const padBytes = [0xEC, 0x11];
  let padIndex = 0;
  while (codewords.length < info.dataCodewords) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex++;
  }
  return codewords;
}

function qrIsFunctionModule(size, version, row, col) {
  // أنماط الباحث الثلاثة (7×7) + الفاصل حولها (تقريبًا 8×8 من كل زاوية)
  if ((row < 8 && col < 8) || (row < 8 && col >= size - 8) || (row >= size - 8 && col < 8)) return true;
  // خطوط التوقيت (صف/عمود 6)
  if (row === 6 || col === 6) return true;
  // نمط المحاذاة الوحيد (إصدارات 2-5 بس، بموقع ثابت حسب الإصدار)
  if (version >= 2) {
    const pos = QR_VERSION_INFO[version].size - 7; // نفس موضع مركز نمط المحاذاة الوحيد بهالإصدارات
    if (row >= pos - 2 && row <= pos + 2 && col >= pos - 2 && col <= pos + 2) return true;
  }
  // النقطة الداكنة الثابتة
  if (row === size - 8 && col === 8) return true;
  return false;
}

function qrBuildMatrix(text) {
  const version = qrPickVersion(new TextEncoder().encode(text).length);
  const info = QR_VERSION_INFO[version];
  const size = info.size;

  const dataCodewords = qrBuildDataCodewords(text, version);
  const eccCodewords = qrComputeEcc(dataCodewords, info.eccCodewords);
  const allCodewords = dataCodewords.concat(eccCodewords);

  const modules = Array.from({ length: size }, () => new Array(size).fill(null));

  const setFinder = (r, c) => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const rr = r + i, cc = c + j;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = i === -1 || i === 7 || j === -1 || j === 7;
        const inCore = i >= 1 && i <= 5 && j >= 1 && j <= 5;
        const inOuter = i >= 0 && i <= 6 && j >= 0 && j <= 6;
        modules[rr][cc] = inOuter && !inRing ? (inCore ? 1 : 0) : (inRing ? 0 : 0);
      }
    }
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 6; j++) {
        const onBorder = i === 0 || i === 6 || j === 0 || j === 6;
        const inCore = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        modules[r + i][c + j] = (onBorder || inCore) ? 1 : 0;
      }
    }
  };
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // خطوط التوقيت
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0 ? 1 : 0;
    modules[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // نمط المحاذاة الوحيد (إصدارات 2-5)
  if (version >= 2) {
    const pos = size - 7;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const onBorder = i === -2 || i === 2 || j === -2 || j === 2;
        modules[pos + i][pos + j] = (onBorder || (i === 0 && j === 0)) ? 1 : 0;
      }
    }
  }

  // النقطة الداكنة الثابتة
  modules[size - 8][8] = 1;

  // حجز خانات معلومات التنسيق (تُملأ لاحقًا)
  for (let i = 0; i <= 8; i++) {
    if (modules[8][i] === null) modules[8][i] = -1;
    if (modules[i][8] === null) modules[i][8] = -1;
  }
  for (let i = 0; i < 8; i++) {
    if (modules[8][size - 1 - i] === null) modules[8][size - 1 - i] = -1;
    if (modules[size - 1 - i][8] === null) modules[size - 1 - i][8] = -1;
  }

  // توزيع بتات البيانات بالتعرّج المعتاد (من اليمين لليسار، عمودين عمودين،
  // بالتناوب بين اتجاه لأعلى ولأسفل، مع تخطي عمود التوقيت رقم 6)
  const allBits = [];
  allCodewords.forEach(byte => { for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1); });
  let bitIndex = 0;
  let col = size - 1;
  let goingUp = true;
  while (col > 0) {
    if (col === 6) col--; // نتخطى عمود التوقيت
    for (let k = 0; k < size; k++) {
      const row = goingUp ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (modules[row][c] !== null) continue; // خانة وظيفية/محجوزة
        const bit = bitIndex < allBits.length ? allBits[bitIndex] : 0;
        bitIndex++;
        // قناع ثابت رقم 0: (row+col) زوجي => قلب البت
        modules[row][c] = (row + c) % 2 === 0 ? (bit ^ 1) : bit;
      }
    }
    goingUp = !goingUp;
    col -= 2;
  }

  // معلومات التنسيق: مستوى التصحيح L (بتات "01") + رقم القناع 0 ("000")
  const formatData = 0b01000; // 5 بتات: [ECC=01][mask=000]
  let gen = 0b10100110111; // مولّد BCH(15,5) المعياري لمعلومات التنسيق
  let temp = formatData << 10;
  for (let i = 14; i >= 10; i--) {
    if ((temp >> i) & 1) temp ^= gen << (i - 10);
  }
  let format = ((formatData << 10) | temp) ^ 0b101010000010010; // قناع معلومات التنسيق الثابت

  // ترتيب توزيع بتات معلومات التنسيق (البت i=0 هو الأقل أهمية) - يطابق
  // بالضبط آلية وضعها القياسية حول الباحثين (عمودي حول اليسار، أفقي حول الأعلى)
  for (let i = 0; i < 15; i++) {
    const bit = (format >> i) & 1;
    if (i < 6) modules[i][8] = bit;
    else if (i < 8) modules[i + 1][8] = bit;
    else modules[size - 15 + i][8] = bit;
  }
  for (let i = 0; i < 15; i++) {
    const bit = (format >> i) & 1;
    if (i < 8) modules[8][size - i - 1] = bit;
    else if (i < 9) modules[8][15 - i - 1 + 1] = bit;
    else modules[8][15 - i - 1] = bit;
  }

  // النقطة الداكنة الثابتة تبقى 1 حتى لو انكتبت فوقها بالخطأ أعلاه
  modules[size - 8][8] = 1;

  return modules.map(row => row.map(v => v === 1));
}

// مولّد Canvas مستقل عن أي container بالصفحة - يُستخدم مباشرة (openQrModal)
// أو يتحوّل لصورة PNG (qrDataUrl) عشان يُضمّن بمستند مطبوع بنافذة ثانية
// (تصدير QR بالجملة) ما تقدر توصل كودها لعناصر الصفحة الأصلية
function buildQrCanvas(text) {
  const matrix = qrBuildMatrix(text);
  const size = matrix.length;
  const QUIET_ZONE = 4; // هامش أبيض إلزامي حول رمز QR - بدونه أغلب الماسحات ما تكتشفه
  const moduleSize = Math.max(2, Math.floor(220 / (size + QUIET_ZONE * 2)));
  const px = moduleSize * (size + QUIET_ZONE * 2);
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        ctx.fillRect((c + QUIET_ZONE) * moduleSize, (r + QUIET_ZONE) * moduleSize, moduleSize, moduleSize);
      }
    }
  }
  return canvas;
}
function renderQrToCanvas(text, container) {
  container.innerHTML = '';
  container.appendChild(buildQrCanvas(text));
}
function qrDataUrl(text) {
  return buildQrCanvas(text).toDataURL('image/png');
}

function openQrModalWithText(payloadText, captionText) {
  try {
    renderQrToCanvas(payloadText, document.getElementById('qrCanvasContainer'));
    document.getElementById('qrRoomCodeText').textContent = captionText;
    show('qrModal');
  } catch (err) {
    alert(t('err_qr_generation'));
  }
}
function openQrModal(roomCode) {
  const url = `${location.origin}${location.pathname}?join=${roomCode}`;
  openQrModalWithText(url, `${t('qr_room_code_caption')}: ${roomCode}`);
}
document.getElementById('showQrBtn').addEventListener('click', () => openQrModal(currentRoomCode));
document.getElementById('showQrBtnClassroom').addEventListener('click', () => openQrModal(currentRoomCode));
document.getElementById('qrModalCloseBtn').addEventListener('click', () => hide('qrModal'));

// ---------- QR شخصي للبروفايل (يفتح من شاشة الأصدقاء وصفحة البروفايل) -
// يوديك لبروفايل صاحب الرمز مباشرة (بدل ما يرسل طلب صداقة تلقائي)، وفيه
// زر "أضف صديق" واضح بصفحة البروفايل نفسها ----------
function openProfileQrModal(userId, username) {
  if (!userId) return;
  const url = `${location.origin}${location.pathname}?profile=${userId}`;
  openQrModalWithText(url, t('qr_profile_caption', { name: username }));
}
document.getElementById('showFriendQrBtn').addEventListener('click', () => openProfileQrModal(currentUserId, currentUsername));

