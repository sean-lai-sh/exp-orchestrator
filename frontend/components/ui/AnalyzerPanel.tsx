'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AnalysisResult, AnalyzerIssue } from '@/lib/dag-analyzer';

interface AnalyzerPanelProps {
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
  if (severity === 'error') return <AlertCircle className="h-4 w-4" style={{ color: '#f87171' }} />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4" style={{ color: '#fbbf24' }} />;
  return <Info className="h-4 w-4" style={{ color: '#00d4ff' }} />;
}

function severityStyles(severity: AnalyzerIssue['severity']): { bg: string; border: string; color: string } {
  if (severity === 'error') return { bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)', color: '#f87171' };
  if (severity === 'warning') return { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.15)', color: '#fbbf24' };
  return { bg: 'rgba(0,212,255,0.06)', border: 'rgba(0,212,255,0.15)', color: '#00d4ff' };
}

const surface = 'hsl(240 8% 9%)';
const surfaceElevated = 'hsl(240 8% 11%)';
const borderColor = 'hsl(240 6% 18%)';
const textPrimary = 'hsl(220 10% 92%)';
const textMuted = 'hsl(220 10% 45%)';

export default function AnalyzerPanel({
  analysisResult,
  isValidating,
  validationMessage,
  onValidateWithBackend,
  onFocusIssue,
}: AnalyzerPanelProps) {
  const issues = analysisResult?.issues ?? [];
  const issuesByCategory = issues.reduce<Record<string, AnalyzerIssue[]>>((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {});

  const pluginCount = analysisResult?.stats.pluginCount ?? 0;
  const readyCount = analysisResult?.stats.readyToDeployCount ?? 0;
  const readinessPercent = pluginCount > 0 ? Math.round((readyCount / pluginCount) * 100) : 100;

  return (
    <div
      className="absolute inset-x-4 bottom-4 z-20 rounded-2xl toolbar-float-in"
      style={{
        background: 'rgba(22, 22, 28, 0.92)',
        backdropFilter: 'blur(24px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        border: `1px solid ${borderColor}`,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
      }}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: textPrimary }}>
              {analysisResult?.valid ? (
                <CheckCircle2 className="h-4 w-4" style={{ color: '#34d399' }} />
              ) : (
                <AlertTriangle className="h-4 w-4" style={{ color: '#fbbf24' }} />
              )}
              DAG Analyzer
            </div>
            <p className="mt-1 text-[11px]" style={{ color: textMuted }}>
              Real-time deploy readiness: cycles, connections, runtime, and stream compatibility.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={onValidateWithBackend}
              disabled={isValidating}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40"
              style={{ background: 'transparent', border: `1px solid ${borderColor}`, color: 'hsl(220 10% 70%)' }}
            >
              {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Validate with Backend
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: 'Nodes', value: analysisResult?.stats.nodeCount ?? 0 },
            { label: 'Edges', value: analysisResult?.stats.edgeCount ?? 0 },
            { label: 'Blockers / Warnings', value: `${analysisResult?.stats.errorCount ?? 0} / ${analysisResult?.stats.warningCount ?? 0}` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg p-3" style={{ background: surfaceElevated, border: `1px solid ${borderColor}` }}>
              <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: textMuted }}>{stat.label}</div>
              <div className="mt-1 text-xl font-semibold" style={{ color: textPrimary }}>{stat.value}</div>
            </div>
          ))}
          <div className="rounded-lg p-3" style={{ background: surfaceElevated, border: `1px solid ${borderColor}` }}>
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider" style={{ color: textMuted }}>
              <span>Readiness</span>
              <span style={{ color: readinessPercent === 100 ? '#34d399' : '#fbbf24' }}>{readinessPercent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'hsl(240 6% 16%)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${readinessPercent}%`, background: readinessPercent === 100 ? '#34d399' : 'linear-gradient(90deg, #fbbf24, #34d399)' }}
              />
            </div>
            <div className="mt-1.5 text-[11px]" style={{ color: textMuted }}>
              {readyCount} of {pluginCount} plugins ready.
            </div>
          </div>
        </div>

        {validationMessage && (
          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: surfaceElevated, border: `1px solid ${borderColor}`, color: 'hsl(220 10% 70%)' }}>
            {validationMessage}
          </div>
        )}

        {issues.length === 0 ? (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399' }}>
            No analyzer issues. Ready for backend validation.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {Object.entries(issuesByCategory).map(([category, categoryIssues]) => (
              <details key={category} open className="rounded-lg overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: surface }}>
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium" style={{ color: 'hsl(220 10% 80%)' }}>
                  {categoryLabels[category as AnalyzerIssue['category']]} ({categoryIssues.length})
                </summary>
                <div className="space-y-2 p-3" style={{ borderTop: `1px solid ${borderColor}` }}>
                  {categoryIssues.map((issue, index) => {
                    const s = severityStyles(issue.severity);
                    return (
                      <button
                        key={`${category}-${index}-${issue.message}`}
                        type="button"
                        onClick={() => onFocusIssue(issue)}
                        className="w-full rounded-lg p-3 text-left transition-all hover:scale-[1.01]"
                        style={{ background: s.bg, border: `1px solid ${s.border}` }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{severityIcon(issue.severity)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium" style={{ color: s.color }}>{issue.message}</div>
                            {issue.fix && (
                              <div className="mt-1 text-[11px]" style={{ color: textMuted }}>Fix: {issue.fix}</div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
