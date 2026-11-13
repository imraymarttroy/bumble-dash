# Jeme-Jeme

A tiny tap-to-flap browser game starring Jeme, a very clumsy flyer.

**Play live:** https://imraymarttroy.github.io/bumble-dash/

Inspired by
[Clumsy Bird](https://github.com/ellisonleao/clumsy-bird), but written from
scratch in plain JavaScript with no engine and no build step. The only image
is the player's face (`assets/face.png`); everything else is drawn on a
`<canvas>` and every sound is synthesized with the Web Audio API.

To change the hero, replace `assets/face.png` with any square image.

## Play

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .          # or: python3 -m http.server 8000
```

To publish it for free, enable **GitHub Pages** for this repo
(Settings → Pages → Deploy from branch → `main` / root). The game will be at
`https://<your-username>.github.io/<repo-name>/`.

## Controls

| Action     | Keys                                   |
|------------|----------------------------------------|
| Flap       | Space, ↑, W, Enter, mouse click or tap |
| Pause      | P or Esc                               |
| Mute       | M, or the speaker icon (top right)     |

## Features

- Flower-stalk obstacles with randomized, always-reachable gaps
- Difficulty ramps up: the gap shrinks and the scroll speed rises as you score
- Parallax clouds, hills, bushes and scrolling ground
- Bronze / Silver / Gold / Platinum medals (10 / 20 / 40 / 80 points)
- Best score and mute setting saved in `localStorage`
- Auto-pauses when you switch tabs
- Responsive: scales to any screen, works with touch

## Project structure

```
index.html        page shell
css/style.css     layout and scaling
js/audio.js       synthesized sound effects
assets/face.png   the player's face
js/entities.js    Player (Bee), Stalk, Scenery and Particles classes
js/game.js        state machine, input, game loop, HUD
```

## Tweaking

All gameplay numbers (gravity, flap power, speeds, gap sizes, spacing) live in
the `CFG` object at the top of `js/game.js`.

## License

MIT
