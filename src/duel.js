/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — duel engine (challenge matches)
   Runs the same deterministic game as the server, locally, at
   full frame rate. The server stays the referee: every snapshot
   it sends is replayed forward so both browsers agree.
   Drawing is done by the normal game renderer (same snakes,
   robes, snitches, walls and board skins as the solo modes).
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const MW = 36, MH = 27, RESPAWN = 12, FOOD_COUNT = 6, T = 36;
  const THEME_KEYS = ["alley", "shop", "train", "dungeon", "library", "chamber", "village", "endless"];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  /* ---- deterministic PRNG (identical to server.py _mulberry) ---- */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const k = (x, y) => x + "," + y;

  function spawn(st, idx) {
    const s = st.snakes[idx];
    const dx = idx === 0 ? 1 : -1;
    const hx = idx === 0 ? 5 : MW - 6;
    const taken = new Set();
    st.snakes.forEach((sn) => sn.cells.forEach((c) => taken.add(k(c[0], c[1]))));
    const baseY = idx === 0 ? Math.floor(MH / 3) : Math.floor((2 * MH) / 3);
    for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
      const hy = baseY + off;
      const cells = [];
      for (let i = 0; i < 4; i++) cells.push([hx - dx * i, hy]);
      if (cells.every((c) => !taken.has(k(c[0], c[1])))) {
        s.cells = cells; s.dir = [dx, 0]; s.next = null; s.grow = 0; s.dead = 0;
        return;
      }
    }
    s.dead = 1;
  }

  function fillFood(st, rnd) {
    const taken = new Set();
    st.snakes.forEach((sn) => sn.cells.forEach((c) => taken.add(k(c[0], c[1]))));
    st.food.forEach((f) => taken.add(k(f.x, f.y)));
    let guard = 0;
    while (st.food.length < FOOD_COUNT && guard < 200) {
      guard++;
      const x = 1 + Math.floor(rnd() * (MW - 2));
      const y = 1 + Math.floor(rnd() * (MH - 2));
      if (taken.has(k(x, y))) continue;
      const gold = rnd() < 0.15;
      st.food.push({ x, y, v: gold ? 30 : 10, gold });
      taken.add(k(x, y));
    }
  }

  /* One game step. Must stay in lock-step with server.py _match_tick. */
  function stepTick(st, tick) {
    const rnd = mulberry((st.seed + tick * 2654435761) >>> 0);
    const snakes = st.snakes;
    snakes.forEach((s, i) => {
      if (s.dead > 0) {
        s.dead -= 1;
        if (s.dead === 0) spawn(st, i);
      }
    });
    const heads = {};
    const order = [];
    snakes.forEach((s, i) => {
      if (s.dead > 0 || !s.cells.length) return;
      const nx = s.next;
      if (nx && !(nx[0] === -s.dir[0] && nx[1] === -s.dir[1])) s.dir = nx;
      s.next = null;
      heads[i] = [s.cells[0][0] + s.dir[0], s.cells[0][1] + s.dir[1]];
      order.push(i);
    });
    const occupied = new Map();
    snakes.forEach((s, i) => {
      if (s.dead > 0 || !s.cells.length) return;
      const body = s.grow > 0 ? s.cells : s.cells.slice(0, -1);
      body.forEach((c) => occupied.set(k(c[0], c[1]), i));
    });
    const crashed = new Set();
    order.forEach((i) => {
      const [x, y] = heads[i];
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || occupied.has(k(x, y))) crashed.add(i);
    });
    if (order.length === 2 && heads[0][0] === heads[1][0] && heads[0][1] === heads[1][1]) {
      order.forEach((i) => crashed.add(i));
    }
    order.forEach((i) => {
      const s = snakes[i];
      if (crashed.has(i)) {
        s.cells = []; s.dead = RESPAWN; s.crashes += 1;
        return;
      }
      s.cells.unshift([heads[i][0], heads[i][1]]);
      st.food.slice().forEach((f) => {
        if (f.x === heads[i][0] && f.y === heads[i][1]) {
          s.score += f.v; s.eaten += 1; s.grow += f.gold ? 2 : 1;
          st.food.splice(st.food.indexOf(f), 1);
        }
      });
      if (s.grow > 0) s.grow -= 1; else s.cells.pop();
    });
    fillFood(st, rnd);
    st.tick = tick;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const cellsOnly = (st) => st.snakes.map((s) => s.cells.map((c) => [c[0], c[1]]));

  const Duel = {
    active: false,
    mulberry, stepTick, spawn, fillFood, // exposed for tests
    canvas: null,
    me: 0,
    st: null,          // locally simulated state
    prev: null,        // cells before the last step (for smooth interpolation)
    pending: null,     // my newest steering input the server may not have applied yet
    offset: 0,
    bestRtt: Infinity,
    tickSec: 0.16,
    startAt: 0,
    duration: 75,
    totalTicks: 468,
    players: [],
    looks: [],
    particles: [],
    raf: 0,
    lastTs: 0,
    final: false,
    carrier: null,
    hud: null,

    start(canvas, data) {
      this.stop();
      this.canvas = canvas;
      this.me = data.you;
      this.tickSec = data.tick_ms / 1000;
      this.duration = data.duration;
      this.totalTicks = Math.floor(this.duration / this.tickSec);
      this.startAt = data.start_at;
      this.players = data.players;
      this.final = false;
      this.pending = null;
      this.particles = [];
      this.st = null;
      this.prev = null;
      const R = HPS.Render;
      this.looks = this.players.map((p) => {
        const house = R.HOUSE[p.house] || R.HOUSE.gryffindor;
        return HPS.Skins.lookFor(p.skin, house);
      });
      const level = { id: data.id, theme: THEME_KEYS[data.id % THEME_KEYS.length] };
      const wallRects = [
        { x: 0, y: 0, w: MW, h: 1 }, { x: 0, y: MH - 1, w: MW, h: 1 },
        { x: 0, y: 0, w: 1, h: MH }, { x: MW - 1, y: 0, w: 1, h: MH }
      ];
      this.carrier = { level, wallRects };
      R.attachDuel(canvas, MW, MH);
      R.buildBoard(this.carrier);
      this.active = true;
      this.lastTs = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame((ts) => this.frame(ts));
    },

    stop() {
      cancelAnimationFrame(this.raf);
      if (this.active && HPS.Render) HPS.Render.detachDuel();
      this.active = false;
      this.st = null;
      this.prev = null;
    },

    /* ---- clock ---- */
    srvNow() { return Date.now() / 1000 + this.offset; },

    noteClock(serverNow, rttMs) {
      const est = serverNow + rttMs / 2000 - Date.now() / 1000;
      if (rttMs <= this.bestRtt * 1.3 || !isFinite(this.bestRtt)) {
        this.offset = isFinite(this.bestRtt) ? this.offset * 0.7 + est * 0.3 : est;
        this.bestRtt = Math.min(this.bestRtt, rttMs);
      }
    },

    /* ---- server snapshot -> reconcile ---- */
    snapshotToState(d) {
      return {
        seed: d.seed, tick: d.tick, food: clone(d.food),
        snakes: d.snakes.map((s) => ({
          cells: s.cells.map((c) => [c[0], c[1]]), dir: s.dir.slice(), next: s.next ? s.next.slice() : null,
          score: s.score, eaten: s.eaten || 0, dead: s.dead, grow: s.grow || 0, crashes: s.crashes || 0
        }))
      };
    },

    applyServer(d) {
      if (!this.active || !d.snakes) return;
      const server = this.snapshotToState(d);
      if (d.status === "finished") {
        this.final = true;
        this.st = server;
        this.prev = cellsOnly(server);
        this.result = d.result;
        return;
      }
      if (!this.st || server.tick > this.st.tick + 2) {
        this.st = server;
        this.prev = cellsOnly(server);
        return;
      }
      // Replay my local steering on top of the authoritative state, then catch up.
      const me = this.me;
      if (this.pending) {
        const sm = server.snakes[me];
        const acked = (sm.dir[0] === this.pending.dir[0] && sm.dir[1] === this.pending.dir[1]) ||
          (sm.next && sm.next[0] === this.pending.dir[0] && sm.next[1] === this.pending.dir[1]);
        if (acked || performance.now() - this.pending.at > 1500) this.pending = null;
        else sm.next = this.pending.dir.slice();
      }
      const target = Math.max(server.tick, this.st.tick);
      let before = cellsOnly(server);
      while (server.tick < target) {
        before = cellsOnly(server);
        stepTick(server, server.tick + 1);
      }
      this.st = server;
      this.prev = before;
    },

    steer(dir) {
      const v = DIRS[dir];
      if (!v || !this.active || !this.st) return;
      this.pending = { dir: v.slice(), at: performance.now() };
      this.st.snakes[this.me].next = v.slice();
    },

    /* ---- particles ---- */
    burst(x, y, color, count, speed) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (0.4 + Math.random() * 0.6) * speed * 40;
        this.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - Math.random() * 30, life: 0.35 + Math.random() * 0.55, max: 0.9,
          size: 1.2 + Math.random() * 2, color, type: Math.random() < 0.2 ? "star" : "dot", rot: Math.random() * 3, vr: (Math.random() - 0.5) * 12
        });
      }
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 8, color, type: "ring" });
    },

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type !== "ring") {
          p.vy += 70 * dt; p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 0.8 * dt; p.rot += p.vr * dt;
        }
      }
    },

    /* ---- frame loop ---- */
    advance() {
      const st = this.st;
      const now = this.srvNow();
      const target = Math.min(this.totalTicks, Math.floor((now - this.startAt) / this.tickSec));
      let guard = 0;
      while (st.tick < target && guard < 25) {
        guard++;
        this.prev = cellsOnly(st);
        const scores = st.snakes.map((s) => s.score);
        const heads = st.snakes.map((s) => (s.cells.length ? s.cells[0].slice() : null));
        stepTick(st, st.tick + 1);
        st.snakes.forEach((s, i) => {
          if (s.score > scores[i] && s.cells.length) {
            const gold = s.score - scores[i] >= 30;
            this.burst((s.cells[0][0] + 0.5) * T, (s.cells[0][1] + 0.5) * T, gold ? "#ffd45e" : "#f6c98a", gold ? 22 : 12, gold ? 3.2 : 2);
          }
          if (!s.cells.length && heads[i]) this.burst((heads[i][0] + 0.5) * T, (heads[i][1] + 0.5) * T, "#ff6a5a", 26, 3.6);
        });
      }
      if (guard === 25) st.tick = target;
      return now;
    },

    frame(ts) {
      if (!this.active) return;
      this.raf = requestAnimationFrame((t) => this.frame(t));
      const dt = Math.min(0.1, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.updateParticles(dt);
      if (!this.st) return;
      let now = this.srvNow();
      if (!this.final) now = this.advance();
      const running = !this.final && now >= this.startAt;
      const alpha = running ? Math.max(0, Math.min(1, (now - this.startAt) / this.tickSec - this.st.tick)) : 1;
      const left = Math.max(0, Math.ceil(this.duration - Math.max(0, now - this.startAt)));
      this.hud = {
        scores: this.st.snakes.map((s) => s.score), names: this.players.map((p) => p.name), you: this.me,
        left, countdown: now < this.startAt ? Math.ceil(this.startAt - now) : 0, final: this.final
      };
      HPS.Render.drawDuel(this.render(alpha), alpha, ts / 1000);
      if (HPS.Match) HPS.Match.onHud(this.hud);
    },

    /* adapt the simulation to what the shared renderer expects */
    render(alpha) {
      const st = this.st;
      const toObj = (arr) => arr.map((c) => ({ x: c[0], y: c[1] }));
      const players = st.snakes.map((s, i) => ({
        name: this.players[i].name, isMe: i === this.me, alive: s.cells.length > 0, dead: s.dead,
        spawn: { x: i === 0 ? 5 : MW - 6, y: i === 0 ? Math.floor(MH / 3) : Math.floor((2 * MH) / 3) },
        game: {
          state: "playing", settings: HPS.Save ? HPS.Save.data.settings : {},
          snake: {
            cells: toObj(s.cells), prev: toObj(this.prev && this.prev[i] && this.prev[i].length ? this.prev[i] : s.cells),
            dir: { x: s.dir[0], y: s.dir[1] }, look: this.looks[i]
          }
        }
      }));
      return { level: this.carrier.level, wallRects: this.carrier.wallRects, food: st.food, players, particles: this.particles };
    }
  };

  HPS.Duel = Duel;
})();
