# Changesets

Versioning + publishing for the `@atpost/*` packages.

- Add a changeset describing your change: `bun run changeset` (pick packages +
  bump type). Commit the generated `.changeset/*.md`.
- On merge to `main`, the publish workflow runs `changeset version` (bumps +
  changelogs) and `changeset publish` (pushes to AWS CodeArtifact).

Apps (`@atpost/shell`, `@atpost/commerce`, …) are `private` and never published —
they're deployed, not packaged.
