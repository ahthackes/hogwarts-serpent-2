/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — input
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const Input = {
    onDir: null,
    onPause: null,
    onRestart: null,
    onConfirm: null,
    onAttack: null,
    init(canvas) {
      const keyMap = {
        ArrowUp: "up", KeyW: "up",
        ArrowDown: "down", KeyS: "down",
        ArrowLeft: "left", KeyA: "left",
        ArrowRight: "right", KeyD: "right"
      };

      window.addEventListener("keydown", (e) => {
        // Never steal keys from login, account, shop, or admin form fields.
        const target = e.target;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
          return;
        }
        if (e.repeat) {
          if (keyMap[e.code]) e.preventDefault();
          return;
        }
        if (keyMap[e.code]) {
          e.preventDefault();
          if (this.onDir) this.onDir(DIRS[keyMap[e.code]]);
          return;
        }
        if (e.code === "KeyP" || e.code === "Escape") {
          e.preventDefault();
          if (this.onPause) this.onPause();
        } else if (e.code === "KeyR") {
          if (this.onRestart) this.onRestart();
        } else if (e.code === "Enter" || e.code === "Space") {
          if (e.code === "Space" && this.onAttack && this.onAttack(e)) { e.preventDefault(); return; }
          if (this.onConfirm) this.onConfirm(e);
        }
      }, { passive: false });

      // swipe on the board
      let sx = 0, sy = 0, tracking = false;
      canvas.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        tracking = true;
        sx = e.clientX; sy = e.clientY;
      });
      canvas.addEventListener("pointerup", (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (Math.max(ax, ay) < 20) return;
        if (this.onDir) {
          if (ax > ay) this.onDir(DIRS[dx > 0 ? "right" : "left"]);
          else this.onDir(DIRS[dy > 0 ? "down" : "up"]);
        }
      });
      canvas.addEventListener("pointercancel", () => { tracking = false; });
    }
  };

  HPS.Input = Input;
})();
