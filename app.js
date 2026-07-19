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
    audienceFilter: "all",
    sortOrder: "newest",
    currentPage: 1,
    // Pagination now keeps complete dates together instead of splitting a day.
    pageSize: 15,
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
    audienceFilter: document.getElementById("audienceFilter"),
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
    if (elements.audienceFilter) {
      elements.audienceFilter.value = state.audienceFilter;
      elements.audienceFilter.addEventListener("change", function (event) {
        state.audienceFilter = normaliseAudience(event.target.value, "all");
        state.currentPage = 1;
        renderArchive();
      });
    }

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

  function applyProviderTheme(element, provider) {
    const accent = provider && typeof provider.accent === "string" && provider.accent.trim()
      ? provider.accent.trim()
      : "#8fa2ff";

    const palette = provider && Array.isArray(provider.palette)
      ? provider.palette
          .filter(function (colour) {
            return typeof colour === "string" && colour.trim();
          })
          .map(function (colour) {
            return colour.trim();
          })
          .slice(0, 4)
      : [];

    const usePalette = provider && provider.colourMode === "palette" && palette.length >= 2;
    const paletteColours = [
      palette[0] || accent,
      palette[1] || palette[0] || accent,
      palette[2] || palette[0] || accent,
      palette[3] || palette[1] || palette[0] || accent
    ];

    element.style.setProperty("--provider-accent", accent);
    element.dataset.providerColourMode = usePalette ? "palette" : "single";

    paletteColours.forEach(function (colour, index) {
      element.style.setProperty(`--provider-palette-${index + 1}`, colour);
    });
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
    applyProviderTheme(robot, provider);
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
    applyProviderTheme(button, provider);
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
    applyProviderTheme(button, provider);
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
    const tags = (Array.isArray(config.defaultTags) && config.defaultTags.length
      ? config.defaultTags
      : ["All changes"])
      .filter(function (tag) {
        const normalisedTag = String(tag).trim().toLowerCase();
        // Audience is controlled by the dedicated dropdown, not duplicated as a tag.
        return normalisedTag !== "developer" && normalisedTag !== "product";
      });

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

    const feeds = getProviderFeeds(provider);

    if (!feeds.length) {
      state.loadErrorsByProvider.set(provider.id, [
        {
          audience: "product",
          endpoint: "",
          message: "No product or developer changelog feed is configured."
        }
      ]);
      return;
    }

    const results = await Promise.all(
      feeds.map(function (feed) {
        return loadProviderFeed(provider, feed);
      })
    );

    const entries = deduplicateEntries(
      results.flatMap(function (result) {
        return result.items;
      })
    );

    const errors = results
      .filter(function (result) {
        return Boolean(result.error);
      })
      .map(function (result) {
        return result.error;
      });

    state.entriesByProvider.set(provider.id, entries);

    if (errors.length) {
      state.loadErrorsByProvider.set(provider.id, errors);
    }
  }

  function getProviderFeeds(provider) {
    const feeds = [];
    const configuredFeeds = provider && provider.feeds && typeof provider.feeds === "object"
      ? provider.feeds
      : null;

    if (configuredFeeds) {
      Object.keys(configuredFeeds).forEach(function (key) {
        const configuredFeed = configuredFeeds[key];

        if (!configuredFeed || typeof configuredFeed !== "object") {
          return;
        }

        feeds.push({
          audience: normaliseAudience(configuredFeed.audience || key, key),
          id: firstText(configuredFeed.id, `${provider.id}_${key}_API`),
          endpoint: firstText(configuredFeed.endpoint),
          product: firstText(configuredFeed.product, provider.product),
          previewEntries: Array.isArray(configuredFeed.previewEntries)
            ? configuredFeed.previewEntries
            : []
        });
      });
    }

    const hasProductFeed = feeds.some(function (feed) {
      return feed.audience === "product";
    });

    // Backwards compatibility: today's single provider.api endpoint is a product feed.
    if (!hasProductFeed && provider.api && typeof provider.api === "object") {
      feeds.unshift({
        audience: "product",
        id: firstText(provider.api.id, `${provider.id}_product_API`),
        endpoint: firstText(provider.api.endpoint),
        product: provider.product,
        previewEntries: Array.isArray(provider.previewEntries)
          ? provider.previewEntries
          : []
      });
    }

    if (!feeds.length && Array.isArray(provider.previewEntries)) {
      feeds.push({
        audience: "product",
        id: `${provider.id}_product_preview`,
        endpoint: "",
        product: provider.product,
        previewEntries: provider.previewEntries
      });
    }

    return feeds;
  }

  async function loadProviderFeed(provider, feed) {
    const endpoint = typeof feed.endpoint === "string" ? feed.endpoint.trim() : "";

    if (!endpoint) {
      if (config.previewMode && feed.previewEntries.length) {
        return {
          items: feed.previewEntries
            .map(function (item, index) {
              return normaliseEntry(item, provider, index, feed);
            })
            .filter(Boolean),
          error: null
        };
      }

      return {
        items: [],
        error: null
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      const responseText = await response.text();
      let payload = null;

      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        payload = null;
      }

      if (!response.ok) {
        const serverError =
          payload && typeof payload.error === "string"
            ? payload.error
            : `API request failed with HTTP ${response.status}`;

        throw new Error(serverError);
      }

      if (!payload) {
        throw new Error("The changelog API returned invalid JSON.");
      }

      const items = extractArray(payload)
        .map(function (item, index) {
          return normaliseEntry(item, provider, index, feed);
        })
        .filter(Boolean);

      if (!items.length) {
        throw new Error("The configured source returned no changelog entries.");
      }

      return {
        items,
        error: null
      };
    } catch (error) {
      return {
        items: [],
        error: {
          audience: feed.audience,
          endpoint,
          message: error instanceof Error
            ? error.message
            : "The changelog source could not be loaded."
        }
      };
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

  function normaliseEntry(item, provider, index, feed) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const title = firstText(item.title, item.name, item.heading, item.changeTitle);
    if (!title) {
      return null;
    }

    const rawTags = item.tags || item.types || item.categories || item.labels || item.changeType;
    const audience = normaliseAudience(item.audience, feed.audience);
    const tags = normaliseTags(rawTags).filter(function (tag) {
      const normalisedTag = tag.toLowerCase();
      return normalisedTag !== "developer" && normalisedTag !== "product";
    });

    return {
      id: firstText(item.id, item.slug) || `${provider.id}-${audience}-${index}`,
      providerId: provider.id,
      providerName: provider.name,
      product: firstText(item.product, feed.product, provider.product),
      audience,
      accent: provider.accent,
      colourMode: provider.colourMode || "single",
      palette: Array.isArray(provider.palette) ? provider.palette.slice(0, 4) : [],
      title,
      date: firstText(item.date, item.publishedAt, item.releaseDate, item.updatedAt, item.createdAt),
      datePrecision: normaliseDatePrecision(item.datePrecision),
      summary: firstText(item.summary, item.description, item.body, item.details, item.content) || "No summary provided.",
      tags,
      sourceUrl: firstText(item.sourceUrl, item.url, item.link, item.href)
    };
  }

  function normaliseDatePrecision(value) {
    const candidate = firstText(value, "day").toLowerCase();
    return candidate === "month" ? "month" : "day";
  }

  function normaliseAudience(value, fallback = "product") {
    const candidate = firstText(value, fallback).toLowerCase();

    if (candidate === "all") {
      return "all";
    }

    if (candidate.includes("developer") || candidate === "dev" || candidate === "api") {
      return "developer";
    }

    return "product";
  }

  function deduplicateEntries(entries) {
    const byKey = new Map();

    entries.forEach(function (entry) {
      const key = [
        entry.audience,
        entry.date,
        entry.title.toLowerCase().replace(/\s+/g, " ").trim()
      ].join("|");

      if (!byKey.has(key)) {
        byKey.set(key, entry);
        return;
      }

      const existing = byKey.get(key);

      if (entry.summary.length > existing.summary.length) {
        existing.summary = entry.summary;
      }

      existing.tags = Array.from(new Set(existing.tags.concat(entry.tags)));
      existing.sourceUrl = existing.sourceUrl || entry.sourceUrl;
    });

    return Array.from(byKey.values());
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
    const dateGroups = groupEntriesByDate(entries);
    showArchive();
    disconnectChangeRowObserver();

    elements.archiveTitle.textContent = `${provider.product || provider.name} updates`;
    elements.archiveDescription.textContent = provider.description || `${provider.name} changelog entries.`;
    elements.visibleUpdateCount.textContent = entries.length
      ? `${entries.length} update${entries.length === 1 ? "" : "s"} across ${dateGroups.length} date${dateGroups.length === 1 ? "" : "s"}`
      : "0 updates";

    if (!entries.length) {
      hidePagination();
      elements.changelogFeed.innerHTML = createNoDataMarkup(provider);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(dateGroups.length / state.pageSize));
    state.currentPage = Math.min(Math.max(1, state.currentPage), totalPages);

    const startIndex = (state.currentPage - 1) * state.pageSize;
    const pageGroups = dateGroups.slice(startIndex, startIndex + state.pageSize);

    const list = document.createElement("div");
    list.className = "changelogList changelogDateList";

    pageGroups.forEach(function (group) {
      list.appendChild(createDateGroup(group));
    });

    const fragment = document.createDocumentFragment();
    const warning = createFeedWarning(provider);

    if (warning) {
      fragment.appendChild(warning);
    }

    fragment.appendChild(list);
    elements.changelogFeed.replaceChildren(fragment);

    renderPagination(
      dateGroups.length,
      totalPages,
      startIndex,
      pageGroups,
      entries.length
    );
    observeChangeRows(list);
  }

  function renderPagination(totalGroups, totalPages, startIndex, visibleGroups, totalEntries) {
    if (!elements.paginationControls || !elements.paginationStatus) {
      return;
    }

    if (totalGroups <= state.pageSize) {
      hidePagination();
      return;
    }

    const firstVisible = startIndex + 1;
    const lastVisible = startIndex + visibleGroups.length;
    const visibleUpdates = visibleGroups.reduce(function (total, group) {
      return total + group.totalEntries;
    }, 0);

    elements.paginationControls.hidden = false;
    elements.paginationStatus.textContent =
      `Dates ${firstVisible}–${lastVisible} of ${totalGroups} · ${visibleUpdates} shown / ${totalEntries} updates · Page ${state.currentPage} of ${totalPages}`;

    elements.previousPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= totalPages;
  }

  function hidePagination() {
    if (elements.paginationControls) {
      elements.paginationControls.hidden = true;
    }
  }

  function changeArchivePage(nextPage) {
    const groups = groupEntriesByDate(getFilteredEntries());
    const totalPages = Math.max(1, Math.ceil(groups.length / state.pageSize));
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

    return entries
      .filter(function (entry) {
        return state.audienceFilter === "all" || entry.audience === state.audienceFilter;
      })
      .filter(function (entry) {
        if (state.activeTag === "All changes") {
          return true;
        }

        return entry.tags.some(function (tag) {
          return tag.toLowerCase() === state.activeTag.toLowerCase();
        });
      })
      .sort(function (a, b) {
        const first = parseDate(a.date);
        const second = parseDate(b.date);
        return state.sortOrder === "oldest" ? first - second : second - first;
      });
  }

  function groupEntriesByDate(entries) {
    const groupsByDate = new Map();

    entries.forEach(function (entry) {
      const dateKey = entry.date || "date-unknown";

      if (!groupsByDate.has(dateKey)) {
        groupsByDate.set(dateKey, {
          date: entry.date,
          datePrecision: entry.datePrecision || "day",
          timestamp: parseDate(entry.date),
          accent: entry.accent,
          colourMode: entry.colourMode,
          palette: entry.palette,
          product: [],
          developer: [],
          totalEntries: 0
        });
      }

      const group = groupsByDate.get(dateKey);
      const audience = entry.audience === "developer" ? "developer" : "product";
      group[audience].push(entry);
      group.totalEntries += 1;
    });

    return Array.from(groupsByDate.values()).sort(function (first, second) {
      return state.sortOrder === "oldest"
        ? first.timestamp - second.timestamp
        : second.timestamp - first.timestamp;
    });
  }

  function createFeedWarning(provider) {
    const errors = state.loadErrorsByProvider.get(provider.id) || [];
    const visibleErrors = errors.filter(function (error) {
      return state.audienceFilter === "all" || error.audience === state.audienceFilter;
    });

    if (!visibleErrors.length) {
      return null;
    }

    const warning = document.createElement("section");
    warning.className = "feedWarning";
    warning.setAttribute("role", "status");

    const title = document.createElement("strong");
    title.textContent = "Some changelog feeds could not be loaded.";

    const detail = document.createElement("span");
    detail.textContent = visibleErrors
      .map(function (error) {
        const label = error.audience === "developer" ? "Developer" : "Product";
        return `${label}: ${error.message}`;
      })
      .join(" ");

    warning.append(title, detail);
    return warning;
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

  function createDateGroup(group) {
    const article = document.createElement("article");
    article.className = "changeRow changeDateGroup";
    applyProviderTheme(article, group);

    const safeDate = (group.date || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
    const bodyId = `date-group-body-${safeDate}`;
    const preview = getDateGroupPreview(group);

    const header = document.createElement("header");
    header.className = "dateGroupHeader";

    const headerMain = document.createElement("div");
    headerMain.className = "dateGroupHeaderMain";

    const meta = document.createElement("div");
    meta.className = "changeMeta dateGroupMeta";

    const marker = document.createElement("span");
    marker.className = "changeMarker";
    marker.setAttribute("aria-hidden", "true");

    const date = document.createElement("time");
    date.className = "changeDate dateGroupDate";
    date.dateTime = group.date || "";
    date.textContent = formatDate(group.date, group.datePrecision);

    const count = document.createElement("span");
    count.className = "dateGroupCount";
    count.textContent = `${group.totalEntries} update${group.totalEntries === 1 ? "" : "s"}`;

    meta.append(marker, date, count);

    const audienceStrip = createAudienceStrip(group);

    const previewContent = document.createElement("div");
    previewContent.className = "dateGroupPreview";

    const previewTitle = document.createElement("h3");
    previewTitle.className = "changeTitle dateGroupPreviewTitle";
    previewTitle.textContent = preview.title;

    const previewTags = document.createElement("div");
    previewTags.className = "changeTags dateGroupPreviewTags";

    preview.tags.forEach(function (tagText) {
      const tag = document.createElement("span");
      tag.className = "changeTag";
      tag.textContent = tagText;
      previewTags.appendChild(tag);
    });

    previewContent.appendChild(previewTitle);

    if (preview.note) {
      const note = document.createElement("p");
      note.className = "dateGroupPreviewNote";
      note.textContent = preview.note;
      previewContent.appendChild(note);
    }

    if (preview.tags.length) {
      previewContent.appendChild(previewTags);
    }

    headerMain.append(meta, audienceStrip, previewContent);

    const actions = document.createElement("div");
    actions.className = "changeActions dateGroupActions";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sourceUnavailable changeExpandToggle";
    toggle.textContent = "{}";
    toggle.title = "Expand this date";
    toggle.setAttribute(
      "aria-label",
      `Expand updates for ${formatDate(group.date, group.datePrecision)}`
    );
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", bodyId);
    toggle.addEventListener("click", function () {
      toggleChangeRow(article);
    });

    actions.appendChild(toggle);
    header.append(headerMain, actions);

    const body = document.createElement("div");
    body.id = bodyId;
    body.className = "dateGroupBody";
    body.setAttribute("aria-hidden", "true");

    const sections = [];

    if (group.product.length) {
      sections.push(createAudienceSection("product", group.product));
    }

    if (group.developer.length) {
      sections.push(createAudienceSection("developer", group.developer));
    }

    sections.forEach(function (section, index) {
      if (index > 0) {
        const divider = document.createElement("div");
        divider.className = "audienceDivider";
        divider.setAttribute("aria-hidden", "true");
        body.appendChild(divider);
      }

      body.appendChild(section);
    });

    article.append(header, body);

    // Clicking anywhere non-interactive on the date card expands all updates for that date.
    article.addEventListener("click", function (event) {
      if (event.target.closest("button, a, input, select, textarea, label")) {
        return;
      }

      toggleChangeRow(article);
    });

    return article;
  }

  function createAudienceStrip(group) {
    const strip = document.createElement("div");
    strip.className = "dateGroupAudienceStrip";
    strip.setAttribute("aria-label", "Update audiences");

    if (group.product.length) {
      strip.appendChild(createAudienceBadge("product", group.product.length));
    }

    if (group.developer.length) {
      strip.appendChild(createAudienceBadge("developer", group.developer.length));
    }

    return strip;
  }

  function createAudienceBadge(audience, count) {
    const badge = document.createElement("span");
    badge.className = `dateGroupAudienceBadge ${audience}AudienceBadge`;

    const icon = document.createElement("span");
    icon.className = "audienceIcon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = audience === "developer" ? "</>" : "●";

    const label = document.createElement("strong");
    label.textContent = audience === "developer" ? "Developer" : "Product";

    const total = document.createElement("span");
    total.className = "dateGroupAudienceCount";
    total.textContent = String(count);

    badge.append(icon, label, total);
    return badge;
  }

  function getDateGroupPreview(group) {
    const hasProduct = group.product.length > 0;
    const entries = hasProduct ? group.product : group.developer;
    const primary = entries[0];

    if (!primary) {
      return {
        title: "Update details",
        note: "",
        tags: []
      };
    }

    const hiddenCount = group.totalEntries - 1;
    const tags = Array.from(
      new Set(
        entries.flatMap(function (entry) {
          return Array.isArray(entry.tags) ? entry.tags : [];
        })
      )
    ).slice(0, 3);

    if (hasProduct) {
      return {
        title: primary.title,
        note: hiddenCount > 0
          ? `${hiddenCount} more update${hiddenCount === 1 ? "" : "s"} available when expanded.`
          : "",
        tags
      };
    }

    return {
      title: createDeveloperGroupTitle(group.developer),
      note: group.developer.length > 1
        ? `${group.developer.length} developer releases grouped for this date.`
        : "",
      tags
    };
  }

  function createDeveloperGroupTitle(entries) {
    if (!entries.length) {
      return "Developer updates";
    }

    if (entries.length === 1) {
      return entries[0].title;
    }

    const titles = entries.map(function (entry) {
      return String(entry.title || "").trim();
    });
    const combined = titles.join(" ").toLowerCase();

    if (titles.every(function (title) {
      return /^deprecation announcement\b/i.test(title);
    })) {
      return "Deprecation announcements";
    }

    if (titles.every(function (title) {
      return /^deprecated\b/i.test(title);
    }) || combined.includes("deprecat")) {
      return "Developer deprecations";
    }

    if (titles.every(function (title) {
      return /^new\b|^introduc|^launch|^releas|^added\b/i.test(title);
    })) {
      return "New developer releases";
    }

    if (combined.includes("security") || combined.includes("safety")) {
      return "Developer security and safety updates";
    }

    return `${entries.length} developer updates`;
  }

  function createAudienceSection(audience, entries) {
    const section = document.createElement("section");
    section.className = `audienceSection ${audience}Section`;
    section.dataset.audience = audience;

    const heading = document.createElement("div");
    heading.className = "audienceSectionHeader";

    const icon = document.createElement("span");
    icon.className = "audienceIcon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = audience === "developer" ? "</>" : "●";

    const label = document.createElement("strong");
    label.textContent = audience === "developer" ? "Developer" : "Product";

    const count = document.createElement("span");
    count.textContent = `${entries.length} release${entries.length === 1 ? "" : "s"}`;

    heading.append(icon, label, count);
    section.appendChild(heading);

    const updates = document.createElement("div");
    updates.className = "groupedUpdates";

    entries.forEach(function (entry) {
      updates.appendChild(createGroupedUpdate(entry));
    });

    section.appendChild(updates);
    return section;
  }

  function createGroupedUpdate(entry) {
    const update = document.createElement("article");
    update.className = "groupedUpdate";

    const content = document.createElement("div");
    content.className = "groupedUpdateContent";

    const title = document.createElement("h3");
    title.className = "changeTitle groupedUpdateTitle";
    title.textContent = entry.title;

    const safeEntryId = `${entry.providerId}-${entry.audience}-${entry.id}`
      .replace(/[^a-zA-Z0-9_-]/g, "-");

    const summary = document.createElement("p");
    summary.id = `change-summary-${safeEntryId}`;
    summary.className = "changeSummary groupedUpdateSummary";
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
    update.appendChild(content);

    if (isSafeHttpUrl(entry.sourceUrl)) {
      const link = document.createElement("a");
      link.className = "sourceLink groupedSourceLink";
      link.href = entry.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "↗";
      link.title = "Open official changelog source";
      link.setAttribute("aria-label", `Open official source for ${entry.title}`);
      update.appendChild(link);
    }

    return update;
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
    const body = article.querySelector(".dateGroupBody");

    /*
    * Expanded styles must be applied before measuring.
    * The temporary large value allows all summaries to reveal so that
    * body.scrollHeight returns the actual complete content height.
    */
    if (expanded) {
      article.style.setProperty("--summary-expanded-height", "100000px");
      article.classList.add("isExpanded");

      if (body) {
        body.setAttribute("aria-hidden", "false");

        window.requestAnimationFrame(function () {
          const completeHeight = Math.max(320, body.scrollHeight + 64);

          article.style.setProperty(
            "--summary-expanded-height",
            `${completeHeight}px`
          );
        });
      }
    } else {
      article.classList.remove("isExpanded");
      article.style.removeProperty("--summary-expanded-height");

      if (body) {
        body.setAttribute("aria-hidden", "true");
      }
    }

    const toggle = article.querySelector(".changeExpandToggle");

    if (!toggle) {
      return;
    }

    toggle.textContent = expanded ? "{...}" : "{}";
    toggle.title = expanded ? "Collapse this date" : "Expand this date";
    toggle.setAttribute("aria-expanded", String(expanded));

    const date = article.querySelector(".dateGroupDate");
    const dateText = date ? date.textContent : "this date";

    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Collapse" : "Expand"} updates for ${dateText}`
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

  function formatDate(value, precision = "day") {
    const timestamp = Date.parse(value || "");

    if (Number.isNaN(timestamp)) {
      return "Date unknown";
    }

    if (precision === "month") {
      return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(timestamp));
    }

    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(timestamp));
  }

  function createNoDataMarkup(provider) {
    const providerName = provider ? provider.product || provider.name : "this AI";
    const allEntries = provider
      ? state.entriesByProvider.get(provider.id) || []
      : [];
    const feeds = provider ? getProviderFeeds(provider) : [];
    const configuredAudiences = new Set(feeds.map(function (feed) {
      return feed.audience;
    }));
    const errors = provider
      ? state.loadErrorsByProvider.get(provider.id) || []
      : [];
    const visibleErrors = errors.filter(function (error) {
      return state.audienceFilter === "all" || error.audience === state.audienceFilter;
    });

    let message = `No changelog data is currently available for ${providerName}.`;

    if (
      state.audienceFilter !== "all" &&
      !configuredAudiences.has(state.audienceFilter)
    ) {
      const label = state.audienceFilter === "developer" ? "Developer" : "Product";
      message = `No ${label} changelog endpoint is configured for ${providerName} yet.`;
    } else if (visibleErrors.length) {
      message = visibleErrors
        .map(function (error) {
          const label = error.audience === "developer" ? "Developer" : "Product";
          const endpoint = error.endpoint ? ` from ${error.endpoint}` : "";
          return `${label} data could not be loaded${endpoint}. ${error.message}`;
        })
        .join(" ");
    } else if (allEntries.length) {
      const audienceLabel = state.audienceFilter === "all"
        ? ""
        : `${state.audienceFilter === "developer" ? "Developer" : "Product"} `;
      const tagLabel = state.activeTag === "All changes"
        ? ""
        : `${state.activeTag} `;
      message = `No ${audienceLabel}${tagLabel}updates match the current filters.`;
    }

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
