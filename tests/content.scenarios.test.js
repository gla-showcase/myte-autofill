// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadContentScript } from "./support/load-extension-script.js";

const NativeMouseEvent = globalThis.MouseEvent;

function buildHoursGrid() {
  const fragment = document.createDocumentFragment();

  const chargeCellOne = document.createElement("div");
  chargeCellOne.id = "entryGridChargeCodeCell-1";
  chargeCellOne.textContent = "WBS-1";
  fragment.appendChild(chargeCellOne);

  const chargeCellTwo = document.createElement("div");
  chargeCellTwo.id = "entryGridChargeCodeCell-2";
  chargeCellTwo.textContent = "WBS-2";
  fragment.appendChild(chargeCellTwo);

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    for (const rowIndex of [1, 2]) {
      const cell = document.createElement("div");
      cell.id = `entryGridHoursCell-${dayIndex}-${rowIndex}`;
      const editor = document.createElement("div");
      editor.setAttribute("contenteditable", "true");
      cell.appendChild(editor);
      fragment.appendChild(cell);
    }
  }

  document.body.appendChild(fragment);
}

function buildCategoryGrid() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 6; index += 1) {
    const cell = document.createElement("div");
    cell.id = `timeCategoryCell-2-${index}`;
    if (index === 2) {
      cell.classList.add("special-cell");
    }

    const homeworking = document.createElement("input");
    homeworking.type = "checkbox";
    homeworking.id = `homeworking-full-day-${index}`;
    cell.appendChild(homeworking);

    const office = document.createElement("input");
    office.type = "checkbox";
    office.id = `office-client-${index}`;
    cell.appendChild(office);

    const dailyRest = document.createElement("input");
    dailyRest.type = "checkbox";
    dailyRest.id = `jai-respect-mon-repos-quotidien-${index}`;
    cell.appendChild(dailyRest);

    const weeklyRest = document.createElement("input");
    weeklyRest.type = "checkbox";
    weeklyRest.id = `jai-respect-mon-repos-hebdomadaire-${index}`;
    cell.appendChild(weeklyRest);

    fragment.appendChild(cell);
  }

  document.body.appendChild(fragment);
}

function buildWbsPopupFixture() {
  const opener = document.createElement("button");
  opener.id = "charge-code-1";
  opener.className = "assignment-container";
  opener.type = "button";

  const popup = document.createElement("div");
  popup.id = "My_TE_Time_MenuChargeCodes";

  const viewport = document.createElement("div");
  viewport.className = "ag-center-cols-viewport";
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    value: 600
  });

  const rows = [
    {
      code: "WBS-ALPHA",
      description: "Alpha migration",
      active: true
    },
    {
      code: "WBS-BETA",
      description: "Beta rollout",
      active: true
    },
    {
      code: "WBS-OLD",
      description: "Closed work",
      active: false
    }
  ];

  rows.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.setAttribute("role", "row");
    rowEl.setAttribute("row-id", String(index + 1));

    const valueCell = document.createElement("div");
    valueCell.className = row.active ? "ag-cell-value" : "ag-cell-value error-cell";
    rowEl.appendChild(valueCell);

    const columns = {
      Type: "Billable",
      subtype: "External",
      client: "Contoso",
      countryRegion: "FR",
      description: row.description,
      code: row.code
    };

    Object.entries(columns).forEach(([columnId, text]) => {
      const cell = document.createElement("div");
      cell.setAttribute("col-id", columnId);
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = text;
      cell.appendChild(span);
      rowEl.appendChild(cell);
    });

    viewport.appendChild(rowEl);
  });

  popup.appendChild(viewport);

  opener.addEventListener("click", () => {
    if (document.getElementById(popup.id)) {
      popup.remove();
    } else {
      document.body.appendChild(popup);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      popup.remove();
    }
  });

  document.body.appendChild(opener);
}

async function openPanelWithStorage(storageData) {
  const loaded = await loadContentScript({ storageData });
  await loaded.api.init();
  loaded.api.state.panelOpenRequested = true;
  await loaded.api.createPanel();
  return loaded;
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.MouseEvent = NativeMouseEvent;
  delete globalThis.__MYTE_TEST_MODE__;
  delete globalThis.__MYTE_DISABLE_AUTO_INIT__;
  delete globalThis.__MYTE_TEST_API__;
  delete globalThis.chrome;
  delete globalThis.fetch;
  delete globalThis.alert;
  document.body.innerHTML = "";
});

describe("content.js scenarios", () => {
  it("creates the panel only once for concurrent opens", async () => {
    const { api } = await loadContentScript({
      storageData: {
        availableWbs: [{ code: "WBS-1", description: "Migration" }],
        wbsAllocations: [{ code: "WBS-1", weight: 1 }]
      }
    });

    await api.init();
    api.state.panelOpenRequested = true;

    const [firstPanel, secondPanel] = await Promise.all([
      api.createPanel(),
      api.createPanel()
    ]);

    expect(firstPanel).toBe(secondPanel);
    expect(document.querySelectorAll("#myte-helper-panel")).toHaveLength(1);
  });

  it("fills a multi-WBS week with exact rounded hours", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [
        { code: "WBS-1", weight: 0.25 },
        { code: "WBS-2", weight: 0.75 }
      ]
    });

    expect(success).toBe(true);

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-1 [contenteditable="true"]`).textContent
      ).toBe("1.9");
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-2 [contenteditable="true"]`).textContent
      ).toBe("5.8");
    }
  });

  it("falls back to input events when the first cold-start day cell ignores execCommand", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    const firstEditor = document.querySelector(
      '#entryGridHoursCell-0-1 [contenteditable="true"]'
    );
    let focusedElement = null;
    let firstEditorInputEvents = 0;
    const originalFocus = HTMLElement.prototype.focus;

    firstEditor.addEventListener("input", () => {
      firstEditorInputEvents += 1;
    });

    Object.defineProperty(HTMLElement.prototype, "focus", {
      configurable: true,
      writable: true,
      value() {
        focusedElement = this;
        return originalFocus.call(this);
      }
    });

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: vi.fn((command, _showUi, value) => {
        if (!focusedElement) return true;

        if (command === "delete") {
          focusedElement.textContent = "";
        } else if (command === "insertText") {
          if (focusedElement === firstEditor) {
            return true;
          }
          focusedElement.textContent = String(value ?? "");
        }

        return true;
      })
    });

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [
        { code: "WBS-1", weight: 0.25 },
        { code: "WBS-2", weight: 0.75 }
      ]
    });

    expect(success).toBe(true);
    expect(firstEditor.textContent).toBe("1.9");
    expect(firstEditorInputEvents).toBeGreaterThan(0);

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-1 [contenteditable="true"]`).textContent
      ).toBe("1.9");
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-2 [contenteditable="true"]`).textContent
      ).toBe("5.8");
    }
  });

  it("applies weekly pattern and rest checkboxes while skipping special cells", async () => {
    const { api } = await loadContentScript();
    buildCategoryGrid();

    globalThis.MouseEvent = class TestMouseEvent extends Event {
      constructor(type, options = {}) {
        super(type, options);
      }
    };

    api.applyWeeklyPatternAndRest({
      weeklyPattern: {
        0: "Office",
        1: "None",
        2: "HW",
        3: "Office",
        4: "HW"
      },
      autoCheckRest: true
    });

    expect(document.getElementById("office-client-0").checked).toBe(true);
    expect(document.getElementById("homeworking-full-day-0").checked).toBe(false);

    expect(document.getElementById("office-client-1").checked).toBe(false);
    expect(document.getElementById("homeworking-full-day-1").checked).toBe(false);

    expect(document.getElementById("office-client-2").checked).toBe(false);
    expect(document.getElementById("homeworking-full-day-2").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-quotidien-2").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-2").checked).toBe(false);

    expect(document.getElementById("office-client-3").checked).toBe(false);
    expect(document.getElementById("homeworking-full-day-3").checked).toBe(true);

    expect(document.getElementById("office-client-4").checked).toBe(true);
    expect(document.getElementById("homeworking-full-day-4").checked).toBe(false);

    expect(document.getElementById("jai-respect-mon-repos-quotidien-0").checked).toBe(true);
    expect(document.getElementById("homeworking-full-day-5").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-5").checked).toBe(true);
  });

  it("supports WBS autocomplete keyboard selection, favorites, and outside-click closing", async () => {
    const { api, storageState } = await openPanelWithStorage({
      availableWbs: [
        { code: "WBS-ALPHA", description: "Alpha migration" },
        { code: "WBS-BETA", description: "Beta rollout" },
        { code: "WBS-GAMMA", description: "Gamma support" }
      ],
      wbsAllocations: [
        { code: "", weight: 0.5 },
        { code: "WBS-GAMMA", weight: 0.5 }
      ],
      favoriteWbs: []
    });

    const firstPicker = api.state.panel.querySelector('.myte-wbs-picker[data-index="0"]');
    firstPicker.dispatchEvent(new Event("focusin", { bubbles: true }));
    firstPicker.value = "beta";
    firstPicker.dispatchEvent(new Event("input", { bubbles: true }));

    let dropdown = api.state.panel.querySelector(".myte-wbs-row .myte-wbs-dropdown");
    expect(dropdown.hidden).toBe(false);
    expect(dropdown.textContent).toContain("WBS-BETA");
    expect(dropdown.textContent).not.toContain("WBS-ALPHA");

    firstPicker.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    }));

    expect(api.state.config.wbsAllocations[0].code).toBe("WBS-BETA");
    expect(storageState.myteAutofillConfig.wbsAllocations[0].code).toBe("WBS-BETA");

    const favoriteButton = api.state.panel.querySelector('.myte-wbs-fav[data-index="0"]');
    favoriteButton.click();

    expect(api.state.config.favoriteWbs).toEqual(["WBS-BETA"]);
    expect(storageState.myteAutofillConfig.favoriteWbs).toEqual(["WBS-BETA"]);

    const secondPicker = api.state.panel.querySelector('.myte-wbs-picker[data-index="1"]');
    secondPicker.dispatchEvent(new Event("focusin", { bubbles: true }));

    const secondRow = secondPicker.closest(".myte-wbs-row");
    dropdown = secondRow.querySelector(".myte-wbs-dropdown");
    const firstOptionCode = dropdown.querySelector(".myte-wbs-option-code");
    expect(firstOptionCode.textContent).toBe("WBS-BETA");

    api.state.panel.querySelector("#myte-bottom-bar").dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(api.state.activeWbsPickerIndex).toBe(null);
    expect(dropdown.hidden).toBe(true);
  });

  it("extracts active WBS entries from the popup fixture and seeds the first allocation", async () => {
    const { api, storageState } = await openPanelWithStorage({
      availableWbs: [{ code: "TEMP", description: "Skip auto-load" }],
      wbsAllocations: [],
      favoriteWbs: []
    });

    buildWbsPopupFixture();

    const wbs = await api.extractAllActiveWbsFromPage();
    api.state.config.availableWbs = wbs;
    if (!api.state.config.wbsAllocations.length && wbs.length) {
      api.state.config.wbsAllocations = [{ code: wbs[0].code, weight: 1 }];
    }
    api.saveConfig();
    api.renderWbsList();
    api.updateWbsCountLabel();
    api.updateWbsButtonLabel();

    expect(api.state.config.availableWbs).toHaveLength(2);
    expect(api.state.config.availableWbs.map((item) => item.code)).toEqual([
      "WBS-ALPHA",
      "WBS-BETA"
    ]);
    expect(api.state.config.wbsAllocations).toEqual([
      { code: "WBS-ALPHA", weight: 1 }
    ]);
    expect(storageState.myteAutofillConfig.availableWbs).toHaveLength(2);
    expect(api.state.panel.querySelector("#myte-wbs-count-number").textContent).toBe("2");
    expect(api.state.panel.querySelector("#myte-load-wbs .myte-btn-label").textContent).toBe("Reload WBS");
  });
});
