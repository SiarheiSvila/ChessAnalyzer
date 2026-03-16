# Mobile Layout Approach (Chess Analyzer)

## Problem Observed
- On narrow screens, the board + vertical evaluation bar cluster can exceed available width.
- Because the bar and board are in one row, the eval bar may become clipped or visually disappear.

## Proposed / Implemented Approach

### 1) Reflow the center stack for mobile
- Keep desktop: vertical eval bar on the left of the board.
- On mobile (`max-width: 1100px`): switch to a **column** board container.
- Place eval bar **above** the board as a horizontal meter.

### 2) Make board sizing viewport-safe
- Use a responsive `--cell-size` on mobile:
  - `--cell-size: min(50px, calc((100vw - 56px) / 8));`
- This keeps the board fully visible without overflow.

### 3) Share one evaluation value for both bar orientations
- JS computes one normalized percentage (`0..100`) from eval.
- JS sets CSS variable `--eval-percent`.
- CSS applies that variable to:
  - desktop bar: `height`
  - mobile bar: `width`

### 4) Improve mobile reading order
- On mobile, reorder sections to prioritize analysis playback:
  1. Board + controls
  2. Chart + move list
  3. PGN input + details

## Why this is predictable
- Desktop behavior is preserved.
- Mobile behavior uses explicit orientation and ordering rules.
- All sizing is driven by CSS variables and one evaluation percentage source.

## Optional Next Steps
- Add a small numeric label (`+0.54`, `-1.20`) at the end of the mobile eval bar.
- Add a user toggle: `Board first / Input first` for mobile preference.
- Reduce move list max-height further on very small devices (< 420px height).
