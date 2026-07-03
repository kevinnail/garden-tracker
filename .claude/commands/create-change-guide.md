---
description: Generate CHANGE-GUIDE.html — a coverage-report-style, one-file-at-a-time review guide for the current source-control changes.
argument-hint: "[optional git ref/range, e.g. main...HEAD — defaults to uncommitted changes]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git ls-files:*), Read, Write
---

Build a self-contained HTML review guide for the current changes and write it to `CHANGE-GUIDE.html` at the repository root (the git root, alongside CLAUDE.md). It replaces any existing `CHANGE-GUIDE.html`.

The goal: the user reviews their own diff before committing, file by file, glancing between this guide and the code. They want a plain-English pointer to what each file does and *where the substance is* — a fast summary to skim, with deeper per-change detail one click away when a file is big or unfamiliar. One file visible at a time.

## Step 1 — gather the change set

- If `$ARGUMENTS` is given, treat it as a git ref/range and diff against it (`git diff $ARGUMENTS --stat`, etc.).
- Otherwise use the uncommitted working set: `git status --short` (modified + untracked). Read the actual diffs (`git diff`, and read new/untracked files directly) enough to describe each change accurately. Do not guess — if a file's purpose isn't obvious from its diff, read it.
- **Read enough to fill the `details` field (Step 2).** For test files, read the `describe`/`it` names. For files that add several functions, read each new function well enough to say what it does and why it's needed. This is the one place a shallow skim of the diff isn't enough.

## Step 2 — write one entry per changed file

For each file, in plain English (assume the reader is newer to the language — keep it concrete, wrap identifiers in `<code>…</code>`):

- **what** — one sentence: what changed / what was added.
- **why** — one sentence: why it exists / who needs it.
- **substance** — where to actually look: the function or block that matters, and what's just boilerplate/wiring to skim. This is the most valuable summary field.
- **details** — an **array of short strings** rendered in a collapsed "Deeper detail" section *below* the mark-reviewed button, so it's trivially skipped but always available. This is what lets the reader resolve a file they didn't grasp from the summary alone. Populate it whenever a file has real substance to unpack:
  - **Test files:** one bullet per test — a plain-English restatement of what each `it(...)` proves (e.g. `"reconcile tombstones a removed image but keeps its s3_key"`). The bullets double as a spec.
  - **Files that add/change several functions:** one bullet per function — what it does **and, more importantly, why it's needed**. Every meaningfully new function gets a line.
  - **Trivial/mechanical files** (a one-line change, a single added field): omit `details` entirely, or give it a single clarifying bullet. Don't manufacture filler.
  - Keep each bullet to a sentence or two. `<code>`/`<b>`/`<i>` are allowed.

Assign each file:
- **status** — `"new"` for added/untracked files, `"mod"` for modified.
- **section** — a short grouping label prefixed with an order number, e.g. `"1 · Schema & migration"`, `"2 · Data layer"`, `"3 · Core logic"`, `"4 · UI"`, `"5 · Tests"`. (Sections containing the word `Tests` get the deeper-detail header "every test spelled out"; all others get "every change spelled out" — so keep test sections named with `Tests`.)

**Order the files as a reading path**, not alphabetically: foundation first (schema/types/config), then data layer, then core logic, then UI, then tests last. Each file should make sense given the ones before it.

## Step 3 — write META

- **title** — the feature/slice name.
- **sub** — e.g. `"branch <name> · <N> changes"`.
- **mentalModel** — the single unifying idea that makes the whole change set legible (HTML allowed, use `<code>`). This is what the reader sees first.
- **fastPath** — 3–5 strings naming the files that hold the real logic (so a time-pressed reviewer knows what to prioritize vs. wiring/tests).

## Step 4 — emit the file

Write `CHANGE-GUIDE.html` using the template below **verbatim**, replacing only the `META` and `FILES` constants in the DATA section. Everything from the `VIEWER (fixed)` comment onward, and all the CSS, must be reproduced exactly — it's the tested viewer. It is **dark-themed and deliberately dense** (low padding, all files visible without excess scrolling); do not lighten or loosen it. It ships:

- sidebar of files grouped by section, one-file detail pane, progress bar
- `j`/`k` + arrow nav, `r`/space to mark reviewed, progress persisted in localStorage
- the collapsible **Deeper detail** section fed by each file's `details` array
- a **completion sequence** that fires once when the last file is marked reviewed: a matrix-rain backdrop with a terminal that streams the reviewed files like a passing CI run, then decrypts a `REVIEW COMPLETE` headline. It self-dismisses (or on click) and does not replay on reload. This is intentional and load-bearing — reproduce it exactly.

After writing, tell the user the path, that progress is saved per-file in their browser, the keyboard shortcuts (`j`/`k` move, `r`/space mark reviewed), that there's a skippable "Deeper detail" panel under each file, and that it's disposable — delete when done.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Change Guide</title>
<style>
  :root {
    --bg: #0d1017; --panel: #131822; --ink: #dfe6ee; --muted: #7d8899;
    --line: #232b38; --accent: #4cc38a;
    --new-bg: #123024; --new-ink: #58d199;
    --mod-bg: #332a12; --mod-ink: #e3b341;
    --done: #4cc38a;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font: 13.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); background: var(--bg);
  }
  #app { display: grid; grid-template-columns: 300px 1fr; height: 100vh; }
  /* Sidebar */
  #sidebar { border-right: 1px solid var(--line); background: var(--panel); overflow-y: auto; }
  .side-head { padding: 12px 14px 10px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--panel); z-index: 1; }
  .side-head h1 { font-size: 14px; margin: 0 0 2px; }
  .side-head .sub { color: var(--muted); font-size: 11.5px; }
  .progress-wrap { margin-top: 10px; }
  .progress-bar { height: 6px; background: #1c2430; border-radius: 99px; overflow: hidden; }
  .progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #2fae74, var(--accent)); transition: width .25s ease; }
  .progress-label { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); margin-top: 5px; }
  .progress-label a { color: var(--accent); text-decoration: none; cursor: pointer; }
  nav { padding: 6px 0 20px; }
  .group-title { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); padding: 12px 14px 4px; }
  .item {
    display: flex; align-items: center; gap: 8px; padding: 5px 14px; cursor: pointer;
    border-left: 3px solid transparent; user-select: none;
  }
  .item:hover { background: #1a2230; }
  .item.active { background: #172436; border-left-color: var(--accent); }
  .item.reviewed { border-left-color: var(--done); }
  .item.reviewed .name { color: var(--muted); text-decoration: line-through; }
  .item .num { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; min-width: 16px; }
  .item .name { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 99px; letter-spacing: .03em; }
  .badge.new { background: var(--new-bg); color: var(--new-ink); }
  .badge.mod { background: var(--mod-bg); color: var(--mod-ink); }
  .check { width: 14px; height: 14px; accent-color: var(--accent); }
  /* Detail */
  #detail { overflow-y: auto; padding: 22px 30px 56px; }
  .card { max-width: 780px; }
  .kicker { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; }
  .card h2 { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 18px; margin: 3px 0 8px; word-break: break-all; }
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .field { margin: 12px 0; }
  .field .label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 3px; }
  .field .body { font-size: 14px; }
  .substance { background: #1d1a0f; border: 1px solid #4a3c17; border-radius: 8px; padding: 12px 14px; }
  .substance .label { color: var(--mod-ink); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #1c2430; color: #b7e7cf; padding: 1px 5px; border-radius: 4px; font-size: 90%; }
  .nav-buttons { display: flex; gap: 8px; margin-top: 22px; }
  button {
    font: inherit; padding: 7px 14px; border: 1px solid var(--line); background: #1a2230;
    border-radius: 8px; cursor: pointer; color: var(--ink);
  }
  button:hover { background: #212b3a; }
  button.primary { background: var(--done); color: #08130d; border-color: var(--done); font-weight: 600; }
  button.primary:hover { filter: brightness(1.08); }
  button:disabled { opacity: .35; cursor: default; }
  /* Deeper detail — skippable, below the buttons */
  .deeper { margin-top: 20px; border-top: 1px solid var(--line); padding-top: 12px; }
  .deeper summary { cursor: pointer; color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; user-select: none; list-style: none; }
  .deeper summary::-webkit-details-marker { display: none; }
  .deeper summary::before { content: '▸'; color: var(--accent); display: inline-block; width: 14px; }
  .deeper[open] summary::before { content: '▾'; }
  .deeper ul { margin: 10px 0 0; padding-left: 18px; }
  .deeper li { margin: 5px 0; color: #c4ccd6; font-size: 13px; line-height: 1.45; }
  .hint { color: var(--muted); font-size: 11.5px; margin-top: 16px; }
  .hint kbd { font-family: ui-monospace, monospace; background: #1c2430; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; font-size: 11px; }
  /* Overview card */
  .overview .mental { background: #10241c; border: 1px solid #1f4636; border-radius: 8px; padding: 14px 16px; margin: 12px 0 22px; font-size: 14px; }
  .overview ul { padding-left: 18px; }
  .overview li { margin: 4px 0; }
  /* Completion celebration — terminal "review compiled" over matrix rain */
  #celebrate { position: fixed; inset: 0; z-index: 50; background: #05070a; transition: opacity .5s ease; }
  #celebrate.fading { opacity: 0; }
  #celebrate-rain { position: absolute; inset: 0; }
  #celebrate-term {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(560px, 86vw); padding: 22px 26px;
    background: rgba(6, 10, 14, 0.82); border: 1px solid #1f4636; border-radius: 10px;
    box-shadow: 0 0 40px rgba(76, 195, 138, .18);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  #term-log { font-size: 13px; line-height: 1.7; color: #7fe3b0; white-space: pre; min-height: 20px; }
  #term-log .cmd { color: #dfe6ee; }
  #term-log .dim { color: #4a6a58; }
  #term-headline {
    margin-top: 14px; font-size: 26px; font-weight: 700; letter-spacing: .12em;
    color: #7ee2b0; text-shadow: 0 0 14px rgba(76, 195, 138, .55); min-height: 32px; white-space: pre;
  }
  #celebrate.reveal #term-headline::after {
    content: "▋"; margin-left: 4px; animation: term-blink 1s steps(1) infinite;
  }
  @keyframes term-blink { 50% { opacity: 0; } }
</style>
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <div class="side-head">
      <h1 id="meta-title">Change Guide</h1>
      <div class="sub" id="meta-sub"></div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="pfill"></div></div>
        <div class="progress-label"><span id="plabel">0 / 0 reviewed</span><a id="reset">reset</a></div>
      </div>
    </div>
    <nav id="nav"></nav>
  </aside>
  <main id="detail"></main>
</div>

<script>
// ─────────────────────────────────────────────────────────────────────────────
// DATA — replace META and FILES per run; everything below is the fixed viewer.
// ─────────────────────────────────────────────────────────────────────────────
const META = {
  title: "REPLACE — feature/slice name",
  sub: "branch <name> · <N> changes",
  mentalModel: "REPLACE — the single unifying idea (HTML/<code> allowed).",
  fastPath: [ "REPLACE — 3–5 files that hold the real logic" ],
};

const FILES = [
  // One object per changed file, in reading order:
  // { section: "1 · Group", path: "src/…", status: "new"|"mod",
  //   what: "…", why: "…", substance: "…",
  //   details: [ "one bullet per test, or per new function (what + why)" ] }
  // Omit `details` for trivial/mechanical files.
];

// ─────────────────────────────────────────────────────────────────────────────
// VIEWER (fixed)
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE = "changeguide:" + META.title;
const reviewed = new Set(JSON.parse(localStorage.getItem(STORAGE) || "[]"));
const items = [{ type: "overview" }, ...FILES.map((file, index) => ({ type: "file", i: index, ...file }))];
let current = 0;
// Seed as already-complete so a reload at 100% doesn't replay the celebration.
let wasComplete = FILES.length > 0 && FILES.every((file) => reviewed.has(file.path));

const base = (path) => path.split("/").pop();
const save = () => localStorage.setItem(STORAGE, JSON.stringify([...reviewed]));

function buildSidebar() {
  document.getElementById("meta-title").textContent = META.title;
  document.getElementById("meta-sub").textContent = META.sub;
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  const overview = document.createElement("div");
  overview.className = "item";
  overview.dataset.idx = 0;
  overview.innerHTML = '<span class="num">▸</span><span class="name">Start here — overview</span>';
  overview.onclick = () => select(0);
  nav.appendChild(overview);

  let lastSection = null;
  items.forEach((item) => {
    if (item.type !== "file") return;
    if (item.section !== lastSection) {
      lastSection = item.section;
      const group = document.createElement("div");
      group.className = "group-title";
      group.textContent = item.section;
      nav.appendChild(group);
    }
    const idx = items.indexOf(item);
    const element = document.createElement("div");
    element.className = "item";
    element.dataset.idx = idx;
    element.innerHTML =
      '<input type="checkbox" class="check" ' + (reviewed.has(item.path) ? "checked" : "") + ' />' +
      '<span class="name" title="' + item.path + '">' + base(item.path) + "</span>" +
      '<span class="badge ' + item.status + '">' + (item.status === "new" ? "NEW" : "MOD") + "</span>";
    element.querySelector(".check").onclick = (event) => { event.stopPropagation(); toggleReviewed(item.path); };
    element.onclick = () => select(idx);
    nav.appendChild(element);
  });
  refresh();
}

function toggleReviewed(path) {
  if (reviewed.has(path)) reviewed.delete(path); else reviewed.add(path);
  save(); refresh();
}

function select(idx) {
  current = Math.max(0, Math.min(items.length - 1, idx));
  renderDetail();
  refresh();
  const active = document.querySelector('.item[data-idx="' + current + '"]');
  if (active) active.scrollIntoView({ block: "nearest" });
}

function refresh() {
  document.querySelectorAll(".item").forEach((element) => {
    const idx = +element.dataset.idx;
    element.classList.toggle("active", idx === current);
    const item = items[idx];
    if (item.type === "file") {
      element.classList.toggle("reviewed", reviewed.has(item.path));
      const box = element.querySelector(".check");
      if (box) box.checked = reviewed.has(item.path);
    }
  });
  const total = FILES.length;
  const done = FILES.filter((file) => reviewed.has(file.path)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("pfill").style.width = pct + "%";
  document.getElementById("plabel").textContent = done + " / " + total + " reviewed (" + pct + "%)";

  if (total > 0 && done === total && !wasComplete) { wasComplete = true; runCelebration(); }
  if (done < total) wasComplete = false;
}

function renderDetail() {
  const item = items[current];
  const detail = document.getElementById("detail");
  if (item.type === "overview") {
    detail.innerHTML =
      '<div class="card overview">' +
      '<div class="kicker">Read me first</div>' +
      "<h2>The one idea</h2>" +
      '<div class="mental">' + META.mentalModel + "</div>" +
      '<div class="field"><div class="label">Fastest path if short on time</div>' +
      "<ul>" + META.fastPath.map((entry) => "<li>" + entry + "</li>").join("") + "</ul></div>" +
      '<div class="hint">Move: <kbd>j</kbd>/<kbd>k</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd> &nbsp;·&nbsp; ' +
      "Mark reviewed: <kbd>r</kbd> or <kbd>space</kbd> &nbsp;·&nbsp; progress is saved in this browser.</div>" +
      '<div class="nav-buttons"><button class="primary" onclick="select(1)">Start reviewing →</button></div>' +
      "</div>";
    return;
  }
  const isDone = reviewed.has(item.path);
  const fileNo = item.i + 1;
  const deeper = item.details && item.details.length
    ? '<details class="deeper"><summary>Deeper detail — every ' +
        (/Tests/.test(item.section) ? "test" : "change") + " spelled out</summary>" +
        "<ul>" + item.details.map((line) => "<li>" + line + "</li>").join("") + "</ul></details>"
    : "";
  detail.innerHTML =
    '<div class="card">' +
    '<div class="kicker">File ' + fileNo + " of " + FILES.length + " · " + item.section + "</div>" +
    "<h2>" + item.path + "</h2>" +
    '<div class="row"><span class="badge ' + item.status + '">' + (item.status === "new" ? "NEW FILE" : "MODIFIED") + "</span></div>" +
    '<div class="field"><div class="label">What changed</div><div class="body">' + item.what + "</div></div>" +
    '<div class="field"><div class="label">Why</div><div class="body">' + item.why + "</div></div>" +
    '<div class="field substance"><div class="label">Where the substance is</div><div class="body">' + item.substance + "</div></div>" +
    '<div class="nav-buttons">' +
    '<button onclick="select(' + (current - 1) + ')"' + (current <= 1 ? " disabled" : "") + ">← Prev</button>" +
    '<button class="primary" onclick="markAndNext()">' + (isDone ? "Reviewed ✓ — Next →" : "Mark reviewed → Next") + "</button>" +
    '<button onclick="select(' + (current + 1) + ')"' + (current >= items.length - 1 ? " disabled" : "") + ">Skip →</button>" +
    "</div>" +
    deeper +
    '<div class="hint"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>r</kbd>/<kbd>space</kbd> toggle reviewed</div>' +
    "</div>";
}

function markAndNext() {
  const item = items[current];
  if (item.type === "file") reviewed.add(item.path);
  save();
  if (current < items.length - 1) select(current + 1); else refresh();
}

document.getElementById("reset").onclick = () => { reviewed.clear(); save(); refresh(); renderDetail(); };

document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || event.target.tagName === "SUMMARY") return;
  if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); select(current + 1); }
  else if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); select(current - 1); }
  else if (event.key === "r" || event.key === " ") {
    event.preventDefault();
    const item = items[current];
    if (item.type === "file") toggleReviewed(item.path);
  }
});

// ── Completion celebration: a CI run "compiling" the review over matrix rain. ──
let celebrationRunning = false;
function runCelebration() {
  if (celebrationRunning) return;
  celebrationRunning = true;

  const overlay = document.createElement("div");
  overlay.id = "celebrate";
  overlay.innerHTML =
    '<canvas id="celebrate-rain"></canvas>' +
    '<div id="celebrate-term"><div id="term-log"></div><div id="term-headline"></div></div>';
  document.body.appendChild(overlay);

  // ── Matrix rain backdrop ──
  const canvas = document.getElementById("celebrate-rain");
  const context = canvas.getContext("2d");
  const pixelRatio = window.devicePixelRatio || 1;
  const fontSize = 14;
  let width = 0;
  let height = 0;
  let drops = [];
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const columns = Math.ceil(width / fontSize);
    drops = new Array(columns).fill(0).map(() => Math.random() * -60);
  }
  resize();
  window.addEventListener("resize", resize);

  const glyphs = "アカサタナハマヤ0123456789<>/{}[]=+*#";
  function drawRain() {
    context.fillStyle = "rgba(5, 7, 10, 0.12)";
    context.fillRect(0, 0, width, height);
    context.font = fontSize + "px ui-monospace, monospace";
    for (let index = 0; index < drops.length; index++) {
      const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
      const posY = drops[index] * fontSize;
      context.fillStyle = posY > 0 && Math.random() > 0.94
        ? "rgba(180, 255, 214, 0.9)"       // occasional bright leading glyph
        : "rgba(76, 195, 138, 0.42)";
      context.fillText(glyph, index * fontSize, posY);
      if (posY > height && Math.random() > 0.975) drops[index] = 0;
      drops[index]++;
    }
  }

  // ── Terminal log: stream the reviewed files like a passing CI run ──
  const logElement = document.getElementById("term-log");
  const headlineElement = document.getElementById("term-headline");
  const logLines = [
    '<span class="cmd">$ review --all</span>',
    ...FILES.map((file) => "  ✓ " + base(file.path)),
    "",
    '<span class="dim">  ' + FILES.length + " files reviewed · 0 pending</span>",
  ];
  let printed = 0;
  const printTimer = setInterval(() => {
    printed++;
    logElement.innerHTML = logLines.slice(0, printed).join("\n");
    if (printed >= logLines.length) {
      clearInterval(printTimer);
      setTimeout(startReveal, 380);
    }
  }, 42);

  function startReveal() {
    if (!celebrationRunning) return;
    overlay.classList.add("reveal");
    scrambleReveal(headlineElement, "CONGRATS DUDE, REVIEW COMPLETE", () => setTimeout(startFade, 10000));
  }

  // Character-by-character "decrypt" of the headline.
  function scrambleReveal(element, target, done) {
    const cipher = "!<>-_\\/[]{}=+*^?#01ABCDEF";
    let frame = 0;
    function tick() {
      if (!celebrationRunning) return;
      let output = "";
      let settled = 0;
      for (let index = 0; index < target.length; index++) {
        const revealAt = index * 2;
        if (frame >= revealAt + 10) { output += target[index]; settled++; }
        else if (frame >= revealAt) output += cipher[Math.floor(Math.random() * cipher.length)];
        else output += " ";
      }
      element.textContent = output;
      frame++;
      if (settled === target.length) { if (done) done(); return; }
      requestAnimationFrame(tick);
    }
    tick();
  }

  let fading = false;
  function startFade() {
    if (fading || !celebrationRunning) return;
    fading = true;
    overlay.classList.add("fading");
    setTimeout(cleanup, 600);
  }

  function cleanup() {
    if (!celebrationRunning) return;
    celebrationRunning = false;
    clearInterval(printTimer);
    window.removeEventListener("resize", resize);
    overlay.remove();
  }

  let rainTick = 0;
  function loop() {
    if (!celebrationRunning) return;
    if (rainTick++ % 3 === 0) drawRain();   // step every 3rd frame — deliberate, not frantic
    requestAnimationFrame(loop);
  }
  loop();

  overlay.addEventListener("click", cleanup);
}

buildSidebar();
select(0);
</script>
</body>
</html>
```
