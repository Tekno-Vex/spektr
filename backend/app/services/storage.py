import os

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "analyses")


def upload_file(path: str, data: bytes, mime_type: str) -> str:
    """Upload bytes to Supabase Storage via REST API and return the storage path."""
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": mime_type,
    }
    response = httpx.post(url, content=data, headers=headers)
    response.raise_for_status()
    return path
