# Breadcrumbs Baking Timer

A step-by-step multi-timer for home bakers that tracks parallel proof, knead and bake stages with per-step alarms and a shareable bake plan.

**Live:** [breadcrumbs-baking-timer.itsjust.tools](https://breadcrumbs-baking-timer.itsjust.tools)

## Features

- Build a multi-step bake plan (autolyse, bulk ferment, shape, proof, bake…) with per-step name, duration and temperature note
- Run multiple steps in parallel with independent countdowns and at-a-glance remaining time
- Audio alarm and browser notification when a step finishes, with a dismissible visual flash
- Add, reorder, duplicate or delete steps while timers run without losing elapsed progress
- Plan and running state persist in your browser; an accidental reload does not reset timers
- Curated preset plans for bread, pizza dough, croissants and banana bread
- Share a bake plan via a compact URL that encodes all steps (running timers re-anchor on load)
- Total elapsed wall-clock time plus a timeline view of overlapping steps
- 100% client-side — no data ever leaves your browser

## Keyboard shortcuts

The shared tool shell provides export (`Ctrl/Cmd+E`), sidebar (`Ctrl/Cmd+B`) and dark mode (`Ctrl/Cmd+D`) shortcuts.

## Development

```bash
npm install
npm run build -w @itsjust/core   # build shared core first
npm run dev
npm test
```

## Deployment

```bash
docker build -t itsjust-breadcrumbs-baking-timer .
docker run -p 3000:3000 itsjust-breadcrumbs-baking-timer
```

## License

MIT
