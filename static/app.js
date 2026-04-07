const DATABASE_URLS = ["./data/database.json", "./data/library.json"];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_ART = {
  p: `
    <circle class="piece-core" cx="40" cy="20" r="9" />
    <path class="piece-core" d="M32 34c0-4 3-8 8-8s8 4 8 8v7c0 3 2 6 5 9H27c3-3 5-6 5-9z" />
    <rect class="piece-core" x="25" y="50" width="30" height="7" rx="3.5" />
    <rect class="piece-core" x="20" y="60" width="40" height="8" rx="4" />
  `,
  n: `
    <path class="piece-core" d="M55 18c-10 1-18 8-22 18l-7 6c-4 4-6 8-6 13v5h35c4-7 6-14 6-22 0-8-2-15-6-20z" />
    <path class="piece-cut" d="M32 44c6 0 12-2 18-7" />
    <circle class="piece-dot" cx="47" cy="29" r="2.3" />
    <rect class="piece-core" x="22" y="60" width="38" height="8" rx="4" />
  `,
  b: `
    <path class="piece-core" d="M40 14c6 0 10 4 10 10 0 4-2 7-5 9l5 8c3 4 5 8 5 13H25c0-5 2-9 5-13l5-8c-3-2-5-5-5-9 0-6 4-10 10-10z" />
    <path class="piece-cut" d="M46 22L35 38" />
    <circle class="piece-dot" cx="39" cy="24" r="1.8" />
    <rect class="piece-core" x="24" y="55" width="32" height="6" rx="3" />
    <rect class="piece-core" x="20" y="63" width="40" height="7" rx="3.5" />
  `,
  r: `
    <path class="piece-core" d="M23 18h8v8h5v-8h8v8h5v-8h8v11c0 4-2 7-5 9v16H28V38c-3-2-5-5-5-9V18z" />
    <rect class="piece-core" x="24" y="52" width="32" height="7" rx="3.5" />
    <rect class="piece-core" x="20" y="61" width="40" height="8" rx="4" />
  `,
  q: `
    <circle class="piece-core" cx="26" cy="20" r="4.5" />
    <circle class="piece-core" cx="40" cy="15.5" r="5" />
    <circle class="piece-core" cx="54" cy="20" r="4.5" />
    <path class="piece-core" d="M23 29l5 18h24l5-18-9 8-8-13-8 13-9-8z" />
    <rect class="piece-core" x="24" y="49" width="32" height="8" rx="4" />
    <rect class="piece-core" x="20" y="60" width="40" height="8" rx="4" />
  `,
  k: `
    <path class="piece-cut" d="M40 11v10" />
    <path class="piece-cut" d="M35 16h10" />
    <path class="piece-core" d="M30 28c0-6 4-10 10-10s10 4 10 10v10c0 3 2 6 5 10H25c3-4 5-7 5-10V28z" />
    <rect class="piece-core" x="24" y="50" width="32" height="8" rx="4" />
    <rect class="piece-core" x="20" y="61" width="40" height="8" rx="4" />
  `,
};
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const MAX_TREE_NODES = 240;
const PRACTICE_MODE_LABELS = {
  line: "Line Play",
  position: "Position Drill",
};

const state = {
  openings: [],
  databaseMeta: null,
  bookCache: new Map(),
  selectedOpeningId: null,
  selectedBook: null,
  session: null,
  selectedSquare: null,
  search: "",
  categoryFilter: "all",
  feedbackTone: "neutral",
  statusMessage: "Select an opening on the right, then start a practice session.",
  loadingDatabase: false,
  loadingBook: false,
  startingSession: false,
  offlineStatus: "Offline support is loading.",
};

const elements = {
  board: document.getElementById("board"),
  feedback: document.getElementById("feedback"),
  history: document.getElementById("history"),
  expectedMoves: document.getElementById("expected-moves"),
  openingList: document.getElementById("opening-list"),
  openingCount: document.getElementById("opening-count"),
  currentOpening: document.getElementById("current-opening"),
  currentMeta: document.getElementById("current-meta"),
  variationTitle: document.getElementById("variation-title"),
  variationStats: document.getElementById("variation-stats"),
  tree: document.getElementById("tree"),
  searchInput: document.getElementById("search-input"),
  modeSelect: document.getElementById("mode-select"),
  modeNote: document.getElementById("mode-note"),
  sideSelect: document.getElementById("side-select"),
  depthSelect: document.getElementById("depth-select"),
  startBtn: document.getElementById("start-btn"),
  resetBtn: document.getElementById("reset-btn"),
  turnPill: document.getElementById("turn-pill"),
  depthPill: document.getElementById("depth-pill"),
  categoryFilters: document.getElementById("category-filters"),
  offlineStatus: document.getElementById("offline-status"),
  databaseSummary: document.getElementById("database-summary"),
  databaseIndexLink: document.getElementById("database-index-link"),
  selectedBookLink: document.getElementById("selected-book-link"),
};

function currentPracticeMode() {
  return state.session?.mode || elements.modeSelect.value;
}

function practiceModeLabel(mode) {
  return PRACTICE_MODE_LABELS[mode] || PRACTICE_MODE_LABELS.line;
}

function capitalize(word) {
  return word ? `${word[0].toUpperCase()}${word.slice(1)}` : "";
}

function pieceSvg(piece) {
  const art = PIECE_ART[piece.toLowerCase()];
  if (!art) {
    return "";
  }
  return `<svg class="piece-svg" viewBox="0 0 80 80" aria-hidden="true" focusable="false">${art}</svg>`;
}

function currentBoardPieces() {
  return state.session?.board?.pieces || parseFenBoard(START_FEN);
}

function currentOpeningSummary() {
  if (state.session?.opening) {
    return state.session.opening;
  }
  if (state.selectedBook) {
    return state.selectedBook;
  }
  return state.openings.find((opening) => opening.id === state.selectedOpeningId) || null;
}

function parseFenBoard(placement) {
  const fenPlacement = placement.split(" ")[0];
  const squares = {};
  let rank = 8;
  let fileIndex = 0;

  for (const char of fenPlacement) {
    if (char === "/") {
      rank -= 1;
      fileIndex = 0;
      continue;
    }
    if (/\d/.test(char)) {
      fileIndex += Number(char);
      continue;
    }
    const square = `${FILES[fileIndex]}${rank}`;
    squares[square] = char;
    fileIndex += 1;
  }

  return squares;
}

function boardOrientation() {
  return state.session?.userColor === "black" ? "black" : "white";
}

function ranksForOrientation() {
  return boardOrientation() === "white"
    ? [8, 7, 6, 5, 4, 3, 2, 1]
    : [1, 2, 3, 4, 5, 6, 7, 8];
}

function filesForOrientation() {
  return boardOrientation() === "white" ? FILES : [...FILES].reverse();
}

function sideToMoveFromPly(ply) {
  return ply % 2 === 0 ? "white" : "black";
}

function squareFile(square) {
  return square[0];
}

function squareRank(square) {
  return Number(square[1]);
}

function fileNumber(file) {
  return FILES.indexOf(file);
}

function makeSquare(file, rank) {
  return `${file}${rank}`;
}

function cloneBoard(board) {
  return {
    pieces: { ...board.pieces },
    turn: board.turn,
    castling: {
      whiteKing: board.castling.whiteKing,
      whiteQueen: board.castling.whiteQueen,
      blackKing: board.castling.blackKing,
      blackQueen: board.castling.blackQueen,
    },
    enPassant: board.enPassant,
    lastMove: board.lastMove ? [...board.lastMove] : null,
  };
}

function createInitialBoard() {
  return {
    pieces: parseFenBoard(START_FEN),
    turn: "white",
    castling: {
      whiteKing: true,
      whiteQueen: true,
      blackKing: true,
      blackQueen: true,
    },
    enPassant: null,
    lastMove: null,
  };
}

function expandNode(node, ply = 0) {
  return {
    san: node.s,
    uci: node.u,
    ply,
    count: node.c,
    children: (node.n || []).map((child) => expandNode(child, ply + 1)),
  };
}

function expandBook(payload) {
  return {
    ...payload,
    root: expandNode(payload.root, 0),
  };
}

function categories() {
  return [...new Set(state.openings.map((opening) => opening.category))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function availableChildren(node, depthLimit) {
  if (!node || node.ply >= depthLimit) {
    return [];
  }
  return (node.children || []).filter((child) => child.ply <= depthLimit);
}

function getAllowedMoves() {
  return state.session?.allowedMoves || [];
}

function movesByFromSquare() {
  return getAllowedMoves().reduce((map, move) => {
    if (!map[move.from]) {
      map[move.from] = [];
    }
    map[move.from].push(move);
    return map;
  }, {});
}

function targetsForSelectedSquare() {
  if (!state.selectedSquare) {
    return [];
  }
  return movesByFromSquare()[state.selectedSquare] || [];
}

function weightedChoice(nodes, weightFor = (node) => node.count) {
  const total = nodes.reduce((sum, node) => sum + Math.max(1, Number(weightFor(node)) || 0), 0);
  let roll = Math.random() * total;
  for (const node of nodes) {
    roll -= Math.max(1, Number(weightFor(node)) || 0);
    if (roll <= 0) {
      return node;
    }
  }
  return nodes[nodes.length - 1];
}

function openingMove(node) {
  return {
    from: node.uci.slice(0, 2),
    to: node.uci.slice(2, 4),
    promotion: node.uci.slice(4) || null,
    san: node.san,
    label: `${Math.floor((node.ply + 1) / 2)}${node.ply % 2 === 1 ? "." : "..."} ${node.san}`,
    count: node.count,
  };
}

function formatStartingLine(path, maxPlies = 8) {
  if (!path.length) {
    return "the starting position";
  }

  const visibleMoves = path.slice(0, maxPlies);
  const segments = [];
  for (let index = 0; index < visibleMoves.length; index += 2) {
    const whiteMove = visibleMoves[index];
    const blackMove = visibleMoves[index + 1];
    const moveNumber = Math.floor((whiteMove.ply + 1) / 2);
    segments.push(`${moveNumber}. ${whiteMove.san}${blackMove ? ` ${blackMove.san}` : ""}`);
  }

  return `${segments.join(" ")}${path.length > maxPlies ? " ..." : ""}`;
}

function syncSessionDerived(session) {
  const children = availableChildren(session.currentNode, session.depthLimit);
  session.allowedMoves = children.map(openingMove);
  session.expectedMoves = children.map((child) => child.san);
  session.completed = session.completed || children.length === 0;
}

function removeCastlingRightsForSquare(castling, square) {
  if (square === "h1") {
    castling.whiteKing = false;
  }
  if (square === "a1") {
    castling.whiteQueen = false;
  }
  if (square === "h8") {
    castling.blackKing = false;
  }
  if (square === "a8") {
    castling.blackQueen = false;
  }
}

function applyUciMove(board, uci) {
  const next = cloneBoard(board);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.slice(4);
  const piece = next.pieces[from];
  if (!piece) {
    throw new Error(`Missing piece on ${from} for move ${uci}.`);
  }

  const movingWhite = piece === piece.toUpperCase();
  const isPawn = piece.toLowerCase() === "p";
  const isKing = piece.toLowerCase() === "k";
  const isRook = piece.toLowerCase() === "r";
  const fromFile = fileNumber(squareFile(from));
  const toFile = fileNumber(squareFile(to));
  const fromRank = squareRank(from);
  const toRank = squareRank(to);
  const captureSquare = next.enPassant;
  const targetPiece = next.pieces[to];

  if (isPawn && captureSquare === to && !targetPiece && fromFile !== toFile) {
    const capturedRank = movingWhite ? toRank - 1 : toRank + 1;
    delete next.pieces[makeSquare(squareFile(to), capturedRank)];
  }

  if (targetPiece) {
    removeCastlingRightsForSquare(next.castling, to);
  }

  delete next.pieces[from];
  removeCastlingRightsForSquare(next.castling, from);

  if (isKing) {
    if (movingWhite) {
      next.castling.whiteKing = false;
      next.castling.whiteQueen = false;
    } else {
      next.castling.blackKing = false;
      next.castling.blackQueen = false;
    }
  }

  let movedPiece = piece;
  if (promotion) {
    movedPiece = movingWhite ? promotion.toUpperCase() : promotion.toLowerCase();
  }

  next.pieces[to] = movedPiece;

  if (isKing && Math.abs(toFile - fromFile) === 2) {
    if (to === "g1") {
      next.pieces.f1 = next.pieces.h1;
      delete next.pieces.h1;
    } else if (to === "c1") {
      next.pieces.d1 = next.pieces.a1;
      delete next.pieces.a1;
    } else if (to === "g8") {
      next.pieces.f8 = next.pieces.h8;
      delete next.pieces.h8;
    } else if (to === "c8") {
      next.pieces.d8 = next.pieces.a8;
      delete next.pieces.a8;
    }
  }

  next.enPassant = null;
  if (isPawn && Math.abs(toRank - fromRank) === 2) {
    const middleRank = (toRank + fromRank) / 2;
    next.enPassant = makeSquare(squareFile(from), middleRank);
  }

  next.turn = next.turn === "white" ? "black" : "white";
  next.lastMove = [from, to];
  return next;
}

function applyChild(session, child, actor) {
  session.currentNode = child;
  session.board = applyUciMove(session.board, child.uci);
  session.history.push({
    ply: child.ply,
    san: child.san,
    uci: child.uci,
    moveLabel: openingMove(child).label,
    color: child.ply % 2 === 1 ? "white" : "black",
    actor,
  });
}

function advanceTrainer(session) {
  const replies = [];
  while (!session.completed && session.board.turn !== session.userColor) {
    const children = availableChildren(session.currentNode, session.depthLimit);
    if (!children.length) {
      session.completed = true;
      break;
    }
    const chosen = weightedChoice(children);
    applyChild(session, chosen, "trainer");
    replies.push(chosen.san);
  }
  syncSessionDerived(session);
  return replies;
}

function buildSession(book, userColor, depthLimit, mode) {
  return {
    opening: {
      id: book.id,
      name: book.name,
      category: book.category,
      fileName: book.fileName,
      relativePath: book.relativePath,
    },
    mode,
    userColor,
    depthLimit,
    currentNode: book.root,
    board: createInitialBoard(),
    history: [],
    allowedMoves: [],
    expectedMoves: [],
    completed: false,
    message: "",
  };
}

function applyStartingPath(session, path) {
  for (const node of path) {
    applyChild(session, node, "setup");
  }
}

function collectDrillCandidates(node, depthLimit, userColor, minimumPly, path = [], candidates = []) {
  const currentPath = node.ply ? [...path, node] : path;
  const children = availableChildren(node, depthLimit);

  if (
    node.ply >= minimumPly &&
    node.ply < depthLimit &&
    sideToMoveFromPly(node.ply) === userColor &&
    children.length
  ) {
    candidates.push({
      node,
      path: currentPath,
      weight: Math.max(
        1,
        node.count || children.reduce((sum, child) => sum + child.count, 0),
      ),
    });
  }

  for (const child of children) {
    collectDrillCandidates(child, depthLimit, userColor, minimumPly, currentPath, candidates);
  }

  return candidates;
}

function drillMinimumPlyOptions(userColor, depthLimit) {
  const preferred = userColor === "white" ? 4 : 5;
  const fallback = userColor === "white" ? 2 : 1;
  const maximumStart = Math.max(0, depthLimit - 1);
  const values = [Math.min(preferred, maximumStart), Math.min(fallback, maximumStart), 0];
  return [...new Set(values)].filter((value) => value >= 0).sort((a, b) => b - a);
}

function pickDrillCandidate(book, userColor, depthLimit) {
  for (const minimumPly of drillMinimumPlyOptions(userColor, depthLimit)) {
    const candidates = collectDrillCandidates(book.root, depthLimit, userColor, minimumPly);
    if (candidates.length) {
      return weightedChoice(candidates, (candidate) => candidate.weight);
    }
  }
  return null;
}

function createLineSession(book, userColor, depthLimit) {
  const session = buildSession(book, userColor, depthLimit, "line");

  const trainerMoves = advanceTrainer(session);
  if (session.completed) {
    session.message = "This stored branch is already complete at the selected depth.";
  } else if (trainerMoves.length) {
    session.message = `Trainer starts with ${trainerMoves.join(" ")}. Your move.`;
  } else {
    session.message = "Opening loaded. Play one of the highlighted book moves.";
  }
  return session;
}

function createPositionSession(book, userColor, depthLimit) {
  const session = buildSession(book, userColor, depthLimit, "position");
  const candidate = pickDrillCandidate(book, userColor, depthLimit);

  if (!candidate) {
    const fallback = createLineSession(book, userColor, depthLimit);
    fallback.mode = "position";
    fallback.message = `No deeper drill position was available at this depth, so training started from move 1. ${fallback.message}`;
    return fallback;
  }

  applyStartingPath(session, candidate.path);
  syncSessionDerived(session);

  if (session.completed || !session.allowedMoves.length) {
    session.completed = true;
    session.message = "This drill position is already complete at the selected depth.";
    return session;
  }

  session.message = `Position drill starts after ${formatStartingLine(candidate.path)}. Play the correct move for ${capitalize(userColor)}.`;
  return session;
}

function createSession(book, userColor, depthLimit, mode = "line") {
  return mode === "position"
    ? createPositionSession(book, userColor, depthLimit)
    : createLineSession(book, userColor, depthLimit);
}

function playMove(session, move) {
  if (session.completed) {
    session.message = session.mode === "position"
      ? "This drill is finished. Start a new drill to try another position."
      : "This line is finished. Reset to try another branch.";
    return { ok: false, session };
  }

  if (session.board.turn !== session.userColor) {
    session.message = "Wait for the trainer move to finish.";
    return { ok: false, session };
  }

  const children = availableChildren(session.currentNode, session.depthLimit);
  const selected = children.find((child) => child.uci === `${move.from}${move.to}${move.promotion || ""}`);
  if (!selected) {
    const expected = children.slice(0, 6).map((child) => child.san).join(", ");
    session.message = `That move is outside the selected opening here. Try one of: ${expected || "the highlighted moves"}.`;
    return { ok: false, session };
  }

  applyChild(session, selected, "you");
  const trainerMoves = advanceTrainer(session);
  if (session.completed) {
    session.message = session.mode === "position"
      ? "Correct. You reached the end of this drill branch."
      : "Correct. You reached the end of this stored opening branch.";
  } else if (trainerMoves.length) {
    session.message = `Correct. Trainer replies with ${trainerMoves.join(" ")}.`;
  } else {
    session.message = "Correct. Continue from the current position.";
  }
  syncSessionDerived(session);
  return { ok: true, session };
}

function pruneNode(node, maxPly) {
  if (node.ply && node.ply > maxPly) {
    return null;
  }
  return {
    ...node,
    children: (node.children || [])
      .map((child) => pruneNode(child, maxPly))
      .filter(Boolean),
  };
}

function renderBoard() {
  const squares = currentBoardPieces();
  const movable = new Set(getAllowedMoves().map((move) => move.from));
  const targets = new Set(targetsForSelectedSquare().map((move) => move.to));
  const lastMove = state.session?.board?.lastMove || [];
  const board = document.createDocumentFragment();

  if (state.selectedSquare && !movable.has(state.selectedSquare)) {
    state.selectedSquare = null;
  }

  elements.board.innerHTML = "";

  for (const rank of ranksForOrientation()) {
    for (const file of filesForOrientation()) {
      const squareName = `${file}${rank}`;
      const square = document.createElement("button");
      const isLight = (FILES.indexOf(file) + rank) % 2 === 0;
      square.className = `square ${isLight ? "light" : "dark"}`;
      square.dataset.square = squareName;
      square.type = "button";
      square.setAttribute("aria-label", `Square ${squareName}`);

      if (state.selectedSquare === squareName) {
        square.classList.add("selected");
      }
      if (movable.has(squareName)) {
        square.classList.add("movable");
      }
      if (targets.has(squareName)) {
        square.classList.add("target");
      }
      if (lastMove.includes(squareName)) {
        square.classList.add("last");
      }

      const piece = squares[squareName];
      if (piece) {
        square.classList.add("occupied");
        const pieceSpan = document.createElement("span");
        pieceSpan.className = `piece ${piece === piece.toUpperCase() ? "piece-white" : "piece-black"}`;
        pieceSpan.innerHTML = pieceSvg(piece);
        square.appendChild(pieceSpan);
      }

      board.appendChild(square);
    }
  }

  elements.board.appendChild(board);
}

function renderFeedback() {
  const message = state.session?.message || state.statusMessage;
  elements.feedback.className = `feedback ${state.feedbackTone}`;
  elements.feedback.textContent = message;
}

function renderExpectedMoves() {
  const moves = state.session?.expectedMoves || [];
  elements.expectedMoves.innerHTML = "";
  if (!moves.length) {
    elements.expectedMoves.className = "chip-row empty";
    const idleMessage = currentPracticeMode() === "position"
      ? "Start a position drill to jump into a book position."
      : "Tap Start Practice to see the opening moves here.";
    elements.expectedMoves.textContent = state.session?.completed
      ? currentPracticeMode() === "position"
        ? "This drill position is complete."
        : "This branch is complete."
      : idleMessage;
    return;
  }

  elements.expectedMoves.className = "chip-row";
  for (const move of moves) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = move;
    elements.expectedMoves.appendChild(chip);
  }
}

function movePill(move) {
  const pill = document.createElement("div");
  if (!move) {
    pill.className = "move-pill";
    pill.textContent = "";
    return pill;
  }
  pill.className = `move-pill ${move.actor}`;
  pill.textContent = move.san;
  pill.title = move.actor === "you"
    ? "Your move"
    : move.actor === "setup"
      ? "Starting position move"
      : "Trainer move";
  return pill;
}

function renderHistory() {
  const history = state.session?.history || [];
  elements.history.innerHTML = "";

  if (!history.length) {
    elements.history.className = "history empty";
    elements.history.textContent = "No moves yet.";
    return;
  }

  elements.history.className = "history";
  for (let index = 0; index < history.length; index += 2) {
    const whiteMove = history[index];
    const blackMove = history[index + 1];
    const row = document.createElement("div");
    row.className = "move-row";

    const number = document.createElement("span");
    number.className = "move-number";
    number.textContent = `${Math.floor(index / 2) + 1}.`;
    row.appendChild(number);
    row.appendChild(movePill(whiteMove));
    row.appendChild(movePill(blackMove));
    elements.history.appendChild(row);
  }
}

function renderSessionHeader() {
  const opening = currentOpeningSummary();
  elements.currentOpening.textContent = opening?.name || "Choose an opening";
  elements.currentMeta.textContent = opening
    ? `${opening.category} • ${opening.relativePath || opening.fileName}`
    : "Load an opening to see its repertoire group and source file.";

  const depth = state.session?.depthLimit || Number(elements.depthSelect.value);
  elements.depthPill.textContent = `${practiceModeLabel(currentPracticeMode())} • ${depth} plies`;

  if (!state.session) {
    elements.turnPill.className = "pill neutral";
    elements.turnPill.textContent = state.loadingBook ? "Loading Book" : "Waiting";
    return;
  }

  if (state.session.completed) {
    elements.turnPill.className = "pill subtle";
    elements.turnPill.textContent = state.session.mode === "position" ? "Drill Complete" : "Line Complete";
    return;
  }

  const turn = state.session.board.turn;
  elements.turnPill.className = `pill ${turn === "white" ? "turn-white" : "turn-black"}`;
  elements.turnPill.textContent = `${turn[0].toUpperCase()}${turn.slice(1)} to move`;
}

function renderOfflineStatus() {
  elements.offlineStatus.textContent = state.offlineStatus;
}

function renderPracticeModeNote() {
  const mode = currentPracticeMode();
  elements.modeNote.textContent = mode === "position"
    ? "Jump to a random book position and find the correct continuation."
    : "Start from move 1 and answer the trainer's book moves.";
}

function renderDatabaseSummary() {
  if (state.loadingDatabase) {
    elements.databaseSummary.textContent = "Loading the opening database index...";
  } else if (!state.openings.length) {
    elements.databaseSummary.textContent =
      "Build the opening database to make every opening browsable and downloadable as JSON.";
  } else {
    const categoryCount = categories().length;
    const builtAt = state.databaseMeta?.builtAt
      ? new Date(state.databaseMeta.builtAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
    elements.databaseSummary.textContent = `${state.openings.length} opening books across ${categoryCount} repertoire groups${builtAt ? `, built ${builtAt}` : ""}.`;
  }

  elements.databaseIndexLink.href = DATABASE_URLS[0];
  if (state.selectedBook?.bookUrl) {
    elements.selectedBookLink.href = `./${state.selectedBook.bookUrl}`;
    elements.selectedBookLink.classList.remove("disabled-link");
    elements.selectedBookLink.removeAttribute("aria-disabled");
  } else {
    elements.selectedBookLink.href = DATABASE_URLS[0];
    elements.selectedBookLink.classList.add("disabled-link");
    elements.selectedBookLink.setAttribute("aria-disabled", "true");
  }
}

function renderCategoryFilters() {
  const available = categories();
  elements.categoryFilters.innerHTML = "";

  const allCategories = ["all", ...available];
  for (const category of allCategories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-pill";
    if (state.categoryFilter === category) {
      button.classList.add("active");
    }
    button.textContent = category === "all" ? "All Openings" : category;
    button.addEventListener("click", () => {
      state.categoryFilter = category;
      renderAll();
    });
    elements.categoryFilters.appendChild(button);
  }
}

function filteredOpenings() {
  const query = state.search.trim().toLowerCase();
  return state.openings.filter((opening) => {
    const matchesCategory =
      state.categoryFilter === "all" || opening.category === state.categoryFilter;
    const matchesQuery =
      !query ||
      opening.name.toLowerCase().includes(query) ||
      opening.fileName.toLowerCase().includes(query) ||
      opening.relativePath.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
}

function renderOpenings() {
  const filtered = filteredOpenings();
  elements.openingList.innerHTML = "";
  elements.openingCount.textContent = state.loadingDatabase
    ? "Loading..."
    : filtered.length === state.openings.length
      ? `${filtered.length} opening files`
      : `${filtered.length} of ${state.openings.length} opening files`;

  if (state.loadingDatabase) {
    elements.openingList.innerHTML =
      '<p class="subtle-copy">Loading the opening database...</p>';
    return;
  }

  if (!filtered.length) {
    elements.openingList.innerHTML = '<p class="subtle-copy">No openings matched your search.</p>';
    return;
  }

  for (const opening of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "opening-item";
    if (opening.id === state.selectedOpeningId) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      void selectOpening(opening.id);
    });

    const stats = opening.stats
      ? `${opening.stats.games} games, ${opening.stats.uniqueLines} lines`
      : `${opening.sizeMb} MB`;

    button.innerHTML = `
      <div class="opening-topline">
        <span class="category-badge">${opening.category}</span>
        <span class="opening-size">${stats}</span>
      </div>
      <h4>${opening.name}</h4>
      <p>${opening.relativePath}</p>
    `;
    elements.openingList.appendChild(button);
  }
}

function buildTreeNode(node, budget) {
  if (budget.remaining <= 0) {
    budget.truncated = true;
    return null;
  }
  budget.remaining -= 1;

  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";

  const line = document.createElement("div");
  line.className = "tree-line";
  line.innerHTML = `<strong>${Math.floor((node.ply + 1) / 2)}${node.ply % 2 === 1 ? "." : "..."} ${node.san}</strong><span class="count">${node.count} games</span>`;
  wrapper.appendChild(line);

  if (node.children.length && budget.remaining > 0) {
    const children = document.createElement("div");
    children.className = "tree-children";
    for (const child of node.children) {
      const childElement = buildTreeNode(child, budget);
      if (!childElement) {
        break;
      }
      children.appendChild(childElement);
      if (budget.remaining <= 0) {
        break;
      }
    }
    if (children.childNodes.length) {
      wrapper.appendChild(children);
    }
  }

  return wrapper;
}

function renderVariationTree() {
  elements.tree.innerHTML = "";
  elements.variationStats.innerHTML = "";

  if (!state.selectedBook) {
    elements.variationTitle.textContent = "Select an opening";
    elements.variationStats.className = "stats-grid empty";
    elements.variationStats.textContent = state.loadingBook
      ? "Loading the selected opening book..."
      : "No opening selected.";
    elements.tree.className = "tree empty";
    elements.tree.textContent = state.loadingBook
      ? "Preparing the opening tree..."
      : "The opening tree will appear here.";
    return;
  }

  const previewDepth = Number(elements.depthSelect.value);
  const rootChoices = (state.selectedBook.root.children || [])
    .map((child) => pruneNode(child, previewDepth))
    .filter(Boolean);

  elements.variationTitle.textContent = state.selectedBook.name;
  elements.variationStats.className = "stats-grid";
  elements.tree.className = "tree";

  const stats = [
    ["Games", state.selectedBook.stats.games],
    ["Root choices", state.selectedBook.stats.rootChoices],
    ["Preview depth", `${previewDepth} plies`],
    ["Stored lines", state.selectedBook.stats.uniqueLines],
  ];

  for (const [label, value] of stats) {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    elements.variationStats.appendChild(stat);
  }

  if (!rootChoices.length) {
    elements.tree.classList.add("empty");
    elements.tree.textContent = "No lines were parsed from this opening.";
    return;
  }

  const budget = { remaining: MAX_TREE_NODES, truncated: false };
  for (const node of rootChoices) {
    const nodeElement = buildTreeNode(node, budget);
    if (!nodeElement) {
      break;
    }
    elements.tree.appendChild(nodeElement);
    if (budget.remaining <= 0) {
      break;
    }
  }

  if (budget.truncated) {
    const note = document.createElement("div");
    note.className = "tree-note";
    note.textContent = "Tree preview trimmed for speed. Start a line to explore it on the board.";
    elements.tree.appendChild(note);
  }
}

function updateButtons() {
  const canStart =
    Boolean(state.selectedOpeningId) && Boolean(state.selectedBook) && !state.loadingBook;
  const mode = state.session?.mode || elements.modeSelect.value;
  elements.startBtn.disabled = !canStart || state.startingSession || state.loadingDatabase;
  elements.resetBtn.disabled = !state.session || state.startingSession || state.loadingBook;
  elements.resetBtn.textContent = mode === "position" ? "New Drill" : "Reset";
  if (state.startingSession) {
    elements.startBtn.textContent = mode === "position" ? "Setting Drill..." : "Starting...";
    return;
  }
  elements.startBtn.textContent = mode === "position" ? "Start Drill" : "Start Practice";
}

function renderAll() {
  renderBoard();
  renderFeedback();
  renderExpectedMoves();
  renderHistory();
  renderSessionHeader();
  renderOfflineStatus();
  renderPracticeModeNote();
  renderDatabaseSummary();
  renderCategoryFilters();
  renderOpenings();
  renderVariationTree();
  updateButtons();
}

async function requestJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error(text || `Request failed with status ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload;
}

async function requestJsonWithFallback(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("The opening database could not be loaded.");
}

async function loadDatabase() {
  state.loadingDatabase = true;
  state.feedbackTone = "neutral";
  state.statusMessage = "Loading the opening database...";
  renderAll();

  try {
    const payload = await requestJsonWithFallback(DATABASE_URLS);
    state.databaseMeta = {
      formatVersion: payload.formatVersion || null,
      builtAt: payload.builtAt || null,
      maxBookPly: payload.maxBookPly || null,
    };
    state.openings = payload.openings || [];
    state.statusMessage = state.openings.length
      ? `Opening database ready with ${state.openings.length} files.`
      : "No opening books were found. Run the build step first.";
  } catch (error) {
    state.feedbackTone = "error";
    state.statusMessage = `${error.message} Run './.venv/bin/python opening_trainer.py build --force' if the database has not been generated yet.`;
  } finally {
    state.loadingDatabase = false;
    renderAll();
  }
}

async function loadBook(opening) {
  if (state.bookCache.has(opening.id)) {
    return state.bookCache.get(opening.id);
  }
  const payload = await requestJson(`./${opening.bookUrl}`);
  const book = expandBook(payload);
  state.bookCache.set(opening.id, book);
  return book;
}

async function selectOpening(openingId) {
  const opening = state.openings.find((item) => item.id === openingId);
  if (!opening) {
    return;
  }

  state.selectedOpeningId = openingId;
  state.selectedSquare = null;
  state.loadingBook = true;
  state.feedbackTone = "neutral";
  state.session = null;
  state.selectedBook = null;
  state.statusMessage = "Loading the selected opening from the database...";
  renderAll();

  try {
    state.selectedBook = await loadBook(opening);
    state.statusMessage =
      "Opening loaded. Start line play or a position drill, then tap a highlighted piece and its target square.";
  } catch (error) {
    state.feedbackTone = "error";
    state.statusMessage = error.message;
  } finally {
    state.loadingBook = false;
    renderAll();
  }
}

async function startPractice() {
  if (!state.selectedBook) {
    return;
  }

  state.selectedSquare = null;
  state.startingSession = true;
  state.feedbackTone = "neutral";
  state.statusMessage = elements.modeSelect.value === "position"
    ? "Loading a drill position..."
    : "Starting a practice line...";
  renderAll();

  try {
    state.session = createSession(
      state.selectedBook,
      elements.sideSelect.value,
      Number(elements.depthSelect.value),
      elements.modeSelect.value,
    );
    state.feedbackTone = state.session.completed ? "complete" : "success";
    state.statusMessage = state.session.message;
  } catch (error) {
    state.feedbackTone = "error";
    state.statusMessage = error.message;
  } finally {
    state.startingSession = false;
    renderAll();
  }
}

function resetPractice() {
  if (!state.selectedBook || !state.session) {
    return;
  }

  state.selectedSquare = null;
  state.session = createSession(
    state.selectedBook,
    state.session.userColor,
    state.session.depthLimit,
    state.session.mode,
  );
  state.feedbackTone = state.session.completed ? "complete" : "neutral";
  state.statusMessage = state.session.message;
  renderAll();
}

function submitMove(move) {
  if (!state.session) {
    return;
  }

  const result = playMove(state.session, move);
  state.session = result.session;
  state.feedbackTone = state.session.completed
    ? "complete"
    : result.ok
      ? "success"
      : "error";
  state.statusMessage = state.session.message;
  state.selectedSquare = null;
  renderAll();
}

function handleSquareClick(square) {
  if (!state.session || state.session.completed) {
    return;
  }

  const groupedMoves = movesByFromSquare();
  const currentTargets = groupedMoves[state.selectedSquare] || [];
  const directMove = currentTargets.find((move) => move.to === square);

  if (state.selectedSquare && directMove) {
    submitMove(directMove);
    return;
  }

  if (state.selectedSquare === square) {
    state.selectedSquare = null;
    renderBoard();
    return;
  }

  if (groupedMoves[square]) {
    state.selectedSquare = square;
    renderBoard();
    return;
  }

  state.selectedSquare = null;
  renderBoard();
}

async function setupOfflineSupport() {
  if (!("serviceWorker" in navigator)) {
    state.offlineStatus = "This browser does not support offline installation.";
    renderOfflineStatus();
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    state.offlineStatus = navigator.onLine
      ? "Offline support is ready. Loaded openings stay available offline."
      : "Offline mode is active.";
  } catch (_error) {
    state.offlineStatus = "Offline support could not be enabled in this browser.";
  }
  renderOfflineStatus();
}

window.addEventListener("online", () => {
  state.offlineStatus = "Back online. Loaded openings stay available offline.";
  renderOfflineStatus();
});

window.addEventListener("offline", () => {
  state.offlineStatus = "Offline mode is active.";
  renderOfflineStatus();
});

elements.board.addEventListener("click", (event) => {
  const target = event.target.closest(".square");
  if (!target) {
    return;
  }
  handleSquareClick(target.dataset.square);
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderOpenings();
});

elements.modeSelect.addEventListener("change", () => {
  if (!state.session && !state.loadingDatabase && !state.loadingBook) {
    state.feedbackTone = "neutral";
    state.statusMessage = elements.modeSelect.value === "position"
      ? "Position drill will jump to a random book position before your move."
      : "Line play starts from move 1 and expects the correct continuation.";
  }
  renderAll();
});

elements.depthSelect.addEventListener("change", () => {
  renderAll();
});

elements.startBtn.addEventListener("click", () => {
  void startPractice();
});

elements.resetBtn.addEventListener("click", () => {
  resetPractice();
});

void setupOfflineSupport();
void loadDatabase();
renderAll();
