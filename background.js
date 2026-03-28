// Background message receiver for Anti-Script Injection monitoring
console.log('[ASI] background service worker started');

// Fires on install/update so we can confirm extension lifecycle events.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ASI] extension installed/updated');
});

// Receives monitoring events from content script and logs them for testing.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.antiScriptInjection && message.payload) {
    console.log('[ASI event]', message.payload, 'from', sender.tab?.url || 'unknown');
  }
});