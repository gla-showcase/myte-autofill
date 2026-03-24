/*************************************************
 * MyTE Autofill Helper - content.js
 *************************************************/

const MYTE_STORAGE_KEY = "myteAutofillConfig";

const defaultConfig = {
  dailyHours: 7.7,
  weeklyPattern: {
    0: "HW",
    1: "Office",
    2: "Office",
    3: "Office",
    4: "HW"
  },
  autoCheckRest: true,
  themeStyle: "corporate", // 'corporate' | 'dev'
  wbsAllocations: [],
  availableWbs: [],
  favoriteWbs: [] // list of favorite WBS codes
};

const state = {
  config: { ...defaultConfig },
  panel: null,
  initialized: false,
  wbsFilter: "", // search text for WBS
  panelTemplate: null // <--- new
};

/***********************
 * PANEL HELPERS
 ***********************/
async function loadPanelTemplate() {
  if (state.panelTemplate) return state.panelTemplate;

  if (!chrome.runtime || !chrome.runtime.getURL) {
    console.error("[MyTE] chrome.runtime.getURL not available in this context.");
    return null;
  }

  const url = chrome.runtime.getURL("panel.html"); // or "ui/panel.html"
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("[MyTE] Failed to load panel.html:", resp.status, resp.statusText);
      return null;
    }

    const html = await resp.text();
    const tmpl = document.createElement("template");
    tmpl.innerHTML = html.trim();

    const root = tmpl.content.querySelector("#myte-helper-panel");
    if (!root) {
      console.error("[MyTE] panel.html missing #myte-helper-panel root.");
      return null;
    }

    state.panelTemplate = root;
    return root;
  } catch (e) {
    console.error("[MyTE] Error fetching panel.html:", e);
    return null;
  }
}

/***********************
 * STORAGE HELPERS
 ***********************/
function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([MYTE_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.warn("Storage error:", chrome.runtime.lastError);
        state.config = { ...defaultConfig };
        return resolve(state.config);
      }
      const stored = result[MYTE_STORAGE_KEY];
      if (stored) {
        state.config = {
          ...defaultConfig,
          ...stored,
          weeklyPattern: {
            ...defaultConfig.weeklyPattern,
            ...(stored.weeklyPattern || {})
          },
          favoriteWbs: stored.favoriteWbs || []
        };
      } else {
        state.config = { ...defaultConfig };
      }
      resolve(state.config);
    });
  });
}

function saveConfig() {
  chrome.storage.sync.set({ [MYTE_STORAGE_KEY]: state.config }, () => {
    if (chrome.runtime.lastError) {
      console.warn("Failed to save config:", chrome.runtime.lastError);
    }
  });
}

/***********************
 * SMALL UTILS & TOASTS
 ***********************/
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pressTab(el) {
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      keyCode: 9,
      which: 9,
      bubbles: true,
      cancelable: true
    })
  );
}

async function fillEditableDiv(editableDiv, text) {
  editableDiv.click();
  await wait(8);

  editableDiv.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  document.execCommand("insertText", false, String(text));

  await wait(8);
  pressTab(editableDiv);
}

/* Toast */

let toastTimeout = null;
function showToast(message, type = "info") {
  if (!document.body) return;

  let toast = document.getElementById("myte-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "myte-toast";
    toast.className = "myte-toast myte-toast-info";
    toast.innerHTML = `
      <span class="myte-toast-icon">ℹ️</span>
      <span class="myte-toast-text"></span>
    `;
    document.body.appendChild(toast);
  }

  const textSpan = toast.querySelector(".myte-toast-text");
  const iconSpan = toast.querySelector(".myte-toast-icon");
  toast.classList.remove(
    "myte-toast-info",
    "myte-toast-success",
    "myte-toast-error"
  );

  if (type === "success") {
    toast.classList.add("myte-toast-success");
    iconSpan.textContent = "✅";
  } else if (type === "error") {
    toast.classList.add("myte-toast-error");
    iconSpan.textContent = "⚠️";
  } else {
    toast.classList.add("myte-toast-info");
    iconSpan.textContent = "ℹ️";
  }

  textSpan.textContent = message;

  requestAnimationFrame(() => {
    toast.classList.add("myte-toast-show");
  });

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("myte-toast-show");
  }, 3500);
}

/***********************
 * CHECKBOX HELPER (user-like)
 ***********************/
function userSetCheckbox(cb, desired) {
  if (!cb) return;

  // Already correct: still emit change
  if (cb.checked === desired) {
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const evtOpts = { bubbles: true, cancelable: true, view: window };
  cb.focus();
  cb.dispatchEvent(new MouseEvent("pointerdown", evtOpts));
  cb.dispatchEvent(new MouseEvent("mousedown", evtOpts));
  cb.dispatchEvent(new MouseEvent("mouseup", evtOpts));
  cb.dispatchEvent(new MouseEvent("pointerup", evtOpts));
  cb.click();

  if (cb.checked !== desired) {
    cb.checked = desired;
    cb.dispatchEvent(new Event("input", { bubbles: true }));
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/***********************
 * WBS POPUP PARSING
 ***********************/
function isActiveWbsRow(row) {
  const cells = Array.from(row.querySelectorAll(".ag-cell-value"));
  if (!cells.length) return false;
  return !cells.some((c) => c.classList.contains("error-cell"));
}

function extractWbsRow(row) {
  const grab = (colId) =>
    (
      row.querySelector(
        `[col-id="${colId}"] span[aria-hidden="true"]`
      )?.textContent || ""
    ).trim();

  return {
    type: grab("Type"),
    subtype: grab("subtype"),
    client: grab("client"),
    countryRegion: grab("countryRegion"),
    description: grab("description"),
    code: grab("code")
  };
}

async function ensureWbsPopupOpenForButton(button) {
  if (!button) return null;

  button.click();
  await wait(300);

  const popup = document.getElementById("My_TE_Time_MenuChargeCodes");
  if (!popup) {
    console.warn("WBS popup did not appear.");
    return null;
  }
  return popup;
}

async function scrollWbsPopupToLoadAll(popup) {
  const viewport = popup.querySelector(".ag-center-cols-viewport");
  if (!viewport) {
    console.warn("No viewport in popup");
    return;
  }

  const maxHeight = viewport.scrollHeight || 2000;
  for (let y = 0; y <= maxHeight; y += 300) {
    viewport.scrollTop = y;
    await wait(20);
  }

  viewport.scrollTop = 0;
  await wait(40);
}

async function closeWbsPopup() {
  const popup = document.getElementById("My_TE_Time_MenuChargeCodes");
  if (!popup) return;

  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      bubbles: true
    })
  );
  await wait(120);

  if (document.getElementById("My_TE_Time_MenuChargeCodes")) {
    const opener =
      document.querySelector(
        'button[id^="charge-code-"].assignment-container'
      ) || document.querySelector('button[id^="charge-code-"]');
    if (opener) opener.click();
    await wait(120);
  }
}

async function waitForChargeCodeOpener(timeoutMs = 6000) {
  const start = performance.now();
  let opener = null;

  while (performance.now() - start < timeoutMs) {
    opener =
      document.querySelector('button[id^="charge-code-"].assignment-container') ||
      document.querySelector('button[id^="charge-code-"]');

    if (opener) return opener;

    await wait(200);
  }

  return null;
}

async function extractAllActiveWbsFromPage() {
  const opener = await waitForChargeCodeOpener();
  if (!opener) {
    console.warn("No charge-code opener button found (not ready yet).");
    showToast("MyTE not fully ready. Try Reload WBS in a few seconds.", "error");
    return [];
  }

  const popup = await ensureWbsPopupOpenForButton(opener);
  if (!popup) return [];

  await scrollWbsPopupToLoadAll(popup);

  const allRows = Array.from(popup.querySelectorAll('[role="row"][row-id]'));
  const activeRows = allRows.filter(isActiveWbsRow);
  const activeCodes = activeRows
    .map(extractWbsRow)
    .filter((r) => r.code && r.code.trim().length > 0);

  await closeWbsPopup();

  console.log(
    `[MyTE] Extracted ${activeCodes.length} active WBS from page.`,
    activeCodes
  );

  showToast(`Loaded ${activeCodes.length} active WBS from page.`, "success");
  return activeCodes;
}

/***********************
 * MAIN GRID / ROWS
 ***********************/
function findGridRowIndexByCode(code) {
  const gridCells = document.querySelectorAll(
    '[id^="entryGridChargeCodeCell-"]'
  );
  for (let i = 0; i < gridCells.length; i++) {
    if (gridCells[i].textContent.includes(code)) {
      const m = gridCells[i].id.match(/entryGridChargeCodeCell-(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return null;
}

async function ensureWbsInRowByCode(code, rowNumber) {
  const button = document.getElementById(`charge-code-${rowNumber}`);
  if (!button) {
    console.warn(`Button charge-code-${rowNumber} not found for WBS ${code}`);
    return null;
  }

  const popup = await ensureWbsPopupOpenForButton(button);
  if (!popup) return null;

  await scrollWbsPopupToLoadAll(popup);

  const rows = Array.from(popup.querySelectorAll('[role="row"][row-id]'));
  let targetRow = null;
  for (const r of rows) {
    const codeCell = r.querySelector('[col-id="code"] span[aria-hidden="true"]');
    if (codeCell && codeCell.textContent.trim() === code) {
      targetRow = r;
      break;
    }
  }

  if (!targetRow) {
    console.warn("WBS code not found in popup:", code);
    await closeWbsPopup();
    return null;
  }

  targetRow.click();
  await wait(250);
  await closeWbsPopup();

  const rowIndex = findGridRowIndexByCode(code);
  if (rowIndex === null) {
    console.warn("Could not find grid row index for code:", code);
  }
  return rowIndex;
}

/***********************
 * HOURS FILLING LOGIC
 ***********************/
function getWorkingDayIndices(exampleRowIndex) {
  const cells = Array.from(
    document.querySelectorAll(`[id^="entryGridHoursCell-"]`)
  ).filter((c) => c.id.endsWith(`-${exampleRowIndex}`));

  const indices = [];
  for (const cell of cells) {
    if (!cell.classList.contains("special-cell")) {
      const m = cell.id.match(/entryGridHoursCell-(\d+)-/);
      if (m) indices.push(parseInt(m[1], 10));
    }
  }

  indices.sort((a, b) => a - b);
  return indices;
}

function computeDailyHoursPerWbs(config) {
  const dailyTotal = Number(config.dailyHours) || 7.7;
  const items = (config.wbsAllocations || []).filter(
    (w) => w.code && Number(w.weight) > 0
  );

  if (!items.length) return [];

  const totalTenths = Math.round(dailyTotal * 10);
  const totalWeight = items.reduce(
    (sum, w) => sum + Number(w.weight || 0),
    0
  );
  if (!totalWeight) return [];

  const result = [];
  let accumulatedTenths = 0;

  items.forEach((item, idx) => {
    if (idx === items.length - 1) {
      const tenths = totalTenths - accumulatedTenths;
      result.push({ code: item.code, hours: tenths / 10 });
    } else {
      const raw = (totalTenths * Number(item.weight)) / totalWeight;
      const tenths = Math.floor(raw);
      accumulatedTenths += tenths;
      result.push({ code: item.code, hours: tenths / 10 });
    }
  });

  return result;
}

async function fillTimesheetWithConfig(config) {
  const allocations = (config.wbsAllocations || []).filter(
    (w) => w.code && Number(w.weight) > 0
  );
  if (!allocations.length) {
    alert("MyTE Autofill: Please configure at least one WBS with a weight > 0.");
    showToast("Configure at least one WBS with a weight > 0.", "error");
    return false;
  }

  const codeToRowIndex = {};
  for (let i = 0; i < allocations.length; i++) {
    const { code } = allocations[i];

    let rowIndex = findGridRowIndexByCode(code);
    if (rowIndex === null) {
      rowIndex = await ensureWbsInRowByCode(code, i + 1);
    }
    if (rowIndex === null) {
      alert(
        `MyTE Autofill: Row not found for WBS ${code}. ` +
        `Check that this WBS is authorized for the period.`
      );
      showToast(`Row not found for WBS ${code}.`, "error");
      return false;
    }
    codeToRowIndex[code] = rowIndex;
  }

  const anyRowIndex = codeToRowIndex[allocations[0].code];
  const workingDayIndices = getWorkingDayIndices(anyRowIndex);
  if (!workingDayIndices.length) {
    alert("MyTE Autofill: No working days detected in the grid.");
    showToast("No working days detected in the grid.", "error");
    return false;
  }

  const perWbs = computeDailyHoursPerWbs(config);
  if (!perWbs.length) {
    alert("MyTE Autofill: cannot compute hours per WBS. Check weights.");
    showToast("Cannot compute hours per WBS. Check weights.", "error");
    return false;
  }

  console.log("[MyTE] Per-WBS daily hours distribution:", perWbs);
  console.log("[MyTE] Working day indices:", workingDayIndices);

  for (const dayIndex of workingDayIndices) {
    for (const { code, hours } of perWbs) {
      const rowIndex = codeToRowIndex[code];
      const cell = document.getElementById(
        `entryGridHoursCell-${dayIndex}-${rowIndex}`
      );
      if (!cell) continue;

      const editableDiv = cell.querySelector('[contenteditable="true"]');
      if (!editableDiv) continue;

      await fillEditableDiv(editableDiv, hours.toFixed(1));
      await wait(10);
    }
  }

  console.log("[MyTE] Timesheet hours filled.");
  showToast("Timesheet hours filled successfully.", "success");
  return true;
}

/***********************
 * TIME CATEGORY LOGIC
 ***********************/
function applyWeeklyPatternAndRest(config) {
  const weeklyPattern = config.weeklyPattern || {};
  const autoCheckRest = !!config.autoCheckRest;

  const whiteIndices = [];

  for (let i = 0; i <= 50; i++) {
    const cell =
      document.getElementById(`timeCategoryCell-2-${i}`) ||
      document.getElementById(`timeCategoryCell-4-${i}`);
    if (cell && !cell.classList.contains("special-cell")) {
      whiteIndices.push(i);
    }
  }

  // Weekly HW/Office pattern
  whiteIndices.forEach((index, position) => {
    const homeworkingCheckbox = document.getElementById(
      "homeworking-full-day-" + index
    );
    const officeCheckbox = document.getElementById("office-client-" + index);
    const dayInWeek = position % 5;
    const mode = weeklyPattern[dayInWeek] || "HW";

    if (mode === "Office") {
      userSetCheckbox(officeCheckbox, true);
      userSetCheckbox(homeworkingCheckbox, false);
    } else if (mode === "None") {
      userSetCheckbox(officeCheckbox, false);
      userSetCheckbox(homeworkingCheckbox, false);
    } else {
      userSetCheckbox(homeworkingCheckbox, true);
      userSetCheckbox(officeCheckbox, false);
    }
  });

  // Daily / weekly rest
  if (autoCheckRest) {
    const checkRow = (prefix) => {
      for (let i = 0; i <= 50; i++) {
        const cb = document.getElementById(prefix + i);
        if (!cb) continue;
        const cell = cb.closest('[id^="timeCategoryCell-"]');
        if (cell && !cell.classList.contains("special-cell")) {
          userSetCheckbox(cb, true);
        }
      }
    };

    checkRow("jai-respect-mon-repos-quotidien-");
    checkRow("jai-respect-mon-repos-hebdomadaire-");
  }

  console.log("[MyTE] Time categories updated with weekly pattern.", {
    weeklyPattern,
    autoCheckRest
  });
  showToast("Time categories updated.", "success");
}

/***********************
 * PANEL UI – helpers
 ***********************/
function applyThemeClass() {
  if (!state.panel) return;
  state.panel.classList.remove("myte-theme-corporate", "myte-theme-dev");

  const style = state.config.themeStyle || "corporate";
  if (style === "dev") {
    state.panel.classList.add("myte-theme-dev");
  } else {
    state.panel.classList.add("myte-theme-corporate");
  }

  const themeSelect = state.panel.querySelector("#myte-theme-select");
  if (themeSelect) themeSelect.value = style;
}

function updateWbsButtonLabel() {
  if (!state.panel) return;
  const btn = state.panel.querySelector("#myte-load-wbs");
  if (!btn) return;

  const labelSpan = btn.querySelector(".myte-btn-label");
  if (!labelSpan) return;

  const hasWbs = (state.config.availableWbs || []).length > 0;
  labelSpan.textContent = hasWbs ? "Reload WBS" : "Load WBS";

  btn.disabled = false;
}

function updateWbsCountLabel() {
  if (!state.panel) return;

  const numberEl = state.panel.querySelector("#myte-wbs-count-number");
  const textEl = state.panel.querySelector("#myte-wbs-count-text");
  if (!numberEl || !textEl) return;

  const count = (state.config.availableWbs || []).length;

  numberEl.textContent = count;

  if (count === 0) {
    textEl.textContent = "No WBS loaded yet";
    textEl.classList.add("myte-wbs-count-text-empty");
  } else {
    textEl.textContent = count === 1 ? "active WBS loaded" : "active WBS loaded";
    textEl.classList.remove("myte-wbs-count-text-empty");
  }
}

async function autoLoadWbsIfNeeded() {
  // Only when panel is open AND no WBS known yet
  if (!state.panel) return;

  const hasWbs = (state.config.availableWbs || []).length > 0;
  const hasAlloc = (state.config.wbsAllocations || []).length > 0;
  if (hasWbs || hasAlloc) {
    updateWbsButtonLabel();
    return;
  }

  const btn = state.panel.querySelector("#myte-load-wbs");
  if (btn) {
    btn.disabled = true;
    const labelSpan = btn.querySelector(".myte-btn-label");
    if (labelSpan) {
      labelSpan.textContent = "Loading WBS…";
    }
  }

  try {
    const wbs = await extractAllActiveWbsFromPage();
    state.config.availableWbs = wbs;
    updateWbsCountLabel();
    if (!state.config.wbsAllocations.length && wbs.length) {
      state.config.wbsAllocations = [{ code: wbs[0].code, weight: 1 }];
    }
    saveConfig();
    renderWbsList();
  } finally {
    if (btn) {
      btn.disabled = false;
      updateWbsButtonLabel();
    }
  }
}

function updateWeekEmoji(dayIndex, mode) {
  if (!state.panel) return;
  const span = state.panel.querySelector(
    `.myte-week-emoji[data-day-emoji="${dayIndex}"]`
  );
  if (!span) return;

  if (mode === "Office") span.textContent = "🏢";
  else if (mode === "None") span.textContent = "⬜";
  else span.textContent = "🏠";
}

/* Weight summary helper */
function updateWeightSummary() {
  if (!state.panel) return;
  const summaryEl = state.panel.querySelector("#myte-weight-summary");
  if (!summaryEl) return;

  const allocations = (state.config.wbsAllocations || []).filter(
    (w) => w.code && Number(w.weight) > 0
  );
  const total = allocations.reduce(
    (sum, w) => sum + Number(w.weight || 0),
    0
  );
  const rounded = Math.round(total * 100) / 100;

  summaryEl.textContent = `Total weight: ${rounded.toFixed(2)}`;
  const ok = Math.abs(total - 1) < 0.001;
  summaryEl.classList.toggle("myte-weight-ok", ok);
  summaryEl.classList.toggle("myte-weight-warn", !ok);
}

/***********************
 * PANEL UI – creation
 ***********************/
async function createPanel() {
  if (state.panel) return state.panel;

  const tplRoot = await loadPanelTemplate();
  if (!tplRoot) {
    showToast("MyTE Autofill: cannot load panel template.", "error");
    return null;
  }

  const panel = tplRoot.cloneNode(true);
  document.body.appendChild(panel);
  state.panel = panel;

  wirePanelEvents();
  applyConfigToUI();
  applyThemeClass();
  updateWbsCountLabel();
  autoLoadWbsIfNeeded();

  return panel;
}

function removePanel() {
  if (state.panel) {
    state.panel.remove();
    state.panel = null;
  }
}

function togglePanel() {
  if (state.panel) {
    removePanel();
  } else {
    createPanel(); // returns a Promise but we don't need to await
  }
}


/***********************
 * WBS list rendering
 ***********************/
function renderWbsList() {
  if (!state.panel) return;

  const container = state.panel.querySelector("#myte-wbs-list");
  if (!container) return;

  const cfg = state.config;
  const available = cfg.availableWbs || [];
  const allocations = cfg.wbsAllocations || [];
  const favoriteCodes = cfg.favoriteWbs || [];
  const filter = (state.wbsFilter || "").toLowerCase().trim();

  container.innerHTML = "";

  if (!allocations.length) {
    const info = document.createElement("div");
    info.className = "myte-empty";
    info.textContent =
      "No WBS configured yet. Reload WBS from page, then add lines and choose WBS + weights.";
    container.appendChild(info);
    updateWeightSummary();
    return;
  }

  const matchesFilter = (w) => {
    if (!filter) return true;
    const code = (w.code || "").toLowerCase();
    const desc = (w.description || "").toLowerCase();
    return code.includes(filter) || desc.includes(filter);
  };

  allocations.forEach((alloc, index) => {
    const row = document.createElement("div");
    row.className = "myte-wbs-row";

    const favList = [];
    const otherList = [];

    available.forEach((w) => {
      const isFav = favoriteCodes.includes(w.code);
      if (isFav) favList.push(w);
      else otherList.push(w);
    });

    let optionsList = favList.filter(matchesFilter).concat(
      otherList.filter(matchesFilter)
    );

    const current = available.find((w) => w.code === alloc.code);
    if (current && !optionsList.some((w) => w.code === current.code)) {
      optionsList.unshift(current);
    }

    const wbsOptions = optionsList
      .map((w) => {
        const isFav = favoriteCodes.includes(w.code);
        const labelPrefix = isFav ? "★ " : "";
        return `<option value="${w.code}">${labelPrefix}${w.code} – ${w.description}</option>`;
      })
      .join("");

    row.innerHTML = `
      <select class="myte-wbs-select" data-index="${index}">
        <option value="">Select WBS</option>
        ${wbsOptions}
      </select>
      <input
        type="number"
        step="0.1"
        min="0"
        class="myte-wbs-weight"
        data-index="${index}"
        placeholder="Weight"
      />
      <button class="myte-wbs-fav" data-index="${index}" title="Toggle favorite">☆</button>
      <button class="myte-wbs-remove" data-index="${index}" title="Remove">✕</button>
    `;

    container.appendChild(row);

    const select = row.querySelector(".myte-wbs-select");
    const weightInput = row.querySelector(".myte-wbs-weight");
    const favBtn = row.querySelector(".myte-wbs-fav");

    if (select) select.value = alloc.code || "";
    if (weightInput && typeof alloc.weight !== "undefined") {
      weightInput.value = alloc.weight;
    }

    const isFav =
      alloc.code && favoriteCodes && favoriteCodes.includes(alloc.code);
    if (favBtn) {
      if (isFav) {
        favBtn.classList.add("myte-wbs-fav-active");
        favBtn.textContent = "★";
      } else {
        favBtn.classList.remove("myte-wbs-fav-active");
        favBtn.textContent = "☆";
      }
    }
  });

  updateWeightSummary();
}

/***********************
 * Apply config to UI
 ***********************/
function applyConfigToUI() {
  if (!state.panel) return;

  const cfg = state.config;

  const dailyHoursInput = state.panel.querySelector("#myte-daily-hours");
  if (dailyHoursInput) dailyHoursInput.value = cfg.dailyHours;

  const autoRest = state.panel.querySelector("#myte-auto-rest");
  if (autoRest) autoRest.checked = !!cfg.autoCheckRest;

  const selects = state.panel.querySelectorAll(".myte-week-select");
  selects.forEach((sel) => {
    const dayIdx = Number(sel.dataset.dayIndex);
    const val = cfg.weeklyPattern[dayIdx] || "HW";
    sel.value = val;
    updateWeekEmoji(dayIdx, val);
  });

  renderWbsList();
  updateWbsCountLabel();
  updateWbsButtonLabel();
  applyThemeClass();
}

/***********************
 * Panel events
 ***********************/
function wirePanelEvents() {
  if (!state.panel) return;

  state.panel
    .querySelector("#myte-close-btn")
    ?.addEventListener("click", () => removePanel());

  state.panel
    .querySelector("#myte-theme-select")
    ?.addEventListener("change", (e) => {
      state.config.themeStyle = e.target.value;
      saveConfig();
      applyThemeClass();
    });

  // Reload WBS button
  state.panel
    .querySelector("#myte-load-wbs")
    ?.addEventListener("click", async () => {
      const btn = state.panel.querySelector("#myte-load-wbs");
      if (btn) {
        btn.disabled = true;
        const labelSpan = btn.querySelector(".myte-btn-label");
        if (labelSpan) {
          labelSpan.textContent = "Loading WBS…";
        }
      }
      try {
        const wbs = await extractAllActiveWbsFromPage();
        state.config.availableWbs = wbs;
        updateWbsCountLabel();
        if (!state.config.wbsAllocations.length && wbs.length) {
          state.config.wbsAllocations = [{ code: wbs[0].code, weight: 1 }];
        }
        saveConfig();
        renderWbsList();
      } finally {
        if (btn) {
          btn.disabled = false;
          updateWbsButtonLabel();
        }
      }
    });

  // Search WBS
  state.panel
    .querySelector("#myte-wbs-search")
    ?.addEventListener("input", (e) => {
      state.wbsFilter = e.target.value || "";
      renderWbsList();
    });

  // Normalize weights
  state.panel
    .querySelector("#myte-normalize-weights")
    ?.addEventListener("click", () => {
      const allocations = state.config.wbsAllocations || [];
      const total = allocations.reduce(
        (sum, a) => sum + Number(a.weight || 0),
        0
      );
      if (!total) {
        showToast("Cannot normalize: total weight is 0.", "error");
        return;
      }
      allocations.forEach((a) => {
        a.weight = Number(a.weight || 0) / total;
      });
      saveConfig();
      renderWbsList();
      showToast("Weights normalized to sum 1.0.", "success");
    });

  state.panel
    .querySelector("#myte-daily-hours")
    ?.addEventListener("change", (e) => {
      const val = Number(e.target.value) || 7.7;
      state.config.dailyHours = val;
      saveConfig();
    });

  state.panel
    .querySelector("#myte-auto-rest")
    ?.addEventListener("change", (e) => {
      state.config.autoCheckRest = !!e.target.checked;
      saveConfig();
    });

  state.panel
    .querySelectorAll(".myte-week-select")
    .forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const dayIdx = Number(e.target.dataset.dayIndex);
        state.config.weeklyPattern[dayIdx] = e.target.value;
        updateWeekEmoji(dayIdx, e.target.value);
        saveConfig();
      });
    });

  state.panel
    .querySelector("#myte-add-wbs")
    ?.addEventListener("click", () => {
      state.config.wbsAllocations.push({ code: "", weight: 1 });
      saveConfig();
      renderWbsList();
    });

  const wbsContainer = state.panel.querySelector("#myte-wbs-list");

  // Changes inside WBS list
  wbsContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("myte-wbs-select")) {
      const idx = Number(e.target.dataset.index);
      const value = e.target.value;
      if (!state.config.wbsAllocations[idx]) return;
      state.config.wbsAllocations[idx].code = value;
      saveConfig();
      renderWbsList();
    } else if (e.target.classList.contains("myte-wbs-weight")) {
      const idx = Number(e.target.dataset.index);
      const value = Number(e.target.value) || 0;
      if (!state.config.wbsAllocations[idx]) return;
      state.config.wbsAllocations[idx].weight = value;
      saveConfig();
      updateWeightSummary();
    }
  });

  // Clicks inside WBS list (remove / favorite)
  wbsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("myte-wbs-remove")) {
      const idx = Number(e.target.dataset.index);
      state.config.wbsAllocations.splice(idx, 1);
      saveConfig();
      renderWbsList();
    } else if (e.target.classList.contains("myte-wbs-fav")) {
      const idx = Number(e.target.dataset.index);
      const row = e.target.closest(".myte-wbs-row");
      if (!row) return;
      const select = row.querySelector(".myte-wbs-select");
      if (!select || !select.value) {
        showToast("Select a WBS before marking it as favorite.", "info");
        return;
      }

      const code = select.value;
      const favs = state.config.favoriteWbs || [];
      const indexInFavs = favs.indexOf(code);
      if (indexInFavs === -1) {
        favs.push(code);
      } else {
        favs.splice(indexInFavs, 1);
      }
      state.config.favoriteWbs = favs;
      saveConfig();
      renderWbsList();
    }
  });

  // Fill button
  state.panel
    .querySelector("#myte-fill-btn-fixed")
    ?.addEventListener("click", async () => {
      const btn = state.panel.querySelector("#myte-fill-btn-fixed");
      const detailsToFold = state.panel.querySelectorAll("details");
      const openStates = Array.from(detailsToFold).map((d) => d.open);
      detailsToFold.forEach((d) => (d.open = false));

      btn.disabled = true;
      btn.textContent = "Filling…";
      state.panel.classList.add("myte-busy");

      try {
        const success = await fillTimesheetWithConfig(state.config);
        if (success) {
          applyWeeklyPatternAndRest(state.config);
          showToast("Timesheet filled successfully!", "success");
          await wait(350);
          removePanel();
        }
      } catch (err) {
        console.error(err);
        showToast("An error occurred while filling.", "error");
      } finally {
        if (state.panel) state.panel.classList.remove("myte-busy");
        btn.disabled = false;
        btn.textContent = "Fill Timesheet";
        detailsToFold.forEach((d, i) => (d.open = openStates[i]));
      }
    });
}

/***********************
 * MESSAGE LISTENER
 ***********************/
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "TOGGLE_MYTE_PANEL") {
    togglePanel();
  }
});

/***********************
 * INIT
 ***********************/
(async function init() {
  if (state.initialized) return;
  state.initialized = true;

  // Only load config. WBS auto-load is now triggered
  // *only* when the panel is opened via autoLoadWbsIfNeeded().
  await loadConfig();
})();
