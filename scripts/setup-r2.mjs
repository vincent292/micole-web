import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
for (const file of ['.env', '.env.local', '.env.r2.local']) if (fs.existsSync(file)) process.loadEnvFile(file);
const names = ['APP_ORIGIN', 'APP_ORIGINS', 'R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

// AWS Signature V4 for the isolated setup check. No application data is used.
async function objectRequest(method, key, body = '') {
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const uri = `/${process.env.R2_BUCKET}/${key}`;
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.slice(0, 8), payloadHash = hash(body);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  const canonical = [method, uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/auto/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, date), 'auto'), 's3'), 'aws4_request');
  const signature = hmac(signingKey, `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).toString('hex');
  return fetch(`https://${host}${uri}`, {
    method,
    headers: {
      'x-amz-date': timestamp, 'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    ...(method === 'PUT' ? { body } : {}), signal: AbortSignal.timeout(20000),
  });
}

async function verifyStorage() {
  const key = `setup-checks/${randomUUID()}.txt`, content = 'MiCole R2 connection check';
  let uploaded = false;
  try {
    const put = await objectRequest('PUT', key, content);
    if (!put.ok) throw new Error(`R2 rechazó la prueba de escritura (${put.status}).`);
    uploaded = true;
    const head = await objectRequest('HEAD', key);
    if (!head.ok || Number(head.headers.get('content-length')) !== Buffer.byteLength(content)) throw new Error('R2 no confirmó el tamaño del archivo de prueba.');
    const get = await objectRequest('GET', key);
    if (!get.ok || await get.text() !== content) throw new Error('R2 no devolvió el archivo de prueba.');
    for (const origin of process.env.APP_ORIGINS.split(',')) {
      const response = await fetch(`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key}`, {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(20000),
      });
      if (!response.ok || response.headers.get('access-control-allow-origin') !== origin) throw new Error(`Revisa CORS para ${origin}.`);
    }
  } finally {
    if (uploaded) {
      const deleted = await objectRequest('DELETE', key);
      if (!deleted.ok) throw new Error(`No se pudo retirar el archivo de prueba ${key}.`);
    }
  }
}

async function cli(args) {
  await new Promise((resolve, reject) => {
    const binary = process.env.MICOLE_SUPABASE_CLI;
    const child = spawn(binary || 'npx', [...(binary ? [] : ['--yes', 'supabase']), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    // Output can contain credentials; report only the command and exit status.
    child.stderr.resume();
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Supabase ${args[0]} agotó el tiempo.`)); }, 120000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('No se pudo ejecutar la CLI de Supabase.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Supabase ${args[0]} terminó con código ${code}. Revisa la sesión de la CLI.`)); });
  });
}

let temporary;
try {
  for (const name of names) if (!process.env[name]?.trim()) throw new Error(`Falta ${name} en .env.r2.local.`);
  for (const name of names) if (/[\r\n]/.test(process.env[name])) throw new Error(`Valor inválido para ${name}.`);
  if (!/^[a-f0-9]{32}$/.test(process.env.R2_ACCOUNT_ID) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(process.env.R2_BUCKET)) throw new Error('Cuenta o bucket R2 inválido.');
  const origins = process.env.APP_ORIGINS.split(',').map(value => value.trim());
  for (const origin of origins) if (new URL(origin).origin !== origin || !(origin.startsWith('https://') || /^http:\/\/localhost:\d+$/.test(origin))) throw new Error('Usa orígenes HTTPS exactos o localhost con puerto.');
  process.env.APP_ORIGINS = origins.join(',');
  if (!origins.includes(process.env.APP_ORIGIN)) throw new Error('APP_ORIGIN debe estar incluido en APP_ORIGINS.');
  const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  if (new URL(process.env.VITE_SUPABASE_URL).hostname !== `${ref}.supabase.co`) throw new Error('El proyecto enlazado no coincide con el entorno web.');
  await verifyStorage();
  console.log('R2: escritura, lectura, tamaño, CORS y limpieza verificados.');
  if (process.argv.includes('--apply')) {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'micole-r2-'));
    fs.chmodSync(temporary, 0o700);
    const envFile = path.join(temporary, 'server.env');
    fs.writeFileSync(envFile, names.map(name => `${name}=${process.env[name]}`).join('\n') + '\n', { mode: 0o600 });
    await cli(['secrets', 'set', '--env-file', envFile, '--project-ref', ref]);
    await cli(['functions', 'deploy', 'r2-media', '--project-ref', ref, '--use-api', '--no-verify-jwt', '--yes']);
    const endpoint = `https://${ref}.supabase.co/functions/v1/r2-media`;
    for (const origin of origins) {
      const response = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: origin }, signal: AbortSignal.timeout(20000) });
      if (response.status !== 204 || response.headers.get('access-control-allow-origin') !== origin) throw new Error('La función desplegada no confirmó los orígenes web.');
    }
    const denied = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000) });
    if (denied.status !== 401) throw new Error('La función debe exigir una sesión válida en Android.');
    const foreign = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://example.org' }, signal: AbortSignal.timeout(20000) });
    if (foreign.status !== 403) throw new Error('La función debe rechazar orígenes ajenos.');
    console.log('Supabase: secretos guardados, r2-media desplegada, CORS y sesión obligatoria verificados.');
  } else console.log('Verificación completada. Usa --apply para guardar secretos y desplegar r2-media.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo configurar R2.');
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
