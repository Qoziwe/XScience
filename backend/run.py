#!/usr/bin/env python3
"""Запуск dev-сервера на порту 5000 (на него проксирует frontend/vite.config.ts)."""
from app import create_app
from app.config import Config

app = create_app()

if __name__ == '__main__':
    # use_reloader=False — иначе фоновый поток передачи отчётов удваивается.
    app.run(host='127.0.0.1', port=Config.PORT, debug=not Config.PRODUCTION,
            use_reloader=False)
