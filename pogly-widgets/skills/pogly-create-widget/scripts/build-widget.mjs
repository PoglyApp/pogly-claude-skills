#!/usr/bin/env node
// Compile a Pogly widget from section files into the import JSON, validating as it goes.
//
// Usage: node build-widget.mjs <dir> [--out <file>]
//   <dir> contains meta.json (required) and any of: header.html, body.html, style.css, script.js
//   Missing section files compile as empty strings. Writes <dir>/widget.json (or --out).
//
// meta.json: { widgetName, widgetWidth, widgetHeight, variables: [...],
//              chatIntegration?, chatChannel?, chatEvents?,
//              streamerBotIntegration?, streamerBotHost?, streamerBotPort?,
//              streamerBotAuthEnabled?, streamerBotAuthKey? }
// Variable objects use the same properties as the export format (variableName, variableType, ...).
//
// Exit 0 on success (warnings allowed), 1 on errors. Fix errors and rerun; judge warnings.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
if (!dir) {
  console.error("usage: node build-widget.mjs <dir> [--out <file>]");
  process.exit(1);
}
const outPath = outIdx !== -1 ? args[outIdx + 1] : join(dir, "widget.json");

const errors = [];
const warnings = [];
const notes = [];

const readSection = (name) => {
  const p = join(dir, name);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "");
};

let meta;
try {
  meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
} catch (e) {
  console.error(`ERROR meta.json: ${e.message}`);
  process.exit(1);
}

const header = readSection("header.html");
const body = readSection("body.html");
const style = readSection("style.css");
const script = readSection("script.js");
const allCode = { header, body, style, script };

// ---- meta ----
const KNOWN_META = new Set([
  "widgetName", "widgetWidth", "widgetHeight", "variables",
  "chatIntegration", "chatChannel", "chatEvents",
  "streamerBotIntegration", "streamerBotHost", "streamerBotPort",
  "streamerBotAuthEnabled", "streamerBotAuthKey",
]);
for (const k of Object.keys(meta)) {
  if (!KNOWN_META.has(k)) warnings.push(`meta.json: unknown key "${k}" (typo?)`);
}
if (!meta.widgetName || typeof meta.widgetName !== "string") errors.push("widgetName must be a non-empty string");
for (const k of ["widgetWidth", "widgetHeight"]) {
  if (typeof meta[k] !== "number" || !(meta[k] > 0)) errors.push(`${k} must be a positive number (not a string)`);
}
const variables = Array.isArray(meta.variables) ? meta.variables : (errors.push("variables must be an array"), []);

// ---- variables ----
const RESERVED = new Set(["is_overlay", "widget_width", "widget_height"]);
const LIVE_OK = new Set([1, 2, 4, 7, 8, 9, 10, 11, 12]);
const DATE_FORMATS = new Set(["raw", "iso", "unix", "unix_ms", "date", "time", "locale"]);
const LIST_FORMATS = new Set(["json", "csv", "lines"]);
const VAR_PROPS = new Set([
  "variableName", "variableType", "variableValue", "variableLive", "variableDescription",
  "variableMin", "variableMax", "variableStep", "variableSteps", "variableOptions",
  "variableDateFormat", "variableListFormat",
]);
const seenNames = new Set();
let anyLive = false;

for (const v of variables) {
  const n = v.variableName;
  const label = `variable "${n ?? "?"}"`;
  if (typeof n !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) errors.push(`${label}: variableName must match [A-Za-z_][A-Za-z0-9_]*`);
  if (RESERVED.has(n)) errors.push(`${label}: reserved name (auto-provided by the compiler)`);
  if (seenNames.has(n)) errors.push(`${label}: duplicate name`);
  seenNames.add(n);
  for (const k of Object.keys(v)) if (!VAR_PROPS.has(k)) warnings.push(`${label}: unknown property "${k}"`);

  const t = v.variableType;
  if (!Number.isInteger(t) || t < 1 || t > 12) { errors.push(`${label}: variableType must be an integer 1..12`); continue; }

  // value typing: booleans for 2/3, strings for everything else
  if (t === 2 || t === 3) {
    if (v.variableValue === "true" || v.variableValue === "false") {
      v.variableValue = v.variableValue === "true";
      notes.push(`${label}: coerced variableValue to a real boolean`);
    }
    if (typeof v.variableValue !== "boolean") errors.push(`${label}: variableValue must be a boolean for types 2/3`);
  } else if (typeof v.variableValue === "number") {
    v.variableValue = String(v.variableValue);
    notes.push(`${label}: coerced numeric variableValue to a string`);
  } else if (typeof v.variableValue !== "string") {
    errors.push(`${label}: variableValue must be a string`);
  }

  // live rules
  if (v.variableLive === true) {
    if (t === 3 || t === 5) errors.push(`${label}: type ${t} can never be live`);
    else anyLive = true;
  }
  if (t === 6) {
    if (v.variableLive !== true) { v.variableLive = true; notes.push(`${label}: buttons are always live, set variableLive true`); }
    anyLive = true;
  }
  if ((t === 7 || t === 10 || t === 12) && v.variableLive !== true) {
    warnings.push(`${label}: type ${t} is expected to be live; set variableLive true unless a restart on change is intended`);
  }

  // type-specific shape
  if (t === 4 && typeof v.variableValue === "string" && !/^#[0-9a-fA-F]{3,8}$/.test(v.variableValue)) {
    warnings.push(`${label}: color default "${v.variableValue}" is not a hex code`);
  }
  if (t === 7) {
    for (const k of ["variableMin", "variableMax", "variableStep"]) {
      if (v[k] !== undefined && typeof v[k] !== "number") errors.push(`${label}: ${k} must be a number`);
    }
    if (typeof v.variableMin === "number" && typeof v.variableMax === "number" && v.variableMin >= v.variableMax) {
      errors.push(`${label}: variableMin must be below variableMax`);
    }
  }
  if (t === 10) {
    if (v.variableStep !== undefined) warnings.push(`${label}: counters ignore variableStep (use variableSteps)`);
    if (v.variableSteps !== undefined && (!Array.isArray(v.variableSteps) || !v.variableSteps.length || v.variableSteps.some((s) => typeof s !== "number" || s === 0))) {
      errors.push(`${label}: variableSteps must be a non-empty array of signed non-zero numbers`);
    }
  }
  if ((t === 7 || t === 10) && typeof v.variableValue === "string" && v.variableValue !== "" && !Number.isFinite(Number(v.variableValue))) {
    errors.push(`${label}: default value "${v.variableValue}" is not numeric`);
  }
  if (t === 8 || t === 12) {
    if (!Array.isArray(v.variableOptions) || !v.variableOptions.length || v.variableOptions.some((o) => typeof o !== "string")) {
      errors.push(`${label}: variableOptions must be a non-empty array of strings`);
    }
  }
  if (t === 8 && Array.isArray(v.variableOptions) && v.variableValue && !v.variableOptions.includes(v.variableValue)) {
    warnings.push(`${label}: default "${v.variableValue}" is not one of the options`);
  }
  if (t === 11 || t === 12) {
    try {
      const arr = JSON.parse(v.variableValue);
      if (!Array.isArray(arr) || arr.some((x) => typeof x !== "string")) throw new Error("not a string array");
      if (t === 12 && Array.isArray(v.variableOptions)) {
        for (const x of arr) if (!v.variableOptions.includes(x)) warnings.push(`${label}: default tick "${x}" is not one of the options`);
      }
    } catch {
      errors.push(`${label}: variableValue must be a JSON array string like "[\\"a\\",\\"b\\"]"`);
    }
    if (v.variableListFormat !== undefined && !LIST_FORMATS.has(v.variableListFormat)) errors.push(`${label}: bad variableListFormat`);
  }
  if (t === 9) {
    if (v.variableDateFormat !== undefined && !DATE_FORMATS.has(v.variableDateFormat)) errors.push(`${label}: bad variableDateFormat`);
    if (typeof v.variableValue === "string" && v.variableValue !== "" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v.variableValue)) {
      warnings.push(`${label}: default should be a datetime-local string like 2026-06-27T14:30`);
    }
  }
  const inapplicable = {
    variableMin: [7, 10], variableMax: [7, 10], variableStep: [7, 10], variableSteps: [10],
    variableOptions: [8, 12], variableDateFormat: [9], variableListFormat: [11, 12],
  };
  for (const [prop, types] of Object.entries(inapplicable)) {
    if (v[prop] !== undefined && !types.includes(t)) warnings.push(`${label}: ${prop} does not apply to type ${t}`);
  }
}

// ---- code scans ----
const scan = (re, msg, sections = ["header", "body", "style", "script"], sink = errors) => {
  for (const s of sections) if (re.test(allCode[s])) sink.push(`${s}: ${msg}`);
};

scan(/\beval\s*\(/, "eval() is a hard refusal");
scan(/new\s+Function\b/, "new Function is a hard refusal");
scan(/(?<![\w$.])(alert|confirm|prompt)\s*\(/, "dialogs (alert/confirm/prompt) freeze OBS browser sources", ["script", "header"]);
scan(/\bwindow\s*\.\s*(parent|top|opener)\b/, "parent frame access is a hard refusal");
scan(/\bdocument\.domain\b|\bframeElement\b/, "frame isolation escape is a hard refusal");
scan(/(?<![\w$.])window\.open\s*\(/, "window.open is a hard refusal");
scan(/\b(localStorage|sessionStorage)\b/, "browser storage breaks determinism and is a security finding");
scan(/\bdocument\.cookie\b/, "cookies break determinism and are a security finding");
scan(/while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\)/, "unbounded loop");
scan(/\bdocument\.write\s*\(/, "document.write is a hard refusal");
scan(/<a\b[^>]*\bdownload\b/i, "download links are a hard refusal", ["body", "header"]);
scan(/addEventListener\s*\(\s*["'`]message["'`]/, "do not add your own message listener; the compiler injects one and calls onLiveVariableUpdate", ["script"]);
scan(/\.(innerHTML|outerHTML)\s*[+]?=[^;\n]*\{[A-Za-z_]/, "variable value flows into innerHTML (unsanitised)", ["script"]);
scan(/insertAdjacentHTML\s*\([^)]*\{[A-Za-z_]/, "variable value flows into insertAdjacentHTML (unsanitised)", ["script"]);

if (/Math\.random\s*\(/.test(script)) {
  (script.includes("justinfan") ? notes : warnings).push(
    "script: Math.random() found; acceptable only for an IRC justinfan nick, never for anything that renders"
  );
}

// network destinations
const ALLOWED_WS = ["wss://irc-ws.chat.twitch.tv", "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679"];
for (const m of script.matchAll(/new\s+WebSocket\s*\(\s*(["'`])([^"'`]*)\1/g)) {
  const url = m[2];
  if (!ALLOWED_WS.some((a) => url.startsWith(a))) errors.push(`script: WebSocket to "${url}" is not an allowed public chat API`);
}
if (/new\s+WebSocket\s*\(\s*[^"'`]/.test(script)) warnings.push("script: WebSocket with a non-literal URL; the host must be a fixed allowed public chat API");
const KNOWN_HOSTS = [
  "api.open-meteo.com", "geocoding-api.open-meteo.com", "kick.com",
  "fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com",
];
for (const m of (script + "\n" + header).matchAll(/https?:\/\/([^\/"'`\s]*)/g)) {
  const host = m[1];
  if (host.includes("{")) { errors.push(`fetch/URL host built from a variable ("${m[0]}"): hosts must be fixed and well-known`); continue; }
  if (!KNOWN_HOSTS.includes(host)) warnings.push(`external host "${host}": confirm it is a well-known public CORS-enabled API or CDN`);
}
if (/new\s+WebSocket/.test(script) && !/beforeunload/.test(script)) {
  warnings.push("script: WebSocket without a beforeunload close handler");
}
const timerCount = (script.match(/\bset(?:Interval|Timeout)\s*\(/g) || []).length;
if (timerCount > 4) warnings.push(`script: ${timerCount} timer creations; keep to a fixed, small number`);

// live handler wiring
const hasLiveHandler = /function\s+onLiveVariableUpdate\b|onLiveVariableUpdate\s*=/.test(script);
if (anyLive && !hasLiveHandler) errors.push("live variables declared but script does not define onLiveVariableUpdate");
if (!anyLive && hasLiveHandler) warnings.push("onLiveVariableUpdate defined but no variable is live; it will never fire");

// placeholder usage
const placeholders = new Set();
for (const s of Object.values(allCode)) {
  for (const m of s.matchAll(/(?<!\$)\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) placeholders.add(m[1]);
}
for (const v of variables) {
  if (!v.variableName || placeholders.has(v.variableName)) continue;
  // an unreferenced toggle is the idiomatic "flip to restart" pattern, and a button's
  // value usually only matters as the live press signal, so neither warrants a warning
  if (v.variableType === 3) notes.push(`variable "${v.variableName}" is unreferenced: assuming it is a restart toggle`);
  else if (v.variableType === 6) notes.push(`variable "${v.variableName}" is unreferenced: button presses arrive via onLiveVariableUpdate`);
  else warnings.push(`variable "${v.variableName}" is never referenced as {${v.variableName}} in any section`);
}
for (const p of placeholders) {
  if (!seenNames.has(p) && !RESERVED.has(p)) {
    warnings.push(`{${p}} looks like a variable placeholder but is not declared (ignore if it is JS destructuring or an object literal)`);
  }
}

// ---- integrations ----
const CHAT_EVENTS = {
  message: "onTwitchMessage", sub: "onTwitchSub", raid: "onTwitchRaid", unraid: "onTwitchUnraid",
  badgeUpgrade: "onTwitchBadgeUpgrade", viewerMilestone: "onTwitchViewerMilestone", sharedChatNotice: "onTwitchSharedChatNotice",
};
const definedCallbacks = new Set([...script.matchAll(/function\s+(onTwitch\w+|onStreamerBot\w+)\b/g)].map((m) => m[1]));
if (meta.chatIntegration === true) {
  if (!meta.chatChannel || typeof meta.chatChannel !== "string") errors.push("chatIntegration requires chatChannel (lowercase Twitch login, no #)");
  else if (meta.chatChannel !== meta.chatChannel.toLowerCase() || meta.chatChannel.startsWith("#")) errors.push("chatChannel must be lowercase without a # prefix");
  const events = meta.chatEvents === undefined ? ["message"] : meta.chatEvents;
  if (!Array.isArray(events)) errors.push("chatEvents must be an array");
  else {
    for (const ev of events) {
      if (!CHAT_EVENTS[ev]) { errors.push(`unknown chat event "${ev}"`); continue; }
      if (!definedCallbacks.has(CHAT_EVENTS[ev])) errors.push(`chat event "${ev}" selected but script does not define ${CHAT_EVENTS[ev]}`);
    }
    for (const cb of definedCallbacks) {
      const ev = Object.entries(CHAT_EVENTS).find(([, c]) => c === cb)?.[0];
      if (ev && !events.includes(ev)) warnings.push(`${cb} defined but event "${ev}" is not in chatEvents; it will never fire`);
    }
  }
} else {
  for (const cb of definedCallbacks) {
    if (cb.startsWith("onTwitch")) errors.push(`${cb} defined but chatIntegration is not enabled; it will never fire`);
  }
}
if (meta.streamerBotIntegration === true) {
  if (meta.streamerBotHost !== undefined && meta.streamerBotHost !== "127.0.0.1") errors.push("streamerBotHost is locked to 127.0.0.1");
  if (!definedCallbacks.has("onStreamerBotEvent")) warnings.push("streamerBotIntegration enabled but onStreamerBotEvent is not defined");
  if (meta.streamerBotAuthKey && meta.streamerBotAuthEnabled !== true) warnings.push("streamerBotAuthKey set without streamerBotAuthEnabled");
  if (/_sbClient\s*\.\s*on\s*\(/.test(script)) errors.push("do not call _sbClient.on(...); filter inside onStreamerBotEvent");
  if (/new\s+StreamerbotClient/.test(script)) errors.push("do not construct StreamerbotClient; _sbClient is injected");
} else {
  for (const cb of definedCallbacks) {
    if (cb.startsWith("onStreamerBot")) errors.push(`${cb} defined but streamerBotIntegration is not enabled; it will never fire`);
  }
}

// ---- assemble ----
const out = {
  widgetName: meta.widgetName,
  widgetWidth: meta.widgetWidth,
  widgetHeight: meta.widgetHeight,
  headerTag: header,
  bodyTag: body,
  styleTag: style,
  scriptTag: script,
};
for (const k of ["chatIntegration", "chatChannel", "chatEvents", "streamerBotIntegration", "streamerBotHost", "streamerBotPort", "streamerBotAuthEnabled", "streamerBotAuthKey"]) {
  if (meta[k] !== undefined) out[k] = meta[k];
}
out.variables = variables.map((v) => {
  const clean = {};
  for (const k of VAR_PROPS) if (v[k] !== undefined) clean[k] = v[k];
  return clean;
});

const json = JSON.stringify(out);
if (json.length > 200000) warnings.push(`import JSON is ${json.length} chars; the cap is 200,000`);

for (const e of errors) console.log(`ERROR   ${e}`);
for (const w of warnings) console.log(`WARNING ${w}`);
for (const n of notes) console.log(`note    ${n}`);
if (errors.length) {
  console.log(`\nFAILED: ${errors.length} error(s). Nothing written.`);
  process.exit(1);
}
writeFileSync(outPath, json);
console.log(`\nOK: wrote ${outPath} (${json.length} chars, ${variables.length} variables${anyLive ? ", live" : ""})`);
