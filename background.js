function handleActionClick(chromeApi, tab) {
  // Get the real active tab (MV3 service worker cannot trust the click's tab param in all cases)
  chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const active = tabs[0];
    const url = active?.url || "";

    let isMyTe = false;
    try {
      isMyTe = new URL(url).hostname === "myte.accenture.com";
    } catch {
      isMyTe = false;
    }

    if (isMyTe && active.id) {
      // On MyTE: toggle in-page panel
      chromeApi.tabs.sendMessage(active.id, { type: "TOGGLE_MYTE_PANEL" });
    } else {
      // Not on MyTE: open MyTE time page in a new tab
      chromeApi.tabs.create({ url: "https://myte.accenture.com/#/time" });
    }
  });
}

// When the user clicks the extension icon
chrome.action.onClicked.addListener((tab) => {
  handleActionClick(chrome, tab);
});

if (globalThis.__MYTE_TEST_MODE__) {
  globalThis.__MYTE_BACKGROUND_TEST_API__ = {
    handleActionClick
  };
}
