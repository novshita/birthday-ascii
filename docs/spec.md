# Spec: Birthday in ASCII

## Purpose
A short, personal, self-addressed birthday experience (about 1 minute) that feels warm and celebratory.

## Audience
One person: the owner of the birthday. Used once a year on desktop or phone.

## Flow
| # | Scene | Behaviour | Advances |
|---|-------|-----------|----------|
| 1 | Countdown | Shows `countdownFrom` down to 1 as big ASCII digits, then the age with a glow and a greeting | Automatic |
| 2 | Cake | Five candles with flickering flames and a glow; caption "Make a wish." | Button: "Open your letter" |
| 3 | Letter | Lines from `CONFIG.letter` typed out character by character | Button: "Walk into the garden" |
| 4 | Garden | Flowers start as buds, then bloom one by one; each reveals one affirmation | Button: "Replay" |

## Requirements
- Works offline, with no dependencies or build step
- All personal text lives in `js/config.js`; all art in `js/art.js`
- Responsive from 320px up; art scales with the viewport
- Respects `prefers-reduced-motion`: no flicker, no typing delay, no pauses
- Keyboard accessible: the action button receives focus; visible focus ring
- Art is `aria-hidden`; meaningful text (captions, letter, notes) stays readable by screen readers

## Design tokens
| Token | Value | Use |
|-------|-------|-----|
| Night | #14112b | Background |
| Ivory | #f3ead3 | Text |
| Amber | #ffb347 | Flames and glow |
| Rose | #ff8fb1 | Cake, flowers |
| Leaf | #7bd389 | Base flower colour |
| Sky | #8fc7ff | Countdown digits |
| Lilac | #c4a7ff | Flowers |

Type: system monospace stack. Content is centred, except the letter, which is left-aligned for reading (max about 60 characters per line).

## Acceptance checks
1. Countdown plays and ends on the age
2. Candle flames visibly change and glow
3. The letter types fully, and the button appears only after it finishes
4. Every affirmation in config appears under its own flower
5. Replay restarts without duplicate timers
6. Works with reduced motion enabled and at 320px width

## Out of scope (v1)
Sound, accounts, saving, multi-user, backend.
