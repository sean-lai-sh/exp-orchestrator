"""
Backend orchestration package.

This package provides modules to fetch and ingest workflows, compute node signatures, plan grouping of nodes,
generate container specifications, build and push Docker containers, and update a registry database.
"""

__all__ = [
    'fetcher',
    'signature',
    'planner',
    'docker_utils',
    'registry',
    'workflowprocessor',
]
