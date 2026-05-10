
const tabHistory = {}; //Events per each tab

function calculateThreatScore(payload, pattern, context){
  let score = 0;

  // FACTOR 1: Set base risk according to payload.type
  const baselineRisk = {
    'eval': 90,                 // Highest Risk: Direct code exec
    'Function': 85,             // Constructor-based code exec
    'mutation-script': 80,      // DOM script injection
    'fetch': 20,                // Lower risk - legitimate needs
    'XHR-open': 20,             // Similar to fetch
    'createElement-script': 75, // Script element creation
    'setTimeout-string': 80,    // String-based timing is a risk
    'setInterval-string': 80    // Similar to setTimeout
  }
  score += baselineRisk[payload.type] || 0;

  // FACTOR 2: Obfuscation Detection
  if (payload.data) {
    const dataStr = Array.isArray(payload.data)
      ? payload.data.join('')
      : String(payload.data);
    
    // Check for encoding patterns
    if (/atob|btoa|String\.fromCharCode|\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/i.test(dataStr)) score += 25;

    // Check for suspicious keywords
    if (/document\.(write|innerHTML|body)|window\.location|eval|constructor|prototype/i.test(dataStr)) score += 20
  }

  // FACTOR 3: Context/Pattern Analysis
  if(pattern === 'fetch-eval') score += 30; // Fetching ext code and executing
  else if(pattern === 'fetch-mutation-script') score += 25; // Fetching and injecting scripts
  else if(pattern === 'multi-obfuscation') score += 15; // Multiple encoding layers
  else if(pattern === 'rapid-fire-injection') score += 20; // Automated injectionxc

  // FACTOR 4: Source Analysis
  if(payload.src){
    const pageOrigin = new URL(payload.src).origin;
    if(isThirdPartyResource(payload.data, pageOrigin)) score += 15;
  }

  return Math.min(score, 100); // Cap at 100
}

// Background message receiver for Anti-Script Injection monitoring
console.log('[ASI] background service worker started');

// Fires on install/update so we can confirm extension lifecycle events.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ASI] extension installed/updated');
});

// Receives monitoring events from content script and logs them for testing.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.antiScriptInjection && message.payload) {
    const tabId = sender.tab.id;
    if(!tabHistory[tabId]) tabHistory[tabId] = [];

    tabHistory[tabId].push(message.payload);

    const currentIndex = tabHistory[tabId].length - 1;
    const pattern = detectPattern(tabHistory[tabId], currentIndex);
    const threatScore = calculateThreatScore(message.payload, pattern);

    const action = getAction(threatScore, pattern, tabHistory[tabId]);

    console.log('[ASI]', {
      type: message.payload.type,
      pattern,
      score: threatScore,
      action: action.type,
      timestamp: new Date().toISOString()
    });

    if (threatScore > 0) {
      const storeKey = `asi_tab_${tabId}`;
      chrome.storage.local.get([storeKey], (res) => {
        const existing = res[storeKey] || { score: 0, events: [] };
        const storedEvent = {
          type: message.payload.type,
          ts: message.payload.ts,
          src: message.payload.src,
          score: threatScore,
          action: action.type,
          pattern,
          reason: action.reason || ''
        };

        chrome.storage.local.set({
          [storeKey]: {
            score: threatScore,
            events: [...existing.events, storedEvent].slice(-60)
          }
        });
      });
    }

    // Take action based on score
    if(action.shouldBlock) blockExecution(sender.tab.id, message.payload, action.reason);
    else if(action.shouldWarn) warnUser(sender.tab.id, threatScore);
  }
});

function getAction(score, pattern, payload) {
  if(score >= 75) return { shouldBlock: true, type: 'block', reason: 'High-risk XSS detected' };
  else if(score >= 50) return { shouldWarn: true, type: 'warn', reason: `Suspicious pattern: ${pattern}` };
  return { type: 'allow' };
}

function detectPattern(history, currentIndex){
  //check if certain actions happen close together
  const event = history[currentIndex];
  const timeWindow = 5000; // 5sec
  const window5Events = history.slice(Math.max(0, currentIndex - 5), currentIndex + 1);

  // SUSPICIOUS PATTERNS:

  // Pattern 1: Fetch-eval (classic external payload atk)
  const hasFetchThenEval = window5Events.some(e =>
    (e.type === 'fetch' || e.type === 'XHR-open') && e.ts < event.ts
    && (event.ts - e.ts) < timeWindow
  ) && (event.type === 'eval' || event.type === 'Function');
  if(hasFetchThenEval) return 'fetch-eval';

  // Pattern 2: Fetch then DOM Mutation w/scripts
  const hasFetchThenMutation = window5Events.some(e =>
    (e.type === 'fetch' || e.type === 'XHR-open') && e.ts < event.ts
    && (event.ts - e.ts) < timeWindow
  ) && (event.type === 'mutation-script' || event.type === 'createElement-script');
  if(hasFetchThenMutation) return 'fetch-mutation-script';

  // Pattern 3: Multiple encoding/onfuscation steps
  const obfuscationSteps = window5Events.filter(e =>
    ['setTimeout-string', 'Function', 'mutation-script', 'createElement-script'].includes(e.type)
  ).length
  if(obfuscationSteps >= 2) return 'multi-obfuscation';

  // Pattern 4: Rapid-fire suspicious API calls (automated injection)
  const suspiciousTypes = ['eval', 'Function', 'mutation-script', 'createElement-script'];
  const rapidFireCount = window5Events.filter(e =>
    suspiciousTypes.includes(e.type)
  ).length;
  if(rapidFireCount >= 3) return 'rapid-fire-injection';

  return 'none'
}

function isThirdPartyResource(data, pageOrigin){
  if(!data) return false;

  const dataStr = Array.isArray(data) ? data.join('') : String(data);

  // Extract URL from data with regex
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const urls = dataStr.match(urlPattern) || [];

  // Check if URLs are from a diff. origin
  for(const url of urls){
    try{
      const urlOrigin = new URL(url).origin;
      if(urlOrigin !== pageOrigin) {
        return true; // is a 3rd party resource
      }
    } catch(e){
      // invalid URL -- skip
    }
  }

  return false;
}

function blockExecution(tabId, payload, reason){
  //Send blocking command to content.js

  const details = {
    type: payload.type,
    reason: reason,
    data: payload.data?.toString().slice(0, 150),
    src: payload.src,
    timestamp: new Date().toISOString()
  };

  console.warn('[ASI BLOCKED]', details);
  
  chrome.tabs.sendMessage(tabId, {
    command: 'blockExecution',
    type: payload.type,
    reason: reason,
    payload: payload
  }).catch(err => {console.error('[ASI] Failed to send block message:', err)});

}
