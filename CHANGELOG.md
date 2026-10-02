# Cambios v3.0

## Errores corregidos
- Vacunas: una vacuna quedaba "vencida" para siempre aunque se aplicara el refuerzo. Ahora solo cuenta la última dosis de cada tipo.
- Doble clic en "Guardar" creaba registros duplicados (consultas, citas, cirugías, mascotas, dueños). Todos los formularios están protegidos.
- Filtro de fecha de Auditoría desfasado un día (usaba UTC).
- La cámara del escáner quedaba encendida al cerrar con Esc o clic afuera.
- Cerrar una confirmación con Esc dejaba la acción colgada.
- El historial clínico se cortaba en las últimas 300 consultas de toda la clínica; ahora la ficha trae todo el historial del paciente.
- La agenda solo cargaba las últimas 500 citas; ahora carga exactamente el rango que se ve.
- Reportes: "Ingresos por servicio" solo sumaba cirugías; ahora usa lo facturado real.
- Cada acción esperaba a un servicio externo de IP antes de registrarse en auditoría.
- Las fotos reemplazadas o de mascotas eliminadas quedaban ocupando espacio en Storage.
- Después de publicar una versión, el usuario seguía con código viejo hasta recargar dos veces (service worker).
- El auto-foco de los formularios podía robar el foco mientras se escribía (o se usaba un lector de códigos).

## Sincronización y rendimiento
- Persistencia offline de Firestore + listas en tiempo real en todas las pantallas.
- Indicador de sincronización; trabajar sin conexión sin que la pantalla se cuelgue.
- Panel con estadísticas agregadas (antes descargaba colecciones completas para contar).
- Búsqueda global sin descargas por tecla, sin tildes y navegable con teclado.
- Consultas acotadas por rango (reportes, agenda, auditoría, consultas) y paginación.
- Librerías pesadas cargadas solo cuando se usan; librerías de CDN cacheadas para abrir sin internet.

## Funciones nuevas
- Ficha completa del paciente, consulta clínica profesional, adjuntos, curva de peso.
- Agenda Mes/Semana/Día/Lista con duración, colores por veterinario y "Atender".
- Catálogo de servicios, facturación con IVA Paraguay por ítem, pagos parciales, cuenta corriente, anulación con reposición de stock.
- Caja diaria con arqueo; compras y proveedores.
- Centro de recordatorios por WhatsApp; campana de avisos.
- Reportes con comparación de períodos y Excel de varias hojas.
- Roles Administrador / Veterinario / Recepción; papelera; respaldo JSON; consentimiento informado PDF.

## Seguridad
- Reglas reescritas por rol; números y totales de facturas inalterables; contador que solo avanza de a uno.
- Movimientos de stock y caja inalterables; Storage verifica que el usuario esté activo.
- Desactivar un usuario o cambiarle el rol se aplica al instante.

## Diseño
- Interfaz renovada, modo oscuro completo, navegación inferior y tablas tipo tarjeta en el celular.
