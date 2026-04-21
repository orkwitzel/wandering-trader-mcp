# Commit conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). The prefix on every commit to `main` decides the next version when semantic-release runs — see [`releases.md`](releases.md) for the full release flow.

## The prefix table

| Prefix | Bump | Appears in changelog | Example |
|---|---|---|---|
| `feat:` | minor (0.1.0 → 0.2.0) | ✅ "Features" | `feat: hire scouts reveal encounter odds preview` |
| `fix:` | patch (0.1.0 → 0.1.1) | ✅ "Bug Fixes" | `fix: clamp encounter odds at 5%` |
| `perf:` | patch | ✅ "Performance" | `perf: memoize archetype price multipliers` |
| `refactor:` | patch | ✅ "Refactoring" | `refactor: extract findEdge helper` |
| `chore:` | none | ❌ hidden | `chore: tidy imports` |
| `docs:` | none | ❌ hidden | `docs: document release flow` |
| `test:` | none | ❌ hidden | `test(engine): cover sandstorm encounters` |
| `ci:` | none | ❌ hidden | `ci: switch to semantic-release` |
| `feat!:` or `BREAKING CHANGE:` footer | **major** (0.1.0 → 1.0.0) | ✅ "Features" with ⚠️ | `feat!: rename session_id to run_id` |

Scopes are encouraged: `feat(engine):`, `fix(mcp):`, `test(integration):`.

## Structure of a good commit

```
<type>(<scope>): <short imperative summary>

<optional body explaining *why*, not *what*>

<optional footers like BREAKING CHANGE: or Refs: #123>
```

**Do:**
- Use imperative mood ("add", "fix", "rename" — not "added", "fixes").
- Keep the summary under ~72 characters.
- Use the body to explain motivation when the change isn't self-evident.
- Scope helps: `feat(engine): …` groups the changelog.

**Don't:**
- Don't use `feat:` for a bug fix or `fix:` for a new feature — it'll misbias the version bump.
- Don't squash a mixed feat/fix/chore set under one `chore:` prefix — break it into separate commits so the changelog is honest.
- Don't use `wip:` or non-standard prefixes on `main` — they won't trigger a release but they'll also clutter `git log`.

## Examples

### A minor feature

```
feat(engine): add sandstorm severity tiers

Lets environmental events scale their encounter rate multiplier based
on intensity. Previously a "sandstorm_season" was a single flat 2.5×;
now it can be mild (1.5×), moderate (2.5×), or severe (4×).
```

### A patch fix

```
fix(mcp): clamp encounter odds to [5, 95]

Bodyguard stacking could push fight success above 100% before the clamp
was applied. Clamp now happens inside buildEncounterOptions so every
code path that constructs an option benefits.
```

### A breaking change

```
feat(mcp)!: rename session_id to run_id

BREAKING CHANGE: all MCP tool inputs that previously took `session_id`
now take `run_id`. Clients must update their tool calls.
```

### A release-triggering empty bump

```
chore: release 1.0.0

Release-As: 1.0.0
```

*(This works with release-please; semantic-release requires a config plugin for it — see `releases.md`.)*

## When in doubt

If you can't decide between `feat:` and `fix:`, ask: *would a user think of this as new behavior or as a correction to existing behavior?* Lean toward `fix:` for surprising-but-corrective changes — it produces a less noisy minor-version trail.
