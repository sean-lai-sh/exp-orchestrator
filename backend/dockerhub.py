"""Docker Hub search proxy.

Proxies requests to the public Docker Hub v2 API, avoiding CORS issues from
the browser, and annotates each result with its allowlist approval status so
the frontend can show an approval badge without a separate round-trip.
"""

from __future__ import annotations

import httpx

from allowlist import is_approved

DOCKERHUB_SEARCH_URL = "https://hub.docker.com/v2/search/repositories/"
DOCKERHUB_TAGS_URL = "https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags/"

# Reasonable timeout for Docker Hub API calls (seconds)
_TIMEOUT = 10.0


async def search_images(query: str, page: int = 1, page_size: int = 20) -> dict:
    """Search Docker Hub and annotate results with allowlist approval status.

    Parameters
    ----------
    query:
        Free-text search term forwarded to Docker Hub.
    page:
        1-based page number.
    page_size:
        Number of results per page (max 100 per Docker Hub limits).

    Returns
    -------
    dict
        Raw Docker Hub search response with an extra ``approved`` boolean
        field injected into every result entry.
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            DOCKERHUB_SEARCH_URL,
            params={"query": query, "page": page, "page_size": page_size},
        )
        resp.raise_for_status()
        data = resp.json()

    for result in data.get("results", []):
        repo_name: str = result.get("repo_name", "")
        # Docker Hub returns bare names ("nginx") or "library/nginx" for official images.
        # Normalize to the form used in the allowlist ("nginx:latest").
        normalized = repo_name.removeprefix("library/")
        if ":" not in normalized:
            normalized = f"{normalized}:latest"
        result["approved"] = is_approved(normalized)

    return data


async def get_image_tags(namespace: str, repo: str, page: int = 1) -> dict:
    """Return paginated tags for a Docker Hub image.

    Parameters
    ----------
    namespace:
        Docker Hub namespace (e.g. ``library`` for official images, or a
        username/org).
    repo:
        Repository name within the namespace.
    page:
        1-based page number.

    Returns
    -------
    dict
        Raw Docker Hub tags response.
    """
    url = DOCKERHUB_TAGS_URL.format(namespace=namespace, repo=repo)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params={"page": page, "page_size": 25})
        resp.raise_for_status()
        return resp.json()
