# Opening Trainer

This project is a lightweight phone-friendly web app for practicing Queen's Pawn and King's Pawn openings from the PGN zip files in this workspace.

## What changed

- The opening files are now prebuilt into a static JSON database, so the app does not need to re-parse PGNs during play.
- The browser runs the practice session directly from the stored opening tree.
- The UI is designed for a fixed square board with built-in SVG chess pieces and installable PWA-style play on phones.
- Position Drill and Line Play now live in separate tabs, and drills reset the same position after a wrong move.
- The local Python server can expose live Stockfish evaluations while you practice.
- The deploy workflow now reuses cached opening data and only rebuilds it when the source ZIPs or build code actually change.

## Build the opening library

```bash
cd /Users/fandafiala/Documents/ChessOpeningsGame
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python opening_trainer.py build
```

This scans `QueensPawn/` and `KingsPawn/`, builds `static/data/library.json` and `static/data/database.json`, and writes one cached JSON book per opening into `static/data/books/`.

The `static/data/` folder is generated output and is excluded from git. The opening ZIP folders remain the source of truth in the repository, and the GitHub Pages workflow rebuilds the database during deploy.

## Run the app locally

```bash
./.venv/bin/python opening_trainer.py serve
```

Then open:

- `http://127.0.0.1:8000` on your computer
- `http://<your-computer-ip>:8000` on your phone if both devices are on the same Wi-Fi

If you have a compiled Stockfish binary, you can enable live evaluation in the practice UI:

```bash
./.venv/bin/python opening_trainer.py serve --engine /path/to/stockfish
```

You can also set `OPENING_TRAINER_ENGINE=/path/to/stockfish`. On this machine, the raw `Stockfish-master.zip` file is source code only, so it must be compiled into an executable before the live evaluation card can work.

## Deploy as a web app

After running the build step, the app is static. That means you can host the `static/` folder on any HTTPS static host and install it as a PWA.

The opening database is exposed as:

- `static/data/database.json` for the searchable catalog
- `static/data/books/*.json` for each opening book

For iPhone and iPad:

1. Open the hosted app in Safari.
2. Tap Share.
3. Choose Add to Home Screen.

Once an opening has been loaded, the service worker keeps it available offline for later practice.

## Deploy to GitHub Pages

This repo now includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

After you push the repository to GitHub:

1. Open the repository Settings page.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push to `main` or run the workflow manually.

The workflow installs Python dependencies, rebuilds the opening database, and publishes the `static/` folder as a website.

Once a successful build has seeded the opening-data cache, later UI-only pushes reuse the cached `static/data/` bundle instead of rebuilding every opening book from scratch.

## Push-ready repo layout

The repository is prepared to push with:

- `QueensPawn/` and `KingsPawn/` included as the source opening library
- `static/data/` excluded because it is generated during build/deploy
- `Stockfish-master.zip` and the local `.engine/` folder excluded because they are only for optional local Stockfish setup
