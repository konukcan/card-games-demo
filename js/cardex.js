// js/cardex.js
// Card utilities, deck generation, and rendering.
// Supports configurable deck sizes: 52 (full), 32 (7-A), 28 (8-A).
(function(){
  "use strict";
  const SUITS = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];
  const COLORS = { CLUBS: "BLACK", SPADES: "BLACK", DIAMONDS: "RED", HEARTS: "RED" };

  // ============================================================
  // CONFIGURABLE DECK SIZE SUPPORT
  // Added 2026-02-03 to make rank-based patterns more salient
  // by reducing the number of ranks in the deck.
  // ============================================================

  // Full rank set - all 13 ranks from 2 to Ace
  const ALL_RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

  // Rank subsets by deck size:
  // - 52: Full deck (13 ranks × 4 suits)
  // - 32: Reduced deck (8 ranks × 4 suits) - ranks 7-A only
  // - 28: Further reduced (7 ranks × 4 suits) - ranks 8-A only
  const RANKS_BY_DECK_SIZE = {
    52: ["2","3","4","5","6","7","8","9","10","J","Q","K","A"],  // Full deck
    32: ["7","8","9","10","J","Q","K","A"],                      // 7-A (8 ranks)
    28: ["8","9","10","J","Q","K","A"]                           // 8-A (7 ranks)
  };

  /**
   * Get the valid ranks for a given deck size.
   * @param {number} deckSize - 52, 32, or 28
   * @returns {string[]} Array of valid rank strings
   */
  function getRanks(deckSize) {
    return RANKS_BY_DECK_SIZE[deckSize] || RANKS_BY_DECK_SIZE[52];
  }

  // RANK_VAL: Maps rank strings to numeric values.
  // IMPORTANT: We preserve face values (7→7, not 7→2) so that rule explanations
  // like "ranks differ by 2" remain intuitive regardless of deck size.
  const RANK_VAL = { "2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, "J":11, "Q":12, "K":13, "A":14 };

  // Legacy RANKS constant for backward compatibility with existing code.
  // Always refers to the full 52-card deck ranks.
  const RANKS = ALL_RANKS;

  /**
   * Generate a deck of cards with configurable size.
   * @param {number} deckSize - 52 (full), 32 (7-A), or 28 (8-A). Default: 52
   * @returns {Array} Array of card objects {suit, rank}
   *
   * Why this design:
   * - The deck is built dynamically from RANKS_BY_DECK_SIZE
   * - This ensures all downstream code (sampling, rules) only see valid cards
   * - No need to filter later; invalid ranks never enter the system
   */
  function deck(deckSize = 52) {
    const validRanks = getRanks(deckSize);
    const d = [];
    for (const s of SUITS) for (const r of validRanks) d.push({ suit:s, rank:r });
    return d;
  }

  /**
   * Backward compatibility alias for deck(52).
   * Existing code that calls deck52() will continue to work.
   */
  function deck52() {
    return deck(52);
  }

  /**
   * Sample a random hand from the deck.
   * @param {number} n - Hand size (default 6)
   * @param {number} deckSize - Deck size: 52, 32, or 28 (default 52)
   * @returns {Array} Array of n card objects
   *
   * Why we pass deckSize here:
   * - Ensures sampled hands only contain ranks valid for the experiment
   * - The Fisher-Yates shuffle is O(n) and unbiased
   */
  function sampleHand(n=6, deckSize=52){
    const d = deck(deckSize);
    // Fisher-Yates shuffle: iterate backward, swap each element with a random earlier element
    for (let i=d.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [d[i],d[j]]=[d[j],d[i]];
    }
    return d.slice(0,n);
  }
  function sumRanks(hand){ return hand.reduce((a,c)=>a + RANK_VAL[c.rank], 0); }
  function isSortedByRankNonDecreasing(hand){
    for (let i=1;i<hand.length;i++){
      if (RANK_VAL[hand[i-1].rank] > RANK_VAL[hand[i].rank]) return false;
    }
    return true;
  }
  function suitCounts(hand){
    const c = {CLUBS:0, DIAMONDS:0, HEARTS:0, SPADES:0};
    hand.forEach(card => { c[card.suit]++; });
    return c;
  }
  function colorCounts(hand){
    const c = {RED:0, BLACK:0};
    hand.forEach(card => { c[COLORS[card.suit]]++; });
    return c;
  }
  function positionsOfSuit(hand, suit){ const idx=[]; for(let i=0;i<hand.length;i++) if(hand[i].suit===suit) idx.push(i); return idx; }
  function exists_S_before_H(hand){
    const s = positionsOfSuit(hand,"SPADES");
    const h = positionsOfSuit(hand,"HEARTS");
    for (const i of s) for (const j of h) if (i < j) return true;
    return false;
  }
  function countSuit(hand, suit){ return hand.reduce((a,c)=>a+(c.suit===suit),0); }

  function hasAlignedAPStep1(seq){
    if (seq.length < 2) return false;
    for (let i=1;i<seq.length;i++) if (seq[i] !== seq[i-1] + 1) return false;
    return true;
  }
  function containsAPAnywhereLen3AnyStep(hand){
    const vals = hand.map(c => RANK_VAL[c.rank]).sort((a,b)=>a-b);
    const n = vals.length;
    for (let i=0;i<n;i++){
      for (let j=i+1;j<n;j++){
        const d = vals[j] - vals[i];
        if (d <= 0) continue;
        const target = vals[j] + d;
        let lo = j+1, hi = n-1;
        while (lo <= hi){
          const mid = (lo + hi) >> 1;
          if (vals[mid] === target) return true;
          if (vals[mid] < target) lo = mid + 1; else hi = mid - 1;
        }
      }
    }
    return false;
  }
  function hasAlignedAPAnyStepLen3(hand){
    for (let i=0;i<=hand.length-3;i++){
      const a = RANK_VAL[hand[i].rank];
      const b = RANK_VAL[hand[i+1].rank];
      const c = RANK_VAL[hand[i+2].rank];
      const d1 = b - a, d2 = c - b;
      if (d1 > 0 && d1 === d2) return true;
    }
    return false;
  }

  /**
   * Get image path for a card.
   * Works for all deck sizes - the image files for all 52 cards remain in stim/.
   * When using reduced decks (32/28), only a subset of images will be referenced.
   * We keep all mappings for forward compatibility if we ever restore full deck.
   */
  function cardImagePath(suit, rank){
    const NUM = {'2':'TWO','3':'THREE','4':'FOUR','5':'FIVE','6':'SIX','7':'SEVEN','8':'EIGHT','9':'NINE','10':'TEN','J':'JACK','Q':'QUEEN','K':'KING','A':'ACE'};
    return `stim/${NUM[rank]}_OF_${suit}.png`;
  }

  /**
   * Render a hand of cards as HTML.
   *
   * RESPONSIVE SIZING STRATEGY:
   * - When responsive=true, uses CSS clamp() for viewport-relative sizing
   * - Cards NEVER wrap to a new line (flex-wrap: nowrap + overflow-x: auto)
   * - On narrow screens, cards shrink proportionally but stay horizontal
   * - User can scroll horizontally if needed (rare, only on very narrow screens)
   *
   * @param {Array} hand - Array of card objects
   * @param {Object} options - Rendering options
   * @param {string} options.label - Optional label above the hand
   * @param {number|string} options.cardHeight - Height in px, or CSS string like 'var(--card-height-gallery)'
   * @param {string} options.gap - Gap between cards (default '4px')
   * @param {boolean} options.showSummary - Show suit/color counts below
   * @param {boolean} options.nowrap - Force horizontal layout (default true)
   * @param {string} options.justify - Flex justify-content value
   * @param {boolean} options.responsive - Use viewport-responsive sizing (default false for backward compat)
   */
  function renderHandHTML(hand, {
    label = "",
    cardHeight = 90,
    gap = '4px',
    showSummary = false,
    nowrap = true,
    justify = 'center',
    responsive = false,
    decoyHand = null
  } = {}) {
    // Determine sizing approach
    let heightStyle, widthStyle;
    if (responsive || typeof cardHeight === 'string') {
      // Responsive: use CSS custom property or provided string
      const h = typeof cardHeight === 'string' ? cardHeight : 'var(--card-height-gallery, 90px)';
      heightStyle = h;
      // Width calculated via aspect ratio in CSS calc()
      widthStyle = `calc(${h} * 0.714)`;  // 2.5/3.5 ≈ 0.714
    } else {
      // Fixed pixel sizing (backward compatible)
      heightStyle = cardHeight + 'px';
      widthStyle = Math.round(cardHeight * (2.5 / 3.5)) + 'px';
    }

    const row = hand.map((c, idx)=>{
      const src = cardImagePath(c.suit,c.rank);
      // Honeypot: if a decoy hand is provided, alt text describes the decoy card
      // instead of the real card. When users copy-paste, LLMs see the decoy rule.
      // data-suit, data-rank, and img src remain the REAL card values.
      const altCard = decoyHand ? decoyHand[idx] : c;
      const altText = `${altCard.rank} of ${altCard.suit}`;
      // flex-shrink:0 ensures cards don't shrink below their min-width
      // margin-right adds gap between cards
      return `<div class="card-wrapper" data-position="${idx+1}" data-suit="${c.suit}" data-rank="${c.rank}" style="width:${widthStyle};height:${heightStyle};padding:2px;margin-right:${gap};border-radius:6px;position:relative;display:inline-block;box-sizing:content-box;flex-shrink:0;">
        <img src="${src}" alt="${altText}" style="width:100%;height:100%;display:block;object-fit:contain;">
      </div>`;
    }).join("");

    let summary = "";
    if (showSummary) {
      const sCounts = suitCounts(hand);
      const cc = colorCounts(hand);
      const S = sumRanks(hand);
      const sorted = isSortedByRankNonDecreasing(hand);
      summary = `<div style="margin-top:6px;font-size:13px;color:#444">
          <b>Suits:</b> ♣${sCounts.CLUBS} ♦${sCounts.DIAMONDS} ♥${sCounts.HEARTS} ♠${sCounts.SPADES}
          &nbsp;|&nbsp;<b>Colors:</b> Red ${cc.RED} / Black ${cc.BLACK}
          &nbsp;|&nbsp;<b>SumRanks:</b> ${S}
          &nbsp;|&nbsp;<b>Sorted:</b> ${sorted ? "yes" : "no"}
        </div>`;
    }

    // CRITICAL: Always use nowrap + overflow-x:auto to prevent line breaks
    // Cards will scroll horizontally on very narrow screens rather than wrapping
    const flexWrap = 'nowrap';
    const overflowX = 'auto';

    return `<div style="text-align:center;margin:8px 0;">
      ${label? `<div style="font-size:14px;margin-bottom:6px;font-weight:bold;">${label}</div>`:""}
      <div style="display:flex;justify-content:${justify};align-items:center;flex-wrap:${flexWrap};overflow-x:${overflowX};padding-bottom:4px;">
        ${row}
      </div>
      ${summary}
    </div>`;
  }

  // Suit symbols for human-readable hand notation (e.g., "K♠ 10♥ 3♣")
  // Used by handToString() and exported for use in script.js, blocks_patch_explain.js,
  // and two_category_script.js — centralizes the symbol mapping that was previously
  // duplicated in three files.
  const SUIT_SYM = { CLUBS:"♣", DIAMONDS:"♦", HEARTS:"♥", SPADES:"♠" };

  // Convert a hand (array of card objects) to a compact string like "K♠ 10♥ 3♣".
  // Used throughout the codebase to log hands in CSV data (the hand_s column).
  function handToString(h){ return h.map(c => c.rank + SUIT_SYM[c.suit]).join(" "); }

  function splitHalves(hand){
    const mid = Math.floor(hand.length/2);
    return [hand.slice(0, mid), hand.slice(hand.length - mid)];
  }
  function suitsSeq(hand){ return hand.map(c => c.suit); }
  function colorsSeq(hand){ return hand.map(c => COLORS[c.suit]); }
  function ranksSeq(hand){ return hand.map(c => RANK_VAL[c.rank]); }

  /**
   * Preload all card images for a given deck size.
   * Creates hidden Image objects that trigger the browser to cache each PNG.
   * Returns a Promise that resolves when all images are loaded (or have errored).
   * This prevents broken-image placeholders during trials on slow connections.
   *
   * @param {number} deckSize - 52, 32, or 28 (defaults to 52)
   * @returns {Promise} Resolves when all images are cached
   */
  function preloadImages(deckSize = 52) {
    const ranks = getRanks(deckSize);
    const promises = [];
    for (const suit of SUITS) {
      for (const rank of ranks) {
        const src = cardImagePath(suit, rank);
        promises.push(new Promise(resolve => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;  // Don't block on missing images
          img.src = src;
        }));
      }
    }
    return Promise.all(promises);
  }

  // Export all public functions and constants
  window.CardEx = {
    // Constants
    SUITS, COLORS, RANKS, RANK_VAL,
    // Deck size configuration (new)
    ALL_RANKS, RANKS_BY_DECK_SIZE, getRanks,
    // Deck generation
    deck, deck52, sampleHand,
    // Hand analysis utilities
    sumRanks, isSortedByRankNonDecreasing,
    suitCounts, colorCounts, positionsOfSuit, exists_S_before_H, countSuit,
    hasAlignedAPAnyStepLen3, containsAPAnywhereLen3AnyStep, hasAlignedAPStep1,
    // Rendering
    cardImagePath, renderHandHTML, preloadImages,
    // Sequence helpers
    splitHalves, suitsSeq, colorsSeq, ranksSeq,
    // String formatting
    SUIT_SYM, handToString
  };
})();
