
# Exp-Orchestrator Frontend: Technical Documentation

## 1. Node & Edge Data Model

- **Node Representation:**
  - All nodes are instances of `Node<EditableNodeData>` from `@xyflow/react`.
  - `EditableNodeData` is a discriminated union (see `lib/types.ts`) with at least:
    - `nodeType: 'sender' | 'plugin' | 'receiver'`
    - `name`, `description`, `token`, `sources`, `access_types`, plus custom fields
  - Node state is managed in the main canvas component and updated via the property panel.
  - Node IDs are UUIDs (see `generateToken()` for secure random generation).

- **Edge Representation:**
  - Edges are objects with `id`, `source`, `target`, and optional metadata.
  - All edge state is colocated with node state for atomic updates.
  - Edges are the single source of truth for workflow topology.

- **Data Flow:**
  - All node/edge mutations are performed via React state setters.
  - Node data is always updated immutably to ensure React reconciliation.
  - The property panel (`ComponentPanel_enhanced.tsx`) is the canonical place for node data editing.

## 2. Workflow Auto-Fix (Clean Workflow Algorithm)

- **Goal:**
  - Enforce readable, horizontally-organized workflows that reflect actual data flow, not just type grouping.

- **Algorithm Details:**
  - For each sender node, traverse outgoing edges to build a chain: sender → plugin(s) → receiver.
  - Each chain is assigned a horizontal row (Y offset = chain index * VERTICAL_SPACING).
  - Nodes in a chain are spaced horizontally (X offset = node index in chain * HORIZONTAL_SPACING).
  - Isolated nodes (no edges) are grouped by type and placed below all chains.
  - All layout is deterministic and idempotent (re-running produces the same result).
  - See `handleCleanWorkflow` in `MinimalCanvas.tsx` for implementation.

- **Edge Cases:**
  - Cycles are not supported; the algorithm will break at the first repeated node.
  - Multiple parallel chains are supported and visually separated.

## 3. Node Property Panel (ComponentPanel)

- **Architecture:**
  - Controlled form with local state for editing, only committing on apply.
  - Collapsible sections: base (standard fields), custom (dynamic fields), advanced (token, etc).
  - Source management: add/remove/edit for sender/receiver nodes, always type-safe.
  - Token management: secure display, regeneration with confirmation, and toast feedback.
  - All changes are validated and merged immutably into the node state.

## 4. Context Menus & Node Actions

- **Implementation:**
  - Right-click context menus via shadcn/ui + Radix primitives.
  - Node actions: delete, duplicate, add, etc. All actions update state atomically.
  - Context menu state is managed per-node for performance and clarity.

## 5. Visual System & Usability

- **Handles:**
  - Source handles are color-coded by type (see `sourceColors` utility).
  - Handle positions are calculated for dot-to-dot precision.

- **Highlighting:**
  - Node selection and context menu highlighting are visually distinct.

- **Templates:**
  - Templated node creation is type-safe and uses dropdowns with search and categorization.

## 6. State Management & Feedback

- **React State:**
  - All workflow state (nodes, edges, UI) is managed via hooks in the main canvas.
  - No global state library is used; all state is colocated for simplicity.

- **Feedback:**
  - Uses `sonner` for toast notifications.
  - All destructive actions (delete, regenerate token, clean workflow) require confirmation.
  - Loading and animation states are explicit and cancelable.

## 7. Extensibility & Internal Practices

- **TypeScript:**
  - All data structures and components are strictly typed.
  - Discriminated unions are used for node types to enable exhaustive checks.

- **Componentization:**
  - All UI is modular and composable. No monolithic components.

- **Reasoning:**
  - All architectural choices are made for maintainability, testability, and developer velocity.
  - All algorithms are deterministic and side-effect free (except for UI feedback).

## References

- Main Canvas: `components/canvas/MinimalCanvas.tsx`
- Node Editor: `components/ui/ComponentPanel_enhanced.tsx`
- UI Components: `components/ui/`
- Node Types: `components/nodes/`
- Types: `lib/types.ts`

---

For further technical details, see code comments and the above files. All contributors are expected to follow the patterns and practices described here.
