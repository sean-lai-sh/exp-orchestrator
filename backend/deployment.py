import subprocess
import os
from workflow_types import Node

def inject_vars_to_image(env_vars: dict, node: Node) -> None:
    """
    Inject env_vars via docker compose into the specified image.
    This allows us to set environment variables that can be used by the application
    running in the container.
    """
    # Create a temporary docker-compose file
    compose_file = "docker-compose.yml"
    image_name = fetch_image_name(node)
    with open(compose_file, "w") as f:
        f.write("services:\n")
        f.write(f"  app:\n")
        f.write(f"    image: {image_name}\n")
        f.write("    environment:\n")
        for key, value in env_vars.items():
            f.write(f"      - {key}={value}\n")

    # Run docker compose to inject the environment variables
    subprocess.run(["docker", "compose", "-f", compose_file, "up"], check=True)

    # Clean up the temporary compose file
    os.remove(compose_file)

def fetch_image_name(node: Node) -> str:
    """
    Fetch the image name from the node.
    This function assumes that the node has an 'image' attribute.
    """
    return node.runtime  # Assuming runtime contains the image name for simplicity

if __name__ == "__main__":
    # Example usage
    env_vars = {
        "ENV_VAR_1": "SUCCESS",
        "ENV_VAR_2": "SUCCESS",
        "ENV_VAR_3": "SUCCESS",
        "ENV_VAR_4": "SUCCESS"
    }
    image_name = "test_image:latest"
    
    inject_vars_to_image(env_vars, image_name)
    print("Environment variables injected successfully.")