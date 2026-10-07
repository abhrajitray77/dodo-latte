# Crema Corner · Latte Art Bar

A small interactive toy. You pour milk into a cup of coffee, draw your latte art, stir it in, and print a receipt that you tear off the printer. The receipt carries a time-lapse of your cup.

Live: https://dodolatte.abhrajitray.com/

Built as my take-home for the Design Engineer role at Dodo Payments.

![The home screen. An inked jade cup on tan paper, with the name Crema Corner and a note card explaining the three steps.](<public/Screenshot 2026-10-07 141901.png>)

## What you can do

1. **Pour.** Press and drag on the coffee. Hold still for a round blob. Wiggle side to side for leaves. A quick thin pull through the middle makes the point of a heart. Pour size, flow, spread and strength are all yours to set.
2. **Stir.** Drag in circles. The milk swirls through the coffee like it does in a real cup.
3. **Print.** A receipt comes out of the printer with your pour and stir replayed as a dithered loop. Grab it and pull. It tears along the perforation, bit by bit, and comes free. Save it as a PNG or a GIF. On desktop you also get a polaroid of the whole thing in colour.

![The painting screen. A top-down view of the cup with milk art in progress, a note card with the pour instructions on the left, sample polaroids on the right, and the controls along the bottom.](<public/Screenshot 2026-10-07 142128.png>)

![The receipt screen. A thermal receipt hangs from an illustrated printer, with a dithered picture of the cup, the order lines and a barcode.](<public/Screenshot 2026-10-07 142239.png>)

## How it works

**The coffee is a fluid simulation.** A small stable-fluids solver runs on the GPU (velocity, pressure and dye as render targets). The whole surface is one liquid, crema and milk together, so everything moves as one.

**Pouring is a source, not a brush.** Real latte art works because foam piles up where the stream lands and pushes everything on the surface outward. The pour adds a radial outflow around the stream (Q over 2πr, softened at the core, fading to the wall). Hold still and you get a growing disc. Wiggle while backing up and the earlier bands get pushed forward into leaves. The dye is advected with a limited MacCormack scheme so the milk keeps its edges instead of greying out.

**The cup is drawn like an illustration.** Flat jade fill, ink outlines from an inverted-hull pass that stays a constant pixel width from any camera, pen hatching on the shadow side, and a cat engraved on the front through a texture decal.

**The receipt is a sheet of paper.** A small Verlet cloth with bending stiffness, pinned along the perforation. Pulling tears the pins one by one, from the far side if you pull sideways, from both edges if you pull straight down. Paper does not stretch, so when the sheet strains it slips in your fingers instead. Once it is free it becomes a stiff card that follows your hand and settles flat in the middle.

**The time-lapse is recorded as you go.** Small frames of the surface are captured while you pour and stir, thinned out if the session runs long. The receipt dithers them to one bit. The polaroid shows them in colour. Both can be saved as a GIF, encoded in the browser.

**All the sound is synthesised.** The lo-fi loop, the milk stream, the stir, the printer motor and ticks, the paper rips, the bells and the button clicks are made with the Web Audio API. No audio files. Sound starts on your first click, which is a browser rule.

## Stack

- Astro with React islands
- Tailwind CSS 4
- WebGL, through three.js, for the cup, the outlines and the fluid solver (GLSL shader passes on render targets)
- Web Audio API for every sound
- Canvas 2D for the receipt, the polaroid and the dither
- GSAP for the camera and the UI motion
- gifenc (vendored, MIT) for GIF encoding
- Fonts: Inter and Caveat from Google Fonts, Apfel Grotezk for the display face when the files are present in `public/fonts`

## Run it

```sh
pnpm install
pnpm dev
```

Then open http://localhost:4321. Add `?hint` to the URL to see the first-visit pour hint again.

Build with `pnpm build`. The output is in `dist/`.

## Controls

| Where | What |
|---|---|
| Pour step | Press and drag to pour. Size chips set the stream. Flow, Spread and Strength sliders tune the physics. |
| Anywhere | Ctrl+Z undoes a stroke, Ctrl+Shift+Z or Ctrl+Y redoes. |
| Stir step | Drag in circles. |
| Receipt | Pull down or sideways to tear. |
| Header | Sound on and off, remembered between visits. |

## What I would explore next

- **More ways to pour.** A tilt of the cup that biases the flow, and a lift of the pitcher that thins the stream, so the three classic patterns come out of technique instead of settings.
- **A pour that remembers you.** Save your receipts and compare pours over time, like a small latte-art diary.
- **Share from the receipt.** A card made for sharing, with the GIF and the order number, sized for chat and social.
- **Phones first.** The physics already runs well on phones. The next step is a one-thumb layout where the controls get out of the way while you pour.
- **Sound that follows the milk.** Let the stream's pitch and texture track the real flow rate from the simulation instead of the slider.

## Credits

- gifenc by Matt DesLauriers, MIT
- The fluid solver is a trimmed take on the classic stable-fluids approach popularised by Pavel Dobryakov's WebGL fluid demo
- Sample latte-art photos in the pour step are reference images used for inspiration only

## Licence

Copyright 2026 Abhrajit Ray. All rights reserved.

The source is public so it can be reviewed. It is not licensed for reuse, in whole or in part. The vendored gifenc library in `src/vendor/gifenc` keeps its own MIT licence.
