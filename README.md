# Pogly Claude Skills

Official [Claude](https://claude.com) skills for [Pogly](https://pogly.gg), the collaborative
stream overlay.

Currently one skill:

- **pogly-create-widget**: describe the widget you want in plain language, get back a
  paste-ready widget import JSON plus a guide to its variables. Claude designs the widget
  (layout, variables, live updates, Twitch chat or Streamer.bot integration when needed),
  compiles it with a bundled validator, and hands you a single JSON string for the widget
  IDE's import tab.

```
please make me a widget which shows the weather based on the locale that I choose
```

The skill knows Pogly's widget rules: the four code sections, all 12 variable types, live
variables, determinism across viewers, and the safety rules for code that runs inside OBS
browser sources. Details live in the skill's own reference files.

## Install in Claude Code

Works in the Claude Code CLI, desktop app, and IDE extensions. Requires Node 18+ on your
machine (the skill's validator is a Node script).

```
/plugin marketplace add PoglyApp/pogly-claude-skills
/plugin install pogly-widgets@pogly
```

Then just ask for a widget in plain language, or invoke the skill directly as
`/pogly-widgets:pogly-create-widget <what you want>` (plugin skills are namespaced).

To update later: `/plugin marketplace update pogly`.

Manual alternative: copy `pogly-widgets/skills/pogly-create-widget/` into `~/.claude/skills/`.

## Install in the Claude apps (claude.ai / desktop)

On plans with skills support: download `pogly-create-widget.zip` from the latest
[release](https://github.com/PoglyApp/pogly-claude-skills/releases), then upload it under
**Settings → Capabilities → Skills**. No local Node needed; Claude runs the validator in its
own environment.

## Importing the result into Pogly

Copy the JSON block Claude outputs, open the widget IDE in Pogly (Widgets button in the
bottom bar), and paste it into the **import** tab. The variables the skill created show up in
the **controls** tab so you can tweak text, colors, and behaviour without touching code. See
the [widget development docs](https://docs.pogly.gg/#widget-development) for everything
widgets can do.

## Safety

Widgets run inside OBS browser sources on live streams, so the skill refuses to generate
code that could freeze an overlay or leak data (dialogs, eval, storage access, requests to
unknown servers), and its validator enforces the same rules mechanically. Still review what
you import, like anything you put on stream.

## License

Apache-2.0, same as Pogly.
