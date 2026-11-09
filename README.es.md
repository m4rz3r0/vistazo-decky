# Vistazo

**Vistazo** es un plugin de [Decky Loader](https://decky.xyz) para Steam Deck, oscuro y con criterio propio: un
inicio por estanterías, la ficha de cada juego de un vistazo y sonidos suaves.

[Read in English](README.md)

![Vistazo en una Steam Deck: el inicio, la ficha de un juego, sus logros y los ajustes](docs/screenshots/vistazo-es.webp)

## Inicio

El juego elegido llena la pantalla con su arte. Debajo, tus juegos en estanterías: instalados, retro y
cualquiera de tus colecciones de Steam. L1 y R1 pasan de una a otra, A juega, X abre la ficha, Y la biblioteca.

## Ficha

Logros, datos y los veredictos de Deck y ProtonDB en la primera pantalla, sin pestañas. A sobre los logros abre
la lista completa.

## Sonidos

Cada sonido de los menús pasa a ser un tono corto y suave, generado por el plugin y reproducido por la salida de
Steam.

## Ajustes

Menú de acceso rápido → Decky → Vistazo. Activa o desactiva cada parte, intercambia A y X y elige tus
estanterías. Los cambios se aplican al momento.

## Instalar

1. Decky → engranaje → General → activa el modo desarrollador.
2. Desarrollador → Instalar plugin desde URL:

   ```
   https://github.com/m4rz3r0/vistazo-decky/releases/latest/download/Vistazo.zip
   ```

3. Confirma. El nuevo inicio aparece la próxima vez que vuelvas a Inicio.

Repite el paso 2 para actualizar. Se desinstala desde Decky → engranaje → Plugins.

## Privacidad

Todo sale de Steam en la Deck. La nota de ProtonDB se pide a `protondb.com` solo con el número del juego, y se
puede desactivar. Sin telemetría.

## Compilar

```bash
pnpm install && ./pack.sh    # out/Vistazo.zip
```

BSD de 3 cláusulas. El compilado incluye `@decky/ui` y `@decky/api` (LGPL-2.1).
