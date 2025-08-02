# Exp-Orchestrator Frontend

This is the frontend for Exp-Orchestrator, a visual workflow management system built with React, TypeScript, and @xyflow/react.

## Key Features
- Visual node-based workflow editor
- Intelligent auto-layout (Clean Workflow)
- Templated component system
- Right-click context menus for node actions
- Secure token management
- Collapsible, type-safe property panels

## Documentation
See `DOCUMENTATION.md` in this folder for a full overview of architecture, data management, and feature details.

## Quick Start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the development server:
   ```bash
   npm run dev
   ```

## Main Files
- `components/canvas/MinimalCanvas.tsx` — Main canvas and workflow logic
- `components/ui/ComponentPanel_enhanced.tsx` — Node property editor
- `components/ui/` — UI primitives and panels
- `components/nodes/` — Node visual components
- `lib/types.ts` — TypeScript types

---

For more, see the full documentation in `DOCUMENTATION.md`.
