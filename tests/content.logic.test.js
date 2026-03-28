// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadContentScript } from "./support/load-extension-script.js";

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.__MYTE_TEST_MODE__;
  delete globalThis.__MYTE_DISABLE_AUTO_INIT__;
  delete globalThis.__MYTE_TEST_API__;
  delete globalThis.chrome;
  delete globalThis.fetch;
  delete globalThis.alert;
  document.body.innerHTML = "";
});

describe("content.js logic helpers", () => {
  it("computes per-WBS daily hours with an exact 1-decimal total", async () => {
    const { api } = await loadContentScript();

    const distribution = api.computeDailyHoursPerWbs({
      dailyHours: 7.7,
      wbsAllocations: [
        { code: "WBS-1", weight: 0.25 },
        { code: "WBS-2", weight: 0.75 }
      ]
    });

    expect(distribution).toEqual([
      { code: "WBS-1", hours: 1.9 },
      { code: "WBS-2", hours: 5.8 }
    ]);
    expect(distribution.reduce((sum, item) => sum + item.hours, 0)).toBeCloseTo(7.7, 5);
  });

  it("normalizes positive weights to a 1.00 total and leaves zero rows at zero", async () => {
    const { api } = await loadContentScript();
    const allocations = [
      { code: "WBS-1", weight: 2 },
      { code: "WBS-2", weight: 1 },
      { code: "WBS-3", weight: 0 }
    ];

    const normalized = api.normalizeWeightsToTwoDecimals(allocations);

    expect(normalized).toBe(true);
    expect(allocations).toEqual([
      { code: "WBS-1", weight: 0.66 },
      { code: "WBS-2", weight: 0.34 },
      { code: "WBS-3", weight: 0 }
    ]);
  });

  it("filters and resolves WBS values by code or label", async () => {
    const { api } = await loadContentScript();
    const availableWbs = [
      { code: "ABC123", description: "Client Alpha" },
      { code: "XYZ999", description: "Beta rollout" }
    ];

    expect(api.filterWbsOptions(availableWbs, "beta")).toEqual([
      { code: "XYZ999", description: "Beta rollout" }
    ]);
    expect(api.findWbsByPickerValue(availableWbs, "ABC123 - Client Alpha")).toEqual(
      { code: "ABC123", description: "Client Alpha" }
    );
    expect(api.findWbsByPickerValue(availableWbs, "XYZ999")).toEqual(
      { code: "XYZ999", description: "Beta rollout" }
    );
  });

  it("validates incomplete WBS configuration before fill", async () => {
    const { api } = await loadContentScript();

    expect(api.validateWbsConfigForFill({ wbsAllocations: [] })).toMatch(
      /Configure at least one WBS/
    );
    expect(
      api.validateWbsConfigForFill({
        wbsAllocations: [{ code: "WBS-1", weight: 0.4 }, { code: "", weight: 0.6 }]
      })
    ).toMatch(/Select a WBS on every allocation row/);
  });

  it("extracts active WBS rows from popup markup", async () => {
    const { api } = await loadContentScript();

    document.body.innerHTML = `
      <div role="row" row-id="1">
        <div col-id="Type"><span aria-hidden="true">Billable</span></div>
        <div col-id="subtype"><span aria-hidden="true">External</span></div>
        <div col-id="client"><span aria-hidden="true">Contoso</span></div>
        <div col-id="countryRegion"><span aria-hidden="true">FR</span></div>
        <div col-id="description"><span aria-hidden="true">Migration</span></div>
        <div col-id="code"><span aria-hidden="true">WBS-42</span></div>
        <div class="ag-cell-value"></div>
      </div>
      <div role="row" row-id="2">
        <div class="ag-cell-value error-cell"></div>
      </div>
    `;

    const [activeRow, inactiveRow] = document.querySelectorAll('[role="row"]');

    expect(api.isActiveWbsRow(activeRow)).toBe(true);
    expect(api.isActiveWbsRow(inactiveRow)).toBe(false);
    expect(api.extractWbsRow(activeRow)).toEqual({
      type: "Billable",
      subtype: "External",
      client: "Contoso",
      countryRegion: "FR",
      description: "Migration",
      code: "WBS-42"
    });
  });
});