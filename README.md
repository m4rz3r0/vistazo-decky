# Vistazo

**Vistazo** is a dark, opinionated [Decky Loader](https://decky.xyz) plugin for the Steam Deck: a home built on
shelves, every game page at a glance, and soft menu sounds.

[Leer en español](README.es.md)

![Vistazo on a Steam Deck: the home screen, a game page, its achievements and the settings](docs/screenshots/vistazo-en.webp)

## Home

The selected game fills the screen with its art. Your games sit below on shelves: installed, retro and any of
your Steam collections. <kbd>L1</kbd> <kbd>R1</kbd> move between them, <kbd>A</kbd> plays, <kbd>X</kbd> opens the game page and <kbd>Y</kbd> the full library.

## Game page

Achievements, facts and the Deck and ProtonDB verdicts on the first screen, no tabs. Press <kbd>A</kbd> on the
achievements for the full list.

## Sounds

Every menu sound becomes a short, soft tone, made by the plugin and played through Steam's own output.

## Settings

Press <img src="docs/icons/menu.svg" height="16" alt="···">, open <img src="docs/icons/plug.svg" height="16" alt="Decky"> **Decky**, then **Vistazo**. Turn each part on or off, swap <kbd>A</kbd> and <kbd>X</kbd>, and pick your shelves. Changes
apply at once.

## Install

1. Press <img src="docs/icons/menu.svg" height="16" alt="···">, open <img src="docs/icons/plug.svg" height="16" alt="Decky"> **Decky** and select <img src="docs/icons/gear.svg" height="16" alt="⚙">. Under **General**, turn on **Developer mode**.
2. Under **Developer**, choose **Install plugin from URL** and enter:

   ```
   https://github.com/m4rz3r0/vistazo-decky/releases/latest/download/Vistazo.zip
   ```

3. Confirm. The new home appears the next time you go Home.

To update, repeat step 2. To remove it, open <img src="docs/icons/gear.svg" height="16" alt="⚙"> **Plugins**.

## Privacy

Everything comes from Steam on the Deck. The ProtonDB rating asks `protondb.com` with the game's number only,
and can be turned off. No telemetry.

## Build

```bash
pnpm install && ./pack.sh    # out/Vistazo.zip
```

BSD 3-Clause. The build bundles `@decky/ui` and `@decky/api` (LGPL-2.1).
