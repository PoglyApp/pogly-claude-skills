# Pogly widget authoring reference

Distilled from the widget authoring prompt, https://docs.pogly.gg (widget-development) and
the widget compiler's observed behaviour. This is the contract the generated widget must
satisfy. Read it fully once per session.

## How a widget runs

- A widget is four code sections: **header** (goes in `<head>`, for external `<link>`/`<script src>`),
  **body** (HTML), **style** (CSS), **script** (JS, runs after the DOM loads).
- The compiler builds one document:
  `<!DOCTYPE html><html><head>{header}<style>html{pointer-events:none} {style}</style></head><body>{body}<script>{integrations}{script}{liveListener}</script></body></html>`
  and renders it in an iframe via `srcDoc`. It is not served from a URL.
- The script has full browser API access (window, document, fetch, WebSocket) but no access to
  the parent page.
- Pointer events are disabled on the widget container. Widgets are purely visual overlays and
  are NEVER interactive: do not write click, mouse, keyboard or touch handlers expecting input.
  User interaction happens through variables (buttons, toggles, counters, hotkeys) instead.
- Every connected client (each editor tab and the live overlay) independently reconstructs the
  widget from the same code and variable values. Nothing inside the iframe is networked, so the
  output must be deterministic (see Determinism below).

## Re-execution behaviour

- When any non-live variable changes (including every type 3 toggle flip), the whole widget is
  recompiled and the iframe replaced. The script re-runs from scratch; no JS state survives.
- Live variables (`variableLive: true`) instead post a message into the running iframe, and the
  compiler-injected listener calls `onLiveVariableUpdate(name, value)` if you defined it.
  Timers, animations and counters keep running.
- There is no resync on load: initial values arrive only through `{name}` substitution. Never
  rely on `onLiveVariableUpdate` for initial state.
- Close WebSockets and note timer ids so they can be cleaned up:
  `window.addEventListener("beforeunload", function() { ws.close(); });`

## Variables

Reference a variable anywhere in any section with `{variableName}`. Values are substituted with
`replaceAll` at compile time: raw text, no parsing, no escaping, everywhere including strings
and comments.

Consequences of literal substitution:

- A string variable inside JS must be quoted in the code: `var label = "{myVar}";`
- A color variable can sit bare in CSS (`color: {myColor};`) but must be quoted in JS.
- A boolean substitutes bare `true`/`false`, so `var on = {myBool};` is valid JS.
- Never feed variable values into `eval()`, `new Function()`, or `innerHTML`; they are not
  sanitised.
- Because replacement is textual, any `{name}` collision in the code gets replaced too:
  `const {user} = data` (destructuring) or `` `${user}` `` (template literal) would be mangled
  if a variable named `user` exists. Use distinctive variable names and avoid JS syntax that
  produces `{identifier}` text matching a variable name. Plain string concatenation is safest.

### Types

| Type | Id | Substituted value | Notes |
| --- | --- | --- | --- |
| string | 1 | the text verbatim | also used for numbers; quote in JS |
| boolean | 2 | `true` / `false` | checkbox in the controls panel |
| toggle | 3 | `true` / `false` | a button the editor clicks to flip the value; every flip forces a full recompile; can never be live |
| color | 4 | hex like `#ff0000` | color picker |
| image | 5 | a URL / data URI | use in `src` or `url()`; can never be live |
| button | 6 | its fixed `variableValue` | no effect on load; each press pushes the fixed value through `onLiveVariableUpdate`; always live but the export JSON must still say `"variableLive": true` |
| slider | 7 | number as string | `variableMin`/`variableMax`/`variableStep` (defaults 0/100/1); mark live; streams roughly 10 updates/s while dragging, keep its handler branch cheap (set a style, do not rebuild DOM) |
| dropdown | 8 | selected option string | `variableOptions` array of strings; `""` value means no default selection |
| datetime | 9 | per `variableDateFormat` | `raw` (default, `2026-06-27T14:30`), `iso`, `unix`, `unix_ms`, `date`, `time`, `locale`; `variableValue` stores the native datetime-local string |
| counter | 10 | number as string | `variableSteps` array of SIGNED amounts, one button each (default `[-1, 1]`); optional `variableMin`/`variableMax`, omit for unbounded; ignores `variableStep`; mark live; stays clickable from the Details panel even when not live |
| list | 11 | per `variableListFormat` | entries stored inside `variableValue` as a JSON array string like `"[\"a\",\"b\"]"`; formats `json` (default), `csv`, `lines`; editable only in the widget IDE, cannot be hotkey-bound |
| multiselect | 12 | per `variableListFormat` | checkbox list; choices in `variableOptions`, ticked subset in `variableValue` as a JSON array string; selection always re-sorted to the authored option order; mark live |

The counter's value persists in Pogly's own state and syncs to every client, so a counter
variable is the right way to make a number survive restarts and streams (a list variable does
the same for text entries). Browser storage is not a substitute: it is per browser, so it is
allowed only under the acknowledged-storage rule in Determinism.

Any variable may carry `variableDescription`: a tooltip shown next to its control, never
substituted into code. Write one for every variable whose name and default do not fully
explain it (units, expected format, what a button actually does).

### Live variables

- Types 1, 2, 4, 7, 8, 9, 10, 11, 12 may set `"variableLive": true`. Type 6 is always live but
  still needs the flag in the JSON. Types 3 and 5 can never be live.
- Sliders (7), counters (10) and multiselects (12) are live by default in the IDE, but the
  export JSON only makes them live if it says `variableLive: true`, so set it explicitly.
- A live change skips the recompile. The compiler injects the message listener automatically
  when any variable is live; you only define the handler. Do not add your own `message`
  listener.

```js
function onLiveVariableUpdate(name, value) {
  // value is a string, already formatted like the compile-time substitution:
  // boolean -> "true"/"false", slider/counter -> "42", datetime honours variableDateFormat,
  // list honours variableListFormat. One exception: a live multiselect on the json format
  // delivers a real array, not its text.
  if (name === "textColor") document.getElementById("title").style.color = value;
}
```

- If any variable is live (including any button), the script must define
  `onLiveVariableUpdate`, otherwise live updates do nothing visible.
- Mark a variable live when an editor will change it mid-stream and the widget has running
  state (timers, animations, counts) that must not reset. Leave it non-live when a restart on
  change is fine or wanted; use a type 3 toggle exactly when the restart IS the point (arming a
  scene, restarting an animation from zero).
- Hotkeys: editors can bind any variable on a placed widget to a key combo. Binds fire the
  same path as the Details panel, so design mid-stream controls as live variables (buttons,
  counters, toggles) rather than expecting anyone to open the IDE.

### System variables (auto-provided, reserved names)

- `{is_overlay}`: `"true"` in the live overlay URL, `"false"` in the editor preview.
- `{widget_width}` / `{widget_height}`: the placed element's size in pixels. Prefer these over
  hardcoded sizes when the layout needs real pixel numbers (e.g. canvas sizing); otherwise use
  responsive CSS (vw/vh/vmin against the iframe viewport, flex, clamp()).
- `{channel_name}`: the channel name from the overlay's Owner Settings.
- `{platform}`: the streaming platform from Owner Settings, lowercase (`"twitch"`, `"youtube"`,
  `"kick"`).

`{channel_name}` and `{platform}` substitute as empty strings when no instance config is
loaded (marketplace and review previews), so anything rendering them needs a sensible empty
state; like any string substitution they must be quoted in JS. Use them instead of asking for
a channel-name or platform variable when the widget just displays or branches on the user's
own stream settings. They are plain compile-time text, never live.

You cannot declare a variable with any of these names.

## Determinism

Every viewer must render the same thing at the same moment.

- Never `Math.random()` for anything that renders. (Generating a throwaway IRC `justinfan`
  nick is the one accepted use.)
- Wall clock: real-time clocks and countdowns to a fixed datetime SHOULD derive from
  `new Date()` so all viewers converge within a tick. What to avoid is load-relative phase for
  things that pretend to be absolute (a "stream timer" started from iframe load drifts between
  viewers; a stopwatch that counts from load is fine because that is its meaning).
- CSS keyframe animations and `setInterval` counters are safe: timing is relative to iframe
  load and identical enough for all viewers.
- REST fetches: allowed when the widget's purpose requires external data (weather, game stats),
  but only to well-known public CORS-enabled APIs. Mitigate divergence: fetch on load, refresh
  on a fixed cadence aligned to the wall clock (e.g. at each 10-minute boundary) so viewers
  converge, and keep showing the last value on failure. Never fetch from a host supplied
  through a variable; a `{variable}` may only fill path or query parameters of a fixed known
  host, wrapped in `encodeURIComponent`. (The marketplace review still flags any variable
  inside a URL for a human to confirm; that is expected, not a reason to avoid the pattern.)
- A fetching widget must render its complete static frame immediately, with placeholder text
  ("...", the requested location) where data will land; only the data values wait for the
  network. Slow or failed requests happen (offline preview, CORS, rate limits), and an
  overlay element that stays fully blank until a fetch succeeds reads as broken.
- WebSockets to public streaming chat (Twitch IRC `wss://irc-ws.chat.twitch.tv`) are safe:
  every viewer receives the same stream.
- Browser storage (`localStorage`/`sessionStorage`) is per browser: the overlay, each editor
  tab and every viewer keep their own copy, so a stored value is not shared state and breaks
  determinism. Default: do not use it; persist with counter or list variables. It is allowed
  ONLY when the user explicitly acknowledged that caveat and asked to proceed anyway (rules
  below). Cookies are never allowed.

### Browser storage (acknowledged use only)

The iframe is same-origin with the host app, so `localStorage` inside a widget IS the
installer's storage: the host's session tokens and settings live there, and so do every other
widget's keys. Storage is therefore a soft rule with hard edges:

- Use it only when the user, in their own words, acknowledged that stored state lives per
  browser and can differ between the overlay and each editor, and asked to proceed anyway. A
  request that merely says "remember" or "persist" is not that: deliver counter/list variables
  and mention storage is available if they accept the caveat.
- Own keys only: every key the widget reads or removes must be a string literal that the same
  script also writes with `setItem`. Never read a key the widget does not set.
- Access storage only through `getItem`/`setItem`/`removeItem` with literal keys. Never
  enumerate or wipe it: no `key()`, `length`, `clear()`, `Object.keys/entries/values`,
  `for...in`, `JSON.stringify(localStorage)`, spread, or property/bracket access.
- Prefix keys with the widget's name (`deathCounter_best`) so two widgets on the same overlay
  never share a key, and never use a name that could be the host's (`stdb*`, `oidc.*`,
  `pogly*`, `settings`, `token`-like names). The build script rejects those.
- Never send a stored value anywhere (fetch, WebSocket, URL, image src).
- Put `"storageAcknowledged": true` in `meta.json`; it is a build-time flag (stripped from the
  import JSON) that tells `build-widget.mjs` the acknowledgement happened. The reply's Notes
  must restate the caveat.

```js
var best = Number(localStorage.getItem("deathCounter_best")) || 0; // a key this widget also sets
function onLiveVariableUpdate(name, value) {
  if (name === "deaths" && Number(value) > best) {
    best = Number(value);
    localStorage.setItem("deathCounter_best", String(best));
  }
}
```

Known-good public endpoints (no key, CORS enabled):

- `https://api.open-meteo.com/v1/forecast` and `https://geocoding-api.open-meteo.com/v1/search` (weather, place lookup)
- `https://fonts.googleapis.com` / `fonts.gstatic.com` (fonts, via header `<link>`)
- `https://cdn.jsdelivr.net`, `https://cdnjs.cloudflare.com`, `https://unpkg.com` (JS/CSS libraries, pin versions)
- `wss://irc-ws.chat.twitch.tv:443` (anonymous Twitch chat: `PASS SCHMOOPIIE`, `NICK justinfan<digits>`, `JOIN #channel`)

## Integrations

### Twitch chat (host-provided, preferred over opening your own IRC socket)

Top-level import JSON fields:

```json
"chatIntegration": true,
"chatEvents": ["message"]
```

Omit `chatChannel` entirely: the host then follows the channel from the overlay's stream
config automatically, which is what nearly every widget wants. Only set it (lowercase Twitch
login, no `#`) when the user explicitly wants the widget watching a specific other channel,
and say so in the reply's Notes (a multi-streamer's second-platform override is set by the
user in the integrations tab, see the platform rule below). `chatEvents` picks which events
get wired; omitting it means message-only, `[]` means none. Only request events the widget
uses. The compiler injects the listeners; you only define the callbacks:

| Event key | Callback | Payload highlights |
| --- | --- | --- |
| `message` | `onTwitchMessage(data)` | `username, message, isAction, color, badges, userId, isBroadcaster, isMod, isVip, isSubscriber` |
| `sub` | `onTwitchSub(data)` | `subType, username, tier, isPrime, message, cumulativeMonths, streakMonths, recipient, giftCount, goal` |
| `raid` | `onTwitchRaid(data)` | `username, viewers` |
| `unraid` | `onTwitchUnraid(data)` | `channel` |
| `badgeUpgrade` | `onTwitchBadgeUpgrade(data)` | `badgeType, username, threshold, message` |
| `viewerMilestone` | `onTwitchViewerMilestone(data)` | `milestoneType, username, value, reward, message` |
| `sharedChatNotice` | `onTwitchSharedChatNotice(data)` | `noticeType, sourceChannel, sourceOnly` |

Every payload also carries `channel` and `raw`. A gift bomb emits ONE `subMysteryGift` plus one
`subGift` per recipient, so count either the bomb or the gifts, never both. `goal` is present
only while a sub goal runs (`goal.current` / `goal.target`).

**Sender roles (Twitch).** Messages carry four role booleans, `isBroadcaster`, `isMod`,
`isVip`, `isSubscriber` (Kick messages carry the same four, so shared code can treat both
platforms alike). They come straight from tmi.js, which derives them the way Twitch defines
them: `isBroadcaster` is the broadcaster badge (or room id = user id), `isMod` a moderator or
lead_moderator badge or the mod tag, `isVip` the vip badge or tag, `isSubscriber` a subscriber
or founder badge. The broadcaster is NOT a mod on Twitch, so never gate on `isMod` alone:
`data.isBroadcaster || data.isMod` is the "streamer and mods" check. Rarer flags
(`isFounder`, `isLeadMod`, `isBot`) live on `data.raw.user`; `data.badges` is the badge set as a
plain `{ name: version }` object.

```js
function onTwitchMessage(data) {
  var canControl = data.isBroadcaster || data.isMod; // add data.isVip when VIPs may control it
  handleCommand(data.username, data.message, canControl);
}
```

**Platform rule (Pogly 1.4.1+).** With `chatChannel` omitted the widget connects only when
the overlay's streaming platform in Owner Settings is Twitch; on a Kick (or other) instance a
Twitch integration with a blank channel never connects, while an explicit `chatChannel`
always connects. Say in Notes which case applies. The widget IDE has a chat simulation view
that fires sample Twitch and Kick events (including a broadcaster) at the preview, so users
can test the handlers without going live; mention it for chat widgets.

### Kick chat (host-provided, same architecture as Twitch chat)

Top-level import JSON fields:

```json
"kickIntegration": true,
"kickEvents": ["message"]
```

Omit `kickChannel` entirely: the host then follows the channel from the overlay's stream
config. Only set it (lowercase Kick channel slug, no `#`) when the user explicitly wants the
widget watching a specific other channel, and say so in the reply's Notes. The same platform
rule as Twitch applies: blank connects only on a Kick instance, an explicit `kickChannel`
always connects. `kickEvents` picks which events get wired; omitting it means message-only,
`[]` means none. Only request events the widget uses. The compiler injects the listeners; you
only define the callbacks:

| Event key | Callback | Payload highlights |
| --- | --- | --- |
| `message` | `onKickMessage(data)` | `username, message, color, badges, userId, isBroadcaster, isMod, isVip, isSubscriber, messageId` |
| `sub` | `onKickSub(data)` | `username, months` |
| `giftedSubs` | `onKickGiftedSubs(data)` | `username` (the gifter), `giftedUsernames, giftCount` |
| `host` | `onKickHost(data)` | `username, viewers, message` |
| `messageDeleted` | `onKickMessageDeleted(data)` | `messageId` |
| `userBanned` | `onKickUserBanned(data)` | `username, bannedBy, expiresAt` (`null` = permanent ban, ISO timestamp = timeout) |
| `userUnbanned` | `onKickUserUnbanned(data)` | `username, unbannedBy` |
| `pinnedMessageCreated` | `onKickPinnedMessageCreated(data)` | `username, message, duration` |
| `pinnedMessageDeleted` | `onKickPinnedMessageDeleted(data)` | only `channel` and `raw` |
| `pollUpdate` | `onKickPollUpdate(data)` | `title, options` (`[{ id, label, votes }]`), `duration, remaining` |
| `pollDelete` | `onKickPollDelete(data)` | only `channel` and `raw` |

Every payload also carries `channel` and `raw` (the untouched Pusher event data). Differences
from Twitch to design around: emotes arrive embedded in `message` as `[emote:id:name]` tags;
`badges` is an array of `{ type, text, count? }` objects, not a name->version record;
`username` is always the acting user (sender, gifter, host); numeric fields the event may omit
arrive as `null`.

**Sender roles (Kick).** Kick has no role flags of its own; roles exist only as badges on the
sender's identity, and the host derives the same four booleans as Twitch from them:
`isBroadcaster` (`broadcaster` badge), `isMod` (`moderator`), `isVip` (`vip`), `isSubscriber`
(`subscriber` or `founder`). As on Twitch the broadcaster is never `isMod`, so use
`data.isBroadcaster || data.isMod`. For anything else read `data.badges` (the
`[{ type, text, count? }]` array) and match on `type`, the stable identifier, never on `text`,
the display label. Badge types seen in the wild: `broadcaster`, `moderator`, `vip`, `og`,
`founder`, `subscriber` (`count` = months), `sub_gifter` (`count` = gifts), `verified`,
`staff`. Global cosmetic badges (level, seasonal) live only in `raw.sender.identity.badges_v2`
and grant nothing.

```js
function onKickMessage(data) {
  var canControl = data.isBroadcaster || data.isMod;
  handleCommand(data.username, data.message, canControl);
}
```

A widget may enable both `chatIntegration` and `kickIntegration`, and since Pogly 1.4.1 both
connect at the same time: the instance's own platform with its channel blank, the other
platform through its channel override. Two designs follow. A works-on-either-platform widget
enables both, leaves both channels blank (whichever matches the instance connects) and shares
one handler. A multi-streaming widget also needs the second platform's override, a
user-specific value the import cannot know, so leave it blank and tell the user in Notes to
set it in the widget's integrations tab. The four role booleans have the same names on both
platforms, so a shared handler can take `data` from either callback; just never gate on
`isMod` alone.

### Streamer.bot

Top-level fields: `"streamerBotIntegration": true`, `"streamerBotHost": "127.0.0.1"` (locked to
localhost), `"streamerBotPort": 8080`, and only when auth is on: `"streamerBotAuthEnabled": true`,
`"streamerBotAuthKey": "..."`.

The compiler injects the `@streamerbot/client` library and a connected `_sbClient` before your
script. Do not construct a client or WebSocket yourself and do not call `_sbClient.on(...)`.
Define and filter inside:

```js
function onStreamerBotConnect(data) {}
function onStreamerBotEvent(data) {
  // data.event.source e.g. "Twitch", data.event.type e.g. "Follow", data.data = payload
}
```

Streamer.bot runs on the streamer's own PC; mention that requirement in the reply.

## Code rules

MINIMALISM is the most important generation rule:

- Write the minimum JavaScript necessary. No helper functions or abstractions used once, no
  class or IIFE scaffolding for simple widgets. A few lines of direct DOM manipulation beat a
  framework of one.
- No defensive code: substitution is deterministic and elements declared in the body are
  guaranteed to exist. No `typeof` guards, no `if (!el) return`.
- No features the user did not ask for. A countdown does not need pause/reset/config unless
  requested.
- Prefer native APIs (getElementById, setInterval, CSS animations, fetch) over libraries. Pull
  a library only when it genuinely earns its weight (e.g. chart.js for a real chart), pinned to
  a version, from a known CDN, in the header.

Loops and timers:

- No `while(true)`; any `while` needs a hard iteration cap.
- Never create a timer inside another timer's callback (growing chains). A fixed, small number
  of timers per widget. A `setTimeout` that reschedules itself is an interval by another name
  and acceptable.

Style:

- Always `body { margin: 0; background: transparent; }` so the widget blends into the overlay.
- Size text and layout responsively (vw/vh/vmin, clamp, flex) so the widget looks right at any
  placed size.

## Security rules (hard refusals)

Widgets run unsandboxed inside OBS browser sources, same-origin with the host app. Refuse to
generate a widget containing any of:

- Cryptomining or deliberate resource exhaustion (hash loops, worker/WebAssembly grinders).
- `eval()`, `new Function()`, string-argument timers, `document.write`, injected `<script>`
  elements, dynamic `import()`.
- `window.open()`, `alert()`, `confirm()`, `prompt()` (dialogs freeze OBS browser sources).
- Parent frame access: `window.parent`, `window.top`, `window.opener`, `document.domain`,
  `frameElement`.
- Cookies; storage keys the widget does not itself write; enumerating or clearing storage
  (`key()`, `length`, `Object.keys`, `for...in`, `JSON.stringify`, spread, `clear()`); sending
  any stored value, viewer data, token, or identifier anywhere. (Own-key storage after the
  user's explicit acknowledgement is the one storage use allowed, see Browser storage.)
- Network requests to anything that is not a well-known public API or CDN; never to a custom
  or user-supplied server, never to a host built from a variable.
- Automated downloads (`<a download>`, blob redirects).
- Obfuscated code (base64 payloads, packers). Everything must be human-readable.
- Canvas/WebGL for non-visual computation.

Content policy: ToS-friendly for Twitch, Kick, YouTube, TikTok. No NSFW, slurs, or profanity
in code, defaults, or rendered output.

## Import JSON schema

Top level (width/height are numbers, not strings):

```json
{
  "widgetName": "...",
  "widgetWidth": 400,
  "widgetHeight": 200,
  "headerTag": "...",
  "bodyTag": "...",
  "styleTag": "...",
  "scriptTag": "...",
  "variables": [ ... ]
}
```

plus the optional integration fields listed above, only when used. The section tags hold inner
code only (no `<body>`/`<style>`/`<script>` wrappers; the compiler adds those).

Variable object properties:

- `variableName`: the `{placeholder}` keyword
- `variableType`: 1 to 12
- `variableValue`: default value as a string, except types 2 and 3 which use a real boolean;
  for type 6 the fixed string sent on each press; for types 11/12 a JSON array string
- `variableLive`: optional, see Live variables
- `variableDescription`: optional tooltip, any type
- `variableMin` / `variableMax` / `variableStep`: type 7 (defaults 0/100/1)
- `variableMin` / `variableMax`: type 10, both optional
- `variableSteps`: type 10, array of signed numbers, default `[-1, 1]`
- `variableOptions`: types 8 and 12, array of option strings
- `variableDateFormat`: type 9: `raw`, `iso`, `unix`, `unix_ms`, `date`, `time`, `locale`
- `variableListFormat`: types 11 and 12: `json`, `csv`, `lines`

The whole import string must stay under 200,000 characters (image data URIs count).
