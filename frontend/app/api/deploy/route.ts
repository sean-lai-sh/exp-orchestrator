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

    console.log('[deploy] frontend analysis valid:', analysis.valid, 'issues:', analysis.issues.length);

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
      console.log('[deploy] CLI validation valid:', backendResult.valid);

      if (!backendResult.valid) {
        console.log('[deploy] STOPPED: CLI validation failed');
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

      if (!analysis.valid) {
        console.log('[deploy] STOPPED: frontend analysis invalid — not calling backend');
        const errorSummary = analysis.issues.map((i: { code: string; severity: string }) => `${i.severity}:${i.code}`).join(', ');
        return NextResponse.json({
          success: true,
          valid: false,
          message: `Backend OK but frontend analyzer blocked deploy: ${errorSummary}`,
          analysis,
          backendPlan: backendResult.result,
        });
      }

      // Validation passed — execute the actual deployment
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      console.log('[deploy] calling backend:', `${backendUrl}/deploy/execute/v2?executor=noop&inject_env=false`);

      const executeRes = await fetch(`${backendUrl}/deploy/execute/v2?executor=noop&inject_env=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      });

      if (!executeRes.ok) {
        const detail = await executeRes.text();
        console.log('[deploy] backend execute failed:', executeRes.status, detail);
        return NextResponse.json({
          success: true,
          valid: true,
          message: 'Validation passed but deployment execution failed.',
          analysis,
          backendPlan: backendResult.result,
          backendError: detail,
        });
      }

      const executeResult = await executeRes.json();
      console.log('[deploy] SUCCESS deploy_id:', executeResult.deploy_id);

      return NextResponse.json({
        success: true,
        valid: true,
        message: 'Deployed successfully.',
        analysis,
        backendPlan: backendResult.result,
        deployId: executeResult.deploy_id,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[deploy] EXCEPTION:', error);
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
