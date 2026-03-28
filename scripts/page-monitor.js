// Page-context monitor for runtime API usage.
(function () {
    // Avoid running the same monitor twice on the same page.
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

    const tryDefine = (target, prop, value) => {
        // Some pages lock properties. If defineProperty fails, try direct assignment.
        try {
            Object.defineProperty(target, prop, {
                configurable: true,
                writable: true,
                value,
            });
        } catch (_e) {
            try {
                target[prop] = value;
            } catch (_e2) {
                // ignore if host blocks override
            }
        }
    };

    wrap(window, 'eval', (orig) => function (code) {
        emit('eval', String(code).slice(0, 300));
        return orig.call(this, code);
    });

    if (window.Function) {
        const NativeFunction = window.Function;
        // Proxy lets us track calls while keeping normal Function behavior.
        const FunctionProxy = new Proxy(NativeFunction, {
            apply(target, thisArg, args) {
                emit('Function', args.map((a) => String(a).slice(0, 300)));
                return Reflect.apply(target, thisArg, args);
            },
            construct(target, args, newTarget) {
                emit('Function', args.map((a) => String(a).slice(0, 300)));
                return Reflect.construct(target, args, newTarget);
            },
        });
        tryDefine(window, 'Function', FunctionProxy);
    }

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

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
        // Patch only open() to reduce site breakage.
        const origOpen = window.XMLHttpRequest.prototype.open;
        tryDefine(window.XMLHttpRequest.prototype, 'open', function (method, url, ...rest) {
            emit('XHR-open', [method, url]);
            return origOpen.call(this, method, url, ...rest);
        });
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
