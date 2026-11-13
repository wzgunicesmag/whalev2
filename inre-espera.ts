/*
 * Pantalla de espera de la experiencia. Archivo generado por INRE; se reescribe en
 * cada publicación, así que los cambios que se hagan aquí se pierden.
 *
 * No toca la escena ni los marcadores: solo enseña y esconde una capa encima del
 * lienzo. Si algo falla dentro, se retira sola para no dejar la pantalla tapada.
 */

const MARCADORES = ["386305641_724387343042558_3038697715686362368_n"]

/** El motor, tal como lo ve este archivo. */
interface Motor {
  addCameraPipelineModule: (module: Record<string, unknown>) => void
}

/** Crea la capa una sola vez, con su marca de agua y sus textos. */
const crearCapa = (): {raiz: HTMLElement, titulo: HTMLElement, pista: HTMLElement} => {
  const raiz = document.createElement('div')
  raiz.id = 'inre-espera'
  raiz.setAttribute('role', 'status')
  raiz.setAttribute('aria-live', 'polite')

  raiz.innerHTML = `
    <style>
      #inre-espera {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        padding: 32px 24px;
        box-sizing: border-box;
        background: radial-gradient(circle at 50% 40%, #1b2230 0%, #0b0e14 70%);
        color: #f2f4f8;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        text-align: center;
        transition: opacity 420ms ease, visibility 420ms ease;
      }
      #inre-espera.inre-fuera { opacity: 0; visibility: hidden; pointer-events: none; }
      #inre-espera .inre-anillo {
        width: 78px;
        height: 78px;
        border-radius: 50%;
        border: 3px solid rgba(242, 244, 248, 0.16);
        border-top-color: #6ea8fe;
        animation: inre-giro 1.1s linear infinite;
      }
      /* Quieto cuando ya solo falta que el usuario apunte: girar en ese momento
         sugeriría que aún se está trabajando, y no se está. */
      #inre-espera.inre-quieto .inre-anillo { animation: none; border-top-color: rgba(242, 244, 248, 0.4); }
      @keyframes inre-giro { to { transform: rotate(360deg); } }
      #inre-espera .inre-titulo { font-size: 17px; font-weight: 600; margin: 0; }
      #inre-espera .inre-pista {
        font-size: 14px;
        line-height: 1.6;
        margin: 0;
        max-width: 34ch;
        color: rgba(242, 244, 248, 0.72);
      }
      #inre-espera .inre-aviso {
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: max-height 260ms ease, opacity 260ms ease;
        font-size: 13px;
        line-height: 1.55;
        max-width: 36ch;
        padding: 0 14px;
        border-radius: 10px;
        background: rgba(224, 134, 130, 0.14);
        border: 1px solid rgba(224, 134, 130, 0.34);
        color: #f0b4b1;
      }
      #inre-espera.inre-error .inre-aviso { max-height: 240px; opacity: 1; padding: 12px 14px; }
    </style>
    <div class="inre-anillo" aria-hidden="true"></div>
    <p class="inre-titulo">Preparando la experiencia…</p>
    <p class="inre-pista">Buscando la cámara.</p>
    <p class="inre-aviso"></p>
  `

  document.body.appendChild(raiz)

  return {
    raiz,
    titulo: raiz.querySelector('.inre-titulo') as HTMLElement,
    pista: raiz.querySelector('.inre-pista') as HTMLElement,
  }
}

const montar = () => {
  let capa: ReturnType<typeof crearCapa> | null = null
  let errorAparecido = false
  let retirada = false

  const arrancar = () => {
    if (capa === null) {
      capa = crearCapa()
    }
    return capa
  }

  /** Retira la capa con su transición y la quita del árbol al terminar. */
  const retirar = () => {
    if (retirada || capa === null) {
      return
    }
    retirada = true
    capa.raiz.classList.add('inre-fuera')
    window.setTimeout(() => capa?.raiz.remove(), 460)
  }

  /** Cambia los textos sin tocar el resto. */
  const escribir = (titulo: string, pista: string, quieto: boolean) => {
    const actual = arrancar()
    actual.titulo.textContent = titulo
    actual.pista.textContent = pista
    actual.raiz.classList.toggle('inre-quieto', quieto)
    // Un aviso de error ya visible no se tapa con el texto de progreso: es lo único
    // que explica por qué la experiencia no avanza.
    if (!errorAparecido) {
      actual.raiz.classList.remove('inre-error')
    }
  }

  const avisar = (texto: string) => {
    const actual = arrancar()
    errorAparecido = true
    ;(actual.raiz.querySelector('.inre-aviso') as HTMLElement).textContent = texto
    actual.raiz.classList.add('inre-error')
    actual.raiz.classList.remove('inre-quieto')
  }

  const motor = (window as unknown as {XR8?: Motor}).XR8

  if (motor === undefined || typeof motor.addCameraPipelineModule !== 'function') {
    // Sin motor no hay nada que esperar; mejor no tapar la pantalla.
    return
  }

  arrancar()

  try {
    motor.addCameraPipelineModule({
      name: 'inre-espera',

      listeners: [
        {
          event: 'reality.imageloading',
          process: () => escribir(
            'Preparando la experiencia…',
            MARCADORES.length > 0
              ? 'Analizando la imagen del marcador.'
              : 'Preparando el contenido.',
            false
          ),
        },
        {
          event: 'reality.imagescanning',
          process: () => escribir(
            'Apunta al marcador',
            MARCADORES.length > 0
              ? 'Enfoca la imagen completa, de frente y con buena luz.'
              : 'Ya puedes mirar alrededor.',
            // Ya no se está trabajando: se está esperando al usuario.
            true
          ),
        },
        {
          event: 'reality.imagefound',
          process: () => retirar(),
        },
        {
          event: 'reality.imageupdated',
          process: () => retirar(),
        },
      ],

      onCameraStatusChange: (evento: {status?: string, reason?: string}) => {
        const estado = evento.status

        if (estado === 'requesting') {
          escribir('Preparando la experiencia…', 'Pidiendo permiso para la cámara.', false)
          return
        }

        if (estado === 'hasStream' || estado === 'hasVideo') {
          escribir(
            'Preparando la experiencia…',
            MARCADORES.length > 0
              ? 'Cargando el marcador.'
              : 'Cargando el contenido.',
            false
          )
          return
        }

        /*
         * Los dos fallos que hay que contar, y que el motor calla:
         *
         *   failed        → el navegador no dio cámara. Sin cámara no hay marcador.
         *   hasDesktop3D  → el motor arrancó sin cámara, en su vista 3D. La escena se
         *                   ve, pero el reconocimiento de imágenes es imposible.
         *
         * En el segundo caso la capa NO se retira: dejarla puesta con el aviso es mejor
         * que enseñar una escena que parece funcionar y no reconoce nada.
         */
        if (estado === 'failed') {
          avisar(
            'No se pudo abrir la cámara'
            + (evento.reason !== undefined ? ` (${evento.reason})` : '')
            + '. Revisa los permisos del navegador y vuelve a cargar la página.'
          )
          return
        }

        if (estado === 'hasDesktop3D') {
          avisar(
            'Este dispositivo no está abriendo la cámara, así que no se puede '
            + 'reconocer el marcador. Abre la experiencia en un móvil.'
          )
        }
      },
    })
  } catch {
    // Si el motor rechaza el módulo, la capa se retira: es peor tapar la experiencia
    // con una pantalla de espera eterna que quedarse sin ella.
    retirar()
  }

  /*
   * Red de seguridad: sin marcadores la capa se retira sola en cuanto el contenido
   * está montado, y si por lo que sea ningún evento llega nunca, también. Un usuario
   * mirando una pantalla de carga para siempre es el peor final posible.
   */
  const sinMarcadores = MARCADORES.length === 0
  window.setTimeout(() => {
    if (sinMarcadores || errorAparecido === false) {
      retirar()
    }
  }, sinMarcadores ? 1800 : 30000)
}

/*
 * Se engancha en cuanto el motor existe. Se comprueba antes por si llegó primero: ese
 * evento no se vuelve a lanzar, y esperarlo dejaría la capa sin montar para siempre.
 */
if ((window as unknown as {XR8?: Motor}).XR8 !== undefined) {
  montar()
} else {
  window.addEventListener('xrloaded', montar)
}
