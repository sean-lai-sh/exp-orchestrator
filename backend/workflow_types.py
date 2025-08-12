from pydantic import BaseModel, Field
from typing import List, Dict, Literal, Optional

class Node(BaseModel):
    id: str
    type: str                       # plugin name or category
    runtime: str                    # py3.10, node18, cuda12.1, etc
    deps: List[str]                 # package list or lockfile hash
    needs_gpu: bool = False
    cpu: float = 0.5                # cores
    mem_mb: int = 512
    avg_runtime_ms: int = 0
    io_format: Literal["json","bytes","parquet","avro"] = "json"
    stateful: bool = False
    trigger_type: Literal["event","cron","manual"] = "event"

class Edge(BaseModel):
    src: str
    dst: str
    data_contract: Optional[Dict] = None
    latency_req_ms: Optional[int] = None
    condition: Optional[str] = None  # e.g. "flag == true"

class Workflow(BaseModel):
    nodes: Dict[str, Node]
    edges: List[Edge]