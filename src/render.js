/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — renderer
   Everything is drawn procedurally on canvas. No image assets.
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const T = 36;
  let COLS = 24, ROWS = 18, W = COLS * T, H = ROWS * T; // the duel board is larger, see attachDuel()
  let duelActive = false;

  /* ----------------------------- palettes ----------------------------- */
  const HOUSES = {
    gryffindor: {
      name: "Gryffindor", letter: "G", main: "#8f1f2e", deep: "#4b0c18", accent: "#e7c574",
      snake: { base: "#3c7a48", light: "#7fb878", dark: "#18351f", scale: "rgba(12,34,18,.34)", eye: "#ffcf4a" },
      glow: "rgba(230,80,70,.22)"
    },
    slytherin: {
      name: "Slytherin", letter: "S", main: "#1c5a3e", deep: "#082a1b", accent: "#c9d6c0",
      snake: { base: "#2c6b45", light: "#68a877", dark: "#0f2d1c", scale: "rgba(8,30,16,.38)", eye: "#d7f06a" },
      glow: "rgba(70,210,140,.2)"
    },
    ravenclaw: {
      name: "Ravenclaw", letter: "R", main: "#233c70", deep: "#0b1834", accent: "#d8c88f",
      snake: { base: "#2f5f6b", light: "#71a8a8", dark: "#102b30", scale: "rgba(8,28,32,.36)", eye: "#9fe8ff" },
      glow: "rgba(90,150,240,.2)"
    },
    hufflepuff: {
      name: "Hufflepuff", letter: "H", main: "#a67c1d", deep: "#4f3906", accent: "#f0d37a",
      snake: { base: "#6d6a2f", light: "#a9a45c", dark: "#2f2d12", scale: "rgba(30,28,8,.34)", eye: "#ffd76a" },
      glow: "rgba(230,190,80,.2)"
    }
  };

  const THEMES = {
    alley:   { floorA: "#2a2236", floorB: "#151020", wall: "#4a392a", wallTop: "#7c6144", wallDark: "#241a11", wallStyle: "wood", accent: "#ffd07a", decor: "lantern", tint: "rgba(255,190,100,.05)" },
    shop:    { floorA: "#2c211f", floorB: "#17100e", wall: "#5a3f2a", wallTop: "#8c6745", wallDark: "#2c1e12", wallStyle: "wood", accent: "#ffce7d", decor: "shelves", tint: "rgba(255,180,90,.05)" },
    train:   { floorA: "#2c1620", floorB: "#150a10", wall: "#6a2a2c", wallTop: "#95443f", wallDark: "#371014", wallStyle: "metal", accent: "#e8c784", decor: "lamps", tint: "rgba(255,160,120,.05)" },
    lake:    { floorA: "#0c2434", floorB: "#050f1a", wall: "#2a3f48", wallTop: "#42606a", wallDark: "#132229", wallStyle: "stone", accent: "#8fe0ff", decor: "water", tint: "rgba(80,180,230,.06)" },
    hall:    { floorA: "#2e2632", floorB: "#16111c", wall: "#574232", wallTop: "#8c6e4c", wallDark: "#2b1f14", wallStyle: "stone", accent: "#ffd88c", decor: "candles", tint: "rgba(255,200,110,.06)" },
    dungeon: { floorA: "#1d2328", floorB: "#0b0e11", wall: "#3a474c", wallTop: "#5c6d72", wallDark: "#1a2327", wallStyle: "stone", accent: "#8fe6b0", decor: "torches", tint: "rgba(100,220,160,.05)" },
    forest:  { floorA: "#12231b", floorB: "#060d0a", wall: "#1d4227", wallTop: "#2f6038", wallDark: "#0b1f12", wallStyle: "hedge", accent: "#9fe08a", decor: "fireflies", tint: "rgba(80,180,110,.06)" },
    pitch:   { floorA: "#1c3324", floorB: "#0b1710", wall: "#8c6c2c", wallTop: "#c9a04a", wallDark: "#4c3812", wallStyle: "metal", accent: "#ffd76a", decor: "hoops", tint: "rgba(140,220,120,.05)" },
    bath:    { floorA: "#143240", floorB: "#081820", wall: "#3f7a83", wallTop: "#62a5ab", wallDark: "#1d444b", wallStyle: "stone", accent: "#a9eeff", decor: "water", tint: "rgba(90,210,230,.06)" },
    library: { floorA: "#2a1f19", floorB: "#130d0a", wall: "#573722", wallTop: "#84553a", wallDark: "#29160c", wallStyle: "wood", accent: "#ffcf87", decor: "books", tint: "rgba(255,180,100,.05)" },
    chamber: { floorA: "#182226", floorB: "#080c0e", wall: "#354247", wallTop: "#556568", wallDark: "#161f22", wallStyle: "stone", accent: "#87e0b2", decor: "torches", tint: "rgba(90,220,150,.05)" },
    basilisk:{ floorA: "#15211f", floorB: "#060d0c", wall: "#2f3f39", wallTop: "#4c635a", wallDark: "#131d18", wallStyle: "stone", accent: "#6cf2a8", decor: "torches", tint: "rgba(80,240,150,.06)" },
    village: { floorA: "#26303f", floorB: "#111721", wall: "#5a4436", wallTop: "#8a6a50", wallDark: "#2a1d15", wallStyle: "wood", accent: "#ffe2a3", decor: "snow", tint: "rgba(180,210,255,.06)" },
    shack:   { floorA: "#271e18", floorB: "#100b08", wall: "#4d3926", wallTop: "#7a5b3c", wallDark: "#22160e", wallStyle: "wood", accent: "#ffca80", decor: "dust", tint: "rgba(255,190,120,.04)" },
    time:    { floorA: "#152033", floorB: "#080c15", wall: "#3d4a63", wallTop: "#5f7394", wallDark: "#1a2233", wallStyle: "metal", accent: "#9ad4ff", decor: "gears", tint: "rgba(100,170,255,.06)" },
    maze:    { floorA: "#18281a", floorB: "#080f09", wall: "#214a29", wallTop: "#366b3c", wallDark: "#0c2211", wallStyle: "hedge", accent: "#c3f08d", decor: "fireflies", tint: "rgba(120,220,120,.05)" },
    vault:   { floorA: "#2c2517", floorB: "#141007", wall: "#6f5a2c", wallTop: "#a98b48", wallDark: "#3a2d11", wallStyle: "marble", accent: "#ffd97a", decor: "coins", tint: "rgba(255,215,110,.06)" },
    dragon:  { floorA: "#2c1812", floorB: "#120805", wall: "#4d342a", wallTop: "#75513f", wallDark: "#251711", wallStyle: "stone", accent: "#ff9a5c", decor: "embers", tint: "rgba(255,120,60,.07)" },
    tower:   { floorA: "#101a2c", floorB: "#060912", wall: "#33455c", wallTop: "#506b89", wallDark: "#16202e", wallStyle: "stone", accent: "#a9d4ff", decor: "stars", tint: "rgba(120,170,255,.06)" },
    room:    { floorA: "#211c33", floorB: "#0c0a16", wall: "#463a63", wallTop: "#6b5a93", wallDark: "#1d182c", wallStyle: "stone", accent: "#c9a8ff", decor: "runes", tint: "rgba(170,120,255,.06)" },
    ministry:{ floorA: "#16251f", floorB: "#070f0c", wall: "#2f4d3f", wallTop: "#4b7561", wallDark: "#142720", wallStyle: "marble", accent: "#9be0bb", decor: "lamps", tint: "rgba(90,200,150,.05)" },
    fog:     { floorA: "#1b2026", floorB: "#090c10", wall: "#3a4753", wallTop: "#56677a", wallDark: "#19232b", wallStyle: "stone", accent: "#a9c9e6", decor: "mist", tint: "rgba(150,180,220,.05)" },
    battle:  { floorA: "#26191b", floorB: "#0e0709", wall: "#4c3733", wallTop: "#735449", wallDark: "#21140f", wallStyle: "stone", accent: "#ff9d6a", decor: "embers", tint: "rgba(255,110,70,.07)" },
    final:   { floorA: "#1d1218", floorB: "#070409", wall: "#3a2530", wallTop: "#594050", wallDark: "#150b12", wallStyle: "stone", accent: "#d09bff", decor: "runes", tint: "rgba(180,80,255,.07)" },
    endless: { floorA: "#141b2c", floorB: "#060810", wall: "#33405c", wallTop: "#50688f", wallDark: "#151d2e", wallStyle: "stone", accent: "#9fc3ff", decor: "stars", tint: "rgba(110,150,255,.06)" },
    hell:    { floorA: "#2a0d12", floorB: "#0b0305", wall: "#4a1118", wallTop: "#7a2026", wallDark: "#210609", wallStyle: "stone", accent: "#ff6a5c", decor: "embers", tint: "rgba(255,50,30,.08)" }
  };

  /* ----------------------------- state ----------------------------- */
  let canvas = null, ctx = null;
  let bg = null;
  let vignette = null;
  let scaleKey = "";
  let scalePatterns = {};
  let decorCache = null;
  let audioMuted = false;

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  function rgba(hex, a) {
    if (!hex) return "rgba(255,255,255," + a + ")";
    if (hex.charAt(0) === "#") {
      let h = hex.slice(1);
      if (h.length === 3) h = h.split("").map((x) => x + x).join("");
      const n = parseInt(h.slice(0, 6), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }
    return hex;
  }

  function rr(c, x, y, w, h, r) {
    r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ----------------------------- scales ----------------------------- */
  function scalePattern(col) {
    const key = col + "|" + col;
    if (scalePatterns[key]) return scalePatterns[key];
    const s = 40;
    const c = makeCanvas(s * 2, s * 2);
    const g = c.getContext("2d");
    g.scale(2, 2);
    g.clearRect(0, 0, s, s);
    const stepX = 11, stepY = 8;
    for (let row = -1; row < s / stepY + 2; row++) {
      for (let colI = -1; colI < s / stepX + 2; colI++) {
        const x = colI * stepX + (row % 2 ? stepX / 2 : 0);
        const y = row * stepY;
        g.beginPath();
        g.arc(x, y, stepX * 0.52, 0, Math.PI);
        g.strokeStyle = "rgba(0,0,0,.20)";
        g.lineWidth = 1.1;
        g.stroke();
        g.beginPath();
        g.arc(x - 1.2, y - 1, stepX * 0.4, 0.2, Math.PI - 0.2);
        g.strokeStyle = "rgba(255,255,255,.10)";
        g.lineWidth = 0.8;
        g.stroke();
      }
    }
    const pat = ctx.createPattern(c, "repeat");
    scalePatterns[key] = pat;
    return pat;
  }

  /* ----------------------------- init ----------------------------- */
  const R = {
    W, H, COLS, ROWS, T, HOUSE: HOUSES, THEME: THEMES,

    init(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext("2d", { alpha: false });
      this.resize(true);
      vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.7, "rgba(0,0,0,.18)");
      vignette.addColorStop(1, "rgba(0,0,0,.62)");
    },

    resize(force) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      const key = w + "x" + h;
      if (force || (key !== scaleKey && rect.width > 0)) {
        canvas.width = w;
        canvas.height = h;
        scaleKey = key;
      }
    },

    theme(level) {
      const base = THEMES[level && level.theme] || THEMES.alley;
      // An equipped board skin recolours the floor and walls of every level.
      const skin = HPS.Skins && HPS.Skins.board ? HPS.Skins.board() : null;
      return skin ? Object.assign({}, base, skin.board) : base;
    },

    house() {
      const id = HPS.Save ? HPS.Save.data.house : "gryffindor";
      return HOUSES[id] || HOUSES.gryffindor;
    },

    look() {
      const house = this.house();
      if (HPS.Skins && HPS.Skins.look) return HPS.Skins.look(house);
      return Object.assign({}, house, { hat: "wizard", eyes: "round", glasses: false });
    },

    /* ----------------------------- duel (challenge match) ----------------------------- */
    /* Point the renderer at the match canvas with a bigger grid; detachDuel() restores the solo game. */
    attachDuel(canvasEl, cols, rows) {
      this._saved = { canvas, ctx, bg, vignette, scaleKey, COLS, ROWS, W, H, decorCache };
      duelActive = true;
      canvas = canvasEl;
      ctx = canvas.getContext("2d", { alpha: false });
      COLS = cols; ROWS = rows; W = COLS * T; H = ROWS * T;
      bg = null; decorCache = null; scaleKey = "";
      this.resize(true);
      vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.7, "rgba(0,0,0,.18)");
      vignette.addColorStop(1, "rgba(0,0,0,.62)");
    },

    detachDuel() {
      const s = this._saved;
      duelActive = false;
      if (!s) return;
      canvas = s.canvas; ctx = s.ctx; bg = s.bg; vignette = s.vignette; scaleKey = s.scaleKey;
      COLS = s.COLS; ROWS = s.ROWS; W = s.W; H = s.H; decorCache = s.decorCache;
      this._saved = null;
    },

    drawDuel(d, alpha, time) {
      if (!ctx || !canvas || !bg) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const bw = Math.round(rect.width * dpr), bh = Math.round(rect.height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      // The big board is pre-scaled to the screen size once, so every frame is a 1:1 copy.
      if (!this._fit || this._fitSrc !== bg || this._fit.width !== canvas.width || this._fit.height !== canvas.height) {
        this._fit = makeCanvas(canvas.width, canvas.height);
        this._fit.getContext("2d").drawImage(bg, 0, 0, canvas.width, canvas.height);
        this._fitSrc = bg;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this._fit, 0, 0);
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

      (d.food || []).forEach((f) => this.drawFood({ x: f.x, y: f.y, type: f.gold ? "snitch" : "butterbeer" }, time));
      d.players.forEach((p) => { if (p.alive) this.drawSnake(p.game, alpha, time); });
      this.drawParticles(d);

      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "700 15px Georgia, serif";
      ctx.shadowColor = "rgba(0,0,0,.95)";
      ctx.shadowBlur = 6;
      d.players.forEach((p) => {
        if (p.alive) {
          const c = p.game.snake.cells[0];
          const pr = p.game.snake.prev[0] || c;
          const x = (lerp(pr.x, c.x, alpha) + 0.5) * T, y = (lerp(pr.y, c.y, alpha) + 0.5) * T - T * 0.95;
          ctx.fillStyle = p.isMe ? "#ffe9b0" : "#d6e6ff";
          ctx.fillText((p.isMe ? "▸ " : "") + p.name, x, y);
        } else {
          ctx.fillStyle = "rgba(255,150,130,.9)";
          ctx.fillText("✦ " + p.name + " returns in " + Math.max(1, Math.ceil(p.dead * 0.16)) + "s", (p.spawn.x + 0.5) * T, (p.spawn.y + 0.5) * T);
        }
      });
      ctx.restore();

      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    },

    /* ----------------------------- board cache ----------------------------- */
    buildBoard(game) {
      const th = this.theme(game.level);
      bg = makeCanvas(W, H);
      const c = bg.getContext("2d");
      const r = rng((game.level.id || 7) * 7919 + 13);
      decorCache = { theme: game.level.theme, dots: [] };

      // base floor
      const g = c.createLinearGradient(0, 0, W * 0.25, H);
      g.addColorStop(0, th.floorA);
      g.addColorStop(1, th.floorB);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      // floor texture
      c.save();
      if (th.decor === "water") {
        c.globalAlpha = 0.16;
        for (let i = 0; i < 26; i++) {
          const y = r() * H;
          c.beginPath();
          c.moveTo(r() * W, y);
          c.quadraticCurveTo(r() * W, y + 8, r() * W, y + r() * 4);
          c.strokeStyle = "rgba(150,230,255,.5)";
          c.lineWidth = 1;
          c.stroke();
        }
      } else if (th.decor === "snow") {
        c.globalAlpha = 0.22;
        for (let i = 0; i < 120; i++) {
          c.beginPath();
          c.arc(r() * W, r() * H, r() * 1.6 + 0.3, 0, Math.PI * 2);
          c.fillStyle = "rgba(230,240,255,.65)";
          c.fill();
        }
      } else if (th.decor === "embers" || th.decor === "torches") {
        c.globalAlpha = 0.3;
        for (let i = 0; i < 40; i++) {
          c.beginPath();
          c.arc(r() * W, r() * H, r() * 1.5 + 0.3, 0, Math.PI * 2);
          c.fillStyle = th.accent;
          c.fill();
        }
      } else {
        // stone / wood seams
        c.globalAlpha = 0.055;
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        const step = T * 2;
        for (let x = step; x < W; x += step) {
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
        }
        for (let y = step; y < H; y += step) {
          c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
        }
      }
      c.restore();

      // patchy floor shading
      c.save();
      for (let i = 0; i < 22; i++) {
        const x = r() * W, y = r() * H, rad = 40 + r() * 120;
        const rg = c.createRadialGradient(x, y, 0, x, y, rad);
        rg.addColorStop(0, i % 2 ? "rgba(255,255,255,.022)" : "rgba(0,0,0,.10)");
        rg.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = rg;
        c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      c.restore();

      // decor behind walls
      this.drawDecor(c, th, r);

      // walls
      const rects = game.wallRects || [];
      rects.forEach((rect) => this.drawWallRect(c, rect, th, r));

      // corner fleurons
      c.save();
      c.globalAlpha = 0.3;
      c.strokeStyle = th.accent;
      c.lineWidth = 1;
      [[T * 1.2, T * 1.2, 1, 1], [W - T * 1.2, T * 1.2, -1, 1], [T * 1.2, H - T * 1.2, 1, -1], [W - T * 1.2, H - T * 1.2, -1, -1]].forEach(([x, y, sx, sy]) => {
        c.beginPath();
        c.moveTo(x + sx * 12, y);
        c.lineTo(x, y);
        c.lineTo(x, y + sy * 12);
        c.stroke();
        c.beginPath();
        c.arc(x + sx * 18, y + sy * 18, 2, 0, Math.PI * 2);
        c.stroke();
      });
      c.restore();
    },

    drawWallRect(c, rect, th, r) {
      const px = rect.x * T, py = rect.y * T, pw = rect.w * T, ph = rect.h * T;
      if (pw <= 0 || ph <= 0) return;
      c.save();
      // drop shadow
      c.fillStyle = "rgba(0,0,0,.42)";
      rr(c, px + 3, py + 5, pw, ph, 6);
      c.fill();

      if (th.wallStyle === "hedge") {
        c.fillStyle = th.wallDark;
        rr(c, px, py, pw, ph, 8); c.fill();
        const steps = Math.max(1, Math.ceil(pw / 18)) * Math.max(1, Math.ceil(ph / 18));
        for (let i = 0; i < steps; i++) {
          const bx = px + (i % Math.ceil(pw / 18)) * 18 + 9;
          const by = py + Math.floor(i / Math.ceil(pw / 18)) * 18 + 9;
          if (bx > px + pw + 6 || by > py + ph + 6) continue;
          const rad = 10 + r() * 7;
          const hg = c.createRadialGradient(bx - 3, by - 4, 1, bx, by, rad);
          hg.addColorStop(0, th.wallTop);
          hg.addColorStop(1, th.wallDark);
          c.fillStyle = hg;
          c.beginPath(); c.arc(bx, by, rad, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 0.35;
        c.fillStyle = "rgba(0,0,0,.5)";
        rr(c, px, py + ph - 4, pw, 4, 2); c.fill();
        c.restore();
        return;
      }

      const g = c.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, th.wallTop);
      g.addColorStop(0.28, th.wall);
      g.addColorStop(1, th.wallDark);
      c.fillStyle = g;
      rr(c, px, py, pw, ph, 5);
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.5)";
      c.lineWidth = 1;
      c.stroke();

      // top light
      c.fillStyle = "rgba(255,255,255,.10)";
      rr(c, px + 2, py + 2, pw - 4, Math.min(5, ph * 0.18), 3);
      c.fill();

      // texture
      c.save();
      c.beginPath();
      rr(c, px + 1, py + 1, pw - 2, ph - 2, 4);
      c.clip();
      if (th.wallStyle === "wood") {
        c.globalAlpha = 0.24;
        c.strokeStyle = th.wallDark;
        c.lineWidth = 1;
        for (let y = py + 7; y < py + ph; y += 9) {
          c.beginPath(); c.moveTo(px, y); c.lineTo(px + pw, y); c.stroke();
        }
        c.globalAlpha = 0.1;
        c.strokeStyle = "#fff";
        for (let i = 0; i < Math.max(1, (pw * ph) / 2000); i++) {
          const x = px + r() * pw;
          c.beginPath(); c.moveTo(x, py); c.lineTo(x + r() * 8 - 4, py + ph); c.stroke();
        }
      } else if (th.wallStyle === "metal") {
        c.globalAlpha = 0.35;
        c.fillStyle = th.wallDark;
        for (let x = px + 10; x < px + pw; x += 18) {
          for (let y = py + 10; y < py + ph; y += 18) {
            if (pw > 30 && ph > 30) {
              c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
            }
          }
        }
        c.globalAlpha = 0.16;
        c.strokeStyle = "#fff";
        c.beginPath(); c.moveTo(px, py + ph * 0.25); c.lineTo(px + pw, py + ph * 0.25); c.stroke();
      } else if (th.wallStyle === "marble") {
        c.globalAlpha = 0.18;
        c.strokeStyle = th.wallTop;
        for (let i = 0; i < 5; i++) {
          c.beginPath();
          c.moveTo(px, py + r() * ph);
          c.bezierCurveTo(px + pw * 0.3, py + r() * ph, px + pw * 0.6, py + r() * ph, px + pw, py + r() * ph);
          c.stroke();
        }
        c.globalAlpha = 0.12;
        c.fillStyle = th.accent;
        for (let i = 0; i < 18; i++) {
          c.beginPath(); c.arc(px + r() * pw, py + r() * ph, r() * 1.2, 0, Math.PI * 2); c.fill();
        }
      } else {
        // stone bricks
        c.globalAlpha = 0.3;
        c.strokeStyle = th.wallDark;
        c.lineWidth = 1;
        const bh = 13, bw = 22;
        for (let yy = py + bh; yy < py + ph; yy += bh) {
          c.beginPath(); c.moveTo(px, yy); c.lineTo(px + pw, yy); c.stroke();
        }
        for (let yy = py; yy < py + ph; yy += bh) {
          const off = Math.floor((yy - py) / bh) % 2 ? bw / 2 : 0;
          for (let xx = px + off; xx < px + pw; xx += bw) {
            c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, Math.min(yy + bh, py + ph)); c.stroke();
          }
        }
        c.globalAlpha = 0.12;
        c.fillStyle = "#fff";
        for (let i = 0; i < Math.max(2, (pw * ph) / 1600); i++) {
          c.fillRect(px + r() * pw, py + r() * ph, 2 + r() * 5, 1);
        }
      }
      c.restore();
      c.restore();
    },

    drawDecor(c, th, r) {
      c.save();
      if (th.decor === "candles") {
        for (let i = 0; i < 16; i++) {
          const x = 30 + r() * (W - 60), y = 24 + r() * (H - 48);
          c.globalAlpha = 0.8;
          c.fillStyle = "#efe2c2";
          c.fillRect(x, y, 3, 8);
          c.globalAlpha = 0.9;
          const fg = c.createRadialGradient(x + 1.5, y - 3, 0, x + 1.5, y - 3, 16);
          fg.addColorStop(0, "rgba(255,230,160,.85)");
          fg.addColorStop(1, "rgba(255,180,80,0)");
          c.fillStyle = fg;
          c.beginPath(); c.arc(x + 1.5, y - 3, 16, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#ffd98a";
          c.beginPath(); c.ellipse(x + 1.5, y - 3, 1.4, 3, 0, 0, Math.PI * 2); c.fill();
        }
      } else if (th.decor === "stars") {
        for (let i = 0; i < 90; i++) {
          const x = r() * W, y = r() * H, s = r() * 1.5 + 0.3;
          c.globalAlpha = 0.15 + r() * 0.5;
          c.fillStyle = "#dce9ff";
          c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 0.25;
        const mg = c.createRadialGradient(W * 0.82, H * 0.18, 4, W * 0.82, H * 0.18, 90);
        mg.addColorStop(0, "rgba(220,235,255,.7)");
        mg.addColorStop(1, "rgba(180,210,255,0)");
        c.fillStyle = mg;
        c.beginPath(); c.arc(W * 0.82, H * 0.18, 90, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.55;
        c.fillStyle = "#e8f0ff";
        c.beginPath(); c.arc(W * 0.82, H * 0.18, 16, 0, Math.PI * 2); c.fill();
      } else if (th.decor === "fireflies" || th.decor === "mist") {
        for (let i = 0; i < 40; i++) {
          const x = r() * W, y = r() * H;
          c.globalAlpha = 0.2 + r() * 0.35;
          c.fillStyle = th.decor === "fireflies" ? "rgba(190,255,150,.9)" : "rgba(190,210,235,.5)";
          c.beginPath(); c.arc(x, y, r() * 1.6 + 0.4, 0, Math.PI * 2); c.fill();
        }
      } else if (th.decor === "coins") {
        for (let i = 0; i < 26; i++) {
          const x = r() * W, y = r() * H;
          c.globalAlpha = 0.25 + r() * 0.35;
          c.fillStyle = th.accent;
          c.beginPath(); c.ellipse(x, y, 3, 1.4, r() * 3, 0, Math.PI * 2); c.fill();
        }
      } else if (th.decor === "books") {
        for (let i = 0; i < 16; i++) {
          const x = r() * W, y = r() * H;
          c.globalAlpha = 0.12 + r() * 0.12;
          c.fillStyle = ["#8c3b2c", "#2f5a44", "#3b4b7a", "#7a6130"][Math.floor(r() * 4)];
          c.fillRect(x, y, 5 + r() * 10, 2.5);
        }
      } else if (th.decor === "gears" || th.decor === "runes") {
        for (let i = 0; i < 10; i++) {
          const x = r() * W, y = r() * H, rad = 14 + r() * 34;
          c.globalAlpha = th.decor === "runes" ? 0.09 : 0.06;
          c.strokeStyle = th.accent;
          c.lineWidth = 1;
          c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke();
          if (th.decor === "gears") {
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              c.beginPath();
              c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
              c.lineTo(x + Math.cos(a) * (rad + 4), y + Math.sin(a) * (rad + 4));
              c.stroke();
            }
          }
        }
      } else if (th.decor === "embers") {
        for (let i = 0; i < 60; i++) {
          c.globalAlpha = 0.15 + r() * 0.3;
          c.fillStyle = i % 3 ? "rgba(255,140,70,.8)" : "rgba(255,220,140,.8)";
          c.beginPath(); c.arc(r() * W, r() * H, r() * 1.3 + 0.3, 0, Math.PI * 2); c.fill();
        }
      } else if (th.decor === "snow") {
        for (let i = 0; i < 50; i++) {
          c.globalAlpha = 0.25 + r() * 0.4;
          c.fillStyle = "#eaf2ff";
          c.beginPath(); c.arc(r() * W, r() * H, r() * 1.4 + 0.3, 0, Math.PI * 2); c.fill();
        }
      } else if (th.decor === "water") {
        c.globalAlpha = 0.18;
        for (let i = 0; i < 18; i++) {
          const x = r() * W, y = r() * H;
          c.strokeStyle = "rgba(160,235,255,.7)";
          c.beginPath(); c.ellipse(x, y, 20 + r() * 40, 3, 0, 0, Math.PI * 2); c.stroke();
        }
      } else if (th.decor === "dust") {
        for (let i = 0; i < 40; i++) {
          c.globalAlpha = 0.12 + r() * 0.2;
          c.fillStyle = "#e6d3a8";
          c.beginPath(); c.arc(r() * W, r() * H, r() * 1.1 + 0.3, 0, Math.PI * 2); c.fill();
        }
      } else if (th.decor === "lamps" || th.decor === "torches") {
        for (let i = 0; i < 8; i++) {
          const x = 40 + r() * (W - 80), y = 40 + r() * (H - 80);
          const gg = c.createRadialGradient(x, y, 0, x, y, 70);
          gg.addColorStop(0, th.decor === "torches" ? "rgba(110,240,170,.14)" : "rgba(255,200,110,.13)");
          gg.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gg;
          c.fillRect(x - 70, y - 70, 140, 140);
        }
      } else if (th.decor === "hoops") {
        c.globalAlpha = 0.1;
        c.strokeStyle = th.accent;
        c.lineWidth = 2;
        [W * 0.25, W * 0.75].forEach((x) => {
          c.beginPath(); c.ellipse(x, H * 0.3, 70, 26, 0, 0, Math.PI * 2); c.stroke();
        });
      }
      c.restore();
    },

    /* ----------------------------- main draw ----------------------------- */
    draw(game, alpha, time) {
      if (duelActive || !ctx || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const bw = Math.round(rect.width * dpr), bh = Math.round(rect.height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw; canvas.height = bh;
      }
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#05040a";
      ctx.fillRect(0, 0, W, H);

      if (!bg || !game || !game.level) return;

      const shake = game.shake || 0;
      ctx.save();
      if (shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }

      ctx.drawImage(bg, 0, 0, W, H);

      const th = this.theme(game.level);
      this.drawPortals(game, time, th);
      this.drawShifters(game, time, th);
      this.drawPatrols(game, time, th);
      this.drawFog(game, time, th);
      this.drawItems(game, time);
      this.drawWarnings(game, time);
      this.drawSnake(game, alpha, time);
      this.drawBossEffects(game, time);
      this.drawParticles(game);
      this.drawTexts(game);
      this.drawBuffOverlay(game, time, th);
      this.drawBossPresence(game, time);

      ctx.restore();

      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      if (game.flash && game.flash.alpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.85, game.flash.alpha);
        ctx.fillStyle = game.flash.color;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (game.settings && game.settings.grid) {
        ctx.save();
        ctx.strokeStyle = "rgba(231,197,116,.07)";
        ctx.lineWidth = 1;
        for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, H); ctx.stroke(); }
        for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(W, y * T); ctx.stroke(); }
        ctx.restore();
      }
    },

    /* ----------------------------- snake ----------------------------- */
    spine(game, alpha) {
      const cells = game.snake.cells;
      const prev = (game.snake.prev && game.snake.prev.length) ? game.snake.prev : cells;
      const pts = [];
      for (let i = 0; i < cells.length; i++) {
        const p = prev[Math.min(i, prev.length - 1)] || cells[i];
        const c = cells[i];
        pts.push({
          x: (lerp(p.x, c.x, alpha) + 0.5) * T,
          y: (lerp(p.y, c.y, alpha) + 0.5) * T
        });
      }
      const clean = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = clean[clean.length - 1], b = pts[i];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 1.5) clean.push(b);
      }
      return clean;
    },

    spineSegments(game, alpha) {
      const cells = game.snake.cells;
      const prev = (game.snake.prev && game.snake.prev.length) ? game.snake.prev : cells;
      const segs = [];
      let points = [];
      let start = 0;
      for (let i = 0; i < cells.length; i++) {
        const p = prev[Math.min(i, prev.length - 1)] || cells[i];
        const c = cells[i];
        const pt = {
          x: (lerp(p.x, c.x, alpha) + 0.5) * T,
          y: (lerp(p.y, c.y, alpha) + 0.5) * T
        };
        if (points.length) {
          const last = points[points.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) > T * 1.5) {
            segs.push({ start, points });
            points = [];
            start = i;
          }
        }
        if (!points.length || Math.hypot(pt.x - points[points.length - 1].x, pt.y - points[points.length - 1].y) > 1.5) {
          points.push(pt);
        }
      }
      if (points.length) segs.push({ start, points });
      return segs;
    },

    smooth(pts, sub) {
      if (!pts.length) return [];
      if (pts.length < 3) return pts.slice();
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let s = 0; s < sub; s++) {
          const t = s / sub, t2 = t * t, t3 = t2 * t;
          out.push({
            x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
          });
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    },

    drawSnake(game, alpha, time) {
      const house = (game.snake && game.snake.look) || this.look();
      const col = house.snake;
      const segments = this.spineSegments(game, alpha);
      if (!segments.length) return;

      const reduced = game.settings && game.settings.reducedMotion;
      const totalCells = Math.max(1, game.snake.cells.length - 1);
      const built = [];

      for (const seg of segments) {
        const dense = this.smooth(seg.points, reduced ? 3 : 5);
        const pts = [];
        let dist = 0;
        for (let i = 0; i < dense.length; i++) {
          const p = dense[i];
          const pPrev = dense[Math.max(0, i - 1)];
          const pNext = dense[Math.min(dense.length - 1, i + 1)];
          let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
          const len = Math.hypot(tx, ty) || 1;
          tx /= len; ty /= len;
          if (i > 0) dist += Math.hypot(p.x - pPrev.x, p.y - pPrev.y);
          const f = dense.length > 1 ? i / (dense.length - 1) : 0;
          const t = clamp((seg.start + f * Math.max(0, seg.points.length - 1)) / totalCells, 0, 1);
          const phase = dist * 0.048 - time * 8.2;
          const amp = (reduced ? 0.025 : 0.085) * T * clamp(t * 4, 0, 1) * (0.35 + 0.65 * t);
          const nx = -ty, ny = tx;
          pts.push({
            x: p.x + nx * Math.sin(phase) * amp,
            y: p.y + ny * Math.sin(phase) * amp,
            nx, ny,
            t,
            w: Math.max(1.4, T * 0.86 * clamp(1 - 0.22 * t - 0.68 * Math.pow(t, 4), 0.12, 1))
          });
        }
        built.push({ pts, start: seg.start });
      }

      const dead = game.state === "dying" || game.state === "over";

      for (const body of built) {
        const pts = body.pts;
        if (pts.length < 2) continue;

        const left = [], right = [];
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], hw = p.w / 2;
          left.push({ x: p.x + p.nx * hw, y: p.y + p.ny * hw });
          right.push({ x: p.x - p.nx * hw, y: p.y - p.ny * hw });
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const path = new Path2D();
        path.moveTo(left[0].x, left[0].y);
        for (let i = 1; i < left.length; i++) path.lineTo(left[i].x, left[i].y);
        for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
        path.closePath();

        // shadow
        ctx.save();
        ctx.translate(5, 7);
        ctx.fillStyle = "rgba(0,0,0,.34)";
        ctx.fill(path);
        ctx.restore();

        // body
        const grad = ctx.createLinearGradient(0, minY, 0, maxY);
        grad.addColorStop(0, col.light);
        grad.addColorStop(0.42, col.base);
        grad.addColorStop(1, col.dark);
        ctx.fillStyle = grad;
        ctx.fill(path);

        // scales
        ctx.save();
        ctx.clip(path);
        ctx.globalAlpha = 0.68;
        ctx.fillStyle = scalePattern(col.base);
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        // cylindrical sheen
        const sheen = ctx.createLinearGradient(0, minY - 8, 0, minY + Math.min(70, (maxY - minY) * 0.75 + 10));
        sheen.addColorStop(0, "rgba(255,255,255,.12)");
        sheen.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // dorsal line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = "rgba(220,255,215,.12)";
        ctx.lineWidth = Math.max(1.5, T * 0.13);
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        // outline
        ctx.strokeStyle = "rgba(0,0,0,.42)";
        ctx.lineWidth = 1.6;
        ctx.stroke(path);

        if (dead) {
          ctx.save();
          ctx.globalAlpha = 0.35 + Math.sin(time * 18) * 0.08;
          ctx.fillStyle = "#ff4b4b";
          ctx.fill(path);
          ctx.restore();
        }
      }

      // head + clothes from the leading segment
      const headPts = built[0] && built[0].pts;
      if (!headPts || !headPts.length) return;
      const hp = headPts[0];
      let ang;
      if (headPts.length > 1) {
        const q = headPts[Math.min(4, headPts.length - 1)];
        ang = Math.atan2(hp.y - q.y, hp.x - q.x);
      } else {
        ang = Math.atan2(game.snake.dir.y, game.snake.dir.x);
      }
      this.drawRobe(ctx, hp.x, hp.y, ang, time, house, game);
      this.drawHead(ctx, hp.x, hp.y, ang, time, house, game);
      ctx.globalAlpha = 1;
    },

    drawRobe(c, hx, hy, ang, time, house, game) {
      c.save();
      c.translate(hx, hy);
      c.rotate(ang);
      const wave = Math.sin(time * 4.2) * 2.4;

      // cloak
      c.save();
      c.translate(-8, 0);
      const cg = c.createLinearGradient(0, -24, 0, 24);
      cg.addColorStop(0, house.main);
      cg.addColorStop(1, house.deep);
      c.beginPath();
      c.moveTo(3, -12);
      c.bezierCurveTo(-10, -18, -30, -27, -46, -20 + wave);
      c.quadraticCurveTo(-40, -10, -44, -3 + wave * 0.4);
      c.quadraticCurveTo(-39, 2, -45, 7 + wave * 0.6);
      c.quadraticCurveTo(-41, 14, -46, 21 + wave);
      c.bezierCurveTo(-30, 27 + wave, -10, 20, 3, 12);
      c.closePath();
      c.fillStyle = cg;
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.45)";
      c.lineWidth = 1;
      c.stroke();
      // folds
      c.save();
      c.strokeStyle = "rgba(255,255,255,.08)";
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(-7, -8); c.quadraticCurveTo(-26, -13, -39, -14); c.stroke();
      c.beginPath(); c.moveTo(-7, 8); c.quadraticCurveTo(-27, 15, -40, 18); c.stroke();
      c.restore();
      // gold hem
      c.beginPath();
      c.moveTo(-46, -20 + wave);
      c.quadraticCurveTo(-40, -10, -44, -3 + wave * 0.4);
      c.quadraticCurveTo(-39, 2, -45, 7 + wave * 0.6);
      c.quadraticCurveTo(-41, 14, -46, 21 + wave);
      c.strokeStyle = house.accent;
      c.globalAlpha = 0.9;
      c.lineWidth = 1.6;
      c.stroke();
      // emblem
      c.globalAlpha = 1;
      c.beginPath();
      c.arc(-29, 0, 6, 0, Math.PI * 2);
      c.fillStyle = house.accent;
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.3)";
      c.lineWidth = 0.7;
      c.stroke();
      c.fillStyle = house.deep;
      c.font = "bold 7px Georgia, serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(house.letter, -29, 0.5);
      // epaulettes
      [-1, 1].forEach((side) => {
        c.beginPath();
        c.ellipse(-1, side * 11, 4.4, 2.6, side * 0.4, 0, Math.PI * 2);
        c.fillStyle = house.accent;
        c.globalAlpha = 0.85;
        c.fill();
      });
      c.globalAlpha = 1;
      c.restore();

      // collar
      c.beginPath();
      c.ellipse(-3, 0, 5, 13, 0, 0, Math.PI * 2);
      c.fillStyle = house.main;
      c.fill();
      c.strokeStyle = house.accent;
      c.globalAlpha = 0.9;
      c.lineWidth = 1.2;
      c.stroke();
      c.globalAlpha = 1;

      // scarf tails
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        c.beginPath();
        c.moveTo(-4, side * 8);
        const sway = Math.sin(time * 3.4 + k * 1.7) * 3.4;
        c.bezierCurveTo(-13, side * (13 + sway * 0.3), -22, side * (16 + sway * 0.7), -30, side * (15 + sway));
        c.strokeStyle = house.main;
        c.lineWidth = 4.6;
        c.lineCap = "round";
        c.stroke();
        c.save();
        c.setLineDash([3.2, 3.2]);
        c.strokeStyle = house.accent;
        c.lineWidth = 4.6;
        c.stroke();
        c.restore();
      }
      // scarf knot
      c.beginPath();
      c.ellipse(-4, 0, 5, 14, 0, 0, Math.PI * 2);
      c.strokeStyle = house.accent;
      c.globalAlpha = 0.35;
      c.lineWidth = 6;
      c.stroke();
      c.globalAlpha = 1;

      // wand tucked in scarf
      c.save();
      c.rotate(-0.18);
      c.strokeStyle = "#5a3a1d";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-8, 12);
      c.lineTo(-26, 17);
      c.stroke();
      c.fillStyle = "rgba(255,230,170,.9)";
      c.beginPath(); c.arc(-26, 17, 1.4, 0, Math.PI * 2); c.fill();
      const glow = c.createRadialGradient(-26, 17, 0, -26, 17, 10);
      glow.addColorStop(0, "rgba(255,230,160,.4)");
      glow.addColorStop(1, "rgba(255,230,160,0)");
      c.fillStyle = glow;
      c.beginPath(); c.arc(-26, 17, 10, 0, Math.PI * 2); c.fill();
      c.restore();

      // skin hat / headpiece
      const hat = house.hat || "wizard";
      if (hat !== "none") {
        c.save();
        c.translate(-14, -5);
        c.rotate(-0.45);
        if (hat === "crown") {
          c.beginPath();
          c.moveTo(-7, 1);
          c.lineTo(-7.5, -8);
          c.lineTo(-3.5, -4);
          c.lineTo(0, -11);
          c.lineTo(3.5, -4);
          c.lineTo(7.5, -8);
          c.lineTo(7, 1);
          c.closePath();
          c.fillStyle = house.accent;
          c.fill();
          c.strokeStyle = "rgba(0,0,0,.45)";
          c.lineWidth = 0.8;
          c.stroke();
          c.fillStyle = house.main;
          [-4.5, 0, 4.5].forEach((x) => {
            c.beginPath(); c.arc(x, -2.2, 1.15, 0, Math.PI * 2); c.fill();
          });
        } else if (hat === "horns") {
          [-1, 1].forEach((side) => {
            c.beginPath();
            c.moveTo(side * 4, 1);
            c.quadraticCurveTo(side * 9, -9, side * 13, -15);
            c.quadraticCurveTo(side * 10, -5, side * 7.5, 1);
            c.closePath();
            c.fillStyle = house.accent;
            c.fill();
            c.strokeStyle = "rgba(0,0,0,.5)";
            c.lineWidth = 0.8;
            c.stroke();
          });
          c.beginPath();
          c.ellipse(0, 1, 7, 2.6, 0, 0, Math.PI * 2);
          c.fillStyle = house.deep;
          c.fill();
        } else if (hat === "hood") {
          c.beginPath();
          c.moveTo(-11, 3);
          c.quadraticCurveTo(-13, -12, 0, -18);
          c.quadraticCurveTo(13, -12, 11, 3);
          c.quadraticCurveTo(0, -1, -11, 3);
          c.closePath();
          c.fillStyle = house.deep;
          c.fill();
          c.strokeStyle = house.accent;
          c.globalAlpha = 0.75;
          c.lineWidth = 1.1;
          c.stroke();
          c.globalAlpha = 1;
        } else if (hat === "tophat") {
          c.beginPath();
          c.ellipse(0, 0, 9.5, 3.1, 0, 0, Math.PI * 2);
          c.fillStyle = house.deep;
          c.fill();
          c.strokeStyle = "rgba(0,0,0,.5)";
          c.lineWidth = 0.8;
          c.stroke();
          c.fillStyle = house.main;
          c.fillRect(-6.5, -14, 13, 14);
          c.strokeRect(-6.5, -14, 13, 14);
          c.fillStyle = house.accent;
          c.fillRect(-6.5, -4.5, 13, 2.4);
        } else {
          c.beginPath();
          c.ellipse(0, 0, 9.5, 3.3, 0, 0, Math.PI * 2);
          c.fillStyle = "#241b34";
          c.fill();
          c.strokeStyle = "rgba(0,0,0,.5)";
          c.lineWidth = 0.8;
          c.stroke();
          c.beginPath();
          c.moveTo(-6, 0);
          c.quadraticCurveTo(-4, -11, -13, -19);
          c.quadraticCurveTo(-1, -12, 6, 0);
          c.closePath();
          c.fillStyle = "#2d2140";
          c.fill();
          c.stroke();
          c.strokeStyle = house.accent;
          c.globalAlpha = 0.85;
          c.lineWidth = 1.3;
          c.beginPath();
          c.moveTo(-6.5, -1.5);
          c.quadraticCurveTo(0, -3.6, 6.5, -1.5);
          c.stroke();
          c.globalAlpha = 1;
          c.fillStyle = house.accent;
          c.beginPath(); c.arc(-7, -14, 0.9, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }

      c.restore();
    },

    drawHead(c, hx, hy, ang, time, house, game) {
      const col = house.snake;
      c.save();
      c.translate(hx, hy);
      c.rotate(ang);

      // jaw shadow
      c.beginPath();
      c.ellipse(2, 4, 18, 19, 0, 0, Math.PI * 2);
      c.fillStyle = "rgba(0,0,0,.3)";
      c.fill();

      const hg = c.createLinearGradient(0, -16, 0, 16);
      hg.addColorStop(0, col.light);
      hg.addColorStop(0.4, col.base);
      hg.addColorStop(1, col.dark);
      c.beginPath();
      c.moveTo(-12, -12);
      c.bezierCurveTo(-2, -17, 12, -14, 18, -8);
      c.bezierCurveTo(22, -4, 23, 4, 18, 8);
      c.bezierCurveTo(12, 14, -2, 17, -12, 12);
      c.bezierCurveTo(-16, 7, -16, -7, -12, -12);
      c.closePath();
      c.fillStyle = hg;
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.45)";
      c.lineWidth = 1.1;
      c.stroke();

      // top light
      c.save();
      c.clip();
      c.fillStyle = "rgba(255,255,255,.10)";
      c.beginPath(); c.ellipse(2, -9, 20, 8, 0, 0, Math.PI * 2); c.fill();
      c.restore();

      // snout scales
      c.save();
      c.globalAlpha = 0.35;
      c.strokeStyle = col.scale;
      c.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(12 + i * 1.8, -2 + i * 1.1, 2.4, 0.2, Math.PI - 0.2);
        c.stroke();
        c.beginPath();
        c.arc(12 + i * 1.8, 2 - i * 1.1, 2.4, 0.2, Math.PI - 0.2);
        c.stroke();
      }
      c.restore();

      // brow ridges
      c.strokeStyle = "rgba(0,0,0,.32)";
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(7, -9, 6, Math.PI * 0.95, Math.PI * 1.75); c.stroke();
      c.beginPath(); c.arc(7, 9, 6, Math.PI * 0.25, Math.PI * 1.05); c.stroke();

      // eyes
      const eyeStyle = house.eyes || "round";
      [-1, 1].forEach((side) => {
        const ex = 7, ey = side * 10;
        if (eyeStyle === "glow") {
          const eg = c.createRadialGradient(ex, ey, 0, ex, ey, 10);
          eg.addColorStop(0, rgba(col.eye, 0.55));
          eg.addColorStop(1, rgba(col.eye, 0));
          c.fillStyle = eg;
          c.beginPath(); c.arc(ex, ey, 10, 0, Math.PI * 2); c.fill();
        }
        c.beginPath();
        c.ellipse(ex, ey, 4.6, 5.4, 0, 0, Math.PI * 2);
        c.fillStyle = col.eye;
        c.fill();
        c.strokeStyle = "rgba(0,0,0,.5)";
        c.lineWidth = 1;
        c.stroke();
        c.beginPath();
        if (eyeStyle === "slit") {
          c.ellipse(ex + 0.6, ey, 0.75, 4.2, 0, 0, Math.PI * 2);
        } else {
          c.ellipse(ex + 0.6, ey, 1.15, 4.2, 0, 0, Math.PI * 2);
        }
        c.fillStyle = "#0a0a08";
        c.fill();
        if (eyeStyle !== "glow") {
          c.beginPath();
          c.arc(ex - 1.4, ey - 2, 1.25, 0, Math.PI * 2);
          c.fillStyle = "rgba(255,255,255,.85)";
          c.fill();
        }
      });

      // nostrils
      [-1, 1].forEach((side) => {
        c.beginPath();
        c.ellipse(18.5, side * 3.4, 0.9, 0.7, side * 0.3, 0, Math.PI * 2);
        c.fillStyle = "rgba(0,0,0,.55)";
        c.fill();
      });

      // optional round spectacles
      if (house.glasses) {
        c.save();
        c.strokeStyle = "rgba(241,206,124,.9)";
        c.lineWidth = 1;
        [-1, 1].forEach((side) => {
          c.beginPath();
          c.arc(7, side * 10, 6.3, 0, Math.PI * 2);
          c.stroke();
        });
        c.beginPath();
        c.moveTo(7, -4.6);
        c.quadraticCurveTo(9.4, 0, 7, 4.6);
        c.stroke();
        c.beginPath();
        c.moveTo(3.8, -15.6); c.lineTo(-5, -13.6);
        c.moveTo(3.8, 15.6); c.lineTo(-5, 13.6);
        c.stroke();
        c.restore();
      }

      // mouth line
      c.beginPath();
      c.moveTo(21.5, 0);
      c.bezierCurveTo(17, 5, 10, 9, 3, 9.5);
      c.strokeStyle = "rgba(0,0,0,.38)";
      c.lineWidth = 1;
      c.stroke();
      c.beginPath();
      c.moveTo(21.5, 0);
      c.bezierCurveTo(17, -5, 10, -9, 3, -9.5);
      c.stroke();

      // lightning scar
      c.save();
      c.strokeStyle = "rgba(120,50,45,.6)";
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(-1, -6.5); c.lineTo(2, -9.5); c.lineTo(-1.5, -11); c.lineTo(1.5, -14);
      c.stroke();
      c.restore();

      // tongue
      const cyc = time % 3.4;
      const flick = cyc < 0.5 ? Math.sin((cyc / 0.5) * Math.PI) : 0;
      if (flick > 0.03) {
        c.strokeStyle = "#cf4f63";
        c.lineWidth = 1.1;
        c.lineCap = "round";
        const tip = 22 + 11 * flick;
        c.beginPath();
        c.moveTo(21.5, 0); c.lineTo(tip, 0); c.stroke();
        c.beginPath();
        c.moveTo(tip, 0); c.lineTo(tip + 4 * flick, -3.6 * flick); c.stroke();
        c.beginPath();
        c.moveTo(tip, 0); c.lineTo(tip + 4 * flick, 3.6 * flick); c.stroke();
      }

      c.restore();
    },

    /* ----------------------------- items ----------------------------- */
    drawItems(game, time) {
      if (game.food) this.drawFood(game.food, time);
      if (game.powers) game.powers.forEach((p) => this.drawPower(p, time));
    },

    drawFood(item, time) {
      const cx = (item.x + 0.5) * T;
      const cy = (item.y + 0.5) * T + Math.sin(time * 2.2 + item.x) * 2.2;
      const type = item.type || "snitch";
      ctx.save();
      ctx.translate(cx, cy);

      // glow
      const glowCol = type === "snitch" ? "255,208,90" : type === "frog" ? "200,150,255" : type === "butterbeer" ? "255,190,110" : type === "bean" ? "140,230,150" : "255,210,150";
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, T * 0.75);
      g.addColorStop(0, "rgba(" + glowCol + ",.28)");
      g.addColorStop(1, "rgba(" + glowCol + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, T * 0.75, 0, Math.PI * 2); ctx.fill();

      if (type === "snitch") {
        const flap = Math.sin(time * 16) * 0.5;
        // wings
        ctx.save();
        ctx.globalAlpha = 0.7;
        [[-1, 1], [1, -1]].forEach(([sx, rot]) => {
          ctx.save();
          ctx.translate(sx * 12, -3);
          ctx.rotate(rot * (0.55 + flap * 0.45));
          ctx.beginPath();
          ctx.ellipse(0, 0, 11, 4.6, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(240,235,210,.6)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,.4)";
          ctx.lineWidth = 0.7;
          ctx.stroke();
          ctx.restore();
        });
        ctx.restore();
        const sg = ctx.createRadialGradient(-2, -3, 1, 0, 0, 9);
        sg.addColorStop(0, "#fff8d2");
        sg.addColorStop(0.5, "#f0c85c");
        sg.addColorStop(1, "#8f6418");
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(0, 0, 8.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(90,60,10,.7)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(0, 0, 4.9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.beginPath(); ctx.arc(-2.4, -3, 1.4, 0, Math.PI * 2); ctx.fill();
      } else if (type === "pastie") {
        ctx.rotate(-0.12);
        const pg = ctx.createRadialGradient(-3, -4, 2, 0, 0, 13);
        pg.addColorStop(0, "#f7d99b");
        pg.addColorStop(0.6, "#c98a3c");
        pg.addColorStop(1, "#7c4c16");
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(80,48,12,.6)";
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.strokeStyle = "rgba(90,50,10,.5)";
        ctx.beginPath(); ctx.arc(0, 0, 9, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -2, 3.4, 0.4, Math.PI * 1.4); ctx.stroke();
      } else if (type === "butterbeer") {
        ctx.fillStyle = "#e5b465";
        rr(ctx, -8, -4, 16, 14, 3); ctx.fill();
        ctx.fillStyle = "#f7e6bd";
        rr(ctx, -9, -9, 18, 7, 3); ctx.fill();
        ctx.strokeStyle = "rgba(80,45,10,.5)";
        ctx.lineWidth = 0.8;
        rr(ctx, -8, -4, 16, 14, 3); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.4)";
        ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(-5, 7); ctx.stroke();
        ctx.strokeStyle = "#c48b3b";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(10, 2, 4, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      } else if (type === "frog") {
        ctx.rotate(0.08);
        ctx.fillStyle = "#5a3d21";
        ctx.beginPath(); ctx.ellipse(0, 1, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3d2812";
        [-1, 1].forEach((s) => {
          ctx.beginPath(); ctx.ellipse(s * 5, -5, 3, 2.4, s * 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(s * 5.5, -6.5, 1.3, 0, Math.PI * 2); ctx.fillStyle = "#f0d27a"; ctx.fill();
          ctx.fillStyle = "#3d2812";
        });
        ctx.strokeStyle = "rgba(240,210,130,.5)";
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(0, 1, 8, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.fillStyle = "#6b4925";
        ctx.beginPath(); ctx.ellipse(0, 7, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        // bean
        const beanCols = ["#86d38c", "#e2a6d8", "#f0cf6a", "#8fb8ef"];
        const cc = beanCols[(item.x + item.y) % beanCols.length];
        ctx.rotate(0.5);
        const bgd = ctx.createLinearGradient(-6, -8, 8, 8);
        bgd.addColorStop(0, "#ffffff");
        bgd.addColorStop(0.25, cc);
        bgd.addColorStop(1, "#2c4a33");
        ctx.fillStyle = bgd;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 5.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.3)";
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.beginPath(); ctx.ellipse(-2.4, -1.8, 2.2, 1.1, -0.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },

    drawPower(power, time) {
      const cx = (power.x + 0.5) * T;
      const cy = (power.y + 0.5) * T + Math.sin(time * 2.6) * 2.6;
      const colors = {
        cloak: "200,220,255", felix: "255,214,110", nimbus: "255,175,95",
        mandrake: "150,220,130", tears: "255,150,190"
      };
      const col = colors[power.type] || "255,220,140";
      ctx.save();
      ctx.translate(cx, cy);

      const expire = power.ttl != null ? clamp(power.ttl / 2, 0, 1) : 1;
      ctx.globalAlpha = power.ttl != null && power.ttl < 2 ? (0.4 + 0.6 * Math.abs(Math.sin(time * 8))) : 1;

      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, T * 0.9);
      g.addColorStop(0, "rgba(" + col + ",.3)");
      g.addColorStop(1, "rgba(" + col + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, T * 0.9, 0, Math.PI * 2); ctx.fill();

      // rotating rune ring
      ctx.save();
      ctx.rotate(time * 0.9);
      ctx.strokeStyle = "rgba(" + col + ",.85)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 13.5, Math.sin(a) * 13.5, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + col + ",.8)";
        ctx.fill();
      }
      ctx.restore();

      if (power.type === "cloak") {
        ctx.beginPath();
        ctx.moveTo(-7, -8);
        ctx.quadraticCurveTo(0, -13, 7, -8);
        ctx.quadraticCurveTo(11, 2, 6, 9);
        ctx.quadraticCurveTo(0, 5, -6, 9);
        ctx.quadraticCurveTo(-11, 2, -7, -8);
        ctx.fillStyle = "rgba(215,228,255,.65)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.8)";
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.strokeStyle = "rgba(180,200,255,.5)";
        ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-3, 6); ctx.stroke();
      } else if (power.type === "felix") {
        ctx.fillStyle = "rgba(255,240,190,.9)";
        ctx.beginPath(); ctx.arc(0, 2, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#b98b2c";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#e2b13f";
        ctx.fillRect(-2.4, -11, 4.8, 5);
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.beginPath(); ctx.arc(-2, -0.5, 1.7, 0, Math.PI * 2); ctx.fill();
      } else if (power.type === "nimbus") {
        ctx.save();
        ctx.rotate(-0.5);
        ctx.fillStyle = "#7a4f22";
        ctx.fillRect(-12, -2, 20, 4);
        ctx.fillStyle = "#c9a05a";
        for (let i = 0; i < 5; i++) ctx.fillRect(-14 + i * 4, 1, 2.5, 5);
        ctx.strokeStyle = "#e6c887";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(13, 0); ctx.lineTo(8, 2); ctx.stroke();
        ctx.restore();
      } else if (power.type === "mandrake") {
        ctx.fillStyle = "#7ca85a";
        ctx.beginPath(); ctx.ellipse(0, -2, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#3f5f2a";
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI + (i / 4) * Math.PI;
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(Math.cos(a) * 10, -14 + Math.sin(a) * 4); ctx.stroke();
        }
        ctx.fillStyle = "#22301a";
        ctx.beginPath(); ctx.arc(-2.3, -2.5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2.3, -2.5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 1, 1.6, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.strokeStyle = "#8a6238";
        ctx.beginPath(); ctx.moveTo(-1, 6); ctx.lineTo(-4, 12); ctx.moveTo(1, 6); ctx.lineTo(4, 12); ctx.stroke();
      } else if (power.type === "tears") {
        ctx.fillStyle = "rgba(255,170,205,.9)";
        ctx.beginPath(); ctx.arc(0, 1, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#f7d9e6";
        ctx.fillRect(-2, -10, 4, 4);
        const ph = ctx.createLinearGradient(-4, -5, 4, 8);
        ph.addColorStop(0, "rgba(255,255,255,.85)");
        ph.addColorStop(1, "rgba(255,190,215,.2)");
        ctx.fillStyle = ph;
        ctx.beginPath(); ctx.ellipse(0, 4, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.beginPath(); ctx.arc(-2, -1, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      if (expire < 1) {
        ctx.strokeStyle = "rgba(" + col + ",.7)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(power.ttl / (power.maxTtl || 9), 0, 1)); ctx.stroke();
      }
      ctx.restore();
    },

    /* ----------------------------- portals ----------------------------- */
    drawPortals(game, time, th) {
      if (!game.portals || !game.portals.length) return;
      game.portals.forEach((pair, idx) => {
        [pair.a, pair.b].forEach((cell) => {
          const cx = (cell.x + 0.5) * T, cy = (cell.y + 0.5) * T;
          ctx.save();
          ctx.translate(cx, cy);
          const g = ctx.createRadialGradient(0, 0, 2, 0, 0, T * 0.8);
          g.addColorStop(0, "rgba(170,140,255,.35)");
          g.addColorStop(1, "rgba(170,140,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, T * 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.rotate(time * (idx % 2 ? -1.1 : 1.1));
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, T * (0.22 + i * 0.09), T * (0.13 + i * 0.055), i * 0.8, 0, Math.PI * 1.6);
            ctx.strokeStyle = "rgba(190,170,255," + (0.8 - i * 0.2) + ")";
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
          ctx.restore();
        });
      });
    },

    drawShifters(game, time, th) {
      if (!game.shifters) return;
      game.shifters.forEach((group) => {
        group.rects.forEach((rect) => {
          const px = rect.x * T, py = rect.y * T, pw = rect.w * T, ph = rect.h * T;
          if (group.active) {
            ctx.save();
            ctx.globalAlpha = 0.95;
            this.drawWallRect(ctx, rect, th, rng(rect.x * 13 + rect.y));
            ctx.globalAlpha = 0.4 + Math.sin(time * 4 + rect.x) * 0.12;
            ctx.strokeStyle = "rgba(190,150,255,.9)";
            ctx.lineWidth = 1.4;
            rr(ctx, px + 1.5, py + 1.5, pw - 3, ph - 3, 4);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            ctx.globalAlpha = 0.22 + group.warn * 0.45;
            ctx.setLineDash([5, 6]);
            ctx.strokeStyle = group.warn > 0 ? "rgba(220,190,255,.9)" : "rgba(150,120,200,.5)";
            ctx.lineWidth = 1.2;
            rr(ctx, px + 2, py + 2, pw - 4, ph - 4, 4);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.08 + group.warn * 0.12;
            ctx.fillStyle = "#c9a8ff";
            ctx.fillRect(px, py, pw, ph);
            ctx.restore();
          }
        });
      });
    },

    /* ----------------------------- patrols ----------------------------- */
    drawPatrols(game, time, th) {
      if (!game.patrols) return;
      game.patrols.forEach((p, idx) => {
        const x = (p.x + 0.5) * T;
        const y = (p.y + 0.5) * T;
        ctx.save();
        ctx.translate(x, y);
        if (p.stun > 0) ctx.globalAlpha = 0.4 + Math.sin(time * 14) * 0.1;
        // shadow
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath(); ctx.ellipse(0, 9, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

        if (p.style === "spider") {
          ctx.save();
          ctx.rotate(p.dir < 0 ? Math.PI : 0);
          ctx.strokeStyle = "rgba(20,14,18,.95)";
          ctx.lineWidth = 1.8;
          for (let i = 0; i < 8; i++) {
            const side = i < 4 ? -1 : 1;
            const k = i % 4;
            const a = (k / 3) * 1.5 + 0.25;
            const wob = Math.sin(time * 9 + i * 1.3) * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(side * 9, -3 + k * 2.6, side * (13 + wob * 0.3), -8 + k * 5);
            ctx.stroke();
          }
          ctx.fillStyle = "#241b26";
          ctx.beginPath(); ctx.ellipse(0, 1, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#3b2b3d";
          ctx.beginPath(); ctx.ellipse(-5, -1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ff5b5b";
          ctx.beginPath(); ctx.arc(-7, -2, 1.1, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(-5.5, -3.5, 0.9, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (p.style === "ghost") {
          const floaty = Math.sin(time * 2.4 + idx) * 3;
          ctx.globalAlpha = 0.82;
          const gg = ctx.createLinearGradient(0, -14 + floaty, 0, 14 + floaty);
          gg.addColorStop(0, "rgba(220,240,255,.85)");
          gg.addColorStop(1, "rgba(140,180,210,.15)");
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(0, -5 + floaty, 8, Math.PI, 0);
          ctx.bezierCurveTo(9, 6 + floaty, 3, 12 + floaty + Math.sin(time * 5) * 2, 0, 10 + floaty);
          ctx.bezierCurveTo(-4, 13 + floaty, -9, 6 + floaty, -8, -5 + floaty);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(30,40,55,.65)";
          ctx.beginPath(); ctx.arc(-2.6, -6 + floaty, 1.4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(2.6, -6 + floaty, 1.4, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.25;
          const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
          gl.addColorStop(0, "rgba(170,230,255,.5)");
          gl.addColorStop(1, "rgba(170,230,255,0)");
          ctx.fillStyle = gl;
          ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
        } else if (p.style === "dementor") {
          const floaty = Math.sin(time * 1.8 + idx) * 3;
          ctx.globalAlpha = 0.94;
          ctx.fillStyle = "#0c0d14";
          ctx.beginPath();
          ctx.moveTo(0, -16 + floaty);
          ctx.bezierCurveTo(11, -15 + floaty, 12, 0 + floaty, 8, 12 + floaty);
          for (let i = 0; i < 4; i++) {
            ctx.quadraticCurveTo(4 - i * 4, 16 + floaty + (i % 2 ? 4 : -2), -8 + i * 5, 12 + floaty);
          }
          ctx.bezierCurveTo(-12, 0 + floaty, -11, -15 + floaty, 0, -16 + floaty);
          ctx.fill();
          ctx.fillStyle = "rgba(150,220,255,.85)";
          ctx.beginPath(); ctx.ellipse(-3.6, -7 + floaty, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(3.6, -7 + floaty, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.18;
          const dg = ctx.createRadialGradient(0, 0, 3, 0, 0, 26);
          dg.addColorStop(0, "rgba(120,190,230,.5)");
          dg.addColorStop(1, "rgba(120,190,230,0)");
          ctx.fillStyle = dg;
          ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
        } else if (p.style === "spirit") {
          const floaty = Math.sin(time * 2) * 3;
          ctx.fillStyle = "rgba(160,230,220,.75)";
          ctx.beginPath(); ctx.arc(0, -2 + floaty, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(80,160,150,.7)";
          ctx.beginPath(); ctx.arc(-2.6, -4 + floaty, 1.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(2.6, -4 + floaty, 1.2, 0, Math.PI * 2); ctx.fill();
        } else {
          // knight
          ctx.save();
          ctx.rotate(p.dir < 0 ? Math.PI : 0);
          const kg = ctx.createLinearGradient(0, -10, 0, 10);
          kg.addColorStop(0, "#9aa7ae");
          kg.addColorStop(0.5, "#54626b");
          kg.addColorStop(1, "#232c33");
          ctx.fillStyle = kg;
          ctx.beginPath(); ctx.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
          // shoulders
          ctx.fillStyle = "#3a464e";
          ctx.beginPath(); ctx.ellipse(-2, -8, 6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(-2, 8, 6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          // helmet
          ctx.fillStyle = "#6e7d86";
          ctx.beginPath(); ctx.arc(2, 0, 5.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#0c1114";
          ctx.fillRect(4, -3.2, 4, 1.4);
          ctx.fillRect(4, 1.8, 4, 1.4);
          // plume
          ctx.strokeStyle = "#b23b3b";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(-8, -3, -11, 2); ctx.stroke();
          // shield
          ctx.fillStyle = "#3f5f52";
          ctx.beginPath();
          ctx.moveTo(-4, 5); ctx.lineTo(1, 5); ctx.lineTo(1, 11); ctx.lineTo(-1.5, 13); ctx.lineTo(-4, 11); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#d8bd78";
          ctx.lineWidth = 0.8;
          ctx.stroke();
          // spear
          ctx.strokeStyle = "#8a6b3f";
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(5, -9); ctx.lineTo(13, -13); ctx.stroke();
          ctx.fillStyle = "#cfd8dd";
          ctx.beginPath(); ctx.moveTo(13, -13); ctx.lineTo(16, -15); ctx.lineTo(14.5, -11); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        // danger glow
        ctx.globalAlpha = 0.25 + Math.sin(time * 5 + idx) * 0.08;
        ctx.strokeStyle = p.style === "ghost" || p.style === "dementor" ? "rgba(140,220,255,.8)" : "rgba(255,120,90,.65)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      });
    },

    /* ----------------------------- fog ----------------------------- */
    drawFog(game, time, th) {
      if (!game.fogRects || !game.fogRects.length) {
        if (game.level && game.level.theme === "fog") {
          // full mist
        } else return;
      }
      const rects = game.fogRects || [];
      ctx.save();
      rects.forEach((r, idx) => {
        const px = r.x * T, py = r.y * T, pw = r.w * T, ph = r.h * T;
        for (let i = 0; i < 4; i++) {
          const ox = Math.sin(time * 0.22 + i * 2.1 + idx) * 18;
          const oy = Math.cos(time * 0.17 + i * 1.4 + idx) * 9;
          const cx = px + pw * (0.2 + ((i * 0.27 + idx * 0.13) % 1)) + ox;
          const cy = py + ph * (0.3 + ((i * 0.19) % 1)) + oy;
          const rad = Math.max(pw, ph) * 0.42;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, "rgba(190,205,230,.13)");
          g.addColorStop(0.6, "rgba(170,190,220,.06)");
          g.addColorStop(1, "rgba(160,180,210,0)");
          ctx.fillStyle = g;
          ctx.fillRect(px - 40, py - 40, pw + 80, ph + 80);
        }
      });
      if (game.level && game.level.theme === "fog") {
        ctx.globalAlpha = 0.05 + Math.sin(time * 0.6) * 0.012;
        ctx.fillStyle = "#c9d8e8";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },

    /* ----------------------------- boss ----------------------------- */
    drawWarnings(game, time) {
      if (!game.boss || !game.boss.hazards) return;
      game.boss.hazards.forEach((h) => {
        if (h.t >= h.warn) return;
        const p = h.t / h.warn;
        ctx.save();
        if (h.shape === "circle") {
          const cx = (h.x + 0.5) * T, cy = (h.y + 0.5) * T, rad = h.r * T;
          const blink = 0.5 + Math.abs(Math.sin(time * 7)) * 0.5;
          ctx.globalAlpha = 0.18 + p * 0.3;
          ctx.fillStyle = h.color || "#ff7a5c";
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.5 + p * 0.4;
          ctx.strokeStyle = h.color || "#ffb08c";
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 7]);
          ctx.beginPath(); ctx.arc(cx, cy, rad * (0.55 + p * 0.45), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.35 + p * 0.5;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - rad * 0.22, cy); ctx.lineTo(cx + rad * 0.22, cy);
          ctx.moveTo(cx, cy - rad * 0.22); ctx.lineTo(cx, cy + rad * 0.22);
          ctx.stroke();
          ctx.globalAlpha = 0.55 * blink;
          ctx.strokeStyle = "#ffe0c0";
          ctx.beginPath(); ctx.arc(cx, cy, rad * 0.95, 0, Math.PI * 2); ctx.stroke();
        } else if (h.shape === "row" || h.shape === "col") {
          const horizontal = h.shape === "row";
          const x = horizontal ? 0 : (h.x + 0.5) * T;
          const y = horizontal ? (h.y + 0.5) * T : 0;
          const w = horizontal ? W : T * 0.9;
          const hh = horizontal ? T * 0.9 : H;
          ctx.globalAlpha = 0.12 + p * 0.22;
          ctx.fillStyle = h.color || "#ff7a3c";
          ctx.fillRect(x - (horizontal ? 0 : w / 2), y - (horizontal ? hh / 2 : 0), w, hh);
          ctx.globalAlpha = 0.5 + p * 0.4;
          ctx.strokeStyle = h.color || "#ffb08c";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(0, y - hh / 2); ctx.lineTo(W, y - hh / 2); ctx.moveTo(0, y + hh / 2); ctx.lineTo(W, y + hh / 2); }
          else { ctx.moveTo(x - w / 2, 0); ctx.lineTo(x - w / 2, H); ctx.moveTo(x + w / 2, 0); ctx.lineTo(x + w / 2, H); }
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (h.shape === "wave") {
          // handled by active effects once live; draw a warning line at the start
          const y = (h.y + 0.5) * T;
          ctx.globalAlpha = 0.35 + p * 0.4;
          ctx.strokeStyle = h.color || "#5cf0a0";
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 8]);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.08 + p * 0.12;
          ctx.fillStyle = h.color || "#5cf0a0";
          ctx.fillRect(0, y - T * 0.8, W, T * 1.6);
        }
        ctx.restore();
      });
    },

    drawBossEffects(game, time) {
      if (!game.boss || !game.boss.hazards) return;
      game.boss.hazards.forEach((h) => {
        if (h.t < h.warn) return;
        const life = h.t - h.warn;
        const fade = clamp(1 - life / Math.max(0.001, h.live), 0, 1);
        ctx.save();
        if (h.shape === "circle") {
          const cx = (h.x + 0.5) * T, cy = (h.y + 0.5) * T, rad = h.r * T;
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad * (0.7 + life * 2));
          g.addColorStop(0, "rgba(255,240,190,.9)");
          g.addColorStop(0.4, rgba(h.color || "#ff8a4c", 0.65));
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = fade;
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, rad * (0.7 + life * 2), 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(255,230,190,.8)";
          ctx.lineWidth = 3 * fade + 0.5;
          ctx.beginPath(); ctx.arc(cx, cy, rad * (0.6 + life * 1.4), 0, Math.PI * 2); ctx.stroke();
        } else if (h.shape === "row" || h.shape === "col") {
          const horizontal = h.shape === "row";
          const x = horizontal ? 0 : (h.x + 0.5) * T;
          const y = horizontal ? (h.y + 0.5) * T : 0;
          const w = horizontal ? W : T * 0.9;
          const hh = horizontal ? T * 0.9 : H;
          ctx.globalAlpha = fade * 0.75;
          const g = horizontal
            ? ctx.createLinearGradient(0, y - hh / 2, 0, y + hh / 2)
            : ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
          g.addColorStop(0, rgba(h.color || "#ff8a3c", 0));
          g.addColorStop(0.5, rgba(h.color || "#ff8a3c", 0.85));
          g.addColorStop(1, rgba(h.color || "#ff8a3c", 0));
          ctx.fillStyle = g;
          ctx.fillRect(x - (horizontal ? 0 : w / 2), y - (horizontal ? hh / 2 : 0), w, hh);
          ctx.globalAlpha = fade;
          ctx.fillStyle = "rgba(255,240,190,.35)";
          for (let i = 0; i < 20; i++) {
            const ox = horizontal ? ((i * 97 + time * 400) % W) : x + (Math.random() - 0.5) * w;
            const oy = horizontal ? y + (Math.random() - 0.5) * hh : ((i * 73 + time * 400) % H);
            ctx.beginPath(); ctx.arc(ox, oy, 1.5 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
          }
        } else if (h.shape === "wave") {
          const cx = W / 2;
          const y = (h.y + 0.5) * T;
          const bandH = T * 1.8;
          const g = ctx.createLinearGradient(0, y - bandH / 2, 0, y + bandH / 2);
          g.addColorStop(0, "rgba(60,240,150,0)");
          g.addColorStop(0.35, "rgba(80,255,160,.32)");
          g.addColorStop(0.5, "rgba(130,255,180,.5)");
          g.addColorStop(0.65, "rgba(80,255,160,.32)");
          g.addColorStop(1, "rgba(60,240,150,0)");
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = g;
          ctx.fillRect(0, y - bandH / 2, W, bandH);
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "#eaffef";
          ctx.beginPath(); ctx.ellipse(30, y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(W - 30, y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(200,255,220,.7)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.restore();
      });
    },

    drawBossPresence(game, time) {
      if (!game.boss) return;
      const info = (HPS.BOSS_INFO || {})[game.boss.type];
      if (!info) return;
      const col = info.accent;
      // glowing eyes lurking in the top border
      const cx = W / 2, cy = 5;
      const blink = Math.sin(time * 0.8) > 0.97 ? 0.12 : 1;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 20;
      [-15, 15].forEach((ox) => {
        ctx.beginPath();
        ctx.ellipse(cx + ox, cy + 2, 5.5, 2.3 * blink, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 60, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /* ----------------------------- particles ----------------------------- */
    drawParticles(game) {
      if (!game.particles) return;
      ctx.save();
      for (const p of game.particles) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        if (p.type === "ring") {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 * a + 0.4;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 3.2), 0, Math.PI * 2); ctx.stroke();
        } else if (p.type === "star") {
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          const s = p.size * (0.6 + a * 0.8);
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2;
            ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
            ctx.lineTo(Math.cos(ang + Math.PI / 4) * s * 0.34, Math.sin(ang + Math.PI / 4) * s * 0.34);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.4, p.size * (0.4 + a * 0.8)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    drawTexts(game) {
      return; // floating text blocked the view; messages show under the board instead
      if (!game.texts) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const t of game.texts) {
        const a = clamp(t.life / t.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.font = "700 " + (t.big ? 22 : 15) + "px Georgia, serif";
        ctx.fillStyle = t.color || "#ffe6a8";
        ctx.shadowColor = "rgba(0,0,0,.8)";
        ctx.shadowBlur = 8;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.restore();
    },

    drawBuffOverlay(game, time, th) {
      const buffs = game.buffs || {};
      if (buffs.cloak > 0) {
        ctx.save();
        ctx.globalAlpha = 0.06 + Math.sin(time * 3) * 0.015;
        ctx.fillStyle = "#bcd2ff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      if (buffs.felix > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(255,205,90,.16)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (buffs.nimbus > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(255,150,80,.12)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (game.effect === "invincible" && game.state === "playing" && game.headPx) {
        const hp = game.headPx();
        ctx.save();
        ctx.globalAlpha = game.aegisCd <= 0 ? 0.55 + Math.sin(time * 6) * 0.15 : 0.1;
        ctx.strokeStyle = "#9cd0ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 27, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (game.invuln > 0) {
        ctx.save();
        ctx.globalAlpha = 0.12 + Math.sin(time * 12) * 0.05;
        ctx.strokeStyle = "#a9ffd0";
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, W - 6, H - 6);
        ctx.restore();
      }
    }
  };

  HPS.Render = R;
})();
