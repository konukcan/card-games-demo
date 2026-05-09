// rule-gallery/gallery-rules.js
// 61 rule definitions organized in 3 difficulty groups for the Rule Gallery calibration study.
//
// Each rule is an object with:
//   id       — unique string identifier
//   group    — 1, 2, or 3 (difficulty)
//   name     — short human-readable description
//   eval(hand) — returns true if the 6-card hand satisfies the rule
//   answer   — spoiler text for the "Show Answer" toggle
//   generate(n) — (optional) constructive generator that BUILDS n valid hands
//                 directly, instead of relying on rejection sampling.
//                 Used for rules with very low base rates.
//
// We reuse helpers from CardEx (loaded via cardex.js): RANK_VAL, COLORS, SUITS,
// deck(), sampleHand(), suitCounts(), colorCounts(), splitHalves(), etc.

(function () {
  "use strict";

  const RV = CardEx.RANK_VAL;
  const COLORS = CardEx.COLORS;
  const SUITS = CardEx.SUITS;

  // ── Helper: shuffle an array in place (Fisher-Yates) ──
  // Used by constructive generators to randomize generated hands.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Helper: pick n random items from an array (without replacement) ──
  function pickN(arr, n) {
    const copy = arr.slice();
    shuffle(copy);
    return copy.slice(0, n);
  }

  // ── Helper: all cards of a given suit ──
  function cardsOfSuit(suit) {
    return CardEx.deck(52).filter(c => c.suit === suit);
  }

  // ── Helper: all cards of a given rank ──
  function cardsOfRank(rank) {
    return CardEx.deck(52).filter(c => c.rank === rank);
  }

  // ── Helper: all cards of given ranks ──
  function cardsOfRanks(ranks) {
    const s = new Set(ranks);
    return CardEx.deck(52).filter(c => s.has(c.rank));
  }

  // ── Helper: all cards of a given color ──
  function cardsOfColor(color) {
    return CardEx.deck(52).filter(c => COLORS[c.suit] === color);
  }


  // ── Helper: random element from array ──
  function randEl(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ── Helper: halves of a hand ──
  function halves(hand) {
    const mid = Math.floor(hand.length / 2);
    return [hand.slice(0, mid), hand.slice(hand.length - mid)];
  }

  // ── Helper: generate n hands using a builder function ──
  // The builder() returns one valid hand (or null if it fails).
  // We retry up to maxRetries times per hand.
  function generateN(n, builder, maxRetries = 200) {
    const hands = [];
    for (let i = 0; i < n; i++) {
      let hand = null;
      for (let r = 0; r < maxRetries; r++) {
        hand = builder();
        if (hand) break;
      }
      if (hand) hands.push(hand);
    }
    return hands;
  }

  // =====================================================================
  //  GROUP 1: Simple, single-feature rules (~16 rules)
  // =====================================================================
  const group1 = [


    // 2. All cards are red (hearts or diamonds)
    {
      id: "all_red", group: 1,
      name: "All red",
      answer: "All cards are red (hearts or diamonds)",
      eval: (hand) => hand.every(c => COLORS[c.suit] === "RED"),
      generate: (n) => generateN(n, () => pickN(cardsOfColor("RED"), 6))
    },

    // 3. All clubs or hearts
    {
      id: "all_clubs_or_hearts", group: 1,
      name: "All clubs or hearts",
      answer: "Every card is a club or a heart",
      eval: (hand) => hand.every(c => c.suit === "CLUBS" || c.suit === "HEARTS"),
      generate: (n) => generateN(n, () => {
        const pool = CardEx.deck(52).filter(c => c.suit === "CLUBS" || c.suit === "HEARTS");
        return pickN(pool, 6);
      })
    },

    // 4. All same suit (any suit — a "flush")
    {
      id: "all_same_suit", group: 1,
      name: "All same suit",
      answer: "All six cards share the same suit",
      eval: (hand) => hand.every(c => c.suit === hand[0].suit),
      generate: (n) => generateN(n, () => {
        const suit = randEl(SUITS);
        return pickN(cardsOfSuit(suit), 6);
      })
    },


    // 10. All 4s or Queens — possible (4+4 = 8 cards, pick 6)
    {
      id: "all_4s_or_queens", group: 1,
      name: "All 4s or Queens",
      answer: "Every card is a 4 or a Queen",
      eval: (hand) => hand.every(c => c.rank === "4" || c.rank === "Q"),
      generate: (n) => generateN(n, () => pickN(cardsOfRanks(["4", "Q"]), 6))
    },

    // 11. All 4s, 8s, or 9s — possible (4+4+4 = 12 cards)
    {
      id: "all_4s_8s_or_9s", group: 1,
      name: "All 4s, 8s, or 9s",
      answer: "Every card is a 4, 8, or 9",
      eval: (hand) => hand.every(c => c.rank === "4" || c.rank === "8" || c.rank === "9"),
      generate: (n) => generateN(n, () => pickN(cardsOfRanks(["4", "8", "9"]), 6))
    },


    // 13. Triple of 2s at positions 2,3,4 (1-indexed)
    // "Positions 2,3,4" means array indices 1,2,3.
    {
      id: "triple_2s_pos234", group: 1,
      name: "Triple of 2s at positions 2–4",
      answer: "Positions 2, 3, and 4 are all 2s",
      eval: (hand) => hand.length >= 4 &&
        hand[1].rank === "2" && hand[2].rank === "2" && hand[3].rank === "2",
      generate: (n) => generateN(n, () => {
        // Positions 1,2,3 (0-indexed) must be 2s — pick 3 from the four 2s
        const twos = shuffle(cardsOfRank("2").slice());
        const rest = CardEx.deck(52).filter(c => c.rank !== "2");
        const others = pickN(rest, 3);
        // Build hand: pos0 = other, pos1-3 = twos, pos4-5 = others
        return [others[0], twos[0], twos[1], twos[2], others[1], others[2]];
      })
    },

    // 14. Triple of any rank at positions 3,4,5 (1-indexed → indices 2,3,4)
    {
      id: "triple_any_pos345", group: 1,
      name: "Triple at positions 3–5",
      answer: "Positions 3, 4, and 5 all share the same rank",
      eval: (hand) => hand.length >= 5 &&
        hand[2].rank === hand[3].rank && hand[3].rank === hand[4].rank,
      generate: (n) => generateN(n, () => {
        const rank = randEl(CardEx.RANKS);
        const pool = shuffle(cardsOfRank(rank).slice());
        if (pool.length < 3) return null;
        const rest = CardEx.deck(52).filter(c => c.rank !== rank);
        const others = pickN(rest, 3);
        return [others[0], others[1], pool[0], pool[1], pool[2], others[2]];
      })
    },

    // 15. Four-of-a-kind adjacent (any start position)
    // Four consecutive positions share the same rank.
    {
      id: "four_of_a_kind_adjacent", group: 1,
      name: "Four-of-a-kind adjacent",
      answer: "Four consecutive cards share the same rank",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 4; i++) {
          if (hand[i].rank === hand[i+1].rank &&
              hand[i+1].rank === hand[i+2].rank &&
              hand[i+2].rank === hand[i+3].rank) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const rank = randEl(CardEx.RANKS);
        const four = shuffle(cardsOfRank(rank).slice()); // all 4 suits
        const rest = CardEx.deck(52).filter(c => c.rank !== rank);
        const others = pickN(rest, 2);
        // Place four-of-a-kind at a random start position (0, 1, or 2)
        const start = Math.floor(Math.random() * 3);
        const hand = [];
        let oi = 0, fi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 4) hand.push(four[fi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },


    // -- NEW: All but one card has the same color --
    // eval: Count red vs black; the minority color has at most 1 card.
    // generate: Pick 5 cards of one color + 1 of the other (or all 6 same color).
    {
      id: "all_but_one_same_color", group: 1,
      name: "All but one same color",
      answer: "All cards except at most one are the same color",
      eval: (hand) => {
        let red = 0, black = 0;
        for (const c of hand) {
          if (COLORS[c.suit] === "RED") red++; else black++;
        }
        return Math.min(red, black) <= 1;
      },
      generate: (n) => generateN(n, () => {
        const majority = randEl(["RED", "BLACK"]);
        const minority = majority === "RED" ? "BLACK" : "RED";
        // 0 or 1 minority cards
        const nMinority = Math.random() < 0.3 ? 0 : 1;
        const majCards = pickN(cardsOfColor(majority), 6 - nMinority);
        const minCards = nMinority > 0 ? pickN(cardsOfColor(minority), nMinority) : [];
        return shuffle([...majCards, ...minCards]);
      })
    },

    // -- NEW: At least 3 cards share the same suit --
    // eval: Count cards per suit; max count >= 3.
    // generate: Pick 3 of a random suit + 3 random others.
    {
      id: "three_or_more_same_suit", group: 1,
      name: "At least 3 same suit",
      answer: "At least 3 cards share the same suit",
      eval: (hand) => {
        const cnt = { CLUBS: 0, DIAMONDS: 0, HEARTS: 0, SPADES: 0 };
        for (const c of hand) cnt[c.suit]++;
        return Math.max(cnt.CLUBS, cnt.DIAMONDS, cnt.HEARTS, cnt.SPADES) >= 3;
      },
      generate: (n) => generateN(n, () => {
        const suit = randEl(SUITS);
        const nSuit = 3 + Math.floor(Math.random() * 4); // 3-6
        const suitCards = pickN(cardsOfSuit(suit), Math.min(nSuit, 6));
        if (suitCards.length >= 6) return suitCards.slice(0, 6);
        const rest = CardEx.deck(52).filter(c => c.suit !== suit);
        const others = pickN(rest, 6 - suitCards.length);
        return shuffle([...suitCards, ...others]);
      })
    },

    // -- All same color (restored) --
    // eval: Every card in the hand shares the same color (all red or all black).
    // generate: Pick a random color (red or black), then draw 6 cards of that color.
    {
      id: "all_same_color", group: 1,
      name: "All same color",
      answer: "All cards share the same color (all red or all black)",
      eval: (hand) => {
        const c0 = COLORS[hand[0].suit];
        return hand.every(c => COLORS[c.suit] === c0);
      },
      generate: (n) => generateN(n, () => {
        const color = Math.random() < 0.5 ? "red" : "black";
        return pickN(cardsOfColor(color), 6);
      })
    },
  ];


  // =====================================================================
  //  GROUP 2: Multi-feature, counting, positional (~21 rules)
  // =====================================================================
  const group2 = [

    // 1. All even (2,4,6,8,10 only — no face cards, no aces)
    {
      id: "all_even", group: 2,
      name: "All even numbered",
      answer: "Every card is an even number (2, 4, 6, 8, or 10 — no face cards)",
      eval: (hand) => hand.every(c => {
        const v = RV[c.rank];
        return v >= 2 && v <= 10 && v % 2 === 0;
      }),
      generate: (n) => generateN(n, () => pickN(cardsOfRanks(["2","4","6","8","10"]), 6))
    },

    // 2. All odd (3,5,7,9 only — no face cards, no aces)
    {
      id: "all_odd", group: 2,
      name: "All odd numbered",
      answer: "Every card is an odd number (3, 5, 7, or 9 — no face cards)",
      eval: (hand) => hand.every(c => {
        const v = RV[c.rank];
        return v >= 3 && v <= 9 && v % 2 === 1;
      }),
      generate: (n) => generateN(n, () => pickN(cardsOfRanks(["3","5","7","9"]), 6))
    },

    // 3. Pair of Jacks at positions 4,5 (1-indexed → indices 3,4)
    {
      id: "pair_jacks_pos45", group: 1,
      name: "Pair of Jacks at pos 4–5",
      answer: "Positions 4 and 5 are both Jacks",
      eval: (hand) => hand.length >= 5 && hand[3].rank === "J" && hand[4].rank === "J",
      generate: (n) => generateN(n, () => {
        const jacks = pickN(cardsOfRank("J"), 2);
        const rest = CardEx.deck(52).filter(c => c.rank !== "J");
        const others = pickN(rest, 4);
        return [others[0], others[1], others[2], jacks[0], jacks[1], others[3]];
      })
    },

    // 4. Pair of 5s, adjacent (any position)
    // eval: Scan for two adjacent cards that are both 5s.
    // generate: Place two 5s at a random adjacent pair, fill the rest.
    {
      id: "pair_5s_adjacent", group: 2,
      name: "Pair of 5s, adjacent",
      answer: "Two adjacent cards are both 5s (any position)",
      eval: (hand) => {
        for (let i = 0; i < hand.length - 1; i++) {
          if (hand[i].rank === "5" && hand[i + 1].rank === "5") return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const fives = pickN(cardsOfRank("5"), 2);
        const rest = CardEx.deck(52).filter(c => c.rank !== "5");
        const others = pickN(rest, 4);
        const start = Math.floor(Math.random() * 5); // 0..4
        const hand = [];
        let fi = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i === start || i === start + 1) hand.push(fives[fi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 5. Triple of 3s, adjacent (any start)
    {
      id: "triple_3s_adjacent", group: 1,
      name: "Triple of 3s, adjacent",
      answer: "Three consecutive positions are all 3s",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 3; i++) {
          if (hand[i].rank === "3" && hand[i+1].rank === "3" && hand[i+2].rank === "3") return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const threes = pickN(cardsOfRank("3"), 3);
        const rest = CardEx.deck(52).filter(c => c.rank !== "3");
        const others = pickN(rest, 3);
        const start = Math.floor(Math.random() * 4); // 0..3
        const hand = [];
        let ti = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 3) hand.push(threes[ti++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },


    // 7. Triple of any rank, adjacent
    {
      id: "triple_any_adjacent", group: 2,
      name: "Triple of any rank, adjacent",
      answer: "Three consecutive positions share the same rank",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 3; i++) {
          if (hand[i].rank === hand[i+1].rank && hand[i+1].rank === hand[i+2].rank) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const rank = randEl(CardEx.RANKS);
        const pool = shuffle(cardsOfRank(rank).slice());
        if (pool.length < 3) return null;
        const rest = CardEx.deck(52).filter(c => c.rank !== rank);
        const others = pickN(rest, 3);
        const start = Math.floor(Math.random() * 4);
        const hand = [];
        let ti = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 3) hand.push(pool[ti++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 8. Four-of-a-kind adjacent, any rank
    // (Same as group1's four_of_a_kind_adjacent — included here for completeness
    //  in the plan. We'll skip it to avoid duplication.)
    // Actually — the plan lists it separately, so we include it.
    {
      id: "four_kind_adjacent_any", group: 1,
      name: "Four-of-a-kind, anywhere",
      answer: "Four positions share the same rank (any position, not necessarily adjacent)",
      eval: (hand) => {
        const cnt = {};
        for (const c of hand) cnt[c.rank] = (cnt[c.rank] || 0) + 1;
        for (const r in cnt) if (cnt[r] >= 4) return true;
        return false;
      },
      generate: (n) => generateN(n, () => {
        const rank = randEl(CardEx.RANKS);
        const four = shuffle(cardsOfRank(rank).slice());
        const rest = CardEx.deck(52).filter(c => c.rank !== rank);
        const others = pickN(rest, 2);
        return shuffle([...four, ...others]);
      })
    },

    // 9. Exactly 3 spades (anywhere)
    {
      id: "three_spades", group: 2,
      name: "At least 3 spades",
      answer: "At least three of the six cards are spades",
      eval: (hand) => hand.filter(c => c.suit === "SPADES").length >= 3,
      generate: (n) => generateN(n, () => {
        const spades = pickN(cardsOfSuit("SPADES"), 3);
        const nonSpades = CardEx.deck(52).filter(c => c.suit !== "SPADES");
        const others = pickN(nonSpades, 3);
        return shuffle([...spades, ...others]);
      })
    },

    // 10. 3 clubs, adjacent
    {
      id: "three_clubs_adjacent", group: 1,
      name: "3 clubs, adjacent",
      answer: "Three consecutive positions are all clubs",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 3; i++) {
          if (hand[i].suit === "CLUBS" && hand[i+1].suit === "CLUBS" && hand[i+2].suit === "CLUBS") return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const clubs = pickN(cardsOfSuit("CLUBS"), 3);
        const rest = CardEx.deck(52).filter(c => c.suit !== "CLUBS");
        const others = pickN(rest, 3);
        const start = Math.floor(Math.random() * 4);
        const hand = [];
        let ci = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 3) hand.push(clubs[ci++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 11. 3 of any suit, adjacent
    {
      id: "three_any_suit_adjacent", group: 2,
      name: "3 of any suit, adjacent",
      answer: "Three consecutive positions share the same suit",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 3; i++) {
          if (hand[i].suit === hand[i+1].suit && hand[i+1].suit === hand[i+2].suit) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const suit = randEl(SUITS);
        const pool = pickN(cardsOfSuit(suit), 3);
        const rest = CardEx.deck(52).filter(c => c.suit !== suit);
        const others = pickN(rest, 3);
        const start = Math.floor(Math.random() * 4);
        const hand = [];
        let pi = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 3) hand.push(pool[pi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 12. 4 hearts, adjacent
    {
      id: "four_hearts_adjacent", group: 2,
      name: "4 hearts, adjacent",
      answer: "Four consecutive positions are all hearts",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 4; i++) {
          if (hand[i].suit === "HEARTS" && hand[i+1].suit === "HEARTS" &&
              hand[i+2].suit === "HEARTS" && hand[i+3].suit === "HEARTS") return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const hearts = pickN(cardsOfSuit("HEARTS"), 4);
        const rest = CardEx.deck(52).filter(c => c.suit !== "HEARTS");
        const others = pickN(rest, 2);
        const start = Math.floor(Math.random() * 3);
        const hand = [];
        let hi = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 4) hand.push(hearts[hi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 13. 4 diamonds, anywhere
    {
      id: "four_diamonds_anywhere", group: 2,
      name: "At least 4 diamonds",
      answer: "At least four of the six cards are diamonds",
      eval: (hand) => hand.filter(c => c.suit === "DIAMONDS").length >= 4,
      generate: (n) => generateN(n, () => {
        const diamonds = pickN(cardsOfSuit("DIAMONDS"), 4);
        const rest = CardEx.deck(52).filter(c => c.suit !== "DIAMONDS");
        const others = pickN(rest, 2);
        return shuffle([...diamonds, ...others]);
      })
    },

    // 14. 4 of any suit, adjacent
    {
      id: "four_any_suit_adjacent", group: 2,
      name: "4 of any suit, adjacent",
      answer: "Four consecutive positions share the same suit",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 4; i++) {
          if (hand[i].suit === hand[i+1].suit && hand[i+1].suit === hand[i+2].suit &&
              hand[i+2].suit === hand[i+3].suit) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const suit = randEl(SUITS);
        const pool = pickN(cardsOfSuit(suit), 4);
        const rest = CardEx.deck(52).filter(c => c.suit !== suit);
        const others = pickN(rest, 2);
        const start = Math.floor(Math.random() * 3);
        const hand = [];
        let pi = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 4) hand.push(pool[pi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 15. 4 of any suit, anywhere
    {
      id: "four_any_suit_anywhere", group: 2,
      name: "4 of any suit, anywhere",
      answer: "At least four cards share the same suit (anywhere in the hand)",
      eval: (hand) => {
        const cnt = CardEx.suitCounts(hand);
        return Math.max(cnt.CLUBS, cnt.DIAMONDS, cnt.HEARTS, cnt.SPADES) >= 4;
      },
      generate: (n) => generateN(n, () => {
        const suit = randEl(SUITS);
        const pool = pickN(cardsOfSuit(suit), 4);
        const rest = CardEx.deck(52).filter(c => c.suit !== suit);
        const others = pickN(rest, 2);
        return shuffle([...pool, ...others]);
      })
    },

    // 16. Every other card is an Ace (positions 1,3,5 → indices 0,2,4)
    {
      id: "every_other_ace", group: 1,
      name: "Positions 1, 3, 5 are Aces",
      answer: "Cards at positions 1, 3, and 5 are all Aces",
      eval: (hand) => hand.length >= 5 &&
        hand[0].rank === "A" && hand[2].rank === "A" && hand[4].rank === "A",
      generate: (n) => generateN(n, () => {
        // We need 3 aces — pick 3 from 4
        const aces = pickN(cardsOfRank("A"), 3);
        const rest = CardEx.deck(52).filter(c => c.rank !== "A");
        const others = pickN(rest, 3);
        return [aces[0], others[0], aces[1], others[1], aces[2], others[2]];
      })
    },

    // 17. Cards at positions 1,3,5 are same rank
    {
      id: "pos135_same_rank", group: 1,
      name: "Pos 1, 3, 5 same rank",
      answer: "Cards at positions 1, 3, and 5 all share the same rank",
      eval: (hand) => hand.length >= 5 &&
        hand[0].rank === hand[2].rank && hand[2].rank === hand[4].rank,
      generate: (n) => generateN(n, () => {
        const rank = randEl(CardEx.RANKS);
        const pool = shuffle(cardsOfRank(rank).slice());
        if (pool.length < 3) return null;
        const rest = CardEx.deck(52).filter(c => c.rank !== rank);
        const others = pickN(rest, 3);
        return [pool[0], others[0], pool[1], others[1], pool[2], others[2]];
      })
    },

    // 18. Right half is all diamonds
    {
      id: "right_half_diamonds", group: 2,
      name: "Right half all diamonds",
      answer: "The last three cards are all diamonds",
      eval: (hand) => {
        const [, R] = halves(hand);
        return R.every(c => c.suit === "DIAMONDS");
      },
      generate: (n) => generateN(n, () => {
        const right = pickN(cardsOfSuit("DIAMONDS"), 3);
        const rest = CardEx.deck(52).filter(c => c.suit !== "DIAMONDS");
        const left = pickN(rest, 3);
        return [...left, ...right];
      })
    },

    // 19. Left half red, right half black
    {
      id: "left_red_right_black", group: 1,
      name: "Left red, right black",
      answer: "Left three cards are red, right three are black",
      eval: (hand) => {
        const [L, R] = halves(hand);
        return L.every(c => COLORS[c.suit] === "RED") && R.every(c => COLORS[c.suit] === "BLACK");
      },
      generate: (n) => generateN(n, () => {
        const left = pickN(cardsOfColor("RED"), 3);
        const right = pickN(cardsOfColor("BLACK"), 3);
        return [...left, ...right];
      })
    },

    // 20. One half red, other black (either direction)
    {
      id: "some_half_red_other_black", group: 1,
      name: "One half red, other black",
      answer: "One half is all red and the other is all black (either direction)",
      eval: (hand) => {
        const [L, R] = halves(hand);
        const Lred = L.every(c => COLORS[c.suit] === "RED");
        const Lblk = L.every(c => COLORS[c.suit] === "BLACK");
        const Rred = R.every(c => COLORS[c.suit] === "RED");
        const Rblk = R.every(c => COLORS[c.suit] === "BLACK");
        return (Lred && Rblk) || (Lblk && Rred);
      },
      generate: (n) => generateN(n, () => {
        const dir = Math.random() < 0.5;
        const left = pickN(cardsOfColor(dir ? "RED" : "BLACK"), 3);
        const right = pickN(cardsOfColor(dir ? "BLACK" : "RED"), 3);
        return [...left, ...right];
      })
    },

    // 21. Even positions red, odd positions black (1-indexed: odd=1,3,5 → indices 0,2,4)
    // "Even positions" = 2,4,6 → indices 1,3,5
    {
      id: "even_pos_red_odd_pos_black", group: 2,
      name: "Even pos red, odd pos black",
      answer: "Odd positions (1,3,5) are black, even positions (2,4,6) are red",
      eval: (hand) => {
        for (let i = 0; i < hand.length; i++) {
          const pos1 = i + 1; // 1-indexed
          if (pos1 % 2 === 0) { // even position → red
            if (COLORS[hand[i].suit] !== "RED") return false;
          } else { // odd position → black
            if (COLORS[hand[i].suit] !== "BLACK") return false;
          }
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        const reds = shuffle(cardsOfColor("RED").slice());
        const blacks = shuffle(cardsOfColor("BLACK").slice());
        // indices 0,2,4 (positions 1,3,5) → black; indices 1,3,5 (positions 2,4,6) → red
        return [blacks[0], reds[0], blacks[1], reds[1], blacks[2], reds[2]];
      })
    },

    // -- NEW: Colors palindrome --
    // eval: Map each card to its color (RED/BLACK); the sequence reads
    //       the same forwards and backwards.
    // generate: Build a 6-element palindrome by choosing 3 colors for
    //           positions 0-2, then mirroring them to positions 3-5.
    {
      id: "colors_palindrome", group: 2,
      name: "Colors palindrome",
      answer: "The sequence of colors reads the same forwards and backwards",
      eval: (hand) => {
        const seq = hand.map(c => COLORS[c.suit]);
        for (let i = 0, j = seq.length - 1; i < j; i++, j--) {
          if (seq[i] !== seq[j]) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Choose 3 colors for positions 0, 1, 2 — mirror to 5, 4, 3
        const colors = [0, 1, 2].map(() => randEl(["RED", "BLACK"]));
        const fullColors = [...colors, ...colors.slice().reverse()];
        return fullColors.map(color => {
          const pool = CardEx.deck(52).filter(c => COLORS[c.suit] === color);
          return randEl(pool);
        });
      })
    },

    // -- NEW: Halves copy colors --
    // eval: Map each card to its color; the right half's color sequence
    //       matches the left half exactly.
    // generate: Choose 3 colors for the left half, mirror them in the right.
    {
      id: "halves_copy_colors", group: 2,
      name: "Halves copy colors",
      answer: "The color sequence of the right half matches the left half",
      eval: (hand) => {
        const [L, R] = halves(hand);
        for (let i = 0; i < L.length; i++) {
          if (COLORS[L[i].suit] !== COLORS[R[i].suit]) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Pick 3 colors for the pattern, then pick random cards of those colors
        const pattern = [0, 1, 2].map(() => randEl(["RED", "BLACK"]));
        const hand = [];
        for (const color of pattern) {
          hand.push(randEl(CardEx.deck(52).filter(c => COLORS[c.suit] === color)));
        }
        for (const color of pattern) {
          hand.push(randEl(CardEx.deck(52).filter(c => COLORS[c.suit] === color)));
        }
        return hand;
      })
    },

    // -- NEW: Two pairs of ranks --
    // eval: Count ranks; at least 2 different ranks each appear >= 2 times.
    // generate: Pick 2 distinct ranks, put 2 of each, fill the rest randomly.
    {
      id: "two_pairs_ranks", group: 2,
      name: "Two pairs (ranks)",
      answer: "Two different ranks each appear at least twice",
      eval: (hand) => {
        const cnt = {};
        for (const c of hand) cnt[c.rank] = (cnt[c.rank] || 0) + 1;
        let pairs = 0;
        for (const r in cnt) if (cnt[r] >= 2) pairs++;
        return pairs >= 2;
      },
      generate: (n) => generateN(n, () => {
        const ranks = shuffle(CardEx.RANKS.slice());
        const r1 = ranks[0], r2 = ranks[1];
        const pair1 = pickN(cardsOfRank(r1), 2);
        const pair2 = pickN(cardsOfRank(r2), 2);
        const rest = CardEx.deck(52).filter(c => c.rank !== r1 && c.rank !== r2);
        const others = pickN(rest, 2);
        return shuffle([...pair1, ...pair2, ...others]);
      })
    },

    // -- NEW: Two pairs of suits --
    // eval: Count suits; at least 2 different suits each appear >= 2 times.
    // generate: Pick 2 suits, ensure 2+ cards of each, fill the rest.
    {
      id: "two_pairs_suits", group: 2,
      name: "Two pairs (suits), one per half",
      answer: "At least one suit-pair in the first half (positions 1–3) and at least one suit-pair in the second half (positions 4–6)",
      eval: (hand) => {
        // Check first half (indices 0-2) has at least one suit appearing ≥2 times
        const cntL = {};
        for (let i = 0; i < 3; i++) {
          const s = hand[i].suit;
          cntL[s] = (cntL[s] || 0) + 1;
        }
        let pairLeft = false;
        for (const s in cntL) if (cntL[s] >= 2) { pairLeft = true; break; }

        // Check second half (indices 3-5) has at least one suit appearing ≥2 times
        const cntR = {};
        for (let i = 3; i < 6; i++) {
          const s = hand[i].suit;
          cntR[s] = (cntR[s] || 0) + 1;
        }
        let pairRight = false;
        for (const s in cntR) if (cntR[s] >= 2) { pairRight = true; break; }

        return pairLeft && pairRight;
      },
      generate: (n) => generateN(n, () => {
        // Build each half with a guaranteed suit-pair + 1 random card.
        // Left half (positions 0-2): pick a suit, place 2 cards of it, 1 random.
        const suits1 = shuffle(SUITS.slice());
        const s1 = suits1[0];
        const pair1 = pickN(cardsOfSuit(s1), 2);
        const restL = CardEx.deck(52).filter(c => c.suit !== s1);
        const fillerL = [pickN(restL, 1)[0]];
        const leftHalf = shuffle([...pair1, ...fillerL]);

        // Right half (positions 3-5): pick a suit, place 2 cards of it, 1 random.
        const s2 = suits1[1];  // different suit for variety
        const pair2 = pickN(cardsOfSuit(s2), 2);
        const restR = CardEx.deck(52).filter(c => c.suit !== s2);
        const fillerR = [pickN(restR, 1)[0]];
        const rightHalf = shuffle([...pair2, ...fillerR]);

        return [...leftHalf, ...rightHalf];
      })
    },

    // -- NEW: Contains 3 consecutive ranks (step-1 AP, anywhere) --
    // eval: Build a set of rank values; check if any v has v+1 and v+2.
    // generate: Pick 3 consecutive ranks, fill the remaining 3 spots randomly.
    {
      id: "ap_len3_step1_anywhere", group: 2,
      name: "Three consecutive ranks (anywhere)",
      answer: "Three cards have consecutive ranks (e.g., 5, 6, 7) regardless of position",
      eval: (hand) => {
        const s = new Set(hand.map(c => RV[c.rank]));
        for (const v of s) if (s.has(v + 1) && s.has(v + 2)) return true;
        return false;
      },
      generate: (n) => generateN(n, () => {
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const startVal = 2 + Math.floor(Math.random() * 11); // 2..12
        const r1 = VAL_TO_RANK[startVal], r2 = VAL_TO_RANK[startVal + 1], r3 = VAL_TO_RANK[startVal + 2];
        if (!r1 || !r2 || !r3) return null;
        const three = [r1, r2, r3].map(r => ({ suit: randEl(SUITS), rank: r }));
        const usedRanks = new Set([r1, r2, r3]);
        const rest = CardEx.deck(52).filter(c => !usedRanks.has(c.rank));
        const others = pickN(rest, 3);
        return shuffle([...three, ...others]);
      })
    },
  ];


  // =====================================================================
  //  GROUP 3: Relational, structural, complex (~19 rules)
  // =====================================================================
  const group3 = [

    // 1. Even positions one color, odd positions another (either way)
    {
      id: "even_odd_pos_color_split", group: 3,
      name: "Color alternates by position parity",
      answer: "Even-numbered positions are one color, odd are the other (either direction)",
      eval: (hand) => {
        // Check: all even-pos same color AND all odd-pos same color AND they differ
        const oddColor = COLORS[hand[0].suit]; // pos 1 (odd)
        const evenColor = COLORS[hand[1].suit]; // pos 2 (even)
        if (oddColor === evenColor) return false;
        for (let i = 0; i < hand.length; i++) {
          const pos1 = i + 1;
          const expected = pos1 % 2 === 1 ? oddColor : evenColor;
          if (COLORS[hand[i].suit] !== expected) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        const dir = Math.random() < 0.5;
        const c1 = dir ? "RED" : "BLACK"; // odd positions
        const c2 = dir ? "BLACK" : "RED"; // even positions
        const pool1 = shuffle(cardsOfColor(c1).slice());
        const pool2 = shuffle(cardsOfColor(c2).slice());
        return [pool1[0], pool2[0], pool1[1], pool2[1], pool1[2], pool2[2]];
      })
    },

    // 2. Ranks in strict increasing order
    {
      id: "strict_increasing", group: 3,
      name: "Strictly increasing ranks",
      answer: "Ranks increase strictly from left to right (each card higher than the previous)",
      eval: (hand) => {
        for (let i = 1; i < hand.length; i++) {
          if (RV[hand[i].rank] <= RV[hand[i-1].rank]) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Pick 6 distinct ranks, sort them, assign random suits
        const ranks = shuffle(CardEx.RANKS.slice());
        const chosen = ranks.slice(0, 6).sort((a, b) => RV[a] - RV[b]);
        return chosen.map(r => ({ suit: randEl(SUITS), rank: r }));
      })
    },

    // 3. All blacks appear before all reds
    {
      id: "blacks_before_reds", group: 3,
      name: "All blacks before all reds",
      answer: "Every black card appears before every red card",
      eval: (hand) => {
        let lastBlack = -1, firstRed = hand.length;
        for (let i = 0; i < hand.length; i++) {
          if (COLORS[hand[i].suit] === "BLACK") lastBlack = i;
          if (COLORS[hand[i].suit] === "RED" && i < firstRed) firstRed = i;
        }
        // All blacks before all reds means the last black is before the first red
        // Edge cases: no blacks or no reds also satisfy this
        return lastBlack < firstRed;
      },
      generate: (n) => generateN(n, () => {
        // Pick a split point: 0-6 black cards, rest red
        const nBlack = Math.floor(Math.random() * 7); // 0 to 6
        const blacks = pickN(cardsOfColor("BLACK"), nBlack);
        const reds = pickN(cardsOfColor("RED"), 6 - nBlack);
        return [...blacks, ...reds];
      })
    },

    // 4. Adjacent cards share rank or suit
    {
      id: "adjacent_share_rank_or_suit", group: 3,
      name: "Adjacent share rank or suit",
      answer: "Every adjacent pair shares either rank or suit",
      eval: (hand) => {
        for (let i = 0; i + 1 < hand.length; i++) {
          if (hand[i].rank !== hand[i+1].rank && hand[i].suit !== hand[i+1].suit) return false;
        }
        return true;
      }
      // No constructive generator — base rate is moderate enough for rejection sampling
    },

    // 5. Both halves have identical rank sequence
    {
      id: "halves_copy_ranks", group: 2,
      name: "Halves copy ranks",
      answer: "The rank sequence of the right half matches the left half exactly",
      eval: (hand) => {
        const [L, R] = halves(hand);
        for (let i = 0; i < L.length; i++) {
          if (L[i].rank !== R[i].rank) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Pick 3 ranks (with replacement OK across halves, but need unique cards)
        // Strategy: pick 3 ranks, for each rank pick 2 different suits
        const hand = [];
        for (let i = 0; i < 3; i++) {
          const rank = randEl(CardEx.RANKS);
          const suits = shuffle(SUITS.slice());
          hand.push({ suit: suits[0], rank });  // left half
        }
        // Right half mirrors ranks
        for (let i = 0; i < 3; i++) {
          const rank = hand[i].rank;
          // Pick a suit different from the one already used (if possible)
          const usedSuit = hand[i].suit;
          const available = SUITS.filter(s => s !== usedSuit);
          hand.push({ suit: randEl(available), rank });
        }
        return hand;
      })
    },

    // 6. Both halves have identical suit sequence
    {
      id: "halves_copy_suits", group: 2,
      name: "Halves copy suits",
      answer: "The suit sequence of the right half matches the left half exactly",
      eval: (hand) => {
        const [L, R] = halves(hand);
        for (let i = 0; i < L.length; i++) {
          if (L[i].suit !== R[i].suit) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Pick 3 suits for positions, then assign different ranks to each half
        const suitPattern = [0,1,2].map(() => randEl(SUITS));
        const hand = [];
        const usedCards = new Set();
        for (let i = 0; i < 3; i++) {
          const suit = suitPattern[i];
          const rank = randEl(CardEx.RANKS);
          hand.push({ suit, rank });
          usedCards.add(suit + rank);
        }
        for (let i = 0; i < 3; i++) {
          const suit = suitPattern[i];
          // Pick a rank not already used for this suit in the left half
          const ranks = shuffle(CardEx.RANKS.slice());
          let picked = null;
          for (const r of ranks) {
            if (!usedCards.has(suit + r)) { picked = r; break; }
          }
          if (!picked) picked = ranks[0]; // fallback
          hand.push({ suit, rank: picked });
          usedCards.add(suit + picked);
        }
        return hand;
      })
    },

    // 7. Both halves contain a pair of ranks
    {
      id: "both_halves_have_pair_rank", group: 2,
      name: "Both halves have a pair",
      answer: "Each half contains at least one pair of matching ranks",
      eval: (hand) => {
        const [L, R] = halves(hand);
        function hasPair(h) {
          const seen = new Set();
          for (const c of h) {
            if (seen.has(c.rank)) return true;
            seen.add(c.rank);
          }
          return false;
        }
        return hasPair(L) && hasPair(R);
      },
      generate: (n) => generateN(n, () => {
        // For each half: pick a rank, put 2 of it, then 1 random different card
        function makeHalf() {
          const rank = randEl(CardEx.RANKS);
          const suits = shuffle(SUITS.slice());
          const pair = [{ suit: suits[0], rank }, { suit: suits[1], rank }];
          const otherRanks = CardEx.RANKS.filter(r => r !== rank);
          const other = { suit: randEl(SUITS), rank: randEl(otherRanks) };
          return shuffle([...pair, other]);
        }
        return [...makeHalf(), ...makeHalf()];
      })
    },

    // 8. Both halves are each uniform in suit
    {
      id: "both_halves_uniform_suit", group: 1,
      name: "Both halves uniform suit",
      answer: "All cards in the left half share a suit, and all in the right half share a suit",
      eval: (hand) => {
        const [L, R] = halves(hand);
        return L.every(c => c.suit === L[0].suit) && R.every(c => c.suit === R[0].suit);
      },
      generate: (n) => generateN(n, () => {
        const s1 = randEl(SUITS);
        const s2 = randEl(SUITS);
        const left = pickN(cardsOfSuit(s1), 3);
        const right = pickN(cardsOfSuit(s2), 3);
        return [...left, ...right];
      })
    },

    // 9. Both halves are each uniform in color
    {
      id: "both_halves_uniform_color", group: 2,
      name: "Both halves uniform color",
      answer: "All cards in the left half are the same color, and all in the right half are the same color",
      eval: (hand) => {
        const [L, R] = halves(hand);
        const Lc = COLORS[L[0].suit];
        const Rc = COLORS[R[0].suit];
        return L.every(c => COLORS[c.suit] === Lc) && R.every(c => COLORS[c.suit] === Rc);
      },
      generate: (n) => generateN(n, () => {
        const c1 = randEl(["RED", "BLACK"]);
        const c2 = randEl(["RED", "BLACK"]);
        return [...pickN(cardsOfColor(c1), 3), ...pickN(cardsOfColor(c2), 3)];
      })
    },

    // 10. AP interval 1, 3 cards, adjacent & ordered (mini straight)
    // Three consecutive positions have ranks that increase by exactly 1.
    {
      id: "ap_step1_len3_adj_ordered", group: 3,
      name: "Mini straight (3 adjacent, step 1, ordered)",
      answer: "Three consecutive positions have ranks increasing by exactly 1 (e.g., 5, 6, 7)",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 3; i++) {
          const a = RV[hand[i].rank], b = RV[hand[i+1].rank], c = RV[hand[i+2].rank];
          if (b === a + 1 && c === a + 2) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        // Pick a starting rank value (2..12 to allow +2)
        const startVal = 2 + Math.floor(Math.random() * 11);
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const r1 = VAL_TO_RANK[startVal], r2 = VAL_TO_RANK[startVal+1], r3 = VAL_TO_RANK[startVal+2];
        if (!r1 || !r2 || !r3) return null;
        const three = [
          { suit: randEl(SUITS), rank: r1 },
          { suit: randEl(SUITS), rank: r2 },
          { suit: randEl(SUITS), rank: r3 }
        ];
        const usedRanks = new Set([r1, r2, r3]);
        const rest = CardEx.deck(52).filter(c => !usedRanks.has(c.rank));
        const others = pickN(rest, 3);
        const start = Math.floor(Math.random() * 4);
        const hand = [];
        let ti = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 3) hand.push(three[ti++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 11. AP interval 2, 4 cards, adjacent & ordered
    {
      id: "ap_step2_len4_adj_ordered", group: 3,
      name: "4-card AP, step 2, adjacent & ordered",
      answer: "Four consecutive positions have ranks increasing by exactly 2 (e.g., 3, 5, 7, 9)",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 4; i++) {
          const a = RV[hand[i].rank];
          if (RV[hand[i+1].rank] === a+2 && RV[hand[i+2].rank] === a+4 && RV[hand[i+3].rank] === a+6) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const startVal = 2 + Math.floor(Math.random() * 7); // 2..8 to allow +6
        const ranks = [startVal, startVal+2, startVal+4, startVal+6].map(v => VAL_TO_RANK[v]);
        if (ranks.some(r => !r)) return null;
        const four = ranks.map(r => ({ suit: randEl(SUITS), rank: r }));
        const usedRanks = new Set(ranks);
        const rest = CardEx.deck(52).filter(c => !usedRanks.has(c.rank));
        const others = pickN(rest, 2);
        const start = Math.floor(Math.random() * 3);
        const hand = [];
        let fi = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 4) hand.push(four[fi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 12. AP interval 1, 3 cards, adjacent (any direction)
    {
      id: "ap_step1_len3_adj", group: 3,
      name: "3 adjacent, step 1 (any order)",
      answer: "Three consecutive positions contain ranks that form a run of 3 (e.g., 5, 6, 7 in any order)",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 3; i++) {
          const vals = [RV[hand[i].rank], RV[hand[i+1].rank], RV[hand[i+2].rank]].sort((a,b) => a - b);
          if (vals[1] - vals[0] === 1 && vals[2] - vals[1] === 1) return true;
        }
        return false;
      }
      // Rejection sampling is fine — base rate is moderate
    },

    // 13. AP interval 2, 4 cards, adjacent (any direction)
    {
      id: "ap_step2_len4_adj", group: 3,
      name: "4 adjacent, step 2 (any order)",
      answer: "Four consecutive positions contain ranks that form a step-2 progression (e.g., 3, 5, 7, 9 in any order)",
      eval: (hand) => {
        for (let i = 0; i <= hand.length - 4; i++) {
          const vals = [RV[hand[i].rank], RV[hand[i+1].rank], RV[hand[i+2].rank], RV[hand[i+3].rank]].sort((a,b) => a - b);
          if (vals[1] - vals[0] === 2 && vals[2] - vals[1] === 2 && vals[3] - vals[2] === 2) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const startVal = 2 + Math.floor(Math.random() * 7); // 2..8 to allow +6
        const vals = [startVal, startVal + 2, startVal + 4, startVal + 6];
        const ranks = vals.map(v => VAL_TO_RANK[v]);
        if (ranks.some(r => !r)) return null;
        // Shuffle the 4 AP cards so they appear in any order within the window
        const four = shuffle(ranks.map(r => ({ suit: randEl(SUITS), rank: r })));
        const usedRanks = new Set(ranks);
        const rest = CardEx.deck(52).filter(c => !usedRanks.has(c.rank));
        const others = pickN(rest, 2);
        const start = Math.floor(Math.random() * 3);
        const hand = [];
        let fi = 0, oi = 0;
        for (let i = 0; i < 6; i++) {
          if (i >= start && i < start + 4) hand.push(four[fi++]);
          else hand.push(others[oi++]);
        }
        return hand;
      })
    },

    // 14. Straight of 5 — any 5 of the 6 cards form consecutive ranks
    // eval: Check all 6-choose-5 subsets for a 5-card straight.
    // generate: Build 5 consecutive ranks, add a random 6th card, shuffle.
    {
      id: "straight5", group: 3,
      name: "Straight of 5",
      answer: "Five cards form a straight (consecutive ranks), no extra constraint",
      eval: (hand) => {
        for (let skip = 0; skip < hand.length; skip++) {
          const sub = hand.filter((_, i) => i !== skip);
          const vals = sub.map(c => RV[c.rank]).sort((a,b) => a - b);
          let consecutive = true;
          for (let i = 1; i < vals.length; i++) {
            if (vals[i] !== vals[i-1] + 1) { consecutive = false; break; }
          }
          if (consecutive) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        // Start value: 2..10 to allow 5 consecutive
        const startVal = 2 + Math.floor(Math.random() * 9);
        const ranks = [];
        for (let v = startVal; v < startVal + 5; v++) {
          if (!VAL_TO_RANK[v]) return null;
          ranks.push(VAL_TO_RANK[v]);
        }
        const five = ranks.map(r => ({ suit: randEl(SUITS), rank: r }));
        const usedKeys = new Set(five.map(c => c.suit + c.rank));
        const rest = CardEx.deck(52).filter(c => !usedKeys.has(c.suit + c.rank));
        const sixth = randEl(rest);
        return shuffle([...five, sixth]);
      })
    },

    // 15. Straight of 5 in same suit (5 consecutive ranks, all same suit)
    // The 6th card can be anything.
    {
      id: "straight5_same_suit", group: 3,
      name: "Straight flush of 5",
      answer: "Five cards form a straight (consecutive ranks) in the same suit",
      eval: (hand) => {
        // Check all 6 choose 5 = 6 subsets of size 5
        for (let skip = 0; skip < hand.length; skip++) {
          const sub = hand.filter((_, i) => i !== skip);
          const vals = sub.map(c => RV[c.rank]).sort((a,b) => a - b);
          const suits = sub.map(c => c.suit);
          const sameSuit = suits.every(s => s === suits[0]);
          let consecutive = true;
          for (let i = 1; i < vals.length; i++) {
            if (vals[i] !== vals[i-1] + 1) { consecutive = false; break; }
          }
          if (sameSuit && consecutive) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const suit = randEl(SUITS);
        const startVal = 2 + Math.floor(Math.random() * 9); // 2..10
        const ranks = [];
        for (let v = startVal; v < startVal + 5; v++) {
          if (!VAL_TO_RANK[v]) return null;
          ranks.push(VAL_TO_RANK[v]);
        }
        const five = ranks.map(r => ({ suit, rank: r }));
        // 6th card: random card not in the five
        const usedKeys = new Set(five.map(c => c.suit + c.rank));
        const rest = CardEx.deck(52).filter(c => !usedKeys.has(c.suit + c.rank));
        const sixth = randEl(rest);
        return shuffle([...five, sixth]);
      })
    },

    // 16. Straight of 5 in same color
    {
      id: "straight5_same_color", group: 3,
      name: "Straight of 5 in same color",
      answer: "Five cards form a straight (consecutive ranks) all in the same color",
      eval: (hand) => {
        for (let skip = 0; skip < hand.length; skip++) {
          const sub = hand.filter((_, i) => i !== skip);
          const vals = sub.map(c => RV[c.rank]).sort((a,b) => a - b);
          const colors = sub.map(c => COLORS[c.suit]);
          const sameColor = colors.every(c => c === colors[0]);
          let consecutive = true;
          for (let i = 1; i < vals.length; i++) {
            if (vals[i] !== vals[i-1] + 1) { consecutive = false; break; }
          }
          if (sameColor && consecutive) return true;
        }
        return false;
      },
      generate: (n) => generateN(n, () => {
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const color = randEl(["RED", "BLACK"]);
        const colorSuits = SUITS.filter(s => COLORS[s] === color);
        const startVal = 2 + Math.floor(Math.random() * 9);
        const ranks = [];
        for (let v = startVal; v < startVal + 5; v++) {
          if (!VAL_TO_RANK[v]) return null;
          ranks.push(VAL_TO_RANK[v]);
        }
        const five = ranks.map(r => ({ suit: randEl(colorSuits), rank: r }));
        const usedKeys = new Set(five.map(c => c.suit + c.rank));
        const rest = CardEx.deck(52).filter(c => !usedKeys.has(c.suit + c.rank));
        const sixth = randEl(rest);
        return shuffle([...five, sixth]);
      })
    },

    // -- NEW: Ranks palindrome --
    // eval: Map each card to its rank value; the sequence reads
    //       the same forwards and backwards.
    // generate: Choose 3 rank values for positions 0-2, mirror to 5-4-3.
    //           Low base rate — constructive generator needed.
    {
      id: "ranks_palindrome", group: 3,
      name: "Ranks palindrome",
      answer: "The sequence of ranks reads the same forwards and backwards",
      eval: (hand) => {
        const seq = hand.map(c => RV[c.rank]);
        for (let i = 0, j = seq.length - 1; i < j; i++, j--) {
          if (seq[i] !== seq[j]) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Pick 3 ranks for positions 0,1,2 — mirror to 5,4,3
        // Position pairs (0,5), (1,4), (2,3) must share the same rank.
        // Each pair needs 2 different suits for a valid 52-card deck draw.
        const ranks = [0, 1, 2].map(() => randEl(CardEx.RANKS));
        const hand = [];
        for (let i = 0; i < 3; i++) {
          const suitPair = pickN(SUITS.slice(), 2);
          hand[i] = { suit: suitPair[0], rank: ranks[i] };
          hand[5 - i] = { suit: suitPair[1], rank: ranks[i] };
        }
        return hand;
      })
    },

    // -- NEW: Skip-2 same rank or suit --
    // eval: For each i, cards at positions i and i+2 share rank or suit.
    //       Low base rate — constructive generator needed.
    // generate: Build a chain where every skip-2 pair shares rank or suit.
    {
      id: "skip2_same_rank_or_suit", group: 3,
      name: "Skip-2 share rank or suit",
      answer: "Each card shares rank or suit with the card 2 positions later",
      eval: (hand) => {
        for (let i = 0; i + 2 < hand.length; i++) {
          if (hand[i].rank !== hand[i + 2].rank && hand[i].suit !== hand[i + 2].suit) return false;
        }
        return true;
      },
      generate: (n) => generateN(n, () => {
        // Two interleaved chains: even positions (0,2,4) and odd positions (1,3,5).
        // Within each chain, consecutive cards must share rank or suit.
        function buildChain() {
          const cards = [];
          // Start with a random card
          const first = randEl(CardEx.deck(52));
          cards.push(first);
          for (let step = 0; step < 2; step++) {
            const prev = cards[cards.length - 1];
            // Pick a card sharing rank or suit with prev
            if (Math.random() < 0.5) {
              // Share suit
              const pool = CardEx.deck(52).filter(c => c.suit === prev.suit);
              cards.push(randEl(pool));
            } else {
              // Share rank
              const pool = CardEx.deck(52).filter(c => c.rank === prev.rank);
              cards.push(randEl(pool));
            }
          }
          return cards;
        }
        const even = buildChain(); // positions 0, 2, 4
        const odd = buildChain();  // positions 1, 3, 5
        return [even[0], odd[0], even[1], odd[1], even[2], odd[2]];
      })
    },

    // ── NEW: No adjacent same suit ──
    // Every pair of adjacent cards must have different suits.
    // Base rate ~(3/4)^5 ≈ 24% — rejection sampling is sufficient.
    {
      id: "no_adjacent_same_suit", group: 3,
      name: "No adjacent same suit",
      answer: "No two adjacent cards share the same suit",
      eval: (hand) => {
        for (let i = 0; i < hand.length - 1; i++) {
          if (hand[i].suit === hand[i + 1].suit) return false;
        }
        return true;
      }
    },

    // ── NEW: Radial-increasing ──
    // Ranks increase outward from center.
    // Three rings: center (pos 2,3), middle (pos 1,4), outer (pos 0,5).
    // Strict inequality between rings: max(center) < min(middle) < min(outer).
    // Very low base rate — constructive generator needed.
    {
      id: "radial_increasing", group: 3,
      name: "Radial-increasing",
      answer: "Ranks increase outward from center: center (positions 3–4) < middle (2, 5) < outer (1, 6)",
      eval: (hand) => {
        // 0-indexed: outer=[0,5], middle=[1,4], center=[2,3]
        const outer  = [RV[hand[0].rank], RV[hand[5].rank]];
        const middle = [RV[hand[1].rank], RV[hand[4].rank]];
        const center = [RV[hand[2].rank], RV[hand[3].rank]];
        // Center < Middle < Outer (ranks grow outward)
        return Math.max(...center) < Math.min(...middle)
            && Math.max(...middle) < Math.min(...outer);
      },
      generate: (n) => generateN(n, () => {
        // Pick 6 distinct rank values, sort ascending.
        // Bottom 2 → center, next 2 → middle, top 2 → outer.
        // Distinct values guarantee strict inter-ring inequalities.
        const allVals = [];
        for (let v = 2; v <= 14; v++) allVals.push(v);
        const picked = pickN(allVals, 6).sort((a, b) => a - b);
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const centerVals = shuffle([picked[0], picked[1]]);
        const middleVals = shuffle([picked[2], picked[3]]);
        const outerVals  = shuffle([picked[4], picked[5]]);
        const hand = new Array(6);
        hand[0] = { suit: randEl(SUITS), rank: VAL_TO_RANK[outerVals[0]] };
        hand[5] = { suit: randEl(SUITS), rank: VAL_TO_RANK[outerVals[1]] };
        hand[1] = { suit: randEl(SUITS), rank: VAL_TO_RANK[middleVals[0]] };
        hand[4] = { suit: randEl(SUITS), rank: VAL_TO_RANK[middleVals[1]] };
        hand[2] = { suit: randEl(SUITS), rank: VAL_TO_RANK[centerVals[0]] };
        hand[3] = { suit: randEl(SUITS), rank: VAL_TO_RANK[centerVals[1]] };
        return hand;
      })
    },

    // ── NEW: Zigzag ranks ──
    // Ranks alternate: R1 < R2 > R3 < R4 > R5 < R6.
    // Odd positions (1,3,5) are valleys, even positions (2,4,6) are peaks.
    // Low base rate — constructive generator needed.
    {
      id: "zigzag_ranks", group: 3,
      name: "Zigzag ranks",
      answer: "Ranks zigzag: R1 < R2 > R3 < R4 > R5 < R6",
      eval: (hand) => {
        const r = hand.map(c => RV[c.rank]);
        return r[0] < r[1] && r[1] > r[2] && r[2] < r[3]
            && r[3] > r[4] && r[4] < r[5];
      },
      generate: (n) => generateN(n, () => {
        // Pick 6 distinct rank values, sort ascending.
        // Bottom 3 → valleys (positions 0,2,4), top 3 → peaks (positions 1,3,5).
        // Since every valley < every peak, zigzag is always satisfied.
        const allVals = [];
        for (let v = 2; v <= 14; v++) allVals.push(v);
        const picked = pickN(allVals, 6).sort((a, b) => a - b);
        const valleys = shuffle([picked[0], picked[1], picked[2]]);
        const peaks   = shuffle([picked[3], picked[4], picked[5]]);
        const VAL_TO_RANK = {};
        for (const r of CardEx.RANKS) VAL_TO_RANK[RV[r]] = r;
        const vals = [valleys[0], peaks[0], valleys[1], peaks[1], valleys[2], peaks[2]];
        if (!(vals[0]<vals[1] && vals[1]>vals[2] && vals[2]<vals[3]
           && vals[3]>vals[4] && vals[4]<vals[5])) return null;
        return vals.map(v => ({ suit: randEl(SUITS), rank: VAL_TO_RANK[v] }));
      })
    },

    // ── NEW: Well-formed suit brackets — no cross-nesting (v1) ──
    // Spades="(", Clubs=")", Hearts="[", Diamonds="]".
    // Each bracket type only nests within itself — no mixing.
    // e.g. (())[] valid, ([]) invalid.
    // Context-free language (concatenation closure of two Dyck-1 languages).
    // Very low base rate — constructive generator needed.
    {
      id: "suit_brackets_no_cross", group: 3,
      name: "Suit brackets (no cross-nesting)",
      answer: "Suits as brackets (♠=( ♣=) ♥=[ ♦=]); well-formed, each type nests only within itself",
      eval: (hand) => {
        const openers = { "SPADES": "(", "HEARTS": "[" };
        const closers = { "CLUBS": ")", "DIAMONDS": "]" };
        const match   = { ")": "(", "]": "[" };
        const stack = [];
        for (const c of hand) {
          const o = openers[c.suit];
          const cl = closers[c.suit];
          if (o) {
            // If stack is non-empty, the new opener must match the type already on the stack
            if (stack.length > 0 && stack[stack.length - 1] !== o) return false;
            stack.push(o);
          } else if (cl) {
            const want = match[cl];
            if (!stack.length || stack.pop() !== want) return false;
          } else return false;
        }
        return stack.length === 0;
      },
      generate: (n) => generateN(n, () => {
        // Build a sequence of independent same-type bracket blocks, total length 6.
        function dyck1(len, open, close) {
          if (len === 0) return [];
          if (len === 2) return [open, close];
          if (Math.random() < 0.5 && len >= 4) {
            const half = 2 * (1 + Math.floor(Math.random() * (len / 2 - 1)));
            if (half >= 2 && half <= len - 2)
              return [...dyck1(half, open, close), ...dyck1(len - half, open, close)];
          }
          return [open, ...dyck1(len - 2, open, close), close];
        }
        const partitions = [[6], [4, 2], [2, 4], [2, 2, 2]];
        const parts = partitions[Math.floor(Math.random() * partitions.length)];
        const suitMap = { "(": "SPADES", ")": "CLUBS", "[": "HEARTS", "]": "DIAMONDS" };
        const seq = [];
        for (const size of parts) {
          const type = Math.random() < 0.5 ? 0 : 1;
          const open = type === 0 ? "(" : "[";
          const close = type === 0 ? ")" : "]";
          seq.push(...dyck1(size, open, close));
        }
        if (seq.length !== 6) return null;
        return seq.map(br => ({ suit: suitMap[br], rank: randEl(CardEx.RANKS) }));
      })
    },

    // ── NEW: Well-formed suit brackets — standard nested (v2) ──
    // Spades="(", Clubs=")", Hearts="[", Diamonds="]".
    // Standard Dyck-2: different bracket types CAN nest inside each other.
    // e.g. ([]) valid, ([)] invalid.
    // Context-free language (classic Dyck language on 2 bracket types).
    // Very low base rate — constructive generator needed.
    {
      id: "suit_brackets_nested", group: 3,
      name: "Suit brackets (nested)",
      answer: "Suits as brackets (♠=( ♣=) ♥=[ ♦=]); well-formed nested brackets (cross-nesting allowed)",
      eval: (hand) => {
        const openers = { "SPADES": "(", "HEARTS": "[" };
        const closers = { "CLUBS": ")", "DIAMONDS": "]" };
        const match   = { ")": "(", "]": "[" };
        const stack = [];
        for (const c of hand) {
          if (openers[c.suit]) stack.push(openers[c.suit]);
          else if (closers[c.suit]) {
            const want = match[closers[c.suit]];
            if (!stack.length || stack.pop() !== want) return false;
          } else return false;
        }
        return stack.length === 0;
      },
      generate: (n) => generateN(n, () => {
        // Generate a random well-formed Dyck-2 bracket sequence of length 6.
        function genBalanced(len) {
          if (len === 0) return [];
          if (len === 2) {
            const type = Math.random() < 0.5 ? 0 : 1;
            return [type === 0 ? "(" : "[", type === 0 ? ")" : "]"];
          }
          if (Math.random() < 0.4 && len >= 4) {
            const half = 2 * (1 + Math.floor(Math.random() * (len / 2 - 1)));
            if (half >= 2 && half <= len - 2)
              return [...genBalanced(half), ...genBalanced(len - half)];
          }
          const type = Math.random() < 0.5 ? 0 : 1;
          return [type === 0 ? "(" : "[",
                  ...genBalanced(len - 2),
                  type === 0 ? ")" : "]"];
        }
        const suitMap = { "(": "SPADES", ")": "CLUBS", "[": "HEARTS", "]": "DIAMONDS" };
        const seq = genBalanced(6);
        if (seq.length !== 6) return null;
        return seq.map(br => ({ suit: suitMap[br], rank: randEl(CardEx.RANKS) }));
      })
    },

    // ── NEW: Well-formed suit brackets — interleaved (v3) ──
    // Spades="(", Clubs=")", Hearts="[", Diamonds="]".
    // Each bracket type is independently balanced (openers always lead
    // closers left-to-right, counts match at the end). Types may cross.
    // e.g. ([)] is valid because () and [] are each independently balanced.
    // NOT context-free — context-sensitive (shuffle of two Dyck-1 languages).
    // Very low base rate — constructive generator needed.
    {
      id: "suit_brackets_interleaved", group: 3,
      name: "Suit brackets (interleaved)",
      answer: "Suits as brackets (♠=( ♣=) ♥=[ ♦=]); each type independently balanced (crossing allowed)",
      eval: (hand) => {
        // Two independent counters — one per bracket type.
        // Each counter must never go negative, and both must reach 0.
        let parenBal = 0, bracketBal = 0;
        for (const c of hand) {
          if (c.suit === "SPADES") parenBal++;
          else if (c.suit === "CLUBS") { parenBal--; if (parenBal < 0) return false; }
          else if (c.suit === "HEARTS") bracketBal++;
          else if (c.suit === "DIAMONDS") { bracketBal--; if (bracketBal < 0) return false; }
          else return false;
        }
        return parenBal === 0 && bracketBal === 0;
      },
      generate: (n) => generateN(n, () => {
        // Generate two independent Dyck-1 sequences, then randomly interleave.
        // Use splits with both types present to encourage crossings.
        const splits = [[2, 4], [4, 2]];
        const [nP, nB] = splits[Math.floor(Math.random() * splits.length)];
        function dyck1(len, open, close) {
          if (len === 0) return [];
          if (len === 2) return [open, close];
          if (Math.random() < 0.5 && len >= 4) {
            const half = 2 * (1 + Math.floor(Math.random() * (len / 2 - 1)));
            if (half >= 2 && half <= len - 2)
              return [...dyck1(half, open, close), ...dyck1(len - half, open, close)];
          }
          return [open, ...dyck1(len - 2, open, close), close];
        }
        const pSeq = dyck1(nP, "(", ")");
        const bSeq = dyck1(nB, "[", "]");
        // Random interleaving (true shuffle of two sequences)
        const result = [];
        let pi = 0, bi = 0;
        while (pi < pSeq.length && bi < bSeq.length) {
          if (Math.random() < 0.5) result.push(pSeq[pi++]);
          else result.push(bSeq[bi++]);
        }
        while (pi < pSeq.length) result.push(pSeq[pi++]);
        while (bi < bSeq.length) result.push(bSeq[bi++]);
        const suitMap = { "(": "SPADES", ")": "CLUBS", "[": "HEARTS", "]": "DIAMONDS" };
        return result.map(br => ({ suit: suitMap[br], rank: randEl(CardEx.RANKS) }));
      })
    },

    // ── NEW: Suits non-increasing (D ≥ S ≥ C ≥ H), all suits present ──
    // Assign D=4, S=3, C=2, H=1. Left to right, suit values never increase.
    // Additional constraint: all 4 suits must appear in the hand.
    // With 6 cards and 4 required suits, exactly 2 suits appear twice.
    // Constructive generator needed.
    {
      id: "suits_nonincreasing", group: 3,
      name: "Suits non-increasing (no skips), all suits present",
      answer: "Suits follow D ≥ S ≥ C ≥ H from left to right, stepping down by at most one at a time, and all four suits appear",
      eval: (hand) => {
        const SV = { "DIAMONDS": 4, "SPADES": 3, "CLUBS": 2, "HEARTS": 1 };
        // Check non-increasing with no skips
        for (let i = 0; i < hand.length - 1; i++) {
          const diff = SV[hand[i].suit] - SV[hand[i + 1].suit];
          if (diff < 0 || diff > 1) return false;
        }
        // Check all 4 suits present
        const suits = new Set(hand.map(c => c.suit));
        return suits.size === 4;
      },
      generate: (n) => generateN(n, () => {
        // With 6 positions and 4 suits (D=4,S=3,C=2,H=1), non-increasing with
        // no skips and all suits present means the sequence must start at 4 and
        // end at 1, with exactly 2 suits repeated once each.
        // Valid suit-value sequences are all ways to go 4→1 in 6 steps,
        // each step being 0 or -1, covering all of {4,3,2,1}.
        // E.g. [4,4,3,3,2,1] or [4,3,3,2,2,1] or [4,3,2,2,1,1] or [4,4,3,2,2,1] etc.
        const SV_TO_SUIT = { 4: "DIAMONDS", 3: "SPADES", 2: "CLUBS", 1: "HEARTS" };
        // We need to place 3 "drops" (steps of -1) among 5 transitions,
        // the rest are "stays" (steps of 0). 6 positions = 5 transitions,
        // 3 drops needed (4→3, 3→2, 2→1), 2 stays.
        // Choose 3 of 5 transition slots for drops.
        const slots = [0, 1, 2, 3, 4];
        const dropSlots = new Set(pickN(slots, 3));
        let v = 4;
        const vals = [v];
        for (let i = 0; i < 5; i++) {
          if (dropSlots.has(i)) v--;
          vals.push(v);
        }
        return vals.map(sv => ({ suit: SV_TO_SUIT[sv], rank: randEl(CardEx.RANKS) }));
      })
    }

  ];


  // =====================================================================
  //  Export
  // =====================================================================
  // Build final grouped arrays dynamically from each rule's .group property,
  // so rules don't need to physically live in the "right" source array.
  const allRules = [...group1, ...group2, ...group3];
  const g1 = allRules.filter(r => r.group === 1);
  const g2 = allRules.filter(r => r.group === 2);
  const g3 = allRules.filter(r => r.group === 3);

  window.GalleryRules = {
    groups: [g1, g2, g3],
    all: allRules
  };

})();
