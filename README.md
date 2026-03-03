# spec-gate

**Stop AI agents from interpreting your specs differently every time.**

spec-gate is a validation system for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that ensures AI specs produce consistent, predictable output. It scores specs before implementation, validates diffs after, and learns from every cycle to get better over time.

```
npx spec-gate init
```

Zero runtime dependencies. Zero config required. Works with any Claude Code workflow.

---

## The problem

You write a spec. You give it to an AI agent. It builds something. You give the **same spec** to another agent — or even the same agent in a new session — and it builds something **different**.

The root cause: most specs are under-specified. They leave room for interpretation, and every agent interprets differently. "Add auth" could mean JWT or sessions or OAuth. "Update the frontend" could touch 2 files or 20.

## How spec-gate fixes it

spec-gate adds two validation gates around your implementation:

```
  /check-spec                implement              /check-diff
  ┌──────────────┐          ┌─────────┐           ┌──────────┐
  │ Detect type  │          │         │           │ Score     │
  │ (frontend,   │          │         │           │ diff for  │
  │  backend...) │ contract │  Code   │──────────►│ compliance│
  │      │       │────┬────►│         │           │ (type-    │
  │ Score spec   │    │     │         │           │  aware)   │
  │ (domain-     │    │     └─────────┘           └──────────┘
  │  specific)   │    │                                 │
  └──────────────┘    │                                 │
       ▲              ▼                                 │
       │    /check-determinism                          │
       │    ┌──────────────┐                            │
       │    │ Run spec 2x  │                            │
       │    │ before build │                            │
       │    │ to prove it  │                            │
       │    └──────────────┘                            │
       │              │                                 │
       │        learnings.json                          │
       └────────────────────────────────────────────────┘
                    self-improving loop
```

**Gate 1 (`/check-spec`)** — Detects the spec type (frontend, backend, infra, data, ux, fullstack) and scores 5 determinism signals using domain-specific checklists. If the score is low, asks targeted refinement questions tuned to the spec type. Outputs a contract.

**Gate 2 (`/check-diff`)** — Compares the actual diff against the contract using type-aware decision verification. Catches scope creep, missing files, boundary violations, and decision divergence. Writes learnings that make Gate 1 smarter next time.

## Quick start

### Install

```bash
# Scaffold into your project (creates Claude Code skills, agent, and config)
npx spec-gate init

# Or install globally
npm i -g spec-gate
spec-gate init
```

This creates:
```
.claude/skills/check-spec/SKILL.md         # /check-spec command
.claude/skills/check-diff/SKILL.md         # /check-diff command
.claude/skills/check-determinism/SKILL.md  # /check-determinism command
.claude/agents/spec-gate-validator.md     # Stop hook agent
.claude/settings.json                      # Hook registration
.spec-gate.json                           # Config
```

### Use

In Claude Code:

```bash
# Before implementing — score and refine your spec
/check-spec add JWT auth to the login endpoint

# Optional — prove the spec is deterministic before you build
/check-determinism

# After implementing — validate the diff
/check-diff
```

That's it. No config needed.

## The three commands

### `/check-spec [path|phase-number|prompt]`

Scores a spec on 5 weighted determinism signals:

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| **Scope** | ×3 | How precisely the change is described |
| **File boundaries** | ×2 | Whether exact file paths are listed |
| **Acceptance criteria** | ×2 | Whether success is testable |
| **Negative space** | ×2 | Whether out-of-scope items are explicit |
| **Decisions resolved** | ×2 | Whether technical choices are locked in |

**Score ≥ 8/10:** Generates a contract directly — the spec is deterministic enough.

**Score < 8/10:** Asks targeted refinement questions based on codebase context. Not generic suggestions — real questions with real options derived from your actual code:

> *"The nav bar is in `src/app/layout.tsx`. Should the logo replace the site title text on line 21, or go to the left of it?"*

After refinement, outputs:
- **Refined spec** → `.spec-gate/refined-spec.md`
- **Contract** → `.spec-gate/contract.json`
- **Test suggestions** → derived from acceptance criteria

Then offers: **Implement now** | **Plan first** | **Done for now**

### `/check-diff [base-branch]`

Compares the actual diff against the contract across 5 compliance signals:

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| **File accuracy** | ×3 | Expected files present, no unexpected extras |
| **Boundary respect** | ×1 | Within file count and line limits |
| **Acceptance criteria** | ×3 | Each criterion verified against diff evidence |
| **Scope discipline** | ×1 | No scope creep beyond the contract |
| **Decision adherence** | ×2 | Technical decisions actually followed in code |

Decision verification is the key differentiator — it doesn't just check *which* files changed, but *what the code actually does*. If the spec says "use jose lib, RS256" but the code imports jsonwebtoken with HS256, check-diff catches it.

Uses the contract timestamp to scope the diff, filtering out pre-existing uncommitted changes.

### `/check-determinism`

The ultimate validation. Runs the same spec through **two independent agents in isolated worktrees** and compares their outputs:

- Creates two git worktrees
- Gives each agent the identical spec with zero additional context
- Diffs the two implementations line-by-line
- Reports actual determinism: file overlap, content similarity, decision consistency
- Compares predicted score (from `/check-spec`) against actual results

Run this **before implementing** — it validates the spec itself, not your implementation. This is expensive (two full implementations) so it's opt-in. Use it when you want proof that a critical spec is tight enough before you commit to building it.

## Self-improving loop

The core innovation. Every `/check-diff` run writes learnings to `.spec-gate/learnings.json`:

**File coupling rules** — Project-specific patterns like "changing `prisma/schema.prisma` also requires `prisma/migrations/`". Next time `/check-spec` sees a spec that touches the schema but doesn't mention migrations, it lowers the file boundaries score and asks the user about it.

**Scoring notes** — Tracks which signals get over-scored. If file boundaries has been too generous 3 times, `/check-spec` applies stricter scoring automatically.

**Decision specificity rules** — From `/check-determinism` results, learns which kinds of decisions need more detail. "Use a good auth library" isn't specific enough; "jose, RS256, 1hr expiry" is.

**Project checklists** — After enough learnings accumulate, `/check-spec` auto-generates a project-specific checklist and uses it to front-load questions before you even write a vague spec.

```
Session 1: /check-spec → 10/10 → implement → /check-diff → 6/10
           Learns: "layout.tsx changes also need globals.css"

Session 5: /check-spec → spec mentions layout.tsx without globals.css
           → Flags it: "Past changes to layout.tsx also required globals.css"
           → Score drops to 7/10, triggers refinement
           → After refinement: 10/10 with globals.css included

Session 5: /check-diff → 9/10 → learnings reinforced
```

The system gets better the more you use it on a project.

## Works with any workflow

spec-gate auto-detects what produced the spec:

| Workflow | How to use |
|----------|-----------|
| **Raw prompt** | `/check-spec add a dark mode toggle` |
| **GSD phases** | `/check-spec 24` → reads `.planning/phase-24/PLAN.md` |
| **Plan mode** | `/check-spec` with no args → picks up plan from context |
| **Plan files** | `/check-spec ./my-plan.md` |
| **spec-kit** | Auto-detected from `.spec-kit/` directory |

## Example: plan mode workflow

A common pattern is to use Claude Code's built-in plan mode to design an approach, then validate it with spec-guard before implementing:

```bash
# 1. Use plan mode to design the feature
> Plan how to add rate limiting to the API endpoints

# Claude enters plan mode, explores the codebase, proposes a plan
# You review and approve the plan

# 2. Before implementing, validate the plan for determinism
> /check-spec

# spec-guard picks up the plan from context, scores it, and asks
# refinement questions for any gaps:
#
#   Spec type: backend
#   Score: 6/10
#
#   "The plan mentions rate limiting but doesn't specify the strategy.
#    Should it use fixed window (100 req/min, 429 after) or
#    sliding window (token bucket, 100 tokens/min)?"
#
#   "The plan doesn't specify the error response format.
#    Should 429 responses return {error, retryAfter} or
#    use a Retry-After header?"

# 3. After refinement, choose "Implement now" or "Plan first"
# The contract locks in the decisions so implementation is predictable

# 4. After implementation, validate the diff
> /check-diff

# spec-guard verifies the code matches the contract —
# right files changed, decisions followed, criteria met
```

The key insight: plan mode gives you a *strategy*, spec-guard makes it *deterministic*. A plan might say "add rate limiting middleware" — spec-guard ensures it specifies *which* library, *what* limits, *which* status codes, and *what* error format.

## Configuration

`.spec-gate.json` (created by `init`, all fields optional):

```json
{
  "specSources": [
    { "pattern": ".planning/phase-*/PLAN.md", "workflow": "gsd" },
    { "pattern": ".spec-kit/**/*.md", "workflow": "spec-kit" }
  ],
  "ignoredPaths": [
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "*.snap", ".env*", "*.generated.*"
  ],
  "boundaries": {
    "defaultMaxFiles": 20,
    "defaultMaxLinesAdded": 1000
  }
}
```

## CLI commands

```bash
spec-gate init              # Scaffold skills, agent, hook, config
spec-gate init --skills-only  # Only install skills and config (no hook)
spec-gate init --hooks-only   # Only install agent and hook
spec-gate init --force        # Overwrite existing files (creates backups)
spec-gate update            # Update to latest templates (keeps config)
spec-gate remove            # Remove all spec-gate files
spec-gate remove --data     # Also remove .spec-gate/ directory
```

## File overview

After `init`, these files exist in your project:

| File | Purpose | Git? |
|------|---------|------|
| `.claude/skills/check-spec/SKILL.md` | Gate 1 skill | Yes |
| `.claude/skills/check-diff/SKILL.md` | Gate 2 skill | Yes |
| `.claude/skills/check-determinism/SKILL.md` | Determinism test skill | Yes |
| `.claude/agents/spec-gate-validator.md` | Stop hook agent | Yes |
| `.claude/settings.json` | Hook registration | Yes |
| `.spec-gate.json` | Configuration | Yes |
| `.spec-gate/contract.json` | Current contract | No* |
| `.spec-gate/refined-spec.md` | Current refined spec | No* |
| `.spec-gate/learnings.json` | Cross-session learnings | No* |

*The `.spec-gate/` directory is session-specific. Add it to `.gitignore` or commit it — your choice. Learnings are more valuable if committed (shared across team members).

## Design principles

- **Zero runtime dependencies** — CLI uses only Node.js built-ins
- **Always advisory** — Never blocks execution, never exits with error codes
- **Non-destructive settings merge** — Only touches the `hooks` key in settings.json
- **Scaffolding, not a framework** — After init, the files are yours. Edit them freely.
- **Works offline** — Everything runs locally, no API calls beyond Claude Code itself

## License

MIT
