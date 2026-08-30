import { askMiniAi } from "./chat-client.js";

export class MiniAiChatPanel {
  constructor(config) {
    this.config = config;
    this.history = [];
    this.abortController = null;

    this.root = this.#createPanel();
    document.body.appendChild(this.root);

    this.messages = this.root.querySelector("[data-mai-messages]");
    this.form = this.root.querySelector("[data-mai-form]");
    this.input = this.root.querySelector("[data-mai-input]");
    this.sendButton = this.root.querySelector("[data-mai-send]");
    this.closeButton = this.root.querySelector("[data-mai-close]");

    this.#wire();
    this.#renderWelcome();
  }

  #createPanel() {
    const panel = document.createElement("section");
    panel.className = "mai-chat-panel";
    panel.setAttribute("aria-label", "Mini AI Encyclopedia chatbot");
    panel.setAttribute("aria-hidden", "true");

    panel.innerHTML = `
      <div class="mai-chat-header">
        <div class="mai-chat-header__identity">
          <span class="mai-chat-status" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(this.config.panelTitle)}</strong>
            <small>${escapeHtml(this.config.panelSubtitle)}</small>
          </span>
        </div>

        <button
          class="mai-chat-close"
          type="button"
          data-mai-close
          aria-label="Close chatbot"
        >×</button>
      </div>

      <div class="mai-chat-messages" data-mai-messages></div>

      <div class="mai-chat-suggestions" data-mai-suggestions></div>

      <form class="mai-chat-form" data-mai-form>
        <textarea
          class="mai-chat-input"
          data-mai-input
          rows="1"
          maxlength="1200"
          placeholder="${escapeHtml(this.config.inputPlaceholder)}"
          aria-label="${escapeHtml(this.config.inputPlaceholder)}"
        ></textarea>

        <button class="mai-chat-send" data-mai-send type="submit">
          <span>Send</span>
          <span aria-hidden="true">↗</span>
        </button>
      </form>
    `;

    return panel;
  }

  #wire() {
    this.closeButton.addEventListener("click", () => this.close());

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit();
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.#submit();
      }
    });

    const suggestionContainer = this.root.querySelector("[data-mai-suggestions]");

    this.config.suggestedQuestions.forEach((question) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mai-suggestion";
      button.textContent = question;

      button.addEventListener("click", () => {
        this.input.value = question;
        this.#submit();
      });

      suggestionContainer.appendChild(button);
    });
  }

  #renderWelcome() {
    this.#appendMessage({
      role: "assistant",
      text: this.config.welcomeMessage
    });
  }

  open() {
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");

    window.setTimeout(() => this.input.focus(), 120);
  }

  close() {
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
  }

  toggle() {
    if (this.root.classList.contains("is-open")) {
      this.close();
    } else {
      this.open();
    }
  }

  async #submit() {
    const question = this.input.value.trim();

    if (!question || this.sendButton.disabled) return;

    this.input.value = "";
    this.#appendMessage({ role: "user", text: question });

    this.history.push({
      role: "user",
      content: question
    });

    this.history = this.history.slice(-this.config.maxClientHistoryMessages);

    const pending = this.#appendPending();
    this.#setBusy(true);

    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      const payload = await askMiniAi({
        endpoint: this.config.apiEndpoint,
        question,
        history: this.history,
        signal: this.abortController.signal
      });

      pending.remove();

      this.#appendMessage({
        role: "assistant",
        text: payload.reply || "I couldn't form an answer.",
        sources: payload.sources || []
      });

      this.history.push({
        role: "assistant",
        content: payload.reply || ""
      });

      this.history = this.history.slice(-this.config.maxClientHistoryMessages);
    } catch (error) {
      pending.remove();

      if (error?.name !== "AbortError") {
        this.#appendMessage({
          role: "assistant",
          text: `I hit a connection problem: ${error.message}`
        });
      }
    } finally {
      this.#setBusy(false);
    }
  }

  #appendPending() {
    const bubble = document.createElement("article");
    bubble.className = "mai-message mai-message--assistant mai-message--pending";
    bubble.innerHTML = `
      <span class="mai-thinking-dot"></span>
      <span class="mai-thinking-dot"></span>
      <span class="mai-thinking-dot"></span>
    `;

    this.messages.appendChild(bubble);
    this.#scrollToEnd();
    return bubble;
  }

  #appendMessage({ role, text, sources = [] }) {
    const bubble = document.createElement("article");
    bubble.className = `mai-message mai-message--${role}`;

    const body = document.createElement("div");
    body.className = "mai-message__body";
    body.textContent = text;
    bubble.appendChild(body);

    if (role === "assistant" && Array.isArray(sources) && sources.length) {
      const sourceList = document.createElement("div");
      sourceList.className = "mai-message__sources";

      const unique = dedupeSources(sources).slice(0, 5);

      unique.forEach((source, index) => {
        if (!isSafeHttpUrl(source.sourceUrl)) return;

        const anchor = document.createElement("a");
        anchor.className = "mai-source-chip";
        anchor.href = source.sourceUrl;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent =
          source.label ||
          `[S${source.reference || index + 1}] ${source.providerName || source.providerId || "Source"}`;

        sourceList.appendChild(anchor);
      });

      if (sourceList.childElementCount) {
        bubble.appendChild(sourceList);
      }
    }

    this.messages.appendChild(bubble);
    this.#scrollToEnd();
    return bubble;
  }

  #setBusy(busy) {
    this.sendButton.disabled = busy;
    this.input.disabled = busy;
    this.root.classList.toggle("is-busy", busy);
  }

  #scrollToEnd() {
    requestAnimationFrame(() => {
      this.messages.scrollTop = this.messages.scrollHeight;
    });
  }
}

function dedupeSources(sources) {
  const seen = new Set();

  return sources.filter((source) => {
    const key = source.sourceUrl || `${source.providerId}-${source.title}-${source.date}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
