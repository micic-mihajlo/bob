# Porting the reference UI

Bob's window is a copy of the reference desktop app's UI. This note records how it was copied and why.

## Decision

Convert the reference components to React, keep their markup and class names, and copy their CSS as it is.

- **CSS is copied verbatim.** The token sheet, the primitives, the shell, the sidebar, the conversation styles, the roadmap and the files panel live under `src/components/theme` and `src/components/features/*`, imported in the reference's cascade order from `src/components/theme/index.css`. The only edit is the token prefix (`--bob-*`) and class prefixes that named the reference product. Fonts come from `next/font` and reach the tokens through `theme/fonts.css`.
- **Components are converted, not reimagined.** Each React component renders the same elements with the same classes and data attributes as its reference counterpart, so the copied CSS applies unchanged. Solid's `<Show>`/`<For>` become conditionals and `map`, signals become state, `class` becomes `className`.
- **Motion carries over with the CSS.** Most of the reference motion is CSS transitions and keyframes. The rest (the canvas-drawn agent faces, spring helpers) is framework-free TypeScript and is copied as is.
- **The data stays Bob's.** Components read the `Snapshot` from `GET /api/state` through `useSnapshot` and `BobProvider`, and act through the routes in `API` (`src/lib/types.ts`). Nothing in the reference's IPC or store layer is copied.

## Why not mount the reference UI as it is

- It is SolidJS 2.0 (a release candidate) and needs Solid's JSX compiler. Next's bundler does not run it, so it would be a second build with its own toolchain inside Bob.
- Its components import about a dozen internal packages (contracts, i18n, telemetry, team client, brand) and read from an IPC-backed store. Mounting it means vendoring all of that and writing an adapter that fakes the desktop host on top of Bob's API.
- Every identifier, file and class that names the reference product has to be renamed for Bob anyway, so a verbatim vendor is not verbatim either.
- Bob needs a small part of the reference: the window frame, the sidebar, the conversation, the composer, the side panel and the roadmap. Converting that part costs less than carrying the rest.

## Where it lives

- `src/components/theme`: the copied token sheet, primitives and shell CSS, and `index.css`, which loads every sheet in the reference's order.
- `src/components/ui`: the reference primitives as React (button, badge, typing dots, confirm dialog).
- `src/components/features`: `window` (rail, frame, `BobContext`), `sidebar`, `agents` (the animated ASCII faces), `conversation`, `panel`, `roadmap`, `files`.
- `src/lib/client`: pure view logic (rows, grouping, markdown, diffs) with tests, and the API calls.
