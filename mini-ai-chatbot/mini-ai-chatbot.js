import { MINI_AI_CHATBOT_CONFIG } from "./config.js";
import { createMiniAiBot } from "./bot-art.js";
import { PixelRebuild } from "./pixel-rebuild.js";
import { MiniAiChatPanel } from "./chat-panel.js";

const MODULE_URL = new URL(import.meta.url);
const CSS_URL = new URL("./mini-ai-chatbot.css", MODULE_URL);

boot();

function boot() {
  injectCss();

  const panel = new MiniAiChatPanel(MINI_AI_CHATBOT_CONFIG);

  const floating = createMiniAiBot({
    label: "Open Mini AI Encyclopedia chatbot",
    helperText: MINI_AI_CHATBOT_CONFIG.helperBubbleText
  });

  document.body.appendChild(floating.root);
  floating.root.addEventListener("click", () => panel.toggle());

  const dockCompanion = createDockCompanion(panel);

  monitorProviderDock({
    floatingRoot: floating.root,
    dockCompanion
  });
}

function injectCss() {
  const id = "mai-chatbot-styles";
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = CSS_URL.href;
  document.head.appendChild(link);
}

function createDockCompanion(panel) {
  const companion = document.createElement("div");
  companion.className = "mai-dock-companion";
  companion.setAttribute("aria-hidden", "true");

  const pixelBot = createMiniAiBot({
    pixel: true,
    label: "Open Mini AI Encyclopedia chatbot",
    helperText: MINI_AI_CHATBOT_CONFIG.helperBubbleText
  });

  companion.appendChild(pixelBot.root);
  document.body.appendChild(companion);

  const rebuild = new PixelRebuild(pixelBot.grid, {
    buildDurationMs: MINI_AI_CHATBOT_CONFIG.pixelBuildDurationMs,
    disassembleDurationMs: MINI_AI_CHATBOT_CONFIG.pixelDisassembleDurationMs
  });

  pixelBot.root.addEventListener("click", () => panel.toggle());

  return {
    root: companion,
    button: pixelBot.root,
    rebuild,
    active: false
  };
}

function monitorProviderDock({ floatingRoot, dockCompanion }) {
  let dock = document.querySelector(MINI_AI_CHATBOT_CONFIG.dockSelector);
  let lastVisible = false;
  let mutationObserver = null;
  let resizeObserver = null;

  function attachDockObservers() {
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();

    if (!dock) return;

    mutationObserver = new MutationObserver(sync);
    mutationObserver.observe(dock, {
      attributes: true,
      attributeFilter: ["hidden", "style", "class", "aria-hidden"]
    });

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(dock);
    }
  }

  async function sync() {
    if (!dock || !document.contains(dock)) {
      dock = document.querySelector(MINI_AI_CHATBOT_CONFIG.dockSelector);
      attachDockObservers();
    }

    const visible = isDockVisible(dock);

    if (visible) {
      positionCompanionAboveDock(dockCompanion.root, dock);

      dockCompanion.root.classList.add("is-visible");
      dockCompanion.root.setAttribute("aria-hidden", "false");
      floatingRoot.classList.add("is-docked");

      if (!lastVisible) {
        dockCompanion.active = true;
        await dockCompanion.rebuild.build();
      }
    } else {
      floatingRoot.classList.remove("is-docked");

      if (lastVisible || dockCompanion.active) {
        dockCompanion.active = false;
        await dockCompanion.rebuild.disassemble();
      }

      dockCompanion.root.classList.remove("is-visible");
      dockCompanion.root.setAttribute("aria-hidden", "true");
    }

    lastVisible = visible;
  }

  attachDockObservers();

  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);

  const bodyObserver = new MutationObserver(() => {
    const current = document.querySelector(MINI_AI_CHATBOT_CONFIG.dockSelector);

    if (current !== dock) {
      dock = current;
      attachDockObservers();
      sync();
    }
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  sync();
}

function isDockVisible(dock) {
  if (!dock) return false;
  if (dock.hidden) return false;
  if (dock.getAttribute("aria-hidden") === "true") return false;

  const style = getComputedStyle(dock);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = dock.getBoundingClientRect();

  return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < window.innerHeight;
}

function positionCompanionAboveDock(companion, dock) {
  const rect = dock.getBoundingClientRect();
  const width = companion.offsetWidth || 116;
  const height = companion.offsetHeight || 96;
  const inset = 8;

  // User requested the dock companion to sit at the end-right and fit the screen.
  const preferredLeft = rect.right - width - 10;
  const left = clamp(preferredLeft, inset, window.innerWidth - width - inset);
  const top = Math.max(inset, rect.top - height - MINI_AI_CHATBOT_CONFIG.dockGapPx);

  companion.style.left = `${Math.round(left)}px`;
  companion.style.top = `${Math.round(top)}px`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
