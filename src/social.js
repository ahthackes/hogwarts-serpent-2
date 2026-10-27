/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — leaderboards, private chat rooms, notices
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const clock = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const MEDALS = ["🥇", "🥈", "🥉"];
  const MODE_LABEL = { easy: "Easy", difficult: "Difficult", hell: "Hell", duels: "Duels" };

  const Social = {
    lbMode: "hell",
    notices: [],
    _lastSeen: null,
    _pollTimer: null,
    _roomTimer: null,
    _listTimer: null,
    room: null,
    roomLast: 0,
    _loadingMsgs: false,

    init() {
      this.bind();
      this.startPolling();
    },

    bind() {
      document.addEventListener("click", (e) => {
        const lb = e.target.closest("[data-lb-mode]");
        if (lb) { this.lbMode = lb.dataset.lbMode; this.loadLeaderboard(); return; }
        const ch = e.target.closest("[data-lb-challenge]");
        if (ch) { if (HPS.Match) HPS.Match.challenge(ch.dataset.lbChallenge); return; }
        const room = e.target.closest("[data-room-open]");
        if (room) { this.openRoom(parseInt(room.dataset.roomOpen, 10)); return; }
        if (e.target.closest("[data-chat-back]")) { this.openChats(); return; }
        if (e.target.closest("[data-chat-leave]")) { this.leaveRoom(); return; }
        const notice = e.target.closest("[data-notice]");
        if (notice) { this.noticeClick(parseInt(notice.dataset.notice, 10)); return; }
        if (e.target.closest("[data-notices-read]")) { this.markAllRead(true); }
      });
      const roomForm = $("#room-form");
      if (roomForm) roomForm.addEventListener("submit", (e) => { e.preventDefault(); this.createRoom(); });
      const chatForm = $("#chat-form");
      if (chatForm) chatForm.addEventListener("submit", (e) => { e.preventDefault(); this.sendMessage(); });
      const addForm = $("#chat-add-form");
      if (addForm) addForm.addEventListener("submit", (e) => { e.preventDefault(); this.addMember(); });
    },

    /* ---------------------------- notifications ---------------------------- */
    startPolling() {
      if (this._pollTimer) return;
      this.poll();
      this._pollTimer = setInterval(() => { if (!document.hidden) this.poll(); }, 7000);
    },

    async poll() {
      if (!HPS.Net || !HPS.Net.user) return;
      try {
        const data = await HPS.Net.request("/api/notifications", { noAuthRedirect: true });
        this.onPoll(data);
      } catch (e) { /* offline: try again next tick */ }
    },

    onPoll(data) {
      this.notices = data.items || [];
      const topId = this.notices.reduce((m, n) => Math.max(m, n.id), 0);
      if (this._lastSeen !== null) {
        let inventory = false;
        this.notices.filter((n) => !n.read && n.id > this._lastSeen).forEach((n) => {
          if (HPS.UI) HPS.UI.toast(n.text, n.kind === "forgot" ? "bad" : "magic");
          if (n.kind === "skin" || n.kind === "rank") inventory = true;
        });
        if (inventory && HPS.Net.syncInventory) HPS.Net.syncInventory();
      }
      this._lastSeen = Math.max(this._lastSeen || 0, topId);
      this.setBadge("#badge-notices", data.unread);
      this.setBadge("#badge-chats", data.chat_unread);
      this.setBadge("#badge-admin", data.pending_requests);
      if (HPS.Match) HPS.Match.onSummary(data.match);
      if (HPS.UI && HPS.UI.currentScreen === "notices") this.renderNotices();
    },

    setBadge(sel, n) {
      const el = $(sel);
      if (!el) return;
      el.hidden = !n;
      el.textContent = n > 99 ? "99+" : String(n || 0);
    },

    async openNotices() {
      if (HPS.UI) { HPS.UI.returnTo = "title"; HPS.UI.showScreen("notices"); }
      await this.poll();
      this.renderNotices();
      this.markAllRead(false);
    },

    renderNotices() {
      const host = $("#notices-list");
      if (!host) return;
      if (!this.notices.length) { host.innerHTML = '<p class="admin-empty">Nothing yet. Alerts about rooms, duels and rewards show up here.</p>'; return; }
      const icons = { chat: "💬", challenge: "⚔", match_done: "🏁", skin: "✦", rank: "👑", forgot: "🔑" };
      host.innerHTML = this.notices.map((n) =>
        '<button class="notice ' + (n.read ? "" : "unread") + '" data-notice="' + n.id + '">' +
        '<span class="notice-icon">' + (icons[n.kind] || "•") + "</span>" +
        '<span class="notice-text">' + esc(n.text) + "<small>" + esc(new Date(n.created_at * 1000).toLocaleString()) + "</small></span></button>"
      ).join("");
    },

    async markAllRead(rerender) {
      try {
        await HPS.Net.request("/api/notifications/read", { method: "POST", body: { all: true }, noAuthRedirect: true });
        this.setBadge("#badge-notices", 0);
        this.notices.forEach((n) => { n.read = true; });
        if (rerender) this.renderNotices();
      } catch (e) { /* ignore */ }
    },

    noticeClick(id) {
      const n = this.notices.find((x) => x.id === id);
      if (!n) return;
      const d = n.data || {};
      if (n.kind === "chat" && d.room_id) this.openRoom(d.room_id);
      else if ((n.kind === "challenge" || n.kind === "match_done") && HPS.Match) HPS.Match.open();
      else if (n.kind === "forgot" && HPS.Admin) HPS.Admin.open("requests");
      else if ((n.kind === "skin" || n.kind === "rank") && HPS.Shop) HPS.Shop.open();
    },

    /* ---------------------------- leaderboard ---------------------------- */
    async openLeaderboard() {
      if (HPS.UI) { HPS.UI.returnTo = "title"; HPS.UI.showScreen("leaderboard"); }
      this.lbMode = ["easy", "difficult", "hell", "duels"].includes(this.lbMode) ? this.lbMode : "hell";
      await this.loadLeaderboard();
    },

    async loadLeaderboard() {
      const host = $("#lb-list");
      document.querySelectorAll("[data-lb-mode]").forEach((b) => b.classList.toggle("active", b.dataset.lbMode === this.lbMode));
      if (!host) return;
      host.innerHTML = '<p class="admin-empty">Loading the standings…</p>';
      const mode = this.lbMode;
      try {
        const data = await HPS.Net.request("/api/leaderboard?mode=" + encodeURIComponent(mode));
        if (mode !== this.lbMode) return;
        this.renderLeaderboard(data);
      } catch (err) {
        host.innerHTML = '<p class="admin-empty">' + esc(err.message || "Could not load the leaderboard.") + "</p>";
      }
    },

    renderLeaderboard(data) {
      const host = $("#lb-list");
      const me = $("#lb-me");
      const mode = data.mode;
      const note = $("#lb-note");
      if (note) {
        note.textContent = mode === "hell"
          ? "👑 The top 3 on the Hell board wear the champion skins. Climb to win them — drop out and they leave you."
          : mode === "duels" ? "Win challenge matches to climb the duel ladder."
          : "Best Endless Night score in " + MODE_LABEL[mode] + " mode. Each mode has its own board.";
      }
      if (!data.rows.length) {
        host.innerHTML = '<p class="admin-empty">No scores yet. Play ' + (mode === "duels" ? "a challenge match" : "an Endless run in " + MODE_LABEL[mode] + " mode") + " to take the first place.</p>";
      } else {
        host.innerHTML = data.rows.map((r) => {
          const medal = r.rank <= 3 ? MEDALS[r.rank - 1] : "#" + r.rank;
          const meta = mode === "duels"
            ? "<b>" + r.wins + "W</b> · " + r.losses + "L · " + r.draws + "D"
            : "<b>" + Number(r.score).toLocaleString() + "</b><small>wave " + Number(r.wave) + "</small>";
          const sub = mode === "duels" ? "" :
            "<small>" + esc(r.skin || "") + (r.effect && HPS.Skins.effects[r.effect] ? " · ✦ " + esc(HPS.Skins.effects[r.effect].label) : "") + "</small>";
          const challenge = r.is_me ? "" : '<button class="btn small ghost" data-lb-challenge="' + esc(r.username) + '" title="Challenge to a duel">⚔</button>';
          return '<div class="lb-row ' + (r.is_me ? "me " : "") + (r.rank <= 3 ? "top " : "") + '">' +
            '<span class="lb-rank">' + medal + "</span>" +
            '<span class="lb-name">' + esc(r.username) + (r.is_me ? " <em>you</em>" : "") + sub + "</span>" +
            '<span class="lb-score">' + meta + "</span>" + challenge + "</div>";
        }).join("");
      }
      if (me) {
        const m = data.me;
        me.textContent = m && m.rank
          ? "Your place: #" + m.rank + (mode === "duels" ? " · " + m.wins + " wins" : " · best " + Number(m.score).toLocaleString())
          : (HPS.Net.user && HPS.Net.user.is_admin ? "Admin scores are not ranked." : "You are not ranked here yet.");
      }
    },

    /* ---------------------------- chat rooms ---------------------------- */
    async openChats() {
      this.stopRoomTimer();
      this.room = null;
      if (HPS.UI) { HPS.UI.returnTo = "title"; HPS.UI.showScreen("chats"); }
      await this.loadRooms();
      clearInterval(this._listTimer);
      this._listTimer = setInterval(() => {
        if (!HPS.UI || HPS.UI.currentScreen !== "chats") { clearInterval(this._listTimer); return; }
        if (!document.hidden) this.loadRooms();
      }, 8000);
    },

    async loadRooms() {
      const host = $("#rooms-list");
      if (!host) return;
      try {
        const data = await HPS.Net.request("/api/chat/rooms");
        const coins = HPS.Save.data.coins || 0;
        const isAdmin = HPS.Net.user && HPS.Net.user.is_admin;
        const btn = $("#room-submit");
        if (btn) {
          btn.disabled = !isAdmin && coins < data.cost;
          btn.textContent = isAdmin ? "Create room (free for admin)" : "Create room · " + Number(data.cost).toLocaleString() + " coins";
        }
        if (!data.rooms.length) { host.innerHTML = '<p class="admin-empty">You are not in any room yet. Create one and add your friends.</p>'; return; }
        host.innerHTML = data.rooms.map((r) =>
          '<button class="room-card" data-room-open="' + r.id + '">' +
          '<span class="room-name">' + esc(r.name) + (r.unread ? '<em class="badge">' + r.unread + "</em>" : "") + "</span>" +
          '<span class="room-meta">' + esc(r.members.join(", ")) + "</span>" +
          '<span class="room-last">' + (r.last ? esc((r.last.user || "?") + ": " + r.last.body) : "No messages yet") + "</span></button>"
        ).join("");
      } catch (err) {
        host.innerHTML = '<p class="admin-empty">' + esc(err.message || "Could not load rooms.") + "</p>";
      }
    },

    async createRoom() {
      const name = (($("#room-name") || {}).value || "").trim();
      const members = (($("#room-members") || {}).value || "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      const err = $("#room-error");
      const btn = $("#room-submit");
      const setError = (m) => { if (err) err.textContent = m; };
      if (name.length < 3) return setError("Give the room a name (3+ characters).");
      setError("");
      if (btn) btn.disabled = true;
      try {
        const data = await HPS.Net.request("/api/chat/rooms", { method: "POST", body: { name, members } });
        HPS.Net.applyState({ user: data.user });
        if ($("#room-name")) $("#room-name").value = "";
        if ($("#room-members")) $("#room-members").value = "";
        if (HPS.UI) HPS.UI.toast("Room created. " + Number(data.room.members.length) + " wizard(s) inside.", "good");
        this.openRoom(data.room.id);
      } catch (ex) {
        setError(ex.message || "Could not create the room.");
      } finally {
        if (btn) btn.disabled = false;
      }
    },

    async openRoom(id) {
      this.stopRoomTimer();
      this.room = id;
      this.roomLast = 0;
      const box = $("#chat-messages");
      if (box) box.innerHTML = "";
      if (HPS.UI) { HPS.UI.returnTo = "title"; HPS.UI.showScreen("chat"); }
      await this.loadMessages();
      this._roomTimer = setInterval(() => {
        if (!HPS.UI || HPS.UI.currentScreen !== "chat") { this.stopRoomTimer(); return; }
        if (!document.hidden) this.loadMessages();
      }, 2500);
      const input = $("#chat-input");
      if (input) setTimeout(() => input.focus(), 80);
    },

    stopRoomTimer() {
      clearInterval(this._roomTimer);
      this._roomTimer = null;
    },

    async loadMessages() {
      if (!this.room || this._loadingMsgs) return;
      this._loadingMsgs = true;
      const rid = this.room;
      try {
        const data = await HPS.Net.request("/api/chat/rooms/" + rid + "/messages?after=" + this.roomLast);
        if (rid !== this.room) return;
        this.renderRoomHeader(data.room);
        this.appendMessages(data.messages || []);
      } catch (err) {
        if (err.status === 403 || err.status === 404) {
          this.stopRoomTimer();
          if (HPS.UI) HPS.UI.toast(err.message || "That room is not available.", "bad");
          this.openChats();
        }
      } finally {
        this._loadingMsgs = false;
      }
    },

    renderRoomHeader(room) {
      const title = $("#chat-title");
      if (title) title.textContent = room.name;
      const members = $("#chat-members");
      if (members) members.textContent = room.members.join(", ") + (room.owner ? "  ·  owner: " + room.owner : "");
      const add = $("#chat-add-form");
      if (add) add.hidden = !room.i_am_owner || !room.is_member;
      const send = $("#chat-form");
      if (send) send.hidden = !room.is_member;
      const leave = $("#chat-leave");
      if (leave) leave.hidden = !room.is_member;
      const spy = $("#chat-spy");
      if (spy) spy.hidden = !room.admin_view;
    },

    appendMessages(msgs) {
      const box = $("#chat-messages");
      if (!box || !msgs.length) return;
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || this.roomLast === 0;
      const me = HPS.Net.user ? HPS.Net.user.username.toLowerCase() : "";
      msgs.forEach((m) => {
        this.roomLast = Math.max(this.roomLast, m.id);
        const div = document.createElement("div");
        if (m.kind === "sys") {
          div.className = "chat-sys";
          div.textContent = m.body;
        } else {
          div.className = "chat-msg" + (m.user && m.user.toLowerCase() === me ? " mine" : "");
          div.innerHTML = "<b>" + esc(m.user || "?") + "</b><span>" + esc(m.body) + "</span><small>" + clock(m.at) + "</small>";
        }
        box.appendChild(div);
      });
      if (nearBottom) box.scrollTop = box.scrollHeight;
    },

    async sendMessage() {
      const input = $("#chat-input");
      const body = ((input || {}).value || "").trim();
      if (!body || !this.room) return;
      input.value = "";
      try {
        await HPS.Net.request("/api/chat/rooms/" + this.room + "/messages", { method: "POST", body: { body } });
        await this.loadMessages();
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Message not sent.", "bad");
        input.value = body;
      }
    },

    async addMember() {
      const input = $("#chat-add-name");
      const name = ((input || {}).value || "").trim();
      if (!name || !this.room) return;
      try {
        await HPS.Net.request("/api/chat/rooms/" + this.room + "/members", { method: "POST", body: { username: name } });
        input.value = "";
        this.roomLast = Math.max(0, this.roomLast);
        await this.loadMessages();
        if (HPS.UI) HPS.UI.toast(name + " was added.", "good");
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Could not add that player.", "bad");
      }
    },

    async leaveRoom() {
      if (!this.room) return;
      if (!window.confirm("Leave this room? You will not be able to read it again unless the owner adds you back.")) return;
      try {
        await HPS.Net.request("/api/chat/rooms/" + this.room + "/leave", { method: "POST", body: {} });
        this.stopRoomTimer();
        this.room = null;
        if (HPS.UI) HPS.UI.toast("You left the room.", "good");
        this.openChats();
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Could not leave.", "bad");
      }
    }
  };

  HPS.Social = Social;
})();
