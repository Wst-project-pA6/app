# Session Log Template

Each implementation session records its work here for continuity.

---

## Session Template

```markdown
# Session N — <Feature Name>

**Date:** YYYY-MM-DD  
**Branch:** `backend/<feature-name>`  
**AI Tool:** <e.g., OpenCode, Claude>  
**Model:** <e.g., Nemotron 3 Ultra, Claude 4 Sonnet>

## Goal
<One-sentence objective>

## Files Created
- `src/modules/<feature>/<file>.ts`

## Files Modified
- `src/common/...` (only if shared component extended)

## Key Decisions
- <Decision affecting future sessions>

## Open Questions
- <Question needing resolution before next session>

## Test Commands
````bash
npm run build
npm test -- <feature>
````

## Blocker / Contract Mismatch
- <Any frozen OpenAPI or schema.sql conflict found>
```

---

## Suggested Filename Format

```
docs/sessions/session-<NN>-<feature-name>.md
```

Example: `docs/sessions/session-03-foundation.md`