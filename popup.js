async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const key = `asi_tab_${tab.id}`;
  const result = await chrome.storage.local.get([key]);
  const data = result[key] || { score: 0, events: [] };
  renderRisk(data.score);
  renderAlerts(data.events);

  // Live updates while popup is open
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[key]) {
      const updated = changes[key].newValue || { score: 0, events: [] };
      renderRisk(updated.score);
      renderAlerts(updated.events);
    }
  });
}

function renderRisk(score) {
  const scoreEl = document.getElementById('risk-score');
  const barEl   = document.getElementById('risk-bar');
  const labelEl = document.getElementById('risk-label');

  if (!scoreEl || !barEl || !labelEl) return;

  scoreEl.textContent  = score;
  barEl.style.width    = score + '%';

  let color, label;
  if      (score >= 75) { color = '#e74c3c'; label = 'DANGER'; }
  else if (score >= 50) { color = '#f39c12'; label = 'SUSPICIOUS'; }
  else if (score >= 25) { color = '#f1c40f'; label = 'CAUTION'; }
  else                  { color = '#2ecc71'; label = 'SAFE'; }

  scoreEl.style.color    = color;
  barEl.style.background = `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`;
  labelEl.textContent    = label;
  labelEl.style.color    = color;
}

function renderAlerts(events) {
  const list = document.getElementById('alert-list');
  if (!list) return;

  if (!events || !events.length) {
    list.innerHTML = '<div class="alert-empty"><i class="bi bi-shield-check"></i>&nbsp; No threats detected</div>';
    return;
  }

  list.innerHTML = [...events].reverse().map(e => {
    const isBlock = e.action === 'block';
    const badge   = isBlock
      ? '<span class="badge block">BLOCKED</span>'
      : '<span class="badge warn">WARN</span>';
    const threat = getThreatInfo(e.type, e.pattern, isBlock);
    const scoreClass = getScoreSeverityClass(e.score);
    let origin = 'unknown';
    try { origin = new URL(e.src).hostname; } catch (_) {}
    const time = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="alert-item ${isBlock ? 'blocked' : 'warning'}">
        <div class="alert-copy">
          <div class="alert-head">
            ${badge}
            <span class="alert-title">${threat.title}</span>
          </div>
          <div class="alert-context">${threat.context}</div>
          <div class="alert-meta">
            <span title="${e.src || ''}">${origin}</span>
            <span>${time}</span>
          </div>
        </div>
        <span class="alert-score ${scoreClass}">${e.score}</span>
      </div>`;
  }).join('');
}

function getThreatInfo(type, pattern, isBlocked) {
  const map = {
    eval: {
      title: isBlocked ? 'Eval Execution Blocked' : 'Eval Execution Detected',
      context: 'The page attempted to execute string-based JavaScript through eval().'
    },
    Function: {
      title: isBlocked ? 'Dynamic Function Blocked' : 'Dynamic Function Detected',
      context: 'A runtime-generated function was created, which can hide injected payloads.'
    },
    'mutation-script': {
      title: isBlocked ? 'Injected Script Blocked' : 'Injected Script Detected',
      context: 'A script node was inserted into the DOM, a common script-injection method.'
    },
    'createElement-script': {
      title: isBlocked ? 'Script Creation Blocked' : 'Script Creation Detected',
      context: 'The page dynamically created a script element.'
    },
    fetch: {
      title: 'Remote Payload Request',
      context: 'External content was requested and may be used in later execution.'
    },
    'XHR-open': {
      title: 'XHR Request Opened',
      context: 'A network request was opened and may be part of staged injection behavior.'
    },
    'setTimeout-string': {
      title: isBlocked ? 'Timed String Execution Blocked' : 'Timed String Execution Detected',
      context: 'A string payload was passed into setTimeout().'
    },
    'setInterval-string': {
      title: isBlocked ? 'Repeated String Execution Blocked' : 'Repeated String Execution Detected',
      context: 'A string payload was passed into setInterval().'
    }
  };

  if (map[type]) return map[type];

  if (pattern && pattern !== 'none') {
    return {
      title: isBlocked ? 'Suspicious Pattern Blocked' : 'Suspicious Pattern Detected',
      context: `Pattern "${pattern}" matched known script injection behavior.`
    };
  }

  return {
    title: isBlocked ? 'Threat Blocked' : 'Threat Detected',
    context: 'Suspicious script activity matched extension monitoring rules.'
  };
}

function getScoreSeverityClass(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

init();
