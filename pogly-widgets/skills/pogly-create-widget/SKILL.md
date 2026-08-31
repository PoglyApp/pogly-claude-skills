---
name: pogly-create-widget
description: Create a working Pogly widget from a natural-language request and deliver its paste-ready import JSON in a copyable code block, plus a short explanation of every variable and which ones are live or toggles. Use whenever someone asks to make, build, or generate a widget, or any visual for their stream overlay (a counter, timer, clock, alert, goal bar, label, poll, chat-reactive display, weather panel), even if they never say the word "widget". Not for reviewing or vetting an existing widget's code or submission, only for creating and modifying widgets.
argument-hint: <what the widget should do>
---

# Pogly widget creation

You are writing code that runs unsandboxed inside OBS browser sources on live streams, and
that every viewer's client reconstructs independently. The deliverable is a single import
JSON string the user pastes into the widget IDE's import tab; it has to work first try,
because the user may not read code at all. Configurability lives in variables, not in edits.

## Inputs

`$ARGUMENTS` is the request. If it is empty, ask what the widget should do and stop.

Prefer sensible defaults over questions: pick dimensions, styling and behaviour yourself and
state the choices in the reply. Only ask when a wrong guess makes the widget useless (which
of two contradictory behaviours they want). Missing user-specific values (a goal number, a
label) are never a reason to ask: make them variables with placeholder defaults. Chat
integration needs no channel at all; the host follows the overlay's configured channel.

## Workflow

1. Read `references/widget-authoring.md` once per session. It is the contract: rendering
   model, all 12 variable types, live rules, integrations, determinism, the security hard
   refusals, and the exact JSON schema. Skim `references/examples.md` when you want a model
   of the target minimalism (stopwatch) or the complexity ceiling (chat poll).

2. Design before coding:
   - **Variables**: everything a non-technical editor might want to change becomes one
     (texts, colors, fonts, sizes, thresholds, channel names, locations). Choose the type
     that gives the best control, not string-for-everything: color 4, on/off 2, pick-one 8,
     numeric range 7, count 10, moment in time 9, list of entries 11, tick-several 12.
   - **Interactivity**: the overlay ignores the mouse, so anything "clickable" is really a
     variable the editor drives from the controls or Details panel (or a hotkey). A
     momentary action is a button (6); a persistent number is a counter (10, also how a
     value survives restarts and streams); an intentional restart is a toggle (3).
   - **Live or not**: mark a variable live when changing it mid-stream must not reset
     running state; leave it non-live when a restart is harmless or wanted. Any live
     variable (buttons included) obliges the script to define `onLiveVariableUpdate`.
   - **External data**: if the widget fetches, the full static frame renders immediately
     with placeholders; only the data values arrive later. A failed fetch must still leave
     a presentable widget, never an empty element.
   - Give every non-obvious variable a `variableDescription`.

3. Write the sections into a temporary working directory (the session scratchpad where one
   exists, any temp directory otherwise):
   `meta.json` (name, numeric width/height, variables, integration fields), `body.html`,
   `style.css`, `script.js`, and `header.html` only when loading fonts or a pinned CDN
   library. Inner code only, no wrapper tags. Write the code the way the stopwatch example
   is written: minimal, direct, no defensive guards, no features beyond the request.

4. Compile and validate (Node 18+; the script lives in this skill's own directory, whose
   base path is stated when the skill loads):

   ```bash
   node <this-skill's-base-directory>/scripts/build-widget.mjs <dir>
   ```

   The script checks the schema, live rules, placeholder wiring, integration wiring and the
   security rules, then writes `<dir>/widget.json` as the compact import string. Fix every
   error and rerun; resolve warnings unless you can say why one is intentional. Never
   hand-assemble the JSON: the script exists because manual escaping of the code sections is
   the most common way to ship a broken import.

5. Reread your own `script.js` once against the authoring reference's code and determinism
   rules. The validator is a net, not a review: it cannot tell you that a fetch cadence
   diverges between viewers or that an animation resets when it should not.

6. Read `widget.json` and reply in the output format below, pasting its contents verbatim.

## Output format

Keep the reply to exactly this shape: one intro line, the JSON block, the variables table,
and notes only when there is something the user must do.

````markdown
<one sentence: what the widget does, its default size, and any notable design choice>

```json
<the single-line contents of widget.json, verbatim>
```

## Variables

| Variable | Control | Default | Live | What it does |
| --- | --- | --- | --- | --- |
| location | text input | Berlin | restarts on change | City the weather is fetched for |
| textColor | color picker | #ffffff | yes, updates instantly | Text color |
| celebrate | button | - | always live | Plays the celebration animation once per press |
| reset | toggle | - | restarts widget | Flip to restart the countdown from zero |

## Notes

<only what the user must know or do: set the streaming platform to Twitch (or Kick) in
Owner Settings for chat integration, run Streamer.bot on the streaming PC, how often
external data refreshes, which hotkeys are worth binding>
````

In the Live column always use one of: `yes, updates instantly` (live), `always live`
(buttons), `restarts widget` (toggles), `restarts on change` (non-live). That column is the
user's mental model of what interrupts their stream visuals; keep it honest.

If the user reports the import failing, give them the four sections separately as plain
code blocks (inner code only, straight from the section files) so they can paste them into
the html / css / js / header tabs by hand.

## Refusals

The authoring reference's security section lists the hard refusals (mining, eval, dialogs,
frame escape, storage, exfiltration, arbitrary network destinations, obfuscation). Refuse
those widget requests plainly and say which rule they hit; offer the closest safe
alternative when one exists.
