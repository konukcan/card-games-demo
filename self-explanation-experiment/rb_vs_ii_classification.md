# RB vs II rule classification — v2 (corrected)

**Source:** `rule-gallery/analysis/output_human/rule_summaries.csv` (n≈20 per rule, April 15 pilot run).
**Primary metric:** MCC (Matthews Correlation Coefficient), per `rule-gallery/analysis/score.py:12`.
MCC's expected value under statistical independence is 0 regardless of base rate — unlike Dice, which inflates with base rate. Using MCC natively avoids needing a base-rate correction.

**Classification thresholds (MCC-based):**
- **RB_CLEAR**: acc ≥ 0.50 AND mcc ≥ 0.50. Verbalizable, verbalized, extension matches.
- **MIXED**: acc ≥ 0.25 (partial articulation). Or acc ≥ 0.50 with low mcc (rare).
- **II_CANDIDATE**: acc < 0.25 AND mcc ≥ 0.25. Low articulation, real extension overlap.
- **TOO_HARD**: acc < 0.25 AND mcc < 0.25. Neither signal.

## RB_CLEAR  (12 rules)

| rule_id | tier | n | acc | mcc | dice | base_rate | rule_answer |
|---|---:|---:|---:|---:|---:|---:|---|
| `four_kind_adjacent_any` | 1 | 16 | 0.94 | 0.94 | 0.94 | 0.0007 | Four positions share the same rank (any position, not necessarily adjacent) |
| `all_same_suit` | 1 | 16 | 0.88 | 0.89 | 0.88 | 0.0004 | All six cards share the same suit |
| `all_red` | 1 | 19 | 0.84 | 0.84 | 0.84 | 0.0112 | All cards are red (hearts or diamonds) |
| `left_red_right_black` | 1 | 16 | 0.81 | 0.86 | 0.85 | 0.0169 | Left three cards are red, right three are black |
| `four_diamonds_anywhere` | 2 | 24 | 0.79 | 0.79 | 0.79 | 0.0284 | At least four of the six cards are diamonds |
| `all_same_color` | 1 | 24 | 0.71 | 0.73 | 0.76 | 0.0229 | All cards share the same color (all red or all black) |
| `even_odd_pos_color_split` | 3 | 19 | 0.63 | 0.76 | 0.74 | 0.0331 | Even-numbered positions are one color, odd are the other (either direction) |
| `two_pairs_ranks` | 2 | 19 | 0.58 | 0.62 | 0.66 | 0.1329 | Two different ranks each appear at least twice |
| `straight5` | 3 | 16 | 0.56 | 0.57 | 0.57 | 0.0168 | Five cards form a straight (consecutive ranks), no extra constraint |
| `even_pos_red_odd_pos_black` | 2 | 19 | 0.53 | 0.69 | 0.68 | 0.0168 | Odd positions (1,3,5) are black, even positions (2,4,6) are red |
| `all_4s_8s_or_9s` | 1 | 23 | 0.52 | 0.56 | 0.55 | 0.0000 | Every card is a 4, 8, or 9 |
| `all_clubs_or_hearts` | 1 | 16 | 0.50 | 0.53 | 0.51 | 0.0113 | Every card is a club or a heart |

## MIXED  (10 rules)

| rule_id | tier | n | acc | mcc | dice | base_rate | rule_answer |
|---|---:|---:|---:|---:|---:|---:|---|
| `three_spades` | 2 | 16 | 0.50 | 0.50 | 0.61 | 0.1569 | At least three of the six cards are spades |
| `both_halves_uniform_suit` | 1 | 19 | 0.42 | 0.51 | 0.47 | 0.0030 | All cards in the left half share a suit, and all in the right half share a suit |
| `all_but_one_same_color` | 1 | 19 | 0.42 | 0.41 | 0.56 | 0.1911 | All cards except at most one are the same color |
| `all_4s_or_queens` | 1 | 19 | 0.37 | 0.45 | 0.44 | 0.0000 | Every card is a 4 or a Queen |
| `ap_len3_step1_anywhere` | 2 | 15 | 0.33 | 0.32 | 0.63 | 0.3617 | Three cards have consecutive ranks (e.g., 5, 6, 7) regardless of position |
| `pair_jacks_pos45` | 1 | 25 | 0.32 | 0.45 | 0.40 | 0.0043 | Positions 4 and 5 are both Jacks |
| `every_other_ace` | 1 | 19 | 0.32 | 0.42 | 0.36 | 0.0002 | Cards at positions 1, 3, and 5 are all Aces |
| `four_any_suit_anywhere` | 2 | 21 | 0.29 | 0.31 | 0.44 | 0.1139 | At least four cards share the same suit (anywhere in the hand) |
| `ranks_palindrome` | 3 | 23 | 0.26 | 0.37 | 0.31 | 0.0002 | The sequence of ranks reads the same forwards and backwards |
| `pos135_same_rank` | 1 | 16 | 0.25 | 0.37 | 0.30 | 0.0023 | Cards at positions 1, 3, and 5 all share the same rank |

## II_CANDIDATE  (14 rules)

| rule_id | tier | n | acc | mcc | dice | base_rate | rule_answer |
|---|---:|---:|---:|---:|---:|---:|---|
| `all_odd` | 2 | 25 | 0.24 | 0.32 | 0.28 | 0.0004 | Every card is an odd number (3, 5, 7, or 9 — no face cards) |
| `some_half_red_other_black` | 1 | 21 | 0.24 | 0.43 | 0.39 | 0.0336 | One half is all red and the other is all black (either direction) |
| `all_even` | 2 | 22 | 0.23 | 0.37 | 0.32 | 0.0021 | Every card is an even number (2, 4, 6, 8, or 10 — no face cards) |
| `four_of_a_kind_adjacent` | 1 | 22 | 0.18 | 0.47 | 0.41 | 0.0001 | Four consecutive cards share the same rank |
| `triple_2s_pos234` | 1 | 23 | 0.17 | 0.34 | 0.25 | 0.0002 | Positions 2, 3, and 4 are all 2s |
| `triple_3s_adjacent` | 1 | 26 | 0.15 | 0.43 | 0.36 | 0.0007 | Three consecutive positions are all 3s |
| `halves_copy_ranks` | 2 | 16 | 0.12 | 0.32 | 0.23 | 0.0002 | The rank sequence of the right half matches the left half exactly |
| `triple_any_pos345` | 1 | 24 | 0.12 | 0.29 | 0.21 | 0.0023 | Positions 3, 4, and 5 all share the same rank |
| `three_clubs_adjacent` | 1 | 18 | 0.11 | 0.28 | 0.29 | 0.0431 | Three consecutive positions are all clubs |
| `triple_any_adjacent` | 2 | 23 | 0.09 | 0.39 | 0.33 | 0.0089 | Three consecutive positions share the same rank |
| `four_hearts_adjacent` | 2 | 23 | 0.09 | 0.38 | 0.31 | 0.0074 | Four consecutive positions are all hearts |
| `four_any_suit_adjacent` | 2 | 16 | 0.06 | 0.29 | 0.29 | 0.0277 | Four consecutive positions share the same suit |
| `pair_5s_adjacent` | 2 | 18 | 0.00 | 0.42 | 0.39 | 0.0218 | Two adjacent cards are both 5s (any position) |
| `both_halves_have_pair_rank` | 2 | 16 | 0.00 | 0.31 | 0.29 | 0.0297 | Each half contains at least one pair of matching ranks |

## TOO_HARD  (24 rules)

| rule_id | tier | n | acc | mcc | dice | base_rate | rule_answer |
|---|---:|---:|---:|---:|---:|---:|---|
| `three_any_suit_adjacent` | 2 | 22 | 0.18 | 0.23 | 0.41 | 0.1733 | Three consecutive positions share the same suit |
| `three_or_more_same_suit` | 1 | 18 | 0.17 | 0.15 | 0.55 | 0.6042 | At least 3 cards share the same suit |
| `blacks_then_reds_start_black` | 3 | 14 | 0.07 | 0.17 | 0.27 | 0.0892 | First card is black, and all black cards precede all red cards |
| `both_halves_uniform_color` | 2 | 16 | 0.06 | 0.19 | 0.23 | 0.0565 | All cards in the left half are the same color, and all in the right half are the same color |
| `suit_chain_dsh` | 3 | 16 | 0.06 | 0.10 | 0.08 | 0.0034 | Suits follow D then S then H from left to right (only diamonds, spades, hearts; starts with diamond; each step stays or advances by one) |
| `strict_increasing` | 3 | 19 | 0.05 | 0.24 | 0.18 | 0.0005 | Ranks increase strictly from left to right (each card higher than the previous) |
| `straight5_same_suit` | 3 | 22 | 0.05 | 0.09 | 0.05 | 0.0001 | Five cards form a straight (consecutive ranks) in the same suit |
| `ap_step1_len3_adj` | 3 | 23 | 0.00 | 0.18 | 0.30 | 0.1166 | Three consecutive positions contain ranks that form a run of 3 (e.g., 5, 6, 7 in any order) |
| `straight5_same_color` | 3 | 21 | 0.00 | 0.18 | 0.09 | 0.0013 | Five cards form a straight (consecutive ranks) all in the same color |
| `ap_step1_len3_adj_ordered` | 3 | 14 | 0.00 | 0.08 | 0.07 | 0.0202 | Three consecutive positions have ranks increasing by exactly 1 (e.g., 5, 6, 7) |
| `halves_copy_colors` | 2 | 17 | 0.00 | 0.07 | 0.23 | 0.1184 | The color sequence of the right half matches the left half |
| `radial_decreasing` | 3 | 13 | 0.00 | 0.06 | 0.06 | 0.0074 | Ranks decrease outward from center: center (positions 3–4) > middle (2, 5) > outer (1, 6) |
| `immediate_bracket_closure` | 3 | 15 | 0.00 | 0.06 | 0.03 | 0.0023 | Suits form 3 adjacent bracket pairs: each pair is either Spades-Clubs or Hearts-Diamonds (every opener is immediately closed) |
| `no_adjacent_same_suit` | 3 | 14 | 0.00 | 0.05 | 0.38 | 0.2563 | No two adjacent cards share the same suit |
| `ap_step2_len4_adj` | 3 | 23 | 0.00 | 0.05 | 0.06 | 0.0182 | Four consecutive positions contain ranks that form a step-2 progression (e.g., 3, 5, 7, 9 in any order) |
| `suit_brackets_nested` | 3 | 23 | 0.00 | 0.04 | 0.04 | 0.0104 | Suits as brackets (♠=( ♣=) ♥=[ ♦=]); well-formed nested brackets (cross-nesting allowed) |
| `halves_copy_suits` | 2 | 20 | 0.00 | 0.04 | 0.04 | 0.0133 | The suit sequence of the right half matches the left half exactly |
| `adjacent_share_rank_or_suit` | 3 | 19 | 0.00 | 0.04 | 0.01 | 0.0018 | Every adjacent pair shares either rank or suit |
| `suit_brackets_no_cross` | 3 | 18 | 0.00 | 0.03 | 0.02 | 0.0051 | Suits as brackets (♠=( ♣=) ♥=[ ♦=]); well-formed, each type nests only within itself |
| `ap_step2_len4_adj_ordered` | 3 | 18 | 0.00 | 0.01 | 0.00 | 0.0008 | Four consecutive positions have ranks increasing by exactly 2 (e.g., 3, 5, 7, 9) |
| `pos16_pos25_same_suit` | 3 | 20 | 0.00 | 0.01 | 0.11 | 0.0555 | Position 1 and position 6 share the same suit, and position 2 and position 5 share the same suit |
| `colors_palindrome` | 2 | 23 | 0.00 | -0.02 | 0.18 | 0.1166 | The sequence of colors reads the same forwards and backwards |
| `two_pairs_suits` | 2 | 19 | 0.00 | -0.03 | 0.40 | 0.3638 | At least one suit-pair in the first half (positions 1–3) and at least one suit-pair in the second half (positions 4–6) |
| `skip2_same_rank_or_suit` | 3 | 14 | 0.00 | -0.03 | 0.02 | 0.0071 | Each card shares rank or suit with the card 2 positions later |
