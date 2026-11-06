# Birthday in ASCII

A small, private birthday page drawn as glowing, coloured ASCII art that fills the browser window. It plays these scenes in order:

1. **Countdown** 3, 2, 1 with the digits from `art/numbers.txt`.
2. **Butterfly curtain** (`art/curtain.jpg`): sweep the cursor, or scroll, to make it swing and part. Then the 22 with fireworks and confetti.
3. **Fairy** (`art/fairy.txt`) appears from nowhere, waves her wand and writes "Happy Birthday" (`art/hbd.txt`) in the air. It fades and flowers (`art/flower_animation.txt`) grow in from both sides, one from above and one from below on each side.
4. **Cake** with flickering candles. Scroll (or swipe, or press the down arrow) to blow them out
5. **A letter** to yourself, typed out beside a floating envelope. Scroll to read faster
6. **A bouquet** that grows in, with an affirmation typed beside it for each flower

Plain HTML, CSS and JavaScript. No install, no build step, no dependencies.

## Run it

Open `index.html` in a browser. Or serve the folder:

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

(If port 8000 is already taken by another app, use a different port.)

## Make it yours

Everything personal is in `js/config.js`: name, age, countdown start, the letter and the affirmations. Edit the text and refresh.

## Structure

```
birthday-ascii/
├── index.html          page shell (one full-window canvas)
├── css/style.css       background, button
├── js/config.js        your words (edit this)
├── js/art.js           maths helpers, digit font, character set, flower colours
├── js/pics.js          the pictures as coloured cell grids (generated, don't edit)
├── js/main.js          renderer (cells -> characters -> glow) and the four scenes
├── art/                your photos: cake.jpg, bouquet.jpg, letter.jpg
├── tools/build-pics.py turns the photos into js/pics.js
├── tools/cutout.py     removes each photo's background
└── docs/spec.md        original specification
```

## Change a picture

The cake, envelope and bouquet are photos in `art/` (`cake.jpg`, `letter.jpg`, `bouquet.jpg`). To swap one, replace the file (same name), then run:

```bash
python3 tools/build-pics.py
```

This cuts the background out, then turns the photo into a dense grid of coloured cells in `js/pics.js`, because the browser can't read the photos straight from a folder. It needs Python with Pillow, numpy and scipy.

The background cut-out in `tools/cutout.py` is tuned for these three photos. A new photo with a plain, light background usually works as is. For a busy background, edit the matching function there.

## Debugging a scene

Add query parameters to jump to a scene and a time: `index.html?scene=6&t=18` (scenes are 0 countdown, 1 butterfly curtain, 2 the 22 and party, 3 fairy and flowers, 4 cake, 5 letter, 6 garden). For the cake add `&blown` to start with the candles out.

## Share or host

Drag the folder to Netlify Drop, or push it to GitHub and enable GitHub Pages. Keep the letter private if you host it publicly.
