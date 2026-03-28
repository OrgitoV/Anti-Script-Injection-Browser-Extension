// Page-context monitor for runtime API usage.
(function () {
    if (window.__ASI_PAGE_MONITOR__) return;
    window.__ASI_PAGE_MONITOR__ = true;

    const emit = (type, data) => {
        try {
            window.postMessage({ __asi: true, type, data }, '*');
        } catch (e) {
            // Best effort only.
        }
    };

    const wrap = (target, prop, wrapper) => {
        if (!target || !target[prop]) return;
        const orig = target[prop];
        target[prop] = wrapper(orig);
        return orig;
    };

    wrap(window, 'eval', (orig) => function (code) {
        emit('eval', String(code).slice(0, 300));
        return orig.call(this, code);
    });

    wrap(window, 'Function', (orig) => function (...args) {
        emit('Function', args.map((a) => String(a).slice(0, 300)));
        return orig.apply(this, args);
    });

    ['setTimeout', 'setInterval'].forEach((name) => {
        wrap(window, name, (orig) => function (fn, delay, ...rest) {
            if (typeof fn === 'string') {
                emit(name + '-string', String(fn).slice(0, 300));
            }
            return orig.call(this, fn, delay, ...rest);
        });
    });

    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function (tagName, options) {
        if (String(tagName).toLowerCase() === 'script') {
            emit('createElement-script', String(tagName));
        }
        return originalCreateElement.call(this, tagName, options);
    };

    if (window.fetch) {
        wrap(window, 'fetch', (orig) => function (...args) {
            emit('fetch', args.slice(0, 3).map((a) => (typeof a === 'string' ? a : '[object]')));
            return orig.apply(this, args);
        });
    }

    if (window.XMLHttpRequest) {
        const originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function () {
            const xhr = new originalXHR();
            const origOpen = xhr.open;
            xhr.open = function (method, url, ...rest) {
                emit('XHR-open', [method, url]);
                return origOpen.call(this, method, url, ...rest);
            };
            return xhr;
        };
    }

    const observer = new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() === 'script') {
                    emit('mutation-script', (node.src || node.innerHTML || '').slice(0, 300));
                }
            });
        });
    });

    observer.observe(document.documentElement || document.body || document, {
        childList: true,
        subtree: true,
    });

    emit('page-monitor-loaded', 'ok');
})();
