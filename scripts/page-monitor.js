// Page-context monitor for runtime API usage.
(function () {
    // Avoid running the same monitor twice on the same page.
    if (window.__ASI_PAGE_MONITOR__) return;
    window.__ASI_PAGE_MONITOR__ = true;

    const blockedAPIs = {
        'eval': false,
        'Function': false,
        'mutation-script': false,
        'setTimeout-string': false,
        'setInterval-string': false,
        'createElement-script': false,
        'fetch': false,
        'XHR-open': false
    };

    let userWarning = null;
    let monitorReady = false;

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

    const isObviouslyDangerous = (code, apiType) => {
        if(!code) return false;
        const codeStr = String(code).slice(0, 500);

        if (apiType === 'eval' || apiType === 'Function') {
            return true;  // Block all eval/Function on first run
        }

        const hasObfuscation = /atob|btoa|String\.fromCharCode|\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/i.test(codeStr);
        const hasDangerousKeywords = /document\.(write|innerHTML|body)|window\.location|eval|constructor|prototype/i.test(codeStr);

        return hasObfuscation || hasDangerousKeywords;
    }

    window.addEventListener('message', (evt) => {
        if(evt.source !== window) return;
        const data = evt.data;
        if(!data || data.__asi !== true) return;

        if(data.type === 'block-api'){
            blockedAPIs[data.targetType] = true;
            console.warn(`[ASI] Blocking ${data.targetType}: ${data.reason}`);
        }
        else if(data.type === 'show-warning'){
            userWarning = data.message;
            showWarningBanner(data.score, data.message);
        }
    })

    wrap(window, 'eval', (orig) => function (code) {
        emit('eval', String(code).slice(0, 300));

        // Block immediately if obviously dangerous
        if (monitorReady && isObviouslyDangerous(code, 'eval')) {
            console.error('[ASI] eval() blocked -- obfuscated + dangerous code detected');
            throw new Error('[ASI] Blocked: Obfuscated dangerous code in eval()');
        }

        if(blockedAPIs['eval']){
            console.error('[ASI] eval() blocked -- potential XSS detected');
            throw new Error('[ASI] Blocked: eval() execution is dangerous');
        }

        return orig.call(this, code);
    });

    if (window.Function) {
        const NativeFunction = window.Function;
        // Proxy lets us track calls while keeping normal Function behavior.
        const FunctionProxy = new Proxy(NativeFunction, {
            apply(target, thisArg, args) {
                emit('Function', args.map((a) => String(a).slice(0, 300)));

                const allArgs = args.map(a => String(a)).join('');
                if (monitorReady && isObviouslyDangerous(allArgs, 'Function')) {
                    console.error('[ASI] eval() blocked -- obfuscated + dangerous code detected');
                    throw new Error('[ASI] Blocked: Obfuscated dangerous code in eval()');
                }

                if(blockedAPIs['Function']){
                    console.error('[ASI] Function() blocked -- potential XSS detected');
                    throw new Error('[ASI] Blocked: Function constructor is dangerous');
                }

                return Reflect.apply(target, thisArg, args);
            },
            construct(target, args, newTarget) {
                emit('Function', args.map((a) => String(a).slice(0, 300)));

                const allArgs = args.map(a => String(a)).join('');
                if (monitorReady && isObviouslyDangerous(allArgs, 'Function')) {
                    console.error('[ASI] eval() blocked -- obfuscated + dangerous code detected');
                    throw new Error('[ASI] Blocked: Obfuscated dangerous code in eval()');
                }

                if (blockedAPIs['Function']) {
                    console.error('[ASI] Function() blocked -- potential XSS detected');
                    throw new Error('[ASI] Blocked: Function constructor is dangerous');
                }

                return Reflect.construct(target, args, newTarget);
            },
        });
        tryDefine(window, 'Function', FunctionProxy);
    }

    ['setTimeout', 'setInterval'].forEach((name) => {
        wrap(window, name, (orig) => function (fn, delay, ...rest) {
            if (typeof fn === 'string') {
                emit(name + '-string', String(fn).slice(0, 300));
                
                if (monitorReady && isObviouslyDangerous(fn, 'setTimeout-string')) {
                    console.error('[ASI] eval() blocked -- obfuscated + dangerous code detected');
                    throw new Error('[ASI] Blocked: Obfuscated dangerous code in eval()');
                }

                if(blockedAPIs[name + '-string']){
                    console.error(`[ASI] ${name}() with string blocked`);
                    throw new Error(`[ASI] Blocked: ${name}() with string code is dangerous`);
                }
            }
            return orig.call(this, fn, delay, ...rest);
        });
    });

    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function (tagName, options) {
        if (String(tagName).toLowerCase() === 'script') {
            emit('createElement-script', String(tagName));

            if(blockedAPIs['createElement-script']){
                console.error('[ASI] Script element creation blocked');
                throw new Error('[ASI] Blocked: Script element creation detected');
            }
        }
        return originalCreateElement.call(this, tagName, options);
    };

    if (window.fetch) {
        wrap(window, 'fetch', (orig) => function (...args) {
            emit('fetch', args.slice(0, 3).map((a) => (typeof a === 'string' ? a : '[object]')));

            if(blockedAPIs['fetch']){
                console.error('[ASI] fetch() blocked');
                throw new Error('[ASI] Blocked: Suspicious fetch() call');
            }

            return orig.apply(this, args);
        });
    }

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
        // Patch only open() to reduce site breakage.
        const origOpen = window.XMLHttpRequest.prototype.open;
        tryDefine(window.XMLHttpRequest.prototype, 'open', function (method, url, ...rest) {
            emit('XHR-open', [method, url]);

            if (blockedAPIs['XHR-open']) {
                console.error('[ASI] XHR-open blocked');
                throw new Error('[ASI] Blocked: Suspicious XHR-open call');
            }

            return origOpen.call(this, method, url, ...rest);
        });
    }

    const observer = new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() === 'script') {
                    emit('mutation-script', (node.src || node.innerHTML || '').slice(0, 300));

                    if(blockedAPIs['mutation-script']){
                        console.error('[ASI] Script mutation blocked - removing node');
                        node.remove();
                        throw new Error('[ASI] Blocked: Script injection via DOM mutation');
                    }
                }
            });
        });
    });

    observer.observe(document.documentElement || document.body || document, {
        childList: true,
        subtree: true,
    });

    function showWarningBanner(score, message){
        return;
    }

    emit('page-monitor-loaded', 'ok');
    monitorReady = true;
})();
