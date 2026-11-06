# Birthday in ASCII

A small, private birthday page drawn as glowing, coloured ASCII art that fills the browser window. It plays four scenes in order:

1. **Countdown** to your age, in big glowing digits with confetti
2. **Cake** with flickering candles. Press the button to blow them out
3. **A letter** to yourself, typed out inside a frame
4. **A garden** where each flower grows, blooms and reveals an affirmation

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
├── js/main.js          renderer (cells -> characters -> glow) and the four scenes
└── docs/spec.md        original specification
```

## Debugging a scene

Add query parameters to jump to a scene and a time: `index.html?scene=3&t=18` (scenes are 0 to 3). For the cake add `&blown` to start with the candles out.

## Share or host

Drag the folder to Netlify Drop, or push it to GitHub and enable GitHub Pages. Keep the letter private if you host it publicly.
