// Background message receiver for Anti-Script Injection monitoring
console.log('[ASI] background service worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ASI] extension installed/updated');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.antiScriptInjection && message.payload) {
    console.log('[ASI event]', message.payload, 'from', sender.tab?.url || 'unknown');
  }
});