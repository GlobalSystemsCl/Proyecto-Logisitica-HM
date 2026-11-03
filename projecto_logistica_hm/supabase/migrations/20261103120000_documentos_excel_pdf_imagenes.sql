-- =============================================================================
-- Documentos de solicitud: solo PDF, Excel e imágenes (R11, 2026-11-03)
-- =============================================================================
-- Decisión del cliente: se suben Excel, PDF e imágenes (HEIC no). La app ya
-- valida el tipo, la extensión y la firma del archivo (src/lib/archivos.ts);
-- el bucket repite la lista como segunda barrera.
--
-- Qué hace: deja en allowed_mime_types del bucket solicitud-documentos
-- PDF, PNG, JPEG, WEBP, Excel .xlsx y Excel 97-2003 .xls (este último no
-- estaba). Quita Word, PowerPoint, texto, CSV y ZIP. Los archivos ya subidos
-- no se tocan. El límite de 10 MB no cambia.
--
-- Si el código se despliega antes, todo funciona salvo subir .xls (el bucket
-- lo rechaza hasta aplicar esta migración).
--
-- Rollback: supabase/rollback/20261103120000_documentos_excel_pdf_imagenes.sql
-- =============================================================================

begin;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
where id = 'solicitud-documentos';

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select allowed_mime_types, file_size_limit from storage.buckets
-- where id = 'solicitud-documentos';   -- 6 tipos, 10485760
