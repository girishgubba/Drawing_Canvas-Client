(() => {
  const canvas = document.getElementById("canvas");
  const overlay = document.getElementById("overlay");
  const cursorContainer = document.getElementById("canvas-container");
  const toolSel = document.getElementById("tool");
  const colorInp = document.getElementById("color");
  const widthInp = document.getElementById("width");
  const undoBtn = document.getElementById("undo");
  const redoBtn = document.getElementById("redo");
  const clearBtn = document.getElementById("clear");
  const usersList = document.getElementById("users");
  const statusEl = document.getElementById("status");

  const ctx = canvas.getContext("2d");
  const off = document.createElement("canvas");
  const offctx = off.getContext("2d");

  const state = {
    me: { id: null, color: "", name: "Me" },
    cursors: new Map(),
    ops: [],
    undone: [],
    active: new Map(),
    drawing: false,
    lastSent: 0,
  };
  // WebSocket wrapper
  function fitCanvas() {
    const rect = document.getElementById("stage").getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    [canvas, overlay, off].forEach((c) => {
      c.width = w;
      c.height = h;
    });
    redrawAll();
  }
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() };
  }

  function createCursorEl(c) {
    const el = document.createElement("div");
    el.className = "cursor chip";
    el.style.borderColor = c.color;
    el.textContent = c.name;
    cursorContainer.appendChild(el);
    return el;
  }
  // Cursor labels
  function showCursorLabel(userId) {
    const c = state.cursors.get(userId);
    if (!c) return;
    c.active = true;
    if (!c.el) c.el = createCursorEl(c);
    c.el.style.display = "block";
    if (c.x != null && c.y != null) {
      c.el.style.left = c.x + "px";
      c.el.style.top = c.y + "px";
    }
  }

  function hideCursorLabel(userId) {
    const c = state.cursors.get(userId);
    if (c?.el) c.el.style.display = "none";
  }

  function updateCursorPosition(userId, x, y) {
    const c = state.cursors.get(userId);
    if (!c) return;
    c.x = x;
    c.y = y;
    if (c.active && c.el) {
      c.el.style.left = x + "px";
      c.el.style.top = y + "px";
    }
  }

  let lastP = null;
  //stroke operations
  function startLocalStroke(e) {
    state.drawing = true;
    lastP = point(e);
    const strokeId = "s_" + Math.random().toString(36).slice(2);
    const eraser = toolSel.value === "eraser";
    const color = colorInp.value;
    const width = Number(widthInp.value);

    const stroke = {
      id: strokeId,
      userId: state.me.id,
      eraser,
      color,
      width,
      points: [lastP],
    };
    state.active.set(strokeId, stroke);
    WS.emit("stroke:start", { id: strokeId, eraser, color, width });
  }

  function moveLocalStroke(e) {
    if (!state.drawing) return;
    const p = point(e);
    const stroke = [...state.active.values()][0];
    if (!stroke) return;

    stroke.points.push(p);

    ctx.save();
    if (stroke.eraser) ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(lastP.x, lastP.y);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.stroke();
    ctx.restore();

    lastP = p;

    if (performance.now() - state.lastSent > 16) {
      WS.emit("stroke:points", { id: stroke.id, points: [p] });
      state.lastSent = performance.now();
    }
  }

  function endLocalStroke() {
    if (!state.drawing) return;
    state.drawing = false;
    const stroke = [...state.active.values()][0];
    if (!stroke) return;

    state.active.delete(stroke.id);
    state.ops.push({ type: "stroke", ...stroke });
    state.undone.length = 0;
    WS.emit("stroke:end", { id: stroke.id });
  }

  function replayOperation(op, targetCtx) {
    if (op.type === "stroke") {
      targetCtx.save();
      if (op.eraser) targetCtx.globalCompositeOperation = "destination-out";
      targetCtx.beginPath();
      if (op.points.length) targetCtx.moveTo(op.points[0].x, op.points[0].y);
      for (let i = 1; i < op.points.length; i++) {
        const p = op.points[i];
        targetCtx.lineTo(p.x, p.y);
      }
      targetCtx.lineWidth = op.width;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      targetCtx.strokeStyle = op.color;
      targetCtx.stroke();
      targetCtx.restore();
    }
    if (op.type === "clear") {
      targetCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function redrawAll() {
    offctx.clearRect(0, 0, off.width, off.height);
    for (const op of state.ops) replayOperation(op, offctx);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
  }

  canvas.addEventListener("pointerdown", startLocalStroke);
  window.addEventListener("pointermove", (e) => {
    if (state.me.id) {
      const p = point(e);
      WS.emit("cursor", { x: p.x, y: p.y });
      updateCursorPosition(state.me.id, p.x, p.y);
    }
    moveLocalStroke(e);
  });
  window.addEventListener("pointerup", endLocalStroke);
  window.addEventListener("pointerleave", endLocalStroke);

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      WS.emit("undo");
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      WS.emit("redo");
    }
  });

  undoBtn.addEventListener("click", () => WS.emit("undo"));
  redoBtn.addEventListener("click", () => WS.emit("redo"));
  clearBtn.addEventListener("click", () => WS.emit("clear"));

  WS.on("connect", () => {
    statusEl.textContent = "Connected";
    statusEl.classList.add("connected");
  });
  WS.on("disconnect", () => {
    statusEl.textContent = "Disconnected";
    statusEl.classList.remove("connected");
  });

  WS.on("welcome", ({ userId, color, users, oplog }) => {
    state.me.id = userId;
    state.me.color = color;
    state.ops = oplog;
    state.undone = [];
    renderUsers(users);
    redrawAll();
  });

  WS.on("users:update", renderUsers);

  function renderUsers(users) {
    const countEl = document.getElementById("user-count");
    const onlineUsers = users.filter((u) => u.online);
    countEl.textContent = onlineUsers.length.toString();

    usersList.innerHTML = "";
    users.forEach((u) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.style.background = u.online ? "#10b981" : "#dc2626";
      li.appendChild(dot);

      const name = document.createElement("span");
      name.className = "user-name";
      name.textContent =
        u.name +
        (u.id === state.me.id ? " (you)" : "") +
        (!u.online ? " (offline)" : "");
      li.appendChild(name);

      usersList.appendChild(li);
    });
  }

  WS.on("cursor", ({ userId, x, y, name, color }) => {
    if (!state.cursors.has(userId)) {
      state.cursors.set(userId, { x, y, name, color, el: null, active: false });
    }
    const c = state.cursors.get(userId);
    c.name = name || c.name;
    c.color = color || c.color;
    updateCursorPosition(userId, x, y);
  });

  WS.on("stroke:start", ({ id, userId, eraser, color, width }) => {
    state.active.set(id, { id, userId, eraser, color, width, points: [] });

    if (!state.cursors.has(userId)) {
      state.cursors.set(userId, {
        x: 0,
        y: 0,
        name: "User",
        color,
        el: null,
        active: false,
      });
    }
    const c = state.cursors.get(userId);
    c.color = color || c.color;
    showCursorLabel(userId);
  });

  WS.on("stroke:points", ({ id, points }) => {
    const s = state.active.get(id);
    if (!s) return;

    const last = s.points[s.points.length - 1] || points[0];
    s.points.push(...points);

    ctx.save();
    if (s.eraser) ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    const p = points[points.length - 1];
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = s.width;
    ctx.lineCap =
      ctx.lineJoin =
      ctx.strokeStyle =
        s.color;
    ctx.stroke();
    ctx.restore();
  });

  WS.on("stroke:end", ({ id, userId }) => {
    const s = state.active.get(id);
    if (s) {
      state.active.delete(id);
      state.ops.push({ type: "stroke", ...s });
      replayOperation({ type: "stroke", ...s }, offctx);
      state.undone = [];
    }
    setTimeout(() => hideCursorLabel(userId), 120);
  });

  WS.on("undo:applied", ({ op }) => {
    const idx = [...state.ops].reverse().findIndex((o) => o.id === op.id);
    if (idx !== -1) {
      state.ops.splice(state.ops.length - 1 - idx, 1);
      redrawAll();
    }
  });

  WS.on("redo:applied", ({ op }) => {
    state.ops.push(op);
    redrawAll();
  });

  WS.on("cleared", () => {
    state.ops = [];
    state.undone = [];
    redrawAll();
  });

  window.canvasInit = (meColor) => {
    WS.join(meColor);
  };
})();
