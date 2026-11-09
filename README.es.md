# Vistazo

**Una Steam Deck más tranquila.** Un plugin de [Decky Loader](https://decky.xyz) que rediseña el inicio y la
ficha de cada juego para la pantalla OLED y suaviza los sonidos de los menús.

[Read in English](README.md)

![Vistazo en una Steam Deck: el inicio, la ficha de un juego, sus logros y los ajustes](docs/screenshots/vistazo-es.webp)

| | |
|---|---|
| **Inicio** | Tus juegos en estanterías sobre el arte del elegido. L1 / R1 cambian de estantería. |
| **Ficha** | Logros, datos y veredictos de Deck y ProtonDB en la primera pantalla, sin pestañas. |
| **Sonidos** | Tonos cortos y suaves en lugar de los de Steam. |
| **Estilo** | Negro real, sin cajas ni brillos, lima solo donde está el foco. |

## Instalar

1. Decky → engranaje → **General** → activa el **modo desarrollador**.
2. **Desarrollador** → **Instalar plugin desde URL**:

   ```
   https://github.com/m4rz3r0/vistazo-decky/releases/latest/download/Vistazo.zip
   ```

3. Confirma. El nuevo inicio aparece la próxima vez que vuelvas a Inicio.

Para actualizar, repite el paso 2. Para quitarlo: Decky → engranaje → **Plugins** → **⋯** → **Desinstalar**.

## Ajustes

Menú de acceso rápido → **Decky** → **Vistazo**. Cada cambio se aplica al momento.

| Ajuste | Activado |
|---|---|
| Portadas y arte del juego | El inicio de Vistazo en lugar del de Steam |
| Intercambiar A y X | A abre la ficha y X juega |
| Estanterías | Una por interruptor: Instalados, Retro (juegos de RomM, si los hay) y tus colecciones de Steam |
| Logros y datos | La ficha de Vistazo en lugar de la de Steam |
| Nota de ProtonDB | Cómo va cada juego en Linux |
| Tonos suaves | Sonidos suaves en lugar de los de Steam |

<details>
<summary><b>Controles en el inicio</b></summary>

- **L1 / R1**: estantería siguiente o anterior. Cada una recuerda su portada.
- **A** juega, **X** abre la ficha (o al revés), **Y** abre la biblioteca completa.
- **Amigos**, en la esquina superior izquierda: **A** cambia tu estado, **X** abre amigos y chat.

</details>

<details>
<summary><b>Privacidad</b></summary>

Todo sale de Steam en la Deck. La nota de ProtonDB se pide a `protondb.com` solo con el número del juego, y se
puede desactivar. Las portadas que faltan vienen del servidor de imágenes de Steam. Sin telemetría; solo se
guardan tus ajustes, en la Deck.

</details>

<details>
<summary><b>Compatibilidad</b></summary>

Luce más con un tema oscuro de CSS Loader, pero funciona solo. Probado con Tender, CSS Loader y PlayTime. Los
accesos directos que no son de Steam conservan su ficha. Si una actualización de Steam cambia una pantalla en la
que se apoya Vistazo, se ve la de Steam.

</details>

<details>
<summary><b>Compilar</b></summary>

```bash
pnpm install
./pack.sh        # deja out/Vistazo.zip
```

Una etiqueta como `v0.7.0` (igual que en `package.json`) hace que GitHub Actions adjunte `Vistazo.zip` a una
versión.

</details>

BSD de 3 cláusulas, ver [LICENSE](LICENSE). El archivo compilado incluye `@decky/ui` y `@decky/api` (LGPL-2.1).
