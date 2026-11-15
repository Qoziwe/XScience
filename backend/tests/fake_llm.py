"""
A local HTTP server impersonating a model provider.
Needed so tests exercise the real adapters and real HTTP, but without the
network or real keys.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class FakeLlm:
    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.reply: str = '{}'
        self.status: int = 200
        self.raw: str | None = None
        self._srv = HTTPServer(('127.0.0.1', 0), self._handler())
        self._thread = threading.Thread(target=self._srv.serve_forever, daemon=True)
        self._thread.start()

    @property
    def base_url(self) -> str:
        host, port = self._srv.server_address[:2]
        return f'http://{host}:{port}'

    def stop(self) -> None:
        self._srv.shutdown()
        self._srv.server_close()

    def _body(self, path: str) -> str:
        if self.raw is not None:
            return self.raw
        if path.endswith('/chat/completions'):
            return json.dumps({'choices': [{'message': {'content': self.reply}}]})
        if path.endswith('/v1/messages'):
            return json.dumps({'content': [{'type': 'text', 'text': self.reply}],
                               'stop_reason': 'end_turn'})
        if ':generateContent' in path:
            return json.dumps({'candidates': [
                {'content': {'parts': [{'text': self.reply}]}, 'finishReason': 'STOP'}]})
        return json.dumps({'error': 'unknown path'})

    def _handler(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                length = int(self.headers.get('Content-Length') or 0)
                raw = self.rfile.read(length).decode('utf-8')
                server.requests.append({
                    'path': self.path,
                    # urllib changes the case of header names — normalize to lowercase.
                    'headers': {k.lower(): v for k, v in self.headers.items()},
                    'body': json.loads(raw) if raw else {},
                })
                payload = server._body(self.path).encode('utf-8')
                self.send_response(server.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_args):  # keep test output quiet
                pass

        return Handler
