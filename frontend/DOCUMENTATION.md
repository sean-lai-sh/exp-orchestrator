# Exp-Orchestrator Frontend: Technical Documentation

## 1. Node and Edge Data Model

- **Node representation**
  - All workflow nodes are `Node<EditableNodeData>` instances from `@xyflow/react`.
  - `EditableNodeData` contains the canonical editor fields: `nodeType`, `name`, `description`, `token`, `sources`, `access_types`, and optional deployment metadata such as `runtime`.
  - Node state is owned by `components/canvas/MinimalCanvas.tsx`, while `components/ui/ComponentPanel.tsx` is the maintained inspection and editing surface.

- **Edge representation**
  - Edges track `id`, `source`, `target`, and lightweight metadata such as `streamType`, `label`, and analyzer-driven invalid state.
  - Edge metadata is normalized by `lib/workflow-validation.ts` so the frontend analyzer and backend dry-run validation use the same stream derivation rules.

## 2. Canonical Editing Path

- `components/canvas/MinimalCanvas.tsx` is the single maintained DAG editor.
- `components/ui/CanvasPanel.tsx` is the only supported left-side creation and deploy-preparation surface.
- Retired canvas and panel variants have been removed so there is one clear editing path for future work.

## 3. Node Creation and Editing UX

- **Creation**
  - Nodes can be created from quick-add shortcuts, grouped template sections, context menus, or drag-to-create from the left panel onto the canvas.
  - Keyboard shortcuts are available from the canvas: `S` for sender, `R` for receiver, `P` for plugin, `Delete` / `Backspace` to remove the selected node, and `Cmd/Ctrl + D` to duplicate it.

- **Inspection**
  - `ComponentPanel.tsx` shows incoming and outgoing connection summaries, runtime readiness, related analyzer blockers and warnings, and required-field indicators.
  - Base properties auto-apply immediately; advanced token changes remain explicit and confirmation-based.

## 4. DAG Analyzer

- `lib/dag-analyzer.ts` performs real-time analysis on node and edge changes using a debounced update loop.
- The analyzer currently checks:
  - cycle detection using Kahn-style topological ordering, matching the backend DAG utility behavior
  - dangling edges that reference missing nodes
  - invalid node-type connections such as receiver outbound edges or sender inbound edges
  - plugin runtime readiness and unapproved runtime warnings
  - stream compatibility between edge data types and node declarations
  - orphan nodes that are disconnected from the workflow

- `components/ui/AnalyzerPanel.tsx` presents these results in a structured panel with:
  - blocker and warning counts
  - deploy readiness progress for plugin nodes
  - grouped issue sections by category
  - click-to-focus issue highlighting on the canvas

## 5. Backend Validation Dry Run

- `app/api/deploy/route.ts` is the frontend entry point for backend-style deploy validation.
- The route maps the frontend graph into the backend `DeployWorkflow` schema using `lib/workflow-validation.ts`.
- The route then invokes `backend/validate_workflow_cli.py`, which executes the real backend deployment validation path without environment injection.
- This means the editor can surface both:
  - **frontend analyzer feedback** for instant UX-level guidance, and
  - **backend dry-run feedback** for deploy-readiness confirmation.

## 6. Clean Workflow Layout

- The clean-layout action reorganizes nodes by inferred workflow depth.
- Incoming edges are used to estimate layer depth, and nodes are repositioned into horizontally ordered levels.
- The algorithm is deterministic for the same graph state and is intended to improve readability before validation and deploy preparation.

## 7. Visual Feedback and Highlighting

- Nodes with analyzer blockers receive error highlighting.
- Nodes with warnings receive softer caution highlighting.
- Focused analyzer issues override normal highlighting so the relevant nodes and edges are easy to inspect.
- `AnimatedSVGEdge.tsx` renders stream-type badges on edges and applies dashed red styling to invalid connections.

## 8. Testing

- `lib/dag-analyzer.test.ts` provides unit coverage for:
  - valid linear workflows
  - cycle detection
  - invalid connection and missing-runtime blockers
  - stream incompatibility
  - frontend-to-backend workflow payload mapping

## References

- Main Canvas: `components/canvas/MinimalCanvas.tsx`
- Left Panel: `components/ui/CanvasPanel.tsx`
- Right Panel: `components/ui/ComponentPanel.tsx`
- Analyzer Panel: `components/ui/AnalyzerPanel.tsx`
- Analyzer Logic: `lib/dag-analyzer.ts`
- Workflow Mapping: `lib/workflow-validation.ts`
- Backend Validation Bridge: `app/api/deploy/route.ts`

---

Contributors should extend the maintained editor path rather than reintroducing alternate canvas or panel implementations.
