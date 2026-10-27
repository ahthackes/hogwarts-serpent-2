/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — skin catalog (served by the game server)
   Snake skins change the serpent; board skins recolour the playfield.
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const FALLBACK = [{
    id: "classic", name: "Hogwarts Classic", kind: "snake", rarity: "common", price: 0,
    desc: "The original serpent.", effect: "", source: "shop", active: true,
    snake: null, robe: null, hat: "wizard", eyes: "round", glasses: false,
    glow: "rgba(230,80,70,.2)", admin_only: false
  }];

  const EFFECT_INFO = {
    invincible: { label: "Invincible", hint: "Absorbs one fatal hit, recharges every 30s" },
    attacker: { label: "Attacker", hint: "Space: stun nearby guardians (10s cooldown)" },
    luck: { label: "Luck ×2", hint: "Doubles every Hell coin reward" }
  };

  const Skins = {
    catalog: [],
    loaded: false,
    effects: EFFECT_INFO,

    async load() {
      try {
        const res = await fetch("/api/skins", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const list = Array.isArray(data.skins) ? data.skins : [];
        if (!list.length) throw new Error("empty");
        this.catalog = list.filter((s) => s && typeof s.id === "string");
        this.loaded = true;
      } catch (e) {
        if (!this.catalog.length) this.catalog = FALLBACK.slice();
        this.loaded = false;
      }
      return this.catalog;
    },

    all(kind) {
      const list = this.catalog.length ? this.catalog : FALLBACK;
      return kind ? list.filter((s) => (s.kind || "snake") === kind) : list;
    },

    get(id) { return this.all().find((s) => s.id === id) || null; },
    classic() { return this.get("classic") || FALLBACK[0]; },

    effectOf(skin) { return skin && skin.effect ? skin.effect : ""; },

    /** Effect of the equipped snake skin ("" when none). */
    effect() {
      const id = HPS.Save && HPS.Save.data ? HPS.Save.data.equippedSkin : "classic";
      return this.effectOf(this.get(id));
    },

    /** Equipped board skin or null (use the level's own theme). */
    board() {
      const id = HPS.Save && HPS.Save.data ? HPS.Save.data.equippedBoard : "";
      const skin = id ? this.get(id) : null;
      return skin && skin.board ? skin : null;
    },

    look(house) {
      const id = HPS.Save && HPS.Save.data ? HPS.Save.data.equippedSkin : "classic";
      return this.lookFor(this.get(id) || this.classic(), house);
    },

    /** Look for any skin object (used for the opponent in duels). */
    lookFor(skin, house) {
      const base = house || {};
      if (!skin) return Object.assign({}, base, { hat: "wizard", eyes: "round", glasses: false });
      const classic = skin.id === "classic";
      return Object.assign({}, base, {
        main: classic || !skin.robe ? base.main : skin.robe.main,
        deep: classic || !skin.robe ? base.deep : skin.robe.deep,
        accent: classic || !skin.robe ? base.accent : skin.robe.accent,
        letter: classic || !skin.robe ? base.letter : skin.robe.letter,
        snake: classic || !skin.snake ? base.snake : skin.snake,
        glow: skin.glow || base.glow,
        hat: skin.hat || "wizard",
        eyes: skin.eyes || "round",
        glasses: !!skin.glasses,
        skinId: skin.id,
        skinName: skin.name
      });
    },

    previewVars(skin) {
      const snake = skin.snake || { base: "#3c7a48", light: "#8cc984", dark: "#18351f", eye: "#ffcf4a" };
      const robe = skin.robe || { main: "#8f1f2e", deep: "#4b0c18", accent: "#e7c574" };
      return [
        "--skin-base:" + snake.base,
        "--skin-light:" + snake.light,
        "--skin-dark:" + snake.dark,
        "--skin-eye:" + snake.eye,
        "--robe-main:" + robe.main,
        "--robe-deep:" + robe.deep,
        "--robe-accent:" + robe.accent
      ].join(";");
    },

    boardPreview(skin) {
      const b = skin && skin.board;
      if (!b) return "background:linear-gradient(160deg,#2a2236,#151020)";
      return "background:linear-gradient(160deg," + b.floorA + "," + b.floorB + ");" +
        "box-shadow:inset 0 0 0 6px " + b.wall + ",inset 0 0 0 8px " + b.wallTop + ",inset 0 0 26px " + b.accent + "33";
    },

    rarityClass(rarity) {
      return "rarity-" + String(rarity || "common").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    }
  };

  HPS.Skins = Skins;
})();
