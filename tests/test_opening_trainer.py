import json
import tempfile
import unittest
from pathlib import Path

from opening_trainer import OpeningTrainerState, PROJECT_ROOT


class OpeningTrainerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.state = OpeningTrainerState(PROJECT_ROOT)
        cls.qp_id = "queenspawn-qid4e3"
        cls.kp_id = "kingspawn-frenchadvance"

    def test_repertoire_folders_are_discovered(self) -> None:
        openings = self.state.list_openings()
        categories = {opening["category"] for opening in openings}
        self.assertIn("Queens Pawn", categories)
        self.assertIn("Kings Pawn", categories)
        self.assertGreater(len(openings), 100)

    def test_queens_pawn_book_contains_d4(self) -> None:
        detail = self.state.opening_detail(self.qp_id, 12)
        self.assertGreater(detail["stats"]["games"], 0)
        self.assertEqual(detail["firstMoves"][0]["san"], "d4")

    def test_kings_pawn_book_contains_e4(self) -> None:
        detail = self.state.opening_detail(self.kp_id, 12)
        self.assertGreater(detail["stats"]["games"], 0)
        self.assertEqual(detail["firstMoves"][0]["san"], "e4")

    def test_static_build_creates_subset_manifest_and_books(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_root = Path(temp_dir)
            state = OpeningTrainerState(PROJECT_ROOT, cache_root=output_root)
            manifest = state.build_static_library(
                force=True,
                opening_ids=[self.qp_id, self.kp_id],
                output_root=output_root,
                write_icons=False,
            )

            self.assertEqual(len(manifest["openings"]), 2)
            self.assertTrue((output_root / "library.json").exists())
            self.assertTrue((output_root / "database.json").exists())
            self.assertTrue((output_root / "books" / f"{self.qp_id}.json").exists())
            self.assertTrue((output_root / "books" / f"{self.kp_id}.json").exists())

            payload = json.loads((output_root / "library.json").read_text(encoding="utf-8"))
            database_payload = json.loads((output_root / "database.json").read_text(encoding="utf-8"))
            manifest_ids = {opening["id"] for opening in payload["openings"]}
            database_ids = {opening["id"] for opening in database_payload["openings"]}
            self.assertEqual(manifest_ids, {self.qp_id, self.kp_id})
            self.assertEqual(database_ids, {self.qp_id, self.kp_id})
            self.assertEqual(database_payload["formatVersion"], 2)

            book_payload = json.loads(
                (output_root / "books" / f"{self.qp_id}.json").read_text(encoding="utf-8")
            )
            self.assertEqual(book_payload["formatVersion"], 2)
            self.assertEqual(set(book_payload["root"].keys()), {"s", "u", "c", "n"})

    def test_cached_book_can_be_reloaded(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_root = Path(temp_dir)
            state = OpeningTrainerState(PROJECT_ROOT, cache_root=output_root)
            state.build_static_library(
                force=True,
                opening_ids=[self.qp_id],
                output_root=output_root,
                write_icons=False,
            )

            reloaded = OpeningTrainerState(PROJECT_ROOT, cache_root=output_root)
            book = reloaded.get_book(self.qp_id)
            self.assertEqual(book.root.sorted_children()[0].san, "d4")


if __name__ == "__main__":
    unittest.main()
