import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");
const contentScriptPath = path.resolve(repoRoot, "content.js");
const contentStylesPath = path.resolve(repoRoot, "styles.css");

function buildHoursGridMarkup() {
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  let headerCells = '<div class="myte-fake-cell myte-fake-corner">Charge Codes</div>';
  dayLabels.forEach((label) => {
    headerCells += `<div class="myte-fake-cell myte-fake-daycol">${label}</div>`;
  });

  let rowsMarkup = "";
  for (const rowIndex of [1, 2]) {
    let rowCells = `<div id="entryGridChargeCodeCell-${rowIndex}" class="myte-fake-cell myte-fake-chargecode">WBS-${rowIndex}</div>`;
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      rowCells += `
        <div id="entryGridHoursCell-${dayIndex}-${rowIndex}" class="myte-fake-cell myte-fake-hours">
          <div contenteditable="true"></div>
        </div>
      `;
    }
    rowsMarkup += `<div class="myte-fake-row">${rowCells}</div>`;
  }

  return `
    <div class="myte-fake-table myte-fake-hours-table">
      <div class="myte-fake-row myte-fake-header-row">${headerCells}</div>
      ${rowsMarkup}
    </div>
  `;
}

function buildCategoryGridMarkup() {
  const categories = [
    { prefix: "homeworking-full-day-", label: "HomeWorking Full Day", row: 2 },
    { prefix: "office-client-", label: "Office / Client", row: 3 },
    { prefix: "jai-respect-mon-repos-quotidien-", label: "J'ai respecté mon repos quotidien", row: 4 },
    { prefix: "jai-respect-mon-repos-hebdomadaire-", label: "J'ai respecté mon repos hebdomadaire", row: 5 }
  ];

  let headerCells = '<div class="myte-fake-cell myte-fake-corner" style="grid-column:1;grid-row:1;">Categories</div>';
  for (let index = 0; index < 6; index += 1) {
    const isSpecial = index === 2;
    headerCells += `<div class="myte-fake-cell myte-fake-daycol" style="grid-column:${index + 2};grid-row:1;">${isSpecial ? "Weekend" : "Day " + (index + 1)}</div>`;
  }

  let labelCells = "";
  categories.forEach((cat) => {
    labelCells += `<div class="myte-fake-cell myte-fake-catlabel" style="grid-column:1;grid-row:${cat.row};">${cat.label}</div>`;
  });

  let dayCells = "";
  for (let index = 0; index < 6; index += 1) {
    const isSpecial = index === 2;
    const specialClass = isSpecial ? " special-cell" : "";
    let checkboxCells = "";
    categories.forEach((cat) => {
      checkboxCells += `
        <span class="myte-fake-checkbox-cell${isSpecial ? " myte-fake-checkbox-cell-special" : ""}" style="grid-column:${index + 2};grid-row:${cat.row};">
          <input type="checkbox" id="${cat.prefix}${index}">
        </span>
      `;
    });

    dayCells += `
      <div id="timeCategoryCell-2-${index}" class="myte-fake-catcolumn${specialClass}">
        ${checkboxCells}
      </div>
    `;
  }

  return `
    <div class="myte-fake-table myte-fake-category-table">
      ${headerCells}
      ${labelCells}
      ${dayCells}
    </div>
  `;
}

function buildWbsPopupMarkup() {
  return `
    <button id="charge-code-1" class="assignment-container" type="button">Open WBS</button>
    <template id="wbs-popup-template">
      <div id="My_TE_Time_MenuChargeCodes">
        <div class="ag-header-row">
          <div class="ag-header-cell ag-header-cell-marker"></div>
          <div class="ag-header-cell">Type</div>
          <div class="ag-header-cell">Sub-type</div>
          <div class="ag-header-cell">Client</div>
          <div class="ag-header-cell">Country/Region</div>
          <div class="ag-header-cell">Description</div>
          <div class="ag-header-cell">Code</div>
        </div>
        <div class="ag-center-cols-viewport">
          <div role="row" row-id="1">
            <div class="ag-cell-value"></div>
            <div col-id="Type"><span aria-hidden="true">Billable</span></div>
            <div col-id="subtype"><span aria-hidden="true">External</span></div>
            <div col-id="client"><span aria-hidden="true">Contoso</span></div>
            <div col-id="countryRegion"><span aria-hidden="true">FR</span></div>
            <div col-id="description"><span aria-hidden="true">Alpha migration</span></div>
            <div col-id="code"><span aria-hidden="true">WBS-ALPHA</span></div>
          </div>
          <div role="row" row-id="2">
            <div class="ag-cell-value"></div>
            <div col-id="Type"><span aria-hidden="true">Billable</span></div>
            <div col-id="subtype"><span aria-hidden="true">External</span></div>
            <div col-id="client"><span aria-hidden="true">Contoso</span></div>
            <div col-id="countryRegion"><span aria-hidden="true">FR</span></div>
            <div col-id="description"><span aria-hidden="true">Beta rollout</span></div>
            <div col-id="code"><span aria-hidden="true">WBS-BETA</span></div>
          </div>
          <div role="row" row-id="3">
            <div class="ag-cell-value error-cell"></div>
            <div col-id="Type"><span aria-hidden="true">Billable</span></div>
            <div col-id="subtype"><span aria-hidden="true">External</span></div>
            <div col-id="client"><span aria-hidden="true">Contoso</span></div>
            <div col-id="countryRegion"><span aria-hidden="true">FR</span></div>
            <div col-id="description"><span aria-hidden="true">Closed work</span></div>
            <div col-id="code"><span aria-hidden="true">WBS-OLD</span></div>
          </div>
        </div>
      </div>
    </template>
  `;
}

function buildFakeMytePage() {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Fake MyTE</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
            background: #f2f2f5;
            color: #222;
          }

          /* ---- Top bar mimicking the real MyTE nav ---- */
          .myte-fake-topbar {
            background: #ffffff;
            border-bottom: 3px solid #a100ff;
            padding: 0 20px;
          }
          .myte-fake-tabs {
            display: flex;
            gap: 24px;
          }
          .myte-fake-tab {
            padding: 14px 2px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.02em;
            color: #666;
            border-bottom: 3px solid transparent;
            margin-bottom: -3px;
          }
          .myte-fake-tab-active {
            color: #a100ff;
            border-bottom-color: #a100ff;
          }

          .myte-fake-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #ffffff;
            padding: 10px 20px;
            border-bottom: 1px solid #e0e0e5;
          }
          .myte-fake-toolbar-actions {
            display: flex;
            gap: 18px;
            font-size: 12px;
            color: #555;
          }
          .myte-fake-toolbar-status {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .myte-fake-status-draft {
            font-size: 12px;
            color: #888;
          }
          .myte-fake-submit-btn {
            background: #a100ff;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 8px 18px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
          }

          .myte-fake-content {
            padding: 20px;
          }

          /* ---- Shared table look ---- */
          .myte-fake-table {
            display: grid;
            background: #fff;
            border: 1px solid #d8d8e0;
            border-radius: 6px;
            overflow: hidden;
            font-size: 13px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
          }
          .myte-fake-cell {
            padding: 8px 10px;
            border-bottom: 1px solid #ececf2;
            border-right: 1px solid #ececf2;
            display: flex;
            align-items: center;
            background: #fff;
          }
          .myte-fake-corner,
          .myte-fake-daycol {
            background: #f4edfb;
            font-weight: 600;
            color: #5a2a86;
            border-bottom: 2px solid #a100ff;
          }
          .myte-fake-chargecode {
            font-weight: 500;
            color: #222;
          }

          /* ---- Hours table ---- */
          .myte-fake-hours-table {
            grid-template-columns: 220px repeat(5, 90px);
            margin-bottom: 20px;
          }
          .myte-fake-hours-table .myte-fake-row { display: contents; }
          .myte-fake-hours [contenteditable="true"] {
            width: 100%;
            min-height: 20px;
            outline: none;
            text-align: center;
            border-radius: 3px;
          }
          .myte-fake-hours [contenteditable="true"]:focus {
            background: #f4edfb;
            box-shadow: 0 0 0 2px rgba(161, 0, 255, 0.25);
          }

          /* ---- Category / checkbox table ---- */
          .myte-fake-category-table {
            grid-template-columns: 240px repeat(6, 76px);
            grid-auto-rows: 34px;
          }
          .myte-fake-catcolumn { display: contents; }
          .myte-fake-catlabel {
            color: #444;
          }
          .myte-fake-checkbox-cell {
            grid-row: span 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1px solid #ececf2;
            border-right: 1px solid #ececf2;
            background: #fff;
          }
          .myte-fake-checkbox-cell input[type="checkbox"] {
            width: 15px;
            height: 15px;
            accent-color: #a100ff;
            cursor: pointer;
          }
          .myte-fake-checkbox-cell-special {
            background: #f0f0f3;
          }
          .myte-fake-checkbox-cell-special input {
            opacity: 0.35;
          }

          /* ---- WBS popup (ag-grid style) ---- */
          .assignment-container {
            border: 1px solid #d0d0d8;
            background: #fff;
            border-radius: 4px;
            padding: 4px 10px;
            font-size: 12px;
            color: #5a2a86;
            cursor: pointer;
          }
          .assignment-container:hover { background: #f4edfb; }

          #My_TE_Time_MenuChargeCodes {
            position: absolute;
            width: 680px;
            max-width: 90vw;
            margin-top: 6px;
            background: #fff;
            border: 1px solid #d0d0d8;
            border-radius: 6px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
            overflow: hidden;
            font-size: 12px;
            z-index: 10000;
          }
          .ag-header-row {
            display: flex;
            background: #f4edfb;
            font-weight: 600;
            color: #5a2a86;
            border-bottom: 2px solid #a100ff;
          }
          .ag-header-cell {
            flex: 1 1 0;
            padding: 8px 10px;
          }
          .ag-header-cell-marker {
            flex: 0 0 0;
            width: 0;
            padding: 0;
          }
          .ag-center-cols-viewport {
            max-height: 220px;
            overflow-y: auto;
          }
          [role="row"] {
            display: flex;
            border-bottom: 1px solid #ececf2;
            cursor: pointer;
          }
          [role="row"]:hover {
            background: #f8f5fc;
          }
          [role="row"] [col-id] {
            flex: 1 1 0;
            padding: 8px 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .ag-cell-value {
            flex: 0 0 0;
            width: 0;
            padding: 0;
            overflow: hidden;
          }
          [role="row"]:has(.error-cell) {
            background: rgba(217, 45, 81, 0.06);
          }
          [role="row"]:has(.error-cell) [col-id] {
            color: #d92d51;
          }
        </style>
      </head>
      <body>
        <div class="myte-fake-app">
          <div class="myte-fake-topbar">
            <div class="myte-fake-tabs">
              <span class="myte-fake-tab myte-fake-tab-active">TIME</span>
              <span class="myte-fake-tab">EXPENSES</span>
              <span class="myte-fake-tab">LOCATIONS</span>
              <span class="myte-fake-tab">CHARGE CODES</span>
              <span class="myte-fake-tab">ADJUSTMENTS</span>
              <span class="myte-fake-tab">SUMMARY</span>
              <span class="myte-fake-tab">PREFERENCES</span>
            </div>
          </div>
          <div class="myte-fake-toolbar">
            <div class="myte-fake-toolbar-actions">
              <span>SAVE</span>
              <span>DELETE</span>
              <span>SET TEMPLATE</span>
              <span>HELP</span>
            </div>
            <div class="myte-fake-toolbar-status">
              <span class="myte-fake-status-draft">Draft</span>
              <button class="myte-fake-submit-btn" type="button">Submit</button>
            </div>
          </div>
          <div class="myte-fake-content">
            ${buildHoursGridMarkup()}
            ${buildCategoryGridMarkup()}
            ${buildWbsPopupMarkup()}
          </div>
        </div>
        <script>
          const opener = document.getElementById("charge-code-1");
          const popupTemplate = document.getElementById("wbs-popup-template");

          opener.addEventListener("click", () => {
            const existing = document.getElementById("My_TE_Time_MenuChargeCodes");
            if (existing) {
              existing.remove();
              return;
            }

            const popup = popupTemplate.content.firstElementChild.cloneNode(true);
            const viewport = popup.querySelector(".ag-center-cols-viewport");
            Object.defineProperty(viewport, "scrollHeight", {
              configurable: true,
              value: 600
            });
            document.body.appendChild(popup);
          });

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              document.getElementById("My_TE_Time_MenuChargeCodes")?.remove();
            }
          });
        </script>
      </body>
    </html>
  `;
}

async function installExtensionHarness(page, storageData) {
  const panelHtml = await readFile(path.resolve(repoRoot, "panel.html"), "utf8");

  await page.route("https://extension.test/panel.html", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: panelHtml
    });
  });

  await page.setContent(buildFakeMytePage());
  await page.evaluate((config) => {
    const storageState = { myteAutofillConfig: JSON.parse(JSON.stringify(config)) };
    const listeners = [];

    window.__MYTE_TEST_MODE__ = true;
    window.__myteStorageState = storageState;
    window.__dispatchMyteMessage = (message) => {
      listeners.forEach((listener) => listener(message));
    };

    window.chrome = {
      runtime: {
        getURL(relativePath) {
          return `https://extension.test/${relativePath}`;
        },
        lastError: null,
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      },
      storage: {
        sync: {
          get(_keys, callback) {
            callback(storageState);
          },
          set(value, callback) {
            Object.assign(storageState, value);
            callback?.();
          }
        }
      }
    };
  }, storageData);
  // manifest.json declares styles.css as a content_scripts CSS file, which Chrome
  // injects automatically into the page. Replicate that here so the panel is styled.
  await page.addStyleTag({ path: contentStylesPath });
  await page.addScriptTag({ path: contentScriptPath });
}

function collectBrowserOutput(page) {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    consoleMessages.push(`[${message.type()}] ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  return { consoleMessages, pageErrors };
}

async function attachSuccessfulArtifacts(page, testInfo, label, browserOutput) {
  await testInfo.attach(`${label}-console.log`, {
    body: Buffer.from(browserOutput.consoleMessages.join("\n") || "<no console output>", "utf8"),
    contentType: "text/plain"
  });

  await testInfo.attach(`${label}-page-errors.log`, {
    body: Buffer.from(browserOutput.pageErrors.join("\n") || "<no page errors>", "utf8"),
    contentType: "text/plain"
  });

  const storageSnapshot = await page.evaluate(() => window.__myteStorageState?.myteAutofillConfig || null);
  await testInfo.attach(`${label}-storage.json`, {
    body: Buffer.from(JSON.stringify(storageSnapshot, null, 2), "utf8"),
    contentType: "application/json"
  });

  await testInfo.attach(`${label}-screenshot.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
}

async function openPanel(page) {
  await page.evaluate(() => {
    window.__dispatchMyteMessage({ type: "TOGGLE_MYTE_PANEL" });
  });
  await expect(page.locator("#myte-helper-panel")).toBeVisible();
}

test.describe("content.js smoke tests", () => {
  test("opens the panel and fills the fake MyTE timesheet", async ({ page }, testInfo) => {
    const browserOutput = collectBrowserOutput(page);
    await installExtensionHarness(page, {
      dailyHours: 7.7,
      weeklyPattern: {
        0: "Office",
        1: "None",
        2: "HW",
        3: "Office",
        4: "HW"
      },
      wbsAllocations: [
        { code: "WBS-1", weight: 0.25 },
        { code: "WBS-2", weight: 0.75 }
      ],
      availableWbs: [
        { code: "WBS-1", description: "Migration" },
        { code: "WBS-2", description: "Rollout" }
      ],
      favoriteWbs: [],
      autoCheckRest: true,
      themeStyle: "corporate"
    });

    await openPanel(page);
    await expect(page.locator("#myte-wbs-count-number")).toHaveText("2");
    await expect(page.locator("#myte-daily-hours")).toHaveValue("7.7");

    await page.click("#myte-fill-btn-fixed");

    await expect(page.locator("#myte-helper-panel")).toHaveCount(0);
    await expect(page.locator("#entryGridHoursCell-0-1 [contenteditable='true']")).toHaveText("1.9");
    await expect(page.locator("#entryGridHoursCell-0-2 [contenteditable='true']")).toHaveText("5.8");
    await expect(page.locator("#office-client-0")).toBeChecked();
    await expect(page.locator("#homeworking-full-day-3")).toBeChecked();
    await expect(page.locator("#jai-respect-mon-repos-quotidien-0")).toBeChecked();
    await expect(page.locator("#jai-respect-mon-repos-hebdomadaire-5")).toBeChecked();

    await attachSuccessfulArtifacts(page, testInfo, "fill-timesheet", browserOutput);
  });

  test("loads active WBS entries from the popup and seeds the first allocation", async ({ page }, testInfo) => {
    const browserOutput = collectBrowserOutput(page);
    await installExtensionHarness(page, {
      dailyHours: 7.7,
      weeklyPattern: { 0: "HW", 1: "HW", 2: "HW", 3: "HW", 4: "HW" },
      wbsAllocations: [],
      availableWbs: [],
      favoriteWbs: [],
      autoCheckRest: true,
      themeStyle: "corporate"
    });

    await openPanel(page);
    await page.click("#myte-load-wbs");

    await expect(page.locator("#myte-wbs-count-number")).toHaveText("2");
    await expect(page.locator("#myte-load-wbs .myte-btn-label")).toHaveText("Reload WBS");
    await expect(page.locator(".myte-wbs-picker")).toHaveValue("WBS-ALPHA - Alpha migration");

    const storage = await page.evaluate(() => window.__myteStorageState.myteAutofillConfig);
    expect(storage.availableWbs).toHaveLength(2);
    expect(storage.wbsAllocations).toEqual([{ code: "WBS-ALPHA", weight: 1 }]);

    await attachSuccessfulArtifacts(page, testInfo, "load-wbs", browserOutput);
  });

  test("supports WBS autocomplete, favorites, and outside-click closing", async ({ page }, testInfo) => {
    const browserOutput = collectBrowserOutput(page);
    await installExtensionHarness(page, {
      dailyHours: 7.7,
      weeklyPattern: { 0: "HW", 1: "HW", 2: "HW", 3: "HW", 4: "HW" },
      wbsAllocations: [
        { code: "", weight: 0.5 },
        { code: "WBS-GAMMA", weight: 0.5 }
      ],
      availableWbs: [
        { code: "WBS-ALPHA", description: "Alpha migration" },
        { code: "WBS-BETA", description: "Beta rollout" },
        { code: "WBS-GAMMA", description: "Gamma support" }
      ],
      favoriteWbs: [],
      autoCheckRest: true,
      themeStyle: "corporate"
    });

    await openPanel(page);

    const firstRow = page.locator('.myte-wbs-row').nth(0);
    const secondRow = page.locator('.myte-wbs-row').nth(1);
    const firstPicker = firstRow.locator('.myte-wbs-picker');
    await firstPicker.click();
    await firstPicker.fill("beta");

    const firstDropdown = firstRow.locator('.myte-wbs-dropdown');
    await expect(firstDropdown).toBeVisible();
    await expect(firstDropdown).toContainText("WBS-BETA");
    await expect(firstDropdown).not.toContainText("WBS-ALPHA");

    await firstDropdown.locator('.myte-wbs-option', { hasText: 'WBS-BETA' }).click();
    await expect(firstPicker).toHaveValue("WBS-BETA - Beta rollout");

    await firstRow.locator('.myte-wbs-fav').click();
    await expect(firstRow.locator('.myte-wbs-fav')).toHaveText("★");

    const secondPicker = secondRow.locator('.myte-wbs-picker');
    await secondPicker.click();
    const secondDropdown = secondRow.locator('.myte-wbs-dropdown');
    await expect(secondDropdown.locator('.myte-wbs-option-code').first()).toHaveText("WBS-BETA");

    await page.click("#myte-bottom-bar");
    await expect(secondDropdown).toBeHidden();

    const storage = await page.evaluate(() => window.__myteStorageState.myteAutofillConfig);
    expect(storage.favoriteWbs).toEqual(["WBS-BETA"]);
    expect(storage.wbsAllocations[0].code).toBe("WBS-BETA");

    await attachSuccessfulArtifacts(page, testInfo, "autocomplete-favorites", browserOutput);
  });

  test("displays the correct panel subtitle text", async ({ page }, testInfo) => {
    const browserOutput = collectBrowserOutput(page);
    await installExtensionHarness(page, {
      dailyHours: 7.5,
      weeklyPattern: {},
      wbsAllocations: [],
      availableWbs: [],
      favoriteWbs: [],
      autoCheckRest: false,
      themeStyle: "corporate"
    });

    await openPanel(page);
    const subtitleText = await page.locator(".myte-subtitle").innerText();
    expect(subtitleText.trim()).toBe(
      "Autofill Accenture MyTE timesheets with multi-WBS allocations and homeworking/office patterns."
    );

    await attachSuccessfulArtifacts(page, testInfo, "panel-subtitle", browserOutput);
  });

  test("persists theme selection after closing and reopening the panel", async ({ page }, testInfo) => {
    const browserOutput = collectBrowserOutput(page);
    await installExtensionHarness(page, {
      dailyHours: 7.7,
      weeklyPattern: { 0: "HW", 1: "HW", 2: "HW", 3: "HW", 4: "HW" },
      wbsAllocations: [{ code: "WBS-1", weight: 1 }],
      availableWbs: [{ code: "WBS-1", description: "Migration" }],
      favoriteWbs: [],
      autoCheckRest: true,
      themeStyle: "corporate"
    });

    await openPanel(page);
    await page.selectOption("#myte-theme-select", "dev");
    await expect(page.locator("#myte-helper-panel")).toHaveClass(/myte-theme-dev/);

    await page.click("#myte-close-btn");
    await expect(page.locator("#myte-helper-panel")).toHaveCount(0);

    await openPanel(page);
    await expect(page.locator("#myte-helper-panel")).toHaveClass(/myte-theme-dev/);
    await expect(page.locator("#myte-theme-select")).toHaveValue("dev");

    const storage = await page.evaluate(() => window.__myteStorageState.myteAutofillConfig);
    expect(storage.themeStyle).toBe("dev");

    await attachSuccessfulArtifacts(page, testInfo, "theme-persistence", browserOutput);
  });

});