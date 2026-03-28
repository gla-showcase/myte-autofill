import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vi } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");
let contentScriptPromise = null;
let backgroundScriptPromise = null;
let contentTestApi = null;
let backgroundTestApi = null;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function loadContentScript(options = {}) {
  const { storageData = null } = options;
  const panelHtml = await readFile(path.resolve(repoRoot, "panel.html"), "utf8");
  const storageState = storageData === null
    ? {}
    : { myteAutofillConfig: cloneValue(storageData) };

  let lastFocusedElement = null;

  document.body.innerHTML = "";
  delete globalThis.__MYTE_TEST_API__;
  globalThis.__MYTE_TEST_MODE__ = true;
  globalThis.__MYTE_DISABLE_AUTO_INIT__ = true;
  globalThis.requestAnimationFrame = (callback) => callback();
  globalThis.alert = vi.fn();

  Object.defineProperty(HTMLElement.prototype, "focus", {
    configurable: true,
    writable: true,
    value() {
      lastFocusedElement = this;
    }
  });

  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: vi.fn((command, _showUi, value) => {
      if (!lastFocusedElement) return true;

      if (command === "delete") {
        lastFocusedElement.textContent = "";
      } else if (command === "insertText") {
        lastFocusedElement.textContent = String(value ?? "");
      }

      return true;
    })
  });

  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => panelHtml
  }));

  globalThis.chrome = {
    runtime: {
      getURL: vi.fn((relativePath) => relativePath),
      lastError: null,
      onMessage: {
        addListener: vi.fn()
      }
    },
    storage: {
      sync: {
        get: vi.fn((_keys, callback) => {
          callback(storageState);
        }),
        set: vi.fn((value, callback) => {
          Object.assign(storageState, value);
          callback?.();
        })
      }
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
      create: vi.fn()
    },
    action: {
      onClicked: {
        addListener: vi.fn()
      }
    }
  };

  if (!contentScriptPromise) {
    contentScriptPromise = import(pathToFileURL(path.resolve(repoRoot, "content.js")).href);
  }
  await contentScriptPromise;
  contentTestApi ||= globalThis.__MYTE_TEST_API__;
  globalThis.__MYTE_TEST_API__ = contentTestApi;
  globalThis.__MYTE_TEST_API__.resetTestState(storageData || {});

  return {
    api: globalThis.__MYTE_TEST_API__,
    chrome: globalThis.chrome,
    storageState,
    panelHtml
  };
}

export async function loadBackgroundScript() {
  delete globalThis.__MYTE_BACKGROUND_TEST_API__;
  globalThis.__MYTE_TEST_MODE__ = true;
  globalThis.chrome = {
    action: {
      onClicked: {
        addListener: vi.fn()
      }
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
      create: vi.fn()
    }
  };

  if (!backgroundScriptPromise) {
    backgroundScriptPromise = import(pathToFileURL(path.resolve(repoRoot, "background.js")).href);
  }
  await backgroundScriptPromise;
  backgroundTestApi ||= globalThis.__MYTE_BACKGROUND_TEST_API__;
  globalThis.__MYTE_BACKGROUND_TEST_API__ = backgroundTestApi;

  return {
    api: backgroundTestApi,
    chrome: globalThis.chrome
  };
}