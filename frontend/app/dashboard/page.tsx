"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  LogOut,
  Search,
} from "lucide-react";

const TABS = ["All", "Live", "Drafts", "Archived"] as const;
type Tab = (typeof TABS)[number];

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const renameProject = useMutation(api.projects.rename);
  const removeProject = useMutation(api.projects.remove);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Id<"projects"> | null>(null);
  const [renameName, setRenameName] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Id<"projects"> | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("All");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const id = await createProject({ name: newName.trim() });
    setShowNewDialog(false);
    setNewName("");
    router.push(`/create?project=${id}`);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    await renameProject({ projectId: renameTarget, name: renameName.trim() });
    setShowRenameDialog(false);
    setRenameTarget(null);
    setRenameName("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await removeProject({ projectId: deleteTarget });
    setShowDeleteDialog(false);
    setDeleteTarget(null);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const formatRelative = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const lastUpdated = projects && projects.length > 0
    ? formatRelative(Math.max(...projects.map((p) => p.updatedAt)))
    : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--paper-2)", color: "var(--ink)" }}>
      {/* Editorial top chrome */}
      <header
        style={{
          background: "var(--paper)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.01em" }}>
              orchestrator
            </div>
            <div style={{ width: 1, height: 18, background: "var(--line-strong)" }} />
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-3)" }}>
              <span>{session?.user?.email?.split("@")[0] ?? "workspace"}</span>
              <span style={{ color: "var(--ink-4)" }}>/</span>
              <span style={{ color: "var(--ink)" }}>workflows</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--ink-3)" }}>
              {session?.user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              style={{ color: "var(--ink-2)" }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-10">
        {/* Page hero */}
        <div className="flex items-end justify-between gap-6 pb-6">
          <div>
            <div className="eyebrow">workspace</div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 56,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                marginTop: 8,
              }}
            >
              Workflows
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
              {projects
                ? `${projects.length} project${projects.length !== 1 ? "s" : ""}${
                    lastUpdated ? ` · last activity ${lastUpdated} ago` : ""
                  }`
                : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm transition-colors"
              style={{
                border: "1px solid var(--line-strong)",
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            >
              Import
            </button>
            <button
              onClick={() => setShowNewDialog(true)}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm transition-colors"
              style={{
                background: "var(--orch-accent)",
                color: "var(--paper)",
                border: "1px solid var(--orch-accent)",
              }}
            >
              <Plus className="h-4 w-4" />
              New workflow
            </button>
          </div>
        </div>

        {/* Tab strip + search */}
        <div
          className="flex items-center gap-6 px-1 pb-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          {TABS.map((t) => {
            const active = t === activeTab;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  fontSize: 13,
                  paddingBottom: 11,
                  marginBottom: -13,
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  borderBottom: active ? "2px solid var(--orch-accent)" : "2px solid transparent",
                  background: "transparent",
                }}
              >
                {t}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 rounded px-3 py-1.5"
            style={{ border: "1px solid var(--line-strong)", background: "var(--paper)" }}
          >
            <Search className="h-3.5 w-3.5" style={{ color: "var(--ink-4)" }} />
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>Search</span>
            <span className="kbd">/</span>
          </div>
        </div>

        {/* Empty state */}
        {projects && projects.length === 0 && (
          <div
            className="mt-10 flex flex-col items-center justify-center rounded-xl py-20"
            style={{
              border: "1px dashed var(--line-strong)",
              background: "var(--paper)",
            }}
          >
            <div className="eyebrow mb-2">empty</div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                letterSpacing: "-0.02em",
              }}
            >
              No workflows yet.
            </p>
            <p className="mb-6 mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
              Create your first workflow project to get started.
            </p>
            <button
              onClick={() => setShowNewDialog(true)}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
              style={{
                background: "var(--orch-accent)",
                color: "var(--paper)",
                border: "1px solid var(--orch-accent)",
              }}
            >
              <Plus className="h-4 w-4" />
              New workflow
            </button>
          </div>
        )}

        {/* Editorial table */}
        {projects && projects.length > 0 && (
          <div
            className="mt-6 overflow-hidden rounded-xl"
            style={{
              border: "1px solid var(--line)",
              background: "var(--paper)",
            }}
          >
            <div
              className="grid items-center px-5 py-3"
              style={{
                gridTemplateColumns: "1fr 120px 100px 90px 60px",
                background: "var(--paper-2)",
                borderBottom: "1px solid var(--line)",
                fontSize: 10,
                fontFamily: "var(--font-mono-orch)",
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <div>Workflow</div>
              <div>Status</div>
              <div>Nodes</div>
              <div>Updated</div>
              <div />
            </div>

            {projects.map((project, i) => (
              <div
                key={project._id}
                onClick={() => router.push(`/create?project=${project._id}`)}
                className="group grid cursor-pointer items-center px-5 py-4 transition-colors"
                style={{
                  gridTemplateColumns: "1fr 120px 100px 90px 60px",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--paper-2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div className="min-w-0">
                  <div
                    className="truncate"
                    style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}
                  >
                    {project.name}
                  </div>
                  {project.description && (
                    <div
                      className="mt-0.5 truncate"
                      style={{ fontSize: 12, color: "var(--ink-3)" }}
                    >
                      {project.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--ink-4)",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>draft</span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontFamily: "var(--font-mono-orch)",
                    color: "var(--ink-2)",
                  }}
                >
                  —
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {formatRelative(project.updatedAt)}
                </div>
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget(project._id);
                          setRenameName(project.name);
                          setShowRenameDialog(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(project._id);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "-0.01em" }}>
              New workflow
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <Input
              placeholder="Workflow name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "-0.01em" }}>
              Rename workflow
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRename();
            }}
          >
            <Input
              placeholder="Workflow name"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRenameDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!renameName.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "-0.01em" }}>
              Delete workflow
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            This will permanently delete the project and its workflow. This
            action cannot be undone.
          </p>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
