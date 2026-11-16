# progress-desk

A mod for Claude Code:

- **Progress bar above the prompt** that follows the chat's to-do list, in every chat.
- **Live agents panel** (`/desk`) showing what each subagent is doing.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install progress-desk --marketplace Juriasu91/progress-desk
```

Answer `y` to add the marketplace, then press Enter to install for your user (all sessions).

From a shell:

```
claude plugin install progress-desk --marketplace Juriasu91/progress-desk
```

In the Claude desktop app (where `/plugin` does not run): click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Juriasu91/progress-desk`, then **Add plugin**.

## Settings

Asked when you install:

| Setting | Options | Default |
| --- | --- | --- |
| Panel language | `auto` (follows Claude Code's language, then the system locale), `en`, `ru`, `he` | `auto` |
| Open the agents panel | `any` (once per chat when a subagent starts), `never` (only with `/desk`) | `any` |

## License

MIT
