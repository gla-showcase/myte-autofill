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
  weeklyPatternEnabled: true,
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
  panelTemplate: null,
  panelCreationPromise: null,
  panelOpenRequested: false,
  activeWbsPickerIndex: null,
  wbsDrafts: {},
  isSelectingWbsOption: false
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseLocalizedHourValue(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function areEquivalentHourValues(actualValue, expectedValue) {
  const actual = parseLocalizedHourValue(actualValue);
  const expected = parseLocalizedHourValue(expectedValue);

  return actual !== null && expected !== null && Math.abs(actual - expected) < 0.0001;
}

function formatHoursForInput(value, fallback = defaultConfig.dailyHours) {
  const parsed = parseLocalizedHourValue(value);
  const fallbackParsed = parseLocalizedHourValue(fallback);
  const hours = parsed ?? fallbackParsed ?? defaultConfig.dailyHours;

  return hours.toFixed(1);
}

function normalizeHoursInputValue(input) {
  if (!input) return null;

  const nextValue = input.value.replace(/,/g, ".");
  if (input.value !== nextValue) {
    input.value = nextValue;
  }

  return nextValue;
}

function getGridRoot() {
  return (
    document.querySelector('[aria-label="Time Entry Grid"]') ||
    document.querySelector('.ag-root[role="grid"]') ||
    null
  );
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 16);
  });
}

async function advanceFrames(count) {
  for (let frame = 0; frame < count; frame += 1) {
    await nextFrame();
  }
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

  el.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Tab",
      code: "Tab",
      keyCode: 9,
      which: 9,
      bubbles: true
    })
  );
}

function isTextInputElement(element) {
  return (
    !!element &&
    typeof element.matches === "function" &&
    element.matches('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])')
  );
}

function getHourCellContainer(node) {
  if (!node) return null;

  if (node.id && node.id.startsWith("entryGridHoursCell-")) {
    return document.getElementById(node.id) || node;
  }

  const closestHourCell = node.closest?.('[id^="entryGridHoursCell-"]');
  if (closestHourCell) {
    return closestHourCell;
  }

  if (node.id && node.id.startsWith("hours-cell-")) {
    return document.getElementById(
      node.id.replace(/^hours-cell-/, "entryGridHoursCell-")
    );
  }

  return null;
}

function getTargetCellKey(node) {
  return getHourCellContainer(node)?.id || node?.id || null;
}

function findEditableNodeInHourCell(hourCell) {
  if (!hourCell) return null;

  const activeElement = document.activeElement;
  if (
    hourCell.classList.contains("ag-cell-inline-editing") &&
    isTextInputElement(activeElement)
  ) {
    return activeElement;
  }

  const contentEditableNodes = Array.from(
    hourCell.querySelectorAll('[contenteditable="true"]')
  );
  const contentEditableNode = contentEditableNodes.find(
    (node) => node.getAttribute("aria-disabled") !== "true"
  );
  if (contentEditableNode) {
    return contentEditableNode;
  }

  return (
    hourCell.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
    ) || null
  );
}

function getEditableDisplayNode(editableDiv) {
  if (!editableDiv || isTextInputElement(editableDiv)) {
    return null;
  }

  return editableDiv.querySelector('span[aria-hidden="true"]');
}

function getEditableDisplayText(editableDiv) {
  const target = getLiveEditableTarget(editableDiv) || editableDiv;

  if (isTextInputElement(target)) {
    return normalizeText(target.value);
  }

  const displayNode = getEditableDisplayNode(target);
  if (displayNode) {
    return normalizeText(displayNode.textContent);
  }

  const hourCell = getHourCellContainer(target);
  if (hourCell) {
    const liveInput = hourCell.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
    );
    if (isTextInputElement(liveInput)) {
      return normalizeText(liveInput.value);
    }

    const hourDisplayNode = hourCell.querySelector(
      '[id^="hours-cell-"] span[aria-hidden="true"]'
    );
    if (hourDisplayNode) {
      return normalizeText(hourDisplayNode.textContent);
    }

    const hourDisplay = hourCell.querySelector('[id^="hours-cell-"]');
    if (hourDisplay) {
      return normalizeText(hourDisplay.textContent);
    }
  }

  return normalizeText(target.textContent);
}

function getLiveEditableTarget(editableDiv) {
  if (!editableDiv) return null;

  const currentTarget = editableDiv.id
    ? document.getElementById(editableDiv.id) || editableDiv
    : editableDiv;

  if (isTextInputElement(currentTarget)) {
    return currentTarget;
  }

  if (
    currentTarget.getAttribute?.("contenteditable") === "true" &&
    currentTarget.getAttribute("aria-disabled") !== "true"
  ) {
    return currentTarget;
  }

  return findEditableNodeInHourCell(getHourCellContainer(currentTarget));
}

function requireExecCommand() {
  if (typeof document.execCommand !== "function") {
    throw new Error("document.execCommand is not available in this browser context.");
  }
}

function forceCommitCell(editableDiv) {
  const target = getLiveEditableTarget(editableDiv);
  if (!target) return false;

  target.dispatchEvent(new Event("change", { bubbles: true }));

  if (typeof FocusEvent === "function") {
    target.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
    );
    target.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  } else {
    target.dispatchEvent(new Event("focusout", { bubbles: true }));
    target.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  if (typeof target.blur === "function") {
    target.blur();
  }

  return true;
}

function hasCommittedEditableValue(editableDiv, value) {
  const target = getLiveEditableTarget(editableDiv);
  const displayText = getEditableDisplayText(target || editableDiv);
  const expectedText = normalizeText(value);

  if (displayText === expectedText) {
    return true;
  }

  return !!getHourCellContainer(target || editableDiv) &&
    areEquivalentHourValues(displayText, expectedText);
}

function selectEditableTargetContents(target) {
  if (!target) return;

  if (isTextInputElement(target) && typeof target.select === "function") {
    target.select();
    return;
  }

  document.execCommand("selectAll", false, null);
}

async function waitForLiveEditableTarget(editableDiv, activationTarget, timeoutMs = 180) {
  const startedAt = performance.now();
  let target = getLiveEditableTarget(editableDiv) || getLiveEditableTarget(activationTarget);

  while (!target && performance.now() - startedAt < timeoutMs) {
    await wait(20);
    target = getLiveEditableTarget(editableDiv) || getLiveEditableTarget(activationTarget);
  }

  return target;
}

async function waitForCommittedEditableValue(editableDiv, value, timeoutMs = 180) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    if (hasCommittedEditableValue(editableDiv, value)) {
      return true;
    }

    await wait(20);
  }

  return hasCommittedEditableValue(editableDiv, value);
}

async function fillEditableDivWithResult(editableDiv, text) {
  requireExecCommand();

  const value = String(text);
  const maxAttempts = 2;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const activationTarget = getHourCellContainer(editableDiv) || editableDiv;
    if (!activationTarget) {
      return { filled: false, attemptCount: attemptIndex };
    }

    activationTarget.click();
    const target = await waitForLiveEditableTarget(editableDiv, activationTarget);
    if (target) {
      target.focus();
      selectEditableTargetContents(target);
      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, value);
      await nextFrame();

      pressTab(target);
      forceCommitCell(target);
    }

    if (await waitForCommittedEditableValue(editableDiv, value)) {
      return { filled: true, attemptCount: attemptIndex + 1 };
    }
  }

  return {
    filled: hasCommittedEditableValue(editableDiv, value),
    attemptCount: maxAttempts
  };
}

async function fillEditableDiv(editableDiv, text) {
  const result = await fillEditableDivWithResult(editableDiv, text);
  return result.filled;
}

function blurActiveElement() {
  const activeElement = document.activeElement;
  if (activeElement && typeof activeElement.blur === "function") {
    activeElement.blur();
  }
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

function getAssignedCodeFromContainer(container) {
  const hiddenInput = container?.querySelector(
    'input[hidden], input[readonly][hidden], input[readonly]'
  );
  return (hiddenInput?.id || hiddenInput?.value || "").trim();
}

function getAssignedCodeForRow(row) {
  return getAssignedCodeFromContainer(row?.querySelector('[col-id="Assignment"]'));
}

function getAssignedCodeForRowNumber(rowNumber) {
  return getAssignedCodeFromContainer(
    document.getElementById(`entryGridChargeCodeCell-${rowNumber}`)
  );
}

function getAssignmentText(row) {
  const assignmentContainer = row.querySelector(
    '[col-id="Assignment"] .assignment-container, [col-id="Assignment"] .WorkLocationRow'
  );

  return normalizeText(
    assignmentContainer?.getAttribute("aria-label") ||
      assignmentContainer?.innerText ||
      assignmentContainer?.textContent ||
      row.querySelector('[col-id="Assignment"]')?.innerText ||
      row.querySelector('[col-id="Assignment"]')?.textContent
  );
}

function shouldSkipRow(row, options) {
  const assignmentText = getAssignmentText(row);

  if (!assignmentText) {
    return true;
  }

  return options.excludedRowKeywords.some((keyword) =>
    assignmentText.includes(keyword)
  );
}

async function ensureWbsPopupOpenForButton(button) {
  if (!button) return null;

  button.click();
  await wait(500);

  return document.getElementById("My_TE_Time_MenuChargeCodes");
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
  const normalizedCode = String(code || "").trim();

  if (!normalizedCode) {
    return null;
  }

  const gridCells = document.querySelectorAll('[id^="entryGridChargeCodeCell-"]');
  for (const gridCell of gridCells) {
    if (!gridCell.textContent.includes(normalizedCode)) {
      continue;
    }

    const match = gridCell.id.match(/entryGridChargeCodeCell-(\d+)/);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function findWbsRowInPopup(popup, selection) {
  const normalizedCode = String(selection?.code || "").trim();
  const normalizedLabel = normalizeText(selection?.label || "");
  const rows = Array.from(popup.querySelectorAll('[role="row"][row-id]'));

  return (
    rows.find((row) => {
      const codeText = (
        row.querySelector('[col-id="code"] span[aria-hidden="true"]')
          ?.textContent || ""
      ).trim();

      if (normalizedCode && codeText === normalizedCode) {
        return true;
      }

      if (normalizedLabel && normalizeText(row.textContent).includes(normalizedLabel)) {
        return true;
      }

      return false;
    }) || null
  );
}

async function ensureWbsInRow(selection) {
  const rowNumber = Number(selection?.rowNumber);

  if (!rowNumber) {
    return null;
  }

  const expectedCode = String(selection?.code || "").trim();
  const existingRowIndex = findGridRowIndexByCode(expectedCode);
  const existingCode = getAssignedCodeForRowNumber(rowNumber);

  if (expectedCode && existingCode === expectedCode) {
    return findGridRowIndexByCode(expectedCode) ?? rowNumber;
  }

  const button = document.getElementById(`charge-code-${rowNumber}`);

  if (!button) {
    return existingRowIndex;
  }

  const popup = await ensureWbsPopupOpenForButton(button);

  if (!popup) {
    console.warn("WBS popup did not appear for row", rowNumber);
    return null;
  }

  await scrollWbsPopupToLoadAll(popup);

  const targetRow = findWbsRowInPopup(popup, selection);
  if (!targetRow) {
    console.warn("WBS not found in popup for selection", selection);
    return null;
  }

  targetRow.click();
  await wait(400);

  const resolvedCode =
    expectedCode ||
    (
      targetRow.querySelector('[col-id="code"] span[aria-hidden="true"]')
        ?.textContent || ""
    ).trim();

  return findGridRowIndexByCode(resolvedCode) ?? rowNumber;
}

async function ensureConfiguredWbsSelections(options) {
  const selections = Array.isArray(options.wbsSelections)
    ? options.wbsSelections.filter((selection) => selection?.rowNumber)
    : [];
  const resolvedSelections = [];

  for (const selection of selections) {
    const rowIndex = await ensureWbsInRow(selection);

    if (rowIndex !== null) {
      resolvedSelections.push({ ...selection, rowIndex });
    }
  }

  return resolvedSelections;
}

async function ensureWbsInRowByCode(code, rowNumber, fallbackRowIndex = null) {
  const rowIndex = await ensureWbsInRow({ rowNumber, code });
  return rowIndex ?? fallbackRowIndex;
}

/***********************
 * HOURS FILLING LOGIC
 ***********************/
const MYTE_GRID_FILL_DEFAULTS = {
  hours: "7.7",
  delayMs: 12,
  skipFilledCells: true,
  excludedRowKeywords: ["empty", "jour ferie", "holiday"],
  wbsSelections: [],
  restrictToSelectedWbs: true
};

function getNonWorkingColumns(gridRoot) {
  const nonWorkingColumns = new Set();
  const headers = gridRoot.querySelectorAll(
    '.ag-header [role="columnheader"][col-id^="Date"]'
  );

  headers.forEach((header) => {
    const columnId = header.getAttribute("col-id");

    if (!columnId) {
      return;
    }

    if (isNonWorkingDateElement(header)) {
      nonWorkingColumns.add(columnId);
    }
  });

  markHolidayRowColumns(gridRoot, nonWorkingColumns);

  return nonWorkingColumns;
}

function hasNonWorkingDateText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  const compact = normalized.replace(/[^a-z]/g, "");
  if (
    compact.includes("weekend") ||
    compact.includes("holiday") ||
    compact.includes("jourferie") ||
    compact.includes("ferie")
  ) {
    return true;
  }

  const tokens = normalized.split(/[^a-z]+/).filter(Boolean);
  return tokens.some((token) =>
    ["sat", "saturday", "sam", "samedi", "sun", "sunday", "dim", "dimanche"].includes(token)
  );
}

function getElementSearchText(element) {
  return [
    element?.getAttribute?.("class"),
    element?.getAttribute?.("aria-label"),
    element?.textContent
  ]
    .filter(Boolean)
    .join(" ");
}

function isNonWorkingDateElement(element) {
  return !!element && (
    element.classList?.contains("isWeekend") ||
    element.classList?.contains("isHoliday") ||
    hasNonWorkingDateText(getElementSearchText(element))
  );
}

function getColumnIdFromCellId(cell) {
  const id = getHourCellContainer(cell)?.id || cell?.id || "";
  const match = id.match(/^entryGridHoursCell-(\d+)-/);
  return match ? `Date${match[1]}` : "";
}

function getCellColumnId(cell) {
  return (
    cell.closest('[role="gridcell"][col-id]')?.getAttribute("col-id") ||
    getHourCellContainer(cell)?.getAttribute("col-id") ||
    getColumnIdFromCellId(cell) ||
    ""
  );
}

function isHolidayAssignmentText(value) {
  const normalized = normalizeText(value);
  return normalized.includes("jour ferie") || normalized.includes("holiday");
}

function hasVisibleCellValue(cell) {
  return getEditableDisplayText(cell).length > 0 || normalizeText(cell?.textContent).length > 0;
}

function markHolidayRowColumns(gridRoot, nonWorkingColumns) {
  const rows = Array.from(
    gridRoot.querySelectorAll('.ag-center-cols-container [role="row"][row-id]')
  );

  rows.forEach((row) => {
    if (!isHolidayAssignmentText(getAssignmentText(row))) {
      return;
    }

    row.querySelectorAll('[col-id^="Date"], [id^="entryGridHoursCell-"]').forEach((cell) => {
      const columnId = getCellColumnId(cell);
      if (!columnId) {
        return;
      }

      if (hasVisibleCellValue(cell) || isNonWorkingDateElement(cell)) {
        nonWorkingColumns.add(columnId);
      }
    });
  });
}

function isFallbackWorkingDayCell(cell, nonWorkingColumns) {
  const columnId = getCellColumnId(cell);

  if (columnId && nonWorkingColumns?.has(columnId)) {
    return false;
  }

  return !hasNonWorkingDateText(getElementSearchText(cell));
}

function isCellFilled(cell) {
  return getEditableDisplayText(cell).length > 0;
}

function isEditableHoursCell(cell) {
  return (
    cell.matches('[id^="hours-cell-"]') &&
    cell.getAttribute("contenteditable") === "true" &&
    cell.getAttribute("aria-disabled") !== "true"
  );
}

function isWorkingDayCell(cell, nonWorkingColumns) {
  const columnId = getCellColumnId(cell);

  if (!columnId || nonWorkingColumns.has(columnId)) {
    return false;
  }

  return !hasNonWorkingDateText(getElementSearchText(cell));
}

function getWorkingDayIndices(exampleRowIndex, nonWorkingColumns = new Set()) {
  const cells = Array.from(
    document.querySelectorAll(`[id^="entryGridHoursCell-"]`)
  ).filter((c) => c.id.endsWith(`-${exampleRowIndex}`));

  const indices = [];
  for (const cell of cells) {
    if (cell.classList.contains("special-cell") ||
      !isFallbackWorkingDayCell(cell, nonWorkingColumns)) {
      continue;
    }

    const m = cell.id.match(/entryGridHoursCell-(\d+)-/);
    if (m) indices.push(parseInt(m[1], 10));
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

function collectFallbackTargetCells(rowIndex, options, nonWorkingColumns = new Set()) {
  const targetCells = [];
  const workingDayIndices = getWorkingDayIndices(Number(rowIndex), nonWorkingColumns);

  for (const dayIndex of workingDayIndices) {
    const cell = document.getElementById(`entryGridHoursCell-${dayIndex}-${rowIndex}`);
    if (!cell) continue;

    if (options.skipFilledCells && isCellFilled(cell)) continue;

    targetCells.push(cell);
  }

  return targetCells;
}

function mergeTargetCells(primaryCells, fallbackCells) {
  const mergedCells = [];
  const seen = new Set();

  const appendCell = (cell) => {
    if (!cell) return;

    const key = getTargetCellKey(cell) || cell;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    mergedCells.push(cell);
  };

  primaryCells.forEach(appendCell);
  fallbackCells.forEach(appendCell);

  return mergedCells;
}

function collectTargetCellsForSelections(gridRoot, resolvedSelections, options) {
  const selectedRowIds = new Set(
    resolvedSelections.map((selection) => String(selection.rowIndex)).filter(Boolean)
  );
  const nonWorkingColumns = getNonWorkingColumns(gridRoot);
  const rows = Array.from(
    gridRoot.querySelectorAll('.ag-center-cols-container [role="row"][row-id]')
  );
  const targetCells = [];

  rows.forEach((row) => {
    if (!row.querySelector('[col-id="Assignment"] .assignment-container')) {
      return;
    }

    if (options.restrictToSelectedWbs && selectedRowIds.size) {
      const rowId = String(row.getAttribute("row-id") || "");
      const assignedCode = getAssignedCodeForRow(row);

      if (
        !selectedRowIds.has(rowId) &&
        !resolvedSelections.some((selection) => selection.code === assignedCode)
      ) {
        return;
      }
    }

    if (shouldSkipRow(row, options)) {
      return;
    }

    const rowCells = Array.from(row.querySelectorAll('.cellTooltip')).filter((cell) => {
      if (!isEditableHoursCell(cell)) {
        return false;
      }

      if (!isWorkingDayCell(cell, nonWorkingColumns)) {
        return false;
      }

      if (options.skipFilledCells && isCellFilled(cell)) {
        return false;
      }

      return true;
    });

    targetCells.push(
      ...rowCells.map((cell) => getHourCellContainer(cell) || cell)
    );
  });

  const fallbackCells = [];
  selectedRowIds.forEach((rowId) => {
    fallbackCells.push(...collectFallbackTargetCells(rowId, options, nonWorkingColumns));
  });

  return selectedRowIds.size
    ? mergeTargetCells(fallbackCells, targetCells)
    : mergeTargetCells(targetCells, fallbackCells);
}

async function fillTimesheetGridCells(overrides = {}) {
  const options = { ...MYTE_GRID_FILL_DEFAULTS, ...overrides };
  options.hours = formatHoursForInput(options.hours);
  const gridRoot = getGridRoot();

  if (!gridRoot) {
    throw new Error("Time Entry Grid not found on the current page.");
  }

  const resolvedSelections = Array.isArray(options.resolvedSelections)
    ? options.resolvedSelections
    : await ensureConfiguredWbsSelections(options);

  await advanceFrames(2);

  const nonWorkingColumns = getNonWorkingColumns(gridRoot);
  const targetCells = collectTargetCellsForSelections(
    gridRoot,
    resolvedSelections,
    options
  );

  let retriedCellCount = 0;

  for (const cell of targetCells) {
    const fillResult = await fillEditableDivWithResult(cell, options.hours);
    if (fillResult.attemptCount > 1) {
      retriedCellCount += 1;
    }
    if (options.delayMs > 0) {
      await wait(options.delayMs);
    }
  }

  blurActiveElement();
  await advanceFrames(2);

  const failedCellCount = targetCells.filter(
    (cell) => !hasCommittedEditableValue(cell, options.hours)
  ).length;
  const filledRows = new Set(
    targetCells
      .map((cell) => cell.closest('[role="row"][row-id]')?.getAttribute("row-id"))
      .filter(Boolean)
  );

  const result = {
    filledCellCount: targetCells.length,
    filledRowCount: filledRows.size,
    retriedCellCount,
    failedCellCount,
    hours: options.hours,
    nonWorkingColumns: Array.from(nonWorkingColumns).sort(),
    resolvedSelections
  };

  console.log("[MyTE] Shared fill complete.", result);
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

  const codeToPreferredRowNumber = {};
  for (let i = 0; i < allocations.length; i++) {
    const { code } = allocations[i];
    codeToPreferredRowNumber[code] = i + 1;
  }

  const perWbs = computeDailyHoursPerWbs(config);
  if (!perWbs.length) {
    alert("MyTE Autofill: cannot compute hours per WBS. Check weights.");
    showToast("Cannot compute hours per WBS. Check weights.", "error");
    return false;
  }

  console.log("[MyTE] Per-WBS daily hours distribution:", perWbs);
  for (const { code, hours } of perWbs) {
    const wbsSelection = {
      rowNumber: codeToPreferredRowNumber[code],
      code,
      label:
        (config.availableWbs || state.config.availableWbs || []).find(
          (wbs) => wbs.code === code
        )?.description || ""
    };
    const resolvedSelections = await ensureConfiguredWbsSelections({
      wbsSelections: [wbsSelection]
    });

    if (!resolvedSelections.length) {
      alert(
        `MyTE Autofill: Row not found for WBS ${code}. ` +
        `Check that this WBS is authorized for the period.`
      );
      showToast(`Row not found for WBS ${code}.`, "error");
      return false;
    }

    let fillResult;
    try {
      fillResult = await fillTimesheetGridCells({
        hours: formatHoursForInput(hours),
        wbsSelections: [wbsSelection],
        resolvedSelections,
        skipFilledCells: false
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Time Entry Grid not found on the current page.") {
        alert("MyTE Autofill: Time Entry Grid not found on the current page.");
        showToast("Time Entry Grid not found on the current page.", "error");
        return false;
      }

      throw error;
    }

    if (!fillResult.filledCellCount) {
      alert(`MyTE Autofill: No working day cells found for WBS ${code}.`);
      showToast(`No working day cells found for WBS ${code}.`, "error");
      return false;
    }

    if (fillResult.failedCellCount > 0) {
      alert(`MyTE Autofill: Some cells for WBS ${code} did not keep their value.`);
      showToast(`Some cells for WBS ${code} did not keep their value.`, "error");
      return false;
    }
  }

  console.log("[MyTE] Timesheet hours filled.");
  showToast("Timesheet hours filled successfully.", "success");
  return true;
}

/***********************
 * TIME CATEGORY LOGIC
 ***********************/
const WORK_LOCATION_CHECKBOX_PREFIXES = [
  "homeworking-full-day-",
  "homeworking-half-day-",
  "office-client-"
];

const DAILY_REST_CHECKBOX_PREFIX = "jai-respect-mon-repos-quotidien-";
const WEEKLY_REST_CHECKBOX_PREFIX = "jai-respect-mon-repos-hebdomadaire-";
const REST_CHECKBOX_PREFIXES = [
  DAILY_REST_CHECKBOX_PREFIX,
  WEEKLY_REST_CHECKBOX_PREFIX
];
const REST_SIDE_HEADER_IDS = [
  "jai-respect-mon-repos-quotidien-side-header",
  "jai-respect-mon-repos-hebdomadaire-side-header"
];

const WEEKEND_TIME_CATEGORY_INDEX = -1;

const WEEKDAY_TEXT_MATCHES = [
  { index: 0, names: ["monday", "mon", "lundi", "lun"] },
  { index: 1, names: ["tuesday", "tues", "tue", "mardi", "mar"] },
  { index: 2, names: ["wednesday", "wed", "mercredi", "mer"] },
  { index: 3, names: ["thursday", "thurs", "thu", "jeudi", "jeu"] },
  { index: 4, names: ["friday", "fri", "vendredi", "ven"] },
  { index: WEEKEND_TIME_CATEGORY_INDEX, names: ["saturday", "sat", "samedi", "sam"] },
  { index: WEEKEND_TIME_CATEGORY_INDEX, names: ["sunday", "sun", "dimanche", "dim"] }
];

function getTimeCategoryCell(index) {
  return (
    document.getElementById(`timeCategoryCell-2-${index}`) ||
    document.getElementById(`timeCategoryCell-4-${index}`)
  );
}

function isFillableTimeCategoryCell(cell) {
  return !!cell && !cell.classList.contains("special-cell");
}

function getCheckboxIndexFromId(id, prefix) {
  const suffix = String(id || "").slice(prefix.length);
  return /^\d+$/.test(suffix) ? Number(suffix) : null;
}

function getTimeCategoryCheckboxes(prefix) {
  return Array.from(document.querySelectorAll(`input[id^="${prefix}"]`)).filter(
    (checkbox) => getCheckboxIndexFromId(checkbox.id, prefix) !== null
  );
}

function hasRestRows() {
  return REST_CHECKBOX_PREFIXES.some((prefix) =>
    document.querySelector(`[id^="${prefix}"]`)
  ) || REST_SIDE_HEADER_IDS.some((id) => document.getElementById(id));
}

function getFillableTimeCategoryIndices() {
  const indices = [];

  for (let i = 0; i <= 50; i++) {
    if (isFillableTimeCategoryCell(getTimeCategoryCell(i))) {
      indices.push(i);
    }
  }

  return indices;
}

function setTimeCategoryCheckboxElement(cb, desired, options = {}) {
  if (!cb) return;

  const { skipSpecial = true } = options;
  if (skipSpecial) {
    const cell = cb.closest('[id^="timeCategoryCell-"]');
    if (!isFillableTimeCategoryCell(cell)) return;
  }

  userSetCheckbox(cb, desired);
}

function setTimeCategoryCheckbox(prefix, index, desired, options = {}) {
  const cb = document.getElementById(prefix + index);
  setTimeCategoryCheckboxElement(cb, desired, options);
}

function setTimeCategoryCheckboxes(prefixes, index, desired) {
  prefixes.forEach((prefix) => setTimeCategoryCheckbox(prefix, index, desired));
}

function setTimeCategoryCheckboxesByPrefix(prefix, desired, options = {}) {
  getTimeCategoryCheckboxes(prefix).forEach((checkbox) => {
    setTimeCategoryCheckboxElement(checkbox, desired, options);
  });
}

function getWeekdayIndexFromText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const tokens = normalized.split(/[^a-z]+/).filter(Boolean);
  for (const token of tokens) {
    for (const { index, names } of WEEKDAY_TEXT_MATCHES) {
      if (names.includes(token)) {
        return index;
      }
    }
  }

  const compact = normalized.replace(/[^a-z]/g, "");
  for (const { index, names } of WEEKDAY_TEXT_MATCHES) {
    if (names.some((name) => compact.startsWith(name))) {
      return index;
    }
  }

  return null;
}

function getDateColumnHeader(index) {
  return (
    document.querySelector(`.ag-header [role="columnheader"][col-id="Date${index}"]`) ||
    document.querySelector(`[role="columnheader"][col-id="Date${index}"]`)
  );
}

function getDateColumnWeekdayIndex(index) {
  const header = getDateColumnHeader(index);
  if (!header) return null;

  const dateCell = header.querySelector(".header-date-cell");
  const weekdayNode =
    dateCell?.querySelector("span[lang]") ||
    dateCell?.querySelector("span");
  const headerText = [
    weekdayNode?.textContent,
    header.getAttribute("aria-label"),
    header.textContent
  ]
    .filter(Boolean)
    .join(" ");

  return getWeekdayIndexFromText(headerText);
}

function getTimeCategoryWeekdayIndex(index, position) {
  const headerWeekdayIndex = getDateColumnWeekdayIndex(index);

  if (headerWeekdayIndex === WEEKEND_TIME_CATEGORY_INDEX) {
    return null;
  }

  if (headerWeekdayIndex !== null) {
    return headerWeekdayIndex;
  }

  return position % 5;
}

function applyWeeklyPatternAndRest(config) {
  const cfg = config || {};
  const weeklyPattern = cfg.weeklyPattern || {};
  const weeklyPatternEnabled = cfg.weeklyPatternEnabled !== false;
  const autoCheckRest = !!cfg.autoCheckRest;
  const fillableIndices = getFillableTimeCategoryIndices();

  // Weekly HW/Office pattern
  if (weeklyPatternEnabled) {
    fillableIndices.forEach((index, position) => {
      const dayInWeek = getTimeCategoryWeekdayIndex(index, position);
      if (dayInWeek === null) return;

      const mode = weeklyPattern[dayInWeek] || "HW";

      if (mode === "Office") {
        setTimeCategoryCheckbox("office-client-", index, true);
        setTimeCategoryCheckbox("homeworking-full-day-", index, false);
        setTimeCategoryCheckbox("homeworking-half-day-", index, false);
      } else if (mode === "HW_HALF") {
        setTimeCategoryCheckbox("homeworking-full-day-", index, false);
        setTimeCategoryCheckbox("homeworking-half-day-", index, true);
        setTimeCategoryCheckbox("office-client-", index, false);
      } else if (mode === "None") {
        setTimeCategoryCheckboxes(WORK_LOCATION_CHECKBOX_PREFIXES, index, false);
      } else {
        setTimeCategoryCheckbox("homeworking-full-day-", index, true);
        setTimeCategoryCheckbox("homeworking-half-day-", index, false);
        setTimeCategoryCheckbox("office-client-", index, false);
      }
    });
  } else {
    fillableIndices.forEach((index) => {
      setTimeCategoryCheckboxes(WORK_LOCATION_CHECKBOX_PREFIXES, index, false);
    });
  }

  // Daily / weekly rest
  setTimeCategoryCheckboxesByPrefix(DAILY_REST_CHECKBOX_PREFIX, autoCheckRest, {
    skipSpecial: true
  });
  setTimeCategoryCheckboxesByPrefix(WEEKLY_REST_CHECKBOX_PREFIX, autoCheckRest, {
    skipSpecial: !autoCheckRest
  });

  console.log("[MyTE] Time categories updated.", {
    weeklyPattern,
    weeklyPatternEnabled,
    autoCheckRest
  });
  if (weeklyPatternEnabled || autoCheckRest) {
    showToast("Time categories updated.", "success");
  } else {
    showToast("Time categories cleared.", "success");
  }
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

function isWeeklyPatternEnabled(config = state.config) {
  return config?.weeklyPatternEnabled !== false;
}

function updateWeeklyPatternVisibility() {
  if (!state.panel) return;

  const weekRows = state.panel.querySelector(".myte-week-rows");
  if (!weekRows) return;

  const enabled = isWeeklyPatternEnabled();
  weekRows.hidden = !enabled;
  weekRows.setAttribute("aria-hidden", String(!enabled));
}

function updateAutoRestVisibility() {
  if (!state.panel) return;

  const autoRestOption = state.panel.querySelector("#myte-auto-rest-option");
  const autoRest = state.panel.querySelector("#myte-auto-rest");
  const visible = hasRestRows();

  if (autoRestOption) {
    autoRestOption.hidden = !visible;
    autoRestOption.setAttribute("aria-hidden", String(!visible));
  }

  if (autoRest) {
    autoRest.disabled = !visible;
  }
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
  else if (mode === "HW_HALF") span.textContent = "🏠½";
  else if (mode === "None") span.textContent = "⬜";
  else span.textContent = "🏠";

  span.title = "Click to change";
  span.setAttribute(
    "aria-label",
    `Change ${getWeekdayLabel(dayIndex)} work location. Current: ${getWorkLocationLabel(mode)}`
  );
}

function roundWeight(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round(numericValue * 100) / 100;
}

function formatWbsLabel(wbs) {
  if (!wbs) return "";
  const code = (wbs.code || "").trim();
  const description = (wbs.description || "").trim();
  return description ? `${code} - ${description}` : code;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findWbsByPickerValue(availableWbs, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const exactCode = availableWbs.find((wbs) => (wbs.code || "").trim() === value);
  if (exactCode) return exactCode;

  const exactLabel = availableWbs.find((wbs) => formatWbsLabel(wbs) === value);
  if (exactLabel) return exactLabel;

  const [leadingCode] = value.split(" - ");
  if (!leadingCode) return null;

  return (
    availableWbs.find((wbs) => (wbs.code || "").trim() === leadingCode.trim()) ||
    null
  );
}

function getWbsMetaMarkup(wbs) {
  if (!wbs) {
    return '<span class="myte-wbs-meta-empty">Type to search by code or description.</span>';
  }

  const code = (wbs.code || "").trim();
  const description = (wbs.description || "").trim();
  return `
    <span class="myte-wbs-meta-code">${escapeHtml(code)}</span>
    <span class="myte-wbs-meta-sep">•</span>
    <span class="myte-wbs-meta-desc">${escapeHtml(description || "No description")}</span>
  `;
}

function getWbsOptionTitleMarkup(wbs) {
  const code = (wbs?.code || "").trim();
  const client = (wbs?.client || "").trim();
  const clientMarkup = client
    ? `<span class="myte-wbs-option-client"> - ${escapeHtml(client)}</span>`
    : "";

  return `
    <span class="myte-wbs-option-title">
      <span class="myte-wbs-option-code">${escapeHtml(code)}</span>${clientMarkup}
    </span>
  `;
}

function getOrderedWbsOptions(availableWbs, favoriteCodes, currentCode) {
  const favorites = [];
  const others = [];

  availableWbs.forEach((wbs) => {
    if (favoriteCodes.includes(wbs.code)) favorites.push(wbs);
    else others.push(wbs);
  });

  const ordered = favorites.concat(others);
  const current = availableWbs.find((wbs) => wbs.code === currentCode);
  if (current && !ordered.some((wbs) => wbs.code === current.code)) {
    ordered.unshift(current);
  }

  return ordered;
}

function filterWbsOptions(orderedOptions, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return orderedOptions;

  return orderedOptions.filter((wbs) => {
    const code = (wbs.code || "").toLowerCase();
    const client = (wbs.client || "").toLowerCase();
    const description = (wbs.description || "").toLowerCase();
    return (
      code.includes(normalizedQuery) ||
      client.includes(normalizedQuery) ||
      description.includes(normalizedQuery)
    );
  });
}

function closeWbsAutocomplete() {
  state.activeWbsPickerIndex = null;
  if (!state.panel) return;

  state.panel.querySelectorAll(".myte-wbs-row").forEach((row) => {
    row.classList.remove("myte-wbs-row-open");
    const dropdown = row.querySelector(".myte-wbs-dropdown");
    if (dropdown) {
      dropdown.hidden = true;
      dropdown.innerHTML = "";
    }
  });
}

function renderWbsAutocomplete(row, index) {
  const dropdown = row.querySelector(".myte-wbs-dropdown");
  if (!dropdown) return;

  const allocations = state.config.wbsAllocations || [];
  const allocation = allocations[index] || {};
  const available = state.config.availableWbs || [];
  const favoriteCodes = state.config.favoriteWbs || [];
  const options = getOrderedWbsOptions(available, favoriteCodes, allocation.code);
  const query = state.wbsDrafts[index] || "";
  const filteredOptions = filterWbsOptions(options, query);
  const isOpen = state.activeWbsPickerIndex === index;

  if (!isOpen) {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    row.classList.remove("myte-wbs-row-open");
    return;
  }

  row.classList.add("myte-wbs-row-open");
  dropdown.hidden = false;

  if (!filteredOptions.length) {
    dropdown.innerHTML = '<div class="myte-wbs-option-empty">No matching WBS</div>';
    return;
  }

  dropdown.innerHTML = filteredOptions
    .map((wbs) => {
      const isFav = favoriteCodes.includes(wbs.code);
      return `
        <button type="button" class="myte-wbs-option" data-index="${index}" data-code="${escapeHtml(wbs.code)}">
          <span class="myte-wbs-option-main">
            ${getWbsOptionTitleMarkup(wbs)}
            <span class="myte-wbs-option-desc">${escapeHtml(wbs.description || "No description")}</span>
          </span>
          ${isFav ? '<span class="myte-wbs-option-fav">★</span>' : ""}
        </button>
      `;
    })
    .join("");
}

function selectWbsForRow(index, wbs) {
  if (!state.config.wbsAllocations[index]) return;

  state.config.wbsAllocations[index].code = wbs ? wbs.code : "";
  delete state.wbsDrafts[index];
  state.activeWbsPickerIndex = null;
  saveConfig();
  renderWbsList();
}

function normalizeWeightsToTwoDecimals(allocations) {
  const normalizedItems = allocations.filter((allocation) => Number(allocation.weight || 0) > 0);
  const total = normalizedItems.reduce(
    (sum, allocation) => sum + Number(allocation.weight || 0),
    0
  );

  if (!total) return false;

  let accumulatedHundredths = 0;
  normalizedItems.forEach((allocation, idx) => {
    let hundredths;
    if (idx === normalizedItems.length - 1) {
      hundredths = 100 - accumulatedHundredths;
    } else {
      hundredths = Math.floor((Number(allocation.weight || 0) / total) * 100);
      accumulatedHundredths += hundredths;
    }

    allocation.weight = hundredths / 100;
  });

  allocations.forEach((allocation) => {
    if (!normalizedItems.includes(allocation)) {
      allocation.weight = roundWeight(allocation.weight || 0);
    }
  });

  return true;
}

function getWeekdayLabel(dayIndex) {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][dayIndex] || "Day";
}

function getWorkLocationLabel(mode) {
  if (mode === "HW") return "Homeworking - Full Day";
  if (mode === "HW_HALF") return "Homeworking - Half Day";
  if (mode === "Office") return "Office / Client";
  if (mode === "None") return "None";
  return "Homeworking - Full Day";
}

function getNextWorkLocationMode(mode) {
  if (mode === "HW") return "HW_HALF";
  if (mode === "HW_HALF") return "Office";
  if (mode === "Office") return "None";
  return "HW";
}

function setWeeklyPatternDay(dayIdx, mode) {
  if (!state.panel) return;

  state.config.weeklyPattern[dayIdx] = mode;

  const select = state.panel.querySelector(
    `.myte-week-select[data-day-index="${dayIdx}"]`
  );
  if (select) select.value = mode;

  updateWeekEmoji(dayIdx, mode);
  saveConfig();
}

/* Weight summary helper */
function updateWeightSummary() {
  if (!state.panel) return;
  const summaryEl = state.panel.querySelector("#myte-weight-summary");
  if (!summaryEl) return;

  const allocations = (state.config.wbsAllocations || []).filter(
    (w) => Number(w.weight) > 0
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

function validateWbsConfigForFill(config) {
  const allocations = config.wbsAllocations || [];
  if (!allocations.length) {
    return "Configure at least one WBS before filling the timesheet.";
  }

  const hasBlankWbs = allocations.some(
    (allocation) => !String(allocation.code || "").trim()
  );
  if (hasBlankWbs) {
    return "Select a WBS on every allocation row before filling the timesheet.";
  }

  const totalWeight = allocations.reduce(
    (sum, allocation) => sum + Number(allocation.weight || 0),
    0
  );
  if (Math.abs(totalWeight - 1) > 0.001) {
    return `Total weight must be 1.00 before filling the timesheet. Current total: ${totalWeight.toFixed(2)}.`;
  }

  return null;
}

/***********************
 * PANEL UI – creation
 ***********************/
async function createPanel() {
  if (state.panel) return state.panel;
  if (state.panelCreationPromise) return state.panelCreationPromise;

  state.panelCreationPromise = (async () => {
    const tplRoot = await loadPanelTemplate();
    if (!tplRoot) {
      if (state.panelOpenRequested) {
        showToast("MyTE Autofill: cannot load panel template.", "error");
      }
      return null;
    }

    if (!state.panelOpenRequested) {
      return null;
    }

    if (state.panel) {
      return state.panel;
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
  })();

  try {
    return await state.panelCreationPromise;
  } finally {
    state.panelCreationPromise = null;
  }
}

function removePanel() {
  state.panelOpenRequested = false;
  state.wbsFilter = "";
  state.activeWbsPickerIndex = null;
  state.wbsDrafts = {};

  if (state.panel) {
    state.panel.remove();
    state.panel = null;
  }
}

function togglePanel() {
  if (state.panel || state.panelOpenRequested) {
    removePanel();
  } else {
    state.panelOpenRequested = true;
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

  allocations.forEach((alloc, index) => {
    const row = document.createElement("div");
    row.className = "myte-wbs-row";
    const current = available.find((w) => w.code === alloc.code);
    const selectedWbs = current || null;
    const pickerValue = Object.prototype.hasOwnProperty.call(state.wbsDrafts, index)
      ? state.wbsDrafts[index]
      : selectedWbs
        ? formatWbsLabel(selectedWbs)
        : "";

    row.innerHTML = `
      <div class="myte-wbs-main">
        <input
          type="text"
          class="myte-wbs-picker"
          data-index="${index}"
          placeholder="Search WBS by code or description"
          autocomplete="off"
          value="${escapeHtml(pickerValue)}"
        />
      </div>
      <input
        type="number"
        step="0.01"
        min="0"
        class="myte-wbs-weight"
        data-index="${index}"
        placeholder="Weight"
      />
      <div class="myte-wbs-actions">
        <button class="myte-wbs-fav" data-index="${index}" title="Toggle favorite">☆</button>
        <button class="myte-wbs-remove" data-index="${index}" title="Remove">✕</button>
      </div>
      <div class="myte-wbs-meta">${getWbsMetaMarkup(selectedWbs)}</div>
      <div class="myte-wbs-dropdown" hidden></div>
    `;

    container.appendChild(row);

    const weightInput = row.querySelector(".myte-wbs-weight");
    const favBtn = row.querySelector(".myte-wbs-fav");

    if (weightInput && typeof alloc.weight !== "undefined") {
      weightInput.value = roundWeight(alloc.weight).toFixed(2);
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

    renderWbsAutocomplete(row, index);
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
  if (dailyHoursInput) dailyHoursInput.value = formatHoursForInput(cfg.dailyHours);

  const autoRest = state.panel.querySelector("#myte-auto-rest");
  if (autoRest) autoRest.checked = !!cfg.autoCheckRest;
  updateAutoRestVisibility();

  const weeklyPatternEnabled = state.panel.querySelector(
    "#myte-weekly-pattern-enabled"
  );
  if (weeklyPatternEnabled) {
    weeklyPatternEnabled.checked = isWeeklyPatternEnabled(cfg);
  }
  updateWeeklyPatternVisibility();

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

  // Normalize weights
  state.panel
    .querySelector("#myte-normalize-weights")
    ?.addEventListener("click", () => {
      const allocations = state.config.wbsAllocations || [];
      if (!normalizeWeightsToTwoDecimals(allocations)) {
        showToast("Cannot normalize: total weight is 0.", "error");
        return;
      }
      saveConfig();
      renderWbsList();
      showToast("Weights normalized to sum 1.0.", "success");
    });

  state.panel
    .querySelector("#myte-daily-hours")
    ?.addEventListener("input", (e) => {
      normalizeHoursInputValue(e.target);
    });

  state.panel
    .querySelector("#myte-daily-hours")
    ?.addEventListener("change", (e) => {
      normalizeHoursInputValue(e.target);
      const value = formatHoursForInput(e.target.value);
      e.target.value = value;
      state.config.dailyHours = Number(value);
      saveConfig();
    });

  state.panel
    .querySelector("#myte-auto-rest")
    ?.addEventListener("change", (e) => {
      state.config.autoCheckRest = !!e.target.checked;
      saveConfig();
    });

  state.panel
    .querySelector("#myte-weekly-pattern-enabled")
    ?.addEventListener("change", (e) => {
      state.config.weeklyPatternEnabled = !!e.target.checked;
      saveConfig();
      updateWeeklyPatternVisibility();
    });

  state.panel
    .querySelectorAll(".myte-week-select")
    .forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const dayIdx = Number(e.target.dataset.dayIndex);
        setWeeklyPatternDay(dayIdx, e.target.value);
      });
    });

  state.panel
    .querySelectorAll(".myte-week-emoji")
    .forEach((emojiBtn) => {
      const handleToggle = () => {
        const dayIdx = Number(emojiBtn.dataset.dayEmoji);
        const currentMode = state.config.weeklyPattern[dayIdx] || "HW";
        const nextMode = getNextWorkLocationMode(currentMode);
        setWeeklyPatternDay(dayIdx, nextMode);
      };

      emojiBtn.addEventListener("click", handleToggle);
      emojiBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle();
        }
      });
    });

  state.panel
    .querySelector("#myte-add-wbs")
    ?.addEventListener("click", () => {
      state.config.wbsAllocations.push({ code: "", weight: 1 });
      saveConfig();
      renderWbsList();
    });

  state.panel.addEventListener("click", (e) => {
    if (!e.target.closest(".myte-wbs-main") && !e.target.closest(".myte-wbs-dropdown")) {
      closeWbsAutocomplete();
    }
  });

  const wbsContainer = state.panel.querySelector("#myte-wbs-list");

  wbsContainer.addEventListener("focusin", (e) => {
    if (!e.target.classList.contains("myte-wbs-picker")) return;
    const idx = Number(e.target.dataset.index);
    state.activeWbsPickerIndex = idx;
    const row = e.target.closest(".myte-wbs-row");
    if (row) renderWbsAutocomplete(row, idx);
  });

  wbsContainer.addEventListener("input", (e) => {
    if (!e.target.classList.contains("myte-wbs-picker")) return;
    const idx = Number(e.target.dataset.index);
    state.wbsDrafts[idx] = e.target.value || "";
    state.activeWbsPickerIndex = idx;
    const row = e.target.closest(".myte-wbs-row");
    if (row) renderWbsAutocomplete(row, idx);
  });

  wbsContainer.addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("myte-wbs-picker")) return;

    const idx = Number(e.target.dataset.index);
    const row = e.target.closest(".myte-wbs-row");
    if (!row) return;

    if (e.key === "Escape") {
      closeWbsAutocomplete();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const options = filterWbsOptions(
        getOrderedWbsOptions(
          state.config.availableWbs || [],
          state.config.favoriteWbs || [],
          state.config.wbsAllocations[idx]?.code
        ),
        state.wbsDrafts[idx] || e.target.value || ""
      );
      selectWbsForRow(idx, options[0] || findWbsByPickerValue(state.config.availableWbs || [], e.target.value));
    }
  });

  wbsContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("myte-wbs-picker")) {
      if (state.isSelectingWbsOption) {
        state.isSelectingWbsOption = false;
        return;
      }

      const idx = Number(e.target.dataset.index);
      if (!state.config.wbsAllocations[idx]) return;

      const match = findWbsByPickerValue(
        state.config.availableWbs || [],
        e.target.value
      );

      state.config.wbsAllocations[idx].code = match ? match.code : "";
      delete state.wbsDrafts[idx];
      state.activeWbsPickerIndex = null;
      saveConfig();
      renderWbsList();
    }
  });

  wbsContainer.addEventListener("mousedown", (e) => {
    const option = e.target.closest(".myte-wbs-option");
    if (!option) return;

    e.preventDefault();
    state.isSelectingWbsOption = true;

    const idx = Number(option.dataset.index);
    const wbs = (state.config.availableWbs || []).find(
      (item) => item.code === option.dataset.code
    );
    selectWbsForRow(idx, wbs || null);
  });

  // Changes inside WBS list
  wbsContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("myte-wbs-weight")) {
      const idx = Number(e.target.dataset.index);
      const value = roundWeight(e.target.value || 0);
      if (!state.config.wbsAllocations[idx]) return;
      state.config.wbsAllocations[idx].weight = value;
      e.target.value = value.toFixed(2);
      saveConfig();
      updateWeightSummary();
    }
  });

  // Clicks inside WBS list (remove / favorite)
  wbsContainer.addEventListener("click", (e) => {
    const option = e.target.closest(".myte-wbs-option");
    if (option) {
      return;
    }

    if (e.target.classList.contains("myte-wbs-remove")) {
      const idx = Number(e.target.dataset.index);
      delete state.wbsDrafts[idx];
      state.config.wbsAllocations.splice(idx, 1);
      saveConfig();
      renderWbsList();
    } else if (e.target.classList.contains("myte-wbs-fav")) {
      const idx = Number(e.target.dataset.index);
      const allocation = state.config.wbsAllocations[idx];
      if (!allocation || !allocation.code) {
        showToast("Select a WBS before marking it as favorite.", "info");
        return;
      }

      const code = allocation.code;
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
      const validationError = validateWbsConfigForFill(state.config);
      if (validationError) {
        showToast(validationError, "error");
        return;
      }

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
async function init() {
  if (state.initialized) return;
  state.initialized = true;

  // Only load config. WBS auto-load is now triggered
  // *only* when the panel is opened via autoLoadWbsIfNeeded().
  await loadConfig();
}

function resetTestState(configOverrides = {}) {
  state.config = {
    ...defaultConfig,
    ...configOverrides,
    weeklyPattern: {
      ...defaultConfig.weeklyPattern,
      ...(configOverrides.weeklyPattern || {})
    },
    wbsAllocations: Array.isArray(configOverrides.wbsAllocations)
      ? configOverrides.wbsAllocations.map((allocation) => ({ ...allocation }))
      : [],
    availableWbs: Array.isArray(configOverrides.availableWbs)
      ? configOverrides.availableWbs.map((wbs) => ({ ...wbs }))
      : [],
    favoriteWbs: Array.isArray(configOverrides.favoriteWbs)
      ? [...configOverrides.favoriteWbs]
      : []
  };
  state.panel = null;
  state.initialized = false;
  state.wbsFilter = "";
  state.panelTemplate = null;
  state.panelCreationPromise = null;
  state.panelOpenRequested = false;
  state.activeWbsPickerIndex = null;
  state.wbsDrafts = {};
  state.isSelectingWbsOption = false;
}

function exposeTestApi() {
  if (!globalThis.__MYTE_TEST_MODE__) return;

  globalThis.__MYTE_TEST_API__ = {
    MYTE_STORAGE_KEY,
    defaultConfig,
    state,
    loadPanelTemplate,
    loadConfig,
    saveConfig,
    wait,
    pressTab,
    fillEditableDiv,
    showToast,
    userSetCheckbox,
    isActiveWbsRow,
    extractWbsRow,
    getAssignedCodeFromContainer,
    getAssignedCodeForRow,
    getAssignedCodeForRowNumber,
    getAssignmentText,
    shouldSkipRow,
    ensureWbsPopupOpenForButton,
    scrollWbsPopupToLoadAll,
    closeWbsPopup,
    waitForChargeCodeOpener,
    extractAllActiveWbsFromPage,
    findGridRowIndexByCode,
    findWbsRowInPopup,
    ensureWbsInRow,
    ensureConfiguredWbsSelections,
    ensureWbsInRowByCode,
    getGridRoot,
    getNonWorkingColumns,
    getCellColumnId,
    isCellFilled,
    isEditableHoursCell,
    isWorkingDayCell,
    getWorkingDayIndices,
    computeDailyHoursPerWbs,
    mergeTargetCells,
    fillTimesheetGridCells,
    fillTimesheetWithConfig,
    applyWeeklyPatternAndRest,
    applyThemeClass,
    isWeeklyPatternEnabled,
    updateWeeklyPatternVisibility,
    updateWbsButtonLabel,
    updateWbsCountLabel,
    autoLoadWbsIfNeeded,
    updateWeekEmoji,
    roundWeight,
    formatWbsLabel,
    escapeHtml,
    findWbsByPickerValue,
    getWbsMetaMarkup,
    getWbsOptionTitleMarkup,
    getOrderedWbsOptions,
    filterWbsOptions,
    closeWbsAutocomplete,
    renderWbsAutocomplete,
    selectWbsForRow,
    normalizeWeightsToTwoDecimals,
    getWeekdayLabel,
    getWorkLocationLabel,
    getNextWorkLocationMode,
    setWeeklyPatternDay,
    updateWeightSummary,
    validateWbsConfigForFill,
    hasRestRows,
    updateAutoRestVisibility,
    createPanel,
    removePanel,
    togglePanel,
    renderWbsList,
    applyConfigToUI,
    wirePanelEvents,
    init,
    resetTestState
  };
}

exposeTestApi();

if (!globalThis.__MYTE_DISABLE_AUTO_INIT__) {
  init();
}
