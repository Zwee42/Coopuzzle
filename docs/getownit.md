# getownit setup

`getownit` (`ownit`) is a **development-only** tool in this repo. It runs after `git push` and asks
a few questions about what you shipped. It is listed in `devDependencies` and is not imported by
the client, server, tests, Docker image, or runtime code.

## What is already done

| Step | Status |
|---|---|
| `getownit@0.1.7` installed as a dev dependency | Done |
| `ownit login` | Done for GitHub user `Zwee42` |
| Pre-push hook | Installed at `.git/hooks/pre-push` |
| Model API key | **Not set** |
| Repo registration | **Waiting for the GitHub App** |
| README badge | Added (generated with `ownit badge`) |

`ownit init --repo Zwee42/Coopuzzle` installed the hook but registration returned
`app_not_installed`. The Ownit GitHub App must be installed on the repo before registration can
succeed:

<https://github.com/apps/ownit-app/installations/new>

## Finish the setup

Run these in the repo, in a terminal where interactive prompts work:

```bash
npx ownit login
npx ownit key set
npx ownit init --repo Zwee42/Coopuzzle
```

`ownit login` uses GitHub's device flow: it prints a code and opens GitHub for approval.
`ownit key set` asks for a provider (Nebius or NVIDIA) and then reads the key at a hidden prompt.
Never paste a key directly after the command; it would end up in shell history.

Alternatively, export a key before running the debrief:

```bash
export NEBIUS_API_KEY="..."
# or
export NVIDIA_API_KEY="..."
```

The key is used by the Ownit client for the debrief request and is stored locally in
`~/.ownit/config.json` (never in this repository). `ownit key status` shows whether one is present
without printing it.

After installing the GitHub App, rerun:

```bash
npx ownit init --repo Zwee42/Coopuzzle
npx ownit settings
```

`settings` should show the repo page and configuration instead of `not set up for Ownit`.

## Everyday use

A normal push runs the hook:

```bash
git push
# Debrief now? [Y/n]
```

The hook never blocks a push. Useful variants:

```bash
OWNIT_SKIP=1 git push     # skip one debrief; the push is left pending
npx ownit interview       # pick a pending push and finish its debrief
npx ownit interview --all # work through every pending push
npx ownit whoami          # server, GitHub login, key status
npx ownit badge           # print the README badge Markdown again
npx ownit uninstall       # remove the pre-push hook
```

If the hook cannot find the CLI, it prints a notice and lets the push continue. If the repo is
moved or cloned without hooks, run `npx ownit init` again; Git hooks are not committed.

## Troubleshooting

- **`app_not_installed`** — install the GitHub App on `Zwee42/Coopuzzle` with the link above, then
  rerun `ownit init`.
- **`No API key set`** — run `ownit key set` or export `NEBIUS_API_KEY` / `NVIDIA_API_KEY`.
- **`no GitHub remote found`** — add a GitHub remote, or pass `--repo owner/name` to `init`.
- **`husky manages this repo's hooks`** — follow the snippet `ownit init` prints and add it to
  `.husky/pre-push`.
- **Push must go out without a prompt** — `OWNIT_SKIP=1 git push`; the debrief stays pending for
  `ownit interview`.

The generated badge is:

```markdown
[![Ownit](https://ownit.ownit-worker.workers.dev/badge/Zwee42/Coopuzzle.svg)](https://ownit.ownit-worker.workers.dev/Zwee42/Coopuzzle)
```
