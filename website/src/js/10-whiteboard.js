// ---------- سبورة الرسم الحر (المدرس/المفوّض له بس يرسم) ----------
function posFromPointerEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
}

function textStrokeBounds(stroke, canvas) {
  classroomCtx.font = `${stroke.fontSize || 22}px 'IBM Plex Sans Arabic', sans-serif`;
  const width = classroomCtx.measureText(stroke.text).width;
  const height = (stroke.fontSize || 22) * 1.2;
  const px = stroke.x * canvas.width, py = stroke.y * canvas.height;
  return { left: px, top: py, right: px + width, bottom: py + height };
}

function drawStroke(stroke) {
  if (!classroomCtx) return;
  const canvas = document.getElementById('classroomCanvas');
  if (stroke.mode === 'text') {
    classroomCtx.fillStyle = stroke.color;
    classroomCtx.font = `${stroke.fontSize || 22}px 'IBM Plex Sans Arabic', sans-serif`;
    classroomCtx.textBaseline = 'top';
    classroomCtx.fillText(stroke.text, stroke.x * canvas.width, stroke.y * canvas.height);
    if (stroke.id && stroke.id === classroomSelectedStrokeId) {
      const b = textStrokeBounds(stroke, canvas);
      classroomCtx.save();
      classroomCtx.strokeStyle = '#2E8B77';
      classroomCtx.setLineDash([5, 4]);
      classroomCtx.lineWidth = 1.5;
      classroomCtx.strokeRect(b.left - 4, b.top - 4, (b.right - b.left) + 8, (b.bottom - b.top) + 8);
      classroomCtx.restore();
    }
    return;
  }
  classroomCtx.strokeStyle = stroke.color;
  classroomCtx.lineWidth = stroke.width;
  classroomCtx.lineCap = 'round';
  classroomCtx.lineJoin = 'round';
  classroomCtx.beginPath();
  stroke.points.forEach(([x, y], i) => {
    const px = x * canvas.width, py = y * canvas.height;
    if (i === 0) classroomCtx.moveTo(px, py); else classroomCtx.lineTo(px, py);
  });
  classroomCtx.stroke();
}

function redrawClassroomBoard() {
  if (!classroomCtx) return;
  const canvas = document.getElementById('classroomCanvas');
  classroomCtx.fillStyle = '#ffffff';
  classroomCtx.fillRect(0, 0, canvas.width, canvas.height);
  classroomBoardStrokes.forEach(drawStroke);
}

function setClassroomSelection(strokeId) {
  classroomSelectedStrokeId = strokeId;
  const hasSelection = !!strokeId;
  document.getElementById('classroomShrinkBtn').disabled = !hasSelection;
  document.getElementById('classroomGrowBtn').disabled = !hasSelection;
  redrawClassroomBoard();
}

function hitTestTextStroke(x, y, canvas) {
  // نفحص العكسي (آخر ما انرسم فوق) عشان لو تراكب نصين نختار الأعلى
  for (let i = classroomBoardStrokes.length - 1; i >= 0; i--) {
    const stroke = classroomBoardStrokes[i];
    if (stroke.mode !== 'text' || !stroke.id) continue;
    const b = textStrokeBounds(stroke, canvas);
    const px = x * canvas.width, py = y * canvas.height;
    if (px >= b.left - 6 && px <= b.right + 6 && py >= b.top - 6 && py <= b.bottom + 6) {
      return stroke;
    }
  }
  return null;
}

function setupClassroomCanvas() {
  const canvas = document.getElementById('classroomCanvas');
  classroomCtx = canvas.getContext('2d');
  redrawClassroomBoard();

  if (canvas.dataset.wired) return; // نوصل أحداث الرسم مرة وحدة بس طول عمر الصفحة
  canvas.dataset.wired = '1';

  let currentStroke = null;
  let draggingStroke = null;
  canvas.addEventListener('pointerdown', e => {
    if (!canManageContent) return;

    if (classroomMoveMode) {
      const [x, y] = posFromPointerEvent(e, canvas);
      const hit = hitTestTextStroke(x, y, canvas);
      setClassroomSelection(hit ? hit.id : null);
      if (hit) draggingStroke = hit;
      return;
    }

    if (classroomTextMode) {
      const [x, y] = posFromPointerEvent(e, canvas);
      const text = prompt(t('board_text_prompt'));
      if (text && text.trim()) {
        const stroke = {
          mode: 'text', id: `${clientId}-${Date.now()}`, text: text.trim(), x, y,
          color: classroomCurrentColor, fontSize: 22,
        };
        classroomBoardStrokes.push(stroke);
        drawStroke(stroke);
        socket.emit('board_stroke', { room_code: currentRoomCode, stroke });
      }
      return;
    }

    classroomDrawing = true;
    currentStroke = {
      points: [posFromPointerEvent(e, canvas)],
      color: classroomErasing ? '#FFFFFF' : classroomCurrentColor,
      width: classroomErasing ? 18 : 3,
      mode: classroomErasing ? 'erase' : 'draw',
    };
  });
  canvas.addEventListener('pointermove', e => {
    if (draggingStroke) {
      const [x, y] = posFromPointerEvent(e, canvas);
      draggingStroke.x = x;
      draggingStroke.y = y;
      redrawClassroomBoard();
      return;
    }
    if (!classroomDrawing || !currentStroke) return;
    currentStroke.points.push(posFromPointerEvent(e, canvas));
    drawStroke(currentStroke);
  });
  function endStroke() {
    if (draggingStroke) {
      socket.emit('board_update_stroke', {
        room_code: currentRoomCode, id: draggingStroke.id,
        patch: { x: draggingStroke.x, y: draggingStroke.y },
      });
      draggingStroke = null;
      return;
    }
    if (!classroomDrawing || !currentStroke) return;
    classroomDrawing = false;
    if (currentStroke.points.length > 1) {
      classroomBoardStrokes.push(currentStroke);
      socket.emit('board_stroke', { room_code: currentRoomCode, stroke: currentStroke });
    }
    currentStroke = null;
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointerleave', endStroke);
}

socket.on('board_stroke', data => {
  classroomBoardStrokes.push(data.stroke);
  drawStroke(data.stroke);
});
socket.on('board_clear', () => {
  classroomBoardStrokes = [];
  classroomSelectedStrokeId = null;
  redrawClassroomBoard();
});
socket.on('board_update_stroke', data => {
  const stroke = classroomBoardStrokes.find(s => s.id === data.id);
  if (!stroke) return;
  Object.assign(stroke, data.patch);
  redrawClassroomBoard();
});

document.querySelectorAll('.classroom-color-swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.classroom-color-swatch').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    classroomCurrentColor = btn.dataset.color;
    classroomErasing = false;
    classroomTextMode = false;
    classroomMoveMode = false;
    setClassroomSelection(null);
  });
});
document.getElementById('classroomEraserBtn').addEventListener('click', () => {
  classroomErasing = true;
  classroomTextMode = false;
  classroomMoveMode = false;
  setClassroomSelection(null);
});
document.getElementById('classroomTextBtn').addEventListener('click', () => {
  classroomTextMode = true;
  classroomErasing = false;
  classroomMoveMode = false;
  setClassroomSelection(null);
});
document.getElementById('classroomMoveBtn').addEventListener('click', () => {
  classroomMoveMode = true;
  classroomErasing = false;
  classroomTextMode = false;
});
function adjustSelectedFontSize(delta) {
  const stroke = classroomBoardStrokes.find(s => s.id === classroomSelectedStrokeId);
  if (!stroke) return;
  stroke.fontSize = Math.max(10, Math.min(72, (stroke.fontSize || 22) + delta));
  redrawClassroomBoard();
  socket.emit('board_update_stroke', {
    room_code: currentRoomCode, id: stroke.id, patch: { fontSize: stroke.fontSize },
  });
}
document.getElementById('classroomShrinkBtn').addEventListener('click', () => adjustSelectedFontSize(-4));
document.getElementById('classroomGrowBtn').addEventListener('click', () => adjustSelectedFontSize(4));
document.getElementById('classroomClearBtn').addEventListener('click', () => {
  if (!confirm(t('confirm_clear_board'))) return;
  classroomBoardStrokes = [];
  setClassroomSelection(null);
  redrawClassroomBoard();
  socket.emit('board_clear', { room_code: currentRoomCode });
});

