import {describe,it,expect,vi} from 'vitest';
import {BanecoError,bankAmount,bankTransport,createBanecoClient,qrImageDataUrl,readCredentials,verifyBankStatus} from '../supabase/functions/bank-qr/baneco';
const credentials=readCredentials({userName:'usuario',password:'clave & +',aesKey:'aes / +',accountCredit:'cuenta & +',encryptionMode:'bank_api'});
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const input={transactionId:'MC-TEST',amount:350.25,currency:'BOB' as const,dueDate:'2099-12-31',description:'Cuotas MiCole',branchCode:'A1'};
const expected={qrId:'QR-123',amount:350.25,currency:'BOB',branchCode:'A1',dueDate:'2099-12-31'};
const payment={qrId:'QR-123',amount:'350.25',currency:'BOB',branchCode:'A1',transactionId:'BANCO-789',paymentDate:'2026-10-17',paymentTime:'10:32:05'};
describe('contrato QR Simple Baneco',()=>{
 it('cifra contraseña y cuenta en el entorno correcto, fija el importe y un solo uso',async()=>{
  const calls:any[]=[];
  const transport=vi.fn(async(url:URL,method:string,token?:string,body?:unknown)=>{calls.push({url,method,token,body});if(url.pathname.endsWith('/encrypt'))return 'Y2lmcmFkbw==';if(url.pathname.endsWith('/authenticate'))return {responseCode:0,token:'token-servidor'};return {responseCode:0,qrId:'QR-123',qrImage:image};});
  const result=await createBanecoClient('production',credentials,transport).generate(input);
  expect(result).toEqual({qrId:'QR-123',image:`data:image/png;base64,${image}`});
  expect(calls.every(c=>c.url.origin==='https://apimkt.baneco.com.bo')).toBe(true);
  expect(calls[0].url.searchParams.get('text')).toBe(credentials.password);expect(calls[0].url.searchParams.get('aesKey')).toBe(credentials.aesKey);
  expect(calls[1].body).toEqual({userName:'usuario',password:'Y2lmcmFkbw=='});
  expect(calls[2].url.searchParams.get('text')).toBe(credentials.accountCredit);
  expect(calls[3]).toMatchObject({method:'POST',token:'token-servidor',body:{...input,accountCredit:'Y2lmcmFkbw==',singleUse:true,modifyAmount:false}});
 });
 it('permite credenciales entregadas ya cifradas sin enviarlas al endpoint de cifrado',async()=>{
  const transport=vi.fn(async(url:URL)=>url.pathname.endsWith('authenticate')?{responseCode:0,token:'t'}:{responseCode:0,qrId:'QR-123',qrImage:image});
  await createBanecoClient('certification',{...credentials,password:'YQ==',accountCredit:'Yg==',encryptionMode:'pre_encrypted'},transport).generate(input);
  expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls[0][0].hostname).toBe('apimktdesa.baneco.com.bo');
 });
 it('no envía la generación si falla la autenticación y oculta el detalle privado del banco',async()=>{
  const transport=vi.fn(async(url:URL)=>url.pathname.endsWith('encrypt')?'YQ==':{responseCode:99,description:'dato privado'});
  await expect(createBanecoClient('production',credentials,transport).generate(input)).rejects.toMatchObject({code:'bank-rejected',stage:'authentication'});
  expect(transport).toHaveBeenCalledTimes(2);
 });
 it('conserva el ID de un QR emitido cuando la imagen recibida es inválida',async()=>{
  const transport=vi.fn(async(url:URL)=>url.pathname.endsWith('encrypt')?'YQ==':url.pathname.endsWith('authenticate')?{responseCode:0,token:'t'}:{responseCode:0,qrId:'QR-123',qrImage:'bm8gZXMgaW1hZ2Vu'});
  await expect(createBanecoClient('production',credentials,transport).generate(input)).rejects.toMatchObject({code:'bank-invalid-qr-image',stage:'generation',qrId:'QR-123'});
 });
 it('un timeout al generar no se reintenta automáticamente',async()=>{
  const transport=vi.fn(async(url:URL)=>{if(url.pathname.endsWith('encrypt'))return 'YQ==';if(url.pathname.endsWith('authenticate'))return {responseCode:0,token:'t'};throw new BanecoError('bank-timeout');});
  await expect(createBanecoClient('production',credentials,transport).generate(input)).rejects.toMatchObject({code:'bank-timeout',stage:'generation'});expect(transport).toHaveBeenCalledTimes(4);
 });
 it('consulta y cancela por los endpoints reales sin aceptar IDs arbitrarios',async()=>{
  const transport=vi.fn(async(url:URL)=>url.pathname.endsWith('encrypt')?'YQ==':url.pathname.endsWith('authenticate')?{responseCode:0,token:'t'}:{responseCode:0,statusQRCode:9});
  const bank=createBanecoClient('production',credentials,transport);await bank.status('QR-123');await bank.cancel('QR-123');
  expect(transport.mock.calls.map(c=>c[0].pathname)).toContain('/ApiGateway/api/qrsimple/v2/statusQR/QR-123');
  await expect(bank.status('../otra')).rejects.toMatchObject({code:'bank-invalid-qr-id'});
 });
 it('rechaza servidores no bancarios antes de abrir una conexión',async()=>{
  await expect(bankTransport(new URL('https://example.invalid/ApiGateway/'),'GET')).rejects.toMatchObject({code:'bank-invalid-host'});
  expect(()=>createBanecoClient('otra' as any,credentials)).toThrow('bank-invalid-host');
 });
 it('valida importes con dos decimales y rechaza imágenes que no son PNG o JPEG',()=>{
  expect(bankAmount('50000.00')).toBe(50000);for(const value of [0,-1,50000.01,'1.999','1e2',NaN])expect(()=>bankAmount(value)).toThrow();expect(()=>qrImageDataUrl('PHN2Zz4=')).toThrow();
 });
 it('confirma solo un pago con ID, importe, moneda y sucursal coincidentes',()=>{
  expect(verifyBankStatus({statusQRCode:1,payment:[payment]},expected)).toBe('paid');
  for(const change of [{amount:'350.24'},{qrId:'QR-OTRO'},{currency:'USD'},{branchCode:'B2'},{transactionId:''},{paymentTime:'25:32:05'},{paymentDate:'2026-02-31'}])expect(verifyBankStatus({statusQrCode:1,payment:{...payment,...change}},expected)).toBe('review');
  expect(verifyBankStatus({statusQrCode:1,payment:[payment,payment]},expected)).toBe('review');
  expect(verifyBankStatus({statusQrCode:1,payment:[]},expected)).toBe('review');
 });
 it('distingue pendiente, cancelado y vencido sin confundirlos con un pago',()=>{
  expect(verifyBankStatus({statusQrCode:0},expected)).toBe('pending');expect(verifyBankStatus({statusQrCode:9},expected)).toBe('cancelled');expect(verifyBankStatus({statusQrCode:0},{...expected,dueDate:'2000-01-01'})).toBe('expired');expect(verifyBankStatus({statusQrCode:5},expected)).toBe('review');
 });
});
