# Brecha 023 — Validación de archivos subidos basada en el MIME declarado por el cliente

## Estado
Pendiente

## Severidad
Low

## Categoría
Security — Upload validation

## Descripción
`subirDocumentosSolicitudAction` toma `File.type` (declarado por el navegador o por el atacante) y `SolicitudesService.subirDocumentos` lo compara con la lista blanca `MIMES_DOCUMENTOS`. El archivo se guarda con ese `contentType`. No se verifica el contenido real (magic bytes) ni la extensión. La lista admite `application/zip`, `text/plain` y `text/csv`. No hay antivirus. El nombre se sanea para la ruta (`[\\/:*?"<>|]` → `_`), pero el nombre original se guarda en `solicitud_documento.nombre_archivo` (se muestra escapado por React).

Mitigantes: el bucket es privado, la descarga es por URL firmada de 5 minutos, el `contentType` siempre es uno de la lista blanca (no `text/html`) y el límite es 10 MB (también en el bucket).

## Evidencia
- `src/app/actions/solicitudes.actions.ts` ~768-792.
- `src/services/solicitudes.service.ts` ~55-70 (`MIMES_DOCUMENTOS`), ~1251-1312.
- `storage.buckets`: `solicitud-documentos`, `public=false`, `file_size_limit=10485760`, `allowed_mime_types` (10 tipos).

## Impacto
Bajo: distribución de archivos maliciosos (por ejemplo, un ejecutable dentro de un zip o un PDF con payload) entre empleados que los descargan. Combinado con la brecha 006, cualquier usuario podría adjuntarlos a cualquier solicitud.

## Cómo reproducirlo
Subir un `.exe` renombrado con `type = application/pdf` (No ejecutado).

## Causa raíz
Confianza en metadatos del cliente.

## Solución propuesta
1. Verificar magic bytes en el servidor (por ejemplo, con la librería `file-type`) y que coincidan con el MIME declarado y con la extensión.
2. Valorar retirar `application/zip` si no es imprescindible.
3. Forzar `Content-Disposition: attachment` en la descarga (opción `download` de `createSignedUrl`).
4. Opcional: escaneo antivirus asíncrono.

## Riesgos de la solución
- Falsos rechazos de archivos Office antiguos. Probar con documentos reales.

## Tests necesarios
- Archivo con MIME falso → rechazado.
- PDF real → aceptado.

## Plan de implementación
Validación de contenido en `subirDocumentos` + test + cambio de la descarga.

## Criterios de aceptación
- Solo se almacenan archivos cuyo contenido coincide con un tipo permitido.
