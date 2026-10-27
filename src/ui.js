/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — menus, HUD & screens
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const UI = {
    game: null,
    currentScreen: null,
    returnTo: "title",
    currentAct: 1,
    _hudSig: "",
    _bannerTimer: null,
    _toastCount: 0,

    init(game) {
      this.game = game;
      if (HPS.Shop) HPS.Shop.init();
      if (HPS.Admin) HPS.Admin.init();
      this.bind();
      this.selectHouse(HPS.Save.data.house, true);
      this.refreshToggles();
      this.updateAccountBar();
      this.updateTitle();
      this.buildMap();
      this.showScreen("title");
      if (HPS.Net.user && HPS.Net.user.must_change) this.showPassword(true);
    },

    /* ---------------------------- screens ---------------------------- */
    showScreen(name) {
      $$(".screen").forEach((s) => s.classList.remove("active"));
      const el = $("#screen-" + name);
      if (el) el.classList.add("active");
      this.currentScreen = name;
      this.updateAccountBar();
      if (name === "account") this.updateAccountScreen();
      if (name === "share") this.updateShareScreen();
    },

    hideScreens() {
      $$(".screen").forEach((s) => s.classList.remove("active"));
      this.currentScreen = null;
    },

    enterGame(game) {
      document.body.classList.add("in-game");
      this.hideScreens();
      this._hudSig = "";
      this.updateHUD(game);
      this.updateAccountBar();
      setTimeout(() => { if (HPS.Render) HPS.Render.resize(true); }, 30);
    },

    showTitle() {
      document.body.classList.remove("in-game");
      this.game.state = "title";
      HPS.Audio.suspend();
      this.updateTitle();
      this.showScreen("title");
    },

    /* The server answered for a finished run (coins, best score, rank). */
    onRunResult(game) {
      if (game !== this.game) return;
      if (this.currentScreen === "over" && game.endless) this.showGameOver(game);
      else if (this.currentScreen === "win") this.showWin(game);
    },

    goHome() {
      const g = this.game;
      if (document.body.classList.contains("in-game") && (g.state === "playing" || g.state === "paused")) {
        if (!window.confirm("Return to the main menu? This run will be abandoned.")) return;
      }
      this.hideBanner();
      this.showTitle();
    },

    showMap(act) {
      document.body.classList.remove("in-game");
      this.game.state = "title";
      HPS.Audio.suspend();
      if (act) this.currentAct = act;
      else {
        const last = HPS.Save.lastPlayable();
        const lvl = HPS.LEVELS.find((l) => l.id === last);
        if (lvl) this.currentAct = lvl.act;
      }
      this.buildMap();
      this.showScreen("map");
      this.updateMapSummary();
      if (HPS.Save.data.settings.difficulty === "hell") {
        this.toast("Hell is endless-only — use Hell Night or switch mode.", "bad");
      }
    },

    showPause() {
      const restart = $('[data-action="restart"]');
      if (restart) restart.textContent = this.game.endless ? "Restart Run" : "Restart Level";
      this.showScreen("pause");
    },

    showSettings(from) {
      this.returnTo = from || this.currentScreen || "title";
      this.refreshToggles();
      this.showScreen("settings");
    },

    showHowto(from) {
      this.returnTo = from || this.currentScreen || "title";
      this.showScreen("howto");
    },

    back() {
      if (this.returnTo === "pause" && this.game.state === "paused") this.showScreen("pause");
      else if (this.returnTo === "map") this.showMap();
      else this.showScreen("title");
    },

    showWin(game) {
      const lvl = game.level;
      const nextId = lvl.id + 1;
      const hasNext = !!HPS.LEVELS.find((l) => l.id === nextId);
      $("#win-eyebrow").textContent = lvl.boss ? "Guardian Defeated" : "Trial Complete";
      $("#win-title").textContent = lvl.name;
      const stars = game.winStars || 1;
      $("#win-stars").innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? "on" : ""}">★</span>`).join("");
      const subs = [
        "",
        "You survived, but the castle expects more. Finish faster or score higher for another star.",
        "A fine piece of magic. One more star still waits in the shadows.",
        "Flawless. Even the portraits are impressed."
      ];
      const reward = game.coinsEarned || game.lastCoinReward || 0;
      $("#win-sub").textContent = (subs[stars] || subs[1]) + (reward ? "  +" + reward + " coins." : "");
      $("#win-score").textContent = game.score;
      $("#win-time").textContent = this.formatTime(game.winTime || game.elapsed);
      $("#win-len").textContent = game.snake.cells.length;
      const nextBtn = $('[data-action="next"]');
      if (nextBtn) {
        nextBtn.disabled = !hasNext;
        nextBtn.textContent = hasNext ? "Next Trial" : "All Trials Complete";
      }
      this.showScreen("win");
      this.updateTitle();
    },

    showGameOver(game) {
      const reasons = {
        wall: "You struck the castle stone.",
        self: "You bit your own tail. The oldest mistake in the castle.",
        edge: "The wards pushed you back into the dark.",
        patrol: "A guardian caught you in the dark.",
        boss: "The guardian's magic found you."
      };
      if (game.endless) {
        const hell = game.difficulty === "hell";
        const reward = game.coinsEarned || game.lastCoinReward || 0;
        $("#over-eyebrow").textContent = hell ? "Hell Night" : "Endless Night";
        $("#over-title").textContent = hell ? "Even hell lets go" : "The night takes you";
        const rr = game.runResult;
        const modeName = game.difficulty === "hell" ? "Hell" : game.difficulty === "difficult" ? "Difficult" : "Easy";
        $("#over-reason").textContent = "You survived " + Math.max(0, game.wave - 1) + " waves and gathered " + game.eaten + " treasures." +
          (reward ? "  +" + reward.toLocaleString() + " coins." : "") +
          (rr && rr.rank ? "  " + modeName + " leaderboard rank #" + rr.rank + (rr.best_updated ? " — new personal best!" : ".") : "");
        $("#over-best").textContent = rr && rr.best != null ? rr.best : HPS.Save.data.endlessBest;
        $("#over-score").textContent = game.score;
        $("#over-items").textContent = game.eaten;
        $("#over-hint").innerHTML = 'Press <kbd>R</kbd> to try ' + (hell ? "hell" : "the night") + " again";
      } else {
        $("#over-eyebrow").textContent = "The dark prevails";
        $("#over-title").textContent = "The serpent falls";
        $("#over-reason").textContent = reasons[game.deathReason] || "The castle claims another wanderer.";
        $("#over-score").textContent = game.score;
        $("#over-best").textContent = Math.max(HPS.Save.best(game.level.id), game.score);
        $("#over-items").textContent = game.eaten + " / " + game.target;
        $("#over-hint").innerHTML = 'Press <kbd>R</kbd> to try again';
      }
      this.showScreen("over");
      this.updateTitle();
    },

    /* ---------------------------- HUD ---------------------------- */
    updateHUD(game) {
      if (!game || !game.level) return;
      const goalLabel = $("#hud-goal-label");
      const goal = $("#hud-goal");
      const time = $("#hud-time");
      const powersEl = $("#hud-powers");
      const revivesEl = $("#hud-revives");

      const goalText = game.endless ? String(game.eaten) : game.eaten + "/" + game.target;
      const timeText = this.formatTime(game.elapsed);
      const powerParts = [];
      const powerDefs = { cloak: "CLOAK", felix: "FELIX", nimbus: "NIMBUS" };
      const powerColors = { cloak: "#bcd2ff", felix: "#ffd66e", nimbus: "#ffb05f" };
      ["cloak", "felix", "nimbus"].forEach((k) => {
        const v = game.buffs[k];
        if (v > 0) powerParts.push(`<span class="power-chip" style="color:${powerColors[k]}"><i></i><span>${powerDefs[k]}</span><small>${Math.ceil(v)}s</small></span>`);
      });
      const chip = (label, note, color) =>
        `<span class="power-chip" style="color:${color}"><i></i><span>${label}</span><small>${note}</small></span>`;
      const eff = game.effect || "";
      if (eff === "invincible") powerParts.push(chip("AEGIS", game.aegisCd > 0 ? Math.ceil(game.aegisCd) + "s" : "READY", "#9cd0ff"));
      if (eff === "attacker") powerParts.push(chip("VENOM", game.strikeCd > 0 ? Math.ceil(game.strikeCd) + "s" : "SPACE", "#9dff4a"));
      if (eff === "luck" && game.hell) powerParts.push(chip("LUCK", "×2 coins", "#ffe27a"));
      const strikeBtn = $("#hud-strike");
      if (strikeBtn) strikeBtn.hidden = eff !== "attacker";
      const mode = game.difficulty === "hell" ? "Hell" : game.difficulty === "difficult" ? "Difficult" : "Easy";
      const sig = [
        game.level.name, game.score, goalText, game.snake.cells.length, timeText,
        powerParts.join("|"), game.revives, game.wave, game.endless, mode, HPS.Save.data.coins
      ].join("::");
      if (sig === this._hudSig) return;
      this._hudSig = sig;

      $("#hud-act").textContent = game.endless ? (game.difficulty === "hell" ? "Hell" : "Endless") : "Act " + this.roman(game.level.act);
      const modeBadge = $("#hud-mode");
      if (modeBadge) {
        modeBadge.textContent = mode;
        modeBadge.classList.toggle("difficult", game.difficulty === "difficult");
        modeBadge.classList.toggle("hell", game.difficulty === "hell");
      }
      $("#hud-name").textContent = game.endless ? (game.difficulty === "hell" ? "Hell " : "Night ") + game.wave : game.level.name;
      $("#hud-score").textContent = game.score;
      goalLabel.textContent = game.endless ? "Wave " + game.wave : "Snitches";
      goal.textContent = goalText;
      $("#hud-len").textContent = game.snake.cells.length;
      time.textContent = timeText;
      const hudCoins = $("#hud-coins");
      if (hudCoins) hudCoins.textContent = HPS.Save.data.coins || 0;
      powersEl.innerHTML = powerParts.join("");
      revivesEl.innerHTML = "♥".repeat(game.revives);
    },

    roman(n) {
      return ["", "I", "II", "III", "IV", "V"][n] || n;
    },

    formatTime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    },

    /* ---------------------------- title ---------------------------- */
    updateTitle() {
      const last = HPS.Save.lastPlayable();
      const stars = HPS.Save.totalStars();
      const max = HPS.LEVELS.length * 3;
      const el = $("#title-progress");
      if (el) {
        el.textContent = stars >= max
          ? "All 24 trials mastered · " + stars + " stars"
          : "Level " + last + " of 24 · " + stars + " of " + max + " stars";
      }
      const hell = HPS.Save.data.settings.difficulty === "hell";
      const cont = $('[data-action="continue"]');
      if (cont) {
        cont.textContent = hell
          ? "Hell Night — Endless"
          : (stars > 0 ? "Continue — Trial " + last : "Begin the First Year");
      }
      this.updateAccountBar();
    },

    /* ---------------------------- account ---------------------------- */
    updateAccountBar() {
      const bar = $("#account-bar");
      const user = HPS.Net ? HPS.Net.user : null;
      if (!bar) return;
      if (!user || document.body.classList.contains("in-game") || this.currentScreen === "auth") {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      const name = $("#account-name");
      const coins = $("#account-coins");
      const role = $("#account-role");
      const admin = $("#account-admin");
      if (name) name.textContent = user.username;
      if (coins) coins.textContent = Number(HPS.Save.data.coins || 0).toLocaleString();
      if (role) role.hidden = !user.is_admin;
      if (admin) admin.hidden = !user.is_admin;
      const adminPanel = $("#account-admin-panel");
      if (adminPanel) adminPanel.hidden = !user.is_admin;
    },

    updateAccountScreen() {
      const user = HPS.Net ? HPS.Net.user : null;
      if (!user) return;
      const name = $("#account-username");
      const avatar = $("#account-avatar");
      const meta = $("#account-meta");
      if (name) name.textContent = user.username;
      if (avatar) avatar.textContent = String(user.username).charAt(0).toUpperCase();
      if (meta) meta.textContent = user.is_admin ? "Administrator · cloud save active" : "Cloud save active · passwords are hashed";
      const coins = $("#account-stat-coins");
      const stars = $("#account-stat-stars");
      const skins = $("#account-stat-skins");
      if (coins) coins.textContent = Number(HPS.Save.data.coins || 0).toLocaleString();
      if (stars) stars.textContent = HPS.Save.totalStars();
      if (skins) skins.textContent = (HPS.Save.data.skins || []).length;
      const admin = $("#account-admin-panel");
      if (admin) admin.hidden = !user.is_admin;
      this.updateShareScreen();
    },

    updateShareScreen() {
      const bal = $("#share-balance");
      if (bal) bal.textContent = Number(HPS.Save.data.coins || 0).toLocaleString();
      const input = $("#share-amount");
      if (input) input.max = String(Math.max(1, HPS.Save.data.coins || 0));
    },

    showAccount(from) {
      this.returnTo = from || this.currentScreen || "title";
      this.updateAccountScreen();
      this.showScreen("account");
    },

    showShop() {
      if (HPS.Shop) HPS.Shop.open();
    },

    showPassword(forced) {
      const err = $("#password-error");
      if (err) err.textContent = "";
      const note = $("#password-forced-note");
      if (note) note.hidden = !forced;
      const back = $("#screen-password .icon-btn");
      if (back) back.hidden = !!forced;
      ["password-current", "password-new", "password-confirm"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      this.showScreen("password");
    },

    showShare() {
      const err = $("#share-error");
      if (err) err.textContent = "";
      const rec = $("#share-recipient");
      if (rec) rec.value = "";
      const amt = $("#share-amount");
      if (amt) amt.value = "100";
      this.updateShareScreen();
      this.showScreen("share");
    },

    /* ---------------------------- map ---------------------------- */
    buildMap() {
      if (this.currentAct < 1 || this.currentAct > 4) this.currentAct = 1;
      const acts = HPS.ACTS || [];
      const tabs = $("#act-tabs");
      tabs.innerHTML = acts.map((a) => {
        const lvls = HPS.LEVELS.filter((l) => l.act === a.id);
        const stars = lvls.reduce((sum, l) => sum + HPS.Save.stars(l.id), 0);
        const done = lvls.every((l) => HPS.Save.stars(l.id) > 0);
        return `<button class="tab ${a.id === this.currentAct ? "active" : ""}" data-act="${a.id}">
          ${a.name}<small>${done ? "✓ complete" : stars + " / " + lvls.length * 3 + " stars"}</small>
        </button>`;
      }).join("");

      const levels = HPS.LEVELS.filter((l) => l.act === this.currentAct);
      const grid = $("#level-grid");
      grid.innerHTML = levels.map((l) => {
        const unlocked = HPS.Save.isUnlocked(l.id);
        const stars = HPS.Save.stars(l.id);
        const best = HPS.Save.best(l.id);
        const starStr = [0, 1, 2].map((i) => `<span class="${i < stars ? "on" : ""}">${i < stars ? "★" : "☆"}</span>`).join("");
        return `<button class="level-card ${unlocked ? "" : "locked"} ${l.boss ? "boss" : ""}" data-level="${l.id}">
          <div class="lc-top">
            <span class="lc-num">${l.boss ? "GUARDIAN" : "LEVEL " + String(l.id).padStart(2, "0")}</span>
            ${l.boss ? '<span class="boss-badge">BOSS</span>' : ""}
          </div>
          <div class="lc-name">${l.name}</div>
          <div class="lc-stars">${unlocked ? starStr : "☆☆☆"}</div>
          <div class="lc-meta">${l.boss ? "Survive the guardian" : l.tagline}</div>
          ${best ? `<div class="lc-best">Best ${best}</div>` : ""}
        </button>`;
      }).join("");

      const crest = $("#map-crest");
      const house = HPS.Render ? HPS.Render.house() : { letter: "G", main: "#7d1c2e", deep: "#4a0e1b" };
      if (crest) {
        crest.textContent = house.letter;
        crest.style.background = "linear-gradient(180deg," + house.main + "," + house.deep + ")";
      }
      this.updateMapSummary();
    },

    updateMapSummary() {
      const el = $("#map-summary");
      if (!el) return;
      const mode = HPS.Save.data.settings.difficulty === "hell"
        ? "Hell (endless only)"
        : HPS.Save.data.settings.difficulty === "difficult" ? "Difficult" : "Easy";
      el.textContent = mode + " mode · " + HPS.Save.totalStars() + " of " + (HPS.LEVELS.length * 3) + " stars · endless best " + HPS.Save.data.endlessBest;
    },

    /* ---------------------------- banner & toasts ---------------------------- */
    banner(eyebrow, title, sub, bossTag, ms) {
      const el = $("#banner");
      if (!el) return;
      $("#banner-eyebrow").textContent = eyebrow || "";
      $("#banner-title").textContent = title || "";
      $("#banner-sub").innerHTML = (sub || "") + (bossTag ? `<br><span class="boss-tag">${bossTag}</span>` : "");
      el.classList.add("show");
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => el.classList.remove("show"), ms || 2600);
    },

    hideBanner() {
      const el = $("#banner");
      if (el) el.classList.remove("show");
      clearTimeout(this._bannerTimer);
    },

    toast(text, kind) {
      const host = $("#toasts");
      if (!host) return;
      const banner = $("#banner");
      if (banner) banner.classList.remove("show"); // a live message takes the bar's space
      Array.from(host.children).forEach((el) => { if (el.textContent === text) host.removeChild(el); });
      while (host.children.length >= 3) host.removeChild(host.firstChild);
      const t = document.createElement("div");
      t.className = "toast " + (kind || "");
      t.textContent = text;
      host.appendChild(t);
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2250);
    },

    /* ---------------------------- houses & toggles ---------------------------- */
    selectHouse(house, silent) {
      if (!HPS.Render || !HPS.Render.HOUSE[house]) house = "gryffindor";
      HPS.Save.setHouse(house);
      $$("#house-picker .house").forEach((b) => {
        b.classList.toggle("active", b.dataset.house === house);
      });
      const crest = $("#map-crest");
      const h = HPS.Render.HOUSE[house];
      if (crest && h) {
        crest.textContent = h.letter;
        crest.style.background = "linear-gradient(180deg," + h.main + "," + h.deep + ")";
      }
      if (!silent) {
        HPS.Audio.init();
        HPS.Audio.play("click");
      }
    },

    refreshToggles() {
      const s = HPS.Save.data.settings;
      $$("[data-toggle]").forEach((btn) => {
        const k = btn.dataset.toggle;
        const on = !!s[k];
        btn.classList.toggle("on", on);
        btn.textContent = on ? "On" : "Off";
      });
      this.refreshMode();
    },

    refreshMode() {
      const mode = ["easy", "difficult", "hell"].includes(HPS.Save.data.settings.difficulty)
        ? HPS.Save.data.settings.difficulty : "easy";
      $$("[data-mode]").forEach((btn) => {
        const on = btn.dataset.mode === mode;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("locked", document.body.classList.contains("in-game"));
      });
      this.updateMapSummary();
    },

    setMode(mode) {
      mode = ["easy", "difficult", "hell"].includes(mode) ? mode : "easy";
      if (this.game.setDifficulty(mode) === false) return;
      this.refreshMode();
      this._hudSig = "";
      if (this.game.level && document.body.classList.contains("in-game")) this.updateHUD(this.game);
      if (mode === "hell") this.toast("Hell selected — Endless Night only. Walls are fatal.", "magic");
      HPS.Audio.play("click");
    },

    toggleSetting(key) {
      const s = HPS.Save.data.settings;
      s[key] = !s[key];
      HPS.Save.write();
      if (key === "sound") HPS.Audio.setSound(s.sound);
      else if (key === "music") HPS.Audio.setMusic(s.music);
      this.refreshToggles();
      HPS.Audio.play("click");
    },

    /* ---------------------------- events ---------------------------- */
    bind() {
      // global click (UI sounds + actions)
      document.addEventListener("click", (e) => {
        const houseBtn = e.target.closest("[data-house]");
        if (houseBtn) { this.selectHouse(houseBtn.dataset.house); return; }

        const actBtn = e.target.closest("[data-act]");
        if (actBtn) {
          this.currentAct = parseInt(actBtn.dataset.act, 10);
          this.buildMap();
          HPS.Audio.play("click");
          return;
        }

        const levelBtn = e.target.closest("[data-level]");
        if (levelBtn) {
          const id = parseInt(levelBtn.dataset.level, 10);
          HPS.Audio.init();
          if (!HPS.Save.isUnlocked(id)) {
            HPS.Audio.play("click");
            this.toast("Locked — finish the trial before it first", "bad");
            levelBtn.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: 220 });
            return;
          }
          HPS.Audio.play("click");
          this.hideBanner();
          this.game.startLevel(id);
          return;
        }

        const modeBtn = e.target.closest("[data-mode]");
        if (modeBtn) { this.setMode(modeBtn.dataset.mode); return; }

        const toggle = e.target.closest("[data-toggle]");
        if (toggle) { this.toggleSetting(toggle.dataset.toggle); return; }

        const actionBtn = e.target.closest("[data-action]");
        if (actionBtn) {
          const action = actionBtn.dataset.action;
          HPS.Audio.init();
          HPS.Audio.play("click");
          this.handleAction(action, actionBtn);
        }
      });

      // first gesture unlocks audio
      const unlock = () => {
        HPS.Audio.init();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);

      const pwForm = $("#password-form");
      if (pwForm) pwForm.addEventListener("submit", (e) => { e.preventDefault(); this.submitPassword(); });
      const shareForm = $("#share-form");
      if (shareForm) shareForm.addEventListener("submit", (e) => { e.preventDefault(); this.submitShare(); });

      HPS.Input.onDir = (d) => this.game.queueDir(d);
      HPS.Input.onPause = () => {
        const menus = ["settings", "howto", "shop", "account", "share", "admin", "leaderboard", "chats", "chat", "notices"];
        if (this.currentScreen === "password" && HPS.Net.user && HPS.Net.user.must_change) return;
        if (this.currentScreen === "match" && HPS.Match) { HPS.Match.onEscape(); return; }
        if (this.currentScreen === "password") { this.showAccount("account"); return; }
        if (menus.includes(this.currentScreen)) {
          if (this.game.state === "paused") this.showScreen("pause");
          else this.showTitle();
          return;
        }
        if (this.currentScreen === "map" || this.currentScreen === "title" ||
            this.currentScreen === "win" || this.currentScreen === "over") {
          return;
        }
        if (this.game.state === "playing") this.game.pause();
        else if (this.game.state === "paused") this.game.resume();
      };
      HPS.Input.onAttack = () => {
        if (this.game.state !== "playing") return false;
        this.game.attack();
        return true;
      };
      HPS.Input.onRestart = () => {
        if (this.game.state === "over" || this.game.state === "playing" || this.game.state === "paused") {
          this.hideScreens();
          this.game.restart();
        }
      };
      HPS.Input.onConfirm = () => {
        if (this.currentScreen) {
          const btn = $("#screen-" + this.currentScreen + " .btn.primary");
          if (btn && !btn.disabled) btn.click();
        }
      };
    },

    async submitPassword() {
      const current = ($("#password-current") || {}).value || "";
      const next = ($("#password-new") || {}).value || "";
      const confirm = ($("#password-confirm") || {}).value || "";
      const err = $("#password-error");
      const btn = $("#password-submit");
      const setError = (msg) => { if (err) err.textContent = msg; };
      if (next.length < 6) return setError("New password must be at least 6 characters.");
      if (next !== confirm) return setError("The new passwords do not match.");
      if (next === current) return setError("New password must be different from the current one.");
      if (btn) { btn.disabled = true; btn.textContent = "Changing…"; }
      setError("");
      try {
        await HPS.Net.changePassword(current, next);
        const note = $("#password-forced-note");
        if (note) note.hidden = true;
        const back = $("#screen-password .icon-btn");
        if (back) back.hidden = false;
        this.toast("Password changed. Other sessions were signed out.", "good");
        this.showAccount("account");
      } catch (ex) {
        setError(ex.message || "Could not change password.");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Change Password"; }
      }
    },

    async submitShare() {
      const to = ($("#share-recipient") || {}).value || "";
      const amount = Number(($("#share-amount") || {}).value || 0);
      const err = $("#share-error");
      const btn = $("#share-submit");
      const setError = (msg) => { if (err) err.textContent = msg; };
      if (!to.trim()) return setError("Enter a recipient username.");
      if (!Number.isFinite(amount) || amount < 1 || Math.floor(amount) !== amount) {
        return setError("Enter a whole number of coins.");
      }
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      setError("");
      try {
        const data = await HPS.Net.shareCoins(to.trim(), amount);
        this.toast("Sent " + data.sent.toLocaleString() + " coins to " + data.to + ".", "good");
        this.updateAccountScreen();
        this.showAccount("account");
      } catch (ex) {
        setError(ex.message || "Transfer failed.");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Send Coins"; }
      }
    },

    handleAction(action, btn) {
      switch (action) {
        case "continue": {
          const id = HPS.Save.lastPlayable();
          this.hideBanner();
          this.game.startLevel(id);
          break;
        }
        case "map":
          this.hideBanner();
          this.showMap();
          break;
        case "endless":
          this.hideBanner();
          this.game.startEndless();
          break;
        case "hell":
          this.hideBanner();
          this.game.startHell();
          break;
        case "title":
          this.showTitle();
          break;
        case "home":
          this.goHome();
          break;
        case "strike":
          this.game.attack();
          break;
        case "leaderboard":
          if (HPS.Social) HPS.Social.openLeaderboard();
          break;
        case "chats":
          if (HPS.Social) HPS.Social.openChats();
          break;
        case "notices":
          if (HPS.Social) HPS.Social.openNotices();
          break;
        case "duel":
          if (HPS.Match) HPS.Match.open();
          break;
        case "howto":
          this.showHowto(this.currentScreen || "title");
          break;
        case "settings":
          this.showSettings(this.currentScreen || "title");
          break;
        case "shop":
          this.showShop();
          break;
        case "account":
          this.showAccount(this.currentScreen || "title");
          break;
        case "password":
          this.showPassword();
          break;
        case "share":
          this.showShare();
          break;
        case "admin":
          if (HPS.Admin) HPS.Admin.open();
          break;
        case "logout":
          if (window.confirm("Log out? Your cloud save stays on the server.")) HPS.Net.logout();
          break;
        case "back":
          this.back();
          break;
        case "pause":
          this.game.pause();
          break;
        case "resume":
          this.game.resume();
          break;
        case "restart":
          this.hideScreens();
          this.game.restart();
          break;
        case "quit":
          this.game.quitToMap();
          break;
        case "next": {
          const next = (this.game.level ? this.game.level.id : 0) + 1;
          if (HPS.LEVELS.find((l) => l.id === next)) {
            this.game.startLevel(next);
          }
          break;
        }
        case "replay":
          this.game.restart();
          break;
        case "retry":
          this.game.restart();
          break;
        case "reset-progress": {
          if (window.confirm("Reset all progress, stars and endless best scores? This cannot be undone.")) {
            HPS.Save.reset();
            this.updateTitle();
            this.buildMap();
            this.toast("Progress cleared", "bad");
          }
          break;
        }
      }
    }
  };

  HPS.UI = UI;
})();
