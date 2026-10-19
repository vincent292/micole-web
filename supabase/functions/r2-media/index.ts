import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { imageSignatureMatches } from './pickup-image.ts';
import { r2OriginHeaders } from './origins.ts';
// Secrets: APP_ORIGIN, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// JWT se verifica con getUser: compatible con claves públicas y claves JWT asimétricas.
Deno.serve(async (req: Request) => {
  const headers = r2OriginHeaders(req.headers.get('origin'), Deno.env.get('APP_ORIGINS') || Deno.env.get('APP_ORIGIN') || '');
  const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: headers || { 'Content-Type': 'application/json' } });
  if (!headers) return reply({ error: 'Origen no autorizado.' }, 403);
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
    if (body.action === 'pickup_download') {
      const {data:permitted}=await db.rpc('may_read_pickup_identity',{p_file_id:body.assetId});
      if(permitted!==true)return reply({error:'No tienes acceso al carnet de esta autorización.'},403);
      const {data:asset,error}=await db.from('pickup_identity_files').select('object_key,mime_type').eq('id',body.assetId).eq('status','ready').single();
      if(error||!asset)return reply({error:'El carnet no está disponible.'},403);
      const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:asset.object_key,ResponseContentType:asset.mime_type,ResponseContentDisposition:'inline'}),{expiresIn:300});return reply({url});
    }
    if(body.action==='pickup_upload') {
      const {data:asset,error}=await db.rpc('reserve_pickup_identity',{p_request_id:body.requestId,p_student_id:body.studentId,p_file_name:body.fileName,p_mime_type:body.mimeType,p_size:body.size});
      if(error||!asset)return reply({error:error?.message||'No puedes adjuntar este carnet.'},403);
      const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:asset.objectKey,ContentType:body.mimeType,ContentLength:body.size}),{expiresIn:120});return reply({...asset,url});
    }
    if(body.action==='pickup_finalize') {
      const {data:asset,error}=await db.rpc('pickup_identity_for_upload',{p_id:body.assetId});
      if(error||!asset)return reply({error:error?.message||'Esta carga no está autorizada.'},403);
      const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:asset.staging_key}));
      if(head.ContentLength!==asset.size_bytes||head.ContentType!==asset.mime_type)return reply({error:'La foto no coincide con la carga autorizada.'},400);
      const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:asset.staging_key,IfMatch:head.ETag}));
      const bytes=await object.Body!.transformToByteArray();
      if(bytes.length!==asset.size_bytes||!imageSignatureMatches(bytes,asset.mime_type))return reply({error:'Adjunta una imagen válida del carnet, en JPG, PNG o WebP.'},400);
      const ext=asset.mime_type==='image/jpeg'?'jpg':asset.mime_type==='image/png'?'png':'webp';
      // A fresh final key cannot be overwritten using the earlier signed upload URL.
      const finalKey=`${asset.school_id}/pickups/${asset.request_id}/${asset.id}/${crypto.randomUUID()}.${ext}`;
      await s3.send(new PutObjectCommand({Bucket:bucket,Key:finalKey,Body:bytes,ContentType:asset.mime_type}));
      const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:finished,error:finishError}=await server.rpc('finish_pickup_identity',{p_id:asset.id,p_size:bytes.length,p_mime_type:asset.mime_type,p_object_key:finalKey});
      if(finishError)return reply({error:'No se pudo confirmar la foto. Revisa la autorización antes de volver a intentar.'},400);
      if(finished!==true){await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:finalKey}));return reply({error:'Esta carga ya fue confirmada o venció.'},400);}
      await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:asset.staging_key})).catch(()=>{});
      return reply({id:asset.id});
    }
    if (body.action === 'assignment_download') {
      const {data:asset,error}=await db.from('assignment_files').select('object_key,file_name').eq('id',body.assetId).eq('status','ready').single();
      if(error||!asset)return reply({error:'No tienes acceso a este archivo de tarea.'},403);
      const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:asset.object_key,ResponseContentDisposition:`attachment; filename*=UTF-8''${encodeURIComponent(asset.file_name)}`}),{expiresIn:300});return reply({url});
    }
    if(body.action === 'assignment_upload'){
      const {data:asset,error}=await db.rpc('reserve_assignment_file',{p_submission_id:body.submissionId,p_file_name:body.fileName,p_mime_type:body.mimeType,p_size:body.size});
      if(error||!asset)return reply({error:error?.message||'No puedes adjuntar archivos a esta entrega.'},403);
      const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:asset.objectKey,ContentType:body.mimeType,ContentLength:body.size}),{expiresIn:120});return reply({...asset,url});
    }
    if(body.action === 'assignment_finalize'){
      const {data:asset,error}=await db.rpc('assignment_file_for_upload',{p_id:body.assetId});if(error||!asset)return reply({error:error?.message||'Esta carga no está autorizada.'},403);
      const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:asset.object_key}));
      if(head.ContentLength!==asset.size_bytes||head.ContentType!==asset.mime_type){await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:asset.object_key}));return reply({error:'El archivo no coincide con la carga autorizada.'},400);}
      const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {error:finishError}=await server.rpc('finish_assignment_file',{p_id:asset.id,p_size:head.ContentLength,p_mime_type:head.ContentType});if(finishError)return reply({error:'No se pudo confirmar el archivo; verifica el plazo de la tarea.'},400);
      return reply({id:asset.id});
    }
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
  } catch (e) { console.error('r2-media', e instanceof Error ? e.name : 'unknown'); return reply({ error: e instanceof Error ? e.message : 'No se pudo procesar la imagen.' }, 400); }
});
