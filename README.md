# Vistazo

**A calmer Steam Deck.** Vistazo is a [Decky Loader](https://decky.xyz) plugin that redesigns the home screen
and the game pages for the OLED screen, and swaps the menu sounds for quieter ones.

*Vistazo* is Spanish for "a glance": everything you need about a game, at a glance.

![Vistazo on a Steam Deck: the home screen, a game page and the settings](docs/screenshots/vistazo-en.jpg)

- **Real black** wherever there is nothing to show, which on an OLED screen means pixels that are off.
- **No boxes, borders, glows or blur.** Hierarchy comes from brightness and size.
- **One accent colour**, lime, and only for what is selected or focused.
- **Spanish or English**, following Steam's own language.

## What it changes

### Home

The art of the focused game fills the screen and fades to black, with its logo, hours played and last session.
Below, one row of covers:

- **L1 / R1** switch shelf: **Installed** (Steam games, most recent first), **Retro** (RomM games added by
  the Tender plugin, when there are any) and any of your Steam collections, such as Favourites. You choose
  which ones show in the settings.
- **A** plays, **X** opens the game page, **Y** opens the full library. The footer always shows these. You can
  swap A and X in the settings.
- **Friends** sit in the top-left corner: a dot in your status colour and how many friends are online. Press
  **A** there to change your status, **X** to open friends and chat.

Steam's What's New, Friends and Recommended tabs are gone. Coming back from a game lands on the same shelf and
cover.

### Game page

Everything on the first screen, without switching tabs:

- **Achievements**: progress ring, count, and the next three to go for (partial progress first, then the
  most common among players). Press **A** for the full list.
- **Facts**: store tags, release year, installed size, playtime over the last two weeks.
- **Verdicts**: Steam Deck compatibility in Valve's colours and the [ProtonDB](https://www.protondb.com) tier
  in ProtonDB's colours.
- **Description**: as many lines as fit.
- **Your stuff** (screenshots, notes, DLC) is one button away, in the bottom-right corner.

Non-Steam shortcuts, such as retro games, keep their own page untouched.

### Sounds

Every menu sound Steam plays (moving, confirming, opening menus, toggles, launching a game, notifications)
becomes a short, soft tone. The tones are synthesised by the plugin, so no audio files are shipped. They play
through Steam's own audio output and follow its settings: volume, output device, and the switch that turns interface sounds off.

### Settings

Open them from the quick access menu: **⋯ → Decky (plug icon) → Vistazo**. They are grouped by screen:

- **Home**: **Covers and game art** swaps Steam's home for Vistazo's; **Swap A and X** makes A open the game page
  and X play
- **Shelves**: one switch per shelf: Installed, Retro if you have RomM games, and each of your own
  Steam collections, found on your Deck
- **Game page**: **Achievements and facts** swaps Steam's game page for Vistazo's; **ProtonDB rating** adds the
  community's rating (off: no requests leave the Deck)
- **Sound**: **Soft tones** swaps Steam's menu sounds for soft tones, with a button to hear them

Changes apply right away and are kept on the Deck.

## Install

You need [Decky Loader](https://decky.xyz) on your Steam Deck.

1. In Decky's settings (quick access menu → Decky → gear icon) open **General** and turn on **Developer
   mode**.
2. Open **Developer** → **Install plugin from URL** and enter:

   ```
   https://github.com/m4rz3r0/vistazo-decky/releases/latest/download/Vistazo.zip
   ```

   Or download `Vistazo.zip` from the [releases page](https://github.com/m4rz3r0/vistazo-decky/releases), copy
   it to the Deck and use **Install plugin from ZIP file**.
3. Confirm the prompt. The new home screen appears the next time you go Home.

To update, repeat step 2. To uninstall: Decky → gear icon → **Plugins** → **⋯** next to Vistazo →
**Uninstall**. Steam's own screens and sounds come back at once.

## Privacy

Everything comes from the Steam client on the Deck, with two exceptions:

- The ProtonDB tier is requested from `protondb.com` with the game's id only. No account or personal data is
  sent. You can turn it off.
- Cover art the client hasn't cached is loaded from Steam's own image server.

There is no telemetry. The only thing stored is your settings, on the Deck.

## Compatibility

Vistazo looks its best with a dark CSS Loader theme, but works on its own. It leaves other plugins' pages
alone; it is tested alongside Tender, CSS Loader and PlayTime. If a Steam update changes the pages it relies
on, Vistazo steps aside and Steam's own screen shows instead.

## Build from source

```bash
pnpm install
./pack.sh        # writes out/Vistazo.zip
```

Pushing a tag such as `v0.7.0` (it must match `package.json`) makes GitHub Actions build the plugin and attach
`Vistazo.zip` to a release.

## Licence

BSD 3-Clause, see [LICENSE](LICENSE). The built file bundles `@decky/ui` and `@decky/api`, which are LGPL-2.1.

[Leer en español](README.es.md)
