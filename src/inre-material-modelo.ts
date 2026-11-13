import * as ecs from '@8thwall/ecs'

/**
 * Aplica el material del objeto a las mallas de su modelo glTF.
 *
 * Lo genera INRE: se reescribe en cada publicación, así que editarlo a mano no sirve
 * de nada.
 *
 * El material no se carga aquí. Se toma el que el sistema de materiales del motor ya
 * dejó puesto en la malla de la entidad —con sus texturas, su repetición y su espacio
 * de color— y se pasa a las mallas del modelo, que cuelgan de ella. Así el resultado
 * es el del formato, sin una segunda forma de interpretar un material.
 */

/** Material y número de hijos con los que se aplicó por última vez. */
interface Marca {
  fuente: any
  hijos: number
}

/** Material que traía cada malla del modelo, para poder devolverlo. */
const originales = new WeakMap<any, any>()

/** Copia propia por malla, cuando se conservan las texturas del modelo. */
const copias = new WeakMap<any, any>()

const marcas = new WeakMap<any, Marca>()

/**
 * ¿Es este el material que construyó el sistema del motor?
 *
 * Una entidad recién creada trae un MeshBasicMaterial invisible de relleno; el
 * sistema de materiales pone en su lugar un MeshPhysicalMaterial marcado con
 * userData.disposable. Distinguirlos es lo que evita pintar el modelo de invisible
 * mientras el objeto todavía no tiene material.
 */
const esDelMotor = (material: any): boolean =>
  material != null && material.userData != null && material.userData.disposable === true

/** Las mallas del modelo: todo lo que cuelga de la entidad, menos ella misma. */
const mallas = (raiz: any, visitar: (nodo: any) => void) => {
  raiz.traverse((nodo: any) => {
    if (nodo !== raiz && nodo.isMesh === true) {
      visitar(nodo)
    }
  })
}

/** Sustituye el material de cada malla por el del objeto. */
const aplicar = (raiz: any, fuente: any) => {
  mallas(raiz, (nodo) => {
    if (!originales.has(nodo)) {
      originales.set(nodo, nodo.material)
    }
    if (nodo.material !== fuente) {
      nodo.material = fuente
    }
  })
}

/**
 * Copia solo el aspecto —color, rugosidad, metalicidad, transparencia— y deja las
 * texturas del modelo en su sitio.
 *
 * Es lo que se quiere para teñir un modelo bien texturizado: con el material entero se
 * pierde el mapa de color del archivo y el modelo se queda liso.
 */
const soloAspecto = (raiz: any, fuente: any) => {
  mallas(raiz, (nodo) => {
    if (!originales.has(nodo)) {
      originales.set(nodo, nodo.material)
    }

    let copia = copias.get(nodo)
    if (copia === undefined) {
      // La copia comparte las texturas del original, así que se puede modificar sin
      // tocar a otras mallas que usaran el mismo material del archivo.
      copia = originales.get(nodo).clone()
      copias.set(nodo, copia)
    }

    if (copia.color != null && fuente.color != null) {
      copia.color.copy(fuente.color)
    }
    if (copia.emissive != null && fuente.emissive != null) {
      copia.emissive.copy(fuente.emissive)
      copia.emissiveIntensity = fuente.emissiveIntensity
    }
    if (typeof fuente.roughness === 'number' && typeof copia.roughness === 'number') {
      copia.roughness = fuente.roughness
    }
    if (typeof fuente.metalness === 'number' && typeof copia.metalness === 'number') {
      copia.metalness = fuente.metalness
    }
    copia.opacity = fuente.opacity
    copia.transparent = fuente.transparent
    copia.side = fuente.side
    copia.wireframe = fuente.wireframe
    copia.needsUpdate = true

    if (nodo.material !== copia) {
      nodo.material = copia
    }
  })
}

/** Devuelve a cada malla el material que traía del archivo. */
const restaurar = (raiz: any) => {
  mallas(raiz, (nodo) => {
    if (originales.has(nodo)) {
      nodo.material = originales.get(nodo)
      originales.delete(nodo)
    }
    copias.delete(nodo)
  })
}

ecs.registerComponent({
  name: 'inre-material-modelo',
  schema: {
    conservarTexturas: ecs.boolean,
  },
  schemaDefaults: {
    conservarTexturas: false,
  },

  /*
   * Se comprueba en cada fotograma, pero solo se recorre el modelo cuando algo cambió:
   * el material del objeto (otra instancia) o el número de hijos de la entidad —el
   * modelo llega asíncrono y se cuelga entonces—. Sin lo segundo, un material asignado
   * antes de que el GLB acabe de descargarse no se aplicaría nunca.
   */
  tick: (world, component) => {
    const raiz: any = world.three.entityToObject.get(component.eid)
    if (raiz == null) {
      return
    }

    const fuente = raiz.material
    const marca = marcas.get(raiz)

    if (!esDelMotor(fuente)) {
      // El objeto se quedó sin material: el modelo recupera el suyo.
      if (marca !== undefined) {
        restaurar(raiz)
        marcas.delete(raiz)
      }
      return
    }

    if (marca !== undefined && marca.fuente === fuente && marca.hijos === raiz.children.length) {
      return
    }

    if (component.schema.conservarTexturas) {
      soloAspecto(raiz, fuente)
    } else {
      aplicar(raiz, fuente)
    }

    marcas.set(raiz, {fuente, hijos: raiz.children.length})
  },

  remove: (world, component) => {
    const raiz: any = world.three.entityToObject.get(component.eid)
    if (raiz == null) {
      return
    }
    restaurar(raiz)
    marcas.delete(raiz)
  },
})
