// When the user clicks the extension icon
chrome.action.onClicked.addListener((tab) => {
  // Get the real active tab (MV3 service worker cannot trust the click's tab param in all cases)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const active = tabs[0];
    const url = active?.url || "";

    const isMyTe =
      url.startsWith("https://myte.accenture.com/") ||
      url.startsWith("https://myte.accenture.com");

    if (isMyTe && active.id) {
      // On MyTE: toggle in-page panel
      chrome.tabs.sendMessage(active.id, { type: "TOGGLE_MYTE_PANEL" });
    } else {
      // Not on MyTE: open MyTE time page in a new tab
      chrome.tabs.create({ url: "https://myte.accenture.com/#/time" });
    }
  });
});
