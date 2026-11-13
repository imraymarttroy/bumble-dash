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

## Multiplayer (up to 4 players)

1. One player taps **Create Room** and gets a 5-letter code (or taps
   **Copy invite link** to share `.../bumble-dash/?room=CODE`).
2. Friends type the code and tap **Join** (or just open the link).
3. The host taps **Start game** once 2–4 players are in.

Everyone flies the exact same course at the same time; crashed players
keep watching until the last one falls. Highest score wins, and the host
can start a rematch from the results screen.

It works with no server of our own: [PeerJS](https://peerjs.com/) (WebRTC)
connects the browsers directly, and its free cloud broker is only used to
find a room by its code. If the host leaves, the room closes.

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
js/net.js         multiplayer rooms (PeerJS): create / join / relay
js/game.js        state machine, input, game loop, HUD, menu & lobby
```

## Tweaking

All gameplay numbers (gravity, flap power, speeds, gap sizes, spacing) live in
the `CFG` object at the top of `js/game.js`.

## License

MIT
