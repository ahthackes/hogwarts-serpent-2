/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — shop (snake skins & boards)
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const Shop = {
    _bound: false,
    tab: "snake",

    init() {
      if (this._bound) return;
      this._bound = true;
      document.addEventListener("click", (e) => {
        const tab = e.target.closest("[data-shop-tab]");
        if (tab) { this.tab = tab.dataset.shopTab; this.render(); return; }
        const buy = e.target.closest("[data-buy-skin]");
        if (buy) { e.preventDefault(); this.buy(buy.dataset.buySkin, buy); return; }
        const equip = e.target.closest("[data-equip-skin]");
        if (equip) { e.preventDefault(); this.equip(equip.dataset.equipSkin, equip.dataset.kind); }
      });
    },

    async open() {
      if (HPS.UI) HPS.UI.returnTo = "title";
      this.render();
      if (HPS.UI) HPS.UI.showScreen("shop");
      HPS.Audio.play("click");
      // pick up skins the admin added or granted since the page loaded
      if (HPS.Net && HPS.Net.syncInventory) { await HPS.Net.syncInventory(); this.render(); }
    },

    refreshIfOpen() {
      if (HPS.UI && HPS.UI.currentScreen === "shop") this.render();
    },

    cardHtml(skin, owned, equipped, coins, isAdmin) {
      const has = owned.has(skin.id);
      const isEquipped = has && equipped === skin.id;
      const kind = skin.kind || "snake";
      let button;
      if (isEquipped) {
        button = '<span class="shop-equipped">Equipped</span>';
      } else if (has) {
        button = '<button class="btn small" data-equip-skin="' + esc(skin.id) + '" data-kind="' + kind + '">Equip</button>';
      } else if (skin.source === "grant") {
        button = '<span class="shop-locked">Admin grant only</span>';
      } else if (skin.source === "rank") {
        button = '<span class="shop-locked">Hell champion reward</span>';
      } else {
        const affordable = coins >= (skin.price || 0);
        button = '<button class="btn small primary" data-buy-skin="' + esc(skin.id) + '"' +
          (affordable ? "" : " disabled") + ">Buy · " + Number(skin.price || 0).toLocaleString() + "</button>";
      }
      const eff = skin.effect && HPS.Skins.effects[skin.effect];
      const badge = eff ? '<span class="skin-effect" title="' + esc(eff.hint) + '">✦ ' + esc(eff.label) + "</span>" : "";
      const preview = kind === "board"
        ? '<div class="skin-preview board-preview" style="' + HPS.Skins.boardPreview(skin) + '"><i></i></div>'
        : '<div class="skin-preview" style="' + HPS.Skins.previewVars(skin) + '">' +
          '<div class="skin-robe-shape"></div><div class="skin-snake-shape"><i></i></div></div>';
      return '<article class="skin-card ' + (isEquipped ? "is-equipped " : "") + (has ? "is-owned " : "") + (skin.effect ? "has-effect" : "") + '">' +
        preview +
        '<div class="skin-card-body">' +
          '<div class="skin-card-top"><h3>' + esc(skin.name) + '</h3>' +
            '<span class="skin-rarity ' + HPS.Skins.rarityClass(skin.rarity) + '">' + esc(skin.rarity) + "</span></div>" +
          badge +
          "<p>" + esc(skin.desc) + "</p>" +
          '<div class="skin-card-foot">' + button + "</div>" +
        "</div></article>";
    },

    render() {
      if (!HPS.Net || !HPS.Net.user) return;
      const coins = HPS.Save.data.coins || 0;
      const balance = $("#shop-coins");
      if (balance) balance.textContent = coins.toLocaleString();
      document.querySelectorAll("[data-shop-tab]").forEach((b) => b.classList.toggle("active", b.dataset.shopTab === this.tab));
      const grid = $("#shop-grid");
      if (!grid) return;
      const owned = new Set(HPS.Save.data.skins || []);
      const isAdmin = !!HPS.Net.user.is_admin;
      const list = HPS.Skins.all(this.tab).filter((s) => s.active !== false || owned.has(s.id) || isAdmin);
      let html = "";
      if (this.tab === "board") {
        const none = !HPS.Save.data.equippedBoard;
        html += '<article class="skin-card is-owned ' + (none ? "is-equipped" : "") + '">' +
          '<div class="skin-preview board-preview" style="background:linear-gradient(160deg,#2a2236,#151020)"><i></i></div>' +
          '<div class="skin-card-body"><div class="skin-card-top"><h3>Level themes</h3><span class="skin-rarity rarity-common">default</span></div>' +
          "<p>Every trial keeps its own castle look.</p>" +
          '<div class="skin-card-foot">' + (none ? '<span class="shop-equipped">Equipped</span>'
            : '<button class="btn small" data-equip-skin="" data-kind="board">Use level themes</button>') + "</div></div></article>";
      }
      html += list.map((s) => this.cardHtml(s, owned, this.tab === "board" ? HPS.Save.data.equippedBoard : HPS.Save.data.equippedSkin, coins, isAdmin)).join("");
      grid.innerHTML = html;
    },

    async buy(id, btn) {
      if (!HPS.Net || !HPS.Net.user) return;
      const skin = HPS.Skins.get(id);
      if (!skin) return;
      if (btn) { btn.disabled = true; btn.textContent = "Buying…"; }
      try {
        await HPS.Net.buySkin(id);
        HPS.Audio.play("power");
        if (HPS.UI) HPS.UI.toast("Unlocked " + skin.name, "good");
        this.render();
        if (HPS.UI) HPS.UI.updateAccountBar();
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Purchase failed.", "bad");
        this.render();
      }
    },

    async equip(id, kind) {
      if (!HPS.Net || !HPS.Net.user) return;
      const skin = id ? HPS.Skins.get(id) : null;
      try {
        await HPS.Net.equipSkin(id, kind);
        HPS.Audio.play("click");
        if (HPS.UI) HPS.UI.toast(skin ? "Now using " + skin.name : "Level themes restored", "good");
        this.render();
        if (HPS.Render && HPS.game && HPS.game.level) HPS.Render.buildBoard(HPS.game);
      } catch (err) {
        if (HPS.UI) HPS.UI.toast(err.message || "Could not equip.", "bad");
      }
    }
  };

  HPS.Shop = Shop;
})();
