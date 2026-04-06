# Opening Trainer

This project is a lightweight phone-friendly web app for practicing Queen's Pawn and King's Pawn openings from the PGN zip files in this workspace.

## What changed

- The opening files are now prebuilt into a static JSON database, so the app does not need to re-parse PGNs during play.
- The browser runs the practice session directly from the stored opening tree.
- The UI is designed for a fixed square board with built-in SVG chess pieces and installable PWA-style play on phones.

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

## Push-ready repo layout

The repository is prepared to push with:

- `QueensPawn/` and `KingsPawn/` included as the source opening library
- `static/data/` excluded because it is generated during build/deploy
- `Stockfish-master.zip` excluded because the current web app does not use it
