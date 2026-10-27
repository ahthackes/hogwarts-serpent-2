/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — challenge matches (two players, one board)
   The server runs the game; this module sends turns and draws.
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const DEFAULT_COLORS = [
    { base: "#3c7a48", light: "#8cc984", dark: "#18351f", eye: "#ffcf4a" },
    { base: "#2e6fbf", light: "#9cd0ff", dark: "#0d2a52", eye: "#ffffff" }
  ];
  const KEYS = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right"
  };

  function hexToRgb(h) {
    const m = /^#([0-9a-f]{6})$/i.exec(h || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const x = hexToRgb(a), y = hexToRgb(b);
    if (!x || !y) return a;
    return "rgb(" + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",") + ")";
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const Match = {
    summary: null,
    id: null,
    state: null,
    prev: null,
    curAt: 0,
    offset: 0,
    arena: false,
    _poll: null,
    _lobby: null,
    _pollBusy: false,
    _dirBusy: false,
    _raf: 0,
    _lastSent: null,
    _scoreSig: "",
    canvas: null,
    ctx: null,

    init() {
      this.canvas = $("#match-canvas");
      this.ctx = null; // the shared renderer owns the match canvas
      document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-duel]");
        if (b) this.action(b.dataset.duel);
      });
      const form = $("#duel-form");
      if (form) form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.challenge((($("#duel-name") || {}).value || "").trim());
      });
      window.addEventListener("keydown", (e) => {
        if (!this.arena || !HPS.UI || HPS.UI.currentScreen !== "match") return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const d = KEYS[e.code];
        if (d) { e.preventDefault(); this.sendDir(d); }
      });
      if (this.canvas) {
        let sx = 0, sy = 0, down = false;
        this.canvas.addEventListener("pointerdown", (e) => { down = true; sx = e.clientX; sy = e.clientY; });
        this.canvas.addEventListener("pointerup", (e) => {
          if (!down) return;
          down = false;
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
          this.sendDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
        });
      }
    },

    /* ---------------------------- lobby ---------------------------- */
    open() {
      if (!HPS.UI) return;
      HPS.UI.returnTo = "title";
      HPS.UI.showScreen("match");
      if (this.summary && this.summary.status === "active") { this.enterArena(this.summary.id); return; }
      this.leaveArenaView();
      this.renderLobby(true);
      this.watchLobby();
    },

    watchLobby() {
      clearInterval(this._lobby);
      this._lobby = setInterval(async () => {
        if (!HPS.UI || HPS.UI.currentScreen !== "match" || this.arena) { clearInterval(this._lobby); return; }
        if (document.hidden) return;
        try {
          const d = await HPS.Net.request("/api/match/current", { noAuthRedirect: true });
          this.onSummary(d.match);
          if (d.match && d.match.status === "active") { clearInterval(this._lobby); this.enterArena(d.match.id); }
          else this.renderLobby();
        } catch (e) { /* ignore */ }
      }, 2000);
    },

    renderLobby(force) {
      const host = $("#match-lobby");
      const arena = $("#match-arena");
      if (arena) arena.hidden = true;
      if (!host) return;
      host.hidden = false;
      const s = this.summary;
      // Only redraw when something changed, so a half-typed username is never wiped.
      const sig = s ? [s.id, s.status, s.you].join("|") : "none";
      if (!force && sig === this._lobbySig && host.innerHTML) return;
      this._lobbySig = sig;
      let html = "";
      if (s && s.status === "pending" && s.you === 1) {
        html = '<div class="duel-state"><h3>Waiting for ' + esc(s.p2) + '…</h3><p>They have been notified. The duel starts as soon as they accept.</p>' +
          '<button class="btn" data-duel="cancel">Cancel challenge</button></div>';
      } else if (s && s.status === "pending") {
        html = '<div class="duel-state"><h3>' + esc(s.p1) + ' challenges you!</h3><p>Two serpents, one big board, 75 seconds. Eat more than your rival.</p>' +
          '<div class="menu row"><button class="btn primary" data-duel="accept">Accept</button><button class="btn ghost" data-duel="decline">Decline</button></div></div>';
      } else if (s && s.status === "active") {
        html = '<div class="duel-state"><h3>Your duel with ' + esc(s.you === 1 ? s.p2 : s.p1) + ' is live!</h3><button class="btn primary" data-duel="join">Join the arena</button></div>';
      } else {
        html = '<form id="duel-form" class="duel-form"><label class="field"><span>Challenge a player</span>' +
          '<input id="duel-name" type="text" maxlength="20" autocomplete="off" placeholder="username" required /></label>' +
          '<button class="btn primary" type="submit">Send challenge</button></form>' +
          '<ul class="duel-rules"><li>A larger shared board — both snakes play at once.</li>' +
          '<li>75 seconds. Golden snitches are worth 30, everything else 10.</li>' +
          '<li>Hitting a wall or any snake sends you back to your start after 2 seconds.</li>' +
          '<li>Most points wins. Leaving the arena forfeits the match.</li></ul>';
      }
      host.innerHTML = html;
      const form = $("#duel-form");
      if (form) form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.challenge((($("#duel-name") || {}).value || "").trim());
      });
    },

    async challenge(name) {
      if (!name) return;
      try {
        const d = await HPS.Net.request("/api/match/challenge", { method: "POST", body: { to: name } });
        this.summary = d.match;
        if (HPS.UI) HPS.UI.toast("Challenge sent to " + name + ".", "good");
        this.open();
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Could not send the challenge.", "bad");
      }
    },

    async action(name) {
      const s = this.summary;
      try {
        if (name === "join") { if (s) this.enterArena(s.id); return; }
        if (name === "back") { this.back(); return; }
        if (name === "rematch") {
          const opp = this.state && this.state.players ? this.state.players[1 - this.state.you].name : "";
          this.leaveArenaView();
          this.summary = null;
          await this.challenge(opp);
          return;
        }
        if (name === "leave") { this.onEscape(); return; }
        if (!s) return;
        const d = await HPS.Net.request("/api/match/" + s.id + "/" + name, { method: "POST", body: {} });
        this.summary = d.match.status === "pending" || d.match.status === "active" ? d.match : null;
        if (name === "accept" && d.match.status === "active") { this.enterArena(d.match.id); }
        else { this.renderLobby(true); this.updateRibbon(); }
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "That did not work.", "bad");
        this.poll();
      }
    },

    poll() { if (HPS.Social) HPS.Social.poll(); },

    /* summary arrives from the notification poll */
    onSummary(s) {
      this.summary = s || null;
      this.updateRibbon();
      if (HPS.UI && HPS.UI.currentScreen === "match" && !this.arena) this.renderLobby();
    },

    updateRibbon() {
      const el = $("#duel-ribbon");
      if (!el) return;
      const s = this.summary;
      const hide = !s || !HPS.Net.user || document.body.classList.contains("in-game") ||
        (HPS.UI && (HPS.UI.currentScreen === "match" || HPS.UI.currentScreen === "auth"));
      if (hide) { el.hidden = true; return; }
      let html;
      if (s.status === "pending" && s.you === 2) {
        html = "⚔ <b>" + esc(s.p1) + "</b> challenges you! " +
          '<button class="btn small primary" data-duel="accept">Accept</button><button class="btn small ghost" data-duel="decline">Decline</button>';
      } else if (s.status === "pending") {
        html = "⚔ Waiting for <b>" + esc(s.p2) + '</b> to accept… <button class="btn small ghost" data-duel="cancel">Cancel</button>';
      } else {
        html = "⚔ Your duel with <b>" + esc(s.you === 1 ? s.p2 : s.p1) + '</b> is live! <button class="btn small primary" data-duel="join">Join</button>';
      }
      el.innerHTML = html;
      el.hidden = false;
    },

    /* ---------------------------- arena ---------------------------- */
    enterArena(id) {
      if (HPS.UI && HPS.UI.currentScreen !== "match") HPS.UI.showScreen("match");
      clearInterval(this._lobby);
      this.id = id;
      this.arena = true;
      this.state = null;
      this._lastSent = null;
      this._scoreSig = "";
      const lobby = $("#match-lobby");
      const arena = $("#match-arena");
      if (lobby) lobby.hidden = true;
      if (arena) arena.hidden = false;
      const result = $("#match-result");
      if (result) result.hidden = true;
      this.updateRibbon();
      clearInterval(this._poll);
      this._poll = setInterval(() => this.fetchState(), 220);
      this.fetchState();
    },

    leaveArenaView() {
      this.arena = false;
      clearInterval(this._poll);
      this._poll = null;
      if (HPS.Duel) HPS.Duel.stop();
      this.id = null;
      this.state = null;
      const arena = $("#match-arena");
      if (arena) arena.hidden = true;
      const cd = $("#match-countdown");
      if (cd) cd.hidden = true;
    },

    back() {
      if (this.arena && this.state && this.state.status === "active") { this.onEscape(); return; }
      this.leaveArenaView();
      if (HPS.UI) HPS.UI.showTitle();
    },

    onEscape() {
      if (this.arena && this.state && this.state.status === "active") {
        if (!window.confirm("Leave the arena? Leaving forfeits the match.")) return;
        HPS.Net.request("/api/match/" + this.id + "/forfeit", { method: "POST", body: {} }).catch(() => {});
        this.summary = null;
        this.leaveArenaView();
        if (HPS.UI) HPS.UI.showTitle();
        return;
      }
      this.leaveArenaView();
      if (HPS.UI) HPS.UI.showTitle();
    },

    async fetchState() {
      if (!this.arena || this._pollBusy || !this.id) return;
      if (this.state && this.state.status === "finished") return;
      this._pollBusy = true;
      const t0 = performance.now();
      try {
        const data = await HPS.Net.request("/api/match/" + this.id + "/state", { noAuthRedirect: true });
        this.applyState(data, performance.now() - t0);
      } catch (err) {
        if (err.status === 404) this.leaveArenaView();
      } finally {
        this._pollBusy = false;
      }
    },

    async sendDir(dir) {
      if (!this.arena || !this.id || !this.state || this.state.status !== "active") return;
      if (dir === this._lastSent) return;
      this._lastSent = dir;
      HPS.Duel.steer(dir); // applies instantly on this screen; the server confirms a moment later
      if (this._dirBusy) { this._queued = dir; return; }
      this._dirBusy = true;
      const t0 = performance.now();
      try {
        const data = await HPS.Net.request("/api/match/" + this.id + "/dir", { method: "POST", body: { dir }, noAuthRedirect: true });
        this.applyState(data, performance.now() - t0);
      } catch (e) { /* the next poll recovers */ } finally {
        this._dirBusy = false;
        if (this._queued) { const q = this._queued; this._queued = null; this._lastSent = null; this.sendDir(q); }
      }
    },

    applyState(data, rttMs) {
      if (!this.arena) return;
      if (this.state && data.tick != null && this.state.tick != null && data.tick < this.state.tick && data.status === this.state.status) return;
      this.state = data;
      const D = HPS.Duel;
      D.noteClock(data.server_now, rttMs || 0);
      if (data.snakes) {
        if (!D.active) D.start($("#match-canvas"), data);
        D.applyServer(data);
      }
      if (data.status === "finished") {
        clearInterval(this._poll);
        this._poll = null;
        this.summary = null;
        this.showResult();
        if (HPS.Social) HPS.Social.poll();
      }
    },

    showResult() {
      const st = this.state;
      const box = $("#match-result");
      if (!box || !st.result) return;
      const r = st.result;
      const me = st.you;
      const title = r.winner == null ? "A draw" : r.winner === me ? "Victory!" : "Defeat";
      const why = r.reason === "forfeit" ? (r.winner === me ? " Your rival left the arena." : " You left the arena.") : "";
      box.innerHTML = "<h3>" + title + "</h3><p>" + esc(st.players[0].name) + " " + r.scores[0] + " — " + r.scores[1] + " " + esc(st.players[1].name) + why + "</p>" +
        '<div class="menu row"><button class="btn primary" data-duel="rematch">Rematch</button><button class="btn ghost" data-duel="back">Back to the castle</button></div>';
      box.hidden = false;
      if (r.winner === me) HPS.Audio.play("win");
    },

    /* the duel engine reports the live score and clock every frame */
    onHud(h) {
      if (!this.arena) return;
      const cd = $("#match-countdown");
      if (cd) {
        cd.hidden = !h.countdown;
        if (h.countdown) cd.textContent = h.countdown;
      }
      const status = h.final ? "Finished" : h.countdown ? "Get ready" : h.left + "s";
      const sig = [h.scores[0], h.scores[1], status, h.you].join("|");
      if (sig === this._scoreSig) return;
      this._scoreSig = sig;
      const el = $("#match-score");
      if (!el) return;
      const cell = (i) => '<div class="ms-player ' + (i === h.you ? "me" : "") + '"><span>' + esc(h.names[i]) + (i === h.you ? " (you)" : "") + "</span><b>" + h.scores[i] + "</b></div>";
      el.innerHTML = cell(0) + '<div class="ms-timer">' + status + "</div>" + cell(1);
    }
  };

  HPS.Match = Match;
})();
