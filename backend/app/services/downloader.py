import os
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "analyses")


def download_file(storage_path: str) -> bytes:
    """Download a file from Supabase Storage and return raw bytes."""
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{storage_path}"
    headers = {"Authorization": f"Bearer {SUPABASE_KEY}"}
    response = httpx.get(url, headers=headers)
    response.raise_for_status()
    return response.content