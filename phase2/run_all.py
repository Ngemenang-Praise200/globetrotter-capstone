"""Start all Phase 2 services locally, then serve GlobeTrotter at http://127.0.0.1:5050/."""
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
]

processes = []
try:
    for script in SERVICE_SCRIPTS:
        processes.append(subprocess.Popen([sys.executable, str(script)], cwd=PHASE2.parent))
    from gateway import app
    print("\nGlobeTrotter Phase 2 is ready at http://127.0.0.1:5050/\n")
    app.run(port=5050, debug=False)
finally:
    for process in processes:
        process.terminate()
    for process in processes:
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
