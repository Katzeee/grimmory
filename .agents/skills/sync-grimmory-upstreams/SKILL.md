---
name: sync-grimmory-upstreams
description: Rebase this fork onto official Grimmory or advance its pinned readest/foliate-js submodule.
---

# Synchronize upstreams

Synchronize official Grimmory and `readest/foliate-js` as applicable in this checkout on a short-lived local `sync/` branch. Treat the Grimmory rebase and Foliate gitlink update as independent lanes, with the engine pointer in its own commit.

## Establish the baseline

Read `AI_POLICY.md` and inspect Git configuration, `.gitmodules`, package scripts, and CI configuration for the current remotes, branches, submodule, and checks. Start from `develop` with a clean tracked worktree and index; inspect untracked paths before switching branches or resetting.

Fetch the fork and official development branches. Confirm local `develop` matches `origin/develop`, then record the fork tip, official upstream tip, merge base, fork-only commits, and pinned submodule SHA. Create the local `sync/` branch from `develop`. The baseline is complete when these values and the state of the working tree and submodule are known.

## Integrate official Grimmory

Inspect the incoming official commits and the fork-only commits. If official upstream has advanced, rebase the fork-only commits on the `sync/` branch onto its latest development tip. Resolve each conflict using the surrounding code, upstream intent, and the fork behavior that must remain.

Review the complete delta against official upstream. This lane is complete when the official tip is an ancestor of the result, Git has no unmerged entries, and every remaining difference belongs to the fork. If upstream has not advanced, leave the Grimmory history unchanged. Preserve release tags.

## Advance the Foliate engine

Locate the `readest/foliate-js` submodule through `.gitmodules` and confirm its worktree is clean. Fetch its configured upstream branch, compare its tip with the pinned gitlink, and inspect every commit in the proposed range.

Matching SHAs complete this lane without a commit. When the engine advances, check out the reviewed exact SHA and create a separate parent-repository commit containing only the gitlink update. This lane is complete when the submodule is initialized at that SHA, its worktree is clean, and the parent diff contains only the reviewed pointer change.

## Validate for regression risk

Choose checks for the fork's changed files, integration points, conflict resolutions, and engine changes, using current scripts and CI as references. For a reader or engine update, exercise a representative real EPUB across the affected layout, navigation, and persistence behavior.

Classify each failed check with evidence: a new or unexplained failure in an affected path blocks integration; a demonstrated upstream, platform, or unrelated failure is reported as a limit. Use remote CI when it answers a specific question local checks cannot settle. Validation is complete when the relevant checks pass, every failure has an explained disposition, and the real EPUB exercise is complete when applicable.

## Update develop and report

Confirm the `sync/` branch is committed and clean, then recheck local `develop`, `origin/develop`, and the tracked worktree against the baseline. With the tracked worktree clean, switch to `develop` and use `git reset --hard` to point it at the reviewed `sync/` tip.

Push a rewritten Grimmory history with `--force-with-lease`; use a normal push when only the Foliate pointer advances. On rejection, fetch and review the new remote state. Integration is complete when local `develop`, `origin/develop`, and the submodule match the reviewed result and the local `sync/` branch is deleted.

Report the old and new official upstream SHAs, the old and rewritten fork commits, any Foliate pointer change and its commit, conflict resolutions, check results, and validation limits. Report an unchanged lane as current without making a placeholder commit.
