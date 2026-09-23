# Smear Cursor for VS Code

Animates the cursor with a smear effect. This is a port of
[sphamba/smear-cursor.nvim](https://github.com/sphamba/smear-cursor.nvim), itself inspired by
[Neovide's animated cursor](https://neovide.dev/features.html#animated-cursor).

The physics is a direct port of the Neovim plugin, so its settings behave the same way. The Neovim
plugin approximates the smear with Unicode block characters. Here it is drawn as a vector shape:
antialiased, with a smooth gradient and sub-pixel particles.

## Usage

Install the extension and move the cursor. The commands **Smear Cursor: Toggle**, **Enable** and
**Disable** switch it on and off (they update `smearCursor.enabled`).

Works with [VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) and
[VSCode Neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim). When
one of them is installed, the cursor style tells the extension the current mode: a block cursor
means normal, a line means insert, an underline means replace. Insert mode uses the `*InsertMode`
parameters, like `smear_insert_mode` and friends in Neovim.

## Configuration

All settings live under `smearCursor.*` and map one-to-one to the Neovim options (`snake_case`
becomes `camelCase`). Open the Settings UI and search for "Smear Cursor" to browse them with
descriptions and ranges.

### Examples

Faster smear:

```jsonc
{
  "smearCursor.stiffness": 0.8,                  // default 0.6   [0, 1]
  "smearCursor.trailingStiffness": 0.6,          // default 0.45  [0, 1]
  "smearCursor.stiffnessInsertMode": 0.7,        // default 0.5   [0, 1]
  "smearCursor.trailingStiffnessInsertMode": 0.7,// default 0.5   [0, 1]
  "smearCursor.damping": 0.95,                   // default 0.85  [0, 1]
  "smearCursor.dampingInsertMode": 0.95,         // default 0.9   [0, 1]
  "smearCursor.distanceStopAnimating": 0.5       // default 0.1   > 0
}
```

Lower `damping` (e.g. `0.65`) makes the smear bouncier: it overshoots the target.

Smooth cursor without smear:

```jsonc
{
  "smearCursor.stiffness": 0.5,
  "smearCursor.trailingStiffness": 0.5
}
```

🔥 Fire hazard:

```jsonc
{
  "smearCursor.cursorColor": "#ff4000",
  "smearCursor.particlesEnabled": true,
  "smearCursor.stiffness": 0.5,
  "smearCursor.trailingStiffness": 0.2,
  "smearCursor.trailingExponent": 5,
  "smearCursor.damping": 0.6,
  "smearCursor.gradientExponent": 0,
  "smearCursor.neverDrawOverTarget": true,
  "smearCursor.particleSpread": 1,
  "smearCursor.particlesPerSecond": 500,
  "smearCursor.particlesPerLength": 50,
  "smearCursor.particleMaxLifetime": 800,
  "smearCursor.particleMaxInitialVelocity": 20,
  "smearCursor.particleVelocityFromCursor": 0.5,
  "smearCursor.particleDamping": 0.15,
  "smearCursor.particleGravity": -50,
  "smearCursor.minDistanceEmitParticles": 0
}
```

### Colors

`smearCursor.cursorColor` accepts:

- empty (default): the theme's `editorCursor.foreground`, which follows theme changes
- a CSS color: `#d3cdc3`, `rgb(211 205 195)`, `orange`
- a theme color id: `terminal.ansiRed`, `editorError.foreground`
- `none`: the color of the text under the target position

`smearCursor.cursorColorInsertMode` does the same for insert mode and falls back to `cursorColor`.

### Differences from the Neovim plugin

| Neovim option | VS Code |
| --- | --- |
| `vertical_bar_cursor*`, `horizontal_bar_cursor_replace_mode` | `cursorShape`, which follows the editor cursor style by default |
| `smear_between_buffers` | `smearBetweenEditors`: only within the same editor group, because the extension API has no screen coordinates across groups |
| `filetypes_disabled` | `disabledLanguages` (language ids) |
| `distance_stop_animating_vertical_bar` | defaults to `0.1` instead of `0.875`, because thin bars are drawn exactly |
| `legacy_computing_symbols_support*`, `use_diagonal_blocks`, `max_slope_*`, `min_slope_vertical`, `max_angle_difference_diagonal`, `max_offset_diagonal`, `min_shade_no_diagonal*`, `max_shade_no_matrix`, `matrix_pixel_*`, `color_levels`, `gamma`, `cterm_*`, `particle_switch_octant_braille` | not needed: they tune the rasterization into characters |
| `max_kept_windows`, `windows_zindex`, `hide_target_hack`, `transparent_bg_fallback_color` | not needed: they work around terminal rendering |
| `smear_to_cmd`, `smear_terminal_mode`, `delay_after_key`, `delay_disable`, `particles_over_text` | not applicable |

## How it works

The extension API cannot draw over the editor. The smear is the `::before` pseudo-element of a text
decoration on the target cell, absolutely positioned over the smear's bounding box, with CSS injected
through the decoration's `textDecoration` property. Its color is a plain background (so theme
variables work). An SVG mask, regenerated every frame, cuts out the exact smear polygon, the
head-to-tail gradient and the particles. Horizontal offsets use `ch` units and vertical ones are
percentages of the line height, so no pixel measurement is needed.

Known limitations:

- The real cursor stays visible: extensions cannot hide it.
- With word wrap, smears that cross wrapped lines are misplaced vertically. Folded regions are
  accounted for only inside the viewport.
- Only the primary cursor is animated.
- Wide characters (CJK, some emoji) count as one column.

## Development

```sh
npm install
npm test          # compile and run the unit tests
npm run package   # build a .vsix with vsce
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with the extension loaded.

- `src/physics.ts`: the smear dynamics, ported from `animation.lua`, with no VS Code dependency
- `src/scene.ts`: turns a frame into the SVG mask and CSS
- `src/renderer.ts`: draws a scene as a decoration
- `src/controller.ts`: tracks the cursor, decides when to smear, runs the frame loop
- `src/editor.ts`: editor metrics, cursor shape and mode detection
- `src/config.ts`: settings, whose defaults live in `package.json`

## License

GPL-3.0-or-later, like smear-cursor.nvim, from which the animation code is ported.
