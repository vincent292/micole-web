import {useEffect,useState} from 'react';
import {LockKeyhole} from 'lucide-react';
import {Button,Field,SectionTitle,Badge} from '../components/UI';
import {rpc} from '../lib/repository';
import {liveMode} from '../lib/supabase';
import {bankAction,type BankConnection} from '../lib/bank';
const empty:BankConnection={provider:'Baneco',accountReference:'Cuenta principal',environment:'test',credentialsStored:false,integrationReady:false};
export function PaymentConnection({schoolId}:{schoolId?:string}){
 const [value,setValue]=useState(empty),[loading,setLoading]=useState(liveMode),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [userName,setUserName]=useState(''),[password,setPassword]=useState(''),[aesKey,setAesKey]=useState(''),[accountCredit,setAccountCredit]=useState(''),[mode,setMode]=useState('bank_api');
 const reload=()=>rpc<BankConnection>('payment_connection_status',{p_school_id:schoolId||null}).then(data=>setValue({...empty,...data,accountReference:data.accountReference||empty.accountReference}));
 useEffect(()=>{let active=true;if(!liveMode)return;void rpc<BankConnection>('payment_connection_status',{p_school_id:schoolId||null}).then(data=>{if(active)setValue({...empty,...data,accountReference:data.accountReference||empty.accountReference});}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[schoolId]);
 async function operate(action:'check'|'enable'|'disable'){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{if(action==='check')await bankAction({action:'check_connection',schoolId});else await rpc('set_baneco_enabled',{p_school_id:schoolId||null,p_enabled:action==='enable'});await reload();setNotice(action==='check'?'Baneco aceptó la autenticación. Ya puedes habilitar los cobros.':action==='enable'?'Cobros QR habilitados para esta cuenta.':'Nuevos QR deshabilitados. Los pagos anteriores conservan su verificación.');}
  catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar la cuenta.');await reload().catch(()=>{});}finally{setBusy(false);}
 }
 return <section className="panel payment-connection"><SectionTitle title={schoolId?'Cuenta Baneco de la institución':'Cuenta Baneco de MiCole'} subtitle={schoolId?'Las mensualidades y actividades se cobran en esta cuenta.':'Las activaciones y licencias de MiCole se cobran en tu cuenta.'}/>
  <p className="soft-note"><LockKeyhole size={18}/> Credenciales cifradas en el servidor. No se vuelven a mostrar ni se entregan a las familias.</p>
  {error&&<p className="message error" role="alert">{error}</p>}{notice&&<p className="message info" role="status">{notice}</p>}
  {loading?<p>Cargando conexión…</p>:<>
   <Badge status={value.integrationReady?'active':'pending'} label={value.integrationReady?'QR habilitados':value.checkResult==='ok'?'Acceso comprobado':'Pendiente de configurar o comprobar'}/>
   {value.id&&<div className="bank-connection-actions"><Button variant="secondary" disabled={busy} onClick={()=>void operate('check')}>Comprobar conexión</Button><Button variant="secondary" disabled={busy||value.checkResult!=='ok'} onClick={()=>void operate(value.enabled?'disable':'enable')}>{value.enabled?'Deshabilitar nuevos QR':'Habilitar cobros QR'}</Button></div>}
   <form onSubmit={async e=>{e.preventDefault();if(busy||!liveMode)return;setBusy(true);setError('');setNotice('');try{
    const provided=[userName,password,aesKey,accountCredit].some(Boolean);await rpc('save_baneco_connection',{p_school_id:schoolId||null,p_label:value.accountReference,p_environment:value.environment,p_branch_code:value.branchCode||'',p_credentials:provided?{userName:userName.trim(),password,aesKey,accountCredit,encryptionMode:mode}:null});setUserName('');setPassword('');setAesKey('');setAccountCredit('');await reload();setNotice('Conexión guardada de forma cifrada. Comprueba el acceso y habilita los cobros.');
   }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la conexión.');}finally{setBusy(false);}}}>
    <fieldset disabled={busy||!liveMode}><div className="form-grid">
     <Field label="Nombre de la conexión" name="bankLabel"><input required maxLength={100} value={value.accountReference} onChange={e=>setValue({...value,accountReference:e.target.value})}/></Field>
     <Field label="Ambiente Baneco" name="bankEnvironment"><select value={value.environment} onChange={e=>setValue({...value,environment:e.target.value})}><option value="test">Certificación · pruebas</option><option value="production">Producción · cobros reales</option></select></Field>
    </div>
    <Field label="Formato entregado por Baneco" name="encryptionMode"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="bank_api">Cifrar mediante Baneco</option><option value="pre_encrypted">Contraseña y cuenta ya cifradas</option></select></Field>
    <div className="form-grid">
     <Field label="Usuario Baneco" name="bankUser"><input autoComplete="off" maxLength={120} value={userName} onChange={e=>setUserName(e.target.value)}/></Field>
     <Field label="Contraseña Baneco" name="bankPassword"><input type="password" autoComplete="new-password" maxLength={512} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
     <Field label="Llave de cifrado Baneco" name="bankAesKey"><input type="password" autoComplete="new-password" maxLength={256} value={aesKey} onChange={e=>setAesKey(e.target.value)}/></Field>
     <Field label="Cuenta de abono autorizada" name="bankAccount"><input type="password" autoComplete="new-password" maxLength={512} value={accountCredit} onChange={e=>setAccountCredit(e.target.value)}/></Field>
     <Field label="Código de sucursal Baneco (opcional)" name="bankBranch"><input maxLength={5} pattern="[A-Za-z0-9]*" value={value.branchCode||''} onChange={e=>setValue({...value,branchCode:e.target.value})}/></Field>
    </div>
    {value.id&&<p className="muted">Deja todas las credenciales vacías para conservarlas. Para sustituirlas, completa el conjunto entregado por el banco.</p>}
    <p className="muted">API oficial: {value.environment==='production'?'https://apimkt.baneco.com.bo/ApiGateway/':'https://apimktdesa.baneco.com.bo/ApiGateway/'}</p>
    <Button type="submit" disabled={busy||!liveMode}>{busy?'Guardando…':'Guardar conexión privada'}</Button>
    </fieldset>
   </form>
   <p className="muted">Notificación bancaria para registrar en Baneco: <span className="bank-reference">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/bank-qr/notify</span>. La consulta automática de respaldo funciona sin tener abierta la app.</p>
  </>}
 </section>;
}
