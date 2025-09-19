import subprocess
import os
from workflow_types import Node
import deque


def process_workflow(adjacency_list):
    for edge in adjacency_list:
        src = edge['source']
        dst = edge['target']
        edge_stream_type = edge['data']
        # check that stream type is in the src out streams
        if edge_stream_type not in src['out_streams']:
            raise ValueError(f"Stream type {edge_stream_type} not found in source {src['id']} out streams")
        
        # check that stream type is in the dst in streams
        if edge_stream_type not in dst['in_streams']:
            raise ValueError(f"Stream type {edge_stream_type} not found in destination {dst['id']} in streams")
        
        creds = generate_pub_sub_cred(edge_stream_type, src, dst)
        src['out_creds'][edge_stream_type] = creds
        dst['in_creds'][edge_stream_type] = creds

    return 200

def queue_deployments(node_list, deployment_queue: deque):
    for node in node_list:
        if node['type'] == 'plugin':
            deployment_queue.append(node)

        else:
            continue
    return 200

def assign_deployment():
    ## 1. Query relevant nodes in kubernetes
    ## 2. Identify rel to latency and usage in region, which existing (or new) corelink server node to host experiment
    ## 3. Assign deployment to node, fetching either a deployment queue api or deploy node b4 fetching
    ## return a queue that can help.
    pass

def generate_pub_sub_cred(stream_type, src, dst): ## To be impl
    """
    
    Output
        Workspace : str
        Protocol : str 
        StreamID : str
        data_type : str
        metadata : str
    """
    cred = {
        "workspace": f"{src['id']}_{dst['id']}_{stream_type}_workspace",
        "protocol": "pubsub",
        "stream_id": f"{src['id']}_{dst['id']}_{stream_type}_stream",
        "data_type": stream_type,
        "metadata": {} #TODO: Depending on Node impl we are to use the src descript of the source to inform stuff.
    }
    return cred

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
    image_name = Node(
        id="test",
        type="plugin",
        deps=["example-dependency"],
        runtime="test_image:latest",
        needs_gpu=False,
    )
    
    inject_vars_to_image(env_vars, image_name)
    print("Environment variables injected successfully.")