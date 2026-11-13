import * as ecs from '@8thwall/ecs'

// Gira sobre su eje el objeto al que se le adjunte este componente.
//
// El `schema` no es decorativo: INRE lo lee para generar el formulario del Inspector,
// igual que hace con los componentes del motor. Cada clave que declares aquí aparece
// como un campo editable, con su valor de `schemaDefaults` de partida.
//
// Los tipos son los del motor: ecs.f32 (decimal), ecs.i32 (entero), ecs.boolean,
// ecs.string y ecs.eid (referencia a otra entidad).
ecs.registerComponent({
  name: 'mi-componente',
  schema: {
    velocidad: ecs.f32,
    eje: ecs.string,
    activo: ecs.boolean,
  },
  schemaDefaults: {
    velocidad: 1,
    eje: 'y',
    activo: true,
  },
  tick: (world, component) => {
    const {velocidad, eje, activo} = component.schema
    if (!activo) {
      return
    }

    const angulo = world.time.elapsed / 1000 * velocidad
    const mitad = Math.sin(angulo / 2)
    const resto = Math.cos(angulo / 2)

    // Cuaternión de un giro sobre el eje elegido: (0, sin(θ/2), 0, cos(θ/2)) para Y.
    ecs.Quaternion.set(world, component.eid, {
      x: eje === 'x' ? mitad : 0,
      y: eje === 'y' ? mitad : 0,
      z: eje === 'z' ? mitad : 0,
      w: resto,
    })
  },
})
