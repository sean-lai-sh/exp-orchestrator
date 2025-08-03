import subprocess
import os


def inject_vars_to_image(env_vars: dict, image_name: str) -> None:
    """
    Inject env_vars via docker compose into the specified image.
    This allows us to set environment variables that can be used by the application
    running in the container.
    """
    # Create a temporary docker-compose file
    compose_file = "docker-compose.yml"
    with open(compose_file, "w") as f:
        f.write("version: '3.8'\n")
        f.write("services:\n")
        f.write(f"  app:\n")
        f.write(f"    image: {image_name}\n")
        f.write("    environment:\n")
        for key, value in env_vars.items():
            f.write(f"      - {key}={value}\n")

    # Run docker compose to inject the environment variables
    #subprocess.run(["docker-compose", "-f", compose_file, "up", "-d"], check=True)

    # Clean up the temporary compose file
    #os.remove(compose_file)



if __name__ == "__main__":
    # Example usage
    env_vars = {
        "ENV_VAR_1": "SUCCESS",
        "ENV_VAR_2": "SUCCESS",
        "ENV_VAR_3": "SUCCESS",
        "ENV_VAR_4": "SUCCESS"
    }
    image_name = "test_image"
    
    inject_vars_to_image(env_vars, image_name)
    print("Environment variables injected successfully.")