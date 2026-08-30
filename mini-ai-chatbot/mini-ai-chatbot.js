import { MINI_AI_CHATBOT_CONFIG } from "./config.js";
import { createMiniAiBot } from "./bot-art.js";
import { TimedSpeechBubble } from "./speech-bubble.js";
import { DockReveal } from "./dock-reveal.js";
import { MiniAiChatPanel } from "./chat-panel.js";

const MODULE_URL = new URL(import.meta.url);
const CSS_URL = new URL("./mini-ai-chatbot.css", MODULE_URL);

boot();

function boot() {
  injectCss();

  const panel = new MiniAiChatPanel(MINI_AI_CHATBOT_CONFIG);

  const floating = createMiniAiBot({
    label: "Open Mini AI Encyclopedia chatbot"
  });

  document.body.appendChild(floating.root);

  const floatingBubble = makeSpeechBubbleController(floating);
  floatingBubble.start();

  floating.root.addEventListener("click", () => {
    floatingBubble.setAllowed(false);
    panel.toggle();
  });

  const dockCompanion = createDockCompanion(panel);

  monitorProviderDock({
    floating,
    floatingBubble,
    dockCompanion,
    panel
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

function makeSpeechBubbleController(bot) {
  return new TimedSpeechBubble({
    bubble: bot.bubble,
    textNode: bot.bubbleText,
    caretNode: bot.bubbleCaret,
    text: MINI_AI_CHATBOT_CONFIG.helperBubbleText,
    initialDelayMs: MINI_AI_CHATBOT_CONFIG.helperBubbleInitialDelayMs,
    repeatMs: MINI_AI_CHATBOT_CONFIG.helperBubbleRepeatMs,
    typeSpeedMs: MINI_AI_CHATBOT_CONFIG.helperBubbleTypeSpeedMs,
    holdMs: MINI_AI_CHATBOT_CONFIG.helperBubbleHoldMs,
    hideMs: MINI_AI_CHATBOT_CONFIG.helperBubbleHideMs
  });
}

function createDockCompanion(panel) {
  const companion = document.createElement("div");
  companion.className = "mai-dock-companion";
  companion.setAttribute("aria-hidden", "true");

  const dockBot = createMiniAiBot({
    dock: true,
    label: "Open Mini AI Encyclopedia chatbot"
  });

  companion.appendChild(dockBot.root);
  document.body.appendChild(companion);

  const reveal = new DockReveal(dockBot.root, {
    buildDurationMs: MINI_AI_CHATBOT_CONFIG.dockBuildDurationMs,
    disassembleDurationMs: MINI_AI_CHATBOT_CONFIG.dockDisassembleDurationMs
  });

  const bubble = makeSpeechBubbleController(dockBot);

  dockBot.root.addEventListener("click", () => {
    bubble.setAllowed(false);
    panel.toggle();
  });

  return {
    root: companion,
    button: dockBot.root,
    reveal,
    bubble,
    active: false
  };
}

function monitorProviderDock({
  floating,
  floatingBubble,
  dockCompanion,
  panel
}) {
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
      positionCompanionAtDockRight(dockCompanion.root, dock);

      dockCompanion.root.classList.add("is-visible");
      dockCompanion.root.setAttribute("aria-hidden", "false");

      floating.root.classList.add("is-docked");
      floatingBubble.setAllowed(false);

      if (!lastVisible) {
        dockCompanion.active = true;
        dockCompanion.bubble.setAllowed(true);
        dockCompanion.bubble.start();
        await dockCompanion.reveal.build();
      }
    } else {
      floating.root.classList.remove("is-docked");

      floatingBubble.setAllowed(true);

      if (!lastVisible) {
        // If we loaded at the top, leave its original timer alone.
      } else {
        floatingBubble.start();
      }

      if (lastVisible || dockCompanion.active) {
        dockCompanion.active = false;
        dockCompanion.bubble.setAllowed(false);
        dockCompanion.bubble.stop();
        await dockCompanion.reveal.disassemble();
      }

      dockCompanion.root.classList.remove("is-visible");
      dockCompanion.root.setAttribute("aria-hidden", "true");
    }

    if (!panel.root.classList.contains("is-open")) {
      if (visible) {
        dockCompanion.bubble.setAllowed(true);
      } else {
        floatingBubble.setAllowed(true);
      }
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

  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  const rect = dock.getBoundingClientRect();

  return (
    rect.width > 20 &&
    rect.height > 20 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight
  );
}

function positionCompanionAtDockRight(companion, dock) {
  const rect = dock.getBoundingClientRect();

  const width = companion.offsetWidth || 92;
  const height = companion.offsetHeight || 80;
  const edge = window.innerWidth <= 720 ? 6 : 10;

  // Right aligned with the visible provider dock, clamped inside viewport.
  const preferredLeft = rect.right - width - edge;

  const left = clamp(
    preferredLeft,
    edge,
    window.innerWidth - width - edge
  );

  const top = Math.max(
    edge,
    rect.top - height - MINI_AI_CHATBOT_CONFIG.dockGapPx
  );

  companion.style.left = `${Math.round(left)}px`;
  companion.style.top = `${Math.round(top)}px`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
