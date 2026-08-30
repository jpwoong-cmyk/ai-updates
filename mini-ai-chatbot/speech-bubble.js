export class TimedSpeechBubble {
  constructor({
    bubble,
    textNode,
    caretNode,
    text,
    initialDelayMs = 2200,
    repeatMs = 60000,
    typeSpeedMs = 72,
    holdMs = 2200,
    hideMs = 260
  }) {
    this.bubble = bubble;
    this.textNode = textNode;
    this.caretNode = caretNode;
    this.text = text;

    this.initialDelayMs = initialDelayMs;
    this.repeatMs = repeatMs;
    this.typeSpeedMs = typeSpeedMs;
    this.holdMs = holdMs;
    this.hideMs = hideMs;

    this.timer = null;
    this.running = false;
    this.visibleAllowed = true;
    this.destroyed = false;
  }

  start() {
    this.stop();

    this.timer = window.setTimeout(async () => {
      await this.play();

      if (this.destroyed) return;

      this.timer = window.setInterval(() => {
        this.play();
      }, this.repeatMs);
    }, this.initialDelayMs);
  }

  stop() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      window.clearInterval(this.timer);
      this.timer = null;
    }

    this.hideImmediately();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
  }

  setAllowed(allowed) {
    this.visibleAllowed = Boolean(allowed);

    if (!this.visibleAllowed) {
      this.hideImmediately();
    }
  }

  async play() {
    if (
      this.destroyed ||
      this.running ||
      !this.visibleAllowed ||
      document.hidden
    ) {
      return;
    }

    this.running = true;
    this.textNode.textContent = "";

    this.bubble.classList.remove("is-hiding");
    this.bubble.classList.add("is-showing");
    this.caretNode.classList.add("is-typing");

    await wait(180);

    for (const character of this.text) {
      if (
        this.destroyed ||
        !this.visibleAllowed
      ) {
        this.hideImmediately();
        this.running = false;
        return;
      }

      this.textNode.textContent += character;
      await wait(this.typeSpeedMs);
    }

    this.caretNode.classList.remove("is-typing");

    await wait(this.holdMs);

    this.bubble.classList.add("is-hiding");
    await wait(this.hideMs);

    this.bubble.classList.remove("is-showing", "is-hiding");
    this.textNode.textContent = "";
    this.running = false;
  }

  hideImmediately() {
    this.bubble.classList.remove("is-showing", "is-hiding");
    this.textNode.textContent = "";
    this.caretNode.classList.remove("is-typing");
    this.running = false;
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
