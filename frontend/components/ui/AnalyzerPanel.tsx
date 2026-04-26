'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AnalysisResult, AnalyzerIssue } from '@/lib/dag-analyzer';

interface AnalyzerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: AnalysisResult | null;
  isValidating: boolean;
  validationMessage: string | null;
  onValidateWithBackend: () => void;
  onFocusIssue: (issue: AnalyzerIssue) => void;
}

const categoryLabels: Record<AnalyzerIssue['category'], string> = {
  cycle: 'Cycles',
  connection: 'Connections',
  runtime: 'Runtime',
  stream: 'Streams',
  readiness: 'Readiness',
};

function severityIcon(severity: AnalyzerIssue['severity']) {
  if (severity === 'error') {
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  }
  if (severity === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  }
  return <Info className="h-4 w-4 text-blue-600" />;
}

function severityClasses(severity: AnalyzerIssue['severity']) {
  if (severity === 'error') {
    return 'border-red-200 bg-red-50 text-red-900';
  }
  if (severity === 'warning') {
    return 'border-yellow-200 bg-yellow-50 text-yellow-900';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

export default function AnalyzerPanel({
  isOpen,
  onClose,
  analysisResult,
  isValidating,
  validationMessage,
  onValidateWithBackend,
  onFocusIssue,
}: AnalyzerPanelProps) {
  const issues = analysisResult?.issues ?? [];
  const issuesByCategory = issues.reduce<Record<string, AnalyzerIssue[]>>((acc, issue) => {
    if (!acc[issue.category]) {
      acc[issue.category] = [];
    }
    acc[issue.category].push(issue);
    return acc;
  }, {});

  const pluginCount = analysisResult?.stats.pluginCount ?? 0;
  const readyCount = analysisResult?.stats.readyToDeployCount ?? 0;
  const readinessPercent = pluginCount > 0 ? Math.round((readyCount / pluginCount) * 100) : 100;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0">
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {analysisResult?.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
                <DialogTitle>DAG Analyzer</DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onValidateWithBackend} disabled={isValidating}>
                  {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Validate with Backend
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogClose>
              </div>
            </div>
            <DialogDescription>
              Real-time deploy readiness based on cycle checks, connection rules, runtime status, and stream compatibility.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Nodes</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{analysisResult?.stats.nodeCount ?? 0}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Edges</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{analysisResult?.stats.edgeCount ?? 0}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Blockers / Warnings</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {analysisResult?.stats.errorCount ?? 0} / {analysisResult?.stats.warningCount ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                <span>Deploy readiness</span>
                <span>{readinessPercent}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${readinessPercent}%` }} />
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {readyCount} of {pluginCount} plugin nodes are ready to deploy.
              </div>
            </div>
          </div>

          {validationMessage && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {validationMessage}
            </div>
          )}

          {issues.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              No analyzer issues found. This workflow is ready for backend validation.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {Object.entries(issuesByCategory).map(([category, categoryIssues]) => (
                <details key={category} open className="rounded-lg border border-slate-200 bg-white">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-900">
                    {categoryLabels[category as AnalyzerIssue['category']]} ({categoryIssues.length})
                  </summary>
                  <div className="space-y-2 border-t border-slate-100 p-3">
                    {categoryIssues.map((issue, index) => (
                      <button
                        key={`${category}-${index}-${issue.message}`}
                        type="button"
                        onClick={() => { onFocusIssue(issue); onClose(); }}
                        className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${severityClasses(issue.severity)}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{severityIcon(issue.severity)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{issue.message}</div>
                            {issue.fix && (
                              <div className="mt-1 text-xs opacity-90">Suggested fix: {issue.fix}</div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
