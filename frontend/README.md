# Exp-Orchestrator Frontend

This is the frontend for Exp-Orchestrator, a visual workflow management system built with Next.js, React, TypeScript, and `@xyflow/react`.

## Key Features

- Single maintained DAG editing surface in `MinimalCanvas`
- Drag-to-create node palette with grouped templates and search
- Real-time DAG analyzer for cycles, connection validity, runtime readiness, and stream compatibility
- Backend validation dry run wired through the frontend deploy endpoint
- Intelligent auto-layout (`Clean Workflow`)
- Right-click context menus for node actions
- Secure token management and structured property inspection

## Documentation

See `DOCUMENTATION.md` in this folder for a fuller architectural overview.

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the development server:

   ```bash
   npm run dev
   ```

3. Run the analyzer unit tests:

   ```bash
   npm test
   ```

## Main Files

- `components/canvas/MinimalCanvas.tsx` — canonical DAG editor and workflow orchestration UI
- `components/ui/CanvasPanel.tsx` — single maintained left-side control surface
- `components/ui/ComponentPanel.tsx` — node inspection and property editing panel
- `components/ui/AnalyzerPanel.tsx` — structured deploy-readiness and issue panel
- `app/api/deploy/route.ts` — backend validation dry-run endpoint for deploy readiness
- `lib/dag-analyzer.ts` — frontend DAG analysis and readiness checks
- `lib/workflow-validation.ts` — shared workflow mapping between the frontend graph and backend deploy schema

---

For more detail, see `DOCUMENTATION.md`.
