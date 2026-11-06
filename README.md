# Birthday in ASCII

A small, private birthday page drawn as glowing, coloured ASCII art that fills the browser window. It plays four scenes in order:

1. **Countdown** 3, 2, 1, then a curtain of hanging letters and butterfly charms. Sweep the cursor (or a finger) through it to part it, and your age appears with fireworks and confetti. Click once to turn on the chimes.
2. **Cake** with flickering candles. Press the button to blow them out
3. **A letter** to yourself, typed out beside a floating envelope
4. **A bouquet** that grows in, with an affirmation typed beside it for each flower

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

Add query parameters to jump to a scene and a time: `index.html?scene=3&t=18` (scenes are 0 to 3). For the cake add `&blown` to start with the candles out.

## Share or host

Drag the folder to Netlify Drop, or push it to GitHub and enable GitHub Pages. Keep the letter private if you host it publicly.
