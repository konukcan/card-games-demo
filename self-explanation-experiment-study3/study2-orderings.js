/* Study #2 — frozen rule-ordering pool + practice-rule content.
 * Orderings are frozen and shared across conditions so rule order is
 * decorrelated from condition (design §6.3). Assignment is a djb2 hash
 * of the participant id → pool index (deterministic, reproducible).
 */
(function () {
  "use strict";

  function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  var ALL10_ORDERINGS = [
    [0,1,2,3,4, 5,6,7,8,9], [5,6,7,8,9, 0,1,2,3,4],
    [2,4,1,3,0, 7,9,6,8,5], [7,9,6,8,5, 2,4,1,3,0],
    [3,0,4,2,1, 8,5,9,6,7], [8,5,9,6,7, 3,0,4,2,1],
    [1,3,0,4,2, 6,8,5,9,7], [6,8,5,9,7, 1,3,0,4,2],
    [4,2,3,1,0, 9,7,8,6,5], [9,7,8,6,5, 4,2,3,1,0],
  ];
  var GROUP_ORDERINGS = [
    [0,1,2,3,4],[1,2,3,4,0],[2,3,4,0,1],[3,4,0,1,2],[4,0,1,2,3],
    [0,2,4,1,3],[1,3,0,2,4],[2,4,1,3,0],[3,0,2,4,1],[4,1,3,0,2],
  ];

  function assignOrdering(ruleScope, participantId) {
    var pool = ruleScope === "group" ? GROUP_ORDERINGS : ALL10_ORDERINGS;
    return pool[djb2(String(participantId || "anon")) % pool.length].slice();
  }

  /* The tutorial / practice rule: right_half_diamonds — card positions 4,5,6
   * are all diamonds. gallery = the 6 hands also shown on the tutorial gallery
   * slide. The 2 test hands are adversarial near-cases: each a few edits from a
   * gallery hand (one winning, one a one-edit losing near-miss). */
  var TUTORIAL_RULE = {
    ruleId: "right_half_diamonds",
    gallery: [
      [{rank:"7",suit:"CLUBS"},{rank:"10",suit:"HEARTS"},{rank:"3",suit:"SPADES"},{rank:"5",suit:"DIAMONDS"},{rank:"K",suit:"DIAMONDS"},{rank:"8",suit:"DIAMONDS"}],
      [{rank:"Q",suit:"DIAMONDS"},{rank:"4",suit:"HEARTS"},{rank:"9",suit:"CLUBS"},{rank:"2",suit:"DIAMONDS"},{rank:"7",suit:"DIAMONDS"},{rank:"J",suit:"DIAMONDS"}],
      [{rank:"6",suit:"HEARTS"},{rank:"A",suit:"SPADES"},{rank:"5",suit:"CLUBS"},{rank:"10",suit:"DIAMONDS"},{rank:"3",suit:"DIAMONDS"},{rank:"Q",suit:"DIAMONDS"}],
      [{rank:"K",suit:"CLUBS"},{rank:"8",suit:"SPADES"},{rank:"2",suit:"DIAMONDS"},{rank:"9",suit:"DIAMONDS"},{rank:"4",suit:"DIAMONDS"},{rank:"A",suit:"DIAMONDS"}],
      [{rank:"J",suit:"HEARTS"},{rank:"3",suit:"CLUBS"},{rank:"6",suit:"SPADES"},{rank:"6",suit:"DIAMONDS"},{rank:"8",suit:"DIAMONDS"},{rank:"2",suit:"DIAMONDS"}],
      [{rank:"9",suit:"SPADES"},{rank:"Q",suit:"CLUBS"},{rank:"5",suit:"HEARTS"},{rank:"K",suit:"DIAMONDS"},{rank:"7",suit:"DIAMONDS"},{rank:"4",suit:"DIAMONDS"}]
    ],
    testHands: [
      // WINNING — positions 4,5,6 all diamonds; a few edits from gallery hand 1.
      { hand: [{rank:"3",suit:"SPADES"},{rank:"J",suit:"HEARTS"},{rank:"8",suit:"CLUBS"},{rank:"5",suit:"DIAMONDS"},{rank:"K",suit:"DIAMONDS"},{rank:"8",suit:"DIAMONDS"}],
        ground_truth: true },
      // LOSING — gallery hand 1 with position-5 suit edited DIAMONDS->SPADES (one-edit near-miss).
      { hand: [{rank:"7",suit:"CLUBS"},{rank:"10",suit:"HEARTS"},{rank:"3",suit:"SPADES"},{rank:"5",suit:"DIAMONDS"},{rank:"K",suit:"SPADES"},{rank:"8",suit:"DIAMONDS"}],
        ground_truth: false }
    ]
  };

  window.Study2Orderings = {
    ALL10_ORDERINGS: ALL10_ORDERINGS,
    GROUP_ORDERINGS: GROUP_ORDERINGS,
    assignOrdering: assignOrdering,
    TUTORIAL_RULE: TUTORIAL_RULE,
    _djb2: djb2,
  };
})();
