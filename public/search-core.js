// ========================================
// BRUSH — shared search engine
// ----------------------------------------
// One scorer for the store grid and the navbar suggestions, so a shopper gets
// the same answer wherever they type. Search used to demand that every typed
// word appear as a literal substring, which meant "vintage car" missed "Retro
// Automobile Print", "tee" missed Apparel, and one typo returned nothing.
// ========================================
(function () {
  // ---- search: scoring, not filtering ------------------------------------
  // Search used to demand that every typed word appear as a literal substring,
  // so "vintage car" missed "Retro Automobile Print", "tee" missed Apparel and
  // one typo returned nothing at all. It now expands the query, scores every
  // product and ranks the results.

  // Shopper vocabulary -> the words actually in the catalogue.
  const SYNONYMS = {
    'wall art': ['poster', 'print'], 'wallart': ['poster', 'print'],
    print: ['poster'], prints: ['poster'], painting: ['poster'], art: ['poster'],
    frame: ['poster'], framed: ['poster'], decor: ['poster', 'wallpaper', 'wall setup pack'],
    'room decor': ['poster', 'wall setup pack', 'wallpaper'],
    'wall setup': ['wall setup pack', 'poster pack', 'pack'],
    'poster pack': ['wall setup pack', 'pack', 'poster'],
    pack: ['wall setup pack', 'poster pack'],
    packs: ['wall setup pack', 'poster pack'],
    collage: ['wall setup pack', 'pack', 'poster'],
    'collage kit': ['wall setup pack', 'pack', 'poster'],
    hostel: ['wall setup pack', 'poster', 'room decor'],
    dorm: ['wall setup pack', 'poster', 'room decor'],
    displate: ['metal posters', 'metal'],
    metal: ['metal posters'],
    'metal poster': ['metal posters'],
    tee: ['apparel', 'shirt'], tees: ['apparel', 'shirt'],
    tshirt: ['apparel', 'shirt'], 't-shirt': ['apparel', 'shirt'],
    hoodie: ['apparel'], clothing: ['apparel'], merch: ['apparel'],
    decal: ['sticker'], decals: ['sticker'], label: ['sticker'],
    stickers: ['sticker'], sticker: ['stickers'],
    figure: ['collectible'], figurine: ['collectible'], toy: ['collectible'],
    statue: ['collectible'], model: ['collectible'],
    wallpaper: ['wallpaper'], background: ['wallpaper'],
    tapestry: ['tapestries'], tapestries: ['tapestry'],
    flower: ['floral'], flowers: ['floral'], botanical: ['floral'],
    car: ['automobile', 'auto', 'f1'], cars: ['automobile', 'auto', 'f1'],
    f1: ['formula 1', 'racing', 'motorsport'],
    racing: ['f1', 'formula 1'],
    football: ['sports', 'messi', 'ronaldo'],
    cricket: ['sports'],
    bike: ['motorcycle'], space: ['sci-fi', 'galaxy', 'astronaut'],
    galaxy: ['space'], nasa: ['space'], astronaut: ['space'],
    film: ['movie'], films: ['movie'], series: ['tv'], show: ['tv'],
    cartoon: ['anime'], manga: ['anime'], japanese: ['anime'],
    quote: ['typography', 'motivation'], quotes: ['typography', 'motivation'],
    text: ['typography'], words: ['typography'],
    gym: ['motivation'], fitness: ['motivation'], hustle: ['motivation'],
    god: ['mythological'], hindu: ['mythological'], mythology: ['mythological'],
    simple: ['minimalist'], clean: ['minimalist'], aesthetic: ['minimalist', 'wall setup pack'],
    retro: ['vintage'], old: ['vintage'], classic: ['vintage'],
    game: ['gaming'], games: ['gaming'], gamer: ['gaming'],
    travel: ['travel'], map: ['travel'], city: ['travel'],
    batman: ['dark knight', 'joker', 'bruce wayne', 'gotham'],
    joker: ['batman', 'dark knight', 'heath ledger'],
    spiderman: ['spider-man', 'spider-verse', 'miles morales', 'peter parker'],
    'spider-man': ['spiderman', 'spider-verse', 'miles morales'],
    spiderverse: ['spider-verse', 'miles morales', 'gwen stacy'],
    nolan: ['oppenheimer', 'interstellar', 'inception', 'tenet', 'dark knight'],
    interstellar: ['gargantua', 'space', 'nolan'],
    inception: ['nolan', 'dream'],
    oppenheimer: ['nolan', 'trinity'],
    dune: ['arrakis', 'paul atreides', 'chani'],
    messi: ['barcelona', 'argentina', 'lionel messi', 'football', 'sports'],
    ronaldo: ['football', 'sports', 'messi'],
    verstappen: ['f1', 'red bull', 'max verstappen'],
    leclerc: ['f1', 'ferrari', 'charles leclerc'],
    senna: ['f1', 'mclaren', 'ayrton senna'],
    hamilton: ['f1', 'mercedes', 'lewis hamilton'],
    alonso: ['f1', 'aston martin', 'fernando alonso'],
    norris: ['f1', 'mclaren', 'lando norris'],
    'demon slayer': ['tanjiro', 'nezuko', 'zenitsu', 'kimetsu', 'anime'],
    demonslayer: ['demon slayer', 'tanjiro', 'nezuko', 'anime'],
    'one piece': ['onepiece', 'luffy', 'zoro', 'straw hat', 'anime'],
    onepiece: ['one piece', 'luffy', 'zoro', 'anime'],
    'dragon ball': ['dragonball', 'goku', 'super saiyan', 'dbz', 'anime'],
    dragonball: ['dragon ball', 'goku', 'super saiyan', 'anime'],
    naruto: ['sasuke', 'hidden leaf', 'nine-tails', 'anime'],
    lana: ['lana del rey', 'born to die', 'ultraviolence', 'west coast'],
    'arctic monkeys': ['alex turner', 'am', 'do i wanna know', 'arabella'],
    coldplay: ['yellow', 'parachutes'],
    'coke studio': ['ae ajnabee', 'tum se', 'sun saawariya'],
    'pulp fiction': ['tarantino', 'mia wallace', 'jules', 'bad mother fucker'],
    'fight club': ['tyler durden', 'brad pitt'],
    rdr: ['red dead redemption', 'arthur morgan', 'rdr2'],
    rdr2: ['red dead redemption', 'arthur morgan'],
    gta: ['grand theft auto', 'vice city', 'tommy vercetti'],
    mario: ['super mario', 'nintendo', 'mario kart'],
    kart: ['mario kart', 'racing'],
    cheap: [], budget: [], best: [], new: [], buy: [], online: [], india: []
  };

  const STOP = new Set(['for','of','with','and','or','to','in','my','me','want','need','looking','show','some','poster','posters']);

  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  // crude singular, enough for "flowers"/"flower", "cars"/"car"
  function stem(w) {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 3 && w.endsWith('es')) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }

  /** Bounded edit distance. Short words get one slip, longer ones two, so
   *  "anme"->"anime" and "minimalistic"->"minimalist" both repair, while
   *  unrelated short words stay apart. */
  function near(a, b) {
    if (a === b) return true;
    const max = Math.max(a.length, b.length) >= 8 ? 2 : 1;
    if (Math.min(a.length, b.length) < 4) return false;
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return false;      // whole row already too far
      prev = cur;
    }
    return prev[b.length] <= max;
  }

  let VOCAB = [];
  const keywordText = (p) => (Array.isArray(p.keywords) ? p.keywords.join(' ') : String(p.keywords || '')).toLowerCase();
  const categoryText = (p) => (Array.isArray(p.categories) ? p.categories.join(' ') : String(p.category || ''));
  function buildVocab(list) {
    const seen = new Set();
    list.forEach(p => {
      norm(`${p.name || ''} ${categoryText(p)} ${keywordText(p)}`).split(' ')
        .forEach(w => { if (w.length > 3) seen.add(w); });
    });
    VOCAB = [...seen];
  }

  /** Query -> weighted terms with precompiled prefix and word matchers for 60x speed. */
  function expand(q) {
    const rawTokens = norm(q).split(' ').filter(Boolean);
    let raw = rawTokens.filter(w => !STOP.has(w));
    if (!raw.length && rawTokens.length) {
      raw = rawTokens; // User typed a single character or short stop-prefix
    }
    const terms = [];
    const push = (w, weight) => {
      if (w && !terms.some(t => t.w === w)) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        terms.push({
          w,
          weight,
          reStartWord: new RegExp(`^${esc}\\b`, 'i'),
          reStartPrefix: new RegExp(`^${esc}`, 'i'),
          reWord: new RegExp(`\\b${esc}\\b`, 'i'),
          rePrefix: new RegExp(`\\b${esc}`, 'i')
        });
      }
    };
    raw.forEach(w => {
      push(w, 1);
      if (w.length > 2) {
        push(stem(w), 0.9);
        (SYNONYMS[w] || SYNONYMS[stem(w)] || []).forEach(sy => push(sy, 0.6));
        if (!VOCAB.includes(w)) {
          const fix = VOCAB.find(v => near(v, w));
          if (fix) push(fix, 0.75);
        }
      }
    });
    // two-word phrases like "wall art" that only mean something together
    const joined = norm(q);
    Object.keys(SYNONYMS).forEach(k => {
      if (k.includes(' ') && joined.includes(k)) (SYNONYMS[k] || []).forEach(sy => push(sy, 0.8));
    });
    return terms;
  }

  /** Public popularity and cultural resonance score for intelligent ranking. */
  function popularityBoost(p) {
    if (!p) return 0;
    let boost = 0;
    if (p.showInBestsellers) boost += 8;
    if (/bestseller|trending|hot|popular|collector|staff pick/i.test(p.badge || '')) boost += 5;
    
    // Rating & social proof
    const rAvg = Number(p.rating) || 4.8;
    const rCnt = Number(p.reviewCount) || 20;
    boost += Math.min(5, (rAvg / 5) * Math.log2(rCnt + 1));

    // Public cultural resonance: iconic blockbuster movies, legends, anime icons, viral aesthetics
    const n = norm(p.name);
    if (/dark knight|joker|batman|interstellar|inception|fight club|pulp fiction|spider-verse|spiderman|oppenheimer|dune 2|star wars/i.test(n)) boost += 6;
    if (/messi|verstappen|leclerc|ayrton senna|hamilton|alonso|norris/i.test(n)) boost += 6;
    if (/demon slayer|tanjiro|one piece|luffy|zoro|super saiyan|goku|naruto/i.test(n)) boost += 5;
    if (/pink aesthetic|artist masters|ae ajnabee|say yes to heaven|yellow|alleviate|bloom/i.test(n)) boost += 5;

    return boost;
  }

  function isOutOfStock(p) {
    if (!p) return false;
    if (p.stockQuantity !== undefined && p.stockQuantity !== null) {
      return Number(p.stockQuantity) <= 0;
    }
    return false;
  }

  /** How well one product answers the query. 0 means it does not.
   *  Blends prefix-awareness, lexical relevance, and public popularity intelligence. */
  function score(p, terms) {
    if (!terms || !terms.length) return 1;
    const name = p._normName || (p._normName = norm(p.name));
    const cat = p._normCat || (p._normCat = norm(categoryText(p)));
    const keys = p._normKeys || (p._normKeys = norm(keywordText(p)));
    const desc = p._normDesc || (p._normDesc = norm(p.description));
    let total = 0, hits = 0;

    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const w = t.w;
      const weight = t.weight || 1;
      let best = 0;

      // Exact match
      if (name === w) {
        best = 30;
      } else {
        const reStartWord = t.reStartWord || (t.reStartWord = new RegExp(`^${w}\\b`, 'i'));
        const reStartPrefix = t.reStartPrefix || (t.reStartPrefix = new RegExp(`^${w}`, 'i'));
        const reWord = t.reWord || (t.reWord = new RegExp(`\\b${w}\\b`, 'i'));
        const rePrefix = t.rePrefix || (t.rePrefix = new RegExp(`\\b${w}`, 'i'));

        if (reStartWord.test(name)) best = 24;
        else if (reStartPrefix.test(name)) best = 20;
        else if (reWord.test(name)) best = 18;
        else if (rePrefix.test(name)) best = 14;
        else if (reStartWord.test(cat)) best = 20;
        else if (reStartPrefix.test(cat)) best = 16;
        else if (reWord.test(cat)) best = 14;
        else if (rePrefix.test(cat)) best = 11;
        else if (reWord.test(keys)) best = 9;
        else if (rePrefix.test(keys)) best = 7;
        else if (w.length > 3) {
          if (name.includes(w)) best = 5;
          else if (cat.includes(w)) best = 4;
          else if (keys.includes(w)) best = 3;
          else if (desc.includes(w)) best = 1.5;
        }
      }

      if (best) {
        total += best * weight;
        hits++;
      }
    }

    if (!hits) return 0;

    // Reward answering multiple words of the query
    let lexicalScore = total * (1 + (hits - 1) * 0.6);

    // Add intelligent popularity boost
    const pop = popularityBoost(p);
    return lexicalScore + pop;
  }

  window.BrushSearch = { norm, stem, near, expand, score, popularityBoost, isOutOfStock, buildVocab, STOP, SYNONYMS };
})();
