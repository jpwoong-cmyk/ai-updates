const CONFIG = {
  endpoint: "/api/provider-status",
  refreshMs: 180000,
  staleAfterMs: 180000,
  tickerSelector: "#aiStatusTicker"
};

const ORDER = [
  "openai",
  "anthropic",
  "gemini",
  "copilot",
  "xai"
];

let lastFetchAt = 0;
let refreshTimer = null;
let fetching = false;

boot();

function boot() {
  const root =
    document.querySelector(
      CONFIG.tickerSelector
    );

  if (!root) {
    return;
  }

  renderLoading(root);
  refresh(root);

  startTimer(root);

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        stopTimer();
        return;
      }

      if (
        Date.now() -
          lastFetchAt >=
        CONFIG.staleAfterMs
      ) {
        refresh(root);
      }

      startTimer(root);
    }
  );

  root.addEventListener(
    "click",
    (event) => {
      const refreshButton =
        event.target.closest(
          "[data-ai-status-refresh]"
        );

      if (!refreshButton) {
        return;
      }

      refresh(root, {
        force: true
      });
    }
  );
}

async function refresh(
  root,
  { force = false } = {}
) {
  if (fetching) {
    return;
  }

  if (
    !force &&
    Date.now() - lastFetchAt <
      5000
  ) {
    return;
  }

  fetching = true;

  root.classList.add(
    "is-refreshing"
  );

  try {
    const response =
      await fetch(
        CONFIG.endpoint,
        {
          headers: {
            Accept:
              "application/json"
          },
          cache: force
            ? "no-store"
            : "default"
        }
      );

    const payload =
      await safeJson(response);

    if (!response.ok) {
      throw new Error(
        payload?.error ||
        `Status endpoint returned HTTP ${response.status}.`
      );
    }

    lastFetchAt =
      Date.now();

    renderStatus(
      root,
      payload
    );
  } catch (error) {
    renderEndpointFailure(
      root,
      error
    );
  } finally {
    fetching = false;

    root.classList.remove(
      "is-refreshing"
    );
  }
}

function renderLoading(root) {
  root.innerHTML = `
    <div class="aiStatusTicker__signal">
      <span class="aiStatusTicker__radar" aria-hidden="true"></span>
      <span>AI STATUS</span>
    </div>

    <div class="aiStatusTicker__viewport">
      <div class="aiStatusTicker__loading">
        ACQUIRING LIVE PROVIDER SIGNALS…
      </div>
    </div>

    <button
      class="aiStatusTicker__refresh"
      type="button"
      data-ai-status-refresh
      aria-label="Refresh AI provider status"
      title="Refresh status"
    >↻</button>
  `;
}

function renderStatus(
  root,
  payload
) {
  const providers =
    Array.isArray(payload?.providers)
      ? payload.providers
      : [];

  const ordered =
    [...providers].sort(
      (first, second) =>
        ORDER.indexOf(first.id) -
        ORDER.indexOf(second.id)
    );

  const hasIssue =
    ordered.some(
      (provider) =>
        !provider.healthy
    );

  root.classList.toggle(
    "has-issue",
    hasIssue
  );

  root.classList.toggle(
    "is-all-clear",
    !hasIssue
  );

  const checkedAt =
    payload?.checkedAt
      ? new Date(
          payload.checkedAt
        )
      : null;

  const signalLabel =
    hasIssue
      ? `${ordered.filter((provider) => !provider.healthy).length} ALERT`
      : "ALL CLEAR";

  const primaryGroup =
    buildTickerGroup(
      ordered,
      false
    );

  const duplicateGroup =
    buildTickerGroup(
      ordered,
      true
    );

  root.innerHTML = `
    <div
      class="aiStatusTicker__signal"
      title="${
        checkedAt
          ? `Checked ${escapeHtml(formatCheckedAt(checkedAt))}`
          : "Live AI provider status"
      }"
    >
      <span
        class="aiStatusTicker__radar"
        aria-hidden="true"
      ></span>

      <span class="aiStatusTicker__signalText">
        AI STATUS
      </span>

      <span class="aiStatusTicker__summary">
        ${escapeHtml(signalLabel)}
      </span>
    </div>

    <div class="aiStatusTicker__viewport">
      <div class="aiStatusTicker__marquee">
        ${primaryGroup}
        ${duplicateGroup}
      </div>
    </div>

    <button
      class="aiStatusTicker__refresh"
      type="button"
      data-ai-status-refresh
      aria-label="Refresh AI provider status"
      title="${
        checkedAt
          ? `Last checked ${escapeHtml(formatCheckedAt(checkedAt))}`
          : "Refresh status"
      }"
    >↻</button>
  `;
}

function buildTickerGroup(
  providers,
  duplicate
) {
  const items =
    providers
      .map((provider) =>
        buildProviderItem(
          provider,
          duplicate
        )
      )
      .join("");

  return `
    <div
      class="aiStatusTicker__group"
      ${
        duplicate
          ? 'aria-hidden="true"'
          : ""
      }
    >
      ${items}
    </div>
  `;
}

function buildProviderItem(
  provider,
  duplicate
) {
  const healthy =
    Boolean(provider?.healthy);

  const label =
    provider?.label ||
    provider?.id ||
    "AI";

  const statusLabel =
    provider?.statusLabel ||
    (
      healthy
        ? "Operational"
        : "Status unavailable"
    );

  const message =
    compactMessage(
      provider?.message,
      statusLabel
    );

  const className =
    healthy
      ? "aiStatusTicker__item is-healthy"
      : "aiStatusTicker__item is-problem";

  const content = `
    <span
      class="aiStatusTicker__dot"
      aria-hidden="true"
    ></span>

    <strong>
      ${escapeHtml(label)}
    </strong>

    <span class="aiStatusTicker__state">
      ${escapeHtml(statusLabel)}
    </span>

    ${
      message
        ? `
          <span
            class="aiStatusTicker__detail"
          >
            ${escapeHtml(message)}
          </span>
        `
        : ""
    }

    ${
      healthy
        ? ""
        : `
          <span
            class="aiStatusTicker__external"
            aria-hidden="true"
          >↗</span>
        `
    }
  `;

  if (
    !healthy &&
    isHttpUrl(
      provider?.statusUrl
    )
  ) {
    return `
      <a
        class="${className}"
        href="${escapeAttribute(provider.statusUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        title="${escapeAttribute(provider.message || statusLabel)}"
        ${
          duplicate
            ? 'tabindex="-1"'
            : ""
        }
      >
        ${content}
      </a>

      <span
        class="aiStatusTicker__separator"
        aria-hidden="true"
      >◆</span>
    `;
  }

  return `
    <span
      class="${className}"
      title="${escapeAttribute(provider?.message || statusLabel)}"
    >
      ${content}
    </span>

    <span
      class="aiStatusTicker__separator"
      aria-hidden="true"
    >◆</span>
  `;
}

function renderEndpointFailure(
  root,
  error
) {
  root.classList.remove(
    "is-all-clear"
  );

  root.classList.add(
    "has-issue"
  );

  root.innerHTML = `
    <div class="aiStatusTicker__signal">
      <span class="aiStatusTicker__radar" aria-hidden="true"></span>
      <span>AI STATUS</span>
      <span class="aiStatusTicker__summary">
        SIGNAL LOST
      </span>
    </div>

    <div class="aiStatusTicker__viewport">
      <div class="aiStatusTicker__loading is-error">
        LIVE STATUS COULD NOT BE LOADED · ${
          escapeHtml(
            error?.message ||
            "Please try again."
          )
        }
      </div>
    </div>

    <button
      class="aiStatusTicker__refresh"
      type="button"
      data-ai-status-refresh
      aria-label="Retry AI provider status"
      title="Retry status"
    >↻</button>
  `;
}

function startTimer(root) {
  stopTimer();

  refreshTimer =
    window.setInterval(
      () => {
        if (!document.hidden) {
          refresh(root);
        }
      },
      CONFIG.refreshMs
    );
}

function stopTimer() {
  if (
    refreshTimer !== null
  ) {
    window.clearInterval(
      refreshTimer
    );

    refreshTimer = null;
  }
}

function compactMessage(
  value,
  statusLabel
) {
  const text =
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  if (
    !text ||
    text.toLowerCase() ===
      String(statusLabel || "")
        .toLowerCase()
  ) {
    return "";
  }

  if (text.length <= 120) {
    return text;
  }

  return (
    `${text.slice(0, 117).trim()}…`
  );
}

function formatCheckedAt(date) {
  try {
    return date.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );
  } catch {
    return "";
  }
}

function isHttpUrl(value) {
  try {
    const url =
      new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
