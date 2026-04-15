from __future__ import annotations

import argparse
import hashlib
import io
import json
import mimetypes
import os
import re
import shutil
import socket
import threading
import zlib
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from itertools import chain
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote, urlparse

import chess
import chess.engine
import chess.pgn


DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000
MAX_BOOK_PLY = 20
ENGINE_DEFAULT_DEPTH = 12
ENGINE_DEFAULT_TIME_MS = 180
ENGINE_CACHE_LIMIT = 256
ENGINE_ENV_VAR = "OPENING_TRAINER_ENGINE"
PROJECT_ROOT = Path(__file__).resolve().parent
STATIC_ROOT = PROJECT_ROOT / "static"
DATA_ROOT = STATIC_ROOT / "data"
BOOKS_ROOT = DATA_ROOT / "books"
ICONS_ROOT = STATIC_ROOT / "icons"
LOCAL_LESSONS_ROOT = PROJECT_ROOT / "Lessons"
DOWNLOADS_ROOT = Path.home() / "Downloads"


@dataclass(frozen=True)
class LessonSource:
    lesson_id: str
    title: str
    author: str
    category: str
    resource_type: str
    focus: str
    summary: str
    filename: str
    tags: tuple[str, ...]


@dataclass(frozen=True)
class LessonLink:
    label: str
    url: str
    source: str
    description: str


@dataclass(frozen=True)
class OpeningGuideTemplate:
    guide_id: str
    title: str
    focus: str
    summary: str
    match_prefixes: tuple[str, ...]
    tags: tuple[str, ...]
    key_ideas: tuple[str, ...]
    study_plan: tuple[str, ...]
    match_ids: tuple[str, ...] = ()
    wikipedia_slug: str | None = None
    lichess_topic: str | None = None
    related_lesson_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class LessonSection:
    title: str
    body: str
    bullets: tuple[str, ...] = ()


@dataclass(frozen=True)
class VariationGuide:
    title: str
    moves: str
    why: str
    trainer_note: str
    checkpoints: tuple[str, ...] = ()


@dataclass(frozen=True)
class MasterCourse:
    lesson_id: str
    title: str
    focus: str
    summary: str
    coach_name: str
    coach_intro: str
    author: str
    tags: tuple[str, ...]
    key_ideas: tuple[str, ...]
    study_plan: tuple[str, ...]
    sections: tuple[LessonSection, ...]
    variations: tuple[VariationGuide, ...]
    resources: tuple[LessonLink, ...]
    related_lesson_ids: tuple[str, ...]
    source_name: str
    practice_opening_id: str | None = None
    match_prefixes: tuple[str, ...] = ()
    match_ids: tuple[str, ...] = ()
    opening_names: tuple[str, ...] = ()


LESSON_LIBRARY: tuple[LessonSource, ...] = (
    LessonSource(
        lesson_id="chess-opening-essentials-vol-4",
        title="Chess Opening Essentials (Volume 4)",
        author="Stefan Djuric, Dimitri Komarov, Claudio Pantaleoni",
        category="Openings",
        resource_type="Book",
        focus="Practical opening structures, model plans, and repertoire orientation.",
        summary="A broad opening reference that helps connect early move orders to the middlegame plans that follow.",
        filename="Chess Opening Essentials (Volume 4).pdf",
        tags=("openings", "repertoire", "middlegame plans"),
    ),
    LessonSource(
        lesson_id="modern-chess-openings-15",
        title="Modern Chess Openings (15th Edition)",
        author="Nick de Firmian",
        category="Openings",
        resource_type="Reference",
        focus="Encyclopedic opening lookup and move-order reference.",
        summary="Use this as the deeper reference shelf when you want to compare sidelines, transpositions, and broader theory.",
        filename="kupdf.net_modern-chess-openings-15th-edition.pdf",
        tags=("openings", "reference", "theory"),
    ),
    LessonSource(
        lesson_id="attacking-with-1d4",
        title="Attacking with 1.d4",
        author="Angus Dunnington",
        category="Openings",
        resource_type="Course Pack",
        focus="Aggressive Queen's Pawn structures and practical attacking setups.",
        summary="A repertoire-oriented resource that fits naturally beside your opening trainer work for 1.d4 systems.",
        filename="6.-attacking-with-1d-4-angus-dunnington.zip",
        tags=("openings", "1.d4", "attacking"),
    ),
    LessonSource(
        lesson_id="my-system",
        title="My System",
        author="Aron Nimzowitsch",
        category="Strategy",
        resource_type="Book",
        focus="Prophylaxis, pawn chains, restraint, and classical positional play.",
        summary="A cornerstone strategy book for understanding why plans work, not just which moves appear in theory.",
        filename="My System.pdf",
        tags=("strategy", "positional play", "planning"),
    ),
    LessonSource(
        lesson_id="logical-chess-move-by-move",
        title="Logical Chess: Move by Move",
        author="Irving Chernev",
        category="Annotated Games",
        resource_type="Book",
        focus="Explain every move and connect opening choices to practical plans.",
        summary="Ideal for turning abstract ideas into readable, move-by-move decisions you can mimic in your own games.",
        filename="Chessbook - Irving Chernev - Logical Chess - Move by Move.pdf",
        tags=("annotated games", "planning", "decision making"),
    ),
    LessonSource(
        lesson_id="improve-your-chess-now",
        title="Improve Your Chess Now",
        author="Jonathan Tisdall",
        category="Strategy",
        resource_type="Book",
        focus="Thought process, imbalances, and practical decision quality.",
        summary="A strong bridge from theory to calculation, helping you choose plans and candidate moves with more structure.",
        filename="Improve_Your_Chess_Now.pdf",
        tags=("strategy", "calculation", "candidate moves"),
    ),
    LessonSource(
        lesson_id="better-chess-for-young-players",
        title="Better Chess For Young Players",
        author="Murray Chandler",
        category="Training",
        resource_type="Book",
        focus="Core chess habits and accessible improvement principles.",
        summary="A practical study guide with beginner-friendly explanations that still support serious long-term improvement.",
        filename="Better Chess For Young Players (small).pdf",
        tags=("training", "fundamentals", "improvement"),
    ),
    LessonSource(
        lesson_id="what-it-takes-to-become-a-chess-master",
        title="What It Takes To Become a Chess Master",
        author="Andrew Soltis",
        category="Training",
        resource_type="Book",
        focus="How strong players train, evaluate positions, and convert improvement into results.",
        summary="A study companion for structuring your improvement work beyond openings alone.",
        filename="What_It_Takes_To_Become_a_Chess_Master.pdf",
        tags=("training", "mastery", "improvement"),
    ),
    LessonSource(
        lesson_id="the-will-to-win",
        title="Chess Psychology: The Will to Win!",
        author="William Stewart",
        category="Psychology",
        resource_type="Book",
        focus="Competitive mindset, confidence, and emotional control.",
        summary="A psychology shelf item for handling nerves, momentum swings, and practical confidence at the board.",
        filename="Chess Psychology - William Stewart - The Will to Win!.pdf",
        tags=("psychology", "competition", "mindset"),
    ),
    LessonSource(
        lesson_id="1000-mate-in-2",
        title="1000 Chess Exercises: Mate in 2 Moves",
        author="Unknown / Compilation",
        category="Tactics",
        resource_type="Workbook",
        focus="Fast mating-pattern recognition and tactical repetition.",
        summary="A dense tactics drill source for sharpening pattern recognition away from the opening trainer.",
        filename="1000-chess-exercises-mate-in-2-moves.pdf",
        tags=("tactics", "mate in 2", "pattern recognition"),
    ),
    LessonSource(
        lesson_id="bobby-fischer-teaches-chess",
        title="Bobby Fischer Teaches Chess",
        author="Bobby Fischer, Stuart Margulies, Donn Mosenfelder",
        category="Tactics",
        resource_type="Workbook",
        focus="Basic tactical motifs, mating nets, and forcing play.",
        summary="A classic workbook format that reinforces tactical discipline in a simple, direct way.",
        filename="Bobby_Fischer_Teaches_Chess_by_Bobby_Fischer.pdf",
        tags=("tactics", "forcing moves", "workbook"),
    ),
    LessonSource(
        lesson_id="rook-endings",
        title="Comprehensive Chess Endings 5: Rook Endings",
        author="Yuri Averbakh",
        category="Endgames",
        resource_type="Reference",
        focus="Technical rook endings, conversion technique, and defensive resources.",
        summary="A serious endgame reference for the most common practical endgame family in real tournament play.",
        filename="Averbakh, Yuri - Comprehensive Chess Endings 5 - Rook Endings.pdf",
        tags=("endgames", "rook endings", "technique"),
    ),
)

DEFAULT_OPENING_REFERENCE_IDS = (
    "chess-opening-essentials-vol-4",
    "modern-chess-openings-15",
    "logical-chess-move-by-move",
)

D4_REFERENCE_IDS = (
    "attacking-with-1d4",
    "chess-opening-essentials-vol-4",
    "modern-chess-openings-15",
)

MASTER_COURSES: tuple[MasterCourse, ...] = (
    MasterCourse(
        lesson_id="course-queens-gambit-white",
        title="Queen's Gambit Master Course For White",
        focus="Build a White repertoire around 1.d4 2.c4 that is principled, correct, and practical through move five and beyond.",
        summary="This course teaches the Queen's Gambit as a complete White system. The goal is not just to remember a move list, but to understand which central tension you are creating, which black setups are most common, and which clean move-order choices keep you in control against club-level sidelines and main lines alike.",
        coach_name="Trainer Rook",
        coach_intro="Trainer Rook says: do not think of the Queen's Gambit as one opening. Think of it as one question - can Black solve the d5-pawn tension without conceding structure, space, or development? Every variation in this course is an answer to that question.",
        author="Trainer Rook",
        tags=(
            "opening course",
            "queen's gambit",
            "white repertoire",
            "d4 openings",
            "positional play",
        ),
        key_ideas=(
            "Your c4-pawn is not a random gambit. It asks Black whether the d5-pawn can stay healthy once the center is challenged.",
            "Against ...e6 you are usually aiming for either central pressure or the long-term minority-attack style structures that come from the QGD.",
            "Against ...dxc4 you must regain the pawn with development, not with greed.",
            "Against ...c6 you must recognize whether Black is heading for a pure Slav, a Semi-Slav structure, or a quick ...dxc4 setup.",
            "The cleanest White move orders are usually the ones that keep e2-e4 as a future option.",
        ),
        study_plan=(
            "Memorize the branch map first: QGD, QGA, Slav, and then the rare sidelines.",
            "Play the recommended line in each branch until you can say the plan aloud without looking.",
            "After every drill, explain which side is fighting for e4, c4, or the c-file. If you cannot explain that, the line is not learned yet.",
            "Review one main-line branch and one rare sideline each session so practical coverage stays broad.",
        ),
        sections=(
            LessonSection(
                title="Opening DNA",
                body="The Queen's Gambit starts with 1.d4 d5 2.c4. White is not trying to win a pawn immediately. White is trying to make Black decide how to defend the d5-pawn and what kind of center Black is willing to accept.",
                bullets=(
                    "If Black keeps the center with ...e6, the game becomes a Queen's Gambit Declined structure.",
                    "If Black captures with ...dxc4, White should regain the pawn while developing rapidly.",
                    "If Black supports d5 with ...c6, the game becomes a Slav family position and the bishop on c8 matters a lot.",
                ),
            ),
            LessonSection(
                title="What White Is Really Playing For",
                body="White's long-term dream is one of three things: a safe e2-e4 break, lasting pressure on the queenside dark squares, or a favorable endgame structure after Black solves the opening a little too passively.",
                bullets=(
                    "In QGD structures, White often wins by better space usage and cleaner piece coordination.",
                    "In the QGA, White often wins time and development by recovering the pawn naturally.",
                    "In Slav positions, White often has to prove slightly more space while Black proves slightly more solidity.",
                ),
            ),
            LessonSection(
                title="Move-Order Discipline",
                body="The easiest way to spoil a Queen's Gambit repertoire is to play useful-looking moves in the wrong order. Your first priority is to identify the branch correctly, then choose the setup that fits that branch.",
                bullets=(
                    "Against the QGA, Nf3 and e3 are usually the practical path to getting the c4-pawn back without drama.",
                    "Against the Slav, Nf3 and Nc3 keep both rapid development and the a4 idea available.",
                    "Against the QGD, Nc3 first is often the clearest way to keep central pressure and active piece play.",
                ),
            ),
            LessonSection(
                title="Typical Club-Level Mistakes To Punish",
                body="At club level, Black often grabs the c4-pawn too long, delays development, or copies moves from one branch into another where they no longer fit.",
                bullets=(
                    "If Black hangs onto the c4-pawn in the QGA with too many pawn moves, White should hit the center and develop instead of hunting the pawn with the queen.",
                    "If Black treats the Slav like a QGD and never clarifies the c8-bishop, White often gets smoother development.",
                    "If Black enters the Albin or Chigorin without understanding the pawn structure, principled development is usually enough for White to keep the upper hand.",
                ),
            ),
        ),
        variations=(
            VariationGuide(
                title="Main Line Versus The Queen's Gambit Declined",
                moves="1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 O-O 6.Nf3",
                why="This is the classical Queen's Gambit structure. White develops harmoniously, keeps pressure on d5, and prepares Rc1, Bd3, or Qc2 depending on Black's setup.",
                trainer_note="Trainer Rook: this line is not about a quick tactic. It is about refusing to give Black an easy freeing break.",
                checkpoints=(
                    "Do not rush cxd5 unless the resulting structure benefits you.",
                    "Remember that Bg5 is useful because it makes ...Ne4 and ...dxc4 more difficult to arrange comfortably.",
                ),
            ),
            VariationGuide(
                title="Exchange QGD Repertoire Line",
                moves="1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.cxd5 exd5 5.Bg5 Be7 6.e3",
                why="The Exchange line gives White a stable structural edge to work with. The usual long-term plan is active piece play and, in many cases, the minority attack with b4-b5 later on.",
                trainer_note="Trainer Rook: symmetrical pawns do not mean symmetrical play. White usually has the easier plan.",
                checkpoints=(
                    "You are playing against Black's queenside structure, not trying to prove an immediate tactical edge.",
                    "Keep your light-squared bishop active before committing too many pawns.",
                ),
            ),
            VariationGuide(
                title="Queen's Gambit Accepted Recovery Line",
                moves="1.d4 d5 2.c4 dxc4 3.Nf3 Nf6 4.e3 e6 5.Bxc4 c5 6.O-O",
                why="This is the practical White answer to the QGA. White regains the pawn with development and reaches an open position where the healthier center and faster king safety matter.",
                trainer_note="Trainer Rook: when Black takes on c4, your revenge is development, not pawn greed.",
                checkpoints=(
                    "Avoid early queen adventures unless Black makes a concrete mistake.",
                    "Once the pawn is back, compare whose pieces are easier to activate. It is usually White's.",
                ),
            ),
            VariationGuide(
                title="Slav Main Line Blueprint",
                moves="1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 dxc4 5.a4 Bf5 6.e3",
                why="The a4 move stops ...b5 ideas and prepares Bxc4 without letting Black hold the c4-pawn cheaply. This is one of the key structural tests of the Slav.",
                trainer_note="Trainer Rook: in the Slav, respect Black's solidity but do not let the extra c-pawn stay alive for free.",
                checkpoints=(
                    "The point of a4 is strategic, not decorative: it removes Black's easiest way of hanging onto c4.",
                    "If Black solves the bishop problem comfortably, your opening edge shrinks fast.",
                ),
            ),
            VariationGuide(
                title="Quiet Slav Structure",
                moves="1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.e3 Bf5 5.Nc3 e6 6.Nh4",
                why="This line teaches an important White idea: if Black develops the c8-bishop too early, White can often challenge it directly and gain the bishop pair or structural concessions.",
                trainer_note="Trainer Rook: the bishop on f5 is only active if White leaves it alone.",
                checkpoints=(
                    "Nh4 is not a random knight jump; it asks whether Black's bishop is overextended.",
                    "If Black retreats badly, White keeps a pleasant spatial edge with easy development.",
                ),
            ),
            VariationGuide(
                title="Albin Countergambit Refutation Scheme",
                moves="1.d4 d5 2.c4 e5 3.dxe5 d4 4.Nf3 Nc6 5.a3 Be6 6.Nbd2",
                why="The Albin is dangerous only if White panics. White should finish development, challenge the advanced d-pawn, and avoid giving Black cheap initiative.",
                trainer_note="Trainer Rook: when Black gambits in the Albin, your job is not to attack immediately. Your job is to prove the d4-pawn cannot live forever.",
                checkpoints=(
                    "Do not waste time trying to win by force; simply undermine d4 and complete development.",
                    "Fianchetto setups are often strong once the center is stable.",
                ),
            ),
            VariationGuide(
                title="Chigorin Defense Practical Line",
                moves="1.d4 d5 2.c4 Nc6 3.Nc3 Nf6 4.Nf3 Bg4 5.cxd5 Nxd5 6.e4",
                why="White reacts to Black's unusual knight development with classical central play. If Black spends time on piece pressure instead of center stability, White can often seize space.",
                trainer_note="Trainer Rook: against the Chigorin, trust the center first and only then calculate tactics.",
                checkpoints=(
                    "The move e4 is the key proof move whenever Black allows it under good conditions.",
                    "Do not drift into passive development against an offbeat defense.",
                ),
            ),
            VariationGuide(
                title="Marshall Defense Quick Answer",
                moves="1.d4 d5 2.c4 Nf6 3.cxd5 Nxd5 4.Nf3 Nf6 5.Nc3 e6 6.e4",
                why="The Marshall Defense tries to sidestep normal Queen's Gambit structures. White should answer classically, recover central space, and make Black justify the knight excursion.",
                trainer_note="Trainer Rook: when Black leaves the main road too early, the simplest punishment is often to claim the center cleanly.",
                checkpoints=(
                    "Do not rush to win by force; just use the time Black spent moving the knight twice.",
                    "Rare lines such as the Marshall or Baltic are usually beaten by calm development plus central space.",
                ),
            ),
        ),
        resources=(
            LessonLink(
                label="Queen's Gambit overview",
                url="https://en.wikipedia.org/wiki/Queen%27s_Gambit",
                source="Wikipedia",
                description="Overview of the opening family and Black's major replies after 1.d4 d5 2.c4.",
            ),
            LessonLink(
                label="Queen's Gambit opening guide",
                url="https://www.chess.com/openings/Queens-Gambit",
                source="Chess.com",
                description="Practical opening page with branch map, starting ideas, and linked variations.",
            ),
            LessonLink(
                label="Queen's Gambit Declined reference",
                url="https://en.wikipedia.org/wiki/Queen%27s_Gambit_Declined",
                source="Wikipedia",
                description="Reference page for QGD structures, the traditional line, and the Exchange Variation.",
            ),
            LessonLink(
                label="Queen's Gambit Accepted reference",
                url="https://en.wikipedia.org/wiki/Queen%27s_Gambit_Accepted",
                source="Wikipedia",
                description="Reference page for the accepted line and the key pawn-recovery ideas for White.",
            ),
            LessonLink(
                label="Slav Defense reference",
                url="https://en.wikipedia.org/wiki/Slav_Defense",
                source="Wikipedia",
                description="Reference page for the Slav main line and the central role of the c8-bishop.",
            ),
            LessonLink(
                label="Queen's Gambit study collection",
                url="https://lichess.org/study/topic/Queens%20Gambit%20Declined/popular",
                source="Lichess Studies",
                description="Community study collection that is useful for visualizing model positions and plans.",
            ),
        ),
        related_lesson_ids=(
            "attacking-with-1d4",
            "chess-opening-essentials-vol-4",
            "modern-chess-openings-15",
            "my-system",
            "logical-chess-move-by-move",
        ),
        source_name="White master course",
        opening_names=(
            "QGD Main Line",
            "QGD Exchange",
            "QGA Recovery Line",
            "Slav Main Line",
            "Slav Quiet Line",
            "Albin Countergambit",
            "Chigorin Defense",
            "Marshall Defense",
        ),
    ),
    MasterCourse(
        lesson_id="course-caro-kann-black",
        title="Caro-Kann Master Course For Black",
        focus="Build a dependable Black repertoire against 1.e4 that is structurally sound, practical, and ready for the main white tries through move five and beyond.",
        summary="This course teaches the Caro-Kann as a complete Black system. You will learn not just where the pieces go, but why the c6-d5 structure is so resilient, how the light-squared bishop shapes almost every branch, and how to answer the main White systems without losing the positional logic that makes the Caro-Kann strong.",
        coach_name="Trainer Rook",
        coach_intro="Trainer Rook says: the Caro-Kann is not passive. It is disciplined. If you know when to trade in the center, when to preserve structure, and when the bishop belongs outside the chain, you will reach good positions against almost every club-level 1.e4 player.",
        author="Trainer Rook",
        tags=(
            "opening course",
            "caro-kann",
            "black repertoire",
            "e4 defense",
            "solid chess",
        ),
        key_ideas=(
            "The move ...c6 prepares ...d5 while keeping the c8-bishop free, which is the whole strategic point of choosing the Caro-Kann over the French.",
            "In most branches Black is trying to solve development without accepting long-term structural damage.",
            "The c-pawn trade often defines the middlegame: Exchange and Panov lines are about structure; Classical and Advance lines are about piece placement and timing.",
            "Against sharp white ideas such as the Fantasy, the simplest antidote is often central clarity rather than fancy tactics.",
            "If you know where the light-squared bishop belongs, you understand half of the opening already.",
        ),
        study_plan=(
            "Memorize the branch map first: Classical, 3.Nd2, Advance, Exchange, Panov, Fantasy, then the rare tries.",
            "Train one solid branch and one sharp branch in the same session so your repertoire stays balanced.",
            "After each drill, explain whether Black's job was to keep structure, trade a knight, or counterattack the center.",
            "Review the Advance and Panov often, because those are the branches where White players most often try to take the initiative early.",
        ),
        sections=(
            LessonSection(
                title="Opening DNA",
                body="The Caro-Kann begins with 1.e4 c6, aiming for ...d5 next. Black wants a French-like central challenge without burying the c8-bishop behind the e6-pawn chain.",
                bullets=(
                    "Your opening is built on structure first and counterplay second.",
                    "The usual Caro-Kann success story is simple: equalize the center cleanly, finish development, and let White prove an advantage that often is not there.",
                    "The more White overextends, the more attractive Black's solid shell becomes.",
                ),
            ),
            LessonSection(
                title="The Light-Squared Bishop Rule",
                body="If you are lost in a Caro-Kann position, look at the c8-bishop. In the good versions of the opening, that bishop comes out before Black locks the e-pawn or at least has a clear route to activity.",
                bullets=(
                    "In the Classical line, Bf5 is the signature move because it develops before e6 closes the diagonal.",
                    "In the Advance line, the bishop often comes to f5 or g6 and Black must decide whether to strike with ...c5 or ...e6 first.",
                    "In the Panov and Exchange structures, the bishop can become a pure endgame piece if Black is too casual.",
                ),
            ),
            LessonSection(
                title="How Black Equalizes",
                body="Black rarely equalizes in the Caro-Kann by one tactical sequence. Black equalizes by reaching a position where White has no easy target, Black has no structural scars, and the center is under control.",
                bullets=(
                    "Against 3.Nc3 or 3.Nd2, Black often seeks a clean knight exchange and a stable pawn skeleton.",
                    "Against the Advance, Black usually wants timely pressure on d4 and a plan against White's kingside space.",
                    "Against the Panov, Black must judge whether the isolated queen's pawn positions favor activity or simplification.",
                ),
            ),
            LessonSection(
                title="Typical Club-Level Mistakes To Punish",
                body="White often attacks too early in the Caro-Kann or copies a fashionable line without understanding the structure. That is where Black scores.",
                bullets=(
                    "If White pushes too many kingside pawns in the Advance without development, Black's central counterplay arrives quickly.",
                    "If White treats the Exchange like a dead draw, Black often gets the easier piece play and cleaner endgame.",
                    "If White enters the Fantasy without concrete preparation, Black's direct central strike is often enough.",
                ),
            ),
        ),
        variations=(
            VariationGuide(
                title="Classical Repertoire Core",
                moves="1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5 5.Ng3 Bg6",
                why="This is the cleanest classical Caro-Kann shell. Black develops the bishop actively, keeps the structure healthy, and asks White to prove an edge in a balanced position.",
                trainer_note="Trainer Rook: in the Classical line, you are not surviving. You are building a position you understand better than your opponent.",
                checkpoints=(
                    "Bf5 is the move that justifies the Caro-Kann conceptually.",
                    "After Ng3, Bg6 keeps the bishop alive and preserves Black's structure.",
                ),
            ),
            VariationGuide(
                title="3.Nd2 Karpov-Style Setup",
                moves="1.e4 c6 2.d4 d5 3.Nd2 dxe4 4.Nxe4 Nd7 5.Nf3 Ngf6",
                why="The 3.Nd2 line aims to reduce some of White's sharper options. Black responds with a compact setup, planning smooth development and stable central control.",
                trainer_note="Trainer Rook: this branch is about not giving White a clear target. Everything Black does should feel modest and healthy.",
                checkpoints=(
                    "The move ...Nd7 avoids committing the bishop too early and prepares ...Ngf6 cleanly.",
                    "Do not rush pawn breaks until development is coordinated.",
                ),
            ),
            VariationGuide(
                title="Advance Variation Main Answer",
                moves="1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nc3 e6 5.g4 Bg6 6.Nge2 c5",
                why="White grabs space, so Black must challenge the center and avoid getting squeezed. The bishop retreat to g6 and the later ...c5 strike are the key thematic ideas.",
                trainer_note="Trainer Rook: if White gains space, your job is not to complain about space. Your job is to undermine it.",
                checkpoints=(
                    "Do not abandon the bishop pair concept too cheaply in the Advance.",
                    "The move ...c5 is often the soul of Black's counterplay.",
                ),
            ),
            VariationGuide(
                title="Advance Variation Quiet Setup",
                moves="1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nf3 e6 5.Be2 c5 6.O-O",
                why="Many club players choose a quieter Advance setup. Black should still answer with the same logic: finish development, hit d4, and avoid letting White keep a free space edge.",
                trainer_note="Trainer Rook: the quieter White is, the more you should trust the standard Caro-Kann plan.",
                checkpoints=(
                    "The structure matters more than the exact move order here.",
                    "Black is usually aiming for ...Nc6, ...Qb6, or ...Ne7 depending on White's setup.",
                ),
            ),
            VariationGuide(
                title="Exchange Variation Structure",
                moves="1.e4 c6 2.d4 d5 3.exd5 cxd5 4.Bd3 Nc6 5.c3 Nf6 6.Bf4",
                why="The Exchange line is strategically important because it teaches how Black develops in a symmetrical structure without drifting into passivity.",
                trainer_note="Trainer Rook: symmetrical pawns are an invitation to outplay, not an excuse to relax.",
                checkpoints=(
                    "Develop actively and compare piece quality, not just pawn shape.",
                    "If White plays routinely, Black often gets very comfortable equality.",
                ),
            ),
            VariationGuide(
                title="Panov-Botvinnik Answer",
                moves="1.e4 c6 2.d4 d5 3.exd5 cxd5 4.c4 Nf6 5.Nc3 e6 6.Nf3",
                why="The Panov tries to create an isolated queen's pawn or open piece play. Black answers by completing development and keeping the central tension under control.",
                trainer_note="Trainer Rook: in the Panov, do not fear activity. Just make sure White's activity is tied to a structural weakness.",
                checkpoints=(
                    "Know whether White is heading for an IQP or a symmetrical structure.",
                    "Black often aims for ...Nc6, ...Be7, and calm pressure rather than flashy tactics.",
                ),
            ),
            VariationGuide(
                title="Fantasy Variation Safety Net",
                moves="1.e4 c6 2.d4 d5 3.f3 dxe4 4.fxe4 e5 5.Nf3 exd4 6.Bc4",
                why="The Fantasy is sharp, but Black does not need to panic. The clean central strike with ...dxe4 and ...e5 challenges White's setup before the kingside attack becomes real, and Black often welcomes the open center.",
                trainer_note="Trainer Rook: when White spends a move on f3, ask whether the center can be hit immediately. In the Caro-Kann, the answer is often yes.",
                checkpoints=(
                    "Meet the Fantasy with central clarity, not with timid development.",
                    "The more White delays development, the more attractive Black's immediate central play becomes.",
                ),
            ),
            VariationGuide(
                title="Rare-Tries Practical Response",
                moves="1.e4 c6 2.Nc3 d5 3.Nf3 Bg4 4.h3 Bxf3 5.Qxf3 e6",
                why="Against move-order tricks and modest sidelines, Black should keep the same Caro-Kann logic: challenge the center, develop without damage, and avoid inventing unnecessary complications.",
                trainer_note="Trainer Rook: rare tries should still be answered by your opening principles, not by guesswork.",
                checkpoints=(
                    "If White delays d4, ask whether a classical Caro shell is still easy to build.",
                    "Most sidelines score because Black abandons structure. Do not do that.",
                ),
            ),
        ),
        resources=(
            LessonLink(
                label="Caro-Kann overview",
                url="https://en.wikipedia.org/wiki/Caro%E2%80%93Kann_Defence",
                source="Wikipedia",
                description="Reference page for the main branches, including the Classical, Modern, Advance, Exchange, and Panov structures.",
            ),
            LessonLink(
                label="Caro-Kann opening guide",
                url="https://www.chess.com/openings/Caro-Kann-Defense",
                source="Chess.com",
                description="Practical Caro-Kann guide with variation map and linked sub-branches.",
            ),
            LessonLink(
                label="Caro-Kann study collection",
                url="https://lichess.org/study/topic/Caro-Kann%20Defense/hot",
                source="Lichess Studies",
                description="Community studies and example branches that are useful for model-game review.",
            ),
            LessonLink(
                label="Classical Caro-Kann branch",
                url="https://www.chess.com/fa/openings/Caro-Kann-Defense-Classical-Variation",
                source="Chess.com",
                description="Opening page focused on the Classical Variation after 3.Nc3 dxe4 4.Nxe4 Bf5.",
            ),
            LessonLink(
                label="Fantasy Variation branch",
                url="https://www.chess.com/openings/Caro-Kann-Defense-Fantasy-Variation-3...e6-4.Nc3",
                source="Chess.com",
                description="Opening page for one of White's sharper anti-Caro systems.",
            ),
        ),
        related_lesson_ids=(
            "chess-opening-essentials-vol-4",
            "modern-chess-openings-15",
            "my-system",
            "logical-chess-move-by-move",
            "improve-your-chess-now",
        ),
        source_name="Black master course",
        practice_opening_id="kingspawn-caro-kannclassic",
        match_prefixes=("kingspawn-caro-kann",),
    ),
)

OPENING_GUIDES: tuple[OpeningGuideTemplate, ...] = (
    OpeningGuideTemplate(
        guide_id="guide-alekhine-defense",
        title="Alekhine Defence Guide",
        focus="Learn when White should chase the knight and when to consolidate the space edge with calm development.",
        summary="Use this guide for the Alekhine files in your repertoire so you understand the central pawn chain, Black's counterplay against it, and the moments where development matters more than pawn grabbing.",
        match_prefixes=("kingspawn-alekhine",),
        tags=("openings", "alekhine", "space advantage", "counterplay"),
        key_ideas=(
            "Build the center without letting it become overextended.",
            "Watch for ...d6 and ...c5 breaks that challenge White's pawn chain.",
            "Compare quiet development lines with sharper pawn-chasing continuations.",
        ),
        study_plan=(
            "Read the overview so the purpose of Black's knight provocation is clear.",
            "Play through one community study and note how White stabilizes the center before attacking.",
            "Return to the trainer and test the same family until the main central plans feel automatic.",
        ),
        wikipedia_slug="Alekhine%27s_Defence",
        lichess_topic="Alekhine Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("improve-your-chess-now",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-caro-kann",
        title="Caro-Kann Guide",
        focus="Understand why the Caro-Kann is so solid, where Black's light-squared bishop belongs, and which pawn structures your lines lead to.",
        summary="Your Caro-Kann files become much easier to remember once you connect each branch to its structure: Advance pressure, Exchange symmetry, Panov activity, or Classical development battles.",
        match_prefixes=("kingspawn-caro-kann",),
        tags=("openings", "caro-kann", "structures", "solid defense"),
        key_ideas=(
            "Track the battle between Black's c-pawn and White's center.",
            "Notice when Black solves the light-squared bishop and when that is the whole point of White's setup.",
            "Use the structure, not just the moves, to remember the correct plan.",
        ),
        study_plan=(
            "Start with the overview article and identify which structure belongs to each of your repertoire files.",
            "Use the Lichess studies to compare the Advance, Classical, Exchange, and Panov themes.",
            "Drill one Caro-Kann branch in the app, then explain the resulting pawn structure in your own words.",
        ),
        wikipedia_slug="Caro-Kann_Defence",
        lichess_topic="Caro-Kann Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("my-system",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-french-defense",
        title="French Defence Guide",
        focus="Study the blocked center, the c5 break, and the kingside-versus-queenside plans that make French positions memorable.",
        summary="This guide ties together your French Advance, Exchange, Tarrasch, Winawer, Rubinstein, and side-line files so you can navigate the recurring pawn-chain ideas instead of memorizing isolated branches.",
        match_prefixes=("kingspawn-fr", "kingspawn-french"),
        tags=("openings", "french", "pawn chains", "counterattack"),
        key_ideas=(
            "The pawn chain e5-d4 versus e6-d5 tells you where both sides should play.",
            "Black often seeks ...c5 and ...f6; White usually plays for space and kingside initiative.",
            "Different French branches mainly change how quickly those strategic clashes arrive.",
        ),
        study_plan=(
            "Read the overview and write down the standard pawn breaks for both sides.",
            "Use the study collection to compare Advance, Tarrasch, Winawer, and Rubinstein plans.",
            "Train one French line in the app and stop after each game to name the key pawn breaks aloud.",
        ),
        wikipedia_slug="French_Defence",
        lichess_topic="French Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("my-system", "improve-your-chess-now"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-modern-defense",
        title="Modern Defence Guide",
        focus="Learn the hypermodern idea of allowing the center first and attacking it later with flexible piece play.",
        summary="Your Modern Defence files work best when you see them as flexible counterplay systems: Black delays direct central contact, fianchettos, and then chooses the right break against White's center.",
        match_prefixes=("kingspawn-modern",),
        tags=("openings", "modern defense", "hypermodern", "counterplay"),
        key_ideas=(
            "Black invites White to occupy the center and then undermines it.",
            "The dark-squared bishop and pawn breaks define the opening far more than early forcing tactics.",
            "Move-order awareness matters because the Modern can transpose into Pirc-like setups or independent play.",
        ),
        study_plan=(
            "Read the overview so the hypermodern logic behind the opening is clear.",
            "Use the study collection to compare the main central setups White can choose.",
            "Return to the trainer and practice recognizing which Black break fits each structure.",
        ),
        wikipedia_slug="Modern_Defence",
        lichess_topic="Modern Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("my-system",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-pirc-defense",
        title="Pirc Defence Guide",
        focus="Study the Pirc as a dynamic kingside-fianchetto defense where timing and piece harmony matter more than grabbing space quickly.",
        summary="This guide complements your Pirc files by connecting the Austrian-style attacking ideas for White with Black's central breaks and piece pressure against the extended center.",
        match_prefixes=("kingspawn-pirc",),
        tags=("openings", "pirc", "hypermodern", "piece play"),
        key_ideas=(
            "White usually claims space first; Black strikes when the setup is ready.",
            "Watch the timing of ...e5 or ...c5 and how they change the character of the game.",
            "The Pirc rewards understanding development schemes more than memorizing one forcing line.",
        ),
        study_plan=(
            "Read the overview to fix the main plans for both sides in memory.",
            "Browse a study collection and focus on how the center is challenged, not only on the moves.",
            "Test the Pirc files in practice and review any position where the central break felt unclear.",
        ),
        wikipedia_slug="Pirc_Defence",
        lichess_topic="Pirc Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("improve-your-chess-now",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-scandinavian-defense",
        title="Scandinavian Defence Guide",
        focus="See the Scandinavian as an early central confrontation where development and queen placement dictate the middlegame.",
        summary="Your Scandinavian files make more sense when you compare the queen recapture choices, White's development targets, and Black's plan to finish development without losing time.",
        match_prefixes=("kingspawn-scand",),
        tags=("openings", "scandinavian", "development", "queen activity"),
        key_ideas=(
            "Black solves the e-pawn problem immediately but must justify the queen activity.",
            "White often aims for rapid development and pressure on the centralized queen.",
            "Many lines are decided by who uses the early tempi more efficiently.",
        ),
        study_plan=(
            "Use the overview to compare the main queen setups and why each exists.",
            "Review a study collection and note how Black completes development after the queen moves.",
            "Practice your Scandinavian branches and check whether you remember the development targets, not only the move order.",
        ),
        wikipedia_slug="Scandinavian_Defense",
        lichess_topic="Scandinavian Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("logical-chess-move-by-move",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-sicilian-defense",
        title="Sicilian Defence Guide",
        focus="Learn the Sicilian by recurring themes: uneven pawn structures, active piece play, and the race between opposite-side plans.",
        summary="This guide supports your large Sicilian repertoire by grouping together the Open Sicilian, Alapin, Closed, Dragon, Najdorf, Taimanov, Kan, Moscow, and anti-Sicilian branches around their common structural ideas.",
        match_prefixes=("kingspawn-sic",),
        tags=("openings", "sicilian", "imbalances", "counterplay"),
        key_ideas=(
            "The Sicilian is about imbalance: Black accepts some space loss to gain dynamic counterplay.",
            "Typical pawn structures matter more than exact move orders when you are building understanding.",
            "Different Sicilian branches usually change where the attack and counterplay land, not whether imbalance exists.",
        ),
        study_plan=(
            "Read the overview and map your files into Open Sicilian, anti-Sicilian, and closed-system groups.",
            "Use the studies to compare Dragon, Najdorf, Taimanov, Kan, and anti-Sicilian ideas.",
            "Practice one Sicilian family at a time and review how each side's pawn breaks define the middlegame.",
        ),
        wikipedia_slug="Sicilian_Defence",
        lichess_topic="Sicilian Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("improve-your-chess-now", "1000-mate-in-2"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-nimzowitsch-defense",
        title="Nimzowitsch Defence Guide",
        focus="Use this guide for the early ...Nc6 systems so you understand the provocative setup and the central fight it invites.",
        summary="Your Nimzo Defense file in the King's Pawn folder is really a Nimzowitsch-style defense to 1.e4, so this guide focuses on why Black develops the queen's knight early and how White should respond cleanly.",
        match_prefixes=("kingspawn-nimzodefense",),
        tags=("openings", "nimzowitsch defense", "provocative setup", "center"),
        key_ideas=(
            "Black develops unusually early with ...Nc6 and asks White to prove the center can be maintained.",
            "White usually benefits from principled development and central space instead of overreacting.",
            "You remember these lines better when you see them as a challenge to classical opening priorities.",
        ),
        study_plan=(
            "Read the overview and note the strategic point behind Black's early knight move.",
            "Use the study collection to compare sensible White setups against Black's offbeat move order.",
            "Practice the file in the trainer and focus on why each developing move matters.",
        ),
        wikipedia_slug="Nimzowitsch_Defence",
        lichess_topic="Nimzowitsch Defense",
        related_lesson_ids=DEFAULT_OPENING_REFERENCE_IDS + ("logical-chess-move-by-move",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-benko-gambit",
        title="Benko Gambit Guide",
        focus="Study the long-term queenside pressure and piece activity that justify Black's pawn sacrifice.",
        summary="This guide helps you understand why the Benko is playable at all: Black gives material for files, diagonals, and enduring pressure, so memory improves when you track compensation rather than just tactics.",
        match_prefixes=("queenspawn-benkogambit",),
        tags=("openings", "benko gambit", "queenside pressure", "initiative"),
        key_ideas=(
            "Black sacrifices a pawn for open lines and long-term piece activity.",
            "White must choose between holding material and neutralizing pressure efficiently.",
            "The resulting middlegames are often easier to play when you understand the strategic compensation.",
        ),
        study_plan=(
            "Read the overview to understand Black's compensation before looking at concrete lines.",
            "Browse study examples and notice how rooks and bishops use the open queenside files and diagonals.",
            "Practice the Benko file in the app and review whether you can explain the compensation after each session.",
        ),
        wikipedia_slug="Benko_Gambit",
        lichess_topic="Benko Gambit",
        related_lesson_ids=D4_REFERENCE_IDS + ("improve-your-chess-now",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-black-knights-tango",
        title="Black Knights' Tango Guide",
        focus="Use this guide to make sense of the unusual double-knight setup and the transpositional tricks it invites.",
        summary="The Black Knights' Tango is offbeat but not random. This guide helps you see when Black is aiming for independent play and when the opening is really a path into more familiar Indian-defense structures.",
        match_prefixes=("queenspawn-blackknighttango",),
        tags=("openings", "black knights tango", "offbeat openings", "transpositions"),
        key_ideas=(
            "Black develops both knights early to challenge the center and create flexible transpositions.",
            "White is usually best served by principled development rather than trying to punish the setup immediately.",
            "Understanding likely transpositions is more valuable here than memorizing one fixed branch.",
        ),
        study_plan=(
            "Start with the overview so the opening's strategic idea feels logical, not random.",
            "Use the study collection to compare independent Tango positions with Indian-defense transpositions.",
            "Practice the file and note where your repertoire stays independent versus when it becomes a known structure.",
        ),
        wikipedia_slug="Black_Knights%27_Tango",
        lichess_topic="Black Knights Tango",
        related_lesson_ids=D4_REFERENCE_IDS + ("logical-chess-move-by-move",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-bogo-indian-defense",
        title="Bogo-Indian Defence Guide",
        focus="Learn the Bogo-Indian as a flexible d4 system built on piece pressure, sound development, and restrained central tension.",
        summary="This guide helps you treat your Bogo lines as understanding-based positions: Black uses the bishop pin and compact structure to fight for dark squares and healthy development rather than immediate tactical fireworks.",
        match_prefixes=("queenspawn-bogo",),
        tags=("openings", "bogo-indian", "piece pressure", "dark squares"),
        key_ideas=(
            "The bishop check and compact development aim for solidity plus targeted pressure.",
            "Bogo positions reward patience and good piece placement more than forcing calculation from move one.",
            "Dark-square control and smooth development often matter more than memorizing one exact branch.",
        ),
        study_plan=(
            "Read the overview and identify Black's main strategic goals after the bishop check.",
            "Use the studies to compare the common White setups and how Black reacts.",
            "Practice the Bogo files and explain which squares or structure each move is trying to influence.",
        ),
        wikipedia_slug="Bogo-Indian_Defence",
        lichess_topic="Bogo-Indian Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-catalan-opening",
        title="Catalan Guide",
        focus="Study the Catalan through the long diagonal, queenside pressure, and the tension between extra pawns and long-term activity.",
        summary="Your Catalan files become easier to learn once you stop seeing them as pure theory and start seeing them as a strategic battle over the g2 bishop, queenside development, and central tension.",
        match_prefixes=("queenspawn-catalan",),
        tags=("openings", "catalan", "long diagonal", "strategic pressure"),
        key_ideas=(
            "The g2 bishop is the soul of many Catalan positions.",
            "Black often decides between holding material and completing development smoothly.",
            "White's activity can outweigh short-term material considerations.",
        ),
        study_plan=(
            "Read the overview and focus on why the g2 bishop shapes the whole opening.",
            "Use the study collection to compare closed structures with more open Catalan play.",
            "Practice the Catalan files and review which position types make the bishop strongest.",
        ),
        wikipedia_slug="Catalan_Opening",
        lichess_topic="Catalan Opening",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system", "logical-chess-move-by-move"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-benoni-family",
        title="Benoni Family Guide",
        focus="Use this guide for the Czech, Modern, and Semi-Benoni files by focusing on space imbalance, queenside pressure, and central breaks.",
        summary="The Benoni family rewards strategic understanding because Black accepts space disadvantage to gain dynamic counterplay. This guide unifies your Benoni branches around the recurring pawn structures and attacking zones.",
        match_prefixes=(
            "queenspawn-czechbenoni",
            "queenspawn-modernbenoni",
            "queenspawn-semibenoni",
        ),
        tags=("openings", "benoni", "space imbalance", "counterplay"),
        key_ideas=(
            "White usually has more space; Black seeks active piece play and timely pawn breaks.",
            "The central and queenside pawn structure often tells you where both sides should play.",
            "Different Benoni branches mostly change the route to the familiar imbalanced middlegame.",
        ),
        study_plan=(
            "Read the overview and identify the typical space-versus-activity tradeoff.",
            "Compare Czech, Modern, and Semi-Benoni study examples to see how the same strategic themes recur.",
            "Drill one Benoni branch in the app and review whether you recognized the correct pawn break plans.",
        ),
        wikipedia_slug="Benoni_Defence",
        lichess_topic="Benoni Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("improve-your-chess-now",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-dutch-defense",
        title="Dutch Defence Guide",
        focus="Learn the Dutch as a fight for e4, kingside initiative, and structural risk balanced by active play.",
        summary="This guide covers your Dutch files by linking the Classical, Leningrad, and side-line setups to the same strategic questions: when to push for kingside play, when to stabilize the center, and how to handle weak squares.",
        match_prefixes=("queenspawn-dutch",),
        tags=("openings", "dutch", "kingside play", "strategic risk"),
        key_ideas=(
            "Black plays for active control of e4 and often for kingside initiative.",
            "The Dutch creates dynamic chances but also long-term structural weaknesses.",
            "Knowing where Black's king belongs and which pawn breaks are safe is crucial.",
        ),
        study_plan=(
            "Read the overview and note the tradeoff between activity and structural looseness.",
            "Study the main Dutch setups to compare Classical and Leningrad plans.",
            "Practice the Dutch files and review whether your move choices matched the intended kingside or central plan.",
        ),
        wikipedia_slug="Dutch_Defence",
        lichess_topic="Dutch Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system", "improve-your-chess-now"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-grunfeld-defense",
        title="Grunfeld Defence Guide",
        focus="Study the Grunfeld as a hypermodern center fight where Black invites space and attacks it with exact piece pressure.",
        summary="Your Grunfeld files fit together once you understand the main bargain: White gets a broad center, Black targets it with rapid development, pressure, and timely pawn breaks.",
        match_prefixes=("queenspawn-grunfeld",),
        tags=("openings", "grunfeld", "center pressure", "hypermodern"),
        key_ideas=(
            "Black attacks White's center instead of mirroring it.",
            "Piece activity and central tension matter more than static symmetry.",
            "The opening rewards understanding how White's center can become either strength or target.",
        ),
        study_plan=(
            "Read the overview to internalize Black's strategic reason for allowing the big center.",
            "Use the study collection to compare Exchange, Fianchetto, and side-line structures.",
            "Practice the Grunfeld files and review whether you recognized the moments to challenge the center.",
        ),
        wikipedia_slug="Gr%C3%BCnfeld_Defence",
        lichess_topic="Grunfeld Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("modern-chess-openings-15", "improve-your-chess-now"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-kings-indian-defense",
        title="King's Indian Defence Guide",
        focus="Learn the King's Indian through its recurring pawn storms, central tension, and race-of-attacks middlegames.",
        summary="This guide brings your KID files together by focusing on the structures and plans that repeat across the Classical, Fianchetto, Saemisch, Petrosian, Averbakh, and Four Pawns systems.",
        match_prefixes=("queenspawn-kid",),
        tags=("openings", "king's indian", "pawn storms", "attacking play"),
        key_ideas=(
            "Black often allows central space in exchange for dynamic kingside chances.",
            "The opening is remembered best through structures and attacking patterns, not isolated move lists.",
            "Different White setups mainly change the route to the middlegame battle.",
        ),
        study_plan=(
            "Read the overview and identify the typical attacking setup Black is aiming for.",
            "Use the studies to compare the Classical, Fianchetto, Saemisch, and Four Pawns themes.",
            "Practice the KID files and review how the pawn structure tells you where each side should attack.",
        ),
        wikipedia_slug="King%27s_Indian_Defence",
        lichess_topic="King's Indian Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system", "improve-your-chess-now"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-london-system",
        title="London System Guide",
        focus="See the London as a flexible development scheme where understanding plans and pawn breaks matters more than memorizing move order tricks.",
        summary="Your London files become more useful when you connect them to their middlegame plans: quick development, healthy structure, kingside attacking ideas, and pragmatic responses to Black's setup choices.",
        match_prefixes=("queenspawn-london",),
        tags=("openings", "london system", "system opening", "practical play"),
        key_ideas=(
            "The London is a setup-based opening, but the setup only works when you know the plans behind it.",
            "Black's formation should influence whether White plays quietly, expands, or attacks.",
            "Studying model games is especially valuable because the plans repeat so often.",
        ),
        study_plan=(
            "Read the overview to understand the standard London setup and its strategic aims.",
            "Use the studies to compare the main responses Black chooses against your system.",
            "Practice the London files and review which plan each Black setup should trigger.",
        ),
        wikipedia_slug="London_System",
        lichess_topic="London System",
        related_lesson_ids=D4_REFERENCE_IDS + ("attacking-with-1d4", "logical-chess-move-by-move"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-nimzo-indian-defense",
        title="Nimzo-Indian Defence Guide",
        focus="Study the Nimzo-Indian through control of e4, structural concessions, and the balance between bishop pair and pawn weaknesses.",
        summary="This guide covers your Nimzo files by tying together the Classical, Rubinstein, Saemisch, and 4.Nf3 branches through the recurring strategic themes that define the opening.",
        match_prefixes=("queenspawn-nimzo",),
        tags=("openings", "nimzo-indian", "dark squares", "structure"),
        key_ideas=(
            "Black fights for e4 and often accepts structural imbalance to gain activity.",
            "White frequently chooses between bishop pair value and structural health.",
            "The opening is rich strategically, so explanations matter more than rote memorization.",
        ),
        study_plan=(
            "Read the overview and note why Black is happy to give up the bishop pair in many lines.",
            "Use the studies to compare the Classical, Rubinstein, and Saemisch setups.",
            "Practice the Nimzo files and review which structural change each move is aiming to create or prevent.",
        ),
        wikipedia_slug="Nimzo-Indian_Defence",
        lichess_topic="Nimzo-Indian Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system", "improve-your-chess-now"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-old-indian-defense",
        title="Old Indian Defence Guide",
        focus="Use this guide to understand the Old Indian as a more restrained cousin of the King's Indian with sturdy structure and patient development.",
        summary="Your Old Indian file is best learned by comparing it to more dynamic Indian defenses. This guide emphasizes the compact setup, central control, and slower buildup that define the opening.",
        match_prefixes=("queenspawn-oldindian",),
        tags=("openings", "old indian", "solid structure", "patient development"),
        key_ideas=(
            "Black develops solidly first and seeks healthy structure before active operations.",
            "The opening is calmer than the King's Indian but still requires accurate timing of central breaks.",
            "Small structural details matter because the positions are less tactical from the start.",
        ),
        study_plan=(
            "Read the overview to understand how the Old Indian differs from the King's Indian.",
            "Study a few examples and focus on piece placement and central tension rather than tactical tricks.",
            "Practice the file and review whether you can explain Black's setup without relying on move-order memory alone.",
        ),
        wikipedia_slug="Old_Indian_Defense",
        lichess_topic="Old Indian Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system",),
    ),
    OpeningGuideTemplate(
        guide_id="guide-queens-indian-defense",
        title="Queen's Indian Defence Guide",
        focus="Learn the Queen's Indian through harmonious development, queenside pressure, and positional control of key central squares.",
        summary="Your QID files are especially understanding-driven. This guide shows how Black uses piece activity, bishop pressure, and flexible pawn structure to create long-term positional play rather than quick tactics.",
        match_prefixes=("queenspawn-qid",),
        tags=("openings", "queen's indian", "positional play", "piece pressure"),
        key_ideas=(
            "Black aims for smooth development and lasting pressure on light squares and the center.",
            "Many Queen's Indian positions are decided by maneuvering quality rather than opening traps.",
            "Model games are especially useful because the same pieces often improve in the same way.",
        ),
        study_plan=(
            "Read the overview and identify the squares Black is usually trying to control.",
            "Use the studies to compare the main White setups and Black's corresponding plans.",
            "Practice the QID files and review which piece-improvement plan the resulting structure calls for.",
        ),
        wikipedia_slug="Queen%27s_Indian_Defense",
        lichess_topic="Queen's Indian Defense",
        related_lesson_ids=D4_REFERENCE_IDS + ("my-system", "logical-chess-move-by-move"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-torre-trompowsky",
        title="Torre And Trompowsky Guide",
        focus="Use this guide for early bishop systems where White sidesteps heavy theory and aims for practical, plan-based play.",
        summary="Your Torre and Trompowsky files are easier to remember once you view them as practical bishop systems built around piece placement, structure, and whether White should keep or exchange the bishop pair.",
        match_prefixes=("queenspawn-torre", "queenspawn-trompowsky"),
        tags=("openings", "torre attack", "trompowsky", "practical systems"),
        key_ideas=(
            "White often chooses these systems to reduce theory and reach familiar structures quickly.",
            "The early bishop move is only strong if you understand when to keep the bishop and when to trade it.",
            "Practical middlegame plans matter more than encyclopedic move coverage here.",
        ),
        study_plan=(
            "Read the overview and note the strategic reason behind White's early bishop development.",
            "Use the studies to compare Torre and Trompowsky move-order ideas and bishop decisions.",
            "Practice these files and review whether you recognized when to exchange or preserve the bishop.",
        ),
        wikipedia_slug="Trompowsky_Attack",
        lichess_topic="Trompowsky Attack",
        related_lesson_ids=D4_REFERENCE_IDS + ("attacking-with-1d4", "logical-chess-move-by-move"),
    ),
    OpeningGuideTemplate(
        guide_id="guide-flexible-d4-systems",
        title="Flexible Queen's Pawn Systems Guide",
        focus="Study the flexible 1.d4 files as a practical bridge between pure system openings and fully theoretical Indian-defense structures.",
        summary="This guide covers the broader Queen's Pawn and flexible d4 files in your database, including the Modern and Nakamura-labeled branches, so you can understand what structure and transposition each setup is steering toward.",
        match_prefixes=("queenspawn-nakamura",),
        match_ids=("queenspawn-modern",),
        tags=("openings", "queen's pawn game", "flexible systems", "transpositions"),
        key_ideas=(
            "These setups are defined by flexibility and transposition potential.",
            "Understanding which structures you are inviting matters more than memorizing one label.",
            "The same opening move can lead to very different middlegames depending on Black's setup.",
        ),
        study_plan=(
            "Read the overview to frame these lines as flexible d4 systems rather than isolated one-off openings.",
            "Use the studies to see which common structures the move orders are heading toward.",
            "Practice the files and review whether you recognized the intended transposition or structure in time.",
        ),
        wikipedia_slug="Queen%27s_Pawn_Game",
        lichess_topic="Queen's Pawn Game",
        related_lesson_ids=D4_REFERENCE_IDS + ("attacking-with-1d4", "my-system"),
    ),
)


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


def wikipedia_url(slug: str) -> str:
    return f"https://en.wikipedia.org/wiki/{slug}"


def lichess_topic_url(topic: str) -> str:
    return f"https://lichess.org/study/topic/{quote(topic)}/popular"


def parse_variation_line(moves: str) -> list[dict[str, Any]]:
    board = chess.Board()
    cleaned = re.sub(r"\d+\.(?:\.\.)?", " ", moves)
    tokens = [token for token in cleaned.split() if token not in {"*", "1-0", "0-1", "1/2-1/2"}]
    line: list[dict[str, Any]] = []
    for ply, token in enumerate(tokens, start=1):
        move = board.parse_san(token)
        san = board.san(move)
        board.push(move)
        line.append(
            {
                "ply": ply,
                "san": san,
                "uci": move.uci(),
                "fen": board.fen(),
            }
        )
    return line


def lesson_book_entry(lesson: LessonSource, include_local_paths: bool = False) -> dict[str, Any]:
    file_path = resolve_lesson_file(lesson)
    exists = file_path.exists()
    size_mb = round(file_path.stat().st_size / (1024 * 1024), 2) if exists else None
    file_url = f"/api/lessons/file/{lesson.lesson_id}" if include_local_paths and exists else None
    resources = []
    if file_url:
        resources.append(
            {
                "label": "Open local file",
                "url": file_url,
                "source": "Local lesson library",
                "description": "Open this file directly from the machine running the trainer.",
            }
        )
    entry = {
        "id": lesson.lesson_id,
        "kind": "book",
        "title": lesson.title,
        "author": lesson.author,
        "category": lesson.category,
        "resourceType": lesson.resource_type,
        "focus": lesson.focus,
        "summary": lesson.summary,
        "sourceName": lesson.filename,
        "tags": list(lesson.tags),
        "availableLocally": exists,
        "sizeMb": size_mb,
        "fileUrl": file_url,
        "resources": resources,
        "resourceCount": len(resources),
        "keyIdeas": [],
        "studyPlan": [],
        "coachName": None,
        "coachIntro": None,
        "sections": [],
        "variations": [],
        "matchedOpeningIds": [],
        "matchedOpeningNames": [],
        "openingCount": 0,
        "practiceOpeningId": None,
        "relatedBooks": [],
        "sortGroup": 1,
    }
    if include_local_paths and exists:
        entry["localPath"] = str(file_path)
    return entry


def opening_source_blob(source: OpeningSource) -> str:
    return " ".join(
        (
            source.opening_id,
            source.display_name,
            source.filename,
            source.relative_path,
            source.category,
        )
    ).lower()


def matching_sources_for_guide(
    template: OpeningGuideTemplate,
    sources: Iterable[OpeningSource],
) -> list[OpeningSource]:
    matches = []
    for source in sources:
        blob = opening_source_blob(source)
        if source.opening_id in template.match_ids:
            matches.append(source)
            continue
        if any(source.opening_id.startswith(prefix) for prefix in template.match_prefixes):
            matches.append(source)
            continue
        if any(prefix in blob for prefix in template.match_prefixes):
            matches.append(source)
    matches.sort(key=lambda item: (item.category.lower(), item.display_name.lower()))
    return matches


def matching_sources(
    prefixes: Iterable[str],
    ids: Iterable[str],
    sources: Iterable[OpeningSource],
) -> list[OpeningSource]:
    prefix_list = tuple(prefixes)
    id_set = set(ids)
    matches = []
    for source in sources:
        blob = opening_source_blob(source)
        if source.opening_id in id_set:
            matches.append(source)
            continue
        if any(source.opening_id.startswith(prefix) for prefix in prefix_list):
            matches.append(source)
            continue
        if any(prefix in blob for prefix in prefix_list):
            matches.append(source)
    matches.sort(key=lambda item: (item.category.lower(), item.display_name.lower()))
    return matches


def related_book_entries(
    lesson_ids: Iterable[str],
    include_local_paths: bool = False,
) -> list[dict[str, Any]]:
    library = {lesson.lesson_id: lesson for lesson in LESSON_LIBRARY}
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for lesson_id in lesson_ids:
        if lesson_id in seen:
            continue
        seen.add(lesson_id)
        lesson = library.get(lesson_id)
        if lesson is None:
            continue
        entry = lesson_book_entry(lesson, include_local_paths=include_local_paths)
        entries.append(
            {
                "id": entry["id"],
                "title": entry["title"],
                "author": entry["author"],
                "resourceType": entry["resourceType"],
                "availableLocally": entry["availableLocally"],
                "fileUrl": entry["fileUrl"],
            }
        )
    return entries


def guide_resource_entries(template: OpeningGuideTemplate) -> list[dict[str, str]]:
    resources: list[LessonLink] = []
    if template.wikipedia_slug:
        resources.append(
            LessonLink(
                label="Opening overview",
                url=wikipedia_url(template.wikipedia_slug),
                source="Wikipedia",
                description="Read a compact overview of the opening, its ideas, and major branches.",
            )
        )
    if template.lichess_topic:
        resources.append(
            LessonLink(
                label="Study collection",
                url=lichess_topic_url(template.lichess_topic),
                source="Lichess Studies",
                description="Browse community studies, sample chapters, and guided lines for this opening family.",
            )
        )
    return [
        {
            "label": resource.label,
            "url": resource.url,
            "source": resource.source,
            "description": resource.description,
        }
        for resource in resources
    ]


def master_course_entry(
    course: MasterCourse,
    sources: Iterable[OpeningSource],
    include_local_paths: bool = False,
) -> dict[str, Any]:
    matches = matching_sources(course.match_prefixes, course.match_ids, sources)
    opening_names = (
        list(course.opening_names)
        if course.opening_names
        else [source.display_name for source in matches]
    )
    return {
        "id": course.lesson_id,
        "kind": "master-course",
        "title": course.title,
        "author": course.author,
        "category": "Opening Courses",
        "resourceType": "Master Course",
        "focus": course.focus,
        "summary": course.summary,
        "sourceName": course.source_name,
        "tags": list(course.tags),
        "availableLocally": False,
        "sizeMb": None,
        "fileUrl": None,
        "resources": [
            {
                "label": resource.label,
                "url": resource.url,
                "source": resource.source,
                "description": resource.description,
            }
            for resource in course.resources
        ],
        "resourceCount": len(course.resources),
        "keyIdeas": list(course.key_ideas),
        "studyPlan": list(course.study_plan),
        "coachName": course.coach_name,
        "coachIntro": course.coach_intro,
        "sections": [
            {
                "title": section.title,
                "body": section.body,
                "bullets": list(section.bullets),
            }
            for section in course.sections
        ],
        "variations": [
            {
                "title": variation.title,
                "moves": variation.moves,
                "why": variation.why,
                "trainerNote": variation.trainer_note,
                "checkpoints": list(variation.checkpoints),
                "line": parse_variation_line(variation.moves),
            }
            for variation in course.variations
        ],
        "matchedOpeningIds": [source.opening_id for source in matches],
        "matchedOpeningNames": opening_names,
        "openingCount": len(opening_names),
        "practiceOpeningId": course.practice_opening_id or (matches[0].opening_id if matches else None),
        "relatedBooks": related_book_entries(
            course.related_lesson_ids,
            include_local_paths=include_local_paths,
        ),
        "sortGroup": -1,
    }


def opening_guide_entry(
    template: OpeningGuideTemplate,
    sources: Iterable[OpeningSource],
    include_local_paths: bool = False,
) -> dict[str, Any] | None:
    matches = matching_sources_for_guide(template, sources)
    if not matches:
        return None

    resources = guide_resource_entries(template)
    opening_names = [source.display_name for source in matches]
    practice_opening_id = matches[0].opening_id if matches else None
    return {
        "id": template.guide_id,
        "kind": "guide",
        "title": template.title,
        "author": "Opening Trainer guide",
        "category": "Opening Guides",
        "resourceType": "Guide Pack",
        "focus": template.focus,
        "summary": template.summary,
        "sourceName": f"{len(matches)} repertoire file{'s' if len(matches) != 1 else ''}",
        "tags": list(template.tags),
        "availableLocally": False,
        "sizeMb": None,
        "fileUrl": None,
        "resources": resources,
        "resourceCount": len(resources),
        "keyIdeas": list(template.key_ideas),
        "studyPlan": list(template.study_plan),
        "coachName": None,
        "coachIntro": None,
        "sections": [],
        "variations": [],
        "matchedOpeningIds": [source.opening_id for source in matches],
        "matchedOpeningNames": opening_names,
        "openingCount": len(matches),
        "practiceOpeningId": practice_opening_id,
        "relatedBooks": related_book_entries(
            template.related_lesson_ids,
            include_local_paths=include_local_paths,
        ),
        "sortGroup": 0,
    }


def lesson_payload(
    sources: Iterable[OpeningSource],
    include_local_paths: bool = False,
) -> dict[str, Any]:
    lessons = [
        lesson_book_entry(lesson, include_local_paths=include_local_paths)
        for lesson in LESSON_LIBRARY
    ]
    for course in MASTER_COURSES:
        lessons.append(
            master_course_entry(
                course,
                sources,
                include_local_paths=include_local_paths,
            )
        )
    for template in OPENING_GUIDES:
        entry = opening_guide_entry(
            template,
            sources,
            include_local_paths=include_local_paths,
        )
        if entry is not None:
            lessons.append(entry)

    lessons.sort(
        key=lambda item: (
            item["sortGroup"],
            item["category"].lower(),
            item["title"].lower(),
        )
    )
    for lesson in lessons:
        lesson.pop("sortGroup", None)
    return {
        "formatVersion": 3,
        "builtAt": utc_timestamp(),
        "lessons": lessons,
    }


def resolve_lesson_file(lesson: LessonSource) -> Path:
    for root in (LOCAL_LESSONS_ROOT, DOWNLOADS_ROOT):
        candidate = root / lesson.filename
        if candidate.exists():
            return candidate
    return LOCAL_LESSONS_ROOT / lesson.filename


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

    def _lessons_manifest_path(self, output_root: Path | None = None) -> Path:
        root = output_root or self.cache_root
        return root / "lessons.json"

    def inputs_signature(self) -> str:
        digest = hashlib.sha256()
        static_inputs = (
            self.project_root / "opening_trainer.py",
            self.project_root / "requirements.txt",
        )
        for path in static_inputs:
            digest.update(path.name.encode("utf-8"))
            if path.exists():
                digest.update(hashlib.sha256(path.read_bytes()).digest())
        for source in sorted(self.sources.values(), key=lambda item: item.opening_id):
            digest.update(source.opening_id.encode("utf-8"))
            digest.update(self._source_signature(source).encode("utf-8"))
        return digest.hexdigest()

    def load_existing_manifest(self, output_root: Path | None = None) -> dict[str, Any] | None:
        path = self._database_manifest_path(output_root)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None

    def static_library_is_current(self, output_root: Path | None = None) -> bool:
        manifest = self.load_existing_manifest(output_root)
        return bool(
            manifest
            and manifest.get("formatVersion") == 2
            and manifest.get("inputsSignature") == self.inputs_signature()
            and len(manifest.get("openings", [])) == len(self.sources)
        )

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

    def write_lessons_manifest(
        self,
        output_root: Path | None = None,
        sources: Iterable[OpeningSource] | None = None,
    ) -> dict[str, Any]:
        selected_sources = list(self.sources.values()) if sources is None else list(sources)
        payload = lesson_payload(
            selected_sources,
            include_local_paths=False,
        )
        path = self._lessons_manifest_path(output_root)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        return payload

    def build_static_library(
        self,
        force: bool = False,
        opening_ids: list[str] | None = None,
        output_root: Path | None = None,
        verbose: bool = False,
        write_icons: bool = True,
    ) -> dict[str, Any]:
        if not force and not opening_ids and self.static_library_is_current(output_root):
            if write_icons and output_root in {None, self.cache_root}:
                ensure_icon_assets()
            manifest = self.load_existing_manifest(output_root)
            if manifest is not None:
                self.write_lessons_manifest(output_root, self.sources.values())
                if verbose:
                    print("Opening database is already up to date. Reusing cached static data.")
                return manifest

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
            "inputsSignature": self.inputs_signature(),
            "openings": manifest_openings,
        }
        manifest_path = self._manifest_path(output_root)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_text = json.dumps(manifest, separators=(",", ":"))
        manifest_path.write_text(manifest_text, encoding="utf-8")
        self._database_manifest_path(output_root).write_text(manifest_text, encoding="utf-8")
        self.write_lessons_manifest(output_root, selected_sources)
        return manifest


def discover_stockfish_binary(project_root: Path, explicit_path: str | None = None) -> Path | None:
    candidates: list[Path] = []
    if explicit_path:
        candidates.append(Path(explicit_path).expanduser())

    env_path = os.getenv(ENGINE_ENV_VAR)
    if env_path:
        candidates.append(Path(env_path).expanduser())

    discovered = shutil.which("stockfish")
    if discovered:
        candidates.append(Path(discovered))

    candidates.extend(
        [
            project_root / ".engine" / "stockfish",
            project_root / ".engine" / "stockfish.exe",
            project_root / "Stockfish-master" / "src" / "stockfish",
            project_root / "Stockfish-master" / "src" / "stockfish.exe",
            Path("/opt/homebrew/bin/stockfish"),
            Path("/usr/local/bin/stockfish"),
        ]
    )

    seen: set[str] = set()
    for candidate in candidates:
        resolved = candidate.expanduser()
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        if resolved.is_file():
            return resolved
    return None


def score_detail_text(centipawns: int) -> str:
    if abs(centipawns) < 20:
        return "Stockfish sees the position as roughly equal."
    if abs(centipawns) < 80:
        return "Stockfish sees a small edge."
    if abs(centipawns) < 180:
        return "Stockfish sees a clear edge."
    if abs(centipawns) < 350:
        return "Stockfish sees a strong advantage."
    return "Stockfish sees a very large advantage."


def format_engine_score(score: chess.engine.PovScore) -> dict[str, Any]:
    white_score = score.white()
    if white_score.is_mate():
        mate = white_score.mate() or 0
        winner = "White" if mate > 0 else "Black"
        distance = abs(mate)
        signed_text = f"{'+' if mate > 0 else '-'}M{distance}"
        return {
            "kind": "mate",
            "mate": mate,
            "text": signed_text,
            "detail": f"{winner} can force mate in {distance}.",
        }

    centipawns = white_score.score() or 0
    leader = "White" if centipawns > 0 else "Black" if centipawns < 0 else "Neither side"
    detail = (
        f"{leader} is better. {score_detail_text(centipawns)}"
        if centipawns
        else score_detail_text(centipawns)
    )
    return {
        "kind": "cp",
        "centipawns": centipawns,
        "text": f"{centipawns / 100:+.2f}",
        "detail": detail,
    }


class StockfishService:
    def __init__(
        self,
        project_root: Path,
        engine_path: str | None = None,
        depth: int = ENGINE_DEFAULT_DEPTH,
        time_ms: int = ENGINE_DEFAULT_TIME_MS,
    ) -> None:
        self.project_root = project_root
        self.engine_path = discover_stockfish_binary(project_root, engine_path)
        self.depth = depth
        self.time_ms = time_ms
        self._engine: chess.engine.SimpleEngine | None = None
        self._lock = threading.Lock()
        self._cache: dict[tuple[str, int, int], dict[str, Any]] = {}

    def status_payload(self) -> dict[str, Any]:
        archive_exists = (self.project_root / "Stockfish-master.zip").exists()
        if not self.engine_path:
            if archive_exists:
                message = (
                    "Stockfish source code is bundled here, but it still needs to be compiled into "
                    "a runnable engine executable before live evaluation can start."
                )
            else:
                message = (
                    "No Stockfish executable was found. Start the server with --engine /path/to/stockfish "
                    f"or set {ENGINE_ENV_VAR}."
                )
            return {
                "available": False,
                "message": message,
                "path": None,
                "depth": self.depth,
                "timeMs": self.time_ms,
            }

        return {
            "available": True,
            "message": f"Using Stockfish at {self.engine_path}.",
            "path": str(self.engine_path),
            "depth": self.depth,
            "timeMs": self.time_ms,
        }

    def _ensure_engine(self) -> chess.engine.SimpleEngine:
        if not self.engine_path:
            raise FileNotFoundError("No Stockfish executable is configured.")
        if self._engine is None:
            self._engine = chess.engine.SimpleEngine.popen_uci(str(self.engine_path))
            try:
                self._engine.configure({"Threads": 1, "Hash": 16})
            except chess.engine.EngineError:
                pass
        return self._engine

    def evaluate_fen(self, fen: str) -> dict[str, Any]:
        cache_key = (fen, self.depth, self.time_ms)
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._cache.pop(cache_key)
                self._cache[cache_key] = cached
                return cached

            board = chess.Board(fen)
            engine = self._ensure_engine()
            info = engine.analyse(
                board,
                chess.engine.Limit(depth=self.depth, time=max(self.time_ms / 1000, 0.05)),
            )
            pv = info.get("pv") or []
            best_move = board.san(pv[0]) if pv else None
            pv_san: list[str] = []
            preview_board = board.copy()
            for move in pv[:4]:
                pv_san.append(preview_board.san(move))
                preview_board.push(move)

            payload = {
                "available": True,
                "path": str(self.engine_path) if self.engine_path else None,
                "depth": self.depth,
                "timeMs": self.time_ms,
                "fen": fen,
                "score": format_engine_score(info["score"]),
                "bestMove": best_move,
                "pv": pv_san,
            }
            self._cache[cache_key] = payload
            if len(self._cache) > ENGINE_CACHE_LIMIT:
                self._cache.pop(next(iter(self._cache)))
            return payload

    def close(self) -> None:
        with self._lock:
            if self._engine is not None:
                self._engine.quit()
                self._engine = None


class OpeningTrainerServer(ThreadingHTTPServer):
    def __init__(
        self,
        server_address: tuple[str, int],
        request_handler_class: type[SimpleHTTPRequestHandler],
        app_state: OpeningTrainerState,
        engine_service: StockfishService | None,
    ) -> None:
        super().__init__(server_address, request_handler_class)
        self.app_state = app_state
        self.engine_service = engine_service


class StaticAppHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
    }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STATIC_ROOT), **kwargs)

    def _write_json(self, payload: dict[str, Any], status_code: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _engine_service(self) -> StockfishService | None:
        return getattr(self.server, "engine_service", None)

    def _app_state(self) -> OpeningTrainerState:
        return getattr(self.server, "app_state")

    def _send_path(self, file_path: Path) -> None:
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Requested file was not found.")
            return

        content_type, _encoding = mimetypes.guess_type(file_path.name)
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(file_path.stat().st_size))
        disposition = "attachment" if file_path.suffix.lower() == ".zip" else "inline"
        self.send_header("Content-Disposition", f'{disposition}; filename="{file_path.name}"')
        self.end_headers()
        with file_path.open("rb") as stream:
            shutil.copyfileobj(stream, self.wfile)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"", "/"}:
            self.path = "/index.html"
            return super().do_GET()
        if parsed.path == "/api/engine/status":
            engine_service = self._engine_service()
            payload = (
                engine_service.status_payload()
                if engine_service is not None
                else {"available": False, "message": "No engine service is configured."}
            )
            return self._write_json(payload)
        if parsed.path == "/api/lessons":
            app_state = self._app_state()
            return self._write_json(
                lesson_payload(app_state.sources.values(), include_local_paths=True)
            )
        if parsed.path.startswith("/api/lessons/file/"):
            lesson_id = parsed.path.rsplit("/", 1)[-1]
            lesson = next((item for item in LESSON_LIBRARY if item.lesson_id == lesson_id), None)
            if lesson is None:
                self.send_error(404, "Unknown lesson.")
                return
            return self._send_path(resolve_lesson_file(lesson))
        self.path = parsed.path
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/evaluate":
            self.send_error(404, "Unknown API route.")
            return

        engine_service = self._engine_service()
        if engine_service is None:
            self._write_json(
                {"available": False, "message": "No engine service is configured."},
                status_code=503,
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._write_json({"error": "Invalid Content-Length header."}, status_code=400)
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._write_json({"error": "Request body must be valid JSON."}, status_code=400)
            return

        fen = payload.get("fen")
        if not isinstance(fen, str) or not fen.strip():
            self._write_json({"error": "A FEN string is required."}, status_code=400)
            return

        try:
            evaluation = engine_service.evaluate_fen(fen)
        except FileNotFoundError as error:
            self._write_json(
                {"available": False, "message": str(error)},
                status_code=503,
            )
            return
        except ValueError as error:
            self._write_json({"error": str(error)}, status_code=400)
            return
        except chess.engine.EngineError as error:
            self._write_json(
                {"available": False, "message": f"Stockfish failed to evaluate this position: {error}"},
                status_code=503,
            )
            return

        self._write_json(evaluation)


def serve_static_app(
    host: str,
    port: int,
    app_state: OpeningTrainerState,
    engine_service: StockfishService | None = None,
) -> None:
    server = OpeningTrainerServer((host, port), StaticAppHandler, app_state, engine_service)
    if engine_service is not None:
        engine_status = engine_service.status_payload()
        print(
            "Stockfish evaluation: "
            f"{engine_status['message']}"
        )
    print(f"Opening trainer running on http://127.0.0.1:{port}")
    print(f"Phone URL on the same Wi-Fi: http://{local_ip(host)}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()
        if engine_service is not None:
            engine_service.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chess opening trainer")
    subparsers = parser.add_subparsers(dest="command")

    build_parser = subparsers.add_parser("build", help="Prebuild static opening data.")
    build_parser.add_argument("--force", action="store_true", help="Rebuild every opening book.")

    serve_parser = subparsers.add_parser("serve", help="Build static data if needed and serve the app.")
    serve_parser.add_argument("--host", default=DEFAULT_HOST, help="Host to bind to.")
    serve_parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to bind to.")
    serve_parser.add_argument("--force", action="store_true", help="Rebuild every opening book before serving.")
    serve_parser.add_argument(
        "--engine",
        help="Optional path to a compiled Stockfish executable for live evaluation.",
    )
    serve_parser.add_argument(
        "--engine-depth",
        type=int,
        default=ENGINE_DEFAULT_DEPTH,
        help="Search depth for Stockfish evaluations.",
    )
    serve_parser.add_argument(
        "--engine-time-ms",
        type=int,
        default=ENGINE_DEFAULT_TIME_MS,
        help="Time budget per Stockfish evaluation in milliseconds.",
    )

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
    engine_service = StockfishService(
        PROJECT_ROOT,
        engine_path=args.engine,
        depth=args.engine_depth,
        time_ms=args.engine_time_ms,
    )
    serve_static_app(args.host, args.port, state, engine_service=engine_service)


if __name__ == "__main__":
    main()
