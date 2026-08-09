// Candy Store V2 - herramientas financieras y de conciliación
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const db=getDatabase(getApp());
const ROOT='candy-store/v2';
const money=n=>Math.round((Number(n)||0)*100)/100;
const dt=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(' ','T')+'-04:00';
const user=()=>document.getElementById('top-name')?.textContent?.trim()||'Sistema';
const values=v=>Object.values(v||{});

async function add(path,data){const r=push(ref(db,`${ROOT}/${path}`));const x={id:r.key,...data,fechaHora:data.fechaHora||dt()};await set(r,x);return x;}
async function audit(tipo,detalle){return add('auditoria',{tipo,detalle,usuario:user()});}

async function createPool({nombre='Pool de reinversión',montoInicial=0,cuentaOrigen='wilson',nota=''}){
  const r=push(ref(db,`${ROOT}/pools`));
  const pool={id:r.key,nombre,montoInicial:money(montoInicial),efectivoDisponible:money(montoInicial),capitalRecuperado:0,capitalEnInventario:0,cuentaOrigen,estado:'activo',nota,creadoEn:dt(),creadoPor:user()};
  await set(r,pool);
  if(montoInicial) await add('movimientosDinero',{tipo:'aporte_pool',poolId:r.key,cuenta:cuentaOrigen,monto:money(montoInicial),estado:'confirmado'});
  await audit('pool_creado',{poolId:r.key,montoInicial:pool.montoInicial}); return pool;
}
async function poolPurchase({poolId,compraId,loteId,monto}){
  const snap=await get(ref(db,`${ROOT}/pools/${poolId}`)); const p=snap.val(); if(!p) throw new Error('Pool no encontrado');
  monto=money(monto); if(monto>money(p.efectivoDisponible)) throw new Error('El pool no tiene efectivo suficiente');
  await update(ref(db,`${ROOT}/pools/${poolId}`),{efectivoDisponible:money(p.efectivoDisponible-monto),capitalEnInventario:money((p.capitalEnInventario||0)+monto),actualizadoEn:dt()});
  await add('movimientosDinero',{tipo:'salida_pool_compra',poolId,compraId,loteId,monto:-monto,estado:'confirmado'}); await audit('pool_compra',{poolId,compraId,loteId,monto});
}
async function poolRecover({poolId,ventaId,loteId,monto}){
  const snap=await get(ref(db,`${ROOT}/pools/${poolId}`)); const p=snap.val(); if(!p) throw new Error('Pool no encontrado'); monto=money(monto);
  await update(ref(db,`${ROOT}/pools/${poolId}`),{efectivoDisponible:money((p.efectivoDisponible||0)+monto),capitalRecuperado:money((p.capitalRecuperado||0)+monto),capitalEnInventario:money(Math.max(0,(p.capitalEnInventario||0)-monto)),actualizadoEn:dt()});
  await add('movimientosDinero',{tipo:'retorno_capital_pool',poolId,ventaId,loteId,monto,estado:'confirmado'}); await audit('pool_recuperacion',{poolId,ventaId,loteId,monto});
}
async function recordDirectReceipt({inversionista,monto,cuenta='efectivo',referenciaId=null,nota=''}){
  const rec=await add('movimientosDinero',{tipo:'recibido_directamente',inversionista,monto:money(monto),cuenta,referenciaId,nota,estado:'confirmado'}); await audit('dinero_recibido_directamente',{inversionista,monto:rec.monto,cuenta}); return rec;
}
async function recordTransfer({inversionista,monto,cuentaOrigen='wilson',cuentaDestino=null,nota=''}){
  const rec=await add('movimientosDinero',{tipo:'transferencia_inversionista',inversionista,monto:money(monto),cuentaOrigen,cuentaDestino:cuentaDestino||inversionista.toLowerCase(),nota,estado:'confirmado'}); await audit('transferencia_inversionista',{inversionista,monto:rec.monto}); return rec;
}
async function getInvestorSummary(inversionista){
  const [rightsS,moneyS,lotsS]=await Promise.all([get(ref(db,`${ROOT}/derechosInversionistas`)),get(ref(db,`${ROOT}/movimientosDinero`)),get(ref(db,`${ROOT}/lotes`))]);
  const rights=values(rightsS.val()).filter(x=>x.inversionista===inversionista&&x.estado!=='revertido'); const moves=values(moneyS.val()); const lots=values(lotsS.val()).filter(x=>x.financiadoPor===inversionista&&x.estado!=='anulado');
  const capitalRecuperado=money(rights.filter(x=>x.tipo==='recuperacion_capital').reduce((s,x)=>s+Number(x.monto||0),0));
  const utilidad=money(rights.filter(x=>x.tipo==='utilidad').reduce((s,x)=>s+Number(x.monto||0),0));
  const recibidoDirecto=money(moves.filter(x=>x.tipo==='recibido_directamente'&&x.inversionista===inversionista).reduce((s,x)=>s+Number(x.monto||0),0));
  const transferido=money(moves.filter(x=>x.tipo==='transferencia_inversionista'&&x.inversionista===inversionista).reduce((s,x)=>s+Number(x.monto||0),0));
  const capitalInventario=money(lots.reduce((s,l)=>s+(Number(l.cantidadDisponible||0)*Number(l.costoUnitario||0)),0));
  return {inversionista,capitalRecuperado,utilidad,recibidoDirecto,transferido,capitalInventario,pendiente:money(capitalRecuperado+utilidad-recibidoDirecto-transferido)};
}
async function prepareSettlement(inversionistas=['Karen','Samantha','Wilson']){
  const resumen=[]; for(const i of inversionistas) resumen.push(await getInvestorSummary(i)); const r=push(ref(db,`${ROOT}/liquidaciones`)); const totalPendiente=money(resumen.reduce((s,x)=>s+x.pendiente,0)); const liq={id:r.key,estado:'borrador',resumen,totalPendiente,creadoEn:dt(),creadoPor:user()}; await set(r,liq); await audit('liquidacion_preparada',{liquidacionId:r.key,totalPendiente}); return liq;
}
async function confirmSettlement(id){const s=await get(ref(db,`${ROOT}/liquidaciones/${id}`));const liq=s.val();if(!liq)throw new Error('Liquidación no encontrada');await update(ref(db,`${ROOT}/liquidaciones/${id}`),{estado:'cerrada',cerradoEn:dt(),cerradoPor:user()});await audit('liquidacion_cerrada',{liquidacionId:id});return {...liq,estado:'cerrada'};}

async function addBankStatementMovement({cuenta='wilson',fechaHora,monto,descripcion='',referencia=''}){
  return add('conciliacionBancaria',{cuenta,fechaHora:fechaHora||dt(),monto:money(monto),descripcion,referencia,estado:'pendiente'});
}
async function reconcile({toleranciaMonto=0.01,toleranciaMinutos=1440}={}){
  const [bankS,moneyS]=await Promise.all([get(ref(db,`${ROOT}/conciliacionBancaria`)),get(ref(db,`${ROOT}/movimientosDinero`))]); const bank=values(bankS.val()), moves=values(moneyS.val()).filter(x=>x.estado!=='revertido'); const result=[];
  for(const b of bank){if(b.estado==='conciliado')continue; const bm=money(b.monto); const bt=new Date(b.fechaHora).getTime(); let best=null; for(const m of moves){const mm=money(m.monto); const mt=new Date(m.fechaHora).getTime(); const diffMin=Math.abs(bt-mt)/60000; if(Math.abs(Math.abs(bm)-Math.abs(mm))<=toleranciaMonto && diffMin<=toleranciaMinutos){if(!best||diffMin<best.diffMin)best={m,diffMin};}}
    if(best){await update(ref(db,`${ROOT}/conciliacionBancaria/${b.id}`),{estado:'conciliado',movimientoId:best.m.id,conciliadoEn:dt()}); result.push({banco:b.id,movimiento:best.m.id,estado:'conciliado'});} else result.push({banco:b.id,estado:'sin_coincidencia'});
  }
  await audit('conciliacion_ejecutada',{resultados:result.length}); return result;
}

window.CandyFinance={createPool,poolPurchase,poolRecover,recordDirectReceipt,recordTransfer,getInvestorSummary,prepareSettlement,confirmSettlement,addBankStatementMovement,reconcile};
console.info('CandyFinance V2 disponible');
