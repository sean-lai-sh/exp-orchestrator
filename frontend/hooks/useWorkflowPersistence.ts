import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { EditableNodeData } from "@/lib/types";

export function useWorkflowPersistence(projectId: string | null) {
  const typedProjectId = projectId as Id<"projects"> | null;
  const workflow = useQuery(
    api.workflows.get,
    typedProjectId ? { projectId: typedProjectId } : "skip"
  );
  const saveWorkflow = useMutation(api.workflows.save);

  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<{
    nodes: Node<EditableNodeData>[];
    edges: Edge[];
  } | null>(null);

  useEffect(() => {
    if (workflow !== undefined && !isLoaded) {
      setIsLoaded(true);
    }
  }, [workflow, isLoaded]);

  const initialNodes: Node<EditableNodeData>[] = workflow
    ? JSON.parse(workflow.nodes)
    : [];
  const initialEdges: Edge[] = workflow ? JSON.parse(workflow.edges) : [];

  const debouncedSave = useCallback(
    (nodes: Node<EditableNodeData>[], edges: Edge[]) => {
      if (!typedProjectId) return;
      latestStateRef.current = { nodes, edges };

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const state = latestStateRef.current;
        if (state) {
          saveWorkflow({
            projectId: typedProjectId,
            nodes: JSON.stringify(state.nodes),
            edges: JSON.stringify(state.edges),
          });
        }
      }, 2000);
    },
    [typedProjectId, saveWorkflow]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const state = latestStateRef.current;
      if (state && typedProjectId) {
        saveWorkflow({
          projectId: typedProjectId,
          nodes: JSON.stringify(state.nodes),
          edges: JSON.stringify(state.edges),
        });
      }
    };
  }, [typedProjectId, saveWorkflow]);

  return {
    initialNodes,
    initialEdges,
    isLoaded: typedProjectId ? isLoaded : true,
    debouncedSave,
  };
}
