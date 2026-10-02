# Cambios v2

## Bugs corregidos
- Fechas desfasadas un dia en Paraguay (UTC-3) al guardar/editar vencimientos, controles, cirugias y citas.
- Stock: dos empleados moviendo el mismo producto pisaban la cantidad (ahora transaccion atomica).
- Facturas: numeros repetidos si facturaban dos personas a la vez (ahora contador atomico).
- Alerta de stock bajo por email solo reemplazaba la 1ra aparicion de cada variable.
- Camara del escaner quedaba encendida al cerrar el modal.
- Reportes contaban facturas anuladas en "Ventas por dia".
- Busqueda global: los resultados ahora llevan al modulo con el termino ya filtrado.
- Config duplicada (`cargarConfig`) unificada, con cache de 60 s.

## Seguridad
- Credenciales por defecto retiradas de la pantalla de login y de crear-admin.
- crear-admin movido a /tools y bloqueado en produccion.
- Reglas: auditoria no falseable (usuarioUid = quien escribe), movimientos validados, borrar fichas solo ADMIN.
- Cabeceras HSTS, X-Frame DENY, permisos; cierre de sesion por inactividad.

## Funciones nuevas
- Modulo Vacunas (carnet, semaforo, WhatsApp).
- Panel con avisos del dia.
- PWA instalable + aviso sin conexion.
- Agenda: boton Hoy, citas de hoy, clic en dia para agendar, aviso de choque de horario.
- Buscadores en Consultas y Facturas; filtro y exportacion a Excel del inventario.
- Estado de factura por seleccion (anular pide confirmacion); resumen cobrado/por cobrar.
- Datos de la clinica en Configuracion -> aparecen en los PDF, con lineas de firma.
- Eliminar mascota (solo ADMIN). Esc / clic fuera cierran modales.

## Diseno
- Logo nuevo (huella + cruz veterinaria, SVG y PNG) e iconos PWA.
- Impresion limpia, foco visible, tablas con scroll en movil, modo oscuro ajustado.
