const STORAGE_KEYS = {
  selectedDemoId: "rankacy.selectedDemoId",
  selectedHighlightId: "rankacy.selectedHighlightId",
  selectedKillId: "rankacy.selectedKillId",
  selectedKillSnapshot: "rankacy.selectedKillSnapshot",
  resolutionId: "rankacy.resolutionId",
  fpsId: "rankacy.fpsId",
};

const state = {
  health: null,
  dashboard: null,
  demoWorkspace: null,
  highlightDetail: null,
  cost: null,
  selectedDemoId: null,
  selectedHighlightId: null,
  selectedKillId: null,
  selectedKillSnapshot: null,
  demoPlayersPage: 1,
  demoPlayersPageSize: 10,
  demoKillsPage: 1,
  demoKillsPageSize: 10,
  lastAction: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  restoreState();
  wireEvents();
  ensureArrayEditors();
  await refreshHealth();

  if (state.health?.token_configured) {
    try {
      await refreshDashboard({ silent: true });
    } catch (error) {
      renderAll();
    }
  } else {
    renderAll();
  }
});

function wireEvents() {
  const renderProfileForm = byId("render-profile-form");
  if (renderProfileForm) {
    renderProfileForm.addEventListener("change", async () => {
      persistProfileControls();
      state.cost = null;
      renderCost();
    });
  }

  const uploadForm = byId("upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fileInput = byId("demo-file");
      const file = fileInput?.files?.[0];
      if (!file) {
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const generateAutoHighlight = byId("generate-auto-highlight")?.checked ?? false;
      formData.append("generate_auto_highlight", String(generateAutoHighlight));

      const profile = getRenderProfile();
      if (generateAutoHighlight && profile.resolutionId && profile.fpsId) {
        formData.append("resolution_id", String(profile.resolutionId));
        formData.append("fps_id", String(profile.fpsId));
      }

      await runAction("Upload demo", async () => {
        const response = await fetchJson("/api/public/v1/demos/upload", {
          method: "POST",
          body: formData,
        });
        state.selectedDemoId = response.demo_id;
        persistSelectionState();
        uploadForm.reset();
        if (byId("generate-auto-highlight")) {
          byId("generate-auto-highlight").checked = false;
        }
        await refreshDashboard({ preserveSelection: true });
      });
    });
  }

  const standardForm = byId("standard-highlight-form");
  if (standardForm) {
    standardForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedDemoId) {
        return;
      }

      const formData = new FormData(standardForm);
      const profile = getRenderProfile();
      const payload = {
        demo_id: state.selectedDemoId,
        resolution_id: profile.resolutionId,
        fps_id: profile.fpsId,
        title: optionalString(formData.get("title")),
        intro: formData.get("intro"),
        use_transition: formData.get("use_transition") === "on",
      };

      await queueHighlight("/api/public/v1/highlights", payload, "Queue automatic highlight");
      standardForm.reset();
    });
  }

  const ticksForm = byId("ticks-highlight-form");
  if (ticksForm) {
    ticksForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedDemoId) {
        return;
      }

      try {
        const formData = new FormData(ticksForm);
        const profile = getRenderProfile();
        const ticks = collectTickRanges();
        const payload = {
          demo_id: state.selectedDemoId,
          resolution_id: profile.resolutionId,
          fps_id: profile.fpsId,
          title: optionalString(formData.get("title")),
          show_tick: formData.get("show_tick") === "on",
          ticks,
        };

        await queueHighlight("/api/public/v1/highlights/by-ticks", payload, "Queue highlight by ticks");
        ticksForm.reset();
        ensureArrayEditors();
      } catch (error) {
        showToast(error.message || "Invalid tick range data", "error");
        renderAll();
      }
    });
  }

  const killForm = byId("kill-highlight-form");
  if (killForm) {
    killForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedDemoId) {
        return;
      }

      try {
        const formData = new FormData(killForm);
        const profile = getRenderProfile();
        const demoKillIds = collectKillIds();
        const payload = {
          demo_id: state.selectedDemoId,
          resolution_id: profile.resolutionId,
          fps_id: profile.fpsId,
          title: optionalString(formData.get("title")),
          demo_kill_ids: demoKillIds,
          pre_ticks: Number(formData.get("pre_ticks") || 192),
          post_ticks: Number(formData.get("post_ticks") || 192),
          speed: Number(formData.get("speed")),
          show_tick: formData.get("show_tick") === "on",
        };

        await queueHighlight("/api/public/v1/highlights/by-kill", payload, "Queue highlight by kill");
        killForm.reset();
        ensureArrayEditors();
      } catch (error) {
        showToast(error.message || "Invalid kill ID data", "error");
        renderAll();
      }
    });
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    if (action === "refresh-health") {
      try {
        await refreshHealth();
        if (state.health?.token_configured) {
          await refreshDashboard({ silent: true });
        }
      } catch (error) {
        renderAll();
      }
      return;
    }

    if (action === "refresh-dashboard" || action === "refresh-demos" || action === "refresh-highlights" || action === "refresh-webhooks") {
      try {
        await refreshDashboard();
      } catch (error) {
        renderAll();
      }
      return;
    }

    if (action === "refresh-transactions") {
      try {
        await refreshTransactions(false);
      } catch (error) {
        console.log("Failed to refresh transactions:", error);
      }
      renderAll();
      return;
    }

    if (action === "estimate-cost") {
      try {
        await refreshCost(false);
      } catch (error) {
        console.log("Failed to estimate cost:", error);
      }
      renderAll();
      return;
    }

    if (action === "add-tick-range") {
      appendTickRangeRow();
      return;
    }

    if (action === "remove-tick-range") {
      target.closest(".array-item")?.remove();
      ensureTickRangeEditor();
      return;
    }

    if (action === "add-kill-id") {
      appendKillIdRow();
      return;
    }

    if (action === "remove-kill-id") {
      target.closest(".array-item")?.remove();
      ensureKillIdEditor();
      return;
    }

    if (action === "select-demo") {
      const nextDemoId = Number(target.dataset.demoId);
      const demoChanged = nextDemoId !== state.selectedDemoId;
      state.selectedDemoId = nextDemoId;
      if (demoChanged) {
        clearSelectedKillSelection();
        resetDemoWorkspacePagination();
      }
      persistSelectionState();
      try {
        await refreshDemoWorkspace(false);
      } catch (error) {
        console.log("Failed to select demo:", error);
      }
      renderAll();
      return;
    }

    if (action === "select-highlight") {
      state.selectedHighlightId = Number(target.dataset.highlightId);
      persistSelectionState();
      try {
        await refreshHighlightDetail(false);
      } catch (error) {
        console.log("Failed to select highlight:", error);
      }
      renderAll();
      return;
    }

    if (action === "select-kill") {
      state.selectedKillId = Number(target.dataset.killId);
      const selected = state.demoWorkspace?.kills?.items?.find((item) => item.demo_kill_id === state.selectedKillId) ?? null;
      state.selectedKillSnapshot = selected ? makeKillSnapshot(selected) : state.selectedKillSnapshot;
      persistSelectionState();
      seedKillForms();
      renderAll();
      return;
    }

    if (action === "previous-players-page" || action === "next-players-page") {
      const totalItems = state.demoWorkspace?.players?.items?.length ?? 0;
      const totalPages = pageCount(totalItems, state.demoPlayersPageSize);
      if (!totalPages) {
        return;
      }

      const delta = action === "previous-players-page" ? -1 : 1;
      state.demoPlayersPage = clampPage(state.demoPlayersPage + delta, totalPages);
      renderDemoWorkspace();
      return;
    }

    if (action === "previous-kills-page" || action === "next-kills-page") {
      const totalItems = state.demoWorkspace?.kills?.pagination?.total ?? 0;
      const totalPages = pageCount(totalItems, state.demoKillsPageSize);
      if (!totalPages) {
        return;
      }

      const delta = action === "previous-kills-page" ? -1 : 1;
      state.demoKillsPage = clampPage(state.demoKillsPage + delta, totalPages);
      try {
        await refreshDemoWorkspace(false);
      } catch (error) {
        console.log("Failed to refresh demo workspace:", error);
        renderAll();
      }
      return;
    }

    if (action === "seed-ticks-from-kill" || action === "seed-kill-id") {
      seedKillForms(action);
      renderAll();
      return;
    }

    if (action === "delete-highlight") {
      if (!state.selectedHighlightId) {
        return;
      }

      await runAction("Delete highlight", async () => {
        await fetchJson(`/api/public/v1/highlights/${state.selectedHighlightId}`, { method: "DELETE" });
        state.highlightDetail = null;
        state.selectedHighlightId = null;
        persistSelectionState();
        await refreshDashboard({ preserveSelection: false });
      });
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target.closest('[data-action][tabindex="0"]');
    if (!target) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      target.click();
    }
  });
}

function bindIfPresent(id, eventName, handler) {
  const element = byId(id);
  if (element) {
    element.addEventListener(eventName, handler);
  }
}

async function queueHighlight(url, payload, label) {
  if (!payload.resolution_id || !payload.fps_id) {
    showToast("Select a resolution and FPS in the render profile first.", "error");
    return;
  }

  await runAction(label, async () => {
    const response = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.selectedHighlightId = response.highlight_id;
    persistSelectionState();
    await refreshDashboard({ preserveSelection: true });
  });
}

async function refreshHealth() {
  state.health = await fetchJson("/showcase/health", {}, "showcase health");
  renderAll();
}

async function refreshDashboard({ preserveSelection = true, silent = false } = {}) {
  const [demos, highlights, resolutions, fpsOptions, credit, transactions, webhookEvents] = await Promise.all([
    fetchJson("/api/public/v1/demos?limit=10&offset=0", {}, silent ? null : "/api/public/v1/demos"),
    fetchJson("/api/public/v1/highlights?limit=10&offset=0", {}, silent ? null : "/api/public/v1/highlights"),
    fetchJson("/api/public/v1/highlights/resolutions", {}, silent ? null : "/api/public/v1/highlights/resolutions"),
    fetchJson("/api/public/v1/highlights/fps", {}, silent ? null : "/api/public/v1/highlights/fps"),
    fetchJson("/api/public/v1/me/credit", {}, silent ? null : "/api/public/v1/me/credit"),
    fetchJson("/api/public/v1/me/transactions?limit=10&offset=0", {}, silent ? null : "/api/public/v1/me/transactions"),
    fetchJson("/showcase/webhook-events?limit=100", {}, silent ? null : "showcase webhook events"),
  ]);

  state.dashboard = {
    demos,
    highlights,
    resolutions,
    fps_options: fpsOptions,
    credit,
    transactions,
    webhook_events: webhookEvents,
  };
  syncSelections({ preserveSelection });
  populateRenderProfile();
  await Promise.all([refreshDemoWorkspace(silent), refreshHighlightDetail(silent)]);
  renderAll();
}

async function refreshDemoWorkspace(silent = true) {
  if (!state.selectedDemoId || !state.health?.token_configured) {
    state.demoWorkspace = null;
    resetDemoWorkspacePagination();
    if (!state.selectedDemoId) {
      clearSelectedKillSelection();
    }
    renderAll();
    return;
  }

  const killOffset = (state.demoKillsPage - 1) * state.demoKillsPageSize;
  const [demo, kills, players] = await Promise.all([
    fetchJson(`/api/public/v1/demos/${state.selectedDemoId}`, {}, silent ? null : `/api/public/v1/demos/${state.selectedDemoId}`),
    fetchJson(
      `/api/public/v1/demos/${state.selectedDemoId}/kills?limit=${state.demoKillsPageSize}&offset=${killOffset}`,
      {},
      silent ? null : `/api/public/v1/demos/${state.selectedDemoId}/kills`,
    ),
    fetchJson(
      `/api/public/v1/demos/${state.selectedDemoId}/players`,
      {},
      silent ? null : `/api/public/v1/demos/${state.selectedDemoId}/players`,
    ),
  ]);

  const totalKillPages = pageCount(kills.pagination?.total ?? 0, state.demoKillsPageSize);
  if (totalKillPages && state.demoKillsPage > totalKillPages) {
    state.demoKillsPage = totalKillPages;
    return refreshDemoWorkspace(silent);
  }

  const totalPlayerPages = pageCount(players.items.length, state.demoPlayersPageSize);
  if (totalPlayerPages && state.demoPlayersPage > totalPlayerPages) {
    state.demoPlayersPage = totalPlayerPages;
  }

  if (state.selectedKillId) {
    const selected = kills.items.find((item) => item.demo_kill_id === state.selectedKillId) ?? null;
    if (selected) {
      state.selectedKillSnapshot = makeKillSnapshot(selected);
    }
  }

  state.demoWorkspace = { demo, kills, players };
  renderAll();
}

async function refreshHighlightDetail(silent = true) {
  if (!state.selectedHighlightId || !state.health?.token_configured) {
    state.highlightDetail = null;
    renderAll();
    return;
  }

  state.highlightDetail = await fetchJson(
    `/api/public/v1/highlights/${state.selectedHighlightId}`,
    {},
    silent ? null : `/api/public/v1/highlights/${state.selectedHighlightId}`,
  );
  renderAll();
}

async function refreshCost(silent = true) {
  const profile = getRenderProfile();
  if (!profile.resolutionId || !profile.fpsId || !state.health?.token_configured) {
    state.cost = null;
    renderCost();
    return;
  }

  state.cost = await fetchJson(
    `/api/public/v1/highlights/cost?resolution_id=${profile.resolutionId}&fps_id=${profile.fpsId}`,
    {},
    silent ? null : "/api/public/v1/highlights/cost",
  );
  renderCost();
}

async function refreshTransactions(silent = true) {
  if (!state.health?.token_configured) {
    renderTransactions();
    return;
  }

  const [credit, transactions] = await Promise.all([
    fetchJson("/api/public/v1/me/credit", {}, silent ? null : "/api/public/v1/me/credit"),
    fetchJson("/api/public/v1/me/transactions?limit=10&offset=0", {}, silent ? null : "/api/public/v1/me/transactions"),
  ]);

  state.dashboard = {
    ...(state.dashboard ?? {}),
    credit,
    transactions,
  };
  renderTransactions();
}

function restoreState() {
  state.selectedDemoId = getStoredNumber(STORAGE_KEYS.selectedDemoId);
  state.selectedHighlightId = getStoredNumber(STORAGE_KEYS.selectedHighlightId);
  state.selectedKillId = getStoredNumber(STORAGE_KEYS.selectedKillId);
  state.selectedKillSnapshot = getStoredJson(STORAGE_KEYS.selectedKillSnapshot);
}

function syncSelections({ preserveSelection }) {
  const previousDemoId = state.selectedDemoId;
  const demos = state.dashboard?.demos?.items ?? [];
  const highlights = state.dashboard?.highlights?.items ?? [];

  const preferredDemoId = preserveSelection ? state.selectedDemoId ?? getStoredNumber(STORAGE_KEYS.selectedDemoId) : null;
  const preferredHighlightId = preserveSelection ? state.selectedHighlightId ?? getStoredNumber(STORAGE_KEYS.selectedHighlightId) : null;

  state.selectedDemoId = resolveSelection(demos, preferredDemoId);
  state.selectedHighlightId = resolveSelection(highlights, preferredHighlightId);

  if (state.selectedDemoId !== previousDemoId) {
    resetDemoWorkspacePagination();
    clearSelectedKillSelection();
  }

  if (!state.selectedDemoId || state.selectedKillSnapshot?.demo_id !== state.selectedDemoId) {
    clearSelectedKillSelection();
  }

  persistSelectionState();
}

function resolveSelection(items, preferredId) {
  if (preferredId && items.some((item) => item.id === preferredId)) {
    return preferredId;
  }
  return items[0]?.id ?? null;
}

function populateRenderProfile() {
  const resolutions = state.dashboard?.resolutions?.items ?? [];
  const fpsOptions = state.dashboard?.fps_options?.items ?? [];
  fillSelect("resolution-id", resolutions.map((item) => ({ value: item.id, label: `${item.name} (${item.width}x${item.height})` })), STORAGE_KEYS.resolutionId);
  fillSelect("fps-id", fpsOptions.map((item) => ({ value: item.id, label: `${item.name} (${item.fps})` })), STORAGE_KEYS.fpsId);
  persistProfileControls();
}

function fillSelect(id, options, storageKey) {
  const select = byId(id);
  if (!select) {
    return;
  }

  const currentValue = select.value || localStorage.getItem(storageKey) || "";
  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
    .join("");

  if (options.some((option) => String(option.value) === currentValue)) {
    select.value = currentValue;
  } else if (options[0]) {
    select.value = String(options[0].value);
  }
}

function getRenderProfile() {
  const resolutionId = Number(byId("resolution-id")?.value || localStorage.getItem(STORAGE_KEYS.resolutionId) || 0) || null;
  const fpsId = Number(byId("fps-id")?.value || localStorage.getItem(STORAGE_KEYS.fpsId) || 0) || null;
  return { resolutionId, fpsId };
}

function persistProfileControls() {
  const resolution = byId("resolution-id");
  const fps = byId("fps-id");

  if (resolution?.value) {
    localStorage.setItem(STORAGE_KEYS.resolutionId, resolution.value);
  }
  if (fps?.value) {
    localStorage.setItem(STORAGE_KEYS.fpsId, fps.value);
  }
}

function persistSelectionState() {
  setStoredNumber(STORAGE_KEYS.selectedDemoId, state.selectedDemoId);
  setStoredNumber(STORAGE_KEYS.selectedHighlightId, state.selectedHighlightId);
  setStoredNumber(STORAGE_KEYS.selectedKillId, state.selectedKillId);
  setStoredJson(STORAGE_KEYS.selectedKillSnapshot, state.selectedKillSnapshot);
}

function ensureArrayEditors() {
  ensureTickRangeEditor();
  ensureKillIdEditor();
}

function ensureTickRangeEditor() {
  if (!byId("tick-range-list")) {
    return;
  }

  if (!document.querySelector("#tick-range-list .array-item")) {
    appendTickRangeRow();
  }
}

function ensureKillIdEditor() {
  if (!byId("kill-id-list")) {
    return;
  }

  if (!document.querySelector("#kill-id-list .array-item")) {
    appendKillIdRow();
  }
}

function appendTickRangeRow(values = {}) {
  const template = byId("tick-range-template");
  const container = byId("tick-range-list");
  if (!template || !container) {
    return;
  }

  const item = template.content.firstElementChild.cloneNode(true);
  item.querySelector('[data-field="start_tick"]').value = values.start_tick ?? "";
  item.querySelector('[data-field="end_tick"]').value = values.end_tick ?? "";
  item.querySelector('[data-field="steam_id"]').value = values.steam_id ?? "";
  item.querySelector('[data-field="speed"]').value = String(values.speed ?? 1);
  container.appendChild(item);
}

function appendKillIdRow(value = "") {
  const template = byId("kill-id-template");
  const container = byId("kill-id-list");
  if (!template || !container) {
    return;
  }

  const item = template.content.firstElementChild.cloneNode(true);
  item.querySelector('[data-field="demo_kill_id"]').value = value;
  container.appendChild(item);
}

function clearSelectedKillSelection() {
  state.selectedKillId = null;
  state.selectedKillSnapshot = null;
}

function resetDemoWorkspacePagination() {
  state.demoPlayersPage = 1;
  state.demoKillsPage = 1;
}

function makeKillSnapshot(kill) {
  return {
    demo_id: kill.demo_id,
    demo_kill_id: kill.demo_kill_id,
    tick: kill.tick,
    attacker_steam_id: kill.attacker_steam_id ?? null,
  };
}

function seedKillForms(action) {
  const kill = selectedKill();
  if (!kill) {
    return;
  }

  if (action === "seed-ticks-from-kill") {
    appendTickRangeRow({
      start_tick: kill.tick,
      end_tick: kill.tick,
      steam_id: kill.attacker_steam_id ?? "",
      speed: 1,
    });
    return;
  }

  if (action === "seed-kill-id") {
    const existingIds = collectKillIds({ allowEmpty: true });
    if (!existingIds.includes(kill.demo_kill_id)) {
      appendKillIdRow(String(kill.demo_kill_id));
    }
    return;
  }

}

function selectedKill() {
  return (
    state.demoWorkspace?.kills?.items?.find((item) => item.demo_kill_id === state.selectedKillId) ??
    (state.selectedKillSnapshot?.demo_id === state.selectedDemoId ? state.selectedKillSnapshot : null)
  );
}

function renderAll() {
  renderNavStatus();
  renderHealth();
  renderCost();
  renderOverview();
  renderDemos();
  renderDemoWorkspace();
  renderDemoProfileSummary();
  renderHighlights();
  renderHighlightDetail();
  renderTransactions();
  renderWebhooks();
  toggleActionButtons();
}

function renderNavStatus() {
  const pill = byId("nav-health-pill");
  if (!pill || !state.health) {
    return;
  }

  pill.textContent = state.health.token_configured ? "Token configured" : "Token missing";
  pill.className = `pill ${state.health.token_configured ? "success" : "warning"}`;
}

function renderHealth() {
  const container = byId("health-summary");
  if (!container) {
    return;
  }

  if (!state.health) {
    container.innerHTML = emptyState("Loading local health check...");
    return;
  }

  const statusClass = state.health.token_configured ? "success" : "warning";
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-box">
        <strong>Status</strong>
        <span class="pill ${statusClass}">${escapeHtml(state.health.status)}</span>
      </div>
      <div class="summary-box">
        <strong>Base URL</strong>
        <code>${escapeHtml(state.health.base_url)}</code>
      </div>
      <div class="summary-box">
        <strong>API Token</strong>
        <span>${escapeHtml(state.health.token_preview)}</span>
      </div>
    </div>
    <p class="muted">
      ${state.health.token_configured
        ? "The local proxy is ready and the showcase will call the Rankacy public API paths with your bearer token."
        : "Set RANKACY_TOKEN in your environment or .env file before using the live API."}
    </p>
  `;
}

function renderCost() {
  const container = byId("cost-summary");
  if (!container) {
    return;
  }

  const credit = state.dashboard?.credit;
  if (!state.health?.token_configured) {
    container.innerHTML = `<p class="muted">Cost preview appears after configuration.</p>`;
    return;
  }

  if (!state.cost) {
    container.innerHTML = `<p class="muted">Pick a resolution and FPS, then click <strong>Check highlight cost</strong> to call the pricing endpoint.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-box">
        <strong>Estimated Cost</strong>
        <span>${state.cost.cost} credits</span>
      </div>
      <div class="summary-box">
        <strong>Resolution Credit</strong>
        <span>${state.cost.resolution_credit}</span>
      </div>
      <div class="summary-box">
        <strong>FPS Multiplier</strong>
        <span>${state.cost.fps_multiplier}</span>
      </div>
      <div class="summary-box">
        <strong>Current Credit</strong>
        <span>${credit ? credit.credit : "n/a"}</span>
      </div>
    </div>
  `;
}

function renderDemoProfileSummary() {
  const container = byId("demo-render-profile-summary");
  if (!container) {
    return;
  }

  if (!state.dashboard) {
    container.innerHTML = `<p class="muted">Render profile details appear after the first dashboard load.</p>`;
    return;
  }

  const profile = getRenderProfile();
  const resolution = state.dashboard.resolutions.items.find((item) => item.id === profile.resolutionId) ?? null;
  const fps = state.dashboard.fps_options.items.find((item) => item.id === profile.fpsId) ?? null;

  if (!resolution || !fps) {
    container.innerHTML = `
      <p class="muted">
        Set a resolution and FPS on <a class="inline-button" href="/highlights">Highlights</a> before queueing a render from this page.
      </p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-box">
        <strong>Resolution</strong>
        <span>${escapeHtml(resolution.name)} (${resolution.width}x${resolution.height})</span>
      </div>
      <div class="summary-box">
        <strong>FPS</strong>
        <span>${escapeHtml(fps.name)} (${fps.fps})</span>
      </div>
      <div class="summary-box">
        <strong>Selected demo</strong>
        <span>${state.selectedDemoId ? `#${state.selectedDemoId}` : "none"}</span>
      </div>
    </div>
    <p class="muted">All highlight requests below use the stored render profile from the Highlights page.</p>
  `;
}


function renderOverview() {
  const stats = byId("overview-stats");
  if (stats) {
    if (!state.dashboard) {
      stats.innerHTML = emptyState("Workspace snapshot will appear after the first dashboard load.");
    } else {
      const latestDemo = state.dashboard.demos.items[0];
      const latestHighlight = state.dashboard.highlights.items[0];
      const latestWebhook = state.dashboard.webhook_events.items[0];
      stats.innerHTML = `
        <div class="summary-grid">
          <div class="summary-box">
            <strong>Total demos</strong>
            <span>${state.dashboard.demos.pagination.total}</span>
          </div>
          <div class="summary-box">
            <strong>Total highlights</strong>
            <span>${state.dashboard.highlights.pagination.total}</span>
          </div>
          <div class="summary-box">
            <strong>Current credit</strong>
            <span>${state.dashboard.credit.credit}</span>
          </div>
          <div class="summary-box">
            <strong>Recent webhook</strong>
            <span>${latestWebhook ? escapeHtml(latestWebhook.event_type) : "none yet"}</span>
          </div>
          <div class="summary-box">
            <strong>Latest demo</strong>
            <span>${latestDemo ? `#${latestDemo.id} ${escapeHtml(latestDemo.status)}` : "none"}</span>
          </div>
          <div class="summary-box">
            <strong>Latest highlight</strong>
            <span>${latestHighlight ? `#${latestHighlight.id} ${escapeHtml(latestHighlight.status)}` : "none"}</span>
          </div>
        </div>
      `;
    }
  }

  const recent = byId("overview-recent");
  if (recent) {
    if (!state.dashboard) {
      recent.innerHTML = emptyState("Recent activity appears after the first dashboard load.");
    } else {
      const latestDemo = state.dashboard.demos.items[0];
      const latestHighlight = state.dashboard.highlights.items[0];
      const latestWebhook = state.dashboard.webhook_events.items[0];
      recent.innerHTML = `
        <div class="summary-grid">
          <div class="summary-box">
            <strong>Newest demo</strong>
            <span>${latestDemo ? `#${latestDemo.id} on ${escapeHtml(latestDemo.map || "unknown map")}` : "none"}</span>
          </div>
          <div class="summary-box">
            <strong>Newest highlight</strong>
            <span>${latestHighlight ? escapeHtml(latestHighlight.title) : "none"}</span>
          </div>
          <div class="summary-box">
            <strong>Latest webhook event</strong>
            <span>${latestWebhook ? escapeHtml(shorten(latestWebhook.event_id, 28)) : "none"}</span>
          </div>
          <div class="summary-box">
            <strong>Recommended next step</strong>
            <span>${recommendNextStep()}</span>
          </div>
        </div>
      `;
    }
  }
}

function recommendNextStep() {
  if (!state.health?.token_configured) {
    return "Configure RANKACY_TOKEN locally.";
  }
  if (!state.dashboard?.demos?.items?.length) {
    return "Upload your first demo.";
  }
  if (state.demoWorkspace?.demo?.status !== "SUCCESS") {
    return "Wait for the selected demo to finish processing.";
  }
  if (!state.dashboard?.highlights?.items?.length) {
    return "Queue a render from the selected demo on Demos.";
  }
  return "Open Webhooks to confirm terminal events.";
}

function renderDemos() {
  const container = byId("demos-list");
  if (!container) {
    return;
  }

  const demos = state.dashboard?.demos?.items ?? [];
  if (!demos.length) {
    container.innerHTML = emptyState("No demos returned yet.");
    return;
  }

  container.innerHTML = `
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Map</th>
            <th>Upload</th>
            <th>Size</th>
            <th>Hash</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${demos
            .map(
              (demo) => `
                <tr
                  class="table-row-action ${demo.id === state.selectedDemoId ? "is-selected" : ""}"
                  data-action="select-demo"
                  data-demo-id="${demo.id}"
                  tabindex="0"
                  role="button"
                  aria-label="Open demo ${demo.id}"
                >
                  <td>#${demo.id}</td>
                  <td>${statusPill(demo.status)}</td>
                  <td>${escapeHtml(demo.map || "unknown")}</td>
                  <td>${escapeHtml(demo.upload_type || "n/a")}</td>
                  <td>${escapeHtml(formatBytes(demo.size))}</td>
                  <td><code>${escapeHtml(shorten(demo.hash, 16))}</code></td>
                  <td>${escapeHtml(demo.created_at || "n/a")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDemoWorkspace() {
  const summary = byId("demo-summary");
  const players = byId("players-list");
  const kills = byId("kills-list");
  const raw = byId("demo-raw");
  const status = byId("selected-demo-status");
  if (!summary || !players || !kills || !raw || !status) {
    return;
  }

  if (!state.demoWorkspace) {
    summary.innerHTML = emptyState("Select a demo to load detail, players, and kills.");
    players.innerHTML = "";
    kills.innerHTML = "";
    raw.textContent = "";
    status.outerHTML = statusPill("No demo selected", "secondary", "selected-demo-status");
    return;
  }

  const demo = state.demoWorkspace.demo;
  const playerItems = state.demoWorkspace.players.items;
  const playerPage = clampPage(state.demoPlayersPage, pageCount(playerItems.length, state.demoPlayersPageSize));
  const pagedPlayers = slicePage(playerItems, playerPage, state.demoPlayersPageSize);
  const playerRange = pageRange(playerItems.length, playerPage, state.demoPlayersPageSize);
  const killsPage = clampPage(state.demoKillsPage, pageCount(state.demoWorkspace.kills.pagination.total, state.demoKillsPageSize));
  const killRange = pageRange(state.demoWorkspace.kills.pagination.total, killsPage, state.demoKillsPageSize);

  state.demoPlayersPage = playerPage;
  state.demoKillsPage = killsPage;
  status.outerHTML = statusPill(demo.status, statusVariant(demo.status), "selected-demo-status");
  summary.innerHTML = `
    <div class="summary-grid">
      <div class="summary-box">
        <strong>Demo ID</strong>
        <span>#${demo.id}</span>
      </div>
      <div class="summary-box">
        <strong>Map</strong>
        <span>${escapeHtml(demo.map || "unknown")}</span>
      </div>
      <div class="summary-box">
        <strong>Score</strong>
        <span>${demo.team_1_score ?? "-"} : ${demo.team_2_score ?? "-"}</span>
      </div>
      <div class="summary-box">
        <strong>Hash</strong>
        <code>${escapeHtml(shorten(demo.hash, 20))}</code>
      </div>
      <div class="summary-box">
        <strong>Upload</strong>
        <span>${escapeHtml(demo.upload_type || "n/a")}</span>
      </div>
      <div class="summary-box">
        <strong>Size</strong>
        <span>${escapeHtml(formatBytes(demo.size))}</span>
      </div>
    </div>
    <p class="muted">
      Kills and players are only meaningful after the demo reaches <code>SUCCESS</code>. Use refresh when you want to reload parsed data.
    </p>
  `;

  players.innerHTML = playerItems.length
    ? `
      <div class="workspace-section-head">
        <div class="meta-line">
          <code>${playerRange.label}</code>
          <code>${playerItems.length} total players</code>
        </div>
        <div class="pager">
          <button class="mini-button" data-action="previous-players-page" type="button" ${playerPage <= 1 ? "disabled" : ""}>Previous</button>
          <span class="muted">Page ${playerPage} of ${pageCount(playerItems.length, state.demoPlayersPageSize)}</span>
          <button
            class="mini-button"
            data-action="next-players-page"
            type="button"
            ${playerPage >= pageCount(playerItems.length, state.demoPlayersPageSize) ? "disabled" : ""}
          >
            Next
          </button>
        </div>
      </div>
      <div class="table-shell">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Steam ID</th></tr>
          </thead>
          <tbody>
            ${pagedPlayers
              .map(
                (player) => `
                  <tr>
                    <td>${player.id}</td>
                    <td>${escapeHtml(player.player_name)}</td>
                    <td><code>${escapeHtml(player.steam_id)}</code></td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : emptyState("No players returned for this demo yet.");

  kills.innerHTML = state.demoWorkspace.kills.items.length
    ? `
      <div class="workspace-section-head">
        <div class="meta-line">
          <code>${killRange.label}</code>
          <code>${state.demoWorkspace.kills.pagination.total} total kills</code>
        </div>
        <div class="pager">
          <button class="mini-button" data-action="previous-kills-page" type="button" ${killsPage <= 1 ? "disabled" : ""}>Previous</button>
          <span class="muted">Page ${killsPage} of ${pageCount(state.demoWorkspace.kills.pagination.total, state.demoKillsPageSize)}</span>
          <button
            class="mini-button"
            data-action="next-kills-page"
            type="button"
            ${killsPage >= pageCount(state.demoWorkspace.kills.pagination.total, state.demoKillsPageSize) ? "disabled" : ""}
          >
            Next
          </button>
        </div>
      </div>
      <div class="table-shell">
        <table>
          <thead>
            <tr>
              <th>Kill ID</th>
              <th>Round</th>
              <th>Tick</th>
              <th>Attacker</th>
              <th>Victim</th>
              <th>Weapon</th>
            </tr>
          </thead>
          <tbody>
            ${state.demoWorkspace.kills.items
              .map(
                (kill) => `
                  <tr class="table-row-action ${kill.demo_kill_id === state.selectedKillId ? "is-selected" : ""}" data-action="select-kill" data-kill-id="${kill.demo_kill_id}" tabindex="0" role="button" aria-label="Select kill ${kill.demo_kill_id}">
                    <td>#${kill.demo_kill_id}</td>
                    <td>${kill.round}</td>
                    <td>${kill.tick}</td>
                    <td><code>${escapeHtml(kill.attacker_steam_id || "n/a")}</code></td>
                    <td><code>${escapeHtml(kill.victim_steam_id || "n/a")}</code></td>
                    <td>${escapeHtml(kill.weapon || "n/a")}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : emptyState("No kills returned for this demo yet.");

  raw.textContent = formatJson(state.demoWorkspace);
}

function renderHighlights() {
  const container = byId("highlights-list");
  if (!container) {
    return;
  }

  const highlights = state.dashboard?.highlights?.items ?? [];
  if (!highlights.length) {
    container.innerHTML = emptyState("No highlights queued yet.");
    return;
  }

  container.innerHTML = `
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Demo</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${highlights
            .map(
              (highlight) => `
                <tr
                  class="table-row-action ${highlight.id === state.selectedHighlightId ? "is-selected" : ""}"
                  data-action="select-highlight"
                  data-highlight-id="${highlight.id}"
                  tabindex="0"
                  role="button"
                  aria-label="Open highlight ${highlight.id}"
                >
                  <td>#${highlight.id}</td>
                  <td>${escapeHtml(highlight.title || "Untitled highlight")}</td>
                  <td>${statusPill(highlight.status)}</td>
                  <td>#${highlight.demo_id}</td>
                  <td>${escapeHtml(highlight.created_at || "n/a")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHighlightDetail() {
  const container = byId("highlight-summary");
  const raw = byId("highlight-raw");
  const deleteButton = byId("delete-highlight");
  if (!container || !raw || !deleteButton) {
    return;
  }

  if (!state.highlightDetail) {
    container.innerHTML = emptyState("Select a highlight to inspect processing detail.");
    raw.textContent = "";
    deleteButton.disabled = true;
    return;
  }

  deleteButton.disabled = false;
  const detail = state.highlightDetail;
  const clips = detail.containers || [];
  const videoUrl = detail.video_url ? escapeHtml(detail.video_url) : "";
  const imageUrl = detail.image_url ? escapeHtml(detail.image_url) : "";
  const lengthText = detail.length == null ? "n/a" : `${detail.length}s`;
  const sizeText = detail.size == null ? "n/a" : `${detail.size} bytes`;

  container.innerHTML = `
    ${
      videoUrl
        ? `
          <div class="highlight-media">
            <video
              class="highlight-player"
              controls
              playsinline
              preload="metadata"
              ${imageUrl ? `poster="${imageUrl}"` : ""}
              src="${videoUrl}"
            ></video>
          </div>
        `
        : `<div class="empty-state muted">Video URL is not available yet. Refresh the highlight after it reaches SUCCESS.</div>`
    }
    <div class="summary-grid">
      <div class="summary-box">
        <strong>Status</strong>
        <span>${statusPill(detail.status)}</span>
      </div>
      <div class="summary-box">
        <strong>Title</strong>
        <span>${escapeHtml(detail.title || "Untitled highlight")}</span>
      </div>
      <div class="summary-box">
        <strong>Cost</strong>
        <span>${detail.cost} credits</span>
      </div>
      <div class="summary-box">
        <strong>Score</strong>
        <span>${detail.score}</span>
      </div>
      <div class="summary-box">
        <strong>Length</strong>
        <span>${escapeHtml(lengthText)}</span>
      </div>
      <div class="summary-box">
        <strong>Clip Containers</strong>
        <span>${clips.length}</span>
      </div>
      <div class="summary-box">
        <strong>Size</strong>
        <span>${escapeHtml(sizeText)}</span>
      </div>
    </div>
    <div class="subtle-card">
      <div class="meta-line">
        <code>demo_id=${detail.demo_id}</code>
        <code>resolution_id=${detail.resolution_id}</code>
        <code>fps_id=${detail.fps_id}</code>
        ${detail.video_url ? `<a class="inline-button" href="${videoUrl}" target="_blank" rel="noreferrer">open video</a>` : ""}
        ${detail.image_url ? `<a class="inline-button" href="${imageUrl}" target="_blank" rel="noreferrer">open thumbnail</a>` : ""}
      </div>
    </div>
  `;
  raw.textContent = formatJson(detail);
}

function renderTransactions() {
  const container = byId("transactions-list");
  if (!container) {
    return;
  }

  if (!state.dashboard) {
    container.innerHTML = emptyState("Credit information appears after the first successful dashboard load.");
    return;
  }

  const credit = state.dashboard.credit;
  const transactions = state.dashboard.transactions.items;
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-box">
        <strong>Current Credit</strong>
        <span>${credit.credit}</span>
      </div>
      <div class="summary-box">
        <strong>Bought</strong>
        <span>${credit.credit_bought}</span>
      </div>
      <div class="summary-box">
        <strong>Given</strong>
        <span>${credit.credit_given}</span>
      </div>
      <div class="summary-box">
        <strong>User</strong>
        <span>${escapeHtml(credit.email)}</span>
      </div>
    </div>
    ${
      transactions.length
        ? `
          <div class="table-shell" style="margin-top: 1rem;">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Highlight</th>
                  <th>Status</th>
                  <th>Credit</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                ${transactions
                  .map(
                    (item) => `
                      <tr>
                        <td>#${item.id}</td>
                        <td>#${item.highlight_id}</td>
                        <td>${escapeHtml(item.highlight_status)}</td>
                        <td>${item.credit}</td>
                        <td>${escapeHtml(item.created_at || "n/a")}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        : `<div class="empty-state" style="margin-top: 1rem;">No transactions returned yet.</div>`
    }
  `;
}

function renderWebhooks() {
  const container = byId("webhook-events-list");
  if (!container) {
    return;
  }

  const events = state.dashboard?.webhook_events?.items ?? [];
  if (!events.length) {
    container.innerHTML = `
      <div class="empty-state muted">
        No webhook deliveries recorded locally yet. Rankacy cannot send webhook requests to <code>localhost</code> directly, so expose this app through a public tunnel such as <code>ngrok http 9000</code>.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>Event ID</th>
            <th>Type</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          ${events
            .map(
              (item) => `
                <tr>
                  <td><code>${escapeHtml(shorten(item.event_id, 26))}</code></td>
                  <td>${escapeHtml(item.event_type)}</td>
                  <td>${escapeHtml(item.received_at)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function toggleActionButtons() {
  const disabled = !state.health?.token_configured || !state.selectedDemoId;
  if (byId("standard-submit")) {
    byId("standard-submit").disabled = disabled;
  }
  if (byId("ticks-submit")) {
    byId("ticks-submit").disabled = disabled;
  }
  if (byId("kill-submit")) {
    byId("kill-submit").disabled = disabled;
  }
}

async function runAction(label, work) {
  try {
    await work();
    showToast(`${label} completed`, "success");
  } catch (error) {
    console.error(`Failed to ${label.toLowerCase()}:`, error);
    showToast(error.message || `Failed to ${label.toLowerCase()}`, "error");
  }
  renderAll();
}

function showToast(message, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === "success" ? "\u2713" : "!"}</span><span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove());
  }, 3500);
}

async function fetchJson(url, options = {}, consoleLabel = url) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJsonParse(text) : {};

  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new Error(`[${response.status}] ${detail}`);
  }
  return body;
}

function parseKillIds(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function collectTickRanges() {
  const items = Array.from(document.querySelectorAll("#tick-range-list .array-item"));
  const ranges = items
    .map((item) => ({
      start_tick: Number(item.querySelector('[data-field="start_tick"]').value || 0),
      end_tick: Number(item.querySelector('[data-field="end_tick"]').value || 0),
      steam_id: String(item.querySelector('[data-field="steam_id"]').value || "").trim(),
      speed: Number(item.querySelector('[data-field="speed"]').value || 1),
    }))
    .filter((item) => item.start_tick || item.end_tick || item.steam_id);

  if (!ranges.length) {
    throw new Error("Add at least one ticks[] item before queueing a highlight by ticks.");
  }

  for (const item of ranges) {
    if (!item.steam_id) {
      throw new Error("Each ticks[] item needs a steam_id.");
    }
    if (item.end_tick < item.start_tick) {
      throw new Error("Each ticks[] item needs end_tick greater than or equal to start_tick.");
    }
  }

  return ranges;
}

function collectKillIds({ allowEmpty = false } = {}) {
  const ids = Array.from(document.querySelectorAll('#kill-id-list [data-field="demo_kill_id"]'))
    .map((input) => Number(input.value || 0))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!ids.length && !allowEmpty) {
    throw new Error("Add at least one demo_kill_ids[] item before queueing a highlight by kill ID.");
  }

  return [...new Set(ids)];
}

function optionalString(value) {
  const stringValue = String(value || "").trim();
  return stringValue || null;
}

function statusVariant(status) {
  if (status === "SUCCESS") {
    return "success";
  }
  if (status === "FAILED") {
    return "danger";
  }
  if (status === "PROCESSING" || status === "NEW" || status === "queued") {
    return "warning";
  }
  return "secondary";
}

function statusPill(status, variant = statusVariant(status), id = "") {
  const idAttribute = id ? ` id="${id}"` : "";
  return `<span${idAttribute} class="pill ${variant}">${escapeHtml(status)}</span>`;
}

function emptyState(message) {
  return `<div class="empty-state muted">${escapeHtml(message)}</div>`;
}

function shorten(value, width) {
  if (!value || value.length <= width) {
    return value;
  }
  return `${value.slice(0, width)}...`;
}

function pageCount(totalItems, pageSize) {
  if (!totalItems) {
    return 0;
  }
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function clampPage(page, totalPages) {
  if (!totalPages) {
    return 1;
  }
  return Math.min(Math.max(page, 1), totalPages);
}

function slicePage(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function pageRange(totalItems, page, pageSize) {
  if (!totalItems) {
    return { start: 0, end: 0, label: "0 of 0" };
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, start + pageSize - 1);
  return { start, end, label: `${start}-${end} of ${totalItems}` };
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "n/a";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return { raw: value };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function byId(id) {
  return document.getElementById(id);
}

function getStoredNumber(key) {
  const value = localStorage.getItem(key);
  return value ? Number(value) || null : null;
}

function getStoredJson(key) {
  const value = localStorage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    localStorage.removeItem(key);
    return null;
  }
}

function setStoredNumber(key, value) {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(value));
}

function setStoredJson(key, value) {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}
