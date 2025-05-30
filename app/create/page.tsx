'use client';

// import { RoomProvider } from "../liveblocks.config"; 
// import LiveblocksMinimalCanvas from "./components/LiveblocksMinimalCanvas"; 
// import { LiveList, LiveObject } from "@liveblocks/client"; 
// import type { StorageNodeData, StorageEdgeData } from "../liveblocks.config"; 

import MinimalCanvas from "../../components/canvas/MinimalCanvas"; // Focus on MinimalCanvas

export default function CreatePage() {
  return (
    // <RoomProvider
    //   id="my-liveblocks-livelist-room" 
    //   initialPresence={{ cursor: null }}
    //   initialStorage={{
    //     nodes: new LiveList<LiveObject<StorageNodeData>>([]), 
    //     edges: new LiveList<LiveObject<StorageEdgeData>>([]), 
    //   }}
    // >
    //   <div className="w-full h-screen bg-gray-100">
    //     <LiveblocksMinimalCanvas />
    //   </div>
    // </RoomProvider>
    <MinimalCanvas /> // Render MinimalCanvas directly
  );
} 