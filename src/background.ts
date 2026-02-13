/**
 * Background service worker - handles icon click and syncs panic modal to all tabs
 */

chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url && !tab.url.startsWith("chrome://")) {
    chrome.storage.local.get("userSettings", (result: any) => {
      const settings = result?.userSettings || {};
      settings.panelEnabled = true;
      chrome.storage.local.set({ userSettings: settings });
    });
    // Content script is already on the page (manifest content_scripts); storage listener will inject panel when panelEnabled becomes true
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.panicModalOpen) return;
  const open = changes.panicModalOpen.newValue === true;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) return;
      chrome.tabs.sendMessage(tab.id, { type: "SYNC_PANIC_MODAL", open }).catch(() => {});
      // Tabs without content script will get state on next load; no scripting permission needed
    });
  });
});
