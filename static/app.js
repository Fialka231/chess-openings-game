const DATABASE_URLS = ["./data/database.json", "./data/library.json"];
const LESSONS_URLS = ["./api/lessons", "./data/lessons.json"];
const ENGINE_STATUS_URL = "./api/engine/status";
const ENGINE_EVALUATE_URL = "./api/evaluate";
const BROWSER_STOCKFISH_SCRIPT = "./vendor/stockfish/stockfish-18-lite-single.js";
const BROWSER_ENGINE_READY_TIMEOUT_MS = 15000;
const BROWSER_ENGINE_COMMAND_TIMEOUT_MS = 20000;
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
  position: "Realistic Drill",
  exam: "Blind Recall",
};
const DRILL_PRIMARY_START_MIN_PLY = 4;
const DRILL_PRIMARY_START_MAX_PLY = 6;
const DRILL_FALLBACK_START_MIN_PLY = 2;
const DRILL_FALLBACK_START_MAX_PLY = 8;
const DRILL_PREFERRED_SPANS = [6, 4];
const DRILL_FALLBACK_SPANS = [2];
const BROWSER_ENGINE_MULTI_PV = 2;
const BROWSER_ENGINE_DEPTH_LOW = 10;
const BROWSER_ENGINE_DEPTH_MEDIUM = 11;
const BROWSER_ENGINE_DEPTH_HIGH = 12;

const state = {
  activeView: "home",
  openings: [],
  databaseMeta: null,
  lessons: [],
  bookCache: new Map(),
  engine: {
    available: null,
    loading: false,
    source: "none",
    message: "Checking whether live Stockfish analysis is available...",
    scoreText: "Waiting",
    scoreTone: "neutral",
    detailText: "Start a line or drill to see an evaluation of the current position.",
    bestLineText:
      "The app will use a local engine when available, or browser Stockfish on phone and offline installs.",
    lastFen: null,
    requestId: 0,
  },
  activeMode: "line",
  selectedOpeningId: null,
  selectedBook: null,
  session: null,
  selectedSquare: null,
  search: "",
  categoryFilter: "all",
  selectedLessonId: null,
  lessonSearch: "",
  lessonCategoryFilter: "all",
  feedbackTone: "neutral",
  statusMessage: "Select an opening on the right, then start a practice session.",
  loadingDatabase: false,
  loadingLessons: false,
  loadingBook: false,
  startingSession: false,
  offlineStatus: "Offline support is loading.",
};

const elements = {
  homeView: document.getElementById("home-view"),
  practiceView: document.getElementById("practice-view"),
  lessonsView: document.getElementById("lessons-view"),
  homeNav: document.getElementById("home-nav"),
  practiceNav: document.getElementById("practice-nav"),
  lessonsNav: document.getElementById("lessons-nav"),
  enterPractice: document.getElementById("enter-practice"),
  enterLessons: document.getElementById("enter-lessons"),
  backHomePractice: document.getElementById("back-home-practice"),
  openLessonsFromPractice: document.getElementById("open-lessons-from-practice"),
  backHomeLessons: document.getElementById("back-home-lessons"),
  openPracticeFromLessons: document.getElementById("open-practice-from-lessons"),
  homeOpeningCount: document.getElementById("home-opening-count"),
  homeLessonCount: document.getElementById("home-lesson-count"),
  homeLessonCategoryCount: document.getElementById("home-lesson-category-count"),
  homeEngineNote: document.getElementById("home-engine-note"),
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
  lineTab: document.getElementById("line-tab"),
  positionTab: document.getElementById("position-tab"),
  examTab: document.getElementById("exam-tab"),
  linePanel: document.getElementById("line-panel"),
  positionPanel: document.getElementById("position-panel"),
  examPanel: document.getElementById("exam-panel"),
  lineSideSelect: document.getElementById("line-side-select"),
  lineDepthSelect: document.getElementById("line-depth-select"),
  drillSideSelect: document.getElementById("drill-side-select"),
  examSideSelect: document.getElementById("exam-side-select"),
  startBtn: document.getElementById("start-btn"),
  undoBtn: document.getElementById("undo-btn"),
  resetBtn: document.getElementById("reset-btn"),
  turnPill: document.getElementById("turn-pill"),
  depthPill: document.getElementById("depth-pill"),
  categoryFilters: document.getElementById("category-filters"),
  offlineStatus: document.getElementById("offline-status"),
  databaseSummary: document.getElementById("database-summary"),
  databaseIndexLink: document.getElementById("database-index-link"),
  selectedBookLink: document.getElementById("selected-book-link"),
  engineStatus: document.getElementById("engine-status"),
  engineScore: document.getElementById("engine-score"),
  engineDetail: document.getElementById("engine-detail"),
  engineBest: document.getElementById("engine-best"),
  lessonSearchInput: document.getElementById("lesson-search-input"),
  lessonCategoryFilters: document.getElementById("lesson-category-filters"),
  lessonList: document.getElementById("lesson-list"),
  lessonCount: document.getElementById("lesson-count"),
  selectedLessonTitle: document.getElementById("selected-lesson-title"),
  selectedLessonMeta: document.getElementById("selected-lesson-meta"),
  selectedLessonSummary: document.getElementById("selected-lesson-summary"),
  selectedLessonFocus: document.getElementById("selected-lesson-focus"),
  selectedLessonFormat: document.getElementById("selected-lesson-format"),
  selectedLessonTags: document.getElementById("selected-lesson-tags"),
  selectedLessonStatus: document.getElementById("selected-lesson-status"),
  lessonOpenLink: document.getElementById("lesson-open-link"),
  lessonPracticeLink: document.getElementById("lesson-practice-link"),
};

let browserEnginePromise = null;

function currentPracticeMode() {
  return state.activeMode;
}

function practiceModeLabel(mode) {
  return PRACTICE_MODE_LABELS[mode] || PRACTICE_MODE_LABELS.line;
}

function capitalize(word) {
  return word ? `${word[0].toUpperCase()}${word.slice(1)}` : "";
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function currentSideSelection() {
  if (currentPracticeMode() === "position") {
    return elements.drillSideSelect?.value || "white";
  }
  if (currentPracticeMode() === "exam") {
    return elements.examSideSelect?.value || "white";
  }
  return elements.lineSideSelect?.value || "white";
}

function currentLineDepth() {
  return Number(elements.lineDepthSelect?.value || 12);
}

function syncSideSelectors(value) {
  if (elements.lineSideSelect) {
    elements.lineSideSelect.value = value;
  }
  if (elements.drillSideSelect) {
    elements.drillSideSelect.value = value;
  }
  if (elements.examSideSelect) {
    elements.examSideSelect.value = value;
  }
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

function currentLesson() {
  return state.lessons.find((lesson) => lesson.id === state.selectedLessonId) || null;
}

function lessonCategories() {
  return [...new Set(state.lessons.map((lesson) => lesson.category))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function setActiveView(view) {
  state.activeView = view;
  renderAll();
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

function boardPlacement(board) {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let emptyCount = 0;
    let segment = "";
    for (const file of FILES) {
      const piece = board.pieces[`${file}${rank}`];
      if (piece) {
        if (emptyCount) {
          segment += String(emptyCount);
          emptyCount = 0;
        }
        segment += piece;
      } else {
        emptyCount += 1;
      }
    }
    if (emptyCount) {
      segment += String(emptyCount);
    }
    ranks.push(segment);
  }
  return ranks.join("/");
}

function castlingRights(board) {
  let rights = "";
  if (board.castling.whiteKing) {
    rights += "K";
  }
  if (board.castling.whiteQueen) {
    rights += "Q";
  }
  if (board.castling.blackKing) {
    rights += "k";
  }
  if (board.castling.blackQueen) {
    rights += "q";
  }
  return rights || "-";
}

function boardToFen(board, ply = 0) {
  const activeColor = board.turn === "white" ? "w" : "b";
  const fullmoveNumber = Math.max(1, Math.floor((ply || 0) / 2) + 1);
  return `${boardPlacement(board)} ${activeColor} ${castlingRights(board)} ${board.enPassant || "-"} 0 ${fullmoveNumber}`;
}

function currentSessionFen() {
  if (!state.session) {
    return null;
  }
  return boardToFen(
    state.session.board,
    state.session.currentNode?.ply || state.session.history.length || 0,
  );
}

function createBrowserEngine() {
  if (typeof Worker !== "function") {
    return Promise.reject(
      new Error("This browser does not support Web Workers, so browser Stockfish cannot start."),
    );
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(BROWSER_STOCKFISH_SCRIPT);
    const engine = {
      worker,
      pending: null,
      queue: Promise.resolve(),
    };

    function finishPending(error, lines = []) {
      if (!engine.pending) {
        return;
      }
      const pending = engine.pending;
      engine.pending = null;
      clearTimeout(pending.timeoutId);
      if (error) {
        pending.reject(error);
      } else {
        pending.resolve(lines);
      }
    }

    function handleWorkerMessage(event) {
      const line = String(event.data || "").trim();
      if (!line || !engine.pending) {
        return;
      }
      engine.pending.lines.push(line);
      if (engine.pending.isDone(line, engine.pending.lines)) {
        finishPending(null, [...engine.pending.lines]);
      }
    }

    function handleWorkerError() {
      finishPending(new Error("Browser Stockfish stopped unexpectedly."));
      browserEnginePromise = null;
      reject(new Error("Browser Stockfish could not be started on this device."));
    }

    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", handleWorkerError);
    worker.addEventListener("messageerror", handleWorkerError);

    function enqueue(commands, isDone, timeoutMs = BROWSER_ENGINE_COMMAND_TIMEOUT_MS) {
      const run = () =>
        new Promise((commandResolve, commandReject) => {
          if (engine.pending) {
            commandReject(new Error("Browser Stockfish is still processing the previous command."));
            return;
          }
          const pending = {
            lines: [],
            isDone,
            resolve: commandResolve,
            reject: commandReject,
            timeoutId: window.setTimeout(() => {
              if (engine.pending === pending) {
                finishPending(
                  new Error("Browser Stockfish did not answer in time."),
                );
              }
            }, timeoutMs),
          };
          engine.pending = pending;
          for (const command of commands) {
            worker.postMessage(command);
          }
        });

      engine.queue = engine.queue.catch(() => null).then(run);
      return engine.queue;
    }

    engine.enqueue = enqueue;

    enqueue(["uci"], (line) => line === "uciok", BROWSER_ENGINE_READY_TIMEOUT_MS)
      .then(() =>
        enqueue(
          ["isready"],
          (line) => line === "readyok",
          BROWSER_ENGINE_READY_TIMEOUT_MS,
        ),
      )
      .then(() => resolve(engine))
      .catch((error) => {
        worker.terminate();
        browserEnginePromise = null;
        reject(error);
      });
  });
}

function ensureBrowserEngineReady() {
  if (!browserEnginePromise) {
    browserEnginePromise = createBrowserEngine().catch((error) => {
      browserEnginePromise = null;
      throw error;
    });
  }
  return browserEnginePromise;
}

function browserEngineDepth() {
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 4);
  if (cores >= 8) {
    return BROWSER_ENGINE_DEPTH_HIGH;
  }
  if (cores >= 4) {
    return BROWSER_ENGINE_DEPTH_MEDIUM;
  }
  return BROWSER_ENGINE_DEPTH_LOW;
}

function engineAlternativeMove(info) {
  return info?.pv?.[0] || null;
}

function parseBrowserSearchInfo(lines) {
  const suggestions = new Map();
  let bestMove = null;

  for (const line of lines) {
    if (line.startsWith("bestmove ")) {
      bestMove = line.split(/\s+/)[1] || null;
      continue;
    }
    if (!line.startsWith("info ") || !line.includes(" score ")) {
      continue;
    }

    const depthMatch = line.match(/\bdepth\s+(\d+)/);
    const multiPvMatch = line.match(/\bmultipv\s+(\d+)/);
    const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (!scoreMatch) {
      continue;
    }

    const pvMatch = line.match(/\spv\s+(.+)$/);
    const multiPv = multiPvMatch ? Number(multiPvMatch[1]) : 1;
    const nextInfo = {
      multiPv,
      depth: depthMatch ? Number(depthMatch[1]) : 0,
      kind: scoreMatch[1],
      value: Number(scoreMatch[2]),
      pv: pvMatch ? pvMatch[1].trim().split(/\s+/).filter(Boolean) : [],
    };

    const existing = suggestions.get(multiPv);
    if (!existing || nextInfo.depth >= existing.depth) {
      suggestions.set(multiPv, nextInfo);
    }
  }

  const ordered = [...suggestions.values()].sort((left, right) => left.multiPv - right.multiPv);
  return {
    bestInfo: ordered[0] || null,
    bestMove: bestMove || engineAlternativeMove(ordered[0]),
    suggestions: ordered,
  };
}

function formatBrowserScore(kind, value) {
  if (kind === "mate") {
    const plyCount = Math.abs(value);
    return {
      kind,
      text: `${value > 0 ? "+" : "-"}M${plyCount}`,
      detail:
        value > 0
          ? `White has a forced mate in ${plyCount}.`
          : `Black has a forced mate in ${plyCount}.`,
    };
  }

  const pawns = value / 100;
  const absolute = Math.abs(pawns).toFixed(2);
  return {
    kind,
    text: pawns > 0 ? `+${absolute}` : pawns < 0 ? `-${absolute}` : "+0.00",
    detail:
      pawns > 0
        ? `White is better by about ${absolute} pawns.`
        : pawns < 0
          ? `Black is better by about ${absolute} pawns.`
          : "Stockfish sees the position as equal.",
  };
}

function parseBrowserLegalMoves(lines) {
  const legalMoves = [];
  for (const line of lines) {
    const match = line.match(/^([a-h][1-8][a-h][1-8][nbrq]?):\s+\d+/i);
    if (match) {
      legalMoves.push(match[1].toLowerCase());
    }
  }
  return legalMoves;
}

async function requestBrowserEvaluation(fen) {
  const engine = await ensureBrowserEngineReady();
  const depth = browserEngineDepth();
  const lines = await engine.enqueue(
    [
      `setoption name MultiPV value ${BROWSER_ENGINE_MULTI_PV}`,
      `position fen ${fen}`,
      `go depth ${depth}`,
    ],
    (line) => line.startsWith("bestmove "),
  );
  const { bestInfo, bestMove, suggestions } = parseBrowserSearchInfo(lines);
  return {
    available: true,
    source: "browser",
    depth: bestInfo?.depth || depth,
    score: bestInfo ? formatBrowserScore(bestInfo.kind, bestInfo.value) : null,
    bestMove,
    pv: bestInfo?.pv || [],
    alternatives: suggestions.slice(1).map((info) => ({
      move: engineAlternativeMove(info),
      pv: info.pv || [],
      score: formatBrowserScore(info.kind, info.value),
    })),
  };
}

async function requestBrowserLegalMoves(fen) {
  const engine = await ensureBrowserEngineReady();
  const lines = await engine.enqueue(
    [`position fen ${fen}`, "go perft 1"],
    (line) => line.startsWith("Nodes searched:"),
  );
  return parseBrowserLegalMoves(lines);
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

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
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

function legalMoveOption(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4) || null,
    san: uci,
    label: uci,
    count: 0,
  };
}

function cloneMoveOption(move) {
  return { ...move };
}

function moveUci(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
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
  if (session.drill?.line?.length && (session.mode === "position" || session.mode === "exam")) {
    const target = session.drill.line[session.drill.index] || null;
    session.correctMoves = target ? [openingMove(target)] : [];
    session.allowedMoves = session.mode === "exam"
      ? (session.legalMoves || []).map(cloneMoveOption)
      : session.correctMoves.map(cloneMoveOption);
    session.expectedMoves = session.mode === "exam"
      ? []
      : target
        ? [target.san]
        : [];
    session.completed = session.completed || !target;
    return;
  }

  const children = availableChildren(session.currentNode, session.depthLimit);
  session.correctMoves = children.map(openingMove);
  session.allowedMoves = session.mode === "exam"
    ? (session.legalMoves || []).map(cloneMoveOption)
    : session.correctMoves.map(cloneMoveOption);
  session.expectedMoves = session.mode === "exam"
    ? []
    : children.map((child) => child.san);
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
    if (session.drill?.line?.length && (session.mode === "position" || session.mode === "exam")) {
      const planned = session.drill.line[session.drill.index];
      if (!planned) {
        session.completed = true;
        break;
      }
      applyChild(session, planned, "trainer");
      session.drill.index += 1;
      replies.push(planned.san);
      continue;
    }

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
    correctMoves: [],
    expectedMoves: [],
    legalMoves: [],
    completed: false,
    message: "",
    drill: null,
    anchor: null,
  };
}

function captureSessionAnchor(session) {
  session.anchor = {
    currentNode: session.currentNode,
    board: cloneBoard(session.board),
    history: copyHistoryEntries(session.history),
  };
}

function applyStartingPath(session, path) {
  for (const node of path) {
    applyChild(session, node, "setup");
  }
}

function copyHistoryEntries(history) {
  return history.map((entry) => ({ ...entry }));
}

function replayHistoryEntry(session, entry) {
  const nextChild = (session.currentNode.children || []).find((child) => child.uci === entry.uci);
  if (!nextChild) {
    throw new Error(`Could not restore move ${entry.uci} while rebuilding the session.`);
  }
  applyChild(session, nextChild, entry.actor);
}

function canUndoSession(session) {
  if (!session?.anchor) {
    return false;
  }
  const anchorLength = session.anchor.history.length;
  return session.history.some((entry, index) => index >= anchorLength && entry.actor === "you");
}

function undoBreakpointIndex(session) {
  if (!canUndoSession(session)) {
    return -1;
  }
  const anchorLength = session.anchor.history.length;
  for (let index = session.history.length - 1; index >= anchorLength; index -= 1) {
    if (session.history[index].actor === "you") {
      return index;
    }
  }
  return -1;
}

function restoreSessionToHistoryPrefix(session, targetLength) {
  if (!session.anchor) {
    return;
  }

  const baseHistory = session.anchor.history;
  const replayEntries = session.history.slice(baseHistory.length, targetLength);
  session.currentNode = session.anchor.currentNode;
  session.board = cloneBoard(session.anchor.board);
  session.history = copyHistoryEntries(baseHistory);
  session.completed = false;
  session.legalMoves = [];
  if (session.drill) {
    session.drill.index = 0;
  }

  for (const entry of replayEntries) {
    replayHistoryEntry(session, entry);
    if (session.drill?.line?.length) {
      const planned = session.drill.line[session.drill.index];
      if (planned?.uci === entry.uci) {
        session.drill.index += 1;
      }
    }
  }

  syncSessionDerived(session);
}

function userMoveGoalFromSpan(span) {
  return Math.max(1, Math.round(span / 2));
}

function drillGoalMessage(userColor, span) {
  const moves = userMoveGoalFromSpan(span);
  return `Find the next ${moves} correct ${pluralize(moves, "move")} for ${capitalize(userColor)}.`;
}

function remainingDrillGoalMessage(session) {
  const remainingMoves = Math.max(1, remainingDrillUserMoves(session));
  return `Find the next ${remainingMoves} correct ${pluralize(remainingMoves, "move")} for ${capitalize(session.userColor)}.`;
}

function collectDrillCandidates(node, userColor, path = [], candidates = []) {
  const currentPath = node.ply ? [...path, node] : path;
  let maxReachablePly = node.ply;

  for (const child of node.children || []) {
    maxReachablePly = Math.max(
      maxReachablePly,
      collectDrillCandidates(child, userColor, currentPath, candidates),
    );
  }

  if (node.ply && sideToMoveFromPly(node.ply) === userColor) {
    const remainingPlies = maxReachablePly - node.ply;
    const preferredSpans = DRILL_PREFERRED_SPANS.filter((span) => remainingPlies >= span);
    const spanOptions = preferredSpans.length
      ? preferredSpans
      : DRILL_FALLBACK_SPANS.filter((span) => remainingPlies >= span);

    if (spanOptions.length) {
      candidates.push({
        node,
        path: currentPath,
        spanOptions,
        preferredStart:
          node.ply >= DRILL_PRIMARY_START_MIN_PLY && node.ply <= DRILL_PRIMARY_START_MAX_PLY,
        fallbackStart:
          node.ply >= DRILL_FALLBACK_START_MIN_PLY && node.ply <= DRILL_FALLBACK_START_MAX_PLY,
        weight: Math.max(
          1,
          node.count || (node.children || []).reduce((sum, child) => sum + child.count, 0),
        ),
      });
    }
  }

  return maxReachablePly;
}

function pickDrillCandidate(book, userColor) {
  const candidates = [];
  collectDrillCandidates(book.root, userColor, [], candidates);

  let pool = candidates.filter(
    (candidate) => candidate.preferredStart && candidate.spanOptions.some((span) => span >= 4),
  );
  let fallbackMessage = "";

  if (!pool.length) {
    pool = candidates.filter(
      (candidate) => candidate.fallbackStart && candidate.spanOptions.some((span) => span >= 4),
    );
    if (pool.length) {
      fallbackMessage =
        "This opening is shorter than usual, so the drill starts from the best available book position.";
    }
  }

  if (!pool.length) {
    pool = candidates;
    if (pool.length) {
      fallbackMessage =
        "This opening is very short, so the drill uses a shorter continuation than usual.";
    }
  }

  if (!pool.length) {
    return null;
  }

  const candidate = weightedChoice(
    pool,
    (item) => item.weight * (item.preferredStart ? 3 : item.fallbackStart ? 2 : 1),
  );
  const spanPool = candidate.spanOptions.map((span) => ({
    span,
    count: span === 6 ? 2 : 1,
  }));

  return {
    ...candidate,
    span: weightedChoice(spanPool, (item) => item.count).span,
    fallbackMessage,
  };
}

function planDrillLine(startNode, span) {
  const line = [];
  let cursor = startNode;

  while (line.length < span) {
    const children = cursor.children || [];
    if (!children.length) {
      break;
    }
    const chosen = weightedChoice(children);
    line.push(chosen);
    cursor = chosen;
  }

  return line;
}

function remainingDrillUserMoves(session) {
  if (session.drill?.line?.length) {
    return session.drill.line
      .slice(session.drill.index || 0)
      .filter((node) => sideToMoveFromPly(node.ply) === session.userColor)
      .length;
  }
  const remainingPlies = Math.max(0, session.depthLimit - session.currentNode.ply);
  return Math.max(1, Math.ceil(remainingPlies / 2));
}

function resetPositionSession(session, prefix = "Wrong move.") {
  if (!session.drill) {
    return session;
  }

  session.currentNode = session.drill.startNode;
  session.board = cloneBoard(session.drill.startBoard);
  session.history = copyHistoryEntries(session.drill.startHistory);
  session.depthLimit = session.drill.endPly;
  session.completed = false;
  session.drill.index = 0;
  session.legalMoves = session.mode === "exam" && session.drill.startLegalMoves
    ? session.drill.startLegalMoves.map(cloneMoveOption)
    : [];
  syncSessionDerived(session);
  session.message = `${prefix} The drill position has been reset. ${remainingDrillGoalMessage(session)}`;
  return session;
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
  captureSessionAnchor(session);
  return session;
}

function createFallbackStrictDrillSession(book, userColor, depthLimit, mode) {
  const session = buildSession(book, userColor, depthLimit, mode);
  const trainerMoves = advanceTrainer(session);
  const line = planDrillLine(
    session.currentNode,
    Math.max(1, depthLimit - session.currentNode.ply),
  );

  if (!line.length) {
    session.completed = true;
    session.message = "This drill position is already complete at the selected depth.";
    captureSessionAnchor(session);
    return session;
  }

  session.depthLimit = line[line.length - 1].ply;
  session.drill = {
    startNode: session.currentNode,
    startBoard: cloneBoard(session.board),
    startHistory: copyHistoryEntries(session.history),
    startLabel: trainerMoves.length ? trainerMoves.join(" ") : "the starting position",
    endPly: session.depthLimit,
    goalMessage:
      mode === "exam"
        ? "No hints are shown. Play the correct continuation from move 1."
        : drillGoalMessage(userColor, line.length),
    startLegalMoves: [],
    line,
    index: 0,
  };
  if (mode === "exam") {
    session.message = trainerMoves.length
      ? `Blind recall starts from move 1 in ${book.name}. Trainer plays ${trainerMoves.join(" ")}. No hints are shown.`
      : `Blind recall starts from move 1 in ${book.name}. No hints are shown.`;
    session.legalMoves = [];
  } else {
    session.message = trainerMoves.length
      ? `No deeper realistic drill position was available, so the drill starts from move 1 after ${trainerMoves.join(" ")}. ${drillGoalMessage(userColor, line.length)}`
      : `No deeper realistic drill position was available, so the drill starts from move 1. ${drillGoalMessage(userColor, line.length)}`;
  }
  syncSessionDerived(session);
  captureSessionAnchor(session);
  return session;
}

function createPositionSession(book, userColor, depthLimit, presetCandidate = null) {
  const candidate = presetCandidate || pickDrillCandidate(book, userColor);

  if (!candidate) {
    return createFallbackStrictDrillSession(book, userColor, depthLimit, "position");
  }

  const line = planDrillLine(candidate.node, candidate.span);
  if (!line.length) {
    return createFallbackStrictDrillSession(book, userColor, depthLimit, "position");
  }

  const session = buildSession(
    book,
    userColor,
    line[line.length - 1].ply,
    "position",
  );
  applyStartingPath(session, candidate.path);
  syncSessionDerived(session);

  if (session.completed) {
    session.completed = true;
    session.message = "This drill position is already complete at the selected depth.";
    return session;
  }

  const startLabel = formatStartingLine(candidate.path);
  const introPrefix = candidate.fallbackMessage ? `${candidate.fallbackMessage} ` : "";
  const goalMessage = drillGoalMessage(userColor, line.length);
  session.drill = {
    startNode: candidate.node,
    startBoard: cloneBoard(session.board),
    startHistory: copyHistoryEntries(session.history),
    startLabel,
    endPly: session.depthLimit,
    goalMessage,
    line,
    index: 0,
  };
  syncSessionDerived(session);
  session.message = `${introPrefix}Realistic drill starts after ${startLabel}. ${goalMessage}`;
  captureSessionAnchor(session);
  return session;
}

function createExamSession(book, userColor, depthLimit, presetCandidate = null) {
  const candidate = presetCandidate || pickDrillCandidate(book, userColor);

  if (!candidate) {
    return createFallbackStrictDrillSession(book, userColor, depthLimit, "exam");
  }

  const line = planDrillLine(candidate.node, candidate.span);
  if (!line.length) {
    return createFallbackStrictDrillSession(book, userColor, depthLimit, "exam");
  }

  const session = buildSession(book, userColor, line[line.length - 1].ply, "exam");
  applyStartingPath(session, candidate.path);
  syncSessionDerived(session);

  if (session.completed) {
    session.completed = true;
    session.message = "This blind recall position is already complete at the selected depth.";
    return session;
  }

  const startLabel = formatStartingLine(candidate.path);
  const introPrefix = candidate.fallbackMessage ? `${candidate.fallbackMessage} ` : "";
  const goalMessage = `No hints are shown. ${drillGoalMessage(userColor, line.length)}`;
  session.drill = {
    startNode: candidate.node,
    startBoard: cloneBoard(session.board),
    startHistory: copyHistoryEntries(session.history),
    startLabel,
    endPly: session.depthLimit,
    goalMessage,
    startLegalMoves: [],
    line,
    index: 0,
  };
  session.message = `${introPrefix}Blind recall starts after ${startLabel}. ${goalMessage}`;
  session.legalMoves = [];
  syncSessionDerived(session);
  captureSessionAnchor(session);
  return session;
}

function createSession(book, userColor, depthLimit, mode = "line") {
  if (mode === "position") {
    return createPositionSession(book, userColor, depthLimit);
  }
  if (mode === "exam") {
    return createExamSession(book, userColor, depthLimit);
  }
  return createLineSession(book, userColor, depthLimit);
}

async function refreshExamLegalMoves(session) {
  if (!session || session.mode !== "exam" || session.completed) {
    return;
  }

  const fen = boardToFen(
    session.board,
    session.currentNode?.ply || session.history.length || 0,
  );
  const legalMoves = await requestBrowserLegalMoves(fen);
  const latestFen = boardToFen(
    session.board,
    session.currentNode?.ply || session.history.length || 0,
  );
  if (session !== state.session || latestFen !== fen) {
    return;
  }

  session.legalMoves = legalMoves.map(legalMoveOption);
  syncSessionDerived(session);

  if (
    session.drill &&
    session.currentNode === session.drill.startNode &&
    !session.drill.startLegalMoves.length
  ) {
    session.drill.startLegalMoves = session.legalMoves.map(cloneMoveOption);
  }
}

function playMove(session, move) {
  if (session.completed) {
    session.message = session.mode === "position"
      ? "This realistic drill is finished. Start a new drill to try another opening."
      : session.mode === "exam"
        ? "This blind recall is finished. Start a new test to try another opening."
      : "This line is finished. Reset to try another branch.";
    return { ok: false, session };
  }

  if (session.board.turn !== session.userColor) {
    session.message = "Wait for the trainer move to finish.";
    return { ok: false, session };
  }

  const children = availableChildren(session.currentNode, session.depthLimit);
  const planned = session.drill?.line?.length && (session.mode === "position" || session.mode === "exam")
    ? session.drill.line[session.drill.index] || null
    : null;
  const selected = planned
    ? planned.uci === moveUci(move)
      ? planned
      : null
    : children.find((child) => child.uci === moveUci(move));
  if (!selected) {
    if (session.mode === "position" && session.drill) {
      resetPositionSession(session);
      return { ok: false, session };
    }
    if (session.mode === "exam" && session.drill) {
      resetPositionSession(
        session,
        `Incorrect. ${moveUci(move)} is legal here, but it is not the stored opening move.`,
      );
      return { ok: false, session, refreshLegalMoves: true };
    }
    const expected = children.slice(0, 6).map((child) => child.san).join(", ");
    session.message = `That move is outside the selected opening here. Try one of: ${expected || "the highlighted moves"}.`;
    return { ok: false, session };
  }

  applyChild(session, selected, "you");
  if (planned) {
    session.drill.index += 1;
  }
  const trainerMoves = advanceTrainer(session);
  if (session.completed) {
    session.message = session.mode === "position"
      ? "Correct. You solved this drill."
      : session.mode === "exam"
        ? "Correct. You solved this blind recall."
      : "Correct. You reached the end of this stored opening branch.";
  } else if (trainerMoves.length) {
    if (session.mode === "position" && session.drill) {
      session.message = `Correct. Trainer replies with ${trainerMoves.join(" ")}. ${remainingDrillGoalMessage(session)}`;
    } else if (session.mode === "exam" && session.drill) {
      session.message = `Correct. Trainer replies with ${trainerMoves.join(" ")}. No hints are shown. ${remainingDrillGoalMessage(session)}`;
    } else {
      session.message = `Correct. Trainer replies with ${trainerMoves.join(" ")}.`;
    }
  } else {
    session.message = session.mode === "exam"
      ? "Correct. No hints are shown from here."
      : "Correct. Continue from the current position.";
  }
  syncSessionDerived(session);
  return { ok: true, session };
}

function setEngineIdleState(
  detailText = "Start a line or drill to see an evaluation of the current position.",
) {
  state.engine.loading = false;
  state.engine.lastFen = null;
  state.engine.scoreText = state.engine.available === true
    ? "Ready"
    : state.engine.available === null
      ? "Checking"
      : "Off";
  state.engine.scoreTone = "neutral";
  state.engine.detailText = detailText;
  state.engine.bestLineText = state.engine.available === true
    ? state.engine.source === "browser"
      ? "Browser Stockfish is ready, so evaluation also works on phone and offline web installs."
      : "Local Stockfish will evaluate the current board as soon as practice starts."
    : state.engine.message;
}

function formatEngineBestLine(payload) {
  if (!payload.bestMove) {
    return "No principal variation was returned for this position.";
  }

  const lead = [`Best move: ${payload.bestMove}`];
  const alternative = (payload.alternatives || []).find((item) => item.move);
  if (alternative) {
    lead.push(`Next choice: ${alternative.move}${alternative.score?.text ? ` (${alternative.score.text})` : ""}`);
  }
  if (payload.pv?.length) {
    lead.push(`PV ${payload.pv.join(" ")}`);
  }
  return lead.join(" • ");
}

function renderEngineCard() {
  if (
    !elements.engineStatus ||
    !elements.engineScore ||
    !elements.engineDetail ||
    !elements.engineBest
  ) {
    return;
  }
  elements.engineStatus.textContent = state.engine.message;
  elements.engineScore.className = `engine-score ${state.engine.scoreTone}`;
  elements.engineScore.textContent = state.engine.scoreText;
  elements.engineDetail.textContent = state.engine.detailText;
  elements.engineBest.textContent = state.engine.bestLineText;
}

async function requestEngineEvaluation() {
  if (state.engine.available !== true || !state.session) {
    return;
  }

  const fen = currentSessionFen();
  if (!fen || state.engine.lastFen === fen) {
    return;
  }

  const requestId = state.engine.requestId + 1;
  state.engine.requestId = requestId;
  state.engine.loading = true;
  state.engine.scoreText = "...";
  state.engine.scoreTone = "neutral";
  state.engine.detailText = "Stockfish is evaluating the current position from White's perspective.";
  state.engine.bestLineText = "Working on the best line...";
  renderEngineCard();

  try {
    let payload = null;
    try {
      payload = state.engine.source === "server"
        ? await requestJson(ENGINE_EVALUATE_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fen }),
          })
        : await requestBrowserEvaluation(fen);
    } catch (primaryError) {
      if (state.engine.source !== "server") {
        throw primaryError;
      }
      await ensureBrowserEngineReady();
      state.engine.source = "browser";
      state.engine.message = "Local engine fell back to browser Stockfish.";
      payload = await requestBrowserEvaluation(fen);
    }

    if (requestId !== state.engine.requestId || currentSessionFen() !== fen) {
      return;
    }

    state.engine.loading = false;
    state.engine.available = Boolean(payload.available);
    state.engine.source = payload.source || state.engine.source || "browser";
    state.engine.lastFen = fen;
    state.engine.message = state.engine.source === "server"
      ? payload.path
        ? `Local Stockfish depth ${payload.depth} • ${payload.timeMs} ms budget`
        : "Local Stockfish evaluation is ready."
      : `Browser Stockfish depth ${payload.depth} • runs on this device`;
    state.engine.scoreText = payload.score?.text || "n/a";
    state.engine.scoreTone = payload.score?.text?.startsWith("-")
      ? "black-edge"
      : payload.score?.text?.startsWith("+") && payload.score?.text !== "+0.00"
        ? "white-edge"
        : "neutral";
    state.engine.detailText = payload.score?.detail || "Stockfish returned an evaluation.";
    state.engine.bestLineText = payload.bestMove
      ? formatEngineBestLine(payload)
      : "No principal variation was returned for this position.";
  } catch (error) {
    if (requestId !== state.engine.requestId) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    state.engine.available = false;
    state.engine.source = "none";
    state.engine.loading = false;
    state.engine.lastFen = null;
    state.engine.message =
      "Live engine evaluation is unavailable here. Browser Stockfish could not be started on this device.";
    state.engine.scoreText = "Off";
    state.engine.scoreTone = "neutral";
    state.engine.detailText = message;
    state.engine.bestLineText =
      `Browser Stockfish could not start here. Reload the app, or serve it locally with a native Stockfish binary if needed.`;
  }

  renderEngineCard();
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
  const mode = state.session?.mode || currentPracticeMode();
  const moves = state.session?.expectedMoves || [];
  elements.expectedMoves.innerHTML = "";
  if (mode === "exam") {
    elements.expectedMoves.className = "chip-row empty";
    if (state.session?.completed) {
      elements.expectedMoves.textContent = "Blind Recall solved. Start a new test for another random position.";
    } else if (state.session) {
      elements.expectedMoves.textContent =
        "Hints are hidden in Blind Recall. Every legal move can be played, but only book moves are accepted.";
    } else {
      elements.expectedMoves.textContent =
        "Start Blind Recall to get a random opening position with no move hints.";
    }
    return;
  }
  if (!moves.length) {
    elements.expectedMoves.className = "chip-row empty";
    const idleMessage = mode === "position"
      ? "Start Realistic Drill to jump into a random opening position."
      : "Tap Start Practice to see the opening moves here.";
    elements.expectedMoves.textContent = state.session?.completed
      ? mode === "position"
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
    : currentPracticeMode() === "position"
      ? "Realistic Drill pulls a random opening from the full database each time."
      : currentPracticeMode() === "exam"
        ? "Blind Recall pulls a random opening from the full database and hides the next move."
        : "Load an opening to see its repertoire group and source file.";

  if (state.session?.mode === "position") {
    elements.depthPill.textContent = "Realistic Drill • 2-3 move solve";
  } else if (state.session?.mode === "exam") {
    elements.depthPill.textContent = "Blind Recall • no hints";
  } else if (currentPracticeMode() === "position") {
    elements.depthPill.textContent = "Realistic Drill • random opening";
  } else if (currentPracticeMode() === "exam") {
    elements.depthPill.textContent = "Blind Recall • random opening";
  } else {
    const depth = state.session?.depthLimit || currentLineDepth();
    elements.depthPill.textContent = `${practiceModeLabel(currentPracticeMode())} • ${depth} plies`;
  }

  if (!state.session) {
    elements.turnPill.className = "pill neutral";
    elements.turnPill.textContent = state.loadingBook ? "Loading Book" : "Waiting";
    return;
  }

  if (state.session.completed) {
    elements.turnPill.className = "pill subtle";
    elements.turnPill.textContent = state.session.mode === "position"
      ? "Drill Complete"
      : state.session.mode === "exam"
        ? "Recall Complete"
        : "Line Complete";
    return;
  }

  const turn = state.session.board.turn;
  elements.turnPill.className = `pill ${turn === "white" ? "turn-white" : "turn-black"}`;
  elements.turnPill.textContent = `${turn[0].toUpperCase()}${turn.slice(1)} to move`;
}

function renderOfflineStatus() {
  elements.offlineStatus.textContent = state.offlineStatus;
}

function renderViewState() {
  if (elements.homeView) {
    elements.homeView.hidden = state.activeView !== "home";
  }
  if (elements.practiceView) {
    elements.practiceView.hidden = state.activeView !== "practice";
  }
  if (elements.lessonsView) {
    elements.lessonsView.hidden = state.activeView !== "lessons";
  }

  const activeHome = state.activeView === "home";
  const activePractice = state.activeView === "practice";
  const activeLessons = state.activeView === "lessons";
  if (elements.practiceNav) {
    elements.practiceNav.classList[activePractice ? "add" : "remove"]("active");
  }
  if (elements.lessonsNav) {
    elements.lessonsNav.classList[activeLessons ? "add" : "remove"]("active");
  }
  if (elements.homeNav) {
    elements.homeNav.classList[activeHome ? "add" : "remove"]("active");
  }
}

function renderHomeDashboard() {
  if (elements.homeOpeningCount) {
    elements.homeOpeningCount.textContent = state.loadingDatabase
      ? "..."
      : String(state.openings.length);
  }
  if (elements.homeLessonCount) {
    elements.homeLessonCount.textContent = state.loadingLessons
      ? "..."
      : String(state.lessons.length);
  }
  if (elements.homeLessonCategoryCount) {
    elements.homeLessonCategoryCount.textContent = state.loadingLessons
      ? "..."
      : String(lessonCategories().length || 0);
  }
  if (elements.homeEngineNote) {
    elements.homeEngineNote.textContent = state.engine.message;
  }
}

function renderPracticeModeTabs() {
  const mode = currentPracticeMode();
  if (
    !elements.lineTab ||
    !elements.positionTab ||
    !elements.examTab ||
    !elements.linePanel ||
    !elements.positionPanel ||
    !elements.examPanel
  ) {
    return;
  }

  const lineActive = mode === "line";
  const positionActive = mode === "position";
  const examActive = mode === "exam";
  elements.lineTab.classList[lineActive ? "add" : "remove"]("active");
  elements.positionTab.classList[positionActive ? "add" : "remove"]("active");
  elements.examTab.classList[examActive ? "add" : "remove"]("active");
  elements.lineTab.setAttribute("aria-selected", String(lineActive));
  elements.positionTab.setAttribute("aria-selected", String(positionActive));
  elements.examTab.setAttribute("aria-selected", String(examActive));
  elements.linePanel.hidden = !lineActive;
  elements.positionPanel.hidden = !positionActive;
  elements.examPanel.hidden = !examActive;
}

function setActiveMode(mode) {
  if (state.activeMode === mode) {
    return;
  }

  state.activeMode = mode;
  state.selectedSquare = null;
  state.session = null;
  state.feedbackTone = "neutral";

  if (state.selectedBook) {
    state.statusMessage = mode === "position"
      ? "Realistic drill ready. Start a random opening puzzle from the full database."
      : mode === "exam"
        ? "Blind Recall ready. Start a random opening test with no move hints."
      : "Line play ready. Start from move 1 and follow the trainer's responses.";
  } else {
    state.statusMessage = mode === "position"
      ? "Realistic drill is ready. Start and the app will choose a random opening for you."
      : mode === "exam"
        ? "Blind Recall is ready. Start and the app will choose a random opening with no hints."
      : "Select an opening on the right, then start a practice session.";
  }

  setEngineIdleState(
    mode === "position"
      ? "Start realistic drill to evaluate a random opening position."
      : mode === "exam"
        ? "Start Blind Recall to evaluate a random opening position with browser or local Stockfish."
      : "Start line play to evaluate the current opening position.",
  );
  renderAll();
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

function filteredLessons() {
  const query = state.lessonSearch.trim().toLowerCase();
  return state.lessons.filter((lesson) => {
    const matchesCategory =
      state.lessonCategoryFilter === "all" || lesson.category === state.lessonCategoryFilter;
    const matchesQuery =
      !query ||
      lesson.title.toLowerCase().includes(query) ||
      lesson.author.toLowerCase().includes(query) ||
      lesson.summary.toLowerCase().includes(query) ||
      lesson.tags.some((tag) => tag.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });
}

function renderLessonCategories() {
  if (!elements.lessonCategoryFilters) {
    return;
  }
  elements.lessonCategoryFilters.innerHTML = "";
  const allCategories = ["all", ...lessonCategories()];
  for (const category of allCategories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-pill";
    if (state.lessonCategoryFilter === category) {
      button.classList.add("active");
    }
    button.textContent = category === "all" ? "All Lessons" : category;
    button.addEventListener("click", () => {
      state.lessonCategoryFilter = category;
      const visible = filteredLessons();
      if (!visible.some((lesson) => lesson.id === state.selectedLessonId)) {
        state.selectedLessonId = visible[0]?.id || null;
      }
      renderAll();
    });
    elements.lessonCategoryFilters.appendChild(button);
  }
}

function renderLessonsList() {
  if (!elements.lessonList || !elements.lessonCount) {
    return;
  }
  const filtered = filteredLessons();
  elements.lessonList.innerHTML = "";
  elements.lessonCount.textContent = state.loadingLessons
    ? "Loading..."
    : filtered.length === state.lessons.length
      ? `${filtered.length} resources`
      : `${filtered.length} of ${state.lessons.length} resources`;

  if (state.loadingLessons) {
    elements.lessonList.innerHTML =
      '<p class="subtle-copy">Loading the lessons shelf...</p>';
    return;
  }

  if (!filtered.length) {
    elements.lessonList.innerHTML =
      '<p class="subtle-copy">No lessons matched your search.</p>';
    return;
  }

  for (const lesson of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lesson-item";
    if (lesson.id === state.selectedLessonId) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      state.selectedLessonId = lesson.id;
      renderAll();
    });
    button.innerHTML = `
      <div class="lesson-topline">
        <span class="category-badge">${lesson.category}</span>
        <span class="opening-size">${lesson.availableLocally ? "available here" : "catalog only"}</span>
      </div>
      <h4>${lesson.title}</h4>
      <p>${lesson.author}</p>
      <p>${lesson.focus}</p>
    `;
    elements.lessonList.appendChild(button);
  }
}

function renderSelectedLesson() {
  if (
    !elements.selectedLessonTitle ||
    !elements.selectedLessonMeta ||
    !elements.selectedLessonSummary ||
    !elements.selectedLessonFocus ||
    !elements.selectedLessonFormat ||
    !elements.selectedLessonTags ||
    !elements.selectedLessonStatus ||
    !elements.lessonOpenLink
  ) {
    return;
  }

  const lesson = currentLesson();
  if (!lesson) {
    elements.selectedLessonTitle.textContent = "Choose a lesson";
    elements.selectedLessonMeta.textContent =
      "Pick a lesson from the shelf to see what it covers and whether it can be opened locally.";
    elements.selectedLessonSummary.textContent =
      "Your study shelf will appear here after the lesson catalog loads.";
    elements.selectedLessonFocus.textContent = "Lesson focus will appear here.";
    elements.selectedLessonFormat.textContent = "Format details will appear here.";
    elements.selectedLessonTags.className = "chip-row empty";
    elements.selectedLessonTags.textContent = "No lesson selected.";
    elements.selectedLessonStatus.className = "pill neutral";
    elements.selectedLessonStatus.textContent = "Waiting";
    elements.lessonOpenLink.href = "#";
    elements.lessonOpenLink.classList.add("disabled-link");
    elements.lessonOpenLink.setAttribute("aria-disabled", "true");
    return;
  }

  elements.selectedLessonTitle.textContent = lesson.title;
  elements.selectedLessonMeta.textContent =
    `${lesson.category} • ${lesson.author} • ${lesson.sourceName}`;
  elements.selectedLessonSummary.textContent = lesson.summary;
  elements.selectedLessonFocus.textContent = lesson.focus;
  elements.selectedLessonFormat.textContent =
    `${lesson.resourceType}${lesson.sizeMb ? ` • ${lesson.sizeMb} MB` : ""}${lesson.availableLocally ? "" : " • add the file to the local Lessons folder or keep it in Downloads to open it here"}`;
  elements.selectedLessonStatus.className = `pill ${lesson.availableLocally ? "turn-white" : "subtle"}`;
  elements.selectedLessonStatus.textContent = lesson.availableLocally
    ? "Openable Here"
    : "Catalog Only";
  elements.selectedLessonTags.innerHTML = "";
  elements.selectedLessonTags.className = lesson.tags.length ? "chip-row" : "chip-row empty";
  if (lesson.tags.length) {
    for (const tag of lesson.tags) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      elements.selectedLessonTags.appendChild(chip);
    }
  } else {
    elements.selectedLessonTags.textContent = "No lesson tags.";
  }

  if (lesson.fileUrl) {
    elements.lessonOpenLink.href = lesson.fileUrl;
    elements.lessonOpenLink.classList.remove("disabled-link");
    elements.lessonOpenLink.removeAttribute("aria-disabled");
  } else {
    elements.lessonOpenLink.href = "#";
    elements.lessonOpenLink.classList.add("disabled-link");
    elements.lessonOpenLink.setAttribute("aria-disabled", "true");
  }
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

  const previewDepth = currentLineDepth();
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
  const mode = currentPracticeMode();
  const canStart = mode === "position" || mode === "exam"
    ? state.openings.length > 0
    : Boolean(state.selectedOpeningId) && Boolean(state.selectedBook) && !state.loadingBook;
  elements.startBtn.disabled = !canStart || state.startingSession || state.loadingDatabase;
  if (elements.undoBtn) {
    elements.undoBtn.disabled =
      !state.session || !canUndoSession(state.session) || state.startingSession || state.loadingBook;
  }
  elements.resetBtn.disabled = !state.session || state.startingSession || state.loadingBook;
  elements.resetBtn.textContent = mode === "position"
    ? "New Drill"
    : mode === "exam"
      ? "New Test"
      : "Reset";
  if (state.startingSession) {
    elements.startBtn.textContent = mode === "position"
      ? "Setting Drill..."
      : mode === "exam"
        ? "Setting Test..."
        : "Starting...";
    return;
  }
  elements.startBtn.textContent = mode === "position"
    ? "Start Realistic Drill"
    : mode === "exam"
      ? "Start Blind Recall"
      : "Start Practice";
}

function renderAll() {
  renderViewState();
  renderHomeDashboard();
  renderBoard();
  renderFeedback();
  renderEngineCard();
  renderExpectedMoves();
  renderHistory();
  renderSessionHeader();
  renderOfflineStatus();
  renderPracticeModeTabs();
  renderDatabaseSummary();
  renderCategoryFilters();
  renderOpenings();
  renderVariationTree();
  renderLessonCategories();
  renderLessonsList();
  renderSelectedLesson();
  updateButtons();
}

async function requestJson(url, options = undefined) {
  const response = await fetch(url, options);
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

async function loadEngineStatus() {
  try {
    const payload = await requestJson(ENGINE_STATUS_URL);
    if (payload.available) {
      state.engine.available = true;
      state.engine.source = "server";
      state.engine.message = payload.message || "Local Stockfish is ready.";
    } else {
      await ensureBrowserEngineReady();
      state.engine.available = true;
      state.engine.source = "browser";
      state.engine.message =
        "Browser Stockfish is ready, so evaluation also works on phones and offline installs.";
    }
  } catch (_error) {
    try {
      await ensureBrowserEngineReady();
      state.engine.available = true;
      state.engine.source = "browser";
      state.engine.message =
        "Browser Stockfish is ready, so evaluation also works on phones and offline installs.";
    } catch (browserError) {
      state.engine.available = false;
      state.engine.source = "none";
      state.engine.message =
        "Stockfish could not be started locally or in the browser on this device.";
      state.engine.detailText = browserError instanceof Error
        ? browserError.message
        : String(browserError);
    }
  }

  setEngineIdleState();
  renderHomeDashboard();
  renderEngineCard();
  if (state.session && state.engine.available === true) {
    void requestEngineEvaluation();
  }
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

async function loadLessons() {
  state.loadingLessons = true;
  renderAll();

  try {
    const payload = await requestJsonWithFallback(LESSONS_URLS);
    state.lessons = payload.lessons || [];
    if (!state.selectedLessonId || !state.lessons.some((lesson) => lesson.id === state.selectedLessonId)) {
      state.selectedLessonId = state.lessons[0]?.id || null;
    }
  } catch (_error) {
    state.lessons = [];
    state.selectedLessonId = null;
  } finally {
    state.loadingLessons = false;
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

async function loadRandomDrillBook(userColor) {
  const openings = shuffled(state.openings);
  if (!openings.length) {
    throw new Error("No openings are available for realistic drill mode.");
  }

  let fallback = null;
  for (const opening of openings) {
    const book = await loadBook(opening);
    const candidate = pickDrillCandidate(book, userColor);
    if (candidate) {
      return { opening, book, candidate };
    }
    if (!fallback) {
      fallback = { opening, book, candidate: null };
    }
  }

  if (fallback) {
    return fallback;
  }

  const opening = openings[0];
  return { opening, book: await loadBook(opening), candidate: null };
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
    state.statusMessage = currentPracticeMode() === "position"
      ? "Opening loaded for line reference. Realistic Drill still chooses a random opening from the full database."
      : currentPracticeMode() === "exam"
        ? "Opening loaded for reference. Blind Recall still chooses a random opening from the full database."
      : "Opening loaded. Start line play, then tap a highlighted piece and its target square.";
    setEngineIdleState(
      currentPracticeMode() === "position"
        ? "Start realistic drill to see Stockfish evaluate a random opening position."
        : currentPracticeMode() === "exam"
          ? "Start Blind Recall to see Stockfish evaluate a random opening position with no hints."
        : "Start practice to see Stockfish evaluate the line on the board.",
    );
  } catch (error) {
    state.feedbackTone = "error";
    state.statusMessage = error.message;
    setEngineIdleState("Load an opening successfully before Stockfish can evaluate a position.");
  } finally {
    state.loadingBook = false;
    renderAll();
  }
}

async function startPractice() {
  const mode = currentPracticeMode();
  const userColor = currentSideSelection();
  const depth = currentLineDepth();

  if (mode === "line" && !state.selectedBook) {
    return;
  }
  if ((mode === "position" || mode === "exam") && !state.openings.length) {
    return;
  }

  state.selectedSquare = null;
  state.startingSession = true;
  state.feedbackTone = "neutral";
  state.statusMessage = mode === "position"
    ? "Loading a realistic drill from a random opening..."
    : mode === "exam"
      ? "Loading a blind recall from a random opening..."
      : "Starting a practice line...";
  renderAll();

  try {
    if (mode === "position" || mode === "exam") {
      const selection = await loadRandomDrillBook(userColor);
      state.selectedOpeningId = selection.opening.id;
      state.selectedBook = selection.book;
      state.session = mode === "position"
        ? createPositionSession(selection.book, userColor, depth, selection.candidate)
        : createExamSession(selection.book, userColor, depth, selection.candidate);
      if (state.session.mode === "exam" && !state.session.completed) {
        await refreshExamLegalMoves(state.session);
      }
    } else {
      state.session = createLineSession(state.selectedBook, userColor, depth);
    }
    state.feedbackTone = state.session.completed ? "complete" : "success";
    state.statusMessage = state.session.message;
  } catch (error) {
    state.feedbackTone = "error";
    state.statusMessage = error instanceof Error ? error.message : String(error);
  } finally {
    state.startingSession = false;
    renderAll();
    if (state.session) {
      void requestEngineEvaluation();
    }
  }
}

async function undoPractice() {
  if (!state.session) {
    return;
  }

  const breakpoint = undoBreakpointIndex(state.session);
  if (breakpoint < 0) {
    state.feedbackTone = "neutral";
    state.statusMessage = state.session.mode === "exam"
      ? "You are already at the current Blind Recall starting position."
      : state.session.mode === "position"
        ? "You are already at the current drill starting position."
        : "You are already at the current line starting position.";
    renderAll();
    return;
  }

  try {
    restoreSessionToHistoryPrefix(state.session, breakpoint);
    if (state.session.mode === "exam" && !state.session.completed) {
      await refreshExamLegalMoves(state.session);
    }
    state.selectedSquare = null;
    state.engine.lastFen = null;
    state.feedbackTone = "neutral";
    state.session.message = state.session.mode === "exam"
      ? `Took back your last move. No hints are shown. ${remainingDrillGoalMessage(state.session)}`
      : state.session.mode === "position"
        ? `Took back your last move. ${remainingDrillGoalMessage(state.session)}`
        : "Took back your last move. Play again from this position.";
    state.statusMessage = state.session.message;
  } catch (error) {
    state.feedbackTone = "error";
    state.statusMessage = error instanceof Error ? error.message : String(error);
  }

  renderAll();
  if (state.session) {
    void requestEngineEvaluation();
  }
}

async function resetPractice() {
  if (!state.session) {
    return;
  }

  if (state.session.mode === "position" || state.session.mode === "exam") {
    await startPractice();
    return;
  }
  if (!state.selectedBook) {
    return;
  }

  state.selectedSquare = null;
  state.session = createSession(
    state.selectedBook,
    currentSideSelection(),
    currentLineDepth(),
    state.session.mode,
  );
  state.engine.lastFen = null;
  state.feedbackTone = state.session.completed ? "complete" : "neutral";
  state.statusMessage = state.session.message;
  renderAll();
  void requestEngineEvaluation();
}

async function submitMove(move) {
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
  state.engine.lastFen = null;
  state.selectedSquare = null;
  if (state.session.mode === "exam" && !state.session.completed) {
    try {
      await refreshExamLegalMoves(state.session);
    } catch (error) {
      state.feedbackTone = "error";
      state.statusMessage = error instanceof Error ? error.message : String(error);
    }
  }
  renderAll();
  void requestEngineEvaluation();
}

function handleSquareClick(square) {
  if (!state.session || state.session.completed) {
    return;
  }

  const groupedMoves = movesByFromSquare();
  const currentTargets = groupedMoves[state.selectedSquare] || [];
  const directMove = currentTargets.find((move) => move.to === square);

  if (state.selectedSquare && directMove) {
    void submitMove(directMove);
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

if (elements.lessonSearchInput) {
  elements.lessonSearchInput.addEventListener("input", (event) => {
    state.lessonSearch = event.target.value;
    const visible = filteredLessons();
    if (!visible.some((lesson) => lesson.id === state.selectedLessonId)) {
      state.selectedLessonId = visible[0]?.id || null;
    }
    renderAll();
  });
}

if (elements.homeNav) {
  elements.homeNav.addEventListener("click", () => {
    setActiveView("home");
  });
}

if (elements.practiceNav) {
  elements.practiceNav.addEventListener("click", () => {
    setActiveView("practice");
  });
}

if (elements.lessonsNav) {
  elements.lessonsNav.addEventListener("click", () => {
    setActiveView("lessons");
  });
}

if (elements.enterPractice) {
  elements.enterPractice.addEventListener("click", () => {
    setActiveView("practice");
  });
}

if (elements.enterLessons) {
  elements.enterLessons.addEventListener("click", () => {
    setActiveView("lessons");
  });
}

if (elements.backHomePractice) {
  elements.backHomePractice.addEventListener("click", () => {
    setActiveView("home");
  });
}

if (elements.openLessonsFromPractice) {
  elements.openLessonsFromPractice.addEventListener("click", () => {
    setActiveView("lessons");
  });
}

if (elements.backHomeLessons) {
  elements.backHomeLessons.addEventListener("click", () => {
    setActiveView("home");
  });
}

if (elements.openPracticeFromLessons) {
  elements.openPracticeFromLessons.addEventListener("click", () => {
    setActiveView("practice");
  });
}

if (elements.lessonPracticeLink) {
  elements.lessonPracticeLink.addEventListener("click", () => {
    setActiveView("practice");
  });
}

if (elements.lineTab) {
  elements.lineTab.addEventListener("click", () => {
    setActiveMode("line");
  });
}

if (elements.positionTab) {
  elements.positionTab.addEventListener("click", () => {
    setActiveMode("position");
  });
}

if (elements.examTab) {
  elements.examTab.addEventListener("click", () => {
    setActiveMode("exam");
  });
}

if (elements.lineSideSelect) {
  elements.lineSideSelect.addEventListener("change", (event) => {
    syncSideSelectors(event.target.value);
    renderAll();
  });
}

if (elements.drillSideSelect) {
  elements.drillSideSelect.addEventListener("change", (event) => {
    syncSideSelectors(event.target.value);
    renderAll();
  });
}

if (elements.examSideSelect) {
  elements.examSideSelect.addEventListener("change", (event) => {
    syncSideSelectors(event.target.value);
    renderAll();
  });
}

if (elements.lineDepthSelect) {
  elements.lineDepthSelect.addEventListener("change", () => {
    renderAll();
  });
}

elements.startBtn.addEventListener("click", () => {
  void startPractice();
});

if (elements.undoBtn) {
  elements.undoBtn.addEventListener("click", () => {
    void undoPractice();
  });
}

elements.resetBtn.addEventListener("click", () => {
  void resetPractice();
});

void setupOfflineSupport();
void loadEngineStatus();
void loadDatabase();
void loadLessons();
renderAll();
