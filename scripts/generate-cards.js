#!/usr/bin/env node
// Generates light/dark pinned-repo-style SVG cards and updates the README section.
// Usage: node scripts/generate-cards.js [--use-api-descriptions] [--out <dir>] [--no-readme]
//   --use-api-descriptions  preview only: use each repo's real GitHub description
//                           instead of the text in pinned.config.json
// Auth: reads GITHUB_TOKEN if set (raises rate limit); works without it.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const outDir = path.resolve(ROOT, args.includes("--out") ? args[args.indexOf("--out") + 1] : "assets");
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "pinned.config.json"), "utf8"));

// ---- layout constants (px, matching GitHub's pinned card) ----
const CW = 410, M = 4, PAD = 16, RADIUS = 6; // CW = card width, M = transparent margin that spaces cards apart
const W = CW + 2 * M; // two canvases + a space fit the ~846px README column
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const NAME_SIZE = 14, NAME_LH = 21, DESC_SIZE = 12, DESC_LH = 18, FOOT_H = 16, GAP = 8, FOOT_GAP = 14;
const TEXT_X = PAD + 24; // name starts after 16px icon + 8px gap
const SAFETY = 1.0; // system fonts vary; wrap a bit early rather than overflow

const THEMES = {
  light: { border: "#d0d7de", name: "#0969da", desc: "#656d76", meta: "#656d76", icon: "#656d76" },
  dark: { border: "#30363d", name: "#4493f8", desc: "#8b949e", meta: "#8b949e", icon: "#8b949e" },
};

// Octicons (MIT, (c) GitHub): repo, star, repo-forked (16px)
const ICON_REPO = "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z";
const ICON_STAR = "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z";
const ICON_FORK = "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z";

// Helvetica/Arial advance widths (per 1000 em) for ASCII 32..126
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const measure = (s, size, bold = false) => {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? WIDTHS[c - 32] : 1000; // non-ASCII: assume wide
  }
  return (w / 1000) * size * (bold ? 1.12 : 1) * SAFETY;
};

// Greedy word wrap; also breaks long tokens after hyphens (repo names), then by character.
function wrap(text, maxW, size, bold = false) {
  const tokens = text.match(/[^\s-]+-|\S+|\s+/g) || [];
  const lines = [];
  let line = "";
  const push = () => { if (line.trim()) lines.push(line.trimEnd()); line = ""; };
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) { if (line) line += " "; continue; }
    if (measure(line + tok, size, bold) <= maxW) { line += tok; continue; }
    push();
    let rest = tok;
    while (measure(rest, size, bold) > maxW) { // single token too long
      let i = rest.length;
      while (i > 1 && measure(rest.slice(0, i), size, bold) > maxW) i--;
      lines.push(rest.slice(0, i));
      rest = rest.slice(i);
    }
    line = rest;
  }
  push();
  return lines;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const compact = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));

async function gh(url) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "pinned-cards-generator" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return res;
}

async function languageColors() {
  try {
    const res = await fetch("https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/languages.yml");
    if (!res.ok) throw new Error(res.status);
    const colors = {};
    let cur = null;
    for (const l of (await res.text()).split("\n")) {
      const m = l.match(/^(\S.*?):\s*$/);
      if (m) cur = m[1].replace(/^"|"$/g, "");
      const c = l.match(/^\s+color:\s*"?(#[0-9a-fA-F]{6})"?/);
      if (c && cur) colors[cur] = c[1];
    }
    return colors;
  } catch (e) {
    console.warn("linguist colours unavailable, using fallback:", e.message);
    return { Java: "#b07219", TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5" };
  }
}

function layout(repo) {
  const nameLines = wrap(repo.name, CW - TEXT_X - PAD, NAME_SIZE, true);
  const descLines = repo.description ? wrap(repo.description, CW - 2 * PAD, DESC_SIZE) : [];
  const h = PAD + nameLines.length * NAME_LH + (descLines.length ? GAP + descLines.length * DESC_LH : 0) + FOOT_GAP + FOOT_H + PAD;
  return { nameLines, descLines, h };
}

function svg(repo, L, canvasH, theme) {
  const H = canvasH - 2 * M; // card height
  const t = THEMES[theme];
  const parts = [];
  parts.push(`<path fill="${t.icon}" transform="translate(${PAD} ${PAD + 2.5})" d="${ICON_REPO}"/>`);
  L.nameLines.forEach((ln, i) =>
    parts.push(`<text x="${TEXT_X}" y="${PAD + i * NAME_LH + 15}" font-size="${NAME_SIZE}" font-weight="600" fill="${t.name}">${esc(ln)}</text>`));
  const y = PAD + L.nameLines.length * NAME_LH + GAP;
  L.descLines.forEach((ln, i) =>
    parts.push(`<text x="${PAD}" y="${y + i * DESC_LH + 13}" font-size="${DESC_SIZE}" fill="${t.desc}">${esc(ln)}</text>`));

  const fy = H - PAD - FOOT_H; // footer top
  let x = PAD;
  if (repo.language) {
    parts.push(`<circle cx="${x + 6}" cy="${fy + 8}" r="6" fill="${repo.color}"/>`);
    parts.push(`<text x="${x + 16}" y="${fy + 12}" font-size="12" fill="${t.meta}">${esc(repo.language)}</text>`);
    x += 16 + measure(repo.language, 12) + 16;
  }
  for (const [n, icon] of [[repo.stars, ICON_STAR], [repo.forks, ICON_FORK]]) {
    if (!n) continue;
    const label = compact(n);
    parts.push(`<path fill="${t.icon}" transform="translate(${x} ${fy})" d="${icon}"/>`);
    parts.push(`<text x="${x + 20}" y="${fy + 12}" font-size="12" fill="${t.meta}">${label}</text>`);
    x += 20 + measure(label, 12) + 16;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${canvasH}" viewBox="0 0 ${W} ${canvasH}" role="img" aria-label="${esc(repo.name)}">
<title>${esc(repo.name)}</title>
<g font-family="${FONT}" transform="translate(${M} ${M})">
<rect x="0.5" y="0.5" width="${CW - 1}" height="${H - 1}" rx="${RADIUS}" fill="none" stroke="${t.border}"/>
${parts.join("\n")}
</g>
</svg>
`;
}

// Inline <a> elements (not a table) so the cards sit 2-per-row on desktop and
// wrap to one column on narrow screens instead of shrinking to unreadable size.
function readmeBlock(repos) {
  const cards = repos.map((r) => `<a href="https://github.com/${config.owner}/${r.name}"><picture>
<source media="(prefers-color-scheme: dark)" srcset="assets/${r.name}-dark.svg">
<source media="(prefers-color-scheme: light)" srcset="assets/${r.name}-light.svg">
<img src="assets/${r.name}-light.svg" alt="${r.name}" width="${W}">
</picture></a>`);
  return `<!-- PINNED:START -->\n<p>\n${cards.join("\n")}\n</p>\n<!-- PINNED:END -->`;
}

(async () => {
  const colors = await languageColors();
  const repos = [];
  for (const r of config.repos) {
    const d = await (await gh(`https://api.github.com/repos/${config.owner}/${r.name}`)).json();
    const description = flag("--use-api-descriptions") ? d.description || "" : r.description;
    if (/\[PASTE DESCRIPTION/.test(description))
      throw new Error(`Description for ${r.name} is still a placeholder in scripts/pinned.config.json`);
    repos.push({
      name: r.name, description, language: d.language, color: colors[d.language] || "#8b949e",
      stars: d.stargazers_count, forks: d.forks_count,
    });
  }
  const layouts = repos.map(layout);
  const H = Math.ceil(Math.max(...layouts.map((l) => l.h))) + 2 * M; // equal heights so the grid lines up
  fs.mkdirSync(outDir, { recursive: true });
  repos.forEach((r, i) => {
    for (const theme of ["light", "dark"]) {
      const file = path.join(outDir, `${r.name}-${theme}.svg`);
      const next = svg(r, layouts[i], H, theme);
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== next) fs.writeFileSync(file, next);
    }
  });

  if (!flag("--no-readme")) {
    const file = path.join(ROOT, "README.md");
    const md = fs.readFileSync(file, "utf8");
    const re = /<!-- PINNED:START -->[\s\S]*?<!-- PINNED:END -->/;
    if (!re.test(md)) throw new Error("README.md needs <!-- PINNED:START --> and <!-- PINNED:END --> markers");
    const next = md.replace(re, () => readmeBlock(repos));
    if (next !== md) fs.writeFileSync(file, next);
  }
  console.log(`Generated ${repos.length * 2} SVGs (${W}x${H}) in ${outDir}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
