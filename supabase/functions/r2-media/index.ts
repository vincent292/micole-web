import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
// Secrets: APP_ORIGIN, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// JWT se verifica con getUser: compatible con claves públicas y claves JWT asimétricas.
Deno.serve(async (req: Request) => {
  const origin = Deno.env.get('APP_ORIGIN');
  const headers = { 'Access-Control-Allow-Origin': origin || '', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-micole-support', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });
  // Android sends an explicit bearer token and no browser Origin. JWT and RLS below remain mandatory.
  const requestOrigin = req.headers.get('origin');
  if (!origin || (requestOrigin !== null && requestOrigin !== origin)) return reply({ error: 'Origen no autorizado.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return reply({ error: 'Sesión requerida.' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader, ...(req.headers.get('x-micole-support') ? { 'x-micole-support': req.headers.get('x-micole-support')! } : {}) } } });
    const { data: { user }, error: authError } = await db.auth.getUser(authHeader.slice(7));
    if (authError || !user) return reply({ error: 'Sesión inválida.' }, 401);
    const { data: identity, error: identityError } = await db.rpc('workspace_identity');
    if (identityError || !identity?.id) return reply({ error: 'El acceso al colegio ya no está disponible.' }, 403);
    const actorId = identity.id;
    const body = await req.json();
    const account = Deno.env.get('R2_ACCOUNT_ID'), bucket = Deno.env.get('R2_BUCKET');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID'), secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    if (!account || !bucket || !accessKeyId || !secretAccessKey) throw new Error('Cloudflare R2 todavía no está configurado.');
    const s3 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED' });
    const isDocument = String(body.action).startsWith('document_');
    if (body.action === 'download' || body.action === 'document_download') {
      const { data: asset, error } = await db.from(isDocument ? 'student_documents' : 'media_assets').select('object_key').eq('id', body.assetId).single();
      if (error || !asset) return reply({ error: 'No tienes acceso a esta imagen.' }, 403);
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: asset.object_key }), { expiresIn: 300 });
      return reply({ url });
    }
    if (!['upload', 'finalize', 'document_upload', 'document_finalize'].includes(body.action)) return reply({ error: 'Acción inválida.' }, 400);
    const { data: student, error: studentError } = await db.from('students').select('id,school_id').eq('id', body.studentId).eq('school_id', body.schoolId).single();
    const { data: permitted } = await db.rpc(isDocument ? 'may_manage_student' : 'may_use_student', { p_student_id: body.studentId });
    if (studentError || !student || permitted !== true) return reply({ error: 'No tienes acceso a este estudiante.' }, 403);
    const prefix = `${student.school_id}/${student.id}/${isDocument ? 'documents/' : ''}${actorId}/`;
    const validTypes = isDocument ? ['application/pdf','image/jpeg','image/png','image/webp'] : ['image/jpeg','image/png','image/webp'];
    if (isDocument && (!['ci','birth_certificate','insurance','other'].includes(body.category) || typeof body.fileName !== 'string' || !body.fileName.trim() || body.fileName.length > 180)) return reply({ error: 'Indica tipo y nombre de documento.' }, 400);
    if (body.action === 'upload' || body.action === 'document_upload') {
      if (!validTypes.includes(body.mimeType) || !Number.isInteger(body.size) || body.size <= 0 || body.size > 5 * 1024 * 1024) return reply({ error: isDocument ? 'Usa PDF, JPG, PNG o WebP de hasta 5 MB.' : 'Usa JPG, PNG o WebP de hasta 5 MB.' }, 400);
      const ext = body.mimeType === 'application/pdf' ? 'pdf' : body.mimeType === 'image/jpeg' ? 'jpg' : body.mimeType === 'image/png' ? 'png' : 'webp';
      const objectKey = `${prefix}${crypto.randomUUID()}.${ext}`;
      const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: body.mimeType }), { expiresIn: 120 });
      return reply({ url, objectKey });
    }
    const key = String(body.objectKey || '');
    if (!key.startsWith(prefix) || !/^[-a-z0-9]+\.(jpg|png|webp|pdf)$/.test(key.slice(prefix.length))) return reply({ error: 'Objeto no autorizado.' }, 403);
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (!head.ContentLength || head.ContentLength > 5 * 1024 * 1024 || !validTypes.includes(head.ContentType || '')) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return reply({ error: 'La imagen no cumple el límite o el formato permitido.' }, 400);
    }
    const { data: existing } = await db.from(isDocument ? 'student_documents' : 'media_assets').select('id').eq('object_key', key).maybeSingle();
    if (existing) return reply({ id: existing.id });
    if (isDocument) {
      const { data: doc, error } = await db.from('student_documents').insert({ school_id: student.school_id, student_id: student.id, category: body.category, file_name: String(body.fileName).trim(), object_key: key, mime_type: head.ContentType, size_bytes: head.ContentLength, uploaded_by: actorId }).select('id').single();
      if (error) throw error;
      return reply({ id: doc.id });
    }
    const { data: asset, error } = await db.from('media_assets').insert({ school_id: student.school_id, student_id: student.id, object_key: key, bucket: 'aulanexo-private', mime_type: head.ContentType, caption: String(body.caption || '').trim().slice(0, 300), uploaded_by: actorId }).select('id').single();
    if (error) throw error;
    return reply({ id: asset.id });
  } catch (e) { console.error('r2-media', e); return reply({ error: e instanceof Error ? e.message : 'No se pudo procesar la imagen.' }, 400); }
});
