import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");
const contentScriptPath = path.resolve(repoRoot, "content.js");

function buildHoursGridMarkup() {
  let markup = '<div id="entryGridChargeCodeCell-1">WBS-1</div><div id="entryGridChargeCodeCell-2">WBS-2</div>';

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    for (const rowIndex of [1, 2]) {
      markup += `
        <div id="entryGridHoursCell-${dayIndex}-${rowIndex}">
          <div contenteditable="true"></div>
        </div>
      `;
    }
  }

  return markup;
}

function buildCategoryGridMarkup() {
  let markup = "";

  for (let index = 0; index < 6; index += 1) {
    const specialClass = index === 2 ? " special-cell" : "";
    markup += `
      <div id="timeCategoryCell-2-${index}" class="${specialClass.trim()}">
        <input type="checkbox" id="homeworking-full-day-${index}">
        <input type="checkbox" id="office-client-${index}">
        <input type="checkbox" id="jai-respect-mon-repos-quotidien-${index}">
        <input type="checkbox" id="jai-respect-mon-repos-hebdomadaire-${index}">
      </div>
    `;
  }

  return markup;
}

function buildWbsPopupMarkup() {
  return `
    <button id="charge-code-1" class="assignment-container" type="button">Open WBS</button>
    <template id="wbs-popup-template">
      <div id="My_TE_Time_MenuChargeCodes">
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
          body { font-family: Arial, sans-serif; }
          .special-cell { outline: 1px dashed #999; }
        </style>
      </head>
      <body>
        ${buildHoursGridMarkup()}
        ${buildCategoryGridMarkup()}
        ${buildWbsPopupMarkup()}
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