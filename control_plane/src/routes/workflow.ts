import { Router } from 'express';
import { createWorkflow, getWorkflow, updateWorkflow, deleteWorkflow } from '../controllers/workflowController';

const router = Router();

// POST /api/workflow - Create a new workflow
router.post('/', createWorkflow);

// GET /api/workflow/:id - Get a specific workflow
router.get('/:id', getWorkflow);

// PUT /api/workflow/:id - Update a workflow
router.put('/:id', updateWorkflow);

// DELETE /api/workflow/:id - Delete a workflow
router.delete('/:id', deleteWorkflow);

export default router;
