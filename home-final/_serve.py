#!/usr/bin/env python3
"""The draft's local server, with byte ranges.

python -m http.server answers every request with the whole file and no
Accept-Ranges, and a browser that cannot ask for a byte range cannot seek a
video: Chrome reports seekable as [0, 0] and every write to currentTime is
silently dropped. The scrubbed system section is nothing but writes to
currentTime, so it looks broken locally and works in production, which is the
worst way round. This serves the same tree with Range support so the local page
behaves the way the hosted one will.

    python3 home-final/_serve.py [port]

Root is the repo folder above home-final, matching the URLs the validator uses.
"""
import functools
import http.server
import os
import pathlib
import re
import socketserver
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RANGE = re.compile(r"bytes=(\d*)-(\d*)")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        header = self.headers.get("Range")
        if not header:
            return super().send_head()
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        m = RANGE.fullmatch(header.strip())
        if not m:
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404)
            return None
        size = os.fstat(f.fileno()).st_size
        first, last = m.group(1), m.group(2)
        if first == "":
            # a suffix range: the last N bytes
            start, end = max(0, size - int(last or 0)), size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        # the caller copies from here to the socket, so hand it a reader that
        # stops at the end of the range rather than at the end of the file
        return _Window(f, end - start + 1)

    def log_message(self, *a):
        pass


class _Window:
    """A read only view of the open file, bounded to the requested range."""

    def __init__(self, f, left):
        self.f, self.left = f, left

    def read(self, n=-1):
        if self.left <= 0:
            return b""
        if n is None or n < 0:
            n = self.left
        chunk = self.f.read(min(n, self.left))
        self.left -= len(chunk)
        return chunk

    def close(self):
        self.f.close()


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8199
    handler = functools.partial(Handler, directory=str(ROOT))
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"serving {ROOT} on http://localhost:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
