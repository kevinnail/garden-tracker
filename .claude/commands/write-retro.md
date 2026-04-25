# retro

Write my development retrospective and append it to my Google Doc. Covers today or multiple days if retros were missed — always one single block regardless of time span.

## Rules

- Only summarize work proven by git history or repository changes.
- Do not invent work.
- Output MUST match the template exactly — including bold formatting.
- All dates in America/Los_Angeles timezone.
- **NO emoji, icons, decorative characters, or special Unicode symbols of any kind.** Plain ASCII text only in all fields. Straight quotes are fine. Use a plain hyphen-minus surrounded by spaces ( - ) instead of an em dash - never use the em dash character anywhere, including in branch descriptions and inline text. It renders as garbage in Google Docs.

## Retro Template

Single day:
mm/dd/yy

Multi-day catch-up:
mm/dd/yy - mm/dd/yy

**BRANCH** - brief description (e.g. "dev branch", "feature/foo merged into main", "dev branch - active development")

**Notes:**
Summarize the overall period - what was the theme or focus? Flag anything notable (large refactors, schema changes, security work, PRs merged to main, etc.). If it's a long catch-up period, acknowledge that.

**Client**
- Summarize front end contributions grouped by feature/area
- One line per meaningful change or theme

**Server**
- Summarize back end contributions grouped by feature/area
- One line per meaningful change or theme

## Step 1 - Collect work evidence

First, read the last retro timestamp:

```bash
cat .claude/last-retro
```

This contains an ISO datetime (e.g. `2026-03-25T00:15:00`) marking the exact moment the last retro was written. Use it directly as the `--after` cutoff - do NOT add a day. This captures any commits made after that precise moment, including work done later the same day.

Then run:

```bash
git log --after="LAST_RETRO_TIMESTAMP" --pretty=format:"%ad %h %p %s" --date=short
git log --after="LAST_RETRO_TIMESTAMP" --pretty=format:"%ad" --date=short | sort | uniq
git branch -a
```

The first command includes all commits - regular commits and merge commits alike. Entries with two parent hashes are merge commits. When you see a merge commit, inspect it:

```bash
git show <merge-hash> --stat
git log <parent1>..<parent2> --oneline | wc -l
```

This tells you what PR landed and how many commits it brought in. Merge commits to main are significant events and must be described accurately in the retro.

Use the commit dates to determine:
- The earliest and latest commit dates in this batch
- Whether this is a single-day or multi-day entry

If there are no commits since the last retro timestamp, tell the user and stop - do not write an empty retro.

## Step 2 - Produce Retro

- Use a date range (mm/dd/yy - mm/dd/yy) if commits span more than one day, otherwise single date.
- Group work by feature or system area - not by day, not by file.
- Summarize intent and outcome.
- Include important technical events: schema changes, refactors, debugging, infra/config updates, test additions, PRs merged.
- Notes section should read naturally - not a list, but a brief narrative summary of the period.

## Step 3 - Append to Google Docs

Use the Bash tool to POST the retro to the Apps Script web app:

```bash
curl -s -X POST "$RETRO_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"token":"'"$RETRO_WEBHOOK_TOKEN"'","date":"MM/DD/YY or MM/DD/YY - MM/DD/YY","branch":"BRANCH description","notes":"narrative summary","client":["item1","item2"],"server":["item1","item2"]}'
```

Requirements:

- `date`: single date (MM/DD/YY) or range (MM/DD/YY - MM/DD/YY) depending on commits. Use a plain hyphen-minus for the range separator in the JSON.
- `branch`: what actually happened - e.g. "dev branch", "dev merged into main via PR #6", "dev branch - active development". Only use action words (created/merged/deleted) if that event actually occurred.
- `notes`: narrative summary of the period, not a list. Mention if it's a catch-up entry.
- `client`: array of front end contribution strings (omit bullet dashes, the script adds them)
- `server`: array of back end contribution strings (omit bullet dashes, the script adds them)
- A 302 response is success - the script executed correctly.
- Do NOT use the Google Docs MCP tools for this step.

After a successful POST, update the last retro timestamp:

```bash
date +"%Y-%m-%dT%H:%M:%S" > .claude/last-retro
```

This saves the current local time as an ISO datetime so the next retro captures everything after this exact moment.
