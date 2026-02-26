from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class Node(BaseModel):
    id: str
    type: str  # plugin name or category
    runtime: str  # py3.10, node18, cuda12.1, etc
    deps: List[str]  # package list or lockfile hash
    needs_gpu: bool = False
    cpu: float = 0.5  # cores
    mem_mb: int = 512
    avg_runtime_ms: int = 0
    io_format: Literal["json", "bytes", "parquet", "avro"] = "json"
    stateful: bool = False
    trigger_type: Literal["event", "cron", "manual"] = "event"


class Edge(BaseModel):
    src: str
    dst: str
    data_contract: Optional[Dict[str, Any]] = None
    latency_req_ms: Optional[int] = None
    condition: Optional[str] = None  # e.g. "flag == true"


class Workflow(BaseModel):
    nodes: Dict[str, Node]
    edges: List[Edge]


class StreamCredential(BaseModel):
    workspace: str
    protocol: str = "pubsub"
    stream_id: str
    data_type: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DeployNode(BaseModel):
    id: str
    type: str
    runtime: Optional[str] = None
    in_streams: List[str] = Field(default_factory=list)
    out_streams: List[str] = Field(default_factory=list)
    in_creds: Dict[str, StreamCredential] = Field(default_factory=dict)
    out_creds: Dict[str, StreamCredential] = Field(default_factory=dict)
    env_vars: Dict[str, str] = Field(default_factory=dict)
    data: Dict[str, Any] = Field(default_factory=dict)


class DeployEdge(BaseModel):
    source: str
    target: str
    data: Optional[str] = None  # stream type, defaults to "json" at deploy time


class DeployWorkflow(BaseModel):
    nodes: List[DeployNode]
    edges: List[DeployEdge]
