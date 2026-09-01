---
name: pogly-create-widget
description: Create a working Pogly widget from a natural-language request and deliver its paste-ready import JSON in a copyable code block (or a .json file when it is large), plus a short explanation of every variable and which ones are live or toggles. Use whenever someone asks to make, build, or generate a widget, or any visual for their stream overlay (a counter, timer, clock, alert, goal bar, label, poll, chat-reactive display, weather panel), even if they never say the word "widget". Not for reviewing or vetting an existing widget's code or submission, only for creating and modifying widgets.
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

6. Reply in the output format below. The build output prints the character count of
   `widget.json`; that count picks the delivery mode (see Output format).

## Output format

Keep the reply to exactly this shape: one intro line, the import JSON (delivered by size,
below), the variables table, and notes only when there is something the user must do.

The import JSON is always delivered whole: the one single-line string `widget.json` holds.
Never split it into header/body/css/js section blocks, never truncate it, never spread it
across multiple code blocks. Delivery mode by the character count the build script printed:

- **20,000 characters or less**: paste the contents of `widget.json` verbatim in the
  ```json block of the template.
- **Over 20,000 characters**: do not paste it into the chat; a block that large lags or
  breaks the chat rendering and the user cannot copy it cleanly. Instead copy `widget.json`
  into the user's current working directory (never leave it only in a temp/scratch dir) as
  `<widget-name-in-kebab-case>.widget.json`, and replace the ```json block with the file's
  path plus one line telling the user to open the file and copy its entire contents into the
  import tab. On a platform that attaches files in chat, also attach it.

````markdown
<one sentence: what the widget does, its default size, and any notable design choice>

```json
<the single-line contents of widget.json, verbatim; over 20,000 characters this whole block
becomes the file path line instead, as described above>
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

If the user reports the import failing or the JSON being hard to copy, the paste was most
likely mangled or clipped by the chat rendering: deliver the same `widget.json` as a file
(the over-20,000 path above, regardless of size). Never fall back to giving the four
sections as separate header/body/css/js code blocks; the full import JSON is the only
deliverable format.

## Refusals

The authoring reference's security section lists the hard refusals (mining, eval, dialogs,
frame escape, storage, exfiltration, arbitrary network destinations, obfuscation). Refuse
those widget requests plainly and say which rule they hit; offer the closest safe
alternative when one exists.
