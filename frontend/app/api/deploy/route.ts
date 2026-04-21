import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { analyzeDAG } from '@/lib/dag-analyzer';
import { toBackendDeployWorkflow } from '@/lib/workflow-validation';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    const edges = Array.isArray(payload?.edges) ? payload.edges : [];
    const analysis = analyzeDAG(nodes, edges);
    const workflow = toBackendDeployWorkflow(nodes, edges);

    const frontendDir = process.cwd();
    const repoDir = path.resolve(frontendDir, '..');
    const tempDir = await mkdtemp(path.join(tmpdir(), 'exp-orchestrator-validate-'));
    const payloadPath = path.join(tempDir, 'workflow.json');
    const scriptPath = path.join(repoDir, 'backend', 'validate_workflow_cli.py');

    await writeFile(payloadPath, JSON.stringify(workflow), 'utf-8');

    try {
      const { stdout } = await execFileAsync('python3', [scriptPath, payloadPath], {
        cwd: path.join(repoDir, 'backend'),
        maxBuffer: 1024 * 1024,
      });

      const backendResult = JSON.parse(stdout || '{}');
      if (!backendResult.valid) {
        return NextResponse.json(
          {
            success: false,
            valid: false,
            message: 'Backend validation reported blocking issues.',
            analysis,
            backendError: backendResult.error || 'Unknown backend validation failure.',
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        valid: analysis.valid,
        message: analysis.valid
          ? 'Frontend and backend validation both passed.'
          : 'Backend validation passed, but the frontend analyzer still found deploy blockers or warnings.',
        analysis,
        backendPlan: backendResult.result,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        message: 'Failed to validate workflow.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
