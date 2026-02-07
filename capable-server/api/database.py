import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_supabase() -> Client:
    """Fresh client per request — avoids auth state pollution from shared instances."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_supabase_admin() -> Client:
    """Client using the service role key — bypasses RLS. Use only for trusted server-side operations."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
