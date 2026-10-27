/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — save data
   Cloud saves are server-authoritative; this object is the live
   in-memory copy the game renders and edits.
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const KEY = "hogwarts-serpent.save.v1";

  const DEFAULTS = {
    house: "gryffindor",
    progress: {},          // levelId -> stars (1-3)
    best: {},              // levelId -> best score
    endlessBest: 0,
    settings: { sound: true, music: true, reducedMotion: false, grid: false, difficulty: "easy" },
    seenHowto: false,
    coins: 0,
    skins: ["classic"],
    equippedSkin: "classic",
    equippedBoard: ""
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function normalize(raw) {
    const parsed = raw && typeof raw === "object" ? raw : {};
    const data = Object.assign(clone(DEFAULTS), parsed);
    data.progress = Object.assign({}, parsed.progress || {});
    data.best = Object.assign({}, parsed.best || {});
    data.settings = Object.assign(clone(DEFAULTS.settings), parsed.settings || {});
    data.skins = Array.isArray(parsed.skins) ? parsed.skins.filter((s) => typeof s === "string") : ["classic"];
    if (!data.skins.includes("classic")) data.skins.unshift("classic");
    if (!data.skins.includes(data.equippedSkin)) data.equippedSkin = "classic";
    data.coins = Math.max(0, Number(data.coins) || 0);
    data.endlessBest = Math.max(0, Number(data.endlessBest) || 0);
    return data;
  }

  function readLegacy() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return normalize(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  const Save = {
    data: clone(DEFAULTS),
    _legacy: readLegacy(),
    _serverUser: null,

    /* ---------------------------- persistence ---------------------------- */
    snapshot() {
      return clone(this.data);
    },

    write() {
      // Only the server owns account saves. Guest/local writes are kept
      // solely for backwards compatibility before the auth screen appears.
      if (HPS.Net && HPS.Net.user) {
        HPS.Net.queueSave();
        return;
      }
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
    },

    applyServer(save, user) {
      const incoming = normalize(save);
      this._serverUser = user || null;

      // One-time migration of progress from the old local-only version.
      const legacy = this._legacy;
      const incomingStars = Object.values(incoming.progress).reduce((a, b) => a + (Number(b) || 0), 0);
      const legacyStars = legacy ? Object.values(legacy.progress).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
      if (legacy && legacyStars > 0 && incomingStars === 0) {
        incoming.progress = Object.assign({}, legacy.progress, incoming.progress);
        incoming.best = Object.assign({}, legacy.best, incoming.best);
        incoming.endlessBest = Math.max(incoming.endlessBest, legacy.endlessBest || 0);
        if (legacy.seenHowto) incoming.seenHowto = true;
        incoming.house = legacy.house || incoming.house;
        this._legacy = null;
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        // Push the migrated progress to the cloud on the next tick.
        setTimeout(() => { if (HPS.Net) HPS.Net.queueSave(0); }, 0);
      }

      this.data = incoming;
      if (user) this.data.coins = Math.max(0, Number(user.coins) || 0);
      this._serverUser = user || null;
    },

    setCoins(n) {
      this.data.coins = Math.max(0, Number(n) || 0);
    },

    /* ---------------------------- progress ---------------------------- */
    stars(id) { return this.data.progress[id] || 0; },
    best(id) { return this.data.best[id] || 0; },

    isUnlocked(id) {
      if (id <= 1) return true;
      return this.stars(id - 1) >= 1 || (id === 1);
    },

    lastPlayable() {
      let last = 1;
      const totalLevels = (HPS.LEVELS && HPS.LEVELS.length) ? HPS.LEVELS.length : 24;
      for (let i = 1; i <= totalLevels; i++) if (this.isUnlocked(i)) last = i;
      return last;
    },

    record(id, stars, score) {
      const prev = this.stars(id);
      if (stars > prev) this.data.progress[id] = stars;
      if (score > this.best(id)) this.data.best[id] = score;
      this.write();
    },

    recordEndless(score) {
      if (score > this.data.endlessBest) {
        this.data.endlessBest = score;
        this.write();
      }
    },

    totalStars() {
      return Object.values(this.data.progress).reduce((a, b) => a + (Number(b) || 0), 0);
    },

    setHouse(h) { this.data.house = h; this.write(); },
    setSetting(k, v) { this.data.settings[k] = v; this.write(); },

    ownsSkin(id) {
      return this.data.skins.includes(id);
    },

    equipSkin(id) {
      if (!this.ownsSkin(id)) return false;
      this.data.equippedSkin = id;
      this.write();
      return true;
    },

    reset() {
      const keep = {
        settings: clone(this.data.settings),
        coins: this.data.coins,
        skins: clone(this.data.skins),
        equippedSkin: this.data.equippedSkin,
        house: this.data.house
      };
      this.data = clone(DEFAULTS);
      Object.assign(this.data, keep);
      this.write();
    }
  };

  HPS.Save = Save;
})();