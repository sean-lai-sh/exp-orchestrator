# Exp-Orchestrator

A visual orchestration tool built with React, React Flow, and FastAPI for deploying and managing node-based workflows. This README summarizes the main files and components so you can quickly understand and revisit the project structure.

---

## Project Structure & Key Files

### Frontend (React/Next.js)

- **components/canvas/MinimalCanvas.tsx**
  - The main canvas and flow editor. Manages the state of nodes and edges, handles adding nodes, deploying, and UI overlays (deploy progress, confirmation, blur, etc). Integrates with React Flow for the visual node/edge editor.

- **components/canvas/CustomEditableNode.tsx**
  - The custom node component rendered on the canvas. Allows inline editing of node name and description, and displays connection handles for React Flow.

- **components/ui/ComponentPanel.tsx**
  - The right-side panel for editing the properties of the currently selected node. Uses the `SecureTokenDisplay` for secure token handling and exposes fields for name, token, access types, etc.

- **components/ui/CanvasPanel.tsx**
  - The left-side panel for canvas controls. Contains buttons for adding nodes and deploying the current flow. Handles deploy button state and animation.

- **components/ui/SecureTokenDisplay.tsx**
  - A reusable component for displaying sensitive tokens. Supports reveal/hide, copy-to-clipboard, and toast feedback, with masked display for security.

- **components/canvas/AnimatedSVGEdge.tsx**
  - (If present) Custom edge rendering for animated SVG edges in the flow.

- **lib/types.ts**
  - Centralized TypeScript type definitions for node data, props, and compatibility logic. All node-related types are imported from here for consistency.

---

## Key Features
- **Visual Node Editor:** Drag, connect, and edit nodes on a canvas.
- **Secure Token Handling:** Tokens are masked, can be revealed, and copied with feedback.
- **Deploy Workflow:** Deploy button with confirmation modal, animated progress bar, and checkmark feedback.
- **Type Safety:** All node types and props are managed in `lib/types.ts`.

---

## Backend (FastAPI)
- **/deploy endpoint**
  - Expects a POST request with `{ nodes, edges }` as JSON. Used for deploying the current flow from the frontend.

---

## How to Extend
- Add new node types by editing `CustomEditableNode.tsx` and updating types in `lib/types.ts`.
- Add new panels or controls by extending `CanvasPanel.tsx` or `ComponentPanel.tsx`.
- Integrate more backend endpoints as needed for your orchestration logic.

---

## Quick Start
1. Install dependencies: `npm install` (frontend) and `pip install fastapi` (backend).
2. Run the frontend: `npm run dev`.
3. Run the backend: `uvicorn main:app --reload` (assuming your FastAPI app is in `main.py`).
4. Open the app in your browser and start building flows!

---

## Notes
- All sensitive actions (like deploy) have confirmation and feedback for safety.
- All node-related types should be added to `lib/types.ts` for consistency.
- The UI is designed for extensibility and clarity.

---

Feel free to update this README as you add new features or files!
