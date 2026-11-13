# whalev2

Experiencia de realidad aumentada creada con INRE.

**Modo:** World Effects (anclaje al suelo con SLAM)
**Hosting:** GitHub Pages
**En vivo:** https://wzgunicesmag.github.io/whalev2/

---

## Cómo se publica

Cada `push` a `main` dispara `.github/workflows/deploy.yml`, que compila el
proyecto y lo publica en GitHub Pages. No hay que hacer nada más: **editar y guardar
desde INRE crea un commit, y el commit actualiza la experiencia.**

Si es la primera vez, activa Pages en *Settings → Pages → Source: GitHub Actions*.

## Cómo editarlo

**Desde el navegador**, con INRE: abre el editor, conecta tu cuenta de GitHub y elige
este repositorio.

**En tu ordenador**, con el 8th Wall Studio de escritorio: este es el formato oficial
de proyecto, así que se abre sin conversiones.

**A mano**, si prefieres:

```bash
npm install
npm run serve     # servidor de desarrollo
npm run build     # compila en dist/
```

## Publicarlo en otro sitio

`dist/` es un sitio estático corriente. Sirve tal cual en Netlify, GitHub Pages o
cualquier hosting; la configuración de Vercel y de Cloudflare ya viene en el
repositorio, así que cambiar de una a otra es conectar el repositorio y nada más. Solo
dos requisitos:

- **HTTPS**, porque la cámara exige contexto seguro.
- No bloquear `cdn.jsdelivr.net`, de donde se carga el motor.

## Estructura

```
src/.expanse.json       la escena: objetos, materiales, luces, componentes
src/index.html          página de entrada; carga el motor
src/*.ts                componentes propios
src/inre-marcadores.ts  carga los marcadores en el motor; lo genera INRE
src/assets/             modelos, texturas, vídeo, audio
image-targets/          marcadores de imagen
config/                 configuración de webpack (MIT, de 8th Wall)
vercel.json             despliegue en Vercel
wrangler.toml           despliegue en Cloudflare Pages
.node-version           versión de Node con la que se compila
```

## Licencias

El código de este proyecto es tuyo. El motor que usa, no:

- `@8thwall/ecs` 3.2.1 — MIT, © Niantic Spatial, Inc.
- `@8thwall/engine-binary` 1.0.0 — **XR Engine License Agreement**
- `@8thwall/landing-page` 1.0.0 — MIT

La XR Engine License prohíbe cobrar por un producto cuyo valor derive sustancialmente
de la funcionalidad del motor. Ver [NOTICE](./NOTICE).
