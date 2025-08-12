import httpx
from typing import Any, Dict
from workflow_types import Workflow

def fetch_workflow_data(api_url: str, workflow_id: str) -> Dict[str, Any]:
    """
    Fetch workflow definition from API and return raw JSON.
    """
    response = httpx.get(f"{api_url}/workflows/{workflow_id}")
    response.raise_for_status()
    return response.json()

def ingest_workflow(raw: Dict[str, Any]) -> Workflow:
    """
    Parse raw workflow JSON into Workflow model.
    """
    return Workflow.parse_obj(raw)
