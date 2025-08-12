from typing import Dict
from workflow_types import Workflow
import psycopg2
import os

def update_registry(spec: Dict) -> None:
    """
    Insert or update container metadata in registry database.
    """
    # Read database URL from env var
    db_url = os.getenv("REGISTRY_DB_URL")
    if not db_url:
        raise EnvironmentError("REGISTRY_DB_URL not set")
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO containers (signature, node_ids, image_name)
                VALUES (%s, %s, %s)
                ON CONFLICT (signature) DO UPDATE SET
                  node_ids = EXCLUDED.node_ids,
                  image_name = EXCLUDED.image_name;
                """,
                (spec["signature"], spec["node_ids"], spec["image_name"]),
            )
            conn.commit()
    finally:
        conn.close()
