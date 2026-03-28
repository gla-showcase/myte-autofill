import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBackgroundScript } from "./support/load-extension-script.js";

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.__MYTE_TEST_MODE__;
  delete globalThis.__MYTE_BACKGROUND_TEST_API__;
  delete globalThis.chrome;
});

describe("background.js", () => {
  it("registers the action click listener", async () => {
    const { chrome } = await loadBackgroundScript();

    expect(chrome.action.onClicked.addListener).toHaveBeenCalledTimes(1);
  });

  it("toggles the panel when the active tab is on MyTE", async () => {
    const { api, chrome } = await loadBackgroundScript();
    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 7, url: "https://myte.accenture.com/#/time" }]);
    });

    api.handleActionClick(chrome, {});

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: "TOGGLE_MYTE_PANEL" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("opens MyTE when the active tab is outside the supported host", async () => {
    const { api, chrome } = await loadBackgroundScript();
    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 3, url: "https://example.com" }]);
    });

    api.handleActionClick(chrome, {});

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://myte.accenture.com/#/time" });
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});