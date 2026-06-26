# Git Pull Strategy: Merge vs Rebase

## Option A — Merge (`git pull --no-rebase`)

Integrates remote changes by creating a **merge commit** that joins both histories. The diverged commits are preserved exactly as they were, and a new commit ties them together.

**To use:** Set the following config, then Pull in VS Code.

```bash
git config --global pull.rebase false
```

**Result:** Non-linear history with a visible merge commit.

---

## Option B — Rebase (`git pull --rebase`)

Replays your local commits **on top of** the remote commits, as if you had started your work from the latest remote state.

**Example:** Running the following in the terminal completes cleanly in one step with no conflicts.

```bash
git pull --rebase origin master
```

**Result:** Linear history, no extra merge commit.

---

## Recommendation for anatomy project

**Option B (rebase) is the better default**, for three reasons:

1. **Single `anatomy.owl` file** — the entire project is one large OWL file. Merge commits on a single file create noisy history that's hard to read in Bitbucket's diff view. Rebase keeps each commit's change meaningful and self-contained.
2. **Additive changes only** — both local and remote work add new classes to different anatomical areas. Rebase on additive changes almost never produces conflicts.
3. **Shared team repository** — a linear history on `master` is easier for collaborators to follow with `git log` and reduces confusion when tracing when a specific concept was added.

> The one case where **Option A (merge) is safer** is if you have many local commits that are tightly coupled and you want to preserve the exact context in which they were made.

---

## Making Option B permanent (one-time action)

Run this once in the terminal:

```bash
git config --global pull.rebase true
```

This saves the rebase strategy globally in `~/.gitconfig`, so it applies to **all repos on your machine** — including future pulls in this project and any other git repo you work with in VS Code or the terminal.

---

## Normal VS Code workflow after this setting

1. Make changes → commit via Source Control
2. Click **Sync** (or Pull then Push) — diverged branches will rebase automatically, no more fatal errors

No further action needed after that one config command.
