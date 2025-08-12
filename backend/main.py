from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI()

class NodeData(BaseModel):
    id: str
    type: str
    data: Dict[str, Any]
    position: Dict[str, float]
    draggable: bool
    selectable: bool
    connectable: bool

class EdgeData(BaseModel):
    id: str
    source: str
    target: str
    type: str

class DeployRequest(BaseModel):
    nodes: List[NodeData]
    edges: List[EdgeData]

def build_adjacency_list(nodes: List[NodeData], edges: List[EdgeData]) -> Dict[str, List[str]]:
    adj = {node.id: [] for node in nodes}
    for edge in edges:
        adj[edge.source].append(edge.target)
    return adj

def bfs(start_id: str, adj: Dict[str, List[str]]) -> List[str]:
    visited = set()
    queue = [start_id]
    while queue:
        node = queue.pop(0)
        if node not in visited:
            visited.add(node)
            queue.extend(adj.get(node, []))
    return list(visited)

@app.post("/deploy")
async def deploy_graph(payload: DeployRequest):
    nodes = payload.nodes
    edges = payload.edges
    adj = build_adjacency_list(nodes, edges)
    # Example: get all nodes reachable from the first node
    if nodes:
        reachable = bfs(nodes[0].id, adj)
    else:
        reachable = []
    return {
        "message": "Graph received!",
        "node_count": len(nodes),
        "edge_count": len(edges),
        "reachable_from_first_node": reachable,
        "adjacency_list": adj
    }
