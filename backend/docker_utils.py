import subprocess
from typing import Dict
from workflow_types import Workflow

def build_and_push_container(spec: Dict, workflow: Workflow) -> None:
    """
    Build Docker image from spec and push to container registry.
    """
    image = spec.get("image_name")
    # Build the Docker image using the current directory as context
    subprocess.run(["docker", "build", "-t", image, "."], check=True)
    # Push the image to the registry
    subprocess.run(["docker", "push", image], check=True)
