---
name: review-changes
description: Reviews changed code in blaze-backend against the develop or main branch, evaluating TypeScript/Node best practices, bugs, performance, readability, and security. Use when user asks to review changes, review a PR, check code quality, or run a code review before merging.
---

# Review Changes

## Quick start

Determine the comparison branch, then run `git diff` and review the output.

## Workflow

- [ ] 1. **Determine base branch**
  - If current branch is `develop` → diff against `origin/main`
  - Otherwise → diff against `develop`
- [ ] 2. **Get the diff** — `git diff <base-branch>...HEAD`
- [ ] 3. **Evaluate** across these dimensions:
  - Code quality & TypeScript/Node best practices
  - Potential bugs or unhandled edge cases
  - Performance optimizations
  - Readability and maintainability
  - Security vulnerabilities
- [ ] 4. **Write the review** following the output format below

## Output format

- **Summary** — 2–3 sentence overall quality assessment at the top
- **Findings** — grouped by file; each finding includes:
  - Severity: `🔴 Bug` / `🟡 Warning` / `🟢 Suggestion`
  - Line reference (line numbers from the diff)
  - Description and recommended fix
- **Verdict** — if no issues found, state that the code meets best practices

## Notes

- Present the review as an artifact (markdown document)
- Line numbers start at 1 based on the code as presented in the diff
- Focus on actionable findings — skip style nits unless they affect readability significantly
