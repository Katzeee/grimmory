# Development workflow

This repository is forked from [grimmory-tools/grimmory](https://github.com/grimmory-tools/grimmory) for independent development while continuing to synchronize upstream changes.

Reserve `develop` for integrated work. Start each code or documentation change from the current `develop` on a short-lived branch whose prefix communicates its purpose, such as `feat/`, `fix/`, `refactor/`, or `docs/`. Keep one branch focused on one coherent outcome.

Working commits on a short-lived branch are disposable checkpoints. Before integration, account for every changed file and pass the checks required by the affected surfaces, using the repository's current scripts and CI configuration as the source of truth. Squash the branch into one conventional commit on `develop`; write its message for the resulting behavior rather than the development chronology. A change that cannot be described as one coherent result belongs in separate branches.

Integration is complete when the squashed tree matches the reviewed branch, `develop` is clean, and the required checks pass. Delete the integrated branch locally and remotely. Treat release tags as stable and express later corrections as new work.

Maintain `develop` as the fork's rebased patch stack over `upstream/develop`. When synchronizing official Grimmory, rebase the fork-only commits onto the latest official development branch and update `origin/develop` with `--force-with-lease`; do not merge upstream into `develop`.

When synchronizing official Grimmory or advancing the pinned `readest/foliate-js` engine, follow [the upstream synchronization skill](.agents/skills/sync-grimmory-upstreams/SKILL.md). Upstream rebases and dedicated engine pointer updates preserve their own identity instead of following the product-development squash path.
