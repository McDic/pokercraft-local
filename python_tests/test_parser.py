import typing
import unittest
from datetime import datetime
from io import StringIO

from pokercraft_local.data_structures import BetAction
from pokercraft_local.parser import PokercraftHandHistoryParser
from pokercraft_local.rust import card

Card = card.Card


def get_stream_from_text(text: str) -> typing.TextIO:
    """
    Get a stream from text.
    """
    return StringIO(text)


class HandHistoryParserTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.parser = PokercraftHandHistoryParser()

    def test_parse_hand_history_1(self):
        hand_history_text = """
Poker Hand #TM4832872904: Tournament #220597937, Zodiac Dog Ultra Deepstack 7-Max ¥110 [Turbo] Hold'em No Limit - Level16(600/1,200) - 2025/08/01 00:53:29
Table '25' 7-max Seat #7 is the button
Seat 1: f123395 (43,493 in chips)
Seat 2: 392ff24f (17,160 in chips)
Seat 3: 84466c0e (59,654 in chips)
Seat 4: afc7064f (36,309 in chips)
Seat 5: de10679c (20,504 in chips)
Seat 6: 471910c (31,717 in chips)
Seat 7: Hero (22,175 in chips)
392ff24f: posts the ante 150
84466c0e: posts the ante 150
afc7064f: posts the ante 150
471910c: posts the ante 150
de10679c: posts the ante 150
Hero: posts the ante 150
f123395: posts the ante 150
f123395: posts small blind 600
392ff24f: posts big blind 1,200
*** HOLE CARDS ***
Dealt to f123395
Dealt to 392ff24f
Dealt to 84466c0e
Dealt to afc7064f
Dealt to de10679c
Dealt to 471910c
Dealt to Hero [Jh 8c]
84466c0e: folds
afc7064f: raises 1,320 to 2,520
de10679c: folds
471910c: calls 2,520
Hero: folds
f123395: folds
392ff24f: calls 1,320
*** FLOP *** [4c 3d As]
392ff24f: checks
afc7064f: checks
471910c: checks
*** TURN *** [4c 3d As] [Jd]
392ff24f: checks
afc7064f: checks
471910c: bets 4,800
392ff24f: folds
afc7064f: folds
Uncalled bet (4,800) returned to 471910c
*** SHOWDOWN ***
471910c collected 9,210 from pot
*** SUMMARY ***
Total pot 9,210 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [4c 3d As Jd]
Seat 1: f123395 (small blind) folded before Flop
Seat 2: 392ff24f (big blind) folded on the Turn
Seat 3: 84466c0e folded before Flop
Seat 4: afc7064f folded on the Turn
Seat 5: de10679c folded before Flop
Seat 6: 471910c won (9,210)
Seat 7: Hero (button) folded before Flop
""".strip()
        stream = get_stream_from_text(hand_history_text)
        parsed = self.parser.parse(stream)
        hand_history = next(parsed)
        winning_player_id = "471910c"

        self.assertEqual(hand_history.id, "TM4832872904")
        self.assertEqual(hand_history.tournament_id, 220597937)
        self.assertEqual(
            hand_history.tournament_name,
            "Zodiac Dog Ultra Deepstack 7-Max ¥110 [Turbo] Hold'em No Limit",
        )
        self.assertEqual(hand_history.level, 16)
        self.assertEqual(hand_history.sb, 600)
        self.assertEqual(hand_history.bb, 1200)
        self.assertEqual(hand_history.button_seat, 7)
        self.assertEqual(hand_history.max_seats, 7)
        self.assertEqual(hand_history.dt, datetime(2025, 8, 1, 0, 53, 29))

        self.assertEqual(hand_history.sb_seat, 1)
        self.assertEqual(hand_history.bb_seat, 2)

        self.assertEqual(
            hand_history.community_cards,
            [Card("4c"), Card("3d"), Card("As"), Card("Jd")],
        )
        self.assertDictEqual(
            hand_history.known_cards, {"Hero": (Card("Jh"), Card("8c"))}
        )
        self.assertDictEqual(
            hand_history.seats,
            {
                1: ("f123395", 43493),
                2: ("392ff24f", 17160),
                3: ("84466c0e", 59654),
                4: ("afc7064f", 36309),
                5: ("de10679c", 20504),
                6: ("471910c", 31717),
                7: ("Hero", 22175),
            },
        )

        self.assertEqual(hand_history.wons[winning_player_id], 9210)
        self.assertEqual(hand_history.wons.get("Hero", 0), 0)
        self.assertEqual(hand_history.total_pot(), 9210)
        self.assertEqual(hand_history.uncalled_returned, (winning_player_id, 4800))

        self.assertListEqual(
            hand_history.actions_preflop,
            [
                BetAction(
                    player_id="392ff24f", action="ante", amount=150, is_all_in=False
                ),
                BetAction(
                    player_id="84466c0e", action="ante", amount=150, is_all_in=False
                ),
                BetAction(
                    player_id="afc7064f", action="ante", amount=150, is_all_in=False
                ),
                BetAction(
                    player_id="471910c", action="ante", amount=150, is_all_in=False
                ),
                BetAction(
                    player_id="de10679c", action="ante", amount=150, is_all_in=False
                ),
                BetAction(player_id="Hero", action="ante", amount=150, is_all_in=False),
                BetAction(
                    player_id="f123395", action="ante", amount=150, is_all_in=False
                ),
                BetAction(
                    player_id="f123395", action="blind", amount=600, is_all_in=False
                ),
                BetAction(
                    player_id="392ff24f", action="blind", amount=1200, is_all_in=False
                ),
                BetAction(
                    player_id="84466c0e", action="fold", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="afc7064f", action="raise", amount=2520, is_all_in=False
                ),
                BetAction(
                    player_id="de10679c", action="fold", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="471910c", action="call", amount=2520, is_all_in=False
                ),
                BetAction(player_id="Hero", action="fold", amount=0, is_all_in=False),
                BetAction(
                    player_id="f123395", action="fold", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="392ff24f", action="call", amount=1320, is_all_in=False
                ),
            ],
        )
        self.assertListEqual(
            hand_history.actions_flop,
            [
                BetAction(
                    player_id="392ff24f", action="check", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="afc7064f", action="check", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="471910c", action="check", amount=0, is_all_in=False
                ),
            ],
        )
        self.assertListEqual(
            hand_history.actions_turn,
            [
                BetAction(
                    player_id="392ff24f", action="check", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="afc7064f", action="check", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="471910c", action="bet", amount=4800, is_all_in=False
                ),
                BetAction(
                    player_id="392ff24f", action="fold", amount=0, is_all_in=False
                ),
                BetAction(
                    player_id="afc7064f", action="fold", amount=0, is_all_in=False
                ),
            ],
        )
        self.assertListEqual(hand_history.actions_river, [])


if __name__ == "__main__":
    unittest.main()
