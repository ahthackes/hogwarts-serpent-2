/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — administrator dashboard
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const Admin = {
    users: [],
    selected: null,
    detail: null,
    _bound: false,

    tab: "users",
    skinForm: null,

    init() {
      if (this._bound) return;
      this._bound = true;
      document.addEventListener("click", (e) => {
        const tabBtn = e.target.closest("[data-admin-tab]");
        if (tabBtn) { this.setTab(tabBtn.dataset.adminTab); return; }
        const editSkin = e.target.closest("[data-admin-editskin]");
        if (editSkin) { this.loadSkinForm(editSkin.dataset.adminEditskin); return; }
        if (e.target.closest("[data-admin-newskin]")) { this.loadSkinForm(null); return; }
        const reset = e.target.closest("[data-admin-reset]");
        if (reset) { this.resetPassword(reset.dataset.adminReset, reset); return; }
        const room = e.target.closest("[data-admin-room]");
        if (room) { if (HPS.Social) HPS.Social.openRoom(parseInt(room.dataset.adminRoom, 10)); return; }
        const userBtn = e.target.closest("[data-admin-user]");
        if (userBtn) {
          e.preventDefault();
          this.select(userBtn.dataset.adminUser);
          return;
        }
        const actionBtn = e.target.closest("[data-admin-action]");
        if (actionBtn) {
          e.preventDefault();
          this.runAction(actionBtn.dataset.adminAction, actionBtn);
        }
      });
    },

    open(tab) {
      if (!HPS.Net || !HPS.Net.user || !HPS.Net.user.is_admin) {
        if (HPS.UI) HPS.UI.toast("Administrator access required.", "bad");
        return;
      }
      if (HPS.UI) HPS.UI.showScreen("admin");
      this.setTab(tab || this.tab || "users");
    },

    setTab(tab) {
      this.tab = tab;
      document.querySelectorAll("[data-admin-tab]").forEach((b) => b.classList.toggle("active", b.dataset.adminTab === tab));
      document.querySelectorAll(".admin-pane").forEach((p) => { p.hidden = p.id !== "admin-pane-" + tab; });
      if (tab === "users") this.refresh();
      else if (tab === "skins") this.renderSkins();
      else if (tab === "requests") this.loadRequests();
      else if (tab === "chats") this.loadRooms();
    },

    /* ---------------------------- skin editor ---------------------------- */
    async renderSkins() {
      if (HPS.Skins.load) await HPS.Skins.load();
      const list = $("#admin-skin-list");
      if (!list) return;
      list.innerHTML = HPS.Skins.all().map((s) =>
        '<button class="admin-user" data-admin-editskin="' + esc(s.id) + '"><span class="admin-user-main"><b>' + esc(s.name) + "</b>" +
        (s.active === false ? "<em>HIDDEN</em>" : "") + '</span><span class="admin-user-meta">' + esc(s.kind || "snake") + " · " + esc(s.source || "shop") +
        (s.effect ? " · ✦ " + esc(s.effect) : "") + " · ◎ " + Number(s.price || 0).toLocaleString() + "</span></button>"
      ).join("");
      if (!this.skinForm) this.loadSkinForm(null);
    },

    loadSkinForm(id) {
      const s = id ? HPS.Skins.get(id) : null;
      const snake = (s && s.snake) || { base: "#3c7a48", light: "#8cc984", dark: "#18351f", eye: "#ffcf4a" };
      const robe = (s && s.robe) || { main: "#8f1f2e", deep: "#4b0c18", accent: "#e7c574", letter: "G" };
      const board = (s && s.board) || { floorA: "#2a2236", floorB: "#151020", wall: "#4a392a", wallTop: "#7c6144", wallDark: "#241a11", accent: "#ffd07a", wallStyle: "stone" };
      this.skinForm = { id: s ? s.id : "", kind: s ? s.kind || "snake" : "snake" };
      const opt = (list, cur) => list.map((v) => '<option value="' + v + '"' + (v === cur ? " selected" : "") + ">" + v + "</option>").join("");
      const color = (name, label, val) => '<label class="color-field"><span>' + label + '</span><input type="color" data-sf="' + name + '" value="' + esc(val) + '"></label>';
      const host = $("#admin-skin-form");
      if (!host) return;
      host.innerHTML =
        '<h3>' + (s ? "Edit " + esc(s.name) : "New skin") + "</h3>" +
        '<div class="sf-grid">' +
          '<label>Name<input data-sf="name" maxlength="60" value="' + esc(s ? s.name : "") + '"></label>' +
          '<label>Kind<select data-sf="kind"' + (s ? " disabled" : "") + ">" + opt(["snake", "board"], this.skinForm.kind) + "</select></label>" +
          '<label>Rarity<select data-sf="rarity">' + opt(["common", "rare", "epic", "legendary", "mythic"], s ? s.rarity : "common") + "</select></label>" +
          '<label>Price (coins)<input data-sf="price" type="number" min="0" value="' + Number(s ? s.price : 1000) + '"></label>' +
          '<label>Who can get it<select data-sf="source">' + opt(["shop", "grant", "rank"], s ? s.source : "shop") + "</select></label>" +
          '<label>Special effect<select data-sf="effect">' + opt(["", "invincible", "attacker", "luck"], s ? s.effect || "" : "") + "</select></label>" +
        "</div>" +
        '<label class="sf-wide">Description<input data-sf="desc" maxlength="240" value="' + esc(s ? s.desc : "") + '"></label>' +
        '<div class="sf-colors" data-sf-snake>' +
          color("base", "Scales", snake.base) + color("light", "Highlight", snake.light) + color("dark", "Shadow", snake.dark) + color("eye", "Eyes", snake.eye) +
          color("main", "Robe", robe.main) + color("deep", "Robe shade", robe.deep) + color("accent", "Trim", robe.accent) +
          '<label class="color-field"><span>Letter</span><input data-sf="letter" maxlength="1" value="' + esc(robe.letter || "G") + '" class="mini"></label>' +
          '<label class="color-field"><span>Hat</span><select data-sf="hat">' + opt(["wizard", "crown", "horns", "hood", "tophat", "none"], (s && s.hat) || "wizard") + "</select></label>" +
          '<label class="color-field"><span>Eyes</span><select data-sf="eyes">' + opt(["round", "slit", "glow"], (s && s.eyes) || "round") + "</select></label>" +
        "</div>" +
        '<div class="sf-colors" data-sf-board hidden>' +
          color("floorA", "Floor", board.floorA) + color("floorB", "Floor shade", board.floorB) + color("wall", "Wall", board.wall) +
          color("wallTop", "Wall top", board.wallTop) + color("wallDark", "Wall shade", board.wallDark) + color("accent", "Accent", board.accent) +
          '<label class="color-field"><span>Wall style</span><select data-sf="wallStyle">' + opt(["stone", "wood", "metal", "hedge", "marble"], board.wallStyle || "stone") + "</select></label>" +
        "</div>" +
        '<label class="sf-check"><input type="checkbox" data-sf="active"' + (!s || s.active !== false ? " checked" : "") + "> Sold in the shop / visible</label>" +
        '<div class="sf-preview" id="sf-preview"></div>' +
        '<p class="form-error" id="sf-error"></p>' +
        '<div class="menu row"><button class="btn primary" id="sf-save">' + (s ? "Save changes" : "Create skin") + '</button>' +
        '<button class="btn ghost" data-admin-newskin>New skin</button></div>';
      const sync = () => { this.syncSkinForm(); };
      host.querySelectorAll("[data-sf]").forEach((el) => el.addEventListener("input", sync));
      host.querySelectorAll("[data-sf]").forEach((el) => el.addEventListener("change", sync));
      $("#sf-save").addEventListener("click", () => this.saveSkin());
      this.syncSkinForm();
    },

    readSkinForm() {
      const host = $("#admin-skin-form");
      const v = (n) => { const el = host.querySelector('[data-sf="' + n + '"]'); return el ? el.value : ""; };
      const kind = v("kind") || this.skinForm.kind;
      const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
      const body = {
        id: this.skinForm.id || undefined, name: v("name").trim(), kind, rarity: v("rarity"), price: Number(v("price") || 0),
        source: v("source"), effect: kind === "board" ? "" : v("effect"), desc: v("desc"),
        active: host.querySelector('[data-sf="active"]').checked
      };
      if (kind === "snake") {
        body.snake = { base: v("base"), light: v("light"), dark: v("dark"), eye: v("eye") };
        body.robe = { main: v("main"), deep: v("deep"), accent: v("accent"), letter: v("letter") || "G" };
        body.hat = v("hat"); body.eyes = v("eyes"); body.glow = rgba(v("base"), 0.3);
      } else {
        body.board = { floorA: v("floorA"), floorB: v("floorB"), wall: v("wall"), wallTop: v("wallTop"), wallDark: v("wallDark"), accent: v("accent"), wallStyle: v("wallStyle") };
      }
      return body;
    },

    syncSkinForm() {
      const host = $("#admin-skin-form");
      if (!host) return;
      const b = this.readSkinForm();
      host.querySelector("[data-sf-snake]").hidden = b.kind !== "snake";
      host.querySelector("[data-sf-board]").hidden = b.kind !== "board";
      const eff = host.querySelector('[data-sf="effect"]');
      if (eff) eff.disabled = b.kind === "board";
      const prev = $("#sf-preview");
      if (!prev) return;
      const fake = Object.assign({ rarity: b.rarity, name: b.name || "Preview" }, b);
      prev.innerHTML = b.kind === "board"
        ? '<div class="skin-preview board-preview" style="' + HPS.Skins.boardPreview(fake) + '"><i></i></div>'
        : '<div class="skin-preview" style="' + HPS.Skins.previewVars(fake) + '"><div class="skin-robe-shape"></div><div class="skin-snake-shape"><i></i></div></div>';
    },

    async saveSkin() {
      const err = $("#sf-error");
      const btn = $("#sf-save");
      if (err) err.textContent = "";
      const body = this.readSkinForm();
      if (body.name.length < 3) { if (err) err.textContent = "Give the skin a name (3+ characters)."; return; }
      btn.disabled = true;
      try {
        const data = await HPS.Net.request("/api/admin/skins", { method: "POST", body });
        if (HPS.UI) HPS.UI.toast((data.created ? "Created " : "Saved ") + data.skin.name, "good");
        await HPS.Skins.load();
        this.skinForm = null;
        await this.renderSkins();
        this.loadSkinForm(data.skin.id);
        HPS.Net.syncInventory();
      } catch (ex) {
        if (err) err.textContent = ex.message || "Could not save the skin.";
      } finally {
        btn.disabled = false;
      }
    },

    /* ---------------------------- password requests ---------------------------- */
    async loadRequests() {
      const host = $("#admin-requests");
      if (!host) return;
      host.innerHTML = '<p class="admin-empty">Loading…</p>';
      try {
        const data = await HPS.Net.request("/api/admin/requests");
        if (!data.requests.length) { host.innerHTML = '<p class="admin-empty">No password requests.</p>'; return; }
        host.innerHTML = data.requests.map((r) =>
          '<div class="req-row ' + r.status + '"><div><b>' + esc(r.username) + "</b><small>" + esc(new Date(r.created_at * 1000).toLocaleString()) +
          (r.status === "done" ? " · reset done" : " · waiting") + "</small></div>" +
          '<input type="text" maxlength="128" placeholder="new password (blank = generate)" id="req-pw-' + r.id + '">' +
          '<button class="btn small ' + (r.status === "open" ? "primary" : "ghost") + '" data-admin-reset="' + esc(r.username) + '" data-req="' + r.id + '">Set password</button></div>'
        ).join("");
      } catch (err) {
        host.innerHTML = '<p class="admin-empty">' + esc(err.message || "Could not load requests.") + "</p>";
      }
    },

    async resetPassword(username, btn) {
      const input = $("#req-pw-" + btn.dataset.req);
      const typed = input ? input.value.trim() : "";
      if (!window.confirm("Reset the password for " + username + "? They will be signed out and must pick a new password.")) return;
      btn.disabled = true;
      try {
        const data = await HPS.Net.request("/api/admin/reset-password", { method: "POST", body: { username, new_password: typed } });
        const box = $("#admin-temp");
        if (box) {
          box.hidden = false;
          box.innerHTML = "Temporary password for <b>" + esc(data.username) + "</b>: <code>" + esc(data.password) + "</code> — tell them privately. It is shown only once; they must change it at next sign-in.";
        }
        if (HPS.UI) HPS.UI.toast("Password reset for " + data.username, "good");
        this.loadRequests();
        if (HPS.Social) HPS.Social.poll();
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Reset failed.", "bad");
        btn.disabled = false;
      }
    },

    /* ---------------------------- chat monitor ---------------------------- */
    async loadRooms() {
      const host = $("#admin-rooms");
      if (!host) return;
      host.innerHTML = '<p class="admin-empty">Loading…</p>';
      try {
        const data = await HPS.Net.request("/api/admin/chat/rooms");
        if (!data.rooms.length) { host.innerHTML = '<p class="admin-empty">No private rooms have been created yet.</p>'; return; }
        host.innerHTML = data.rooms.map((r) =>
          '<button class="room-card" data-admin-room="' + r.id + '"><span class="room-name">' + esc(r.name) + (r.closed ? ' <em class="badge off">closed</em>' : "") + "</span>" +
          '<span class="room-meta">owner ' + esc(r.owner) + " · in room: " + esc(r.members.join(", ") || "nobody") + (r.former.length ? " · left: " + esc(r.former.join(", ")) : "") + "</span>" +
          '<span class="room-last">' + r.messages + " messages" + (r.last ? " · last " + esc(new Date(r.last * 1000).toLocaleString()) : "") + "</span></button>"
        ).join("");
      } catch (err) {
        host.innerHTML = '<p class="admin-empty">' + esc(err.message || "Could not load rooms.") + "</p>";
      }
    },


    async refresh() {
      try {
        const data = await HPS.Net.request("/api/admin/users", { noAuthRedirect: false });
        this.users = data.users || [];
        this.renderList();
        if (!this.selected && this.users.length) {
          await this.select(this.users[0].username);
        } else if (this.selected) {
          const exists = this.users.some((u) => u.username.toLowerCase() === this.selected.toLowerCase());
          if (!exists) { this.selected = null; this.detail = null; this.renderDetail(); }
          else await this.select(this.selected, true);
        }
      } catch (err) {
        this.renderError(err.message || "Could not load users.");
      }
    },

    renderList() {
      const host = $("#admin-users");
      if (!host) return;
      if (!this.users.length) {
        host.innerHTML = '<p class="admin-empty">No accounts yet.</p>';
        return;
      }
      host.innerHTML = this.users.map((u) => {
        const active = this.selected && this.selected.toLowerCase() === u.username.toLowerCase();
        return '<button class="admin-user ' + (active ? "active " : "") + '" data-admin-user="' + esc(u.username) + '">' +
          '<span class="admin-user-main"><b>' + esc(u.username) + '</b>' +
          (u.is_admin ? '<em>ADMIN</em>' : "") + "</span>" +
          '<span class="admin-user-meta">◎ ' + Number(u.coins || 0).toLocaleString() +
          " · ★ " + Number(u.stars || 0) + " · " + Number(u.levels_completed || 0) + "/24 levels</span>" +
          "</button>";
      }).join("");
    },

    async select(username, quiet) {
      if (!username) return;
      this.selected = username;
      this.renderList();
      try {
        const data = await HPS.Net.request("/api/admin/users/" + encodeURIComponent(username));
        this.detail = data;
        this.renderDetail();
        if (!quiet) HPS.Audio.play("click");
      } catch (err) {
        this.detail = null;
        this.renderError(err.message || "Could not load that user.");
      }
    },

    renderDetail() {
      const host = $("#admin-detail");
      if (!host) return;
      const d = this.detail;
      if (!d) {
        host.innerHTML = '<p class="admin-empty">Select a user to inspect their save.</p>';
        return;
      }
      const u = d.user;
      const s = d.stats || {};
      const save = d.save || {};
      const progress = save.progress || {};
      const stars = [];
      for (let i = 1; i <= 24; i++) {
        const n = Number(progress[String(i)] || 0);
        stars.push('<span class="admin-level ' + (n ? "done " : "") + '" title="Level ' + i + ': ' + n + '/3">' +
          String(i).padStart(2, "0") + (n ? "★".repeat(n) : "") + "</span>");
      }
      const skinOptions = HPS.Skins.all().map((skin) =>
        '<option value="' + esc(skin.id) + '">' + esc(skin.name) + "</option>"
      ).join("");
      const levelOptions = Array.from({ length: 24 }, (_, i) =>
        '<option value="' + (i + 1) + '">Level ' + (i + 1) + "</option>"
      ).join("");
      const owned = new Set(save.skins || []);
      const skinList = HPS.Skins.all().filter((sk) => owned.has(sk.id)).length;
      const log = (d.log || []).map((row) =>
        '<li><span>' + esc(row.reason) + '</span><b class="' + (row.delta < 0 ? "negative" : "positive") + '">' +
        (row.delta > 0 ? "+" : "") + Number(row.delta).toLocaleString() + "</b></li>"
      ).join("") || '<li class="admin-empty">No coin activity yet.</li>';

      host.innerHTML =
        '<div class="admin-detail-head">' +
          '<div><h3>' + esc(u.username) + (u.is_admin ? ' <em class="admin-badge">ADMIN</em>' : "") + "</h3>" +
          '<p>Account #' + Number(u.id) + ' · ' + Number(s.stars || 0) + ' stars · ' +
          Number(s.levels_completed || 0) + '/24 levels · ' + skinList + '/' + HPS.Skins.all().length + ' skins</p></div>' +
          '<div class="admin-coin-total">◎ ' + Number(u.coins || 0).toLocaleString() + "</div>" +
        "</div>" +
        '<div class="admin-levels">' + stars.join("") + "</div>" +
        '<div class="admin-action-grid">' +
          '<label>Grant coins<input id="admin-grant-amount" type="number" min="1" max="10000000" value="1000"><button class="btn small" data-admin-action="grant">Grant</button></label>' +
          '<label>Set balance<input id="admin-set-coins" type="number" min="0" max="1000000000" value="' + Number(u.coins || 0) + '"><button class="btn small" data-admin-action="set-coins">Set</button></label>' +
          '<label>Levels<button class="btn small" data-admin-action="unlock-levels">Unlock all</button></label>' +
          '<label>Skins<button class="btn small" data-admin-action="unlock-skins">Unlock all</button></label>' +
        '</div>' +
        '<div class="admin-edit-grid">' +
          '<label>Set level<select id="admin-level">' + levelOptions + '</select>' +
            '<select id="admin-stars"><option value="0">0 stars</option><option value="1">1 star</option><option value="2">2 stars</option><option value="3">3 stars</option></select>' +
            '<button class="btn small" data-admin-action="set-level">Apply</button></label>' +
          '<label>Skin ownership<select id="admin-skin">' + skinOptions + '</select>' +
            '<select id="admin-owned"><option value="true">Unlocked</option><option value="false">Locked</option></select>' +
            '<button class="btn small" data-admin-action="set-skin">Apply</button></label>' +
        '</div>' +
        '<div class="admin-log"><h4>Recent coin activity</h4><ul>' + log + "</ul></div>";
    },

    async runAction(action, btn) {
      if (!this.selected) return;
      const username = this.selected;
      const payload = { action: action, username };
      if (action === "grant") payload.amount = this.number("#admin-grant-amount");
      else if (action === "set-coins") payload.amount = this.number("#admin-set-coins");
      else if (action === "set-level") {
        payload.level_id = this.number("#admin-level");
        payload.stars = this.number("#admin-stars");
      } else if (action === "set-skin") {
        payload.skin_id = ($("#admin-skin") || {}).value;
        payload.owned = ($("#admin-owned") || {}).value === "true";
      }
      if (!(payload.amount >= 0) && (action === "grant" || action === "set-coins")) {
        if (HPS.UI) HPS.UI.toast("Enter a valid coin amount.", "bad");
        return;
      }
      if (btn) btn.disabled = true;
      try {
        const data = await HPS.Net.request("/api/admin/action", { method: "POST", body: payload });
        if (HPS.UI) HPS.UI.toast("Action applied to " + username, "good");
        if (HPS.Net.user && data.user && data.user.username.toLowerCase() === HPS.Net.user.username.toLowerCase()) {
          HPS.Net.user = Object.assign({}, HPS.Net.user, data.user);
          HPS.Save.applyServer(data.save, HPS.Net.user);
          HPS.Net.updateSessionUI();
        }
        await this.refresh();
        await this.select(username, true);
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Admin action failed.", "bad");
      } finally {
        if (btn) btn.disabled = false;
      }
    },

    number(sel) {
      const el = $(sel);
      return el ? Number(el.value || 0) : 0;
    },

    renderError(message) {
      const host = $("#admin-detail");
      if (host) host.innerHTML = '<p class="admin-empty">' + esc(message) + "</p>";
    }
  };

  HPS.Admin = Admin;
})();
