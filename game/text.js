/*
  Sammenligning av fritekst (Tenk likt, Hvem er hvilket dyr?, Bildezoom).
  Ignorerer store/små bokstaver, mellomrom, tegnsetting og små skrivefeil.
*/

const config = require("./config");

const ARTICLES = /^(en|ei|et|a|an|the) /;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^a-z0-9æøåäöüéèáà ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ARTICLES, "")
    .replace(/ /g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Er to (allerede normaliserte) svar «det samme»?
function sameNormalized(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len > config.FUZZY_MIN_LENGTH) return levenshtein(a, b) <= config.FUZZY_MAX_DISTANCE;
  return false;
}

function same(a, b) {
  return sameNormalized(normalize(a), normalize(b));
}

// Grupperer svar som er «like». items: [{ id, text }] -> [{ key, label, ids }]
function group(items) {
  const groups = [];
  items.forEach(item => {
    const key = normalize(item.text);
    if (!key) return;
    let g = groups.find(x => sameNormalized(x.key, key));
    if (!g) {
      g = { key, label: String(item.text).trim(), ids: [] };
      groups.push(g);
    }
    g.ids.push(item.id);
  });
  return groups;
}

module.exports = { normalize, levenshtein, same, sameNormalized, group };
