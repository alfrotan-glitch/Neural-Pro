# Phase 9 — Testing Architecture

The project uses dependency-free Node test runners for architectural/domain checks that do not require a browser or React runtime.

## Layers

- Architecture boundaries
- Commands / Undo / Redo
- Selectors
- Services
- Export bitrate model
- Timeline duration model
- Performance hot-path invariants
- Export security invariants

Run the complete Phase 9 suite with:

```bash
npm test
```

Browser-only rendering, WebCodecs, Web Audio, and React component tests remain separate integration/e2e concerns and should run in a browser-capable CI job.
