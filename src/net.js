/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — authenticated API / cloud save layer
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const $ = (sel) => document.querySelector(sel);

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  const Net = {
    build: "social-6",
    user: null,
    csrf: null,
    authMode: "login",
    _authReady: null,
    _saveTimer: null,
    _saveSeq: 0,
    _saving: false,
    _redirecting: false,
    _bound: false,

    /* ---------------------------- boot ---------------------------- */
    async boot() {
      this.bindAuth();
      this.showAuth("", true);
      
      // Check if user specifically requested a fresh login state
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("logout") || urlParams.has("reset")) {
        await this.logout();
        // logout() navigates away; never resolve so main.js doesn't build the
        // logged-in game UI (title screen, "Wizard" account bar) in the meantime.
        return new Promise(() => {});
      }

      try {
        const me = await this.request("/api/me", { noAuthRedirect: true });
        this.user = me.user;
        this.csrf = me.csrf;
        const cloud = await this.request("/api/save", { noAuthRedirect: true });
        this.user = cloud.user;
        HPS.Save.applyServer(cloud.save, cloud.user);
        this.sessionReady();
        return true;
      } catch (err) {
        if (err.status === 401) {
          this.showAuth("");
          return new Promise((resolve) => { this._authReady = resolve; });
        }
        this.showAuth(
          "Cannot reach the game server. Refresh or verify server connectivity."
        );
        return new Promise((resolve) => { this._authReady = resolve; });
      }
    },

    sessionReady() {
      document.body.classList.add("logged-in");
      const auth = $("#screen-auth");
      if (auth) auth.classList.remove("active");
      this.updateSessionUI();
    },

    showAuth(message, checking) {
      document.body.classList.remove("logged-in", "in-game");
      document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
      const auth = $("#screen-auth");
      if (auth) auth.classList.add("active");
      const bar = $("#account-bar");
      if (bar) bar.hidden = true;
      const err = $("#auth-error");
      if (err) err.textContent = message || "";
      const submit = $("#auth-submit");
      if (submit) {
        submit.disabled = !!checking;
        submit.textContent = checking ? "Checking session…" : (this.authMode === "register" ? "Create Account" : "Sign In");
      }
      if (!checking) setTimeout(() => { const u = $("#auth-username"); if (u) u.focus(); }, 80);
    },

    bindAuth() {
      if (this._bound) return;
      this._bound = true;
      const tabs = document.querySelectorAll("[data-auth-tab]");
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => this.setAuthMode(tab.dataset.authTab));
      });
      const form = $("#auth-form");
      if (form) form.addEventListener("submit", (e) => { e.preventDefault(); this.submitAuth(); });
      this.bindForgot();

      window.addEventListener("beforeunload", () => {
        if (this.user) this.flushSave(true);
      });
    },

    /* "Forgot password" works before sign-in: it notifies the admin. */
    bindForgot() {
      const show = (on) => {
        const auth = $("#screen-auth");
        const forgot = $("#screen-forgot");
        if (auth) auth.classList.toggle("active", !on);
        if (forgot) forgot.classList.toggle("active", on);
        const msg = $("#forgot-message");
        if (msg) msg.textContent = "";
        if (on) setTimeout(() => { const u = $("#forgot-username"); if (u) u.focus(); }, 60);
      };
      const open = $("#auth-forgot-link");
      if (open) open.addEventListener("click", () => show(true));
      const back = $("#forgot-back");
      if (back) back.addEventListener("click", () => show(false));
      const form = $("#forgot-form");
      if (form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = (($("#forgot-username") || {}).value || "").trim();
        const msg = $("#forgot-message");
        const btn = $("#forgot-submit");
        if (!name) { if (msg) msg.textContent = "Enter your username."; return; }
        if (btn) btn.disabled = true;
        try {
          const data = await this.forgotPassword(name);
          if (msg) msg.textContent = data.message || "Request sent.";
        } catch (ex) {
          if (msg) msg.textContent = ex.message || "Could not send the request.";
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    },

    setAuthMode(mode) {
      this.authMode = mode === "register" ? "register" : "login";
      document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.authTab === this.authMode);
      });
      const confirmRow = $("#auth-confirm-row");
      if (confirmRow) confirmRow.hidden = this.authMode !== "register";
      const pw = $("#auth-password");
      if (pw) pw.autocomplete = this.authMode === "register" ? "new-password" : "current-password";
      const err = $("#auth-error");
      if (err) err.textContent = "";
      const submit = $("#auth-submit");
      if (submit) submit.textContent = this.authMode === "register" ? "Create Account" : "Sign In";
    },

    async submitAuth() {
      const username = ($("#auth-username") || {}).value || "";
      const password = ($("#auth-password") || {}).value || "";
      const confirm = ($("#auth-confirm") || {}).value || "";
      const err = $("#auth-error");
      const submit = $("#auth-submit");
      const setError = (msg) => { if (err) err.textContent = msg; };

      if (username.trim().length < 3) return setError("Enter a username with at least 3 characters.");
      if (password.length < 6) return setError("Password must be at least 6 characters.");
      if (this.authMode === "register" && password !== confirm) return setError("The passwords do not match.");

      if (submit) { submit.disabled = true; submit.textContent = this.authMode === "register" ? "Creating…" : "Signing in…"; }
      setError("");
      try {
        const path = this.authMode === "register" ? "/api/register" : "/api/login";
        const data = await this.request(path, { method: "POST", body: { username: username.trim(), password } });
        this.user = data.user;
        this.csrf = data.csrf;
        HPS.Save.applyServer(data.save, data.user);
        this.sessionReady();
        const resolve = this._authReady;
        this._authReady = null;
        if (resolve) resolve(true);
      } catch (ex) {
        setError(ex.message || "Sign in failed.");
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = this.authMode === "register" ? "Create Account" : "Sign In";
        }
      }
    },

    /* ---------------------------- request ---------------------------- */
    async request(path, opts = {}) {
      const method = opts.method || "GET";
      const headers = { "Accept": "application/json" };
      let body;
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
      if (method !== "GET" && this.csrf) headers["X-CSRF-Token"] = this.csrf;
      let res;
      try {
        res = await fetch(path, {
          method,
          headers,
          body,
          credentials: "same-origin",
          keepalive: !!opts.keepalive,
          cache: "no-store"
        });
      } catch (e) {
        throw new ApiError("Network error. Check that the server is running.", 0);
      }
      let data = {};
      try { data = await res.json(); } catch (e) { data = {}; }
      if (!res.ok) {
        if (res.status === 401 && !opts.noAuthRedirect) this.handleUnauthorized();
        throw new ApiError(data.error || ("Request failed (" + res.status + ")"), res.status);
      }
      return data;
    },

    handleUnauthorized() {
      if (this._redirecting) return;
      this._redirecting = true;
      try { if (HPS.game && HPS.game.pause) HPS.game.pause(); } catch (e) { /* ignore */ }
      setTimeout(() => window.location.reload(), 60);
    },

    /* ---------------------------- save sync ---------------------------- */
    queueSave(delay) {
      if (!this.user) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.flushSave(false), delay == null ? 550 : delay);
    },

    async flushSave(keepalive) {
      if (!this.user) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      const seq = ++this._saveSeq;
      const snapshot = HPS.Save.snapshot();
      this._saving = true;
      try {
        const data = await this.request("/api/save", {
          method: "POST",
          body: { save: snapshot },
          keepalive: !!keepalive,
          noAuthRedirect: !!keepalive
        });
        this.user = data.user;
        if (seq === this._saveSeq) HPS.Save.applyServer(data.save, data.user);
        else HPS.Save.setCoins(data.user.coins);
        this.updateSessionUI();
      } catch (err) {
        if (!keepalive && err.status !== 429) {
          this.toast("Cloud save delayed — check your connection.", "bad");
        }
      } finally {
        this._saving = false;
      }
    },

    /* ---------------------------- account actions ---------------------------- */
    /* A run token ties a game to its mode on the server (anti-cheat). */
    async runStart(kind, mode, levelId) {
      if (!this.user) return null;
      try {
        const body = { kind, mode };
        if (kind === "level") body.level_id = levelId;
        const data = await this.request("/api/run/start", { method: "POST", body, noAuthRedirect: true });
        return data.run;
      } catch (err) {
        return null;
      }
    },

    async runFinish(token, stats) {
      if (!this.user || !token) return null;
      try {
        const data = await this.request("/api/run/finish", { method: "POST", body: Object.assign({ run: token }, stats) });
        this.user = data.user;
        HPS.Save.setCoins(data.user.coins);
        this.mergeInventory(data.save);
        this.updateSessionUI();
        if (data.awarded > 0) this.toast("+" + data.awarded.toLocaleString() + " coins" + (data.luck ? " — Luck skin ×2!" : ""), "good");
        return data;
      } catch (err) {
        if (err.status === 429) this.toast("Coin reward limit reached — try again shortly.", "bad");
        return null;
      }
    },

    /* Take only skins/equipment from a server save, never progress (it may be newer locally). */
    mergeInventory(save) {
      if (!save) return;
      const d = HPS.Save.data;
      d.skins = Array.isArray(save.skins) ? save.skins.slice() : d.skins;
      d.equippedSkin = save.equippedSkin || d.equippedSkin;
      d.equippedBoard = save.equippedBoard || "";
    },

    async syncInventory() {
      if (!this.user) return;
      try {
        const data = await this.request("/api/save", { noAuthRedirect: true });
        this.user = data.user;
        HPS.Save.setCoins(data.user.coins);
        this.mergeInventory(data.save);
        await HPS.Skins.load();
        this.updateSessionUI();
      } catch (e) { /* ignore */ }
    },

    async forgotPassword(username) {
      return this.request("/api/forgot", { method: "POST", body: { username }, noAuthRedirect: true });
    },

    async buySkin(skinId) {
      const data = await this.request("/api/shop/buy", { method: "POST", body: { skin_id: skinId } });
      this.applyState(data);
      return data;
    },

    async equipSkin(skinId, kind) {
      const data = await this.request("/api/shop/equip", { method: "POST", body: { skin_id: skinId, kind: kind || "" } });
      this.applyState(data);
      return data;
    },

    async shareCoins(to, amount) {
      const data = await this.request("/api/coins/share", { method: "POST", body: { to, amount } });
      this.applyState(data);
      return data;
    },

    async changePassword(currentPassword, newPassword) {
      const data = await this.request("/api/password", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword }
      });
      this.user = data.user;
      this.csrf = data.csrf;
      HPS.Save.applyServer(data.save, data.user);
      this.updateSessionUI();
      return data;
    },

    async logout() {
      if (this._loggingOut) return;
      this._loggingOut = true;
      // Stop any pending autosave so it cannot fire against a dead session.
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      let ok = true;
      try {
        await this.request("/api/logout", { method: "POST", noAuthRedirect: true });
      } catch (e) {
        // 401 just means the session was already gone, which is fine.
        ok = e.status === 401;
      }
      if (!ok) {
        this._loggingOut = false;
        this.toast("Could not log out — the server did not respond. Try again.", "bad");
        return;
      }
      this.user = null;
      this.csrf = null;
      try { localStorage.removeItem("hogwarts-serpent.save.v1"); } catch (e) { /* ignore */ }
      window.location.replace(window.location.pathname + "?_=" + Date.now());
    },

    applyState(data) {
      if (data.user) this.user = data.user;
      if (data.save) HPS.Save.applyServer(data.save, this.user);
      else if (data.user) HPS.Save.setCoins(data.user.coins);
      this.updateSessionUI();
    },

    updateSessionUI() {
      document.body.classList.add("logged-in");
      if (HPS.UI && HPS.UI.updateAccountBar) HPS.UI.updateAccountBar();
      if (HPS.Shop && HPS.Shop.refreshIfOpen) HPS.Shop.refreshIfOpen();
      if (HPS.UI && HPS.UI.updateAccountScreen) HPS.UI.updateAccountScreen();
    },

    toast(text, kind) {
      if (HPS.UI) HPS.UI.toast(text, kind);
    }
  };

  HPS.Net = Net;
})();