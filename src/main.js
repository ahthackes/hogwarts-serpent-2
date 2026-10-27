/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — bootstrap & game loop
   ============================================================ */
(function () {
  const HPS = window.HPS;
  const canvas = document.getElementById("game");

  HPS.Render.init(canvas);
  HPS.Input.init(canvas);

  const game = new HPS.Game();
  HPS.game = game;

  async function boot() {
    // The catalog is shared with the server; fall back to the classic skin
    // if it cannot be fetched so the canvas still renders.
    // Show the auth screen until a valid HttpOnly session exists. After the
    // login/register form succeeds this resolves and the normal UI boots.
    await HPS.Net.boot();
    // The skin catalog is served by the server and needs a session.
    await HPS.Skins.load();
    HPS.UI.init(game);
    if (HPS.Social) HPS.Social.init();
    if (HPS.Match) HPS.Match.init();
    startLoop();
  }

  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  let running = false;

  function startLoop() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.09);
    last = now;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 5) {
      game.update(STEP);
      acc -= STEP;
      guard++;
    }
    if (acc > STEP * 3) acc = 0;

    const alpha = game.state === "playing" ? game.alpha : 1;
    HPS.Render.draw(game, alpha, game.time);

    if (game.level && (game.state === "playing" || game.state === "paused" ||
        game.state === "dying" || game.state === "won" || game.state === "over")) {
      HPS.UI.updateHUD(game);
    }

    requestAnimationFrame(frame);
  }

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => HPS.Render.resize(true), 60);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => HPS.Render.resize(false));
    ro.observe(canvas);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "playing") game.pause();
  });

  window.addEventListener("beforeunload", () => {
    if (HPS.Net && HPS.Net.user) HPS.Net.flushSave(true);
  });

  boot().catch((err) => {
    console.error(err);
    const host = document.querySelector("#auth-error");
    if (host) host.textContent = "Could not start the game. Check the server console.";
  });
})();
