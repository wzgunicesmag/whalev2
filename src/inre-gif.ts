import * as ecs from '@8thwall/ecs'

/**
 * Anima el GIF de un material y lo deja mandar desde el timeline.
 *
 * Lo genera INRE: se reescribe en cada publicacion, asi que editarlo a mano no sirve de
 * nada. Es el gemelo de apps/editor/src/assets/gif.ts, y las dos mitades tienen que
 * contar el tiempo igual.
 *
 * El motor sube el .gif como una imagen fija, asi que aqui se cambia la imagen de la
 * textura por un lienzo y se pinta fotograma a fotograma. El mando —pausa, bucle y
 * velocidad— llega por el atributo VideoControls, que es el que el componente del
 * timeline escribe en los tramos de medio.
 */

// --- Lectura del archivo ---

/*
 * El formato guarda centesimas de segundo, y muchisimos GIF antiguos declaran 0 o 1
 * —«lo mas rapido posible»— porque los visores de la epoca lo entendian asi. Todos los
 * navegadores lo sustituyen por 100 ms; sin la misma correccion, el GIF duraria una cosa
 * en el editor y otra en el telefono.
 */
const retardoDe = (centesimas: number): number => (centesimas <= 1 ? 10 : centesimas) / 100

/**
 * Lo que dura cada fotograma, en segundos y en orden. Vacio si el archivo no es un GIF.
 *
 * Se recorre la cadena de bloques del formato sin descodificar nada: cada imagen viene
 * precedida —si el GIF es animado— por un bloque de control grafico que lleva su
 * retardo, y los datos comprimidos se saltan siguiendo la lista de sub-bloques.
 */
const leerRetardos = (bytes: ArrayBuffer): number[] => {
  const datos = new Uint8Array(bytes)
  if (datos.length < 14) {
    return []
  }

  // «GIF», y detras «87a» u «89a».
  if (datos[0] !== 0x47 || datos[1] !== 0x49 || datos[2] !== 0x46) {
    return []
  }

  const vista = new DataView(bytes)
  let pos = 13

  const global = datos[10]
  if ((global & 0x80) !== 0) {
    // La paleta global: tres bytes por color, y el tamano va cifrado en tres bits.
    pos += 3 * (2 << (global & 0x07))
  }

  /** Salta una cadena de sub-bloques. Devuelve si termino bien. */
  const saltar = (): boolean => {
    while (pos < datos.length) {
      const medida = datos[pos]
      pos += 1
      if (medida === 0) {
        return true
      }
      pos += medida
    }
    return false
  }

  const retardos: number[] = []
  let pendiente = 0

  while (pos < datos.length) {
    const marca = datos[pos]
    pos += 1

    // Fin del archivo.
    if (marca === 0x3b) {
      break
    }

    if (marca === 0x21) {
      const etiqueta = datos[pos]
      pos += 1
      // Bloque de control grafico: medida, empaquetado, retardo (2 bytes), indice
      // transparente y terminador. El retardo es lo unico que interesa aqui.
      if (etiqueta === 0xf9 && pos + 4 <= datos.length) {
        pendiente = vista.getUint16(pos + 2, true)
      }
      if (!saltar()) {
        return []
      }
      continue
    }

    if (marca === 0x2c) {
      // Descriptor de imagen: posicion y tamano (8 bytes) y el empaquetado.
      if (pos + 9 > datos.length) {
        return []
      }
      pos += 8
      const local = datos[pos]
      pos += 1
      if ((local & 0x80) !== 0) {
        pos += 3 * (2 << (local & 0x07))
      }
      // El tamano minimo del codigo LZW, y detras los datos comprimidos.
      pos += 1
      if (!saltar()) {
        return []
      }
      retardos.push(retardoDe(pendiente))
      pendiente = 0
      continue
    }

    // Un byte que no es de ninguno de los tres tipos: el archivo no es lo que dice.
    return []
  }

  return retardos
}

// --- El reproductor de una entidad ---

/** El resto de una division que nunca sale negativo: el bucle del GIF. */
const vuelta = (valor: number, total: number): number =>
  (total > 0 ? ((valor % total) + total) % total : 0)

const reproductores = new Map<ecs.Eid, any>()

/**
 * Cambia la imagen de la textura por un lienzo del **mismo tamano**.
 *
 * El tamano importa: three reserva el almacenamiento de una textura normal una sola vez,
 * con la medida de la primera imagen que sube, y las siguientes solo pueden escribir
 * dentro de esa reserva. Un lienzo recien creado mide 300x150, asi que uno sin medir
 * dejaria los fotogramas de verdad fuera de la reserva y el plano en negro.
 *
 * Devuelve null mientras la imagen no este cargada: el sistema de materiales del motor
 * la pide de forma asincrona, asi que los primeros ticks pasan de largo.
 */
const conectar = (textura: any): any => {
  if (textura == null) {
    return null
  }

  const imagen = textura.image
  if (!(imagen instanceof HTMLImageElement)) {
    // O ya se cambio por el lienzo, o la textura todavia no tiene imagen.
    return null
  }
  if (!imagen.complete || imagen.naturalWidth === 0) {
    return null
  }

  const contexto = document.createElement('canvas').getContext('2d', {alpha: true})
  if (contexto == null) {
    return null
  }

  const lienzo = contexto.canvas
  lienzo.width = imagen.naturalWidth
  lienzo.height = imagen.naturalHeight

  const estado: any = {
    textura,
    contexto,
    lienzo,
    // Inicio de cada fotograma dentro de la vuelta, en segundos.
    inicios: [0],
    duracion: 0,
    descodificador: null,
    // El <img> del motor, que el navegador sigue animando por su cuenta.
    respaldo: imagen,
    reloj: 0,
    pintado: -1,
    descodificando: false,
    // Para reiniciar el GIF cuando el timeline arranca su tramo.
    pausado: false,
  }

  // El primer fotograma es el que ya se estaba viendo: asi el cambio de imagen a lienzo
  // no parpadea.
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  textura.image = lienzo
  textura.needsUpdate = true

  /*
   * Los tiempos se leen del archivo y los fotogramas se piden por numero.
   *
   * ImageDecoder es lo que permite pedir el fotograma N, y por tanto lo que hace que el
   * GIF obedezca al cursor del timeline. Donde no exista —Firefox anterior al 130,
   * Safari anterior al 26— se copia lo que enseñe el <img>: se ve animado, aunque a su
   * propio ritmo. La URL es la del asset que el motor ya descargo, asi que volver a
   * pedirla sale de la cache.
   */
  fetch(imagen.src).then(respuesta => respuesta.arrayBuffer()).then((bytes) => {
    const retardos = leerRetardos(bytes)
    if (retardos.length > 0) {
      let total = 0
      estado.inicios = retardos.map((retardo) => {
        const desde = total
        total += retardo
        return desde
      })
      estado.duracion = total
    }

    const Descodificador = (window as any).ImageDecoder
    if (typeof Descodificador !== 'function' || retardos.length < 2) {
      return null
    }

    const creado = new Descodificador({data: bytes, type: 'image/gif'})
    return creado.completed.then(() => {
      estado.descodificador = creado
    })
  }).catch(() => undefined)

  return estado
}

/** El fotograma que toca en ese instante. Lineal: un GIF tiene decenas, no miles. */
const fotogramaEn = (estado: any, tiempo: number): number => {
  const inicios = estado.inicios
  for (let indice = inicios.length - 1; indice > 0; indice -= 1) {
    if (tiempo >= inicios[indice]) {
      return indice
    }
  }
  return 0
}

const dibujar = (estado: any, origen: any, indice: number) => {
  const lienzo = estado.lienzo
  // Limpiar antes de dibujar: el GIF tiene transparencia por indice, y sin esto el
  // fotograma anterior asomaria por los huecos del nuevo.
  estado.contexto.clearRect(0, 0, lienzo.width, lienzo.height)
  estado.contexto.drawImage(origen, 0, 0, lienzo.width, lienzo.height)
  estado.pintado = indice
  estado.textura.needsUpdate = true
}

/** Pinta el fotograma que corresponde al reloj del reproductor. */
const pintar = (estado: any, moviendose: boolean) => {
  if (estado.descodificador == null) {
    // Respaldo: el fotograma lo elige el navegador, asi que se copia lo que haya.
    if (moviendose) {
      dibujar(estado, estado.respaldo, -1)
    }
    return
  }

  const indice = fotogramaEn(estado, estado.reloj)
  if (indice === estado.pintado || estado.descodificando) {
    return
  }

  estado.descodificando = true
  estado.descodificador.decode({frameIndex: indice, completeFramesOnly: true})
    .then((resultado: any) => {
      estado.descodificando = false
      dibujar(estado, resultado.image, indice)
      // El fotograma descodificado ocupa memoria de verdad y no la suelta el recolector:
      // hay que cerrarlo a mano en cuanto esta copiado.
      resultado.image.close()
    })
    .catch(() => {
      estado.descodificando = false
    })
}

/** El mando del objeto: lo que el timeline le dejo puesto, o reproducir en bucle. */
const mandoDe = (world: any, eid: ecs.Eid) => {
  if (!ecs.VideoControls.has(world, eid)) {
    return {pausado: false, bucle: true, velocidad: 1}
  }
  const mando: any = ecs.VideoControls.get(world, eid)
  return {
    pausado: mando.paused === true,
    bucle: mando.loop !== false,
    velocidad: typeof mando.speed === 'number' && mando.speed > 0 ? mando.speed : 1,
  }
}

ecs.registerComponent({
  name: 'inre-gif',
  schema: {
    alphaTest: ecs.f32,
  },
  schemaDefaults: {
    alphaTest: 0,
  },

  remove: (world, component) => {
    const estado = reproductores.get(component.eid)
    if (estado != null && estado.descodificador != null) {
      estado.descodificador.close()
    }
    reproductores.delete(component.eid)
  },

  tick: (world, component) => {
    const objeto: any = world.three.entityToObject.get(component.eid)
    if (objeto == null) {
      return
    }

    const material = objeto.material
    if (material == null) {
      return
    }

    /*
     * El recorte, que es lo unico que hace que la sombra siga al alfa.
     *
     * El mapa de sombras no se dibuja con este material sino con uno de profundidad, que
     * no mezcla nada: sin recorte, un GIF recortado proyecta su rectangulo entero. three
     * copia «map» y «alphaTest» a ese material de profundidad —getDepthMaterial, en
     * WebGLShadowMap— y ahi el pixel descartado deja de proyectar sombra.
     *
     * Va escalado por la opacidad porque three compara contra «opacity × alfa del mapa»:
     * con un umbral fijo, un objeto que el timeline esta fundiendo desapareceria de golpe
     * al bajar del umbral.
     *
     * Y va antes de conectar el reproductor a proposito: el recorte tiene que aplicarse
     * aunque la textura todavia no haya llegado. Cambiarlo recompila, porque cruzar el
     * cero enciende o apaga la define USE_ALPHATEST del sombreador.
     */
    const opacidad = typeof material.opacity === 'number' ? material.opacity : 1
    const recorte = component.schema.alphaTest * opacidad
    if (material.alphaTest !== recorte) {
      material.alphaTest = recorte
      material.needsUpdate = true
    }

    let estado = reproductores.get(component.eid)
    if (estado == null || estado.textura !== material.map) {
      // La textura llega mas tarde que el material, y el motor la reemplaza entera si
      // cambia la imagen: por eso se comprueba cada fotograma en vez de una sola vez.
      estado = conectar(material.map)
      if (estado == null) {
        return
      }
      reproductores.set(component.eid, estado)
    }

    const mando = mandoDe(world, component.eid)

    /*
     * Al arrancar un tramo, el GIF empieza por el principio.
     *
     * Es lo mismo que hace el motor con un video —lo rebobina al despausarlo— y lo que
     * espera quien coloco el tramo: la barra del timeline dice cuando se ve el GIF, no
     * en que fotograma esta.
     */
    if (estado.pausado && !mando.pausado) {
      estado.reloj = 0
    }
    estado.pausado = mando.pausado

    if (!mando.pausado && estado.duracion > 0) {
      const avance = world.time.delta / 1000 * mando.velocidad
      const siguiente = estado.reloj + avance
      estado.reloj = mando.bucle
        ? vuelta(siguiente, estado.duracion)
        : Math.min(siguiente, estado.duracion)
    }

    pintar(estado, !mando.pausado)
  },
})
