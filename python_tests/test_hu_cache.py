import logging
import os
import random
import unittest
from math import comb

from pokercraft_local.data_structures import get_global_preflop_hu_cache
from pokercraft_local.rust import card, equity
from pokercraft_local.utils import mark_expensive_test

Card = card.Card
HUPFCache = equity.HUPreflopEquityCache

logger = logging.getLogger("pokercraft_local.test.hu_cache")


class TestHuPreflopEquityCache(unittest.TestCase):
    """
    Testing the HU Preflop Equity Cache against direct equity calculations.
    """

    @staticmethod
    def all_cards() -> list[Card]:
        """
        Generate a list of all 52 playing cards.
        """
        return [Card(f"{rank}{suit}") for rank in "23456789TJQKA" for suit in "cdhs"]

    @mark_expensive_test
    def test_hu_preflop_equity_cache(self) -> None:
        """
        Comparing the preflop equity cache results with direct equity calculations.
        """
        TOTAL_ITERATIONS: int = 200
        all_cards = self.all_cards()
        NUMBER_OF_BOARDS = comb(48, 5)

        cache = get_global_preflop_hu_cache()

        for it in range(TOTAL_ITERATIONS):
            random.shuffle(all_cards)
            hand1 = all_cards[0], all_cards[1]
            hand2 = all_cards[2], all_cards[3]
            win1, lose1, tie1 = cache.get_winlose_py(hand1, hand2)
            win2, lose2, tie2 = cache.get_winlose_py(hand2, hand1)

            logger.debug(
                "#%d: %s%s vs %s%s => %d %d %d",
                it + 1,
                hand1[0],
                hand1[1],
                hand2[0],
                hand2[1],
                win1,
                lose1,
                tie1,
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
