---
allowed-tools: Read(*)
description: Perform a code-review
---

MODE: $ARGUMENTS

If Mode is one of the following, adjust the review as described:

- MODE == BUGS: Focus ONLY on logical or other bugs.
- MODE == SECURITY: Focus ONLY on security issues.
- MODE = PERFORMANCE: Focus ONLY performance issues.

MODE can also be set to a combination like "BUGS,SECURITY" etc => Perform the combined review in that case.

If MODE is set to anything else or nothing at all, perform a thorough, general code review.

## Before reviewing

If MODE includes SECURITY, read `.claude/reports/security/false-positives.md` first and do not raise any finding that matches an entry in that file.

## Review

Perform an in-depth code review of the entire codebase.

Carefully and thoroughly explore the codebase file-by-file to find potential issues and improvements.

Don't rush it, instead make sure you fully understand the code structure and architecture.

## Report

Save the report to `.claude/reports/security/` if MODE includes SECURITY, otherwise save to `.claude/reports/`.

Name the file using the pattern: `<type>-report-<YYYY-MM-DD>.md` (e.g. `security-review-2026-03-23.md`, `bugs-report-2026-03-23.md`).

Create a detailed report of all your findings.
