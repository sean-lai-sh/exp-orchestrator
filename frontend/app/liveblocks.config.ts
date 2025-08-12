import { createClient, LiveObject, LiveList } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import type { Node, Edge } from '@xyflow/react';
import type { JsonObject } from '@liveblocks/client';

interface NodeData extends JsonObject {
  label: string;
}

export type StorageNodeData = JsonObject & {
  id: string;
  type: string;
  position: JsonObject & { x: number; y: number };
  data: NodeData;
};

export type StorageEdgeData = JsonObject & {
  id: string;
  source: string;
  target: string;
  type?: string;
};

if (!process.env.NEXT_PUBLIC_LIVEBLOCK_API_KEY) {
  throw new Error("NEXT_PUBLIC_LIVEBLOCK_API_KEY is not defined");
}

const client = createClient({
  publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCK_API_KEY,
});

type Presence = {
  cursor: { x: number; y: number } | null;
};

type Storage = {
  nodes: LiveList<LiveObject<StorageNodeData>>;
  edges: LiveList<LiveObject<StorageEdgeData>>;
};

export type { Storage, NodeData };

export const {
  RoomProvider,
  useRoom,
  useMyPresence,
  useUpdateMyPresence,
  useOthers,
  useStorage,
  useMutation,
} = createRoomContext<Presence, Storage>(client); 