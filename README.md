# Salvación

Aplicación utilitaria de dos pestañas para guardar textos completos y recuperarlos mediante contraseña.

## Cómo funciona

- Cada guardado se conserva como un JSON independiente e inmutable en Vercel Blob.
- Las cargas usan URLs presignadas y se hacen directamente desde el navegador, por lo que admiten textos muy grandes sin pasar por el límite de 4.5 MB de una Vercel Function.
- El almacén debe ser **Private**. Los archivos no tienen lectura pública.
- La recuperación exige `APP_PASSWORD`, crea una sesión temporal y entrega enlaces firmados de corta duración.
- La interfaz recorre automáticamente todas las páginas del almacén y recupera todos los elementos.

## Configuración en Vercel

1. Abre el proyecto en Vercel.
2. En **Storage**, crea una base de datos **Blob** con acceso **Private**.
3. Conecta el Blob store al proyecto y a los entornos Production, Preview y Development.
4. Conserva la variable existente `APP_PASSWORD` con la contraseña de recuperación.
5. Vuelve a desplegar el proyecto.

Al conectar el almacén, Vercel agrega automáticamente `BLOB_STORE_ID` y `BLOB_WEBHOOK_PUBLIC_KEY`, y entrega credenciales OIDC rotativas al entorno de ejecución. La aplicación acepta el token desde el contexto de cada petición, tal como lo proporciona Vercel.

## Desarrollo

```bash
npm install
npm run check
```

El frontend se escribe en `src/app.js` y se compila a `public/app.js`.
