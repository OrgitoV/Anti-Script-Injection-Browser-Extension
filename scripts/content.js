// Minimal Anti-Script-Injection content script
// Purpose: monitor potentially dangerous dynamic execution/injection APIs
// and send light-weight events to the extension background.

(function () {
    // Marker visible in page context for quick injection checks.
    document.documentElement.setAttribute('data-asi-monitor', 'active');

    // Send a message to the extension (background/service worker)
    const send = (event) => {
        const payload = {
            type: event.type,
            ts: Date.now(),
            src: document.location.href,
            data: event.data,
        };

        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ antiScriptInjection: true, payload });
            } else if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
                browser.runtime.sendMessage({ antiScriptInjection: true, payload });
            }
        } catch (e) {
            // Best-effort messaging only; don't break page logic.
        }
    };

    // Receive events from injected page-context monitor and forward to background.
    window.addEventListener('message', (evt) => {
        if (evt.source !== window) return;
        const data = evt.data;
        if (!data || data.__asi !== true) return;
        send({ type: data.type, data: data.data });
    });

    // Inject a page-context script file (CSP-safe, unlike inline script text).
    const injected = document.createElement('script');
    injected.src = chrome.runtime.getURL('scripts/page-monitor.js');
    injected.onload = () => injected.remove();
    injected.onerror = () => {
        send({ type: 'page-monitor-load-error', data: 'failed to load page-monitor.js' });
        injected.remove();
    };
    (document.documentElement || document.head || document.body).appendChild(injected);

    // Initial ping to confirm message path content -> background is alive.
    send({ type: 'content-loaded', data: 'runtime monitor initialized' });
})();

console.log('[ASI] content script loaded', location.href);