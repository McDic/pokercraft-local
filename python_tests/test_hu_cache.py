import random
import unittest
from math import comb
from pathlib import Path

from pokercraft_local.rust import card, equity

Card = card.Card


class TestHuPreflopEquityCache(unittest.TestCase):
    def setUp(self):
        cache_path = (
            Path(__file__).parent.parent
            / "pokercraft_local"
            / "hu_preflop_cache.txt.gz"
        )
        self.cache = equity.HUPreflopEquityCache(cache_path)

    @staticmethod
    def all_cards() -> list[Card]:
        return [Card(f"{rank}{suit}") for rank in "23456789TJQKA" for suit in "cdhs"]

    def test_hu_preflop_equity_cache(self) -> None:
        TOTAL_ITERATIONS: int = 100
        ALL_CARDS = self.all_cards()
        NUMBER_OF_BOARDS = comb(48, 5)

        for it in range(TOTAL_ITERATIONS):
            hand1: tuple[Card, Card] = tuple(
                random.sample(ALL_CARDS, 2)
            )  # type: ignore[assignment]
            remaining_cards = [c for c in ALL_CARDS if c not in hand1]
            hand2: tuple[Card, Card] = tuple(
                random.sample(remaining_cards, 2)
            )  # type: ignore[assignment]

            win1, lose1, tie1 = self.cache.get_winlose_py(hand1, hand2)
            win2, lose2, tie2 = self.cache.get_winlose_py(hand2, hand1)

            print(
                "#%d Hands: %s%s vs %s%s => %d %d %d"
                % (it + 1, hand1[0], hand1[1], hand2[0], hand2[1], win1, lose1, tie1)
            )

            self.assertEqual(win1 + lose1 + tie1, win2 + lose2 + tie2)
            self.assertEqual(win2 + lose2 + tie2, NUMBER_OF_BOARDS)
            self.assertEqual(win1, lose2)
            self.assertEqual(lose1, win2)
            self.assertEqual(tie1, tie2)

            real_equity = equity.EquityResult([hand1, hand2], [])
            raw_result = [
                real_equity.get_winlosses_py(0),
                real_equity.get_winlosses_py(1),
            ]
            print("\tRaw result:", raw_result[0], raw_result[1])
            self.assertEqual(raw_result[0][0][0], win1)
            self.assertEqual(raw_result[0][1], lose1)
            self.assertEqual(raw_result[1][0][0], win2)
            self.assertEqual(raw_result[1][1], lose2)
            self.assertEqual(raw_result[0][0][1], raw_result[1][0][1])
            self.assertEqual(raw_result[0][0][1], tie1)

            eq1 = real_equity.get_equity_py(0)
            eq2 = real_equity.get_equity_py(1)
            self.assertAlmostEqual(
                eq1,
                win1 / NUMBER_OF_BOARDS + tie1 / NUMBER_OF_BOARDS / 2.0,
                places=5,
            )
            self.assertAlmostEqual(
                eq2,
                win2 / NUMBER_OF_BOARDS + tie2 / NUMBER_OF_BOARDS / 2.0,
                places=5,
            )


if __name__ == "__main__":
    unittest.main()
