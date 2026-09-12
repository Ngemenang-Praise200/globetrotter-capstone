"""Start all Phase 2 services locally, then serve GlobeTrotter at http://127.0.0.1:5050/.

On a hosting platform (Render, Railway, etc.), the platform assigns the
public port via the PORT environment variable and only the gateway needs
to bind to it — the other services stay on their fixed internal ports
(5001-5005) since the gateway reaches them over localhost either way.
"""
import os
import subprocess
import sys
from pathlib import Path

PHASE2 = Path(__file__).resolve().parent
SERVICE_SCRIPTS = [
    PHASE2 / "user_service" / "app.py",
    PHASE2 / "destination_service" / "app.py",
    PHASE2 / "itinerary_service" / "app.py",
    PHASE2 / "recommendation_service" / "app.py",
    PHASE2 / "assistant_service" / "app.py",
    PHASE2 / "chat_service" / "app.py",
]

processes = []
try:
    for script in SERVICE_SCRIPTS:
        processes.append(subprocess.Popen([sys.executable, str(script)], cwd=PHASE2.parent))
    from gateway import app
    port = int(os.environ.get("PORT", 5050))
    print(f"\nGlobeTrotter Phase 2 is ready at http://127.0.0.1:{port}/\n")
    app.run(host="0.0.0.0", port=port, debug=False)
finally:
    for process in processes:
        process.terminate()
    for process in processes:
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
