"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Plus, LayoutDashboard, Copy, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const CANVAS_TOP_CHROME_HEIGHT = 56;

interface CanvasTopChromeProps {
  currentProjectId: string | null;
  isDeploying: boolean;
  onDeploy: () => void;
  lastDeployId: string | null;
}

/**
 * Editorial top-chrome for /create — breadcrumb crumbs (workspace / project /
 * version), live status chip, search affordance, deploy button.
 */
export default function CanvasTopChrome({
  currentProjectId,
  isDeploying,
  onDeploy,
  lastDeployId,
}: CanvasTopChromeProps) {
  const router = useRouter();
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedDeployId, setCopiedDeployId] = useState(false);

  const handleCopyDeployId = async () => {
    if (!lastDeployId) return;
    try {
      await navigator.clipboard?.writeText(lastDeployId);
      setCopiedDeployId(true);
      setTimeout(() => setCopiedDeployId(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const currentProject = projects?.find(
    (p) => p._id === (currentProjectId as Id<"projects">)
  );

  const handleNewProject = async () => {
    setIsCreating(true);
    try {
      const id = await createProject({ name: "Untitled Project" });
      router.push(`/create?project=${id}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: CANVAS_TOP_CHROME_HEIGHT,
        background: "color-mix(in oklch, var(--paper) 85%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        zIndex: 30,
        fontFamily: "var(--font-sans-orch)",
      }}
    >
      {/* Left: brand + breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            letterSpacing: "-0.01em",
            background: "transparent",
            border: "none",
            color: "var(--ink)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          orchestrator
        </button>
        <div style={{ width: 1, height: 18, background: "var(--line-strong)" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
            }}
          >
            workflows
          </button>
          <span style={{ color: "var(--ink-4)" }}>/</span>

          {/* Project switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                }}
              >
                <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentProject?.name ?? "Untitled"}
                </span>
                <ChevronDown className="h-3 w-3" style={{ opacity: 0.5 }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {projects?.map((project) => (
                <DropdownMenuItem
                  key={project._id}
                  onClick={() => router.push(`/create?project=${project._id}`)}
                  className={project._id === currentProjectId ? "bg-accent" : ""}
                >
                  <span className="truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}
              {projects && projects.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleNewProject} disabled={isCreating}>
                <Plus className="mr-2 h-4 w-4" />
                {isCreating ? "Creating..." : "New Project"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Back to Dashboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span
          className="chip"
          style={{
            color: "var(--ink-3)",
            background: "var(--paper)",
          }}
        >
          <span className="dot" style={{ background: "var(--ink-4)" }} />
          draft
        </span>

        {lastDeployId && (
          <button
            onClick={handleCopyDeployId}
            title="Click to copy deploy_id"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              border: "1px solid var(--line-strong)",
              borderRadius: 999,
              background: "var(--paper)",
              color: "var(--ink-2)",
              fontSize: 12,
              fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              cursor: "pointer",
            }}
          >
            <span style={{ color: "var(--ink-4)", fontFamily: "var(--font-sans-orch)" }}>
              deploy_id
            </span>
            <span>{lastDeployId}</span>
            {copiedDeployId ? (
              <Check className="h-3 w-3" style={{ color: "var(--ink-3)" }} />
            ) : (
              <Copy className="h-3 w-3" style={{ opacity: 0.55 }} />
            )}
          </button>
        )}
      </div>

      {/* Right: search + deploy */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            border: "1px solid var(--line-strong)",
            borderRadius: 6,
            color: "var(--ink-3)",
            fontSize: 12,
            background: "var(--paper)",
          }}
        >
          <span>⌕</span>
          <span>Search</span>
          <span className="kbd">⌘K</span>
        </div>
        <button
          onClick={onDeploy}
          disabled={isDeploying}
          style={{
            background: "var(--orch-accent)",
            color: "var(--paper)",
            border: "1px solid var(--orch-accent)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: isDeploying ? "wait" : "pointer",
            opacity: isDeploying ? 0.6 : 1,
          }}
        >
          {isDeploying ? "Deploying…" : "Deploy"}
          {!isDeploying && (
            <span
              className="kbd"
              style={{
                background: "rgba(255,255,255,.12)",
                borderColor: "rgba(255,255,255,.2)",
                color: "rgba(255,255,255,.85)",
              }}
            >
              ⌘↵
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
