/*
 * NewsAI XARC: non-interactive cinematic background layers.
 * Progressive enhancement: failure here cannot affect the existing app.
 */
(function () {
  "use strict";

  if (!document.body || document.querySelector(".xarcDepthScene")) return;

  const scene = document.createElement("div");
  scene.className = "xarcDepthScene";
  scene.setAttribute("aria-hidden", "true");

  for (const name of ["Far", "Grid", "Circuits", "Vignette"]) {
    const layer = document.createElement("span");
    layer.className = `xarcDepth${name}`;
    scene.appendChild(layer);
  }

  // Insert behind the site's content. Never intercept clicks or focus.
  document.body.insertBefore(scene, document.body.firstChild);

  const desktopPointer = window.matchMedia(
    "(min-width: 1024px) and (hover: hover) and (pointer: fine)"
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let frame = 0;
  let nextX = 0;
  let nextY = 0;

  function clearOffsets() {
    scene.style.removeProperty("--xarc-far-x");
    scene.style.removeProperty("--xarc-far-y");
    scene.style.removeProperty("--xarc-grid-x");
    scene.style.removeProperty("--xarc-grid-y");
    scene.style.removeProperty("--xarc-circuit-x");
    scene.style.removeProperty("--xarc-circuit-y");
  }

  function update() {
    frame = 0;
    if (!desktopPointer.matches || reducedMotion.matches) {
      clearOffsets();
      return;
    }

    // Max shift is only 3px / 9px / 5px at each layer.
    scene.style.setProperty("--xarc-far-x", `${(-nextX * 3).toFixed(2)}px`);
    scene.style.setProperty("--xarc-far-y", `${(-nextY * 3).toFixed(2)}px`);
    scene.style.setProperty("--xarc-grid-x", `${(-nextX * 9).toFixed(2)}px`);
    scene.style.setProperty("--xarc-grid-y", `${(-nextY * 9).toFixed(2)}px`);
    scene.style.setProperty("--xarc-circuit-x", `${(-nextX * 5).toFixed(2)}px`);
    scene.style.setProperty("--xarc-circuit-y", `${(-nextY * 5).toFixed(2)}px`);
  }

  window.addEventListener("pointermove", function (event) {
    if (!desktopPointer.matches || reducedMotion.matches) return;

    nextX = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth - 0.5) * 2));
    nextY = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight - 0.5) * 2));

    if (!frame) frame = window.requestAnimationFrame(update);
  }, { passive: true });

  function reset() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    nextX = 0;
    nextY = 0;
    clearOffsets();
  }

  window.addEventListener("blur", reset);
  desktopPointer.addEventListener("change", reset);
  reducedMotion.addEventListener("change", reset);
})();
