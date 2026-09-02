---
name: sync-grimmory-upstreams
description: Rebase this fork onto official Grimmory or advance its pinned readest/foliate-js submodule.
---

# Synchronize upstreams

Official Grimmory and `readest/foliate-js` are independent integration lanes. Keep the Grimmory rebase and any Foliate gitlink update separate so their history, validation, and rollback remain independent.

## Establish the baseline

Read `AI_POLICY.md`. Treat the current Git configuration, `.gitmodules`, package scripts, and CI configuration as the source of truth for remotes, branches, submodule paths, commands, and required checks.

Perform the sync from a clean, isolated worktree based on the fork's integration branch. Fetch enough history to establish a merge base. The baseline is complete when the current fork SHA, candidate upstream SHA, common ancestor, fork-only commits, working-tree state, and submodule state are all known.

## Integrate official Grimmory

Fetch the fork and the official remote, then inspect both the commits entering from the official default development branch and the fork-only commits that will be replayed. Rebase the fork-only commits onto the latest official development branch. Do not merge official upstream into the fork's integration branch.

Resolve conflicts commit by commit from the surrounding code, upstream intent, and the fork behavior that must remain. The resulting tree adopts the current upstream structure while retaining the fork's intentional features. Review the complete delta against official upstream after the rebase; every remaining difference must belong to the fork.

The Grimmory lane is complete when Git reports no unmerged entries, the official upstream SHA is an ancestor of the result, `git diff upstream/develop...HEAD` contains only the intended fork delta, and checks selected from the affected surfaces pass. Update the fork's remote integration branch with `--force-with-lease`, never plain `--force`, only after these conditions hold. Preserve release tags rather than rebasing them.

## Advance the Foliate engine

Locate the `readest/foliate-js` submodule through `.gitmodules` and require a clean submodule worktree. Fetch its configured upstream branch, compare the fetched commit with the parent repository's pinned gitlink, and inspect every commit in the proposed range.

Matching SHAs complete this lane without a commit. When the engine advances, check out the reviewed exact commit and stage only the parent repository's gitlink. Keep this pointer update separate from the Grimmory rebase and from reader adaptation work.

The Foliate lane is complete when the submodule is initialized at the reviewed SHA, its worktree is clean, the parent diff contains the intended gitlink change, and compatibility checks selected from the changed engine behavior pass.

## Validate and report

Derive validation from the integrated diff and the repository's current scripts and CI. Cover every affected layer. A reader or engine change also requires a representative real EPUB exercise of the affected reading behavior and persistence paths.

Finish only when the integration worktree is clean, all changed lanes meet their completion criteria, and every validation failure is resolved. Report the old and new upstream SHA, the old and rewritten fork commits, the reasoning behind conflict resolutions, the checks run and their outcomes, and any Foliate pointer commit produced. A lane with no upstream change is reported as current and produces no placeholder commit.
