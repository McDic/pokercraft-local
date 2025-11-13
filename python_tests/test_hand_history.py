import unittest
from io import StringIO

from pokercraft_local.parser import PokercraftHandHistoryParser


class HandHistoryTestCase(unittest.TestCase):
    def test_hand_history_1(self):
        RAW_HAND_HISTORY = """
Poker Hand #TM4732536633: Tournament #214586167, Zodiac Rooster Night Crow Bounty ¥22 Hold'em No Limit - Level1(25/50) - 2025/07/02 23:10:53
Table '41' 8-max Seat #1 is the button
Seat 1: d8b1c281 (10,022 in chips)
Seat 2: e124daac (8,353 in chips)
Seat 3: e9b10c8b (11,600 in chips)
Seat 4: d223d09c (9,982 in chips)
Seat 5: Hero (9,889 in chips)
Seat 6: 96d0e8bf (9,988 in chips)
Seat 7: 14cabcb0 (9,901 in chips)
Seat 8: cb5c8d18 (10,000 in chips)
d223d09c: posts the ante 6
e9b10c8b: posts the ante 6
cb5c8d18: posts the ante 6
96d0e8bf: posts the ante 6
d8b1c281: posts the ante 6
14cabcb0: posts the ante 6
Hero: posts the ante 6
e124daac: posts the ante 6
e124daac: posts small blind 25
e9b10c8b: posts big blind 50
*** HOLE CARDS ***
Dealt to d8b1c281
Dealt to e124daac
Dealt to e9b10c8b
Dealt to d223d09c
Dealt to Hero [7s 8s]
Dealt to 96d0e8bf
Dealt to 14cabcb0
Dealt to cb5c8d18
d223d09c: folds
Hero: raises 50 to 100
96d0e8bf: folds
14cabcb0: raises 350 to 450
cb5c8d18: folds
d8b1c281: folds
e124daac: folds
e9b10c8b: folds
Hero: folds
Uncalled bet (350) returned to 14cabcb0
*** SHOWDOWN ***
14cabcb0 collected 323 from pot
*** SUMMARY ***
Total pot 323 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: d8b1c281 (button) folded before Flop
Seat 2: e124daac (small blind) folded before Flop
Seat 3: e9b10c8b (big blind) folded before Flop
Seat 4: d223d09c folded before Flop
Seat 5: Hero folded before Flop
Seat 6: 96d0e8bf folded before Flop
Seat 7: 14cabcb0 collected (323)
Seat 8: cb5c8d18 folded before Flop
""".strip()
        parser = PokercraftHandHistoryParser()
        hand_history = next(parser.parse(StringIO(RAW_HAND_HISTORY)))
        self.assertEqual(hand_history.net_profit("Hero"), -6 - 100)
        self.assertEqual(hand_history.get_offset_from_button("Hero"), -4)

    def test_hand_history_2(self):
        RAW_HAND_HISTORY = """
Poker Hand #TM4732538496: Tournament #214586167, Zodiac Rooster Night Crow Bounty ¥22 Hold'em No Limit - Level5(125/250) - 2025/07/02 23:48:29
Table '11' 8-max Seat #6 is the button
Seat 1: b9df4ba9 (21,566 in chips)
Seat 2: 50d33192 (20,152 in chips)
Seat 3: 91be158e (8,366 in chips)
Seat 4: f69edd6e (3,497 in chips)
Seat 5: db9370f (13,462 in chips)
Seat 6: 400bebab (6,924 in chips)
Seat 7: dd18df1 (41,626 in chips)
Seat 8: Hero (8,501 in chips)
400bebab: posts the ante 30
f69edd6e: posts the ante 30
50d33192: posts the ante 30
b9df4ba9: posts the ante 30
db9370f: posts the ante 30
91be158e: posts the ante 30
Hero: posts the ante 30
dd18df1: posts the ante 30
dd18df1: posts small blind 125
Hero: posts big blind 250
*** HOLE CARDS ***
Dealt to b9df4ba9
Dealt to 50d33192
Dealt to 91be158e
Dealt to f69edd6e
Dealt to db9370f
Dealt to 400bebab
Dealt to dd18df1
Dealt to Hero [Kh 7h]
b9df4ba9: folds
50d33192: folds
91be158e: folds
f69edd6e: folds
db9370f: raises 350 to 600
400bebab: folds
dd18df1: calls 475
Hero: calls 350
*** FLOP *** [3h 2d 6c]
dd18df1: checks
Hero: checks
db9370f: checks
*** TURN *** [3h 2d 6c] [Th]
dd18df1: checks
Hero: bets 1,025
db9370f: folds
dd18df1: calls 1,025
*** RIVER *** [3h 2d 6c Th] [3d]
dd18df1: checks
Hero: checks
dd18df1: shows [6h 7c] (two pair, Sixes and Threes)
Hero: shows [Kh 7h] (a pair of Threes)
*** SHOWDOWN ***
dd18df1 collected 4,090 from pot
*** SUMMARY ***
Total pot 4,090 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [3h 2d 6c Th 3d]
Seat 1: b9df4ba9 folded before Flop
Seat 2: 50d33192 folded before Flop
Seat 3: 91be158e folded before Flop
Seat 4: f69edd6e folded before Flop
Seat 5: db9370f folded on the Turn
Seat 6: 400bebab (button) folded before Flop
Seat 7: dd18df1 (small blind) showed [6h 7c] and won (4,090) with two pair, Sixes and Threes
Seat 8: Hero (big blind) showed [Kh 7h] and lost with a pair of Threes
""".strip()
        parser = PokercraftHandHistoryParser()
        hand_history = next(parser.parse(StringIO(RAW_HAND_HISTORY)))
        self.assertEqual(hand_history.net_profit("Hero"), -30 - 600 - 1025)
        self.assertEqual(hand_history.get_offset_from_button("Hero"), 2)

    def test_hand_history_3(self):
        RAW_HAND_HISTORY = """
Poker Hand #TM4732538867: Tournament #214586167, Zodiac Rooster Night Crow Bounty ¥22 Hold'em No Limit - Level6(150/300) - 2025/07/03 00:03:20
Table '11' 8-max Seat #7 is the button
Seat 1: b9df4ba9 (23,051 in chips)
Seat 2: 50d33192 (23,292 in chips)
Seat 3: 91be158e (7,746 in chips)
Seat 4: f69edd6e (3,742 in chips)
Seat 5: db9370f (12,242 in chips)
Seat 6: 796c6a7 (9,905 in chips)
Seat 7: dd18df1 (47,457 in chips)
Seat 8: Hero (6,564 in chips)
796c6a7: posts the ante 35
f69edd6e: posts the ante 35
50d33192: posts the ante 35
b9df4ba9: posts the ante 35
db9370f: posts the ante 35
91be158e: posts the ante 35
Hero: posts the ante 35
dd18df1: posts the ante 35
Hero: posts small blind 150
b9df4ba9: posts big blind 300
*** HOLE CARDS ***
Dealt to b9df4ba9
Dealt to 50d33192
Dealt to 91be158e
Dealt to f69edd6e
Dealt to db9370f
Dealt to 796c6a7
Dealt to dd18df1
Dealt to Hero [Kh Kc]
50d33192: folds
91be158e: folds
f69edd6e: folds
db9370f: folds
796c6a7: folds
dd18df1: raises 300 to 600
Hero: raises 1,350 to 1,950
b9df4ba9: folds
dd18df1: calls 1,350
*** FLOP *** [As Qc 8s]
Hero: bets 4,579 and is all-in
dd18df1: calls 4,579
Hero: shows [Kh Kc] (a pair of Kings)
dd18df1: shows [9s Ah] (a pair of Aces)
*** TURN *** [As Qc 8s] [4s]
*** RIVER *** [As Qc 8s 4s] [3h]
*** SHOWDOWN ***
dd18df1 collected 13,638 from pot
*** SUMMARY ***
Total pot 13,638 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [As Qc 8s 4s 3h]
Seat 1: b9df4ba9 (big blind) folded before Flop
Seat 2: 50d33192 folded before Flop
Seat 3: 91be158e folded before Flop
Seat 4: f69edd6e folded before Flop
Seat 5: db9370f folded before Flop
Seat 6: 796c6a7 folded before Flop
Seat 7: dd18df1 (button) showed [9s Ah] and won (13,638) with a pair of Aces
Seat 8: Hero (small blind) showed [Kh Kc] and lost with a pair of Kings
""".strip()
        parser = PokercraftHandHistoryParser()
        hand_history = next(parser.parse(StringIO(RAW_HAND_HISTORY)))
        self.assertEqual(hand_history.net_profit("Hero"), -35 - 1950 - 4579)
        self.assertEqual(hand_history.was_best_hand("Hero"), -1)
        self.assertEqual(hand_history.was_best_hand("dd18df1"), 0)
        self.assertEqual(hand_history.get_offset_from_button("Hero"), 1)


if __name__ == "__main__":
    unittest.main()
