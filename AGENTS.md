<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes (agent context)

LifeOS is a personal "life OS" app (Next.js App Router, client components with `"use client"`, Supabase, 4 locales: pt / en / es / fr — `pt` is the source of truth in `src/lib/i18n.ts`, typed as `Dict = typeof pt`; any new key must be added to all 4).

## Filter + sort toolbars (built 2026-08-26, user request)

The user wants a **filter** and an **order by ascending/descending** option on every search box and every list page.

- Shared UI: `src/components/ListToolbar.tsx` — exports `ListToolbar` (filter select + sort select + `OrderToggle` asc/desc button) and the `OrderDir` type.
- Sorting logic: `src/lib/sort.ts` — `sortBy(items, accessor, order)` (numbers numeric, strings case-insensitive, nulls last).
- i18n keys added to `common`: `filter`, `sortBy`, `ascending`, `descending` (all 4 locales).
- **Convention for new list pages:** add state (`filter`, `sort`, `order`), apply filter + `sortBy` in the list's `useMemo`, and render `<ListToolbar ...>` above the list. Pass translated labels via `filterLabel`, `sortLabel`, `orderTitle`.
- Already wired: money, notes, tasks, goals, habits, people, subscriptions, shopping, wishlist, projects, routines, digital, learning, career, travel, social, aimemory, finance (challenges), settings (bank search sort), CommandPalette (type filter).
- Pages intentionally skipped (no item lists): stats, monitor, wellness, focus, nova, import, review, audit, lifeadmin, budgets, calendar, dates, more.

## Misc conventions

- App UI text is Portuguese-first; UI strings go through `t` from `useApp()` — avoid hardcoding PT strings in components.
- Verify icon names against the installed `lucide-react` version before using them.
- `npm run typecheck` / `npm run lint` / `npm run build` are the verification commands.
