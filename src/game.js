/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — game logic
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const COLS = 24, ROWS = 18, TILES = 36;

  const FOODS = {
    snitch: { points: 10, grow: 1, name: "Golden Snitch", color: "#ffd45e" },
    pastie: { points: 15, grow: 1, name: "Pumpkin Pastie", color: "#f0b46a" },
    butterbeer: { points: 20, grow: 2, name: "Butterbeer", color: "#ffc46b" },
    frog: { points: 25, grow: 2, name: "Chocolate Frog", color: "#c9a0ff" },
    bean: { points: 0, grow: 1, name: "Every-Flavour Bean", color: "#9fe0a0" }
  };

  const POWERS = {
    cloak: { name: "Invisibility Cloak", short: "CLOAK", color: "#bcd2ff" },
    felix: { name: "Felix Felicis", short: "FELIX", color: "#ffd66e" },
    nimbus: { name: "Nimbus 2000", short: "NIMBUS", color: "#ffb05f" },
    mandrake: { name: "Mandrake", short: "MANDRAKE", color: "#96dc82" },
    tears: { name: "Phoenix Tears", short: "TEARS", color: "#ff96be" }
  };

  const DIR = {
    right: { x: 1, y: 0 }, left: { x: -1, y: 0 },
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }
  };

  const key = (x, y) => x + "," + y;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  class Game {
    constructor() {
      this.state = "title";
      this.level = null;
      this.endless = false;
      this.time = 0;
      this.settings = HPS.Save ? HPS.Save.data.settings : { grid: false, reducedMotion: false, difficulty: "easy" };
      this.difficulty = this.normalizeDifficulty(this.settings.difficulty);
      this.hell = false;
      this.particles = [];
      this.texts = [];
      this.shake = 0;
      this.flash = { color: "#fff", alpha: 0 };
      this.alpha = 0;
      this.winShown = false;
      this.deathShown = false;
      this.house = HPS.Save ? HPS.Save.data.house : "gryffindor";
      this.resetRuntime();
    }

    resetRuntime() {
      this.snake = { cells: [], prev: [], dir: DIR.right, queue: [], grow: 0 };
      this.food = null;
      this.powers = [];
      this.walls = new Set();
      this.wallRects = [];
      this.portals = [];
      this.fogRects = [];
      this.shifters = [];
      this.patrols = [];
      this.boss = null;
      this.buffs = { cloak: 0, felix: 0, nimbus: 0 };
      this.invuln = 0;
      this.revives = 0;
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.eaten = 0;
      this.target = 10;
      this.elapsed = 0;
      this.tickTimer = 0;
      this.tickDur = 0.15;
      this.nextPowerIn = 10;
      this.portalCd = 0;
      this.particles = [];
      this.texts = [];
      this.wave = 1;
      this.nextWaveAt = 5;
      this.endlessBoss = false;
      this.housemeta = null;
      this.deathReason = "";
      this.winStars = 0;
      this.winTime = 0;
      this.shake = 0;
      this.flash = { color: "#fff", alpha: 0 };
      this.portalPairs = [];
      this.shifterCells = new Set();
      this.time = 0;
      this.hell = this.difficulty === "hell";
      this.lastCoinReward = 0;
      this.coinsEarned = 0;
      this.effect = HPS.Skins ? HPS.Skins.effect() : "";
      this.aegisCd = 0;
      this.strikeCd = 0;
      this.runPromise = null;
      this.runResult = null;
    }

    normalizeDifficulty(mode) {
      return mode === "difficult" || mode === "hell" ? mode : "easy";
    }

    /* ============================ levels ============================ */
    startLevel(id) {
      if (this.difficulty === "hell") {
        if (HPS.UI) HPS.UI.toast("Hell is an endless-only mode — starting Hell Night.", "magic");
        this.startEndless();
        return;
      }
      const cfg = HPS.LEVELS.find((l) => l.id === id);
      if (!cfg) return;
      this.endless = false;
      this.level = cfg;
      this._begin(cfg);
      const act = (HPS.ACTS || []).find((a) => a.id === cfg.act);
      if (HPS.UI) {
        HPS.UI.enterGame(this);
        const bossInfo = cfg.boss ? HPS.BOSS_INFO[cfg.boss] : null;
        HPS.UI.banner(
          act ? act.name : "Hogwarts",
          cfg.name,
          cfg.tagline + '<br><span class="mode-tag">' + this.modeNote() + "</span>",
          bossInfo ? "Guardian: " + bossInfo.name : "",
          3000
        );
      }
      if (cfg.boss) HPS.Audio.play("boss");
    }

    startEndless() {
      this.endless = true;
      if (HPS.Save) {
        this.settings = HPS.Save.data.settings;
        this.difficulty = this.normalizeDifficulty(this.settings.difficulty);
      }
      const hell = this.difficulty === "hell";
      const endlessLevel = {
        id: 0, act: 0, name: hell ? "Hell Night" : "Endless Night", theme: hell ? "hell" : "endless",
        tagline: hell ? "The castle has stopped pretending to be kind." : "The castle rearranges itself while you sleep.",
        speed: hell ? 10.2 : 6.6, speedMax: hell ? 21 : 15.5, accelEvery: hell ? 2 : 5,
        target: Infinity, par: 0, score3: 0,
        start: { x: 4, y: 9, dir: "right" },
        walls: [], patrols: hell ? 4 : 0,
        hazard: hell ? "dementor" : "knight",
        hell,
        intro: hell ? "Every wall is fatal. The guardians do not wait." : "Survive. The walls will not stay where you left them."
      };
      this.level = endlessLevel;
      this._begin(endlessLevel);
      this.wave = 1;
      this.nextWaveAt = hell ? 3 : 5;
      if (HPS.UI) {
        HPS.UI.enterGame(this);
        HPS.UI.banner(
          hell ? "Hell Night" : "Endless Night",
          hell ? "200× danger" : "The castle rearranges itself",
          (hell ? "Endless only. Fatal walls. More guardians, faster waves. There is no finish line."
                : "Gather treasure, survive the shifting halls. How long can you last?") +
            '<br><span class="mode-tag">' + this.modeNote() + "</span>",
          hell ? "HELL MODE" : "Endless Mode",
          3000
        );
      }
      HPS.Audio.play("boss");
    }

    startHell() {
      this.setDifficulty("hell");
      this.startEndless();
    }

    _begin(cfg) {
      this.resetRuntime();
      this.level = cfg;
      this.state = "playing";
      this.target = cfg.target;
      this.settings = HPS.Save ? HPS.Save.data.settings : this.settings;
      this.difficulty = this.normalizeDifficulty(this.settings.difficulty);
      this.hell = this.endless && this.difficulty === "hell";
      this.house = HPS.Save ? HPS.Save.data.house : this.house;

      // walls & border
      const rects = [{ x: 0, y: 0, w: COLS, h: 1 }, { x: 0, y: ROWS - 1, w: COLS, h: 1 },
                     { x: 0, y: 0, w: 1, h: ROWS }, { x: COLS - 1, y: 0, w: 1, h: ROWS }];
      (cfg.walls || []).forEach(([x, y, w, h]) => rects.push({ x, y, w, h }));
      this.wallRects = rects;
      rects.forEach((r) => {
        for (let yy = r.y; yy < r.y + r.h; yy++) {
          for (let xx = r.x; xx < r.x + r.w; xx++) {
            if (xx >= 0 && xx < COLS && yy >= 0 && yy < ROWS) this.walls.add(key(xx, yy));
          }
        }
      });

      // portals
      this.portals = (cfg.portals || []).map(([a, b]) => ({
        a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }
      }));
      this.portalPairs = this.portals;

      // fog
      this.fogRects = (cfg.fog || []).map(([x, y, w, h]) => ({ x, y, w, h }));

      // shifters
      this.shifters = (cfg.shifters || []).map((group, i) => ({
        rects: group.map(([x, y, w, h]) => ({ x, y, w, h })),
        active: false,
        timer: 2.4 + i * 1.4,
        warn: 0,
        onTime: 3.6 + (i % 2) * 0.7,
        offTime: 3.4 + ((i + 1) % 2) * 0.9
      }));
      this._refreshShifterCells();

      // snake
      this._initSnake(cfg.start);

      // patrols
      const patrolCount = cfg.patrols || 0;
      this.spawnPatrols(patrolCount);
      // Even Hell gives the player a heartbeat to read the board.
      this.invuln = this.hell ? 3.0 : 0;

      // boss
      if (cfg.boss) this.initBoss(cfg.boss);

      // spawns
      this.spawnFood();
      this.nextPowerIn = this.hell ? rand(18, 26) : rand(8, 12);
      this.tickDur = 1 / this.baseSpeed();
      this.tickTimer = 0;

      if (HPS.Render) HPS.Render.buildBoard(this);

      // Ask the server for a run token: it records the mode so scores and
      // coins cannot be claimed for a different difficulty.
      this.runPromise = HPS.Net
        ? HPS.Net.runStart(this.endless ? "endless" : "level", this.difficulty, this.endless ? 0 : cfg.id)
        : null;
    }

    _initSnake(start) {
      const dir = DIR[(start && start.dir) || "right"] || DIR.right;
      const sx = start ? start.x : 6, sy = start ? start.y : 9;
      const cells = [];
      const isOpen = (x, y) => x >= 1 && x < COLS - 1 && y >= 1 && y < ROWS - 1 && !this.walls.has(key(x, y));

      let found = null;
      for (let ring = 0; ring < 12 && !found; ring++) {
        for (let oy = -ring; oy <= ring && !found; oy++) {
          for (let ox = -ring; ox <= ring && !found; ox++) {
            if (Math.abs(ox) !== ring && Math.abs(oy) !== ring) continue;
            const hx = clamp(sx + ox, 2, COLS - 3), hy = clamp(sy + oy, 2, ROWS - 3);
            let ok = true;
            for (let i = 0; i < 4; i++) {
              if (!isOpen(hx - dir.x * i, hy - dir.y * i)) { ok = false; break; }
            }
            if (ok) found = { x: hx, y: hy };
          }
        }
      }
      if (!found) found = { x: 6, y: 9 };
      for (let i = 0; i < 4; i++) cells.push({ x: found.x - dir.x * i, y: found.y - dir.y * i });
      this.snake.cells = cells;
      this.snake.prev = cells.map((c) => ({ ...c }));
      this.snake.dir = dir;
      this.startCell = { x: found.x, y: found.y };
    }

    spawnPatrols(count) {
      this.patrols = [];
      if (!count) return;
      const style = this.level.hazard || "knight";
      let attempts = 0;
      while (this.patrols.length < count && attempts < 80) {
        attempts++;
        const horizontal = Math.random() < 0.55;
        const free = (x, y) => x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1 &&
          !this.walls.has(key(x, y)) && !this.portals.some((p) => (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y));
        let fixed, min, max;
        if (horizontal) {
          fixed = Math.floor(rand(2, ROWS - 2));
          let runStart = null, best = null;
          for (let x = 1; x < COLS - 1; x++) {
            if (free(x, fixed)) { if (runStart === null) runStart = x; }
            else { if (runStart !== null) { const len = x - runStart; if (!best || len > best.len) best = { start: runStart, len }; } runStart = null; }
          }
          if (runStart !== null) { const len = COLS - 1 - runStart; if (!best || len > best.len) best = { start: runStart, len }; }
          if (!best || best.len < 8) continue;
          min = best.start; max = best.start + best.len - 1;
        } else {
          fixed = Math.floor(rand(2, COLS - 2));
          let runStart = null, best = null;
          for (let y = 1; y < ROWS - 1; y++) {
            if (free(fixed, y)) { if (runStart === null) runStart = y; }
            else { if (runStart !== null) { const len = y - runStart; if (!best || len > best.len) best = { start: runStart, len }; } runStart = null; }
          }
          if (runStart !== null) { const len = ROWS - 1 - runStart; if (!best || len > best.len) best = { start: runStart, len }; }
          if (!best || best.len < 6) continue;
          min = best.start; max = best.start + best.len - 1;
        }
        const head = this.snake.cells[0];
        let px, py;
        if (horizontal) { px = rand(min, max); py = fixed; }
        else { px = fixed; py = rand(min, max); }
        if (Math.hypot(px - head.x, py - head.y) < 6) continue;
        this.patrols.push({
          x: px, y: py, axis: horizontal ? "x" : "y", fixed,
          min, max, dir: Math.random() < 0.5 ? -1 : 1,
          speed: (rand(2.4, 3.8) + (this.level.id || 0) * 0.02) * (this.hell ? 1.65 : 1),
          style
        });
      }
    }

    initBoss(type) {
      const info = HPS.BOSS_INFO[type] || {};
      this.boss = {
        type,
        name: info.name || "Guardian",
        hazards: [],
        timer: 3.0,
        cool: type === "basilisk" ? 4.6 : type === "dragon" ? 3.8 : 3.5,
        active: true
      };
    }

    _refreshShifterCells() {
      this.shifterCells = new Set();
      this.shifters.forEach((g) => {
        if (!g.active) return;
        g.rects.forEach((r) => {
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) this.shifterCells.add(key(x, y));
          }
        });
      });
    }

    isWall(x, y) {
      return this.walls.has(key(x, y)) || this.shifterCells.has(key(x, y));
    }

    modeNote() {
      if (this.difficulty === "hell") {
        return "Hell mode · endless only · every wall is fatal · 200× danger";
      }
      return this.difficulty === "easy"
        ? "Easy mode · walls wrap you to the far side"
        : "Difficult mode · every wall is fatal";
    }

    setDifficulty(mode) {
      // The mode is fixed for the whole game; it can only change from the menus.
      if (document.body.classList.contains("in-game")) {
        if (HPS.UI) HPS.UI.toast("Difficulty is locked while a game is in progress.", "bad");
        return false;
      }
      this.difficulty = this.normalizeDifficulty(mode);
      this.hell = this.endless && this.difficulty === "hell";
      this.settings.difficulty = this.difficulty;
      if (HPS.Save) HPS.Save.setSetting("difficulty", this.difficulty);
      return true;
    }

    /* ============================ speed ============================ */
    baseSpeed() {
      let s = this.level.speed + Math.floor(this.eaten / (this.level.accelEvery || 5)) * 0.48;
      if (this.endless) s += (this.wave - 1) * (this.hell ? 0.95 : 0.42);
      return Math.min(this.level.speedMax || 12, s);
    }

    currentSpeed() {
      let s = this.baseSpeed();
      if (this.buffs.felix > 0) s *= 0.62;
      if (this.buffs.nimbus > 0) s *= 1.42;
      return s;
    }

    /* ============================ update ============================ */
    update(dt) {
      this.time += dt;
      this.updateParticles(dt);
      this.updateShakeFlash(dt);

      if (this.state === "dying") {
        this.dyingTimer -= dt;
        if (this.dyingTimer <= 0 && !this.deathShown) {
          this.deathShown = true;
          this.state = "over";
          if (HPS.UI) HPS.UI.showGameOver(this);
        }
        return;
      }
      if (this.state === "won") {
        this.winTimer -= dt;
        if (this.winTimer <= 0 && !this.winShown) {
          this.winShown = true;
          if (HPS.UI) HPS.UI.showWin(this);
        }
        return;
      }
      if (this.state !== "playing") return;

      this.elapsed += dt;
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
      this.invuln = Math.max(0, this.invuln - dt);
      this.portalCd = Math.max(0, this.portalCd - dt);
      this.aegisCd = Math.max(0, this.aegisCd - dt);
      this.strikeCd = Math.max(0, this.strikeCd - dt);

      // buffs
      for (const k of ["cloak", "felix", "nimbus"]) {
        if (this.buffs[k] > 0) {
          this.buffs[k] = Math.max(0, this.buffs[k] - dt);
        }
      }
      // never end the cloak inside stone
      if (this.difficulty !== "easy" && this.buffs.cloak <= 0 &&
          this.walls.has(key(this.snake.cells[0].x, this.snake.cells[0].y))) {
        this.buffs.cloak = 0.25;
      }

      // movement ticks
      this.tickDur = 1 / Math.max(1.2, this.currentSpeed());
      this.tickTimer += dt;
      let guard = 0;
      while (this.tickTimer >= this.tickDur && this.state === "playing" && guard < 4) {
        this.tickTimer -= this.tickDur;
        this.tick();
        guard++;
      }
      this.alpha = clamp(this.tickTimer / this.tickDur, 0, 1);

      if (this.state !== "playing") return;

      this.updateShifters(dt);
      this.updatePatrols(dt);
      this.updateBoss(dt);
      this.updateSpawns(dt);
    }

    updateShakeFlash(dt) {
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
      if (this.flash.alpha > 0) this.flash.alpha = Math.max(0, this.flash.alpha - dt * 2.4);
    }

    /* ============================ tick ============================ */
    tick() {
      if (this.state !== "playing") return;
      const snake = this.snake;

      // direction queue
      while (snake.queue.length) {
        const d = snake.queue.shift();
        if (d.x === -snake.dir.x && d.y === -snake.dir.y) continue;
        if (d.x === snake.dir.x && d.y === snake.dir.y) continue;
        snake.dir = d;
        break;
      }

      const head = snake.cells[0];
      const cloak = this.buffs.cloak > 0;
      const easy = this.difficulty === "easy";
      let nx = head.x + snake.dir.x;
      let ny = head.y + snake.dir.y;
      let wrapped = false;

      if (easy) {
        // Toroidal board: the outer wall sends you out the opposite side.
        if (nx < 1) { nx = COLS - 2; wrapped = true; }
        else if (nx > COLS - 2) { nx = 1; wrapped = true; }
        if (ny < 1) { ny = ROWS - 2; wrapped = true; }
        else if (ny > ROWS - 2) { ny = 1; wrapped = true; }
      } else {
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { this.hit("edge"); return; }
        if (!cloak && this.isWall(nx, ny)) { this.hit("wall"); return; }
      }

      if (!cloak) {
        const cells = snake.cells;
        for (let i = 0; i < cells.length; i++) {
          const isTail = i === cells.length - 1;
          if (isTail && snake.grow <= 0) continue;
          if (cells[i].x === nx && cells[i].y === ny) { this.hit("self"); return; }
        }
      }

      // remember where we hit the edge, before committing the move
      const edgeX = (clamp(head.x + snake.dir.x, 0, COLS - 1) + 0.5) * TILES;
      const edgeY = (clamp(head.y + snake.dir.y, 0, ROWS - 1) + 0.5) * TILES;

      // commit
      snake.prev = snake.cells.map((c) => ({ x: c.x, y: c.y }));
      snake.cells.unshift({ x: nx, y: ny });
      if (snake.grow > 0) snake.grow--;
      else snake.cells.pop();

      if (wrapped) {
        // Do not interpolate the head across the whole board; it steps through instantly.
        snake.prev[0] = { x: nx, y: ny };
        const hx = (nx + 0.5) * TILES, hy = (ny + 0.5) * TILES;
        this.burst(edgeX, edgeY, "#ffd66e", 16, 3.2);
        this.burst(hx, hy, "#ffd66e", 22, 3.8);
        HPS.Audio.play("portal");
      }

      // food
      if (this.food && this.food.x === nx && this.food.y === ny) this.eat();
      // power-up
      const pi = this.powers.findIndex((p) => p.x === nx && p.y === ny);
      if (pi >= 0) {
        const p = this.powers[pi];
        this.powers.splice(pi, 1);
        this.applyPower(p.type, p);
      }
      // portal
      if (this.portalCd <= 0 && this.portals.length) {
        const p = this.portals.find((pair) =>
          (pair.a.x === nx && pair.a.y === ny) || (pair.b.x === nx && pair.b.y === ny));
        if (p) this.teleport(p);
      }

      // patrol contact
      this.checkPatrolHit();
      // boss contact (active hazards)
      this.checkBossHit();
    }

    /* ============================ eating ============================ */
    eat() {
      const f = this.food;
      if (!f) return;
      const def = FOODS[f.type] || FOODS.snitch;
      this.combo = this.comboTimer > 0 ? Math.min(5, this.combo + 1) : 1;
      this.comboTimer = 2.6;
      const mult = (this.buffs.nimbus > 0 ? 2 : 1) * (this.hell ? 2 : 1);
      const gained = Math.round(f.points * this.combo * mult);
      this.score += gained;
      this.eaten++;
      this.snake.grow += f.grow || 1;

      const px = (f.x + 0.5) * TILES, py = (f.y + 0.5) * TILES;
      this.burst(px, py, def.color, this.settings.reducedMotion ? 6 : 14, 2.4);
      this.addText(px, py - 10, "+" + gained, def.color, 15);
      if (this.combo > 1) this.addText(px, py - 26, "×" + this.combo + " COMBO", "#ffd98a", 13);
      HPS.Audio.play("eat", this.combo);
      if (f.type === "frog") {
        this.buffs.nimbus = Math.max(this.buffs.nimbus, 1.6);
        this.flashText("Chocolate Frog — speed burst!", "#d9c2ff");
      }
      if (f.type === "bean" && f.points >= 50) {
        this.addText(px, py - 44, "A GOOD ONE!", "#b8f0b0", 14);
        this.flashText("Every-Flavour Bean: +50!", "#b8f0b0");
      }

      this.spawnFood();
      if (this.endless) this.checkWave();
      if (this.eaten >= this.target && !this.endless) this.win();
    }

    applyPower(type, p) {
      const def = POWERS[type] || {};
      const px = (p.x + 0.5) * TILES, py = (p.y + 0.5) * TILES;
      this.burst(px, py, def.color || "#ffe6a8", 18, 3.2);
      this.addText(px, py - 16, def.name || "Magic", def.color || "#ffe6a8", 15);
      HPS.Audio.play("power");
      this.flashScreen(def.color || "#ffe6a8", 0.16);
      if (type === "cloak") this.buffs.cloak = 6;
      else if (type === "felix") this.buffs.felix = 6;
      else if (type === "nimbus") this.buffs.nimbus = 5;
      else if (type === "mandrake") this.shrink(5);
      else if (type === "tears") this.revives = Math.min(2, this.revives + 1);
      this.flashText(def.name || "Magic!", def.color);
    }

    /* ============================ death ============================ */
    hit(reason) {
      if (this.invuln > 0 || this.state !== "playing") return;
      if (this.effect === "invincible" && this.aegisCd <= 0) {
        // Aegis skin: absorb a fatal hit, then recharge.
        this.aegisCd = 30;
        this.invuln = 2;
        this.buffs.cloak = Math.max(this.buffs.cloak, 0.6);
        this.shake = 6;
        this.flashScreen("#9cd0ff", 0.3);
        this.burst(this.headPx().x, this.headPx().y, "#9cd0ff", 24, 4);
        this.addText(0, 0, "AEGIS SHIELD ABSORBED THE HIT", "#cfe6ff", 16, true);
        HPS.Audio.play("revive");
        return;
      }
      if (this.revives > 0) {
        this.revives--;
        this.invuln = 2;
        this.buffs.cloak = Math.max(this.buffs.cloak, 0.8);
        this.shrink(4);
        this.shake = 10;
        this.flashScreen("#a9ffd0", 0.35);
        this.burst(this.headPx().x, this.headPx().y, "#a9ffd0", 26, 4);
        this.addText(this.headPx().x, this.headPx().y - 24, "PHOENIX TEARS", "#c6ffe0", 18, true);
        HPS.Audio.play("revive");
        return;
      }
      this.die(reason);
    }

    /* Attacker skin: stun every guardian within seven tiles. */
    attack() {
      if (this.state !== "playing" || this.effect !== "attacker" || this.strikeCd > 0) return false;
      this.strikeCd = 10;
      const head = this.snake.cells[0];
      let hits = 0;
      for (const p of this.patrols) {
        if (manhattan(p, head) <= 7) { p.stun = 6; hits++; }
      }
      const hp = this.headPx();
      this.burst(hp.x, hp.y, "#9dff4a", 40, 6);
      this.burst(hp.x, hp.y, "#c58cff", 24, 4);
      this.shake = 5;
      this.flashScreen("#9dff4a", 0.18);
      if (hits) this.score += 25 * hits;
      this.addText(0, 0, hits ? "VENOM PULSE — " + hits + " guardian" + (hits > 1 ? "s" : "") + " stunned" : "VENOM PULSE", "#d5ffa8", 16, true);
      HPS.Audio.play("power");
      return true;
    }

    die(reason) {
      if (this.state !== "playing") return;
      this.state = "dying";
      this.dyingTimer = 1.15;
      this.deathShown = false;
      this.deathReason = reason || "wall";
      this.shake = 18;
      this.flashScreen("#ff4b4b", 0.4);
      const hp = this.headPx();
      this.burst(hp.x, hp.y, "#ff6a5c", 34, 5);
      this.burst(hp.x, hp.y, "#ffd88a", 20, 3.2);
      HPS.Audio.play("death");
      if (this.endless && HPS.Save) {
        HPS.Save.recordEndless(this.score);
        this.awardRunCoins("endless");
      }
      if (this.boss) this.boss.active = false;
    }

    win() {
      if (this.state !== "playing") return;
      this.state = "won";
      this.winTimer = 1.25;
      this.winShown = false;
      this.winTime = this.elapsed;
      let stars = 1;
      if (this.elapsed <= (this.level.par || 60)) stars++;
      if (this.score >= (this.level.score3 || 9999)) stars++;
      this.winStars = stars;
      if (HPS.Save) HPS.Save.record(this.level.id, stars, this.score);
      this.awardRunCoins("level");
      HPS.Audio.play("win");
      this.flashScreen("#ffe6a8", 0.28);
      for (let i = 0; i < 40; i++) {
        this.burst(rand(0, COLS) * TILES, rand(0, ROWS) * TILES, pick(["#ffd66e", "#9fe0a0", "#bcd2ff", "#ff96be"]), 1, 1.5);
      }
    }

    /* Submit the finished run. The server decides coins and leaderboard rank. */
    awardRunCoins(source) {
      const pending = this.runPromise;
      this.runPromise = null;
      this.lastCoinReward = 0;
      this.coinsEarned = 0;
      if (!pending || !HPS.Net || !HPS.Net.user) return 0;
      const stats = {
        score: Math.max(0, Math.floor(this.score)),
        wave: Math.max(1, Math.floor(this.wave || 1)),
        stars: Math.max(0, Math.floor(this.winStars || 0))
      };
      pending
        .then((token) => (token ? HPS.Net.runFinish(token, stats) : null))
        .then((data) => {
          if (!data) return;
          this.runResult = data;
          this.coinsEarned = data.awarded;
          this.lastCoinReward = data.awarded;
          if (HPS.UI) { HPS.UI.updateAccountBar(); HPS.UI.onRunResult(this); }
        })
        .catch(() => {});
      return 0;
    }

    shrink(n) {
      const cells = this.snake.cells;
      while (n > 0 && cells.length > 3) { cells.pop(); n--; }
      this.snake.prev = cells.map((c) => ({ ...c }));
      const hp = this.headPx();
      this.burst(hp.x, hp.y, "#b7f0a0", 10, 2);
    }

    reviveAtStart() {
      // not used; reserved for future
    }

    resetSnakeAtStart() {
      const cells = [];
      const dir = this.snake.dir;
      const found = this.startCell || { x: 6, y: 9 };
      for (let i = 0; i < 4; i++) cells.push({ x: found.x - dir.x * i, y: found.y - dir.y * i });
      this.snake.cells = cells;
      this.snake.prev = cells.map((c) => ({ ...c }));
    }

    /* ============================ teleport ============================ */
    teleport(pair) {
      const head = this.snake.cells[0];
      const dest = (pair.a.x === head.x && pair.a.y === head.y) ? pair.b : pair.a;
      const len = this.snake.cells.length;

      // try shifting the whole body
      const offX = dest.x - head.x, offY = dest.y - head.y;
      let shifted = this.snake.cells.map((c) => ({ x: c.x + offX, y: c.y + offY }));
      const allOk = shifted.every((c) =>
        c.x > 0 && c.x < COLS - 1 && c.y > 0 && c.y < ROWS - 1 && !this.walls.has(key(c.x, c.y)));

      if (!allOk) {
        // lay the body out behind the arrival portal
        const dir = this.snake.dir;
        shifted = [];
        let ok = true;
        for (let i = 0; i < len; i++) {
          const c = { x: dest.x - dir.x * i, y: dest.y - dir.y * i };
          if (c.x <= 0 || c.x >= COLS - 1 || c.y <= 0 || c.y >= ROWS - 1 || this.walls.has(key(c.x, c.y))) { ok = false; break; }
          shifted.push(c);
        }
        if (!ok) {
          // perpendicular fallback
          shifted = [{ x: dest.x, y: dest.y }];
          for (let i = 1; i < len; i++) shifted.push({ x: dest.x, y: dest.y + i });
          shifted = shifted.filter((c) => c.x > 0 && c.x < COLS - 1 && c.y > 0 && c.y < ROWS - 1 && !this.walls.has(key(c.x, c.y)));
          if (shifted.length < 2) return;
        }
      }

      this.snake.cells = shifted;
      this.snake.prev = shifted.map((c) => ({ ...c }));
      this.portalCd = 1.4;
      this.addText((dest.x + 0.5) * TILES, (dest.y + 0.5) * TILES - 18, "FLOO!", "#c9b4ff", 16);
      this.burst((head.x + 0.5) * TILES, (head.y + 0.5) * TILES, "#b9a0ff", 18, 3);
      this.burst((dest.x + 0.5) * TILES, (dest.y + 0.5) * TILES, "#b9a0ff", 22, 3.4);
      HPS.Audio.play("portal");
    }

    /* ============================ patrols ============================ */
    updatePatrols(dt) {
      for (const p of this.patrols) {
        if (p.stun > 0) { p.stun -= dt; continue; }
        const v = p.speed * dt * p.dir;
        if (p.axis === "x") {
          p.x += v;
          if (p.x < p.min) { p.x = p.min; p.dir = 1; }
          if (p.x > p.max) { p.x = p.max; p.dir = -1; }
        } else {
          p.y += v;
          if (p.y < p.min) { p.y = p.min; p.dir = 1; }
          if (p.y > p.max) { p.y = p.max; p.dir = -1; }
        }
      }
      this.checkPatrolHit();
    }

    checkPatrolHit() {
      if (this.invuln > 0 || this.state !== "playing") return;
      const h = this.snake.cells[0];
      for (const p of this.patrols) {
        if (p.stun > 0) continue;
        if (Math.abs(p.x - h.x) < 0.72 && Math.abs(p.y - h.y) < 0.72) {
          this.hit("patrol");
          return;
        }
      }
    }

    /* ============================ shifters ============================ */
    updateShifters(dt) {
      let changed = false;
      for (const g of this.shifters) {
        if (g.active) {
          g.timer -= dt;
          if (g.timer <= 0) {
            g.active = false;
            g.timer = g.offTime;
            changed = true;
            g.rects.forEach((r) => {
              for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
                if (Math.random() < 0.3) this.burst((x + 0.5) * TILES, (y + 0.5) * TILES, "#c9a8ff", 2, 1.4);
              }
            });
          }
        } else if (g.warn > 0) {
          g.warn -= dt;
          if (g.warn <= 0) {
            // do not materialise on top of the snake
            const occupied = this.snake.cells.some((c) =>
              g.rects.some((r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h));
            if (occupied) {
              g.timer = 0.8;
            } else {
              g.active = true;
              g.timer = g.onTime;
              changed = true;
              HPS.Audio.play("warn");
              g.rects.forEach((r) => {
                for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
                  this.burst((x + 0.5) * TILES, (y + 0.5) * TILES, "#c9a8ff", 2, 1.6);
                }
              });
            }
          }
        } else {
          g.timer -= dt;
          if (g.timer <= 0) g.warn = 0.8;
        }
      }
      if (changed) this._refreshShifterCells();
    }

    /* ============================ boss ============================ */
    updateBoss(dt) {
      if (!this.boss) return;
      const b = this.boss;

      // endless boss waves
      if (this.endless) {
        b.timer -= dt;
        if (b.timer <= 0) {
          const type = pick(["troll", "basilisk", "dragon", "dark"]);
          this.spawnBossAttack(type, true);
          b.timer = this.hell ? rand(2.2, 3.6) : rand(5.5, 8);
        }
        this.updateHazards(dt);
        return;
      }

      b.timer -= dt;
      if (b.timer <= 0) {
        this.spawnBossAttack(b.type, false);
        b.timer = b.cool + rand(-0.3, 0.5);
      }
      this.updateHazards(dt);
    }

    spawnBossAttack(type, endless) {
      if (!this.boss) this.boss = { type, hazards: [], timer: 6 };
      const hazards = this.boss.hazards;
      const head = this.snake.cells[0];
      const colorMap = { troll: "#ff9a5c", basilisk: "#5cf0a0", dragon: "#ff8a3c", dark: "#c58cff" };
      const color = colorMap[type] || "#ff9a5c";
      const hell = !!this.hell;

      if (type === "troll") {
        const count = endless ? (hell ? 6 : 3) : 2;
        for (let i = 0; i < count; i++) {
          let cell = this.findBossCell(1);
          if (!cell) continue;
          if (manhattan(cell, head) < 2) cell = this.findBossCell(2) || cell;
          hazards.push({ shape: "circle", x: cell.x, y: cell.y, r: 1.35, t: 0, warn: hell ? 0.72 : 1.25, live: hell ? 0.5 : 0.42, color, hit: false });
        }
        HPS.Audio.play("warn");
      } else if (type === "basilisk") {
        // two or three adjacent rows are raked by the gaze
        const rowCount = endless ? (hell ? 4 : 3) : 2;
        const start = Math.floor(rand(2, ROWS - 2 - rowCount));
        for (let i = 0; i < rowCount; i++) {
          hazards.push({ shape: "row", y: start + i, x: 0, t: 0, warn: hell ? 0.75 : 1.3, live: 1.0, color, hit: false, gaze: true });
        }
        HPS.Audio.play("warn");
      } else if (type === "dragon") {
        const rows = hell ? 2 : 1;
        for (let i = 0; i < rows; i++) {
          if (Math.random() < 0.5) {
            const y = Math.floor(rand(2, ROWS - 2));
            hazards.push({ shape: "row", y, x: 0, t: 0, warn: hell ? 0.7 : 1.15, live: 0.95, color, hit: false });
          } else {
            const x = Math.floor(rand(2, COLS - 2));
            hazards.push({ shape: "col", x, y: 0, t: 0, warn: hell ? 0.7 : 1.15, live: 0.95, color, hit: false });
          }
        }
        HPS.Audio.play("warn");
      } else {
        const count = endless ? (hell ? 8 : 4) : 3;
        for (let i = 0; i < count; i++) {
          const cell = this.findBossCell(1);
          if (!cell) continue;
          hazards.push({ shape: "circle", x: cell.x, y: cell.y, r: 1.3, t: 0, warn: hell ? 0.85 : 1.5, live: 0.5, color, hit: false });
        }
        HPS.Audio.play("warn");
      }
    }

    findBossCell(minDist) {
      const head = this.snake.cells[0];
      for (let i = 0; i < 60; i++) {
        const x = Math.floor(rand(1, COLS - 1));
        const y = Math.floor(rand(1, ROWS - 1));
        if (this.walls.has(key(x, y)) || this.shifterCells.has(key(x, y))) continue;
        if (Math.hypot(x - head.x, y - head.y) < (minDist || 0) + 1.4) continue;
        return { x, y };
      }
      return null;
    }

    updateHazards(dt) {
      const b = this.boss;
      if (!b) return;
      for (let i = b.hazards.length - 1; i >= 0; i--) {
        const h = b.hazards[i];
        const prevT = h.t;
        h.t += dt;
        if (h.t >= h.warn + h.live + 0.35) { b.hazards.splice(i, 1); continue; }
        // activation moment
        if (prevT < h.warn && h.t >= h.warn) {
          if (h.shape === "circle") {
            HPS.Audio.play("slam");
            this.shake = Math.max(this.shake, 9);
            this.burst((h.x + 0.5) * TILES, (h.y + 0.5) * TILES, h.color, 24, 4);
          } else if (h.shape === "row" || h.shape === "col") {
            HPS.Audio.play(h.gaze ? "beam" : "flame");
            this.shake = Math.max(this.shake, 6);
          } else if (h.shape === "circle") {
            HPS.Audio.play("slam");
          }
        }
        if (h.t >= h.warn && !h.hit) {
          if (this.hazardTouches(h)) {
            h.hit = true;
            this.hit("boss");
          }
        }
      }
      this.checkBossHit();
    }

    hazardTouches(h) {
      const head = this.snake.cells[0];
      if (h.shape === "circle") {
        return Math.hypot(head.x - h.x, head.y - h.y) <= h.r + 0.35;
      }
      if (h.shape === "row") {
        return Math.abs(head.y - h.y) <= 0.85;
      }
      if (h.shape === "col") {
        return Math.abs(head.x - h.x) <= 0.85;
      }
      return false;
    }

    checkBossHit() {
      if (!this.boss || this.invuln > 0 || this.state !== "playing") return;
      for (const h of this.boss.hazards) {
        if (h.t >= h.warn && h.t <= h.warn + h.live && this.hazardTouches(h)) {
          this.hit("boss");
          return;
        }
      }
    }

    /* ============================ spawns ============================ */
    updateSpawns(dt) {
      // power-up timing
      this.nextPowerIn -= dt;
      if (this.nextPowerIn <= 0 && this.powers.length < 2) {
        this.spawnPower();
        this.nextPowerIn = this.hell ? rand(18, 28) : rand(12, 18);
      }
      for (let i = this.powers.length - 1; i >= 0; i--) {
        const p = this.powers[i];
        if (p.ttl != null) {
          p.ttl -= dt;
          if (p.ttl <= 0) {
            this.burst((p.x + 0.5) * TILES, (p.y + 0.5) * TILES, "#9c8fb0", 8, 2);
            this.powers.splice(i, 1);
          }
        }
      }
    }

    checkWave() {
      if (this.eaten < this.nextWaveAt) return;
      const hell = !!this.hell;
      this.wave++;
      this.nextWaveAt += hell ? 3 : 5;
      this.flashText("WAVE " + this.wave + (hell ? " · HELL" : ""), hell ? "#ff8f8f" : "#9fc3ff");
      HPS.Audio.play("combo");
      if (hell || this.wave % 2 === 0) {
        this.addEndlessWalls((hell ? 2 : 1) + Math.floor(this.wave / (hell ? 3 : 6)));
      }
      if (hell || this.wave === 3 || this.wave === 6 || this.wave === 9) {
        this.spawnEndlessPatrol();
        if (hell) this.spawnEndlessPatrol();
      }
      if (!this.endlessBoss && (hell ? this.wave >= 2 : this.wave === 5)) {
        this.endlessBoss = true;
        this.initBoss(pick(["troll", "basilisk", "dragon", "dark"]));
        this.boss.timer = hell ? 1.5 : 4;
        if (HPS.UI) HPS.UI.banner(hell ? "Hell Night" : "Endless Night", "A guardian wakes", hell ? "It has been waiting for you." : "Something ancient has noticed you.", "Guardian", 2200);
      }
      if (HPS.UI) HPS.UI.toast("Wave " + this.wave + (hell ? " — hell breaks loose" : " — the halls shift"), "magic");
    }

    spawnEndlessPatrol() {
      const style = pick(["knight", "ghost", "dementor", "spider"]);
      const old = this.level.hazard;
      this.level.hazard = style;
      const before = this.patrols.length;
      this.spawnPatrols(1);
      if (this.patrols.length === before) {
        this.patrols.push({
          x: rand(3, COLS - 4), y: rand(3, ROWS - 4),
          axis: Math.random() < 0.5 ? "x" : "y", fixed: 4, min: 2, max: 15,
          dir: 1, speed: rand(2.6, 3.6), style
        });
      }
      this.level.hazard = old;
    }

    addEndlessWalls(count) {
      const head = this.snake.cells[0];
      let added = 0;
      for (let attempt = 0; attempt < 60 && added < count; attempt++) {
        const x = Math.floor(rand(3, COLS - 5));
        const y = Math.floor(rand(3, ROWS - 5));
        const w = Math.random() < 0.5 ? 1 : 2;
        const h = Math.random() < 0.5 ? 1 : 2;
        let bad = false;
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            if (this.walls.has(key(xx, yy))) bad = true;
            if (this.snake.cells.some((c) => c.x === xx && c.y === yy)) bad = true;
            if (Math.abs(xx - head.x) + Math.abs(yy - head.y) < 4) bad = true;
            if (this.food && this.food.x === xx && this.food.y === yy) bad = true;
          }
        }
        if (bad) continue;
        this.walls.add(key(x, y));
        this.wallRects.push({ x, y, w, h });
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) this.walls.add(key(xx, yy));
        }
        added++;
      }
      if (added && HPS.Render) HPS.Render.buildBoard(this);
    }

    spawnFood() {
      const cell = this.findSafeCell(4);
      if (!cell) return;
      const roll = Math.random() * 100;
      let type = "snitch";
      if (roll > 84) type = "bean";
      else if (roll > 73) type = "frog";
      else if (roll > 58) type = "butterbeer";
      else if (roll > 38) type = "pastie";
      const def = FOODS[type];
      let points = def.points;
      let grow = def.grow;
      if (type === "bean") {
        points = pick([5, 10, 15, 25, 50]);
      }
      this.food = { x: cell.x, y: cell.y, type, points, grow, name: def.name };
    }

    spawnPower() {
      const cell = this.findSafeCell(3);
      if (!cell) return;
      const bag = [
        ["cloak", 22], ["felix", 18], ["nimbus", 20], ["mandrake", 18],
        ["tears", this.revives >= 2 ? 0 : 12]
      ].filter((x) => x[1] > 0);
      const total = bag.reduce((a, b) => a + b[1], 0);
      let r = Math.random() * total, type = bag[0][0];
      for (const [t, w] of bag) { r -= w; if (r <= 0) { type = t; break; } }
      const ttl = 10;
      this.powers.push({ x: cell.x, y: cell.y, type, ttl, maxTtl: ttl });
      HPS.Audio.play("combo");
    }

    findSafeCell(minDist) {
      const head = this.snake.cells[0];
      const blocked = (x, y) => {
        if (x < 1 || x >= COLS - 1 || y < 1 || y >= ROWS - 1) return true;
        if (this.isWall(x, y)) return true;
        if (this.snake.cells.some((c) => c.x === x && c.y === y)) return true;
        if (this.food && this.food.x === x && this.food.y === y) return true;
        if (this.powers.some((p) => p.x === x && p.y === y)) return true;
        if (this.portals.some((p) => (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y))) return true;
        for (const g of this.shifters) {
          for (const r of g.rects) {
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
          }
        }
        if (this.patrols.some((p) => Math.abs(p.x - x) < 1.2 && Math.abs(p.y - y) < 1.2)) return true;
        return false;
      };
      for (let i = 0; i < 300; i++) {
        const x = Math.floor(rand(1, COLS - 1));
        const y = Math.floor(rand(1, ROWS - 1));
        if (blocked(x, y)) continue;
        if (Math.abs(x - head.x) + Math.abs(y - head.y) < (minDist || 3)) continue;
        return { x, y };
      }
      // fallback: any free cell
      for (let y = 1; y < ROWS - 1; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (!blocked(x, y)) return { x, y };
        }
      }
      return null;
    }

    /* ============================ input / flow ============================ */
    queueDir(d) {
      if (this.state !== "playing" || !d) return;
      const q = this.snake.queue;
      const last = q.length ? q[q.length - 1] : this.snake.dir;
      if (d.x === -last.x && d.y === -last.y) return;
      if (d.x === last.x && d.y === last.y) return;
      if (q.length < 2) q.push(d);
    }

    pause() {
      if (this.state === "playing") {
        this.state = "paused";
        HPS.Audio.suspend();
        if (HPS.UI) HPS.UI.showPause();
      }
    }

    resume() {
      if (this.state === "paused") {
        this.state = "playing";
        if (HPS.UI) HPS.UI.hideScreens();
        if (HPS.Save && HPS.Save.data.settings.music) HPS.Audio.applySettings();
      }
    }

    restart() {
      if (this.endless) this.startEndless();
      else if (this.level) this.startLevel(this.level.id);
    }

    quitToMap() {
      this.state = "title";
      HPS.Audio.suspend();
      if (HPS.UI) HPS.UI.showMap();
    }

    /* ============================ effects ============================ */
    headPx() {
      const h = this.snake.cells[0] || { x: 0, y: 0 };
      return { x: (h.x + 0.5) * TILES, y: (h.y + 0.5) * TILES };
    }

    burst(x, y, color, count, speed) {
      const reduced = this.settings && this.settings.reducedMotion;
      const n = reduced ? Math.ceil(count * 0.4) : count;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.4, 1) * (speed || 2) * 40;
        this.particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - rand(0, 30),
          life: rand(0.35, 0.9),
          max: 0.9,
          size: rand(1.2, 3.2),
          color,
          type: Math.random() < 0.2 ? "star" : "dot",
          rot: Math.random() * Math.PI,
          vr: rand(-6, 6)
        });
      }
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 8, color, type: "ring" });
    }

    /* Messages never draw over the board; they go to the bar underneath it. */
    addText(x, y, text, color, size, big) {
      if (/^\+\d/.test(String(text))) return; // score gains are already in the HUD
      if (HPS.UI) HPS.UI.toast(String(text), big ? "magic" : "good");
    }

    flashText(text, color) {
      if (HPS.UI) HPS.UI.toast(text, "good");
    }

    flashScreen(color, alpha) {
      this.flash = { color, alpha };
    }

    updateParticles(dt) {
      const reduced = this.settings && this.settings.reducedMotion;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type !== "ring") {
          p.vy += (reduced ? 20 : 70) * dt;
          p.vx *= 1 - 1.8 * dt;
          p.vy *= 1 - 0.8 * dt;
          p.rot += p.vr * dt;
        }
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        if (t.life <= 0) { this.texts.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.vy *= 1 - 1.5 * dt;
      }
    }
  }

  /* ============================ fix row-effect colors ============================ */
  HPS.Game = Game;
})();
