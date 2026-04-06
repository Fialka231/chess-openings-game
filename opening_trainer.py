from __future__ import annotations

import argparse
import io
import json
import re
import socket
import zlib
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from itertools import chain
from pathlib import Path
from typing import Any

import chess
import chess.pgn


DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000
MAX_BOOK_PLY = 20
PROJECT_ROOT = Path(__file__).resolve().parent
STATIC_ROOT = PROJECT_ROOT / "static"
DATA_ROOT = STATIC_ROOT / "data"
BOOKS_ROOT = DATA_ROOT / "books"
ICONS_ROOT = STATIC_ROOT / "icons"


class SilentGameBuilder(chess.pgn.GameBuilder):
    def handle_error(self, error: Exception) -> None:
        return


@dataclass
class TreeNode:
    san: str
    uci: str
    ply: int
    count: int = 0
    children: dict[str, "TreeNode"] = field(default_factory=dict)

    def sorted_children(self) -> list["TreeNode"]:
        return sorted(self.children.values(), key=lambda child: (-child.count, child.san))


@dataclass
class OpeningSource:
    opening_id: str
    file_path: Path
    relative_path: str
    filename: str
    display_name: str
    category: str
    size_bytes: int


@dataclass
class OpeningBook:
    source: OpeningSource
    root: TreeNode
    game_count: int
    skipped_nonstandard: int
    node_count: int
    unique_lines: int
    signature: str


def friendly_opening_name(name: str) -> str:
    cleaned = name.replace("_", " ")
    cleaned = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", cleaned)
    cleaned = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", cleaned)
    cleaned = re.sub(r"(?<=[A-Z])(?=[0-9])", " ", cleaned)
    cleaned = re.sub(r"(?<=[a-z])(?=[0-9]+[A-Z])", " ", cleaned)
    cleaned = re.sub(r"(?<=[0-9])(?=[A-Z])", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or name


def slugify(value: str) -> str:
    value = value.lower().replace(".zip", "")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "opening"


def move_label(ply: int, san: str) -> str:
    move_number = (ply + 1) // 2
    if ply % 2 == 1:
        return f"{move_number}. {san}"
    return f"{move_number}... {san}"


def side_to_move_from_ply(ply: int) -> str:
    return "white" if ply % 2 == 0 else "black"


def count_lines(node: TreeNode, max_ply: int) -> int:
    visible_children = [child for child in node.sorted_children() if child.ply <= max_ply]
    if not visible_children:
        return 1 if node.ply else 0
    return sum(count_lines(child, max_ply) for child in visible_children)


def compact_tree(node: TreeNode) -> dict[str, Any]:
    return {
        "s": node.san,
        "u": node.uci,
        "c": node.count,
        "n": [compact_tree(child) for child in node.sorted_children()],
    }


def expand_tree(payload: dict[str, Any], ply: int = 0) -> TreeNode:
    node = TreeNode(
        san=payload["s"],
        uci=payload["u"],
        ply=payload.get("p", ply),
        count=payload["c"],
    )
    for child_payload in payload.get("n", []):
        child = expand_tree(child_payload, ply=node.ply + 1)
        node.children[child.uci] = child
    return node


def serialise_tree(node: TreeNode, max_ply: int) -> dict[str, Any]:
    visible_children = [child for child in node.sorted_children() if child.ply <= max_ply]
    return {
        "san": node.san,
        "uci": node.uci,
        "ply": node.ply,
        "count": node.count,
        "label": move_label(node.ply, node.san),
        "children": [serialise_tree(child, max_ply) for child in visible_children],
    }


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def local_ip(host: str) -> str:
    if host not in {"0.0.0.0", "::"}:
        return host
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def png_chunk(tag: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(tag + payload) & 0xFFFFFFFF
    return len(payload).to_bytes(4, "big") + tag + payload + checksum.to_bytes(4, "big")


def make_icon_pixels(size: int) -> list[list[tuple[int, int, int, int]]]:
    background = (232, 223, 200, 255)
    shell = (46, 61, 49, 255)
    accent = (198, 120, 69, 255)
    board_light = (242, 236, 224, 255)
    board_dark = (116, 83, 61, 255)
    piece_light = (250, 246, 238, 255)
    piece_dark = (57, 41, 31, 255)

    pixels = [[background for _ in range(size)] for _ in range(size)]

    def inside_round_rect(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
        if left + radius <= x < right - radius or top + radius <= y < bottom - radius:
            return left <= x < right and top <= y < bottom
        corners = (
            (left + radius, top + radius),
            (right - radius - 1, top + radius),
            (left + radius, bottom - radius - 1),
            (right - radius - 1, bottom - radius - 1),
        )
        for cx, cy in corners:
            if (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius:
                return True
        return False

    def fill_round_rect(left: int, top: int, right: int, bottom: int, radius: int, color: tuple[int, int, int, int]) -> None:
        for y in range(top, bottom):
            for x in range(left, right):
                if inside_round_rect(x, y, left, top, right, bottom, radius):
                    pixels[y][x] = color

    def fill_circle(cx: int, cy: int, radius: int, color: tuple[int, int, int, int]) -> None:
        radius_sq = radius * radius
        for y in range(max(0, cy - radius), min(size, cy + radius + 1)):
            for x in range(max(0, cx - radius), min(size, cx + radius + 1)):
                if (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius_sq:
                    pixels[y][x] = color

    outer_margin = round(size * 0.08)
    fill_round_rect(
        outer_margin,
        outer_margin,
        size - outer_margin,
        size - outer_margin,
        round(size * 0.18),
        shell,
    )

    board_size = round(size * 0.54)
    board_left = round(size * 0.16)
    board_top = round(size * 0.18)
    cell = board_size // 4
    for row in range(4):
        for col in range(4):
            color = board_light if (row + col) % 2 == 0 else board_dark
            top = board_top + row * cell
            left = board_left + col * cell
            fill_round_rect(left, top, left + cell, top + cell, round(cell * 0.12), color)

    pawn_x = round(size * 0.7)
    pawn_y = round(size * 0.63)
    fill_circle(pawn_x, pawn_y - round(size * 0.12), round(size * 0.065), piece_light)
    fill_round_rect(
        pawn_x - round(size * 0.095),
        pawn_y - round(size * 0.03),
        pawn_x + round(size * 0.095),
        pawn_y + round(size * 0.1),
        round(size * 0.04),
        piece_light,
    )
    fill_round_rect(
        pawn_x - round(size * 0.12),
        pawn_y + round(size * 0.09),
        pawn_x + round(size * 0.12),
        pawn_y + round(size * 0.14),
        round(size * 0.03),
        accent,
    )
    fill_circle(pawn_x, pawn_y - round(size * 0.12), round(size * 0.03), piece_dark)
    return pixels


def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(pixels)
    width = len(pixels[0]) if pixels else 0
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for red, green, blue, alpha in row:
            raw.extend((red, green, blue, alpha))

    ihdr = (
        width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + bytes([8, 6, 0, 0, 0])
    )
    image_data = zlib.compress(bytes(raw), level=9)
    png = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", ihdr),
            png_chunk(b"IDAT", image_data),
            png_chunk(b"IEND", b""),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def ensure_icon_assets() -> None:
    ICONS_ROOT.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        path = ICONS_ROOT / f"icon-{size}.png"
        if not path.exists():
            write_png(path, make_icon_pixels(size))


class OpeningTrainerState:
    def __init__(self, project_root: Path, cache_root: Path | None = None) -> None:
        self.project_root = project_root
        self.cache_root = cache_root or DATA_ROOT
        self.books_root = self.cache_root / "books"
        self.sources = self._discover_sources()
        self.books: dict[str, OpeningBook] = {}

    def _discover_sources(self) -> dict[str, OpeningSource]:
        sources: dict[str, OpeningSource] = {}
        used_ids: set[str] = set()
        for file_path in sorted(self.project_root.rglob("*.zip")):
            if not file_path.is_file():
                continue
            if file_path.name.lower().startswith("stockfish"):
                continue
            relative_path = file_path.relative_to(self.project_root)
            base_id = slugify(str(relative_path.with_suffix("")))
            opening_id = base_id
            suffix = 2
            while opening_id in used_ids:
                opening_id = f"{base_id}-{suffix}"
                suffix += 1
            used_ids.add(opening_id)
            category = (
                friendly_opening_name(relative_path.parent.name)
                if relative_path.parent != Path(".")
                else "Misc"
            )
            sources[opening_id] = OpeningSource(
                opening_id=opening_id,
                file_path=file_path,
                relative_path=str(relative_path),
                filename=file_path.name,
                display_name=friendly_opening_name(file_path.stem),
                category=category,
                size_bytes=file_path.stat().st_size,
            )
        return sources

    def _source_signature(self, source: OpeningSource) -> str:
        stat = source.file_path.stat()
        return f"{stat.st_size}-{stat.st_mtime_ns}"

    def _book_cache_path(self, opening_id: str) -> Path:
        return self.books_root / f"{opening_id}.json"

    def _manifest_path(self, output_root: Path | None = None) -> Path:
        root = output_root or self.cache_root
        return root / "library.json"

    def _database_manifest_path(self, output_root: Path | None = None) -> Path:
        root = output_root or self.cache_root
        return root / "database.json"

    def list_openings(self) -> list[dict[str, Any]]:
        openings = [self._source_summary(source) for source in self.sources.values()]
        openings.sort(key=lambda item: (item["category"].lower(), item["name"].lower()))
        return openings

    def _source_summary(self, source: OpeningSource) -> dict[str, Any]:
        return {
            "id": source.opening_id,
            "name": source.display_name,
            "category": source.category,
            "fileName": source.filename,
            "relativePath": source.relative_path,
            "sizeMb": round(source.size_bytes / (1024 * 1024), 2),
            "bookUrl": f"data/books/{source.opening_id}.json",
        }

    def get_source(self, opening_id: str) -> OpeningSource:
        try:
            return self.sources[opening_id]
        except KeyError as error:
            raise KeyError(f"Unknown opening '{opening_id}'.") from error

    def get_book(self, opening_id: str, force: bool = False) -> OpeningBook:
        if not force and opening_id in self.books:
            return self.books[opening_id]

        source = self.get_source(opening_id)
        book = None if force else self._load_cached_book(source)
        if book is None:
            book = self._build_book(source)
            self._write_book_cache(book)
        self.books[opening_id] = book
        return book

    def _load_cached_book(self, source: OpeningSource) -> OpeningBook | None:
        path = self._book_cache_path(source.opening_id)
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("signature") != self._source_signature(source):
            return None
        book = self._book_from_payload(source, payload)
        if payload.get("formatVersion") != 2:
            self._write_book_cache(book)
        return book

    def _write_book_cache(self, book: OpeningBook) -> None:
        payload = self._book_payload(book)
        path = self._book_cache_path(book.source.opening_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(".json.tmp")
        temp_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        temp_path.replace(path)

    def _build_book(self, source: OpeningSource) -> OpeningBook:
        pgn_text = self._read_pgn_text(source.file_path)
        stream = io.StringIO(pgn_text)

        root = TreeNode(san="", uci="", ply=0)
        game_count = 0
        skipped_nonstandard = 0
        node_count = 0

        while True:
            game = chess.pgn.read_game(stream, Visitor=SilentGameBuilder)
            if game is None:
                break

            board = game.board()
            if board.fen() != chess.STARTING_FEN:
                skipped_nonstandard += 1
                continue

            mainline = iter(game.mainline_moves())
            first_move = next(mainline, None)
            if first_move is None:
                continue

            game_count += 1
            node = root
            ply = 0

            for move in chain([first_move], mainline):
                if ply >= MAX_BOOK_PLY:
                    break
                san = board.san(move)
                board.push(move)
                ply += 1
                child = node.children.get(move.uci())
                if child is None:
                    child = TreeNode(
                        san=san,
                        uci=move.uci(),
                        ply=ply,
                    )
                    node.children[move.uci()] = child
                    node_count += 1
                child.count += 1
                node = child

        return OpeningBook(
            source=source,
            root=root,
            game_count=game_count,
            skipped_nonstandard=skipped_nonstandard,
            node_count=node_count,
            unique_lines=count_lines(root, MAX_BOOK_PLY),
            signature=self._source_signature(source),
        )

    @staticmethod
    def _read_pgn_text(file_path: Path) -> str:
        with zipfile.ZipFile(file_path) as archive:
            pgn_names = [name for name in archive.namelist() if name.lower().endswith(".pgn")]
            if not pgn_names:
                raise ValueError(f"No PGN file found inside {file_path.name}.")
            return archive.read(pgn_names[0]).decode("utf-8", errors="replace").lstrip("\ufeff")

    def opening_detail(self, opening_id: str, preview_depth: int) -> dict[str, Any]:
        book = self.get_book(opening_id)
        root_children = [child for child in book.root.sorted_children() if child.ply <= preview_depth]
        return {
            "id": book.source.opening_id,
            "name": book.source.display_name,
            "category": book.source.category,
            "fileName": book.source.filename,
            "relativePath": book.source.relative_path,
            "stats": {
                "games": book.game_count,
                "uniqueLines": count_lines(book.root, preview_depth),
                "nodes": book.node_count,
                "previewDepth": preview_depth,
                "skippedNonstandard": book.skipped_nonstandard,
                "rootChoices": len(book.root.children),
            },
            "firstMoves": [
                {
                    "san": child.san,
                    "count": child.count,
                    "label": move_label(child.ply, child.san),
                }
                for child in root_children
            ],
            "tree": [serialise_tree(child, preview_depth) for child in root_children],
        }

    def _book_payload(self, book: OpeningBook) -> dict[str, Any]:
        return {
            "formatVersion": 2,
            "id": book.source.opening_id,
            "name": book.source.display_name,
            "category": book.source.category,
            "fileName": book.source.filename,
            "relativePath": book.source.relative_path,
            "sizeMb": round(book.source.size_bytes / (1024 * 1024), 2),
            "bookUrl": f"data/books/{book.source.opening_id}.json",
            "signature": book.signature,
            "stats": {
                "games": book.game_count,
                "uniqueLines": book.unique_lines,
                "nodes": book.node_count,
                "previewDepth": MAX_BOOK_PLY,
                "skippedNonstandard": book.skipped_nonstandard,
                "rootChoices": len(book.root.children),
            },
            "root": compact_tree(book.root),
        }

    def _book_from_payload(self, source: OpeningSource, payload: dict[str, Any]) -> OpeningBook:
        stats = payload["stats"]
        return OpeningBook(
            source=source,
            root=expand_tree(payload["root"]),
            game_count=stats["games"],
            skipped_nonstandard=stats["skippedNonstandard"],
            node_count=stats["nodes"],
            unique_lines=stats["uniqueLines"],
            signature=payload["signature"],
        )

    def _manifest_entry(self, book: OpeningBook) -> dict[str, Any]:
        payload = self._book_payload(book)
        payload.pop("root", None)
        return payload

    def build_static_library(
        self,
        force: bool = False,
        opening_ids: list[str] | None = None,
        output_root: Path | None = None,
        verbose: bool = False,
        write_icons: bool = True,
    ) -> dict[str, Any]:
        selected_sources = (
            [self.get_source(opening_id) for opening_id in opening_ids]
            if opening_ids
            else list(self.sources.values())
        )
        selected_sources.sort(key=lambda source: (source.category.lower(), source.display_name.lower()))

        manifest_openings: list[dict[str, Any]] = []
        for index, source in enumerate(selected_sources, start=1):
            if verbose:
                print(f"[{index}/{len(selected_sources)}] {source.category} / {source.display_name}")
            book = self.get_book(source.opening_id, force=force)
            manifest_openings.append(self._manifest_entry(book))
            self.books.pop(source.opening_id, None)

        if write_icons and output_root in {None, self.cache_root}:
            ensure_icon_assets()

        manifest = {
            "formatVersion": 2,
            "builtAt": utc_timestamp(),
            "maxBookPly": MAX_BOOK_PLY,
            "startFen": chess.STARTING_FEN,
            "openings": manifest_openings,
        }
        manifest_path = self._manifest_path(output_root)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_text = json.dumps(manifest, separators=(",", ":"))
        manifest_path.write_text(manifest_text, encoding="utf-8")
        self._database_manifest_path(output_root).write_text(manifest_text, encoding="utf-8")
        return manifest


class StaticAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STATIC_ROOT), **kwargs)

    def do_GET(self) -> None:
        if self.path in {"", "/"}:
            self.path = "/index.html"
        return super().do_GET()


def serve_static_app(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), StaticAppHandler)
    print(f"Opening trainer running on http://127.0.0.1:{port}")
    print(f"Phone URL on the same Wi-Fi: http://{local_ip(host)}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chess opening trainer")
    subparsers = parser.add_subparsers(dest="command")

    build_parser = subparsers.add_parser("build", help="Prebuild static opening data.")
    build_parser.add_argument("--force", action="store_true", help="Rebuild every opening book.")

    serve_parser = subparsers.add_parser("serve", help="Build static data if needed and serve the app.")
    serve_parser.add_argument("--host", default=DEFAULT_HOST, help="Host to bind to.")
    serve_parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to bind to.")
    serve_parser.add_argument("--force", action="store_true", help="Rebuild every opening book before serving.")

    parser.set_defaults(command="serve")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    state = OpeningTrainerState(PROJECT_ROOT)

    if args.command == "build":
        print("Building static opening library...")
        manifest = state.build_static_library(force=args.force, verbose=True)
        print(f"Built {len(manifest['openings'])} opening books into {DATA_ROOT}")
        return

    print("Preparing static opening library...")
    manifest = state.build_static_library(force=args.force, verbose=True)
    print(f"Ready with {len(manifest['openings'])} opening books.")
    serve_static_app(args.host, args.port)


if __name__ == "__main__":
    main()
