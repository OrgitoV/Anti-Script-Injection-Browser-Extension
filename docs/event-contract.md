# Anti-Script Injection Event Contract

This document defines how runtime monitoring events are sent from the content layer to the background layer.

## Purpose

- Runtime monitoring developer: emits normalized events.
- Detection/scoring developer: consumes events and computes risk.
- UI developer: reads scored results from storage/messages.

## Message Envelope

All monitoring events are sent with this envelope:

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

## Payload Fields

- `type`: Event category (see event types below)
- `ts`: Unix timestamp in milliseconds (`Date.now()`)
- `src`: Source page URL where event happened
- `data`: Event details (truncated/sanitized by monitor)

## Event Types

Current runtime monitor can emit:

- `content-loaded`
- `page-monitor-loaded`
- `page-monitor-load-error`
- `eval`
- `Function`
- `setTimeout-string`
- `setInterval-string`
- `createElement-script`
- `fetch`
- `XHR-open`
- `mutation-script`

## Data Shape by Type

- `eval`: `string` (evaluated code snippet)
- `Function`: `string[]` (constructor args)
- `setTimeout-string`: `string`
- `setInterval-string`: `string`
- `createElement-script`: `string` (tag name)
- `fetch`: `string[]` (request args summary)
- `XHR-open`: `[method, url]`
- `mutation-script`: `string` (`src` or inline script content)
- startup/load events: short string marker

## Background Consumer Example

```js
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message?.antiScriptInjection || !message.payload) return;

  const event = {
    ...message.payload,
    tabUrl: sender.tab?.url || "unknown",
    receivedAt: Date.now(),
  };

  // Detection/scoring integration point
  // const score = scoreEvent(event);
  // saveDetection(event, score);
});
```

## Recommended Scoring Ownership

Detection/scoring module should:

1. Validate event format
2. Map `type` to risk weight
3. Add context-based rules (frequency, domain, sequence)
4. Output score + severity (`low`/`medium`/`high`)
5. Persist results (`chrome.storage.local`)
6. Notify UI (`chrome.runtime.sendMessage` or storage polling)

## Backward Compatibility Notes

- Keep `antiScriptInjection` envelope flag unchanged.
- Keep `payload.type`, `payload.ts`, `payload.src`, `payload.data` unchanged.
- Add new fields as optional to avoid breaking existing consumers.

## Suggested Output Format (for UI)

```js
{
  event,
  score: number,
  severity: 'low' | 'medium' | 'high',
  reason: string,
  createdAt: number
}
```

## Quick Validation Checklist

- Runtime event appears in background console when hook triggers.
- `antiScriptInjection === true` for all monitor messages.
- All events include `type`, `ts`, and `src`.
- Unknown `type` values do not crash scoring pipeline.
