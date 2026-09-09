-- Migracion: Documentos adjuntos de solicitudes
-- Fecha: 2026-09-09
-- Descripcion: Crea el bucket privado de almacenamiento y la tabla solicitud_documento
-- para poder subir/consultar/eliminar documentacion de una solicitud en cualquier estado.
-- El acceso al bucket y a la tabla se realiza siempre con el cliente service-role
-- (createAdminClient); por eso la tabla habilita RLS sin politicas.

-- 1. Bucket privado (10 MB por archivo, tipos permitidos en el codigo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'solicitud-documentos',
  'solicitud-documentos',
  false,
  10485760,
  ARRAY[
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
)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabla de documentos por solicitud
CREATE TABLE public.solicitud_documento (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    solicitud_id uuid NOT NULL,
    nombre_archivo text NOT NULL,
    tipo_mime text NOT NULL,
    tamano_bytes bigint NOT NULL,
    ruta_storage text NOT NULL,
    subido_por uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT solicitud_documento_pkey PRIMARY KEY (id),
    CONSTRAINT solicitud_documento_ruta_storage_key UNIQUE (ruta_storage),
    CONSTRAINT solicitud_documento_solicitud_fk FOREIGN KEY (solicitud_id) REFERENCES public.solicitud(id) ON DELETE CASCADE,
    CONSTRAINT solicitud_documento_subido_por_fk FOREIGN KEY (subido_por) REFERENCES public.usuario(id)
);

CREATE INDEX idx_solicitud_documento_solicitud_id
  ON public.solicitud_documento USING btree (solicitud_id);

ALTER TABLE public.solicitud_documento ENABLE ROW LEVEL SECURITY;