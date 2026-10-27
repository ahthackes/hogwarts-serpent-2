/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — all 24 trials
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});

  HPS.ACTS = [
    { id: 1, name: "The First Year", sub: "Walls, wands & wonder", levels: [1, 6] },
    { id: 2, name: "The Chamber", sub: "Whispers beneath the school", levels: [7, 12] },
    { id: 3, name: "The Trials", sub: "Mazes, vaults & fire", levels: [13, 18] },
    { id: 4, name: "The Last War", sub: "What waits in the dark", levels: [19, 24] }
  ];

  HPS.LEVELS = [
    /* ---------------- ACT I ---------------- */
    {
      id: 1, act: 1, name: "Diagon Alley", theme: "alley",
      tagline: "Every journey begins with a crooked street.",
      speed: 6, speedMax: 9.5, accelEvery: 4,
      target: 8, par: 45, score3: 220,
      start: { x: 7, y: 9, dir: "right" },
      walls: [[4, 3, 4, 1], [4, 14, 4, 1], [16, 3, 4, 1], [16, 14, 4, 1]],
      patrols: 0,
      intro: "Gather the Golden Snitch among the shop stalls."
    },
    {
      id: 2, act: 1, name: "Ollivanders", theme: "shop",
      tagline: "The wand chooses the wizard. The shelves do not.",
      speed: 6.2, speedMax: 10, accelEvery: 4,
      target: 10, par: 55, score3: 300,
      start: { x: 4, y: 9, dir: "right" },
      walls: [[5, 2, 1, 5], [5, 11, 1, 5], [10, 2, 1, 5], [10, 11, 1, 5],
              [15, 2, 1, 5], [15, 11, 1, 5], [20, 2, 1, 5], [20, 11, 1, 5]],
      patrols: 0,
      intro: "Narrow aisles. Mind the thousand boxes of wands."
    },
    {
      id: 3, act: 1, name: "Hogwarts Express", theme: "train",
      tagline: "The train does not stop for snakes.",
      speed: 6.5, speedMax: 10.5, accelEvery: 4,
      target: 10, par: 55, score3: 310,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[3, 4, 7, 1], [14, 4, 7, 1], [3, 13, 7, 1], [14, 13, 7, 1],
              [10, 6, 1, 3], [13, 9, 1, 3]],
      patrols: 0,
      intro: "Carriage after carriage, and the trolley is always near."
    },
    {
      id: 4, act: 1, name: "The Black Lake", theme: "lake",
      tagline: "Something pale moves beneath the water.",
      speed: 6.6, speedMax: 10.5, accelEvery: 4,
      target: 11, par: 60, score3: 360,
      start: { x: 6, y: 9, dir: "right" },
      walls: [[4, 3, 2, 2], [9, 6, 3, 1], [14, 3, 2, 2], [18, 7, 2, 2],
              [5, 12, 2, 2], [10, 13, 3, 1], [16, 14, 2, 2]],
      fog: [[1, 14, 8, 3], [15, 1, 8, 3]],
      patrols: 0,
      intro: "Cold water, colder shadows. Keep to the shallows."
    },
    {
      id: 5, act: 1, name: "The Great Hall", theme: "hall",
      tagline: "A thousand candles, and not a single crumb to waste.",
      speed: 6.9, speedMax: 11, accelEvery: 4,
      target: 12, par: 62, score3: 420,
      start: { x: 5, y: 10, dir: "right" },
      walls: [[4, 4, 6, 1], [14, 4, 6, 1], [4, 8, 6, 1], [14, 8, 6, 1],
              [4, 12, 6, 1], [14, 12, 6, 1]],
      patrols: 0,
      intro: "Long tables, longer shadows. The feast is watching."
    },
    {
      id: 6, act: 1, name: "The Mountain Troll", theme: "dungeon", boss: "troll",
      tagline: "It came through the door. It did not use the handle.",
      speed: 6.4, speedMax: 10, accelEvery: 4,
      target: 8, par: 55, score3: 380,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[3, 3, 2, 2], [19, 3, 2, 2], [3, 13, 2, 2], [19, 13, 2, 2]],
      patrols: 0,
      intro: "The troll slams the floor where you stand. Watch the marks."
    },

    /* ---------------- ACT II ---------------- */
    {
      id: 7, act: 2, name: "Forbidden Forest", theme: "forest",
      tagline: "The trees remember everyone who enters.",
      speed: 7, speedMax: 11.5, accelEvery: 5,
      target: 12, par: 62, score3: 460,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[4, 2, 2, 2], [9, 1, 2, 2], [15, 4, 2, 2], [20, 7, 2, 2],
              [7, 9, 2, 2], [13, 11, 2, 2], [18, 13, 2, 2], [3, 14, 2, 2]],
      fog: [[1, 1, 22, 3], [1, 12, 22, 5]],
      patrols: 1, hazard: "spider",
      intro: "Something with too many legs is walking your lane."
    },
    {
      id: 8, act: 2, name: "The Quidditch Pitch", theme: "pitch",
      tagline: "Seventy feet of open air on every side.",
      speed: 7.5, speedMax: 12, accelEvery: 5,
      target: 12, par: 60, score3: 500,
      start: { x: 10, y: 9, dir: "right" },
      walls: [[6, 4, 1, 10], [17, 4, 1, 10], [6, 3, 1, 1], [17, 3, 1, 1],
              [1, 2, 1, 3], [22, 2, 1, 3], [1, 13, 1, 3], [22, 13, 1, 3]],
      patrols: 1, hazard: "knight",
      intro: "The hoops stand still. The bludgers do not."
    },
    {
      id: 9, act: 2, name: "Myrtle's Bathroom", theme: "bath",
      tagline: "The water is always running. Nobody is here.",
      speed: 7, speedMax: 11.5, accelEvery: 5,
      target: 13, par: 65, score3: 520,
      start: { x: 6, y: 9, dir: "right" },
      walls: [[4, 3, 1, 4], [9, 3, 1, 4], [14, 3, 1, 4], [19, 3, 1, 4],
              [4, 11, 1, 4], [9, 11, 1, 4], [14, 11, 1, 4], [19, 11, 1, 4]],
      fog: [[1, 8, 22, 2]],
      patrols: 1, hazard: "ghost",
      intro: "A ghost drifts between the stalls. Do not let her touch you."
    },
    {
      id: 10, act: 2, name: "Restricted Section", theme: "library",
      tagline: "Books that bite. Shelves that watch.",
      speed: 7.2, speedMax: 12, accelEvery: 5,
      target: 13, par: 68, score3: 560,
      start: { x: 5, y: 5, dir: "right" },
      walls: [[2, 3, 7, 1], [11, 3, 9, 1], [2, 7, 9, 1], [13, 7, 7, 1],
              [2, 11, 7, 1], [11, 11, 9, 1], [2, 15, 7, 1], [11, 15, 9, 1]],
      patrols: 1, hazard: "knight",
      intro: "Every shelf is a corridor. Every corridor is a trap."
    },
    {
      id: 11, act: 2, name: "Chamber Entrance", theme: "chamber",
      tagline: "Speak to the sink. It has been waiting.",
      speed: 7.5, speedMax: 12, accelEvery: 5,
      target: 13, par: 68, score3: 580,
      start: { x: 4, y: 9, dir: "right" },
      walls: [[5, 1, 1, 6], [5, 11, 1, 6], [9, 1, 1, 4], [9, 8, 1, 8],
              [14, 1, 1, 6], [14, 11, 1, 6], [18, 1, 1, 4], [18, 8, 1, 8]],
      fog: [[1, 1, 22, 2]],
      patrols: 2, hazard: "ghost",
      intro: "The pipes run deep. The pipes run everywhere."
    },
    {
      id: 12, act: 2, name: "The Basilisk", theme: "basilisk", boss: "basilisk",
      tagline: "Do not meet its eyes.",
      speed: 7.2, speedMax: 11.5, accelEvery: 4,
      target: 9, par: 65, score3: 520,
      start: { x: 7, y: 9, dir: "right" },
      walls: [[4, 4, 2, 1], [18, 4, 2, 1], [4, 13, 2, 1], [18, 13, 2, 1],
              [11, 2, 2, 1], [11, 15, 2, 1]],
      patrols: 0,
      intro: "A band of green light sweeps the chamber. Do not be in it."
    },

    /* ---------------- ACT III ---------------- */
    {
      id: 13, act: 3, name: "Hogsmeade", theme: "village",
      tagline: "Snow, butterbeer, and a great many places to hide.",
      speed: 7.4, speedMax: 12, accelEvery: 5,
      target: 13, par: 66, score3: 600,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[3, 3, 4, 3], [16, 3, 4, 3], [3, 12, 4, 3], [16, 12, 4, 3]],
      patrols: 1, hazard: "knight",
      intro: "The village is quiet. The armour is not."
    },
    {
      id: 14, act: 3, name: "Shrieking Shack", theme: "shack",
      tagline: "The floorboards scream before you do.",
      speed: 7.6, speedMax: 12.2, accelEvery: 5,
      target: 14, par: 68, score3: 640,
      start: { x: 6, y: 9, dir: "right" },
      walls: [[4, 2, 1, 5], [4, 12, 1, 4], [9, 5, 6, 1], [10, 8, 1, 4],
              [15, 2, 1, 5], [15, 12, 1, 4], [18, 9, 4, 1]],
      fog: [[6, 1, 12, 2]],
      patrols: 2, hazard: "ghost",
      intro: "Broken walls, broken boards, and something pacing upstairs."
    },
    {
      id: 15, act: 3, name: "Time-Turner Halls", theme: "time",
      tagline: "You have been here before. You will be here again.",
      speed: 7.8, speedMax: 12.5, accelEvery: 5,
      target: 14, par: 68, score3: 680,
      start: { x: 4, y: 9, dir: "right" },
      walls: [[7, 5, 1, 8], [16, 5, 1, 8], [12, 7, 1, 4], [3, 2, 4, 1], [17, 15, 4, 1]],
      portals: [[[2, 3], [21, 14]], [[21, 3], [2, 14]]],
      patrols: 1, hazard: "knight",
      intro: "Two doorways, one moment. Step through and keep your tail."
    },
    {
      id: 16, act: 3, name: "Triwizard Maze", theme: "maze",
      tagline: "The hedges move when you are not looking.",
      speed: 7.8, speedMax: 12.5, accelEvery: 5,
      target: 14, par: 72, score3: 700,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[4, 3, 7, 1], [13, 3, 7, 1], [4, 6, 1, 3], [9, 6, 6, 1], [18, 6, 1, 3],
              [4, 10, 7, 1], [13, 10, 7, 1], [4, 13, 1, 3], [9, 13, 6, 1], [18, 13, 1, 3]],
      patrols: 2, hazard: "spider",
      intro: "The centre of the maze is never where you left it."
    },
    {
      id: 17, act: 3, name: "Gringotts Vaults", theme: "vault",
      tagline: "Gold, goblins, and a very long drop.",
      speed: 8, speedMax: 13, accelEvery: 5,
      target: 14, par: 70, score3: 720,
      start: { x: 4, y: 9, dir: "right" },
      walls: [[5, 2, 1, 5], [5, 11, 1, 5], [10, 5, 1, 8], [15, 2, 1, 5],
              [15, 11, 1, 5], [20, 5, 1, 8]],
      portals: [[[2, 4], [21, 13]]],
      patrols: 1, hazard: "knight",
      intro: "Vault doors open for no one. The cart does not stop."
    },
    {
      id: 18, act: 3, name: "The Hungarian Horntail", theme: "dragon", boss: "dragon",
      tagline: "A dragon does not share its gold.",
      speed: 7.6, speedMax: 12, accelEvery: 4,
      target: 10, par: 68, score3: 660,
      start: { x: 6, y: 9, dir: "right" },
      walls: [[4, 4, 2, 2], [18, 4, 2, 2], [4, 12, 2, 2], [18, 12, 2, 2]],
      patrols: 0,
      intro: "Fire runs down the marked row. Move before it breathes."
    },

    /* ---------------- ACT IV ---------------- */
    {
      id: 19, act: 4, name: "Astronomy Tower", theme: "tower",
      tagline: "The stars are close enough to touch.",
      speed: 8.1, speedMax: 13, accelEvery: 5,
      target: 15, par: 72, score3: 780,
      start: { x: 6, y: 9, dir: "right" },
      walls: [[4, 4, 1, 5], [7, 9, 1, 4], [10, 13, 1, 3], [13, 5, 1, 4],
              [16, 10, 1, 4], [19, 4, 1, 5]],
      fog: [[1, 1, 22, 2], [1, 15, 22, 2]],
      patrols: 2, hazard: "dementor",
      intro: "Dementors drift along the parapets. Keep moving."
    },
    {
      id: 20, act: 4, name: "Room of Requirement", theme: "room",
      tagline: "It gives you what you need. Sometimes that is a wall.",
      speed: 8.2, speedMax: 13.2, accelEvery: 5,
      target: 15, par: 74, score3: 800,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[3, 3, 2, 1], [19, 3, 2, 1], [3, 14, 2, 1], [19, 14, 2, 1]],
      shifters: [
        [[8, 2, 1, 4], [8, 12, 1, 4]],
        [[15, 2, 1, 4], [15, 12, 1, 4]],
        [[11, 6, 2, 1], [11, 11, 2, 1]]
      ],
      patrols: 1, hazard: "knight",
      intro: "Rune walls fade in and out. Never stand where one will appear."
    },
    {
      id: 21, act: 4, name: "Ministry of Magic", theme: "ministry",
      tagline: "The lifts are never where you left them.",
      speed: 8.3, speedMax: 13.4, accelEvery: 5,
      target: 15, par: 72, score3: 820,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[10, 7, 4, 3], [3, 3, 1, 4], [20, 3, 1, 4], [3, 11, 1, 4], [20, 11, 1, 4]],
      portals: [[[2, 2], [21, 15]], [[21, 2], [2, 15]]],
      patrols: 2, hazard: "knight",
      intro: "Fireplaces flicker. Step into one and you will come out elsewhere."
    },
    {
      id: 22, act: 4, name: "Dementor Fog", theme: "fog",
      tagline: "The cold arrives before they do.",
      speed: 8.4, speedMax: 13.5, accelEvery: 5,
      target: 15, par: 74, score3: 840,
      start: { x: 5, y: 9, dir: "right" },
      walls: [[4, 4, 3, 1], [17, 4, 3, 1], [4, 13, 3, 1], [17, 13, 3, 1],
              [11, 8, 2, 2]],
      fog: [[1, 1, 22, 5], [1, 12, 22, 5]],
      patrols: 3, hazard: "dementor",
      intro: "Three of them. The fog is thick enough to drown in."
    },
    {
      id: 23, act: 4, name: "Battle of Hogwarts", theme: "battle",
      tagline: "The castle is falling. Keep your head down.",
      speed: 8.5, speedMax: 13.6, accelEvery: 5,
      target: 16, par: 78, score3: 880,
      start: { x: 12, y: 6, dir: "right" },
      walls: [[3, 3, 2, 1], [6, 6, 1, 2], [10, 3, 3, 1], [16, 3, 1, 2], [20, 5, 2, 1],
              [5, 9, 2, 1], [9, 12, 3, 1], [14, 9, 1, 2], [18, 12, 2, 1],
              [3, 14, 2, 1], [12, 15, 3, 1]],
      fog: [[1, 1, 22, 2]],
      patrols: 3, hazard: "knight",
      intro: "Rubble, fire, and armour that answers to no one."
    },
    {
      id: 24, act: 4, name: "The Dark Lord", theme: "final", boss: "dark",
      tagline: "The last corridor. The last chance.",
      speed: 8.2, speedMax: 13, accelEvery: 4,
      target: 12, par: 75, score3: 900,
      start: { x: 6, y: 9, dir: "right" },
      walls: [[4, 4, 2, 2], [18, 4, 2, 2], [4, 12, 2, 2], [18, 12, 2, 2]],
      patrols: 0,
      intro: "Rune circles ignite beneath you. Leave before they close."
    }
  ];

  HPS.BOSS_INFO = {
    troll: {
      name: "The Mountain Troll", line: "Club slams — watch the ground marks",
      color: "#d9a066", accent: "#ffb066"
    },
    basilisk: {
      name: "The Basilisk", line: "A gaze wave sweeps the chamber — do not be in it",
      color: "#7fd6a8", accent: "#4ee39b"
    },
    dragon: {
      name: "The Horntail", line: "Fire rakes a whole row — leave the line",
      color: "#ffa55c", accent: "#ff6a2b"
    },
    dark: {
      name: "The Dark Lord", line: "Rune circles ignite — step away before they burst",
      color: "#c58cff", accent: "#8d4dff"
    }
  };
})();
