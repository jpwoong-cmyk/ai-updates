(function () {
  "use strict";

  const config = window.AI_ENCYCLOPEDIA_CONFIG;

  if (!config || !Array.isArray(config.providers) || !config.providers.length) {
    document.body.innerHTML = "<p>AI Encyclopedia configuration was not found.</p>";
    return;
  }

  const state = {
    activeProviderId: getInitialProviderId(),
    activeTag: "All changes",
    sortOrder: "newest",
    currentPage: 1,
    pageSize: 25,
    entriesByProvider: new Map(),
    loadErrorsByProvider: new Map()
  };

  let changeRowObserver = null;
  let revealQueueDelay = 0;
  let revealQueueResetTimer = null;
  const revealTimers = new Set();

  let providerNavDocked = false;
  let providerNavTransitioning = false;
  let providerNavScrollTicking = false;
  let providerNavTransitionTimer = null;

  const elements = {
    providerNav: document.getElementById("providerNav"),
    providerRobotDock: document.getElementById("providerRobotDock"),
    patrolTrack: document.getElementById("patrolTrack"),
    archiveSection: document.getElementById("archiveSection"),
    archiveTitle: document.getElementById("archiveTitle"),
    archiveDescription: document.getElementById("archiveDescription"),
    visibleUpdateCount: document.getElementById("visibleUpdateCount"),
    providerCount: document.getElementById("providerCount"),
    tagFilters: document.getElementById("tagFilters"),
    changelogFeed: document.getElementById("changelogFeed"),
    paginationControls: document.getElementById("paginationControls"),
    paginationStatus: document.getElementById("paginationStatus"),
    previousPage: document.getElementById("previousPage"),
    nextPage: document.getElementById("nextPage"),
    sortOrder: document.getElementById("sortOrder")
  };

  initialise();

  function initialise() {
    elements.providerCount.textContent = `${config.providers.length} AI provider${config.providers.length === 1 ? "" : "s"} indexed`;

    renderProviderPatrol();
    renderProviderNavigation();
    renderProviderRobotDock();
    renderTagFilters();
    bindEvents();

    // Keep the archive fully hidden until a provider is selected.
    hideArchive();

    // Safe content exists before any endpoint is contacted.
    elements.changelogFeed.innerHTML = createNoDataMarkup(null);

    loadAllProviders();

    window.requestAnimationFrame(checkProviderNavPosition);
  }

  function getInitialProviderId() {
    const hash = window.location.hash.replace("#", "").trim();
    const match = config.providers.find(function (provider) {
      return provider.id === hash;
    });

    // No valid hash means no provider is selected on first load.
    return match ? match.id : null;
  }

  function bindEvents() {
    elements.sortOrder.addEventListener("change", function (event) {
      state.sortOrder = event.target.value;
      state.currentPage = 1;
      renderArchive();
    });

    if (elements.previousPage) {
      elements.previousPage.addEventListener("click", function () {
        changeArchivePage(state.currentPage - 1);
      });
    }

    if (elements.nextPage) {
      elements.nextPage.addEventListener("click", function () {
        changeArchivePage(state.currentPage + 1);
      });
    }

    window.addEventListener("hashchange", function () {
      const providerId = getInitialProviderId();
      if (providerId !== state.activeProviderId) {
        selectProvider(providerId, false);
      }
    });

    window.addEventListener("scroll", requestProviderNavPositionCheck, { passive: true });
    window.addEventListener("resize", requestProviderNavPositionCheck);
  }

  function renderProviderPatrol() {
    if (!elements.patrolTrack) {
      return;
    }

    elements.patrolTrack.replaceChildren();

    const patrolRobotWidth = 32;
    const patrolGap = 15;
    const patrolWidth = (config.providers.length * patrolRobotWidth) +
      (Math.max(0, config.providers.length - 1) * patrolGap);

    elements.patrolTrack.style.setProperty("--patrol-width", `${patrolWidth}px`);

    config.providers.forEach(function (provider, index) {
      elements.patrolTrack.appendChild(createPatrolRobot(provider, index));
    });
  }

  function createPatrolRobot(provider, index) {
    const robot = document.createElement("span");
    robot.className = "patrolRobot";
    robot.style.setProperty("--provider-accent", provider.accent || "#8fa2ff");
    robot.style.setProperty("--step-delay", `${index * -0.14}s`);
    robot.title = provider.product || provider.name;

    const antenna = document.createElement("span");
    antenna.className = "patrolAntenna";

    const head = document.createElement("span");
    head.className = "patrolHead";

    const leftEye = document.createElement("span");
    leftEye.className = "patrolEye";

    const rightEye = document.createElement("span");
    rightEye.className = "patrolEye";

    head.append(leftEye, rightEye);

    const body = document.createElement("span");
    body.className = "patrolBody";

    const leftArm = document.createElement("span");
    leftArm.className = "patrolArm patrolArmLeft";

    const rightArm = document.createElement("span");
    rightArm.className = "patrolArm patrolArmRight";

    const leftLeg = document.createElement("span");
    leftLeg.className = "patrolLeg patrolLegLeft";

    const rightLeg = document.createElement("span");
    rightLeg.className = "patrolLeg patrolLegRight";

    robot.append(antenna, head, body, leftArm, rightArm, leftLeg, rightLeg);
    return robot;
  }

  function renderProviderNavigation() {
    elements.providerNav.replaceChildren();

    config.providers.forEach(function (provider, index) {
      elements.providerNav.appendChild(createProviderOrb(provider, index));
    });
  }

  function createProviderOrb(provider, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "providerOrbButton";
    button.dataset.providerId = provider.id;
    button.style.setProperty("--provider-accent", provider.accent || "#8fa2ff");
    button.style.setProperty("--float-delay", `${index * -0.85}s`);
    button.style.setProperty("--provider-index", index);
    button.setAttribute("aria-current", String(state.activeProviderId === provider.id));
    button.setAttribute("aria-label", `Show ${provider.product || provider.name} updates`);

    const orb = document.createElement("span");
    orb.className = "providerOrb";
    orb.setAttribute("aria-hidden", "true");

    const robotBadge = document.createElement("span");
    robotBadge.className = "robotBadge";

    const antenna = document.createElement("span");
    antenna.className = "robotAntenna";

    const robotFace = document.createElement("span");
    robotFace.className = "robotFace";

    const leftEye = document.createElement("span");
    leftEye.className = "robotEye";

    const rightEye = document.createElement("span");
    rightEye.className = "robotEye";

    const mouth = document.createElement("span");
    mouth.className = "robotMouth";

    robotFace.append(leftEye, rightEye, mouth);
    robotBadge.append(antenna, robotFace);
    orb.appendChild(robotBadge);

    const label = document.createElement("span");
    label.className = "providerOrbLabel";

    const product = document.createElement("strong");
    product.textContent = provider.shortLabel || provider.product || provider.name;

    const company = document.createElement("small");
    company.textContent = provider.name;

    label.append(product, company);
    button.append(orb, label);

    button.addEventListener("click", function () {
      selectProvider(provider.id, true);
    });

    return button;
  }

  function renderProviderRobotDock() {
    if (!elements.providerRobotDock) {
      return;
    }

    elements.providerRobotDock.replaceChildren();

    config.providers.forEach(function (provider, index) {
      elements.providerRobotDock.appendChild(createDockProviderButton(provider, index));
    });
  }

  function createDockProviderButton(provider, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dockProviderButton";
    button.dataset.providerId = provider.id;
    button.style.setProperty("--provider-accent", provider.accent || "#8fa2ff");
    button.style.setProperty("--provider-index", index);
    button.setAttribute("aria-current", String(state.activeProviderId === provider.id));
    button.setAttribute("aria-label", `Show ${provider.product || provider.name} updates`);

    const label = document.createElement("span");
    label.className = "dockProviderLabel";

    const product = document.createElement("strong");
    product.textContent = provider.shortLabel || provider.product || provider.name;

    const company = document.createElement("small");
    company.textContent = provider.name;

    label.append(product, company);

    const robotHead = createDockProviderHead(provider, index);

    button.append(label, robotHead);
    button.addEventListener("click", function () {
      // Dock selectors always keep the archive open and return users to its header.
      selectProvider(provider.id, true, false);
      scrollToArchiveHeader();
    });

    return button;
  }

  function createDockProviderHead(provider, index) {
    const head = document.createElement("span");
    head.className = "dockOrbHead";
    head.style.setProperty("--head-delay", `${index * -0.42}s`);
    head.setAttribute("aria-hidden", "true");

    const antenna = document.createElement("span");
    antenna.className = "dockHeadAntenna";

    const face = document.createElement("span");
    face.className = "dockHeadFace";

    const leftEye = document.createElement("span");
    leftEye.className = "dockHeadEye";

    const rightEye = document.createElement("span");
    rightEye.className = "dockHeadEye";

    const smile = document.createElement("span");
    smile.className = "dockHeadSmile";

    face.append(leftEye, rightEye, smile);
    head.append(antenna, face);
    return head;
  }

  function scrollToArchiveHeader() {
    const archiveHeader = document.getElementById("archiveHeader");

    if (!archiveHeader || !elements.archiveSection || elements.archiveSection.hidden) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.requestAnimationFrame(function () {
      archiveHeader.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
    });
  }

  function updateProviderSelectionState() {
    document.querySelectorAll("[data-provider-id]").forEach(function (button) {
      button.setAttribute("aria-current", String(button.dataset.providerId === state.activeProviderId));
    });
  }

  function requestProviderNavPositionCheck() {
    if (providerNavScrollTicking) {
      return;
    }

    providerNavScrollTicking = true;
    window.requestAnimationFrame(function () {
      providerNavScrollTicking = false;
      checkProviderNavPosition();
    });
  }

  function checkProviderNavPosition() {
    if (!elements.providerNav || !elements.providerRobotDock || providerNavTransitioning) {
      return;
    }

    const navRect = elements.providerNav.getBoundingClientRect();
    const triggerLine = Math.max(118, window.innerHeight * 0.16);
    const returnLine = triggerLine + 92;

    if (!providerNavDocked && navRect.bottom <= triggerLine) {
      dockProviderNavigation();
      return;
    }

    if (providerNavDocked && navRect.bottom >= returnLine) {
      restoreProviderNavigation();
    }
  }

  function dockProviderNavigation() {
    if (providerNavDocked || providerNavTransitioning) {
      return;
    }

    providerNavTransitioning = true;
    providerNavDocked = true;
    window.clearTimeout(providerNavTransitionTimer);

    elements.providerNav.classList.remove("isReassembling");
    elements.providerNav.classList.add("isDismantling");

    elements.providerRobotDock.hidden = false;
    elements.providerRobotDock.classList.remove("isReturning", "isReady");
    void elements.providerRobotDock.offsetWidth;
    elements.providerRobotDock.classList.add("isEntering");

    document.body.classList.add("providerNavIsDocking");

    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2850;

    providerNavTransitionTimer = window.setTimeout(function () {
      elements.providerNav.classList.add("isDismantled");
      elements.providerRobotDock.classList.add("isReady");
      document.body.classList.remove("providerNavIsDocking");
      document.body.classList.add("providerNavIsDocked");
      providerNavTransitioning = false;
      checkProviderNavPosition();
    }, transitionDuration);
  }

  function restoreProviderNavigation() {
    if (!providerNavDocked || providerNavTransitioning) {
      return;
    }

    providerNavTransitioning = true;
    providerNavDocked = false;
    window.clearTimeout(providerNavTransitionTimer);

    elements.providerRobotDock.classList.add("isReturning");
    elements.providerNav.classList.remove("isDismantling", "isDismantled");
    elements.providerNav.classList.add("isReassembling");

    document.body.classList.remove("providerNavIsDocked");
    document.body.classList.add("providerNavIsReturning");

    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1250;

    providerNavTransitionTimer = window.setTimeout(function () {
      elements.providerRobotDock.hidden = true;
      elements.providerRobotDock.classList.remove("isEntering", "isReady", "isReturning");
      elements.providerNav.classList.remove("isReassembling");
      document.body.classList.remove("providerNavIsReturning");
      providerNavTransitioning = false;
      checkProviderNavPosition();
    }, transitionDuration);
  }

  function selectProvider(providerId, updateHash, allowToggle = true) {
    const providerExists = config.providers.some(function (provider) {
      return provider.id === providerId;
    });

    const clickedCurrentProvider = allowToggle && updateHash && state.activeProviderId === providerId;
    state.activeProviderId = providerExists && !clickedCurrentProvider ? providerId : null;
    state.activeTag = "All changes";
    // Every hero orb and dock orb starts its provider at page one.
    state.currentPage = 1;

    if (updateHash) {
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(
        null,
        "",
        state.activeProviderId ? `#${state.activeProviderId}` : cleanUrl
      );
    }

    updateProviderSelectionState();
    renderTagFilters();

    if (!state.activeProviderId) {
      hideArchive();
      return;
    }

    renderArchive();
  }

  function hideArchive() {
    disconnectChangeRowObserver();

    if (elements.archiveSection) {
      elements.archiveSection.hidden = true;
    }
  }

  function showArchive() {
    if (elements.archiveSection) {
      elements.archiveSection.hidden = false;
    }
  }

  function renderTagFilters() {
    const tags = Array.isArray(config.defaultTags) && config.defaultTags.length
      ? config.defaultTags
      : ["All changes"];

    elements.tagFilters.replaceChildren();

    tags.forEach(function (tag) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tagButton";
      button.textContent = tag;
      button.setAttribute("aria-pressed", String(state.activeTag === tag));

      button.addEventListener("click", function () {
        state.activeTag = tag;
        state.currentPage = 1;
        renderTagFilters();
        renderArchive();
      });

      elements.tagFilters.appendChild(button);
    });
  }

  async function loadAllProviders() {
    await Promise.all(config.providers.map(loadProviderData));

    if (state.activeProviderId) {
      renderArchive();
    }
  }

  async function loadProviderData(provider) {
    // Every provider begins empty so failures never leave stale content behind.
    state.entriesByProvider.set(provider.id, []);
    state.loadErrorsByProvider.delete(provider.id);

    const endpoint = provider.api && typeof provider.api.endpoint === "string"
      ? provider.api.endpoint.trim()
      : "";

    if (!endpoint) {
      if (config.previewMode && Array.isArray(provider.previewEntries)) {
        const previewItems = provider.previewEntries
          .map(function (item, index) {
            return normaliseEntry(item, provider, index);
          })
          .filter(Boolean);

        state.entriesByProvider.set(provider.id, previewItems);
      }
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const payload = await response.json();
      const items = extractArray(payload)
        .map(function (item, index) {
          return normaliseEntry(item, provider, index);
        })
        .filter(Boolean);

      state.entriesByProvider.set(provider.id, items);

      if (!items.length) {
        state.loadErrorsByProvider.set(provider.id, "The configured source returned no changelog entries.");
      }
    } catch (error) {
      state.entriesByProvider.set(provider.id, []);
      state.loadErrorsByProvider.set(
        provider.id,
        error instanceof Error ? error.message : "The changelog source could not be loaded."
      );
    }
  }

  function extractArray(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    const possibleArrays = [
      payload.items,
      payload.data,
      payload.results,
      payload.changelog,
      payload.entries
    ];

    return possibleArrays.find(Array.isArray) || [];
  }

  function normaliseEntry(item, provider, index) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const title = firstText(item.title, item.name, item.heading, item.changeTitle);
    if (!title) {
      return null;
    }

    const rawTags = item.tags || item.types || item.categories || item.labels || item.changeType;

    return {
      id: firstText(item.id, item.slug) || `${provider.id}-${index}`,
      providerId: provider.id,
      providerName: provider.name,
      product: provider.product,
      accent: provider.accent,
      title: title,
      date: firstText(item.date, item.publishedAt, item.releaseDate, item.updatedAt, item.createdAt),
      summary: firstText(item.summary, item.description, item.body, item.details, item.content) || "No summary provided.",
      tags: normaliseTags(rawTags),
      sourceUrl: firstText(item.sourceUrl, item.url, item.link, item.href)
    };
  }

  function firstText() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }

      if (typeof value === "number") {
        return String(value);
      }
    }

    return "";
  }

  function normaliseTags(value) {
    if (Array.isArray(value)) {
      return value
        .map(String)
        .map(function (tag) {
          return tag.trim();
        })
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(",")
        .map(function (tag) {
          return tag.trim();
        })
        .filter(Boolean);
    }

    return [];
  }

  function renderArchive() {
    const provider = getActiveProvider();

    if (!provider) {
      hideArchive();
      return;
    }

    const entries = getFilteredEntries();
    showArchive();
    disconnectChangeRowObserver();

    elements.archiveTitle.textContent = `${provider.product || provider.name} updates`;
    elements.archiveDescription.textContent = provider.description || `${provider.name} changelog entries.`;
    elements.visibleUpdateCount.textContent = `${entries.length} update${entries.length === 1 ? "" : "s"}`;

    if (!entries.length) {
      hidePagination();
      elements.changelogFeed.innerHTML = createNoDataMarkup(
        provider,
        state.loadErrorsByProvider.get(provider.id) || ""
      );
      return;
    }

    const totalPages = Math.max(1, Math.ceil(entries.length / state.pageSize));
    state.currentPage = Math.min(Math.max(1, state.currentPage), totalPages);

    const startIndex = (state.currentPage - 1) * state.pageSize;
    const pageEntries = entries.slice(startIndex, startIndex + state.pageSize);

    const list = document.createElement("div");
    list.className = "changelogList";

    pageEntries.forEach(function (entry) {
      list.appendChild(createChangeRow(entry));
    });

    elements.changelogFeed.replaceChildren(list);
    renderPagination(entries.length, totalPages, startIndex, pageEntries.length);
    observeChangeRows(list);
  }

  function renderPagination(totalEntries, totalPages, startIndex, visibleEntries) {
    if (!elements.paginationControls || !elements.paginationStatus) {
      return;
    }

    if (totalEntries <= state.pageSize) {
      hidePagination();
      return;
    }

    const firstVisible = startIndex + 1;
    const lastVisible = startIndex + visibleEntries;

    elements.paginationControls.hidden = false;
    elements.paginationStatus.textContent =
      `Showing ${firstVisible}–${lastVisible} of ${totalEntries} · Page ${state.currentPage} of ${totalPages}`;

    elements.previousPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= totalPages;
  }

  function hidePagination() {
    if (elements.paginationControls) {
      elements.paginationControls.hidden = true;
    }
  }

  function changeArchivePage(nextPage) {
    const entries = getFilteredEntries();
    const totalPages = Math.max(1, Math.ceil(entries.length / state.pageSize));
    const safePage = Math.min(Math.max(1, nextPage), totalPages);

    if (safePage === state.currentPage) {
      return;
    }

    state.currentPage = safePage;
    renderArchive();
    scrollToChangelogStart();
  }

  function scrollToChangelogStart() {
    if (!elements.changelogFeed) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.requestAnimationFrame(function () {
      elements.changelogFeed.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
    });
  }

  function getFilteredEntries() {
    const entries = (state.entriesByProvider.get(state.activeProviderId) || []).slice();

    const filtered = state.activeTag === "All changes"
      ? entries
      : entries.filter(function (entry) {
          return entry.tags.some(function (tag) {
            return tag.toLowerCase() === state.activeTag.toLowerCase();
          });
        });

    return filtered.sort(function (a, b) {
      const first = parseDate(a.date);
      const second = parseDate(b.date);
      return state.sortOrder === "oldest" ? first - second : second - first;
    });
  }

  function parseDate(value) {
    const timestamp = Date.parse(value || "");
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function getActiveProvider() {
    return config.providers.find(function (provider) {
      return provider.id === state.activeProviderId;
    }) || null;
  }

  function observeChangeRows(list) {
    const rows = Array.from(list.querySelectorAll(".changeRow"));

    if (!rows.length) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      rows.forEach(function (row) {
        row.classList.add("isVisible");
      });
      return;
    }

    changeRowObserver = new IntersectionObserver(function (entries) {
      const visibleEntries = entries
        .filter(function (entry) {
          return entry.isIntersecting;
        })
        .sort(function (first, second) {
          const position = first.target.compareDocumentPosition(second.target);
          return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

      visibleEntries.forEach(function (entry) {
        const row = entry.target;
        changeRowObserver.unobserve(row);

        const timer = window.setTimeout(function () {
          row.classList.add("isVisible");
          revealTimers.delete(timer);
        }, revealQueueDelay);

        revealTimers.add(timer);
        revealQueueDelay += 200;
      });

      if (visibleEntries.length) {
        window.clearTimeout(revealQueueResetTimer);
        revealQueueResetTimer = window.setTimeout(function () {
          revealQueueDelay = 0;
        }, revealQueueDelay + 120);
      }
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -6% 0px"
    });

    rows.forEach(function (row) {
      changeRowObserver.observe(row);
    });
  }

  function disconnectChangeRowObserver() {
    if (changeRowObserver) {
      changeRowObserver.disconnect();
      changeRowObserver = null;
    }

    revealTimers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    revealTimers.clear();

    window.clearTimeout(revealQueueResetTimer);
    revealQueueDelay = 0;
  }

  function createChangeRow(entry) {
    const article = document.createElement("article");
    article.className = "changeRow";
    article.style.setProperty("--provider-accent", entry.accent || "#8fa2ff");

    const safeEntryId = `${entry.providerId}-${entry.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const summaryId = `change-summary-${safeEntryId}`;

    const meta = document.createElement("div");
    meta.className = "changeMeta";

    const marker = document.createElement("span");
    marker.className = "changeMarker";
    marker.setAttribute("aria-hidden", "true");

    const date = document.createElement("time");
    date.className = "changeDate";
    date.dateTime = entry.date || "";
    date.textContent = formatDate(entry.date);

    const provider = document.createElement("span");
    provider.className = "changeProvider";
    provider.textContent = entry.product || entry.providerName;

    meta.append(marker, date, provider);

    const content = document.createElement("div");
    content.className = "changeContent";

    const title = document.createElement("h3");
    title.className = "changeTitle";
    title.textContent = entry.title;

    const summary = document.createElement("p");
    summary.id = summaryId;
    summary.className = "changeSummary";
    summary.textContent = entry.summary;

    const tags = document.createElement("div");
    tags.className = "changeTags";

    (entry.tags.length ? entry.tags : ["Update"]).forEach(function (tagText) {
      const tag = document.createElement("span");
      tag.className = "changeTag";
      tag.textContent = tagText;
      tags.appendChild(tag);
    });

    content.append(title, summary, tags);

    const source = createSourceControl(entry.sourceUrl, entry.title, article, summaryId);
    article.append(meta, content, source);

    // The full row can be clicked to reveal or collapse its details.
    // Interactive controls inside the row keep their own independent behaviour.
    article.addEventListener("click", function (event) {
      if (event.target.closest("button, a, input, select, textarea, label")) {
        return;
      }

      toggleChangeRow(article);
    });

    return article;
  }

  function createSourceControl(url, title, article, summaryId) {
    const actions = document.createElement("div");
    actions.className = "changeActions";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sourceUnavailable changeExpandToggle";
    toggle.textContent = "{}";
    toggle.title = "Expand changelog details";
    toggle.setAttribute("aria-label", `Expand details for ${title}`);
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", summaryId);

    toggle.addEventListener("click", function () {
      toggleChangeRow(article);
    });

    actions.appendChild(toggle);

    if (isSafeHttpUrl(url)) {
      const link = document.createElement("a");
      link.className = "sourceLink";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "↗";
      link.title = "Open official changelog source";
      link.setAttribute("aria-label", `Open official source for ${title}`);
      actions.appendChild(link);
    }

    return actions;
  }

  function toggleChangeRow(article) {
    const shouldExpand = !article.classList.contains("isExpanded");

    if (shouldExpand) {
      const list = article.closest(".changelogList");

      if (list) {
        list.querySelectorAll(".changeRow.isExpanded").forEach(function (openRow) {
          if (openRow !== article) {
            setChangeRowExpanded(openRow, false);
          }
        });
      }
    }

    setChangeRowExpanded(article, shouldExpand);
  }

  function setChangeRowExpanded(article, expanded) {
    const summary = article.querySelector(".changeSummary");

    if (summary && expanded) {
      article.style.setProperty("--summary-expanded-height", `${summary.scrollHeight}px`);
    }

    article.classList.toggle("isExpanded", expanded);

    const toggle = article.querySelector(".changeExpandToggle");
    if (!toggle) {
      return;
    }

    toggle.textContent = expanded ? "{...}" : "{}";
    toggle.title = expanded ? "Collapse changelog details" : "Expand changelog details";
    toggle.setAttribute("aria-expanded", String(expanded));

    const title = article.querySelector(".changeTitle");
    const entryTitle = title ? title.textContent : "this update";
    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Collapse" : "Expand"} details for ${entryTitle}`
    );
  }

  function isSafeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
      return false;
    }

    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function formatDate(value) {
    const timestamp = Date.parse(value || "");

    if (Number.isNaN(timestamp)) {
      return "Date unknown";
    }

    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(timestamp));
  }

  function createNoDataMarkup(provider, detail = "") {
    const apiId = provider && provider.api ? provider.api.id : "configured API slot";
    const providerName = provider ? provider.product || provider.name : "this AI";
    const endpoint = provider && provider.api && typeof provider.api.endpoint === "string"
      ? provider.api.endpoint.trim()
      : "";

    const message = endpoint
      ? `${providerName} data could not be loaded from ${endpoint}.${detail ? ` ${detail}` : ""}`
      : `No changelog endpoint is configured for ${providerName}. Add one to ${apiId} inside ai-encyclopedia.config.js.`;

    return `
      <section class="emptyState" role="status">
        <div class="emptyStateSignal" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div>
          <h3>No data found</h3>
          <p>${escapeHtml(message)}</p>
        </div>
      </section>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
