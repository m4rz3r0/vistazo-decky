# Vistazo

**A calmer Steam Deck.** A [Decky Loader](https://decky.xyz) plugin that redesigns the home screen and game
pages for the OLED screen and softens the menu sounds.

[Leer en español](README.es.md)

![Vistazo on a Steam Deck: the home screen, a game page, its achievements and the settings](docs/screenshots/vistazo-en.jpg)

| | |
|---|---|
| **Home** | Your games on shelves over the art of the selected one. L1 / R1 switch shelf. |
| **Game page** | Achievements, facts, Deck and ProtonDB verdicts on the first screen, no tabs. |
| **Sounds** | Short, soft tones instead of Steam's menu sounds. |
| **Look** | Real black, no boxes or glows, lime only where the focus is. |

## Install

1. Decky → gear icon → **General** → turn on **Developer mode**.
2. **Developer** → **Install plugin from URL**:

   ```
   https://github.com/m4rz3r0/vistazo-decky/releases/latest/download/Vistazo.zip
   ```

3. Confirm. The new home appears the next time you go Home.

To update, repeat step 2. To remove it: Decky → gear icon → **Plugins** → **⋯** → **Uninstall**.

## Settings

Quick access menu → **Decky** → **Vistazo**. Every change applies at once.

| Setting | When on |
|---|---|
| Covers and game art | Vistazo's home instead of Steam's |
| Swap A and X | A opens the game page and X plays |
| Shelves | One switch each: Installed, Retro (RomM games, if any) and your Steam collections |
| Achievements and facts | Vistazo's game page instead of Steam's |
| ProtonDB rating | Shows how each game runs on Linux |
| Soft tones | Soft menu sounds instead of Steam's |

<details>
<summary><b>Controls on the home screen</b></summary>

- **L1 / R1**: next or previous shelf. Each one remembers its cover.
- **A** plays, **X** opens the game page (or the other way round), **Y** opens the full library.
- **Friends** in the top-left corner: **A** changes your status, **X** opens friends and chat.

</details>

<details>
<summary><b>Privacy</b></summary>

Everything comes from Steam on the Deck. The ProtonDB rating asks `protondb.com` with the game's number only,
and can be turned off. Missing cover art comes from Steam's image server. No telemetry; only your settings
are stored, on the Deck.

</details>

<details>
<summary><b>Compatibility</b></summary>

Looks best with a dark CSS Loader theme, but works alone. Tested with Tender, CSS Loader and PlayTime.
Non-Steam shortcuts keep their own page. If a Steam update changes a screen Vistazo relies on, Steam's own
screen shows instead.

</details>

<details>
<summary><b>Build from source</b></summary>

```bash
pnpm install
./pack.sh        # writes out/Vistazo.zip
```

A tag such as `v0.7.0` (matching `package.json`) makes GitHub Actions attach `Vistazo.zip` to a release.

</details>

BSD 3-Clause, see [LICENSE](LICENSE). The built file bundles `@decky/ui` and `@decky/api` (LGPL-2.1).
