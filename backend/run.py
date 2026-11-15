#!/usr/bin/env python3
"""Runs the dev server on port 5000 (proxied to by frontend/vite.config.ts)."""
from app import create_app
from app.config import Config

app = create_app()

if __name__ == '__main__':
    # use_reloader=False — otherwise the background report-transmission thread doubles up.
    app.run(host='127.0.0.1', port=Config.PORT, debug=not Config.PRODUCTION,
            use_reloader=False)
