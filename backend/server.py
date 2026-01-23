"""
Lightweight server for Rehab CV Coach.
Serves the built React frontend without the CV components.
The frontend handles all computer vision in the browser.
"""
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Rehab CV Coach")

# CORS (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files directory
STATIC_DIR = Path(__file__).parent / "static"
_index_html = STATIC_DIR / "index.html"
_assets_dir = STATIC_DIR / "assets"

# Health check
@app.get("/api/health")
def health():
    return {"status": "ok", "frontend_built": _index_html.exists()}

# Root route
@app.get("/")
async def serve_root():
    if _index_html.exists():
        return FileResponse(_index_html)
    return {"message": "Rehab CV Coach API. Frontend not built - run 'npm run build' first."}

# Mount assets if they exist
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

# SPA catch-all
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Skip API paths
    if full_path.startswith("api/"):
        return {"error": "Not found"}
    
    # Serve file if it exists
    file_path = STATIC_DIR / full_path
    if file_path.is_file():
        return FileResponse(file_path)
    
    # SPA fallback
    if _index_html.exists():
        return FileResponse(_index_html)
    
    return {"error": "Frontend not built"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
