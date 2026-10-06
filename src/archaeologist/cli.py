"""Local server entry point."""

from __future__ import annotations

import argparse
import webbrowser

import uvicorn

from archaeologist.api.app import create_app
from archaeologist.db.connection import data_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Minecraft World Archaeologist")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    print(f"Data directory: {data_dir()}")
    if not args.no_browser:
        webbrowser.open(f"http://{args.host}:{args.port}")
    uvicorn.run(create_app(), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
