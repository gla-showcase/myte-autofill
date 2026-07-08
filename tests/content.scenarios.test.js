// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadContentScript } from "./support/load-extension-script.js";

const NativeMouseEvent = globalThis.MouseEvent;

function buildHoursGrid(options = {}) {
  const { includeChargeCodes = true } = options;
  const gridRoot = document.createElement("div");
  gridRoot.setAttribute("aria-label", "Time Entry Grid");
  gridRoot.className = "ag-root";
  gridRoot.setAttribute("role", "grid");

  if (includeChargeCodes) {
    const chargeCellOne = document.createElement("div");
    chargeCellOne.id = "entryGridChargeCodeCell-1";
    chargeCellOne.textContent = "WBS-1";
    gridRoot.appendChild(chargeCellOne);

    const chargeCellTwo = document.createElement("div");
    chargeCellTwo.id = "entryGridChargeCodeCell-2";
    chargeCellTwo.textContent = "WBS-2";
    gridRoot.appendChild(chargeCellTwo);
  }

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    for (const rowIndex of [1, 2]) {
      const cell = document.createElement("div");
      cell.id = `entryGridHoursCell-${dayIndex}-${rowIndex}`;
      const editor = document.createElement("div");
      editor.setAttribute("contenteditable", "true");
      cell.appendChild(editor);
      gridRoot.appendChild(cell);
    }
  }

  document.body.appendChild(gridRoot);
}

function buildCategoryGrid(options = {}) {
  const {
    cellCount = 6,
    specialIndices = [2],
    rowId = 2,
    includeWorkLocation = true,
    includeRest = true
  } = options;
  const specialIndexSet = new Set(specialIndices);
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < cellCount; index += 1) {
    const cell = document.createElement("div");
    cell.id = `timeCategoryCell-${rowId}-${index}`;
    if (specialIndexSet.has(index)) {
      cell.classList.add("special-cell");
    }

    if (includeWorkLocation) {
      const homeworking = document.createElement("input");
      homeworking.type = "checkbox";
      homeworking.id = `homeworking-full-day-${index}`;
      cell.appendChild(homeworking);

      const homeworkingHalfDay = document.createElement("input");
      homeworkingHalfDay.type = "checkbox";
      homeworkingHalfDay.id = `homeworking-half-day-${index}`;
      cell.appendChild(homeworkingHalfDay);

      const office = document.createElement("input");
      office.type = "checkbox";
      office.id = `office-client-${index}`;
      cell.appendChild(office);
    }

    if (includeRest) {
      const dailyRest = document.createElement("input");
      dailyRest.type = "checkbox";
      dailyRest.id = `jai-respect-mon-repos-quotidien-${index}`;
      cell.appendChild(dailyRest);

      const weeklyRest = document.createElement("input");
      weeklyRest.type = "checkbox";
      weeklyRest.id = `jai-respect-mon-repos-hebdomadaire-${index}`;
      cell.appendChild(weeklyRest);
    }

    fragment.appendChild(cell);
  }

  document.body.appendChild(fragment);
}

function buildDateHeaders(weekdayLabels) {
  const header = document.createElement("div");
  header.className = "ag-header";

  weekdayLabels.forEach((weekdayLabel, index) => {
    const column = document.createElement("div");
    column.setAttribute("role", "columnheader");
    column.setAttribute("col-id", `Date${index}`);

    const dateCell = document.createElement("div");
    dateCell.className = "header-date-cell";

    const weekday = document.createElement("span");
    weekday.setAttribute("lang", "en-US");
    weekday.textContent = weekdayLabel;
    dateCell.appendChild(weekday);

    column.appendChild(dateCell);
    header.appendChild(column);
  });

  document.body.appendChild(header);
}

function localizeCommittedHourDisplays(root = document) {
  root.querySelectorAll('[contenteditable="true"]').forEach((editor) => {
    const localizeValue = () => {
      editor.textContent = editor.textContent.replace(".", ",");
    };

    editor.addEventListener("change", localizeValue);
    editor.addEventListener("focusout", localizeValue);
  });
}

function installCheckboxMouseEventShim() {
  globalThis.MouseEvent = class TestMouseEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
    }
  };
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

async function openPanelAfterPageSetup(storageData, setupPage) {
  const loaded = await loadContentScript({ storageData });
  setupPage?.();
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

  it("hides weekly pattern controls and persists the weekly toggle", async () => {
    const { api, storageState } = await openPanelWithStorage({
      weeklyPatternEnabled: false,
      availableWbs: [{ code: "WBS-1", description: "Migration" }],
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    const toggle = api.state.panel.querySelector("#myte-weekly-pattern-enabled");
    const weekRows = api.state.panel.querySelector(".myte-week-rows");

    expect(toggle.checked).toBe(false);
    expect(weekRows.hidden).toBe(true);
    expect(
      Array.from(
        api.state.panel.querySelectorAll('.myte-week-select[data-day-index="0"] option')
      ).map((option) => option.textContent)
    ).toEqual([
      "Homeworking - Full Day",
      "Homeworking - Half Day",
      "Office / Client",
      "None"
    ]);

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));

    expect(api.state.config.weeklyPatternEnabled).toBe(true);
    expect(storageState.myteAutofillConfig.weeklyPatternEnabled).toBe(true);
    expect(weekRows.hidden).toBe(false);
  });

  it("normalizes daily hours input to a dot decimal in the panel", async () => {
    const { api, storageState } = await openPanelWithStorage({
      dailyHours: "7,7",
      availableWbs: [{ code: "WBS-1", description: "Migration" }],
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    const input = api.state.panel.querySelector("#myte-daily-hours");
    expect(input.value).toBe("7.7");

    input.value = "8,2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.value).toBe("8.2");

    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("8.2");
    expect(storageState.myteAutofillConfig.dailyHours).toBe(8.2);
  });

  it("hides auto rest when daily and weekly rest rows are absent", async () => {
    const { api } = await openPanelAfterPageSetup(
      {
        availableWbs: [{ code: "WBS-1", description: "Migration" }],
        wbsAllocations: [{ code: "WBS-1", weight: 1 }]
      },
      () => buildCategoryGrid({ includeRest: false })
    );

    const option = api.state.panel.querySelector("#myte-auto-rest-option");
    const checkbox = api.state.panel.querySelector("#myte-auto-rest");

    expect(option.hidden).toBe(true);
    expect(option.getAttribute("aria-hidden")).toBe("true");
    expect(checkbox.disabled).toBe(true);
  });

  it("shows auto rest when rest rows exist on arbitrary MyTE row ids", async () => {
    const { api } = await openPanelAfterPageSetup(
      {
        availableWbs: [{ code: "WBS-1", description: "Migration" }],
        wbsAllocations: [{ code: "WBS-1", weight: 1 }]
      },
      () => buildCategoryGrid({ rowId: 5, includeWorkLocation: false })
    );

    const option = api.state.panel.querySelector("#myte-auto-rest-option");
    const checkbox = api.state.panel.querySelector("#myte-auto-rest");

    expect(option.hidden).toBe(false);
    expect(option.getAttribute("aria-hidden")).toBe("false");
    expect(checkbox.disabled).toBe(false);
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

  it("types dot decimals into hour cells even when fill options use a comma", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    const result = await api.fillTimesheetGridCells({
      hours: "7,7",
      resolvedSelections: [{ rowNumber: 1, code: "WBS-1", rowIndex: 1 }],
      wbsSelections: [{ rowNumber: 1, code: "WBS-1" }]
    });

    expect(result.hours).toBe("7.7");
    expect(result.failedCellCount).toBe(0);
    expect(
      document.querySelector('#entryGridHoursCell-0-1 [contenteditable="true"]').textContent
    ).toBe("7.7");
  });

  it("accepts localized comma decimals after MyTE commits hour values", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();
    localizeCommittedHourDisplays();

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    expect(success).toBe(true);
    expect(globalThis.alert).not.toHaveBeenCalledWith(
      expect.stringContaining("did not keep their value")
    );

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-1 [contenteditable="true"]`).textContent
      ).toBe("7,7");
    }
  });

  it("applies time category checkboxes after localized committed hours from the panel", async () => {
    const { api } = await openPanelWithStorage({
      dailyHours: 7.7,
      availableWbs: [{ code: "WBS-1", description: "Migration" }],
      wbsAllocations: [{ code: "WBS-1", weight: 1 }],
      weeklyPattern: {
        0: "Office",
        1: "HW",
        2: "HW",
        3: "HW",
        4: "HW"
      },
      autoCheckRest: true
    });
    buildHoursGrid();
    buildCategoryGrid();
    localizeCommittedHourDisplays();
    installCheckboxMouseEventShim();

    api.state.panel.querySelector("#myte-fill-btn-fixed").click();
    await api.wait(700);

    expect(globalThis.alert).not.toHaveBeenCalledWith(
      expect.stringContaining("did not keep their value")
    );
    expect(document.getElementById("office-client-0").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-quotidien-0").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-0").checked).toBe(true);
  });

  it("can fill the same timesheet more than once", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    const config = {
      dailyHours: 7.7,
      wbsAllocations: [
        { code: "WBS-1", weight: 0.25 },
        { code: "WBS-2", weight: 0.75 }
      ]
    };

    expect(await api.fillTimesheetWithConfig(config)).toBe(true);
    expect(await api.fillTimesheetWithConfig(config)).toBe(true);
    expect(globalThis.alert).not.toHaveBeenCalledWith(
      expect.stringContaining("No working day cells found")
    );

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-1 [contenteditable="true"]`).textContent
      ).toBe("1.9");
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-2 [contenteditable="true"]`).textContent
      ).toBe("5.8");
    }
  });

  it("merges fallback entryGridHoursCell targets when the first editor is missing from row scan", async () => {
    const { api } = await loadContentScript();

    const gridRoot = document.createElement("div");
    gridRoot.setAttribute("aria-label", "Time Entry Grid");
    gridRoot.className = "ag-root";
    gridRoot.setAttribute("role", "grid");

    const header = document.createElement("div");
    header.className = "ag-header";
    gridRoot.appendChild(header);

    const center = document.createElement("div");
    center.className = "ag-center-cols-container";
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.setAttribute("row-id", "1");

    const assignmentCell = document.createElement("div");
    assignmentCell.setAttribute("col-id", "Assignment");
    const assignmentButton = document.createElement("button");
    assignmentButton.className = "assignment-container";
    assignmentButton.textContent = "WBS-1";
    assignmentCell.appendChild(assignmentButton);
    row.appendChild(assignmentCell);

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const outerCell = document.createElement("div");
      outerCell.id = `entryGridHoursCell-${dayIndex}-1`;
      outerCell.setAttribute("role", "gridcell");
      outerCell.setAttribute("col-id", `Date${dayIndex}`);

      const editor = document.createElement("div");
      editor.id = `hours-cell-${dayIndex}-1`;
      editor.setAttribute("contenteditable", "true");
      editor.setAttribute("aria-disabled", "false");
      if (dayIndex !== 0) {
        editor.className = "cellTooltip";
      }

      outerCell.appendChild(editor);
      row.appendChild(outerCell);
    }

    center.appendChild(row);
    gridRoot.appendChild(center);
    document.body.appendChild(gridRoot);

    const chargeCell = document.createElement("div");
    chargeCell.id = "entryGridChargeCodeCell-1";
    chargeCell.textContent = "WBS-1";
    document.body.appendChild(chargeCell);

    const result = await api.fillTimesheetGridCells({
      hours: "7.7",
      resolvedSelections: [{ rowNumber: 1, code: "WBS-1", rowIndex: 1 }],
      wbsSelections: [{ rowNumber: 1, code: "WBS-1" }]
    });

    expect(result.filledCellCount).toBe(5);
    expect(document.getElementById("hours-cell-0-1").textContent).toBe("7.7");
    expect(document.getElementById("hours-cell-1-1").textContent).toBe("7.7");
  });

  it("skips holiday columns discovered from Jour Ferie rows in fallback targets", async () => {
    const { api } = await loadContentScript();

    const gridRoot = document.createElement("div");
    gridRoot.setAttribute("aria-label", "Time Entry Grid");
    gridRoot.className = "ag-root";
    gridRoot.setAttribute("role", "grid");

    const header = document.createElement("div");
    header.className = "ag-header";
    ["Mon 25", "Tue 26", "Wed 27"].forEach((label, dayIndex) => {
      const column = document.createElement("div");
      column.setAttribute("role", "columnheader");
      column.setAttribute("col-id", `Date${dayIndex}`);
      column.textContent = label;
      header.appendChild(column);
    });
    gridRoot.appendChild(header);

    const center = document.createElement("div");
    center.className = "ag-center-cols-container";

    const workRow = document.createElement("div");
    workRow.setAttribute("role", "row");
    workRow.setAttribute("row-id", "1");

    const assignmentCell = document.createElement("div");
    assignmentCell.setAttribute("col-id", "Assignment");
    const assignmentButton = document.createElement("button");
    assignmentButton.className = "assignment-container";
    assignmentButton.textContent = "WBS-1";
    assignmentCell.appendChild(assignmentButton);
    workRow.appendChild(assignmentCell);

    for (let dayIndex = 0; dayIndex < 3; dayIndex += 1) {
      const outerCell = document.createElement("div");
      outerCell.id = `entryGridHoursCell-${dayIndex}-1`;
      outerCell.setAttribute("role", "gridcell");
      outerCell.setAttribute("col-id", `Date${dayIndex}`);

      const editor = document.createElement("div");
      editor.id = `hours-cell-${dayIndex}-1`;
      editor.className = "cellTooltip";
      editor.setAttribute("contenteditable", "true");
      editor.setAttribute("aria-disabled", "false");
      outerCell.appendChild(editor);
      workRow.appendChild(outerCell);
    }

    const holidayRow = document.createElement("div");
    holidayRow.setAttribute("role", "row");
    holidayRow.setAttribute("row-id", "2");

    const holidayAssignmentCell = document.createElement("div");
    holidayAssignmentCell.setAttribute("col-id", "Assignment");
    const holidayAssignmentButton = document.createElement("button");
    holidayAssignmentButton.className = "assignment-container";
    holidayAssignmentButton.textContent = "Jour Férié (515B01)";
    holidayAssignmentCell.appendChild(holidayAssignmentButton);
    holidayRow.appendChild(holidayAssignmentCell);

    for (let dayIndex = 0; dayIndex < 3; dayIndex += 1) {
      const holidayCell = document.createElement("div");
      holidayCell.setAttribute("role", "gridcell");
      holidayCell.setAttribute("col-id", `Date${dayIndex}`);
      holidayCell.textContent = dayIndex === 1 ? "7,7" : "";
      holidayRow.appendChild(holidayCell);
    }

    center.appendChild(workRow);
    center.appendChild(holidayRow);
    gridRoot.appendChild(center);
    document.body.appendChild(gridRoot);

    const chargeCell = document.createElement("div");
    chargeCell.id = "entryGridChargeCodeCell-1";
    chargeCell.textContent = "WBS-1";
    document.body.appendChild(chargeCell);

    const result = await api.fillTimesheetGridCells({
      hours: "7.7",
      resolvedSelections: [{ rowNumber: 1, code: "WBS-1", rowIndex: 1 }],
      wbsSelections: [{ rowNumber: 1, code: "WBS-1" }]
    });

    expect(result.filledCellCount).toBe(2);
    expect(result.failedCellCount).toBe(0);
    expect(result.nonWorkingColumns).toEqual(["Date1"]);
    expect(document.getElementById("hours-cell-0-1").textContent).toBe("7.7");
    expect(document.getElementById("hours-cell-1-1").textContent).toBe("");
    expect(document.getElementById("hours-cell-2-1").textContent).toBe("7.7");
  });

  it("fills a first cell that only exposes an inline input editor after activation", async () => {
    const { api } = await loadContentScript();

    const gridRoot = document.createElement("div");
    gridRoot.setAttribute("aria-label", "Time Entry Grid");
    gridRoot.className = "ag-root";
    gridRoot.setAttribute("role", "grid");

    const header = document.createElement("div");
    header.className = "ag-header";
    gridRoot.appendChild(header);

    const center = document.createElement("div");
    center.className = "ag-center-cols-container";
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.setAttribute("row-id", "1");

    const assignmentCell = document.createElement("div");
    assignmentCell.setAttribute("col-id", "Assignment");
    const assignmentButton = document.createElement("button");
    assignmentButton.className = "assignment-container";
    assignmentButton.textContent = "WBS-1";
    assignmentCell.appendChild(assignmentButton);
    row.appendChild(assignmentCell);

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const outerCell = document.createElement("div");
      outerCell.id = `entryGridHoursCell-${dayIndex}-1`;
      outerCell.setAttribute("role", "gridcell");
      outerCell.setAttribute("col-id", `Date${dayIndex}`);

      if (dayIndex === 0) {
        const disabledEditor = document.createElement("div");
        disabledEditor.id = `hours-cell-${dayIndex}-1`;
        disabledEditor.className = "cellTooltip";
        disabledEditor.setAttribute("contenteditable", "false");
        disabledEditor.setAttribute("aria-disabled", "true");
        outerCell.appendChild(disabledEditor);

        outerCell.addEventListener("click", () => {
          if (outerCell.querySelector("input.mat-mdc-tooltip-trigger")) {
            return;
          }

          window.setTimeout(() => {
            outerCell.innerHTML = "";
            const liveInput = document.createElement("input");
            liveInput.className = "mat-mdc-tooltip-trigger";
            outerCell.appendChild(liveInput);
            liveInput.focus();
          }, 25);
        });
      } else {
        const editor = document.createElement("div");
        editor.id = `hours-cell-${dayIndex}-1`;
        editor.className = "cellTooltip";
        editor.setAttribute("contenteditable", "true");
        editor.setAttribute("aria-disabled", "false");
        outerCell.appendChild(editor);
      }

      row.appendChild(outerCell);
    }

    center.appendChild(row);
    gridRoot.appendChild(center);
    document.body.appendChild(gridRoot);

    const chargeCell = document.createElement("div");
    chargeCell.id = "entryGridChargeCodeCell-1";
    chargeCell.textContent = "WBS-1";
    document.body.appendChild(chargeCell);

    const result = await api.fillTimesheetGridCells({
      hours: "7.7",
      resolvedSelections: [{ rowNumber: 1, code: "WBS-1", rowIndex: 1 }],
      wbsSelections: [{ rowNumber: 1, code: "WBS-1" }]
    });

    expect(result.filledCellCount).toBe(5);
    expect(result.retriedCellCount).toBe(0);
    expect(document.querySelector("#entryGridHoursCell-0-1 input.mat-mdc-tooltip-trigger")?.value).toBe("7.7");
    expect(document.getElementById("hours-cell-1-1")?.textContent).toBe("7.7");
  });

  it("fills the first active inline editor even when MyTE renders the input outside the cell", async () => {
    const { api } = await loadContentScript();

    const gridRoot = document.createElement("div");
    gridRoot.setAttribute("aria-label", "Time Entry Grid");
    gridRoot.className = "ag-root";
    gridRoot.setAttribute("role", "grid");

    const center = document.createElement("div");
    center.className = "ag-center-cols-container";
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.setAttribute("row-id", "1");

    const assignmentCell = document.createElement("div");
    assignmentCell.setAttribute("col-id", "Assignment");
    const assignmentButton = document.createElement("button");
    assignmentButton.className = "assignment-container";
    assignmentButton.textContent = "WBS-1";
    assignmentCell.appendChild(assignmentButton);
    row.appendChild(assignmentCell);

    let floatingInput = null;
    let committedFloatingValue = "";
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const outerCell = document.createElement("div");
      outerCell.id = `entryGridHoursCell-${dayIndex}-1`;
      outerCell.setAttribute("role", "gridcell");
      outerCell.setAttribute("col-id", `Date${dayIndex}`);

      if (dayIndex === 0) {
        const disabledEditor = document.createElement("div");
        disabledEditor.id = "hours-cell-0-1";
        disabledEditor.className = "cellTooltip";
        disabledEditor.setAttribute("contenteditable", "false");
        disabledEditor.setAttribute("aria-disabled", "true");
        outerCell.appendChild(disabledEditor);

        outerCell.addEventListener("click", () => {
          outerCell.classList.add("ag-cell-inline-editing");
          if (!floatingInput) {
            floatingInput = document.createElement("input");
            floatingInput.id = "floating-hours-editor-0-1";
            floatingInput.className = "mat-mdc-tooltip-trigger";
            floatingInput.addEventListener("focusout", () => {
              committedFloatingValue = floatingInput.value;
              disabledEditor.setAttribute("contenteditable", "true");
              disabledEditor.setAttribute("aria-disabled", "false");
              disabledEditor.textContent = floatingInput.value;
              outerCell.classList.remove("ag-cell-inline-editing");
              floatingInput.remove();
              floatingInput = null;
            });
            document.body.appendChild(floatingInput);
          }
          floatingInput.focus();
        });
      } else {
        const editor = document.createElement("div");
        editor.id = `hours-cell-${dayIndex}-1`;
        editor.className = "cellTooltip";
        editor.setAttribute("contenteditable", "true");
        editor.setAttribute("aria-disabled", "false");
        outerCell.appendChild(editor);
      }

      row.appendChild(outerCell);
    }

    center.appendChild(row);
    gridRoot.appendChild(center);
    document.body.appendChild(gridRoot);

    const chargeCell = document.createElement("div");
    chargeCell.id = "entryGridChargeCodeCell-1";
    chargeCell.textContent = "WBS-1";
    document.body.appendChild(chargeCell);

    const insertTargets = [];
    const origExec = document.execCommand.bind(document);
    vi.spyOn(document, "execCommand").mockImplementation((cmd, ui, val) => {
      if (cmd === "insertText") {
        insertTargets.push(document.activeElement?.id || document.activeElement?.tagName);
      }
      return origExec(cmd, ui, val);
    });

    document.getElementById("entryGridHoursCell-0-1").click();

    const result = await api.fillTimesheetGridCells({
      hours: "7.7",
      resolvedSelections: [{ rowNumber: 1, code: "WBS-1", rowIndex: 1 }],
      wbsSelections: [{ rowNumber: 1, code: "WBS-1" }]
    });

    expect(result.filledCellCount).toBe(5);
    expect(result.failedCellCount).toBe(0);
    expect(insertTargets[0]).toBe("floating-hours-editor-0-1");
    expect(committedFloatingValue).toBe("7.7");
    expect(document.getElementById("hours-cell-1-1")?.textContent).toBe("7.7");
  });

  it("fills the first cell even when the initial insertText is silently ignored (cold-load)", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    // Simulate cold-load: the very first execCommand("insertText") on the
    // first editable is silently swallowed (no-op), matching the observed
    // behaviour on a fresh MyTE page.
    let insertBlocked = true;
    const origExec = document.execCommand.bind(document);
    vi.spyOn(document, "execCommand").mockImplementation((cmd, ui, val) => {
      if (cmd === "insertText" && insertBlocked) {
        insertBlocked = false; // only block the very first attempt
        return false;
      }
      return origExec(cmd, ui, val);
    });

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    expect(success).toBe(true);

    // The first cell must have been filled by the retry path.
    expect(
      document.querySelector('#entryGridHoursCell-0-1 [contenteditable="true"]').textContent
    ).toBe("7.7");

    // Remaining days should also be filled.
    for (let dayIndex = 1; dayIndex < 5; dayIndex += 1) {
      expect(
        document.querySelector(`#entryGridHoursCell-${dayIndex}-1 [contenteditable="true"]`).textContent
      ).toBe("7.7");
    }
  });

  it("fills after selecting a WBS from the dropdown without forcing popup close", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid({ includeChargeCodes: false });

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

    const rowEl = document.createElement("div");
    rowEl.setAttribute("role", "row");
    rowEl.setAttribute("row-id", "1");

    const valueCell = document.createElement("div");
    valueCell.className = "ag-cell-value";
    rowEl.appendChild(valueCell);

    [
      ["Type", "Billable"],
      ["subtype", "External"],
      ["client", "Contoso"],
      ["countryRegion", "FR"],
      ["description", "Migration"],
      ["code", "WBS-1"]
    ].forEach(([columnId, text]) => {
      const cell = document.createElement("div");
      cell.setAttribute("col-id", columnId);
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = text;
      cell.appendChild(span);
      rowEl.appendChild(cell);
    });

    viewport.appendChild(rowEl);
    popup.appendChild(viewport);

    opener.addEventListener("click", () => {
      if (document.getElementById(popup.id)) {
        popup.remove();
      } else {
        document.body.appendChild(popup);
      }
    });

    const firstEditable = document.querySelector(
      '#entryGridHoursCell-0-1 [contenteditable="true"]'
    );
    let escapeCount = 0;

    rowEl.addEventListener("click", () => {
      const chargeCell = document.createElement("div");
      chargeCell.id = "entryGridChargeCodeCell-1";
      chargeCell.textContent = "WBS-1";
      document.body.appendChild(chargeCell);
      popup.remove();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        escapeCount += 1;
        popup.remove();
        opener.focus();
      }
    });

    document.body.appendChild(opener);

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    expect(success).toBe(true);
    expect(escapeCount).toBe(0);
    expect(firstEditable.textContent).toBe("7.7");
    expect(
      document.querySelector('#entryGridHoursCell-1-1 [contenteditable="true"]').textContent
    ).toBe("7.7");
  });

  it("fills the first row even when the outer hours cell is already active", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    const firstCell = document.getElementById("entryGridHoursCell-0-1");
    const firstEditable = firstCell.querySelector('[contenteditable="true"]');

    firstCell.focus();

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    expect(success).toBe(true);
    expect(firstEditable.textContent).toBe("7.7");
  });

  it("retries when the first committed value disappears during the initial Tab transition", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

    const firstEditable = document.querySelector(
      '#entryGridHoursCell-0-1 [contenteditable="true"]'
    );

    let dropFirstCommit = true;
    firstEditable.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && dropFirstCommit) {
        dropFirstCommit = false;
        firstEditable.textContent = "";
      }
    });

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    expect(success).toBe(true);
    expect(firstEditable.textContent).toBe("7.7");
  });

  it("reselects an existing WBS row before filling when MyTE requires row priming", async () => {
    const { api } = await loadContentScript();
    buildHoursGrid();

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

    const rowEl = document.createElement("div");
    rowEl.setAttribute("role", "row");
    rowEl.setAttribute("row-id", "1");

    const valueCell = document.createElement("div");
    valueCell.className = "ag-cell-value";
    rowEl.appendChild(valueCell);

    [
      ["Type", "Billable"],
      ["subtype", "External"],
      ["client", "Contoso"],
      ["countryRegion", "FR"],
      ["description", "Migration"],
      ["code", "WBS-1"]
    ].forEach(([columnId, text]) => {
      const cell = document.createElement("div");
      cell.setAttribute("col-id", columnId);
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = text;
      cell.appendChild(span);
      rowEl.appendChild(cell);
    });

    viewport.appendChild(rowEl);
    popup.appendChild(viewport);

    opener.addEventListener("click", () => {
      if (document.getElementById(popup.id)) {
        popup.remove();
      } else {
        document.body.appendChild(popup);
      }
    });

    document.body.appendChild(opener);

    let rowPrimed = false;
    rowEl.addEventListener("click", () => {
      rowPrimed = true;
      popup.remove();
    });

    const firstEditable = document.querySelector(
      '#entryGridHoursCell-0-1 [contenteditable="true"]'
    );
    const origExec = document.execCommand.bind(document);
    vi.spyOn(document, "execCommand").mockImplementation((cmd, ui, val) => {
      if (cmd === "insertText" && !rowPrimed && document.activeElement === firstEditable) {
        return false;
      }
      return origExec(cmd, ui, val);
    });

    const success = await api.fillTimesheetWithConfig({
      dailyHours: 7.7,
      wbsAllocations: [{ code: "WBS-1", weight: 1 }]
    });

    expect(success).toBe(true);
    expect(rowPrimed).toBe(true);
    expect(firstEditable.textContent).toBe("7.7");
  });

  it("applies weekly pattern and rest checkboxes while skipping special cells", async () => {
    const { api } = await loadContentScript();
    buildCategoryGrid();
    document.getElementById("homeworking-half-day-0").checked = true;
    document.getElementById("homeworking-half-day-3").checked = true;

    installCheckboxMouseEventShim();

    api.applyWeeklyPatternAndRest({
      weeklyPattern: {
        0: "Office",
        1: "None",
        2: "HW_HALF",
        3: "Office",
        4: "HW"
      },
      autoCheckRest: true
    });

    expect(document.getElementById("office-client-0").checked).toBe(true);
    expect(document.getElementById("homeworking-full-day-0").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-0").checked).toBe(false);

    expect(document.getElementById("office-client-1").checked).toBe(false);
    expect(document.getElementById("homeworking-full-day-1").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-1").checked).toBe(false);

    expect(document.getElementById("office-client-2").checked).toBe(false);
    expect(document.getElementById("homeworking-full-day-2").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-quotidien-2").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-2").checked).toBe(true);

    expect(document.getElementById("office-client-3").checked).toBe(false);
    expect(document.getElementById("homeworking-full-day-3").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-3").checked).toBe(true);

    expect(document.getElementById("office-client-4").checked).toBe(true);
    expect(document.getElementById("homeworking-full-day-4").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-4").checked).toBe(false);

    expect(document.getElementById("jai-respect-mon-repos-quotidien-0").checked).toBe(true);
    expect(document.getElementById("homeworking-full-day-5").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-5").checked).toBe(true);
  });

  it("checks weekly rest on special cells while skipping daily rest", async () => {
    const { api } = await loadContentScript();
    buildCategoryGrid({
      cellCount: 3,
      rowId: 5,
      specialIndices: [1],
      includeWorkLocation: false
    });
    installCheckboxMouseEventShim();

    api.applyWeeklyPatternAndRest({
      weeklyPatternEnabled: false,
      autoCheckRest: true
    });

    expect(document.getElementById("jai-respect-mon-repos-quotidien-0").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-0").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-quotidien-1").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-1").checked).toBe(true);
  });

  it("matches weekly pattern checkboxes to the Date column weekdays", async () => {
    const { api } = await loadContentScript();
    buildDateHeaders(["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]);
    buildCategoryGrid({ cellCount: 8, specialIndices: [3, 4, 5] });
    installCheckboxMouseEventShim();

    document.getElementById("office-client-5").checked = true;
    document.getElementById("homeworking-full-day-5").checked = true;

    api.applyWeeklyPatternAndRest({
      weeklyPattern: {
        0: "Office",
        1: "None",
        2: "HW",
        3: "HW_HALF",
        4: "Office"
      },
      autoCheckRest: false
    });

    expect(document.getElementById("homeworking-full-day-0").checked).toBe(true);
    expect(document.getElementById("office-client-0").checked).toBe(false);

    expect(document.getElementById("homeworking-full-day-1").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-1").checked).toBe(true);
    expect(document.getElementById("office-client-1").checked).toBe(false);

    expect(document.getElementById("homeworking-full-day-2").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-2").checked).toBe(false);
    expect(document.getElementById("office-client-2").checked).toBe(true);

    expect(document.getElementById("homeworking-full-day-5").checked).toBe(true);
    expect(document.getElementById("office-client-5").checked).toBe(true);

    expect(document.getElementById("homeworking-full-day-6").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-6").checked).toBe(false);
    expect(document.getElementById("office-client-6").checked).toBe(false);

    expect(document.getElementById("homeworking-full-day-7").checked).toBe(true);
    expect(document.getElementById("homeworking-half-day-7").checked).toBe(false);
    expect(document.getElementById("office-client-7").checked).toBe(false);
  });

  it("clears work location checkboxes when weekly pattern is disabled", async () => {
    const { api } = await loadContentScript();
    buildCategoryGrid();
    installCheckboxMouseEventShim();

    [
      "homeworking-full-day-0",
      "homeworking-half-day-0",
      "office-client-0",
      "homeworking-full-day-2",
      "homeworking-half-day-2",
      "office-client-2"
    ].forEach((id) => {
      document.getElementById(id).checked = true;
    });

    api.applyWeeklyPatternAndRest({
      weeklyPatternEnabled: false,
      autoCheckRest: true
    });

    expect(document.getElementById("homeworking-full-day-0").checked).toBe(false);
    expect(document.getElementById("homeworking-half-day-0").checked).toBe(false);
    expect(document.getElementById("office-client-0").checked).toBe(false);

    expect(document.getElementById("homeworking-full-day-2").checked).toBe(true);
    expect(document.getElementById("homeworking-half-day-2").checked).toBe(true);
    expect(document.getElementById("office-client-2").checked).toBe(true);
  });

  it("clears daily and weekly rest checkboxes when auto rest is disabled", async () => {
    const { api } = await loadContentScript();
    buildCategoryGrid();
    installCheckboxMouseEventShim();

    [
      "jai-respect-mon-repos-quotidien-0",
      "jai-respect-mon-repos-hebdomadaire-0",
      "jai-respect-mon-repos-quotidien-2",
      "jai-respect-mon-repos-hebdomadaire-2"
    ].forEach((id) => {
      document.getElementById(id).checked = true;
    });

    api.applyWeeklyPatternAndRest({
      weeklyPatternEnabled: false,
      autoCheckRest: false
    });

    expect(document.getElementById("jai-respect-mon-repos-quotidien-0").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-0").checked).toBe(false);
    expect(document.getElementById("jai-respect-mon-repos-quotidien-2").checked).toBe(true);
    expect(document.getElementById("jai-respect-mon-repos-hebdomadaire-2").checked).toBe(true);
  });

  it("supports WBS autocomplete keyboard selection, favorites, and outside-click closing", async () => {
    const { api, storageState } = await openPanelWithStorage({
      availableWbs: [
        { code: "WBS-ALPHA", client: "Alpha Client", description: "Alpha migration" },
        { code: "WBS-BETA", client: "Beta Client", description: "Beta rollout" },
        { code: "WBS-GAMMA", client: "Gamma Client", description: "Gamma support" }
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
    expect(dropdown.querySelector(".myte-wbs-option-title").textContent.replace(/\s+/g, " ").trim()).toBe(
      "WBS-BETA - Beta Client"
    );

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
