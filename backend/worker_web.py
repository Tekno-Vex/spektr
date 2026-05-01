"""
Entrypoint for the Render free Web Service acting as a Celery worker.

Render requires at least one open port or it kills the process. This script
runs a minimal HTTP server in a background thread (just to satisfy Render's
port scanner) while the Celery worker runs in the main thread.
"""

import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from app.services.celery_app import celery_app  # noqa: F401  (registers tasks)
import app.tasks  # noqa: F401  (ensures task is discovered)


PORT = int(os.getenv("PORT", "10000"))


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, format, *args):  # suppress access logs
        pass


def run_health_server():
    server = HTTPServer(("0.0.0.0", PORT), HealthHandler)
    server.serve_forever()


if __name__ == "__main__":
    # Start the health server in a daemon thread so it dies with the main process
    t = threading.Thread(target=run_health_server, daemon=True)
    t.start()

    # Run the Celery worker in the main thread (blocks forever)
    celery_app.worker_main(
        argv=["worker", "--loglevel=info", "--concurrency=2"]
    )
