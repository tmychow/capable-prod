"""
Modal app that provides persistent file storage for experiment files.

Deploy:  modal deploy modal_storage.py
Volume:  capable-experiment-files

Endpoints (query param: path=<experiment_id>/<filename>):
  POST  /upload?path=...   — upload file (raw body)
  GET   /download?path=... — download file
"""

import os

from fastapi import Request
import modal

VOLUME_NAME = "capable-experiment-files"
SECRET_NAME = "capable-storage-auth"

app = modal.App("capable-file-storage")
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
secret = modal.Secret.from_name(SECRET_NAME)

image = modal.Image.debian_slim().pip_install("fastapi[standard]")


def verify_auth(request: Request):
    """Verify Bearer token matches MODAL_STORAGE_KEY secret."""
    from fastapi.responses import JSONResponse
    import hmac

    expected = os.environ.get("MODAL_STORAGE_KEY", "")
    auth = request.headers.get("authorization", "")

    if not auth.startswith("Bearer ") or not expected:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    token = auth[7:]
    if not hmac.compare_digest(token, expected):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    return None


@app.function(image=image, volumes={"/data": volume}, secrets=[secret])
@modal.fastapi_endpoint(method="POST", label="capable-file-storage-upload")
async def upload(path: str, request: Request):
    from pathlib import Path as P
    from fastapi.responses import JSONResponse

    auth_error = verify_auth(request)
    if auth_error:
        return auth_error

    body = await request.body()
    if not body:
        return JSONResponse({"error": "Empty body"}, status_code=400)

    dest = P("/data") / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    volume.commit()

    return {"ok": True, "path": path, "size": len(body)}


@app.function(image=image, volumes={"/data": volume}, secrets=[secret])
@modal.fastapi_endpoint(method="GET", label="capable-file-storage-download")
async def download(path: str, request: Request):
    from pathlib import Path as P
    from fastapi.responses import FileResponse, JSONResponse

    auth_error = verify_auth(request)
    if auth_error:
        return auth_error

    file_path = P("/data") / path
    if not file_path.exists():
        return JSONResponse({"error": "Not found"}, status_code=404)

    media_type = "application/octet-stream"
    if file_path.suffix in (".xlsx", ".xls"):
        media_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )
