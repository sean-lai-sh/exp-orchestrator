"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, FolderOpen, Plus, LayoutDashboard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function ProjectSwitcher({
  currentProjectId,
}: {
  currentProjectId: string | null;
}) {
  const router = useRouter();
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const [isCreating, setIsCreating] = useState(false);

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

  const handleSwitchProject = (projectId: Id<"projects">) => {
    router.push(`/create?project=${projectId}`);
  };

  return (
    <div className="absolute top-4 right-4 z-40">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-white shadow">
            <FolderOpen className="h-4 w-4" />
            <span className="max-w-[160px] truncate">
              {currentProject?.name ?? "No Project"}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {projects?.map((project) => (
            <DropdownMenuItem
              key={project._id}
              onClick={() => handleSwitchProject(project._id)}
              className={
                project._id === currentProjectId ? "bg-accent" : ""
              }
            >
              <FolderOpen className="mr-2 h-4 w-4" />
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
  );
}
