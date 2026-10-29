export function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[’‘]/g, "'");
}

export function foldAnswer(value) {
  return normalizeAnswer(value)
    .replace(/[-‐‑‒–—]/g, " ")
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameEn(a, b) {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

export function acceptedForms(en) {
  const clean = String(en || "").trim().replace(/\s+/g, " ");
  const forms = [clean];
  const match = clean.match(/^(.+?)\s*\([^)]+\)\s*$/);
  if (match && match[1].trim()) forms.push(match[1].trim());
  return forms;
}

export function gradeTyped(input, en) {
  const given = foldAnswer(input);
  if (!given) return "empty";
  let best = Infinity;
  for (const form of acceptedForms(en)) {
    const target = foldAnswer(form);
    if (!target) continue;
    if (given === target) return "correct";
    best = Math.min(best, editDistance(given, target));
  }
  if (best === 1) return "almost";
  return "wrong";
}

export function maskWord(en) {
  const chars = [...String(en || "")];
  let hidden = 0;
  let mask = "";
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (!/[A-Za-zÀ-ÿ]/.test(ch)) {
      mask += ch;
      continue;
    }
    let index = 0;
    for (let j = i - 1; j >= 0 && /[A-Za-zÀ-ÿ]/.test(chars[j]); j -= 1) index += 1;
    if (index === 0 || index % 2 === 0) mask += ch;
    else {
      mask += "_";
      hidden += 1;
    }
  }
  return { mask, hidden };
}

export function clozeSuitable(en) {
  const letters = (String(en || "").match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const words = String(en || "").trim().split(/\s+/).filter(Boolean).length;
  if (letters < 5) return false;
  if (words > 1 && letters < 8) return false;
  return maskWord(en).hidden >= 2;
}
