# Runtime Monitoring Overview (My Part)

This file explains the part of the project I implemented: the **runtime monitoring layer**.

## 1) What my part does

My code watches risky JavaScript behavior while pages are running.

It does **not** do final risk scoring or UI display.
It only captures events and sends them to the background script.

## 2) Files I worked on

- `scripts/content.js`
- `scripts/page-monitor.js`
- `background.js` (for receiving/logging messages during testing)
- `test.html` (for testing hook behavior)

## 3) Why there are two monitor files

- `content.js` runs as a content script.
- `page-monitor.js` runs in page context (injected script).

Reason: some APIs (like `eval` and `Function`) are easier to monitor from page context.
So `page-monitor.js` captures events and uses `window.postMessage`, then `content.js` forwards those events to extension background.

## 4) What events are monitored

Current hook points:

- `eval`
- `Function`
- `setTimeout` / `setInterval` (string usage)
- `document.createElement('script')`
- `fetch`
- `XMLHttpRequest.open`
- DOM script injection via `MutationObserver`

## 5) Event format I send

All monitor events are sent to background in this shape:

```js
{
  antiScriptInjection: true,
  payload: {
    type: string,
    ts: number,
    src: string,
    data: any
  }
}
```

- `type`: event type (example: `eval`)
- `ts`: timestamp
- `src`: page URL
- `data`: short/sanitized details

## 6) Data flow (simple)

1. `page-monitor.js` hooks runtime APIs.
2. It emits event with `window.postMessage(...)`.
3. `content.js` receives and forwards to background.
4. `background.js` logs/receives event.
5. Detection/scoring teammate uses these events for further processing.

## 7) What this part does NOT do

- No final risk scoring
- No alert decision engine
- No UI rendering

Those belong to other team members.

## 8) How I tested my part

I used `test.html` and browser DevTools.

Examples tested:

- `eval("...")`
- `new Function("...")()`
- `setTimeout("...", 10)`
- dynamic script creation
- `fetch(...)`
- `XMLHttpRequest.open(...)`

Success criteria:

- page still works (non-intrusive)
- extension background console shows `[ASI event]` logs for each tested hook

## 9) Known limitations (expected for capstone level)

- Current implementation is mainly **detect + report**, not full blocking.
- Some big sites may produce noisy console warnings unrelated to this extension.
- Hooking is intentionally lightweight to avoid breaking normal page behavior.

## 10) Handoff to backend developer

Backend developer should consume `antiScriptInjection` events in `background.js`, then:

1. validate event
2. score risk
3. save results
4. expose results to UI

See also: `docs/event-contract.md`

## 11) How my part connects to backend (practical view)

My runtime monitor is the **input layer** for backend detection.

- I produce event data from hooks.
- Backend code reads the same events from `background.js`.
- Backend returns a score/severity that UI can display.

Simple connection flow:

1. Hook event happens (example: `eval`).
2. `content.js` sends `{ antiScriptInjection: true, payload: ... }`.
3. `background.js` receives message in `chrome.runtime.onMessage`.
4. Backend scoring module processes payload.
5. Result is stored/sent to UI.

Backend integration example:

```js
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message?.antiScriptInjection || !message.payload) return;

  const event = {
    ...message.payload,
    tabUrl: sender.tab?.url || "unknown",
    receivedAt: Date.now(),
  };

  // Backend developer logic starts here:
  // const scoreResult = scoreEvent(event);
  // saveResult(scoreResult);
  // notifyUI(scoreResult);
});
```

In short: my code captures and forwards runtime behavior; backend code decides what it means.
