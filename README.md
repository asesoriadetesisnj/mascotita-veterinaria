# 🐾 Mascotita — Sistema de gestion veterinaria (SaaS 100% estatico)

Aplicacion web para administrar una clinica veterinaria: stock, consultas,
cirugias, agenda, facturacion, reportes, usuarios y auditoria.

**Stack:** HTML5 + CSS3 + JavaScript puro (vanilla), con servicios en la nube
de **Firebase** (Firestore, Authentication y Storage). Se despliega gratis en
**Netlify** con deploy automatico desde GitHub. **No hay backend propio.**

Librerias externas (todas por CDN, gratuitas, sin npm):
- jsPDF + jsPDF-AutoTable (PDFs de fichas y facturas)
- SheetJS / xlsx.js (exportar a Excel/CSV)
- html5-qrcode (escaner de codigo de barras con camara)
- EmailJS (envio de emails sin backend)
- Chart.js (graficos de reportes)
- Font Awesome (iconos)

---

## 🔐 Acceso inicial

El administrador inicial se crea con `tools/crear-admin.html` (ver paso 13).
**Elige una contrasena propia de 8+ caracteres**; ya no hay credenciales por defecto
visibles en la pantalla de login.

> El usuario escribe solo `Admin`; internamente se usa el email
> `admin@mascotita.local`. Firebase Authentication trabaja con email, por eso
> hacemos esa conversion automatica (ver `js/firebase-config.js`).

### Roles

- **ADMIN:** acceso total (usuarios, stock completo con precios, facturacion,
  reportes, configuracion y auditoria).
- **USER (empleado/veterinario):** registra consultas, cirugias y citas, ve el
  stock en solo lectura (sin eliminar ni cambiar precios), genera PDFs. No ve
  reportes, facturacion, configuracion ni auditoria, y no crea usuarios.

---

## 📁 Estructura del proyecto

```
/
├── index.html            Login
├── dashboard.html        Panel principal
├── stock.html            Inventario + escaner de codigo de barras
├── consultas.html        Mascotas, duenos, fichas clinicas + fotos
├── cirugias.html         Cirugias + checklist + ficha PDF
├── citas.html            Agenda/calendario + WhatsApp
├── reportes.html         Reportes + graficos + Excel (solo admin)
├── facturas.html         Facturacion (solo admin)
├── usuarios.html         Gestion de usuarios (solo admin)
├── auditoria.html        Log de auditoria (solo admin)
├── configuracion.html    Ajustes: IVA, emails, plantillas (solo admin)
├── vacunas.html          Carnet de vacunacion y desparasitacion (NUEVO)
├── manifest.json         PWA: app instalable en celular/PC (NUEVO)
├── sw.js                 Service worker: carga rapida + instalable (NUEVO)
├── tools/
│   └── crear-admin.html  Uso unico para crear el admin (bloqueado en produccion)
├── css/
│   ├── styles.css        Estilos (modo claro) + responsive
│   └── dark-mode.css     Variables y overrides del modo oscuro
├── js/
│   ├── firebase-config.js  Claves de Firebase + EmailJS (editar aqui)
│   ├── main.js             Nucleo: layout, guard de roles, utilidades
│   ├── auth.js             Login / logout
│   ├── theme.js            Modo oscuro
│   ├── global-search.js    Busqueda global Ctrl+K
│   ├── stock.js            Inventario + escaner de codigo de barras
│   ├── notifications.js    Emails con EmailJS (stock bajo)
│   ├── whatsapp.js         Integracion WhatsApp (wa.me)
│   ├── pdf-generator.js    jsPDF: fichas, recetas, facturas
│   ├── excel-export.js     SheetJS: exportar a Excel/CSV
│   ├── consultas.js        Mascotas, duenos, consultas, fotos (Storage)
│   ├── cirugias.js         Cirugias
│   ├── citas.js            Agenda
│   ├── reportes.js         Reportes y graficos
│   ├── facturas.js         Facturacion
│   ├── usuarios.js         Usuarios
│   ├── vacunas.js          Vacunas + semaforo + WhatsApp (NUEVO)
│   └── auditoria.js        Log de acciones (registrarAuditoria global)
├── assets/
│   ├── logo.png
│   ├── logo.svg            Logo vectorial (NUEVO)
│   └── icons/              Iconos PWA / favicon / apple-touch (NUEVO)
├── firestore.rules        Reglas de seguridad de Firestore
├── storage.rules          Reglas de seguridad de Storage
├── netlify.toml           Configuracion de despliegue
├── .gitignore
└── README.md
```

---

## 🗂️ Colecciones en Firestore

| Coleccion            | Descripcion |
|----------------------|-------------|
| `users`              | Perfiles. Campos: `nombre`, `email`, `role` (admin/user), `active`, `lastLogin`, `createdAt`. |
| `mascotas`           | Mascotas. Incluye `fotoURL` (Firebase Storage), `propietarioId`. |
| `propietarios`       | Duenos: `nombre`, `telefono`, `email`, `direccion`, `dni`. |
| `consultas`          | Fichas clinicas: motivo, sintomas, diagnostico, tratamiento, medicamentos, `proximoControl`. |
| `cirugias`           | Cirugias: tipo, veterinario, horarios, anestesia, costo, estado, checklists. |
| `productos`          | Stock. Incluye `minimoStock` para alertas, `codigoBarras`, `fechaVencimiento`. |
| `movimientos_stock`  | Entradas/salidas con fecha y usuario. |
| `citas`              | Agenda: mascota, dueno, telefono, servicio, veterinario, fecha, estado. |
| `vacunas`            | NUEVO. `mascotaId`, `tipo`, `producto`, `lote`, `fecha`, `proximaDosis`. |
| `ventas`             | (Reservado para ventas directas). |
| `facturas`           | Facturas con numeracion automatica `FAC-0001`, items, IVA, total, estado. |
| `auditoria`          | Log de acciones. **Solo create**, nunca update/delete. |
| `config`             | `general`: `iva`, datos de la clinica (nombre, RUC, telefono, direccion), emails, plantilla. `contadores`: correlativo de facturas (lo gestiona la app). |
| `plantillas_whatsapp`| Documentos `recordatorio_cita`, `vacuna`, `control`. |

---

## 🚀 Guia de despliegue paso a paso

### 1. Crear proyecto en Firebase Console
1. Entra a <https://console.firebase.google.com> e inicia sesion con tu cuenta de Google.
2. Clic en **Agregar proyecto**, ponle un nombre (ej: `mascotita`) y acepta los pasos (puedes desactivar Google Analytics).

### 2. Habilitar Authentication (Email/Password)
1. En el menu lateral: **Compilacion → Authentication → Comenzar**.
2. Pestana **Sign-in method** → habilita **Correo electronico/contrasena** → Guardar.

### 3. Crear la base de datos Firestore
1. Menu: **Compilacion → Firestore Database → Crear base de datos**.
2. Elige **modo produccion** (las reglas las pondremos en el paso 7) y una region cercana.

### 4. Habilitar Firebase Storage
1. Menu: **Compilacion → Storage → Comenzar**.
2. Acepta las reglas por defecto (las reemplazaremos luego).

### 5. Obtener las claves de Firebase
1. Icono de engranaje (arriba a la izquierda) → **Configuracion del proyecto**.
2. Baja hasta **Tus apps** → clic en el icono **</>** (Web) → registra la app (sin hosting).
3. Copia el objeto `firebaseConfig` que te muestra (apiKey, authDomain, projectId, etc.).

### 6. Pegar las claves en `firebase-config.js`
1. Abre `js/firebase-config.js`.
2. Reemplaza los valores `TU_API_KEY`, `TU_PROYECTO`, etc. por los que copiaste.
3. (EmailJS se configura en el paso 8.)

### 7. Configurar las reglas de seguridad de Firestore y Storage
1. **Firestore → Reglas:** copia TODO el contenido de `firestore.rules` y pega → **Publicar**.
2. **Storage → Reglas:** copia TODO el contenido de `storage.rules` y pega → **Publicar**.

> Estas reglas garantizan que solo usuarios autenticados accedan, que el ADMIN
> pueda todo, que el USER tenga permisos limitados, que `auditoria` solo
> permita crear (no modificar/borrar) y que `config` solo la toque el ADMIN.

### 8. Crear cuenta en EmailJS y obtener las claves
1. Entra a <https://www.emailjs.com> y crea una cuenta gratuita.
2. **Email Services → Add New Service** (ej: Gmail). Copia el **Service ID**.
3. Copia tu **Public Key** desde **Account → General**.

### 9. Configurar la plantilla de email para alertas de stock
1. En EmailJS: **Email Templates → Create New Template**.
2. En el cuerpo del email usa las variables: `{{subject}}`, `{{message}}`, `{{to_email}}`.
3. Guarda y copia el **Template ID**.
4. Pega **Public Key**, **Service ID** y **Template ID** en el objeto `EMAILJS_CONFIG` de `js/firebase-config.js`.
5. En la app (menu **Configuracion**, como admin) define los **emails destinatarios** y la **plantilla de texto** de la alerta.

### 10. Crear repositorio en GitHub
1. Crea un repo nuevo en <https://github.com> (publico o privado).
2. Sube todos los archivos del proyecto. Desde tu PC, en la carpeta del proyecto:
   ```bash
   git init
   git add .
   git commit -m "Mascotita inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/mascotita.git
   git push -u origin main
   ```

### 11. Conectar GitHub con Netlify
1. Entra a <https://app.netlify.com> y crea una cuenta (puedes usar tu GitHub).
2. **Add new site → Import an existing project → GitHub** → autoriza y elige tu repo.

### 12. Desplegar la aplicacion
1. Netlify lee `netlify.toml` automaticamente (no hace falta comando de build).
2. Clic en **Deploy**. En unos segundos tendras una URL tipo `https://mascotita.netlify.app`.
3. Cada `git push` a `main` vuelve a desplegar solo.

> **Dominios autorizados:** en Firebase → Authentication → **Settings → Authorized domains**, agrega tu dominio de Netlify (ej: `mascotita.netlify.app`) para que el login funcione.

### 13. Crear el usuario Admin inicial
Tienes dos opciones:

**Opcion A (recomendada, con la pagina incluida):**
1. Abre en el navegador `https://TU-SITIO.netlify.app/crear-admin.html`.
2. Escribe el usuario (ej. `Admin`) y una contrasena propia (8+ caracteres) y pulsa **Crear administrador**.
   (En produccion `/tools/*` esta bloqueado por `netlify.toml`: usalo en local con
   `python3 -m http.server 8080` -> `http://localhost:8080/tools/crear-admin.html`, o quita la regla un momento.)
3. Se crea la cuenta en Authentication y su perfil con `role: admin` en Firestore.
4. **Importante:** luego borra la carpeta `tools/` del repo y vuelve a hacer push.

**Opcion B (manual):**
1. Firebase → Authentication → **Add user**: email `admin@mascotita.local` y una contrasena propia.
2. Copia el **UID** del usuario.
3. Firestore → coleccion `users` → crea un documento con **ID = ese UID** y campos:
   `nombre: "Administrador"`, `email: "admin@mascotita.local"`, `role: "admin"`, `active: true`.

Ya puedes entrar en `index.html` con tu usuario y contrasena.

### 14. Configurar WhatsApp (opcional)
No requiere WhatsApp Business API. La app usa enlaces `wa.me`:
- En **Configuracion** puedes editar las plantillas de mensaje (recordatorio de cita, vacuna, control).
- Los botones de WhatsApp abren el chat con el telefono del dueno y el texto prellenado.
- Los telefonos se normalizan a formato Paraguay (595) si vienen en formato local.

---

## ✨ Funcionalidades destacadas

- **Modo oscuro** con toggle y preferencia guardada en `localStorage`.
- **Busqueda global (Ctrl+K / Cmd+K)** en mascotas, duenos, productos, consultas y citas.
- **Escaner de codigo de barras** con la camara (movil y webcam) via html5-qrcode.
- **Fotos de mascotas** subidas a Firebase Storage con compresion previa en el navegador.
- **PDFs** de ficha quirurgica, receta/ficha clinica y factura con jsPDF.
- **Exportacion a Excel/CSV** de reportes y auditoria con SheetJS.
- **Alertas de stock bajo** (visuales + email por EmailJS) y de proximos a vencer.
- **Auditoria** de cada accion critica (no editable ni borrable por reglas).
- **Responsive** para movil, tablet y desktop.
- **PWA instalable**: en el celular, "Agregar a pantalla de inicio" y se usa como app.
- **Panel con avisos del dia**: citas de hoy, stock bajo, productos por vencer, vacunas vencidas, controles.
- **Vacunas**: carnet con semaforo y recordatorio por WhatsApp.
- **Stock seguro**: movimientos con transaccion (sin descuadres entre empleados).
- **Facturas** con numeracion atomica, buscador, estados y totales cobrado/por cobrar.

---

## 🧪 Probar en local

Como todo es estatico, basta un servidor estatico simple (la camara y Storage
requieren `http://localhost`, no `file://`):

```bash
# Con Python
python3 -m http.server 8080
# o con Node
npx serve .
```
Luego abre <http://localhost:8080>.

---

## 🔒 Seguridad

- La seguridad real se aplica en **las reglas de Firestore y Storage**, no solo
  en el frontend. Aunque alguien manipule el navegador, no podra saltarse los
  permisos definidos en `firestore.rules`.
- Las claves de Firebase en `firebase-config.js` son publicas por diseno (van
  en el cliente). Lo que protege tus datos son las reglas de seguridad.
- Borra la carpeta `tools/` despues de crear el administrador.
- Cierre de sesion automatico tras 30 min de inactividad (`MINUTOS_INACTIVIDAD` en `main.js`).
- Cabeceras de seguridad (HSTS, anti-iframe, etc.) en `netlify.toml`.
- Borrar fichas clinicas queda reservado al ADMIN (reglas de Firestore).
- **Recomendado:** en Firebase Console activa **App Check** y restringe la API key a tu dominio (Google Cloud -> Credenciales).

---

## 📄 Licencia

MIT. Uso libre para tu veterinaria.
