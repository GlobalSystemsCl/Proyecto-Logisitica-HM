-- =============================================================================
-- Rollback de 20261103120000_documentos_excel_pdf_imagenes.sql
-- =============================================================================
-- Vuelve a la lista anterior del bucket (con Word, PowerPoint, texto, CSV y
-- ZIP; sin .xls). Desplegar antes el código anterior de src/lib/archivos.ts.
-- =============================================================================

begin;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip'
]
where id = 'solicitud-documentos';

commit;
