---
title: "feat: Dashboard Visual Redesign with Light/Dark Mode"
type: feat
status: completed
date: 2026-03-27
---

# feat: Dashboard Visual Redesign with Light/Dark Mode

## Overview

Transform the Lattice dashboard from a functional but minimal UI into an editorially elegant interface inspired by the "Aura Metrics" moodboard. Introduce a proper light/dark mode system with system preference detection and manual override, replacing the current `light-dark()` CSS approach with class-based theming to enable smooth mode transitions.

## Problem Statement / Motivation

The dashboard works well functionally but lacks visual polish. The moodboard establishes a clear design direction: warm, editorial aesthetics with typographic hierarchy and intentional color use. The current theme infrastructure (CSS `light-dark()`) follows OS preference but offers no manual toggle and cannot support animated transitions between modes.

## Proposed Solution

### Design System

Adopt the moodboard's design language across all dashboard views (auth, projects, active sessions, project detail):

**Color Palette (Light Mode — from moodboard):**

| Token Name | Hex | Role |
|---|---|---|
| Obsidian | `#1A1F18` | Primary text, dark accents |
| Parchment | `#E8E4D9` | Secondary backgrounds, cards |
| Terracotta | `#C26A54` | Accent (headings, highlights — large text only due to contrast) |
| Alabaster | `#F4F4F0` | Base background |

**Color Palette (Dark Mode — derived):**

| Token Name | Hex | Role |
|---|---|---|
| Obsidian | `#1A1F18` | Base background |
| Deep Moss | `#242A22` | Surface background (cards, topbar) |
| Warm Slate | `#2E352C` | Elevated surfaces |
| Parchment Light | `#E8E4D9` | Primary text |
| Muted Parchment | `#A8A498` | Secondary text |
| Terracotta Light | `#D4836E` | Accent (brightened for dark bg contrast) |
| Alabaster | `#F4F4F0` | Headings, high-emphasis text |

**Typography:**
- Headings: **Cormorant Garamond** (400, 600) — serif, editorial
- Body: **Outfit** (400, 500, 600) — geometric sans, clean
- Mono: Existing `SF Mono` / `Fira Code` stack (unchanged)
- Fonts self-hosted as WOFF2 in `server/dashboard/fonts/`

**Semantic Status Colors (both modes):**
- Status colors (green/amber/red for active/waiting/error) remain functionally standard but tuned for warmth — shifted slightly toward the palette's warm tone without sacrificing meaning.

### Theme Architecture

**Migrate from `light-dark()` to class-based theming:**

The current CSS uses `light-dark()` which resolves based on the `color-scheme` property. This property is discrete (not animatable), making smooth transitions impossible. Replace with:

```css
/* Default: light mode tokens */
:root {
  --color-bg: #f4f4f0;
  --color-bg-surface: #e8e4d9;
  /* ... */
}

/* Dark mode tokens */
:root.theme-dark {
  --color-bg: #1a1f18;
  --color-bg-surface: #242a22;
  /* ... */
}

/* Smooth transition on toggle (respects reduced motion) */
@media (prefers-reduced-motion: no-preference) {
  :root {
    transition: background-color 0.3s ease, color 0.3s ease;
  }
  /* Apply to key surface elements, not * (perf) */
  body, .topbar, .card, .tab-nav, .auth-form {
    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
  }
}
```

**Theme resolution logic (three-state):**
1. On page load, read `localStorage.getItem('lattice_theme')`
2. If `'light'` or `'dark'` → apply that class to `<html>`
3. If `null` (or `'auto'`) → check `matchMedia('(prefers-color-scheme: dark)')` and apply accordingly
4. Listen for `matchMedia` changes — only apply if user preference is `'auto'`/`null`

**Flash prevention:**
A small inline `<script>` in `<head>` reads localStorage and sets the class before first paint. To satisfy CSP, add the script's SHA-256 hash to the `script-src` directive:

```html
<script>
(function(){
  var t = localStorage.getItem('lattice_theme');
  var d = t === 'dark' || (!t && matchMedia('(prefers-color-scheme:dark)').matches);
  if (d) document.documentElement.classList.add('theme-dark');
})();
</script>
```

### Theme Toggle UI

**Three-state toggle in the topbar** (right side, before logout button):
- Icon-based: sun / moon / auto (system) icons
- Click cycles: auto → light → dark → auto
- Current state shown via icon + tooltip
- On the auth screen: a smaller standalone toggle in the top-right corner

### Font Loading Strategy

**Self-hosted WOFF2 files** in `server/dashboard/fonts/`:
- `cormorant-garamond-400.woff2`
- `cormorant-garamond-400-italic.woff2`
- `cormorant-garamond-600.woff2`
- `outfit-400.woff2`
- `outfit-500.woff2`
- `outfit-600.woff2`

```css
@font-face {
  font-family: 'Cormorant Garamond';
  src: url('fonts/cormorant-garamond-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* ... additional faces */
```

**Fallback strategy:**
- Cormorant Garamond: fallback to `Georgia, 'Times New Roman', serif` with `size-adjust` to reduce layout shift
- Outfit: fallback to `system-ui, -apple-system, sans-serif`
- `font-display: swap` for headings (visual importance), `font-display: optional` for body (layout stability)

**CSP update:**
No CSP changes needed — `font-src` defaults to `default-src 'self'`, and self-hosted fonts satisfy this. Add `script-src 'self' 'sha256-<hash>'` for the inline theme-init script.

## Technical Considerations

### Architecture Impacts

- **CSS rewrite:** All `light-dark()` calls replaced with explicit custom property values + `.theme-dark` overrides. The semantic token names stay the same — only the mechanism changes.
- **New tokens needed:** Typography scale (`--text-xs` through `--text-2xl`), shadow tokens (`--shadow-sm`, `--shadow-md`), additional color derivations for hover states, focus rings, and surfaces.
- **`renderProjectDetail()` in app.js (line 380-457):** Uses `innerHTML` string concatenation. The HTML structure stays the same; only CSS class names may change. No JS refactor needed unless adding new visual elements.

### Performance Implications

- **Font files:** ~150-200KB total for 6 WOFF2 files. Acceptable for a dashboard that loads once and polls.
- **Transitions:** Applied to specific surface elements (body, topbar, cards, tab-nav), not `*`. This limits paint cost.
- **No new JS dependencies.** Theme logic is ~30 lines of vanilla JS.

### Security Considerations

- **CSP:** Add `script-src 'self' 'sha256-<hash>'` for the theme-init inline script. The hash is computed from the exact script content — any change to the script requires updating the hash.
- **localStorage:** Validate stored values — only accept `'light'`, `'dark'`, or treat anything else as auto. Wrap `localStorage.setItem` in try/catch (fails in some private browsing modes).

### Accessibility

- **Terracotta contrast:** `#C26A54` on Parchment `#E8E4D9` is ~2.8:1 (fails WCAG AA for normal text). Restrict Terracotta to: headings 18px+ (3:1 threshold met), decorative borders, non-text indicators. For interactive text elements needing accent color, use a darker variant `#A85640` (~4.5:1 on Alabaster).
- **Focus indicators:** Define custom focus ring using Terracotta (or darker variant) with 2px offset, visible on both light and dark backgrounds.
- **`prefers-reduced-motion`:** Theme transitions are wrapped in `@media (prefers-reduced-motion: no-preference)`. Users with reduced motion get instant theme switching.
- **`prefers-contrast: more`:** Add a `@media (prefers-contrast: more)` block that increases border weights and ensures all text meets AAA (7:1).

## System-Wide Impact

- **Interaction graph:** Theme toggle writes to localStorage and sets a class on `<html>`. No API calls, no server-side effects. The inline script in `<head>` reads localStorage on every page load.
- **Error propagation:** `localStorage.setItem` can throw in private browsing — catch and fail gracefully (theme still works for the session, just not persisted).
- **State lifecycle risks:** None. Theme preference is purely cosmetic and client-side. No orphaned state possible.
- **API surface parity:** The theme preference is client-only. No API endpoint needed. If cross-device sync is desired later, it could be added as a user preference API.

## Acceptance Criteria

### Functional Requirements

- [x] Light mode matches moodboard aesthetic: warm color palette, Cormorant Garamond headings, Outfit body text
- [x] Dark mode uses complementary dark palette derived from moodboard colors
- [x] Default behavior follows `prefers-color-scheme` system setting
- [x] Manual three-state toggle (auto / light / dark) in topbar cycles correctly
- [x] Manual preference persists across page reloads via localStorage
- [x] No flash of wrong theme on page load (inline script initializes before paint)
- [x] `matchMedia` listener updates theme in real-time when system preference changes (only in auto mode)
- [x] Theme toggle is accessible on both auth screen and main app
- [x] All views (auth, projects, active sessions, project detail) are styled in both modes

### Non-Functional Requirements

- [x] All text meets WCAG AA contrast ratios in both modes
- [x] Terracotta accent restricted to large text (18px+) or interactive elements with darker variant
- [x] Custom focus indicators visible in both modes
- [x] `prefers-reduced-motion` disables theme transition animation
- [x] Font files total < 250KB (WOFF2, subset to Latin)
- [x] No layout shift on font load (fallback metrics defined)
- [x] CSP remains strict — no external CDN dependencies

### Quality Gates

- [ ] Visual comparison against moodboard for light mode fidelity
- [ ] Both modes tested at mobile (375px), tablet (768px), and desktop (1280px) widths
- [ ] Lighthouse accessibility audit passes in both modes
- [ ] Theme toggle tested: auto→light→dark→auto cycle, localStorage cleared, private browsing

## Dependencies & Risks

**Dependencies:**
- Font files: Download Cormorant Garamond and Outfit WOFF2 from Google Fonts (one-time, committed to repo)

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `light-dark()` → class-based migration introduces regressions | Medium | High | Methodical token-by-token replacement with visual diff testing |
| Terracotta contrast issues missed in some UI states | Medium | Medium | Audit every text-on-background combo before finalizing |
| Font loading causes visible layout shift | Low | Medium | `size-adjust` on fallback faces + `font-display` strategy |
| CSP hash mismatch after script edit | Low | High | Document the hash computation in a comment next to the CSP meta tag |

## Implementation Phases

### Phase 1: Foundation (CSS architecture + fonts)
- Download and self-host font files in `server/dashboard/fonts/`
- Add `@font-face` declarations with `font-display` and fallback metrics
- Migrate all `light-dark()` tokens to explicit custom properties with `.theme-dark` overrides
- Remove `color-scheme` from CSS and HTML meta tag (replaced by class-based approach)
- Add typography scale tokens
- Add shadow tokens
- Verify all existing UI elements render correctly in both modes

**Files:** `server/dashboard/style.css`, `server/dashboard/index.html`, new `server/dashboard/fonts/` directory

### Phase 2: Theme Toggle + Persistence
- Add inline theme-init script to `<head>` with CSP hash
- Update CSP meta tag with `script-src`
- Add theme toggle button to topbar (three-state: auto/light/dark)
- Add standalone toggle to auth screen
- Implement localStorage persistence with try/catch
- Add `matchMedia` change listener for auto mode
- Add transition CSS for smooth mode switching (with reduced-motion guard)

**Files:** `server/dashboard/index.html`, `server/dashboard/style.css`, `server/dashboard/app.js`

### Phase 3: Visual Polish
- Apply moodboard aesthetic across all components: cards, badges, topbar, tab nav, buttons
- Style auth screen with editorial treatment (larger type, warm tones)
- Add hover/focus states matching the editorial feel (subtle transforms, terracotta accents)
- Refine the dot-grid or decorative subtle texture from the moodboard (optional, performance-permitting)
- Style project detail view: git state block, checkpoint block, session history
- Empty states with editorial tone
- Skeleton loading shimmer tuned for warm palette

**Files:** `server/dashboard/style.css`, `server/dashboard/app.js` (detail view HTML strings)

### Phase 4: Accessibility & QA
- WCAG AA contrast audit for every token combination in both modes
- Add `@media (prefers-contrast: more)` overrides
- Custom focus ring styles
- Test at 3 viewport widths
- Test theme toggle lifecycle
- Test font loading on slow connections

**Files:** `server/dashboard/style.css`

## Sources & References

### Internal References
- Moodboard: `docs/references/shuffle-20260327-1501-51229.zip` — "Aura Metrics" design direction
- Dashboard spec: `docs/plans/lattice-spec.md:446-476` — design requirements (mobile-friendly, dark default, lightweight)
- Implementation plan: `docs/plans/2026-03-26-feat-lattice-tracker-v1-implementation-plan.md`
- Current CSS tokens: `server/dashboard/style.css:4-28`
- CSP policy: `server/dashboard/index.html:7`

### External References
- CSS `color-scheme` property: https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
- `font-display` descriptor: https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display
- WCAG contrast requirements: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- CSP `script-src` with hashes: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src
