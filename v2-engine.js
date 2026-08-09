// Candy Store V2 - capa de lógica compatible con la interfaz actual
// Mantiene HTML/CSS existentes y corrige operaciones críticas sin reescribir toda la base.
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, get, set, update, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getStorage, ref as sRef, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const wait = ms => new Promise(r => setTimeout(r, ms));
const app = getApps().length ? getApp() : null;
if (!app) throw new Error('Candy V2: Firebase todavía no fue inicializado');
const database = getDatabase(app);
const storage = getStorage(app);

const LEGACY = 'candy-store/data';
const V2 = 'candy-store/v2';
const NOMBRES_VALIDOS = ['Wilson','Karen','Samantha','Mamá','Ambas'];
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
const localDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const localDateTime = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(' ','T')+'-04:00';
const arr = v => Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});
const money = n => Math.round((Number(n)||0)*100)/100;
const toast = (m,t='success') => window.toast ? window.toast(m,t) : console.log(m);
const currentUser = () => (document.getElementById('top-name')?.textContent || 'Sistema').trim();

let state = {productos:[],ventas:[],pedidos:[],inversiones:[],compras:[]};
let lots = {};

onValue(ref(database, LEGACY), snap => {
  const d = snap.val() || {};
  state = {
    productos: arr(d.productos),
    ventas: arr(d.ventas),
    pedidos: arr(d.pedidos),
    inversiones: arr(d.inversiones),
    compras: arr(d.compras)
  };
});
onValue(ref(database, `${V2}/lotes`), snap => { lots = snap.val() || {}; });

async function audit(tipo, detalle={}){
  const r = push(ref(database, `${V2}/auditoria`));
  await set(r,{id:r.key,tipo,detalle,usuario:currentUser(),fechaHora:localDateTime()});
}
async function inventoryMove(data){
  const r=push(ref(database,`${V2}/movimientosInventario`));
  await set(r,{id:r.key,...data,usuario:currentUser(),fechaHora:localDateTime()});
}
async function moneyMove(data){
  const r=push(ref(database,`${V2}/movimientosDinero`));
  await set(r,{id:r.key,...data,usuario:currentUser(),fechaHora:localDateTime()});
}
async function rightMove(data){
  const r=push(ref(database,`${V2}/derechosInversionistas`));
  await set(r,{id:r.key,...data,fechaHora:localDateTime()});
}
async function saveLegacyCollection(name, list){
  await set(ref(database,`${LEGACY}/${name}`), list);
}
async function replaceLegacyProduct(product){
  const list=[...state.productos];
  const i=list.findIndex(x=>x.id===product.id);
  if(i>=0) list[i]=product; else list.unshift(product);
  await saveLegacyCollection('productos',list);
}
async function setProductStock(pid, newStock, extra={}){
  const p=state.productos.find(x=>x.id===pid);
  if(!p) throw new Error('Producto no encontrado');
  await replaceLegacyProduct({...p,...extra,stock:Math.max(0,Number(newStock)||0)});
}

function activeLots(pid){
  return Object.values(lots).filter(l=>l.productoId===pid && (Number(l.cantidadDisponible)||0)>0 && l.estado!=='anulado')
    .sort((a,b)=>(a.fechaCompra||'').localeCompare(b.fechaCompra||'') || (a.creadoEn||'').localeCompare(b.creadoEn||''));
}
async function createLot({producto,cantidad,costoUnitario,financiadoPor,tipoFinanciamiento='inversionista',beneficiarioUtilidad,origen='compra',referenciaId=null}){
  const r=push(ref(database,`${V2}/lotes`));
  const owner=NOMBRES_VALIDOS.includes(financiadoPor)?financiadoPor:'pendiente';
  const lot={id:r.key,productoId:producto.id,productoNombre:producto.nombre,cantidadInicial:Number(cantidad),cantidadDisponible:Number(cantidad),costoUnitario:money(costoUnitario),financiadoPor:owner,tipoFinanciamiento,beneficiarioUtilidad:beneficiarioUtilidad||producto.duena||owner,fechaCompra:localDate(),creadoEn:localDateTime(),origen,referenciaId,estado:'activo'};
  await set(r,lot); lots[r.key]=lot; return lot;
}
async function ensureLegacyLot(producto, cantidadNecesaria){
  let available=activeLots(producto.id).reduce((s,l)=>s+(Number(l.cantidadDisponible)||0),0);
  if(available>=cantidadNecesaria) return;
  const faltante=Math.max(0,(Number(producto.stock)||0)-available);
  if(faltante<=0) return;
  const duena=NOMBRES_VALIDOS.includes(producto.duena)?producto.duena:'pendiente';
  await createLot({producto,cantidad:faltante,costoUnitario:producto.costo||0,financiadoPor:duena,beneficiarioUtilidad:producto.duena||duena,origen:'migracion_legacy'});
}
async function consumeLots(producto,cantidad,{motivo,referenciaId,financial=false,beneficiarioFallback=null}={}){
  await ensureLegacyLot(producto,cantidad);
  let left=Number(cantidad); const used=[];
  for(const l of activeLots(producto.id)){
    if(left<=0) break;
    const take=Math.min(left,Number(l.cantidadDisponible)||0);
    if(!take) continue;
    const after=(Number(l.cantidadDisponible)||0)-take;
    await update(ref(database,`${V2}/lotes/${l.id}`),{cantidadDisponible:after,actualizadoEn:localDateTime()});
    if(lots[l.id]) lots[l.id].cantidadDisponible=after;
    used.push({loteId:l.id,cantidad:take,costoUnitario:Number(l.costoUnitario)||0,financiadoPor:l.financiadoPor||'pendiente',beneficiarioUtilidad:l.beneficiarioUtilidad||beneficiarioFallback||producto.duena||'pendiente',tipoFinanciamiento:l.tipoFinanciamiento||'inversionista'});
    await inventoryMove({productoId:producto.id,loteId:l.id,tipo:'salida',cantidad:take,motivo:motivo||'venta',referenciaId});
    left-=take;
  }
  if(left>0) throw new Error(`No existen lotes suficientes para ${producto.nombre}`);
  if(financial) return used;
  return used;
}
async function restoreLots(producto, consumos, motivo, referenciaId){
  for(const c of (consumos||[])){
    const path=`${V2}/lotes/${c.loteId}/cantidadDisponible`;
    await runTransaction(ref(database,path),v=>(Number(v)||0)+(Number(c.cantidad)||0));
    await inventoryMove({productoId:producto.id,loteId:c.loteId,tipo:'entrada',cantidad:Number(c.cantidad)||0,motivo,referenciaId});
  }
}
async function allocateFinancials({ventaId,total,precioUnitario,consumos,cuentaReceptora='wilson',pedidoId=null}){
  let capital=0, utilidad=0;
  for(const c of consumos){
    const costo=money(c.costoUnitario*c.cantidad);
    const ingreso=money(precioUnitario*c.cantidad);
    const gan=money(ingreso-costo);
    capital=money(capital+costo); utilidad=money(utilidad+gan);
    await rightMove({ventaId,pedidoId,tipo:'recuperacion_capital',inversionista:c.financiadoPor||'pendiente',monto:costo,loteId:c.loteId,estado:'pendiente'});
    await rightMove({ventaId,pedidoId,tipo:'utilidad',inversionista:c.beneficiarioUtilidad||'pendiente',monto:gan,loteId:c.loteId,estado:'pendiente'});
  }
  await moneyMove({tipo:'entrada_venta',cuenta:cuentaReceptora,monto:money(total),ventaId,pedidoId,estado:'confirmado'});
  return {capitalRecuperado:capital,utilidad};
}
async function reverseFinancials(venta){
  const rightsSnap=await get(ref(database,`${V2}/derechosInversionistas`));
  const rights=rightsSnap.val()||{};
  for(const [id,r] of Object.entries(rights)) if(r.ventaId===venta.id && r.estado!=='revertido') await update(ref(database,`${V2}/derechosInversionistas/${id}`),{estado:'revertido',revertidoEn:localDateTime()});
  await moneyMove({tipo:'reversion_venta',cuenta:venta.cuentaReceptora||'wilson',monto:-money(venta.total),ventaId:venta.id,estado:'confirmado'});
}

async function uploadProductImage(dataUrl, productId){
  if(!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl||'';
  try{
    const path=`productos/${productId}/${Date.now()}.webp`;
    const sr=sRef(storage,path);
    await uploadString(sr,dataUrl,'data_url');
    return await getDownloadURL(sr);
  }catch(e){ console.warn('Storage no disponible; se conserva imagen actual temporalmente',e); return dataUrl; }
}

async function guardarVtaV2(){
  try{
    const pid=document.getElementById('vta-prod').value; if(!pid) return toast('Selecciona un producto','error');
    const p=state.productos.find(x=>x.id===pid); if(!p) return toast('Producto no encontrado','error');
    const cant=Math.max(1,parseInt(document.getElementById('vta-cant').value)||1);
    const precio=Number(document.getElementById('vta-precio').value)||0;
    if((Number(p.stock)||0)<cant) return toast(`Stock insuficiente (quedan ${p.stock||0})`,'warn');
    const ventaId=uid();
    const consumos=await consumeLots(p,cant,{motivo:'venta',referenciaId:ventaId,financial:true,beneficiarioFallback:document.getElementById('vta-hermana').value});
    const costo=money(consumos.reduce((s,c)=>s+c.costoUnitario*c.cantidad,0));
    const total=money(cant*precio);
    const fin=await allocateFinancials({ventaId,total,precioUnitario:precio,consumos,cuentaReceptora:'wilson'});
    const venta={id:ventaId,pid,pnom:p.nombre,cant,precio,total,costo,hermana:document.getElementById('vta-hermana').value,notas:document.getElementById('vta-notas').value,fecha:localDate(),estado:'confirmada',cuentaReceptora:'wilson',lotesConsumidos:consumos,capitalRecuperado:fin.capitalRecuperado,utilidad:fin.utilidad,versionLogica:2};
    await Promise.all([saveLegacyCollection('ventas',[venta,...state.ventas]),setProductStock(pid,(Number(p.stock)||0)-cant),set(ref(database,`${V2}/ventas/${ventaId}`),venta)]);
    await audit('venta_creada',{ventaId,productoId:pid,cantidad:cant,total});
    window.closeM?.('m-venta'); toast('Venta registrada con capital y utilidad separados ✓');
  }catch(e){console.error(e);toast(e.message||'No se pudo registrar la venta','error');}
}
async function delVtaV2(id){
  const v=state.ventas.find(x=>x.id===id); if(!v) return;
  if(!confirm('¿Anular esta venta? Se repondrá el stock y se revertirán capital y utilidad.')) return;
  try{
    const p=state.productos.find(x=>x.id===v.pid);
    if(p){ await restoreLots(p,v.lotesConsumidos||[], 'anulacion_venta',id); await setProductStock(p.id,(Number(p.stock)||0)+(Number(v.cant)||0)); }
    await reverseFinancials(v);
    const updated=state.ventas.map(x=>x.id===id?{...x,estado:'anulada',anuladaEn:localDateTime(),anuladaPor:currentUser(),totalOriginal:x.total,total:0}:x);
    await saveLegacyCollection('ventas',updated); await update(ref(database,`${V2}/ventas/${id}`),{estado:'anulada',anuladaEn:localDateTime(),anuladaPor:currentUser()});
    await audit('venta_anulada',{ventaId:id}); toast('Venta anulada y stock repuesto','warn');
  }catch(e){console.error(e);toast('No se pudo anular la venta','error');}
}

async function guardarCompraV2(){
  try{
    const pid=document.getElementById('comp-prod').value; if(!pid) return toast('Selecciona un producto','error');
    const p=state.productos.find(x=>x.id===pid); const cant=Math.max(1,parseInt(document.getElementById('comp-cant').value)||1); const precio=Number(document.getElementById('comp-precio').value)||0; const financiador=document.getElementById('comp-herm').value; const id=uid();
    const compra={id,pid,pnom:p.nombre,cant,precio,total:money(cant*precio),hermana:financiador,financiadoPor:financiador,tipoFinanciamiento:'inversionista',fecha:localDate(),estado:'confirmada',versionLogica:2};
    const lote=await createLot({producto:p,cantidad:cant,costoUnitario:precio,financiadoPor:financiador,beneficiarioUtilidad:p.duena||financiador,origen:'compra',referenciaId:id});
    compra.loteId=lote.id;
    await inventoryMove({productoId:pid,loteId:lote.id,tipo:'entrada',cantidad:cant,motivo:'compra',referenciaId:id});
    await moneyMove({tipo:'aporte_capital',cuenta:financiador.toLowerCase(),monto:compra.total,compraId:id,loteId:lote.id,estado:'capital_invertido'});
    await Promise.all([saveLegacyCollection('compras',[compra,...state.compras]),setProductStock(pid,(Number(p.stock)||0)+cant,{costo:precio}),set(ref(database,`${V2}/compras/${id}`),compra)]);
    await audit('compra_creada',{compraId:id,loteId:lote.id,productoId:pid,cantidad:cant,total:compra.total}); window.closeM?.('m-compra'); toast('Compra registrada como lote ✓');
  }catch(e){console.error(e);toast(e.message||'No se pudo registrar la compra','error');}
}
async function delCompV2(id){
  const c=state.compras.find(x=>x.id===id); if(!c) return;
  if(!confirm('¿Anular compra? Solo se permite si las unidades del lote siguen disponibles.')) return;
  try{
    const p=state.productos.find(x=>x.id===c.pid); const lot=c.loteId?lots[c.loteId]:null;
    if(lot && Number(lot.cantidadDisponible)<Number(c.cant)) return toast('No se puede anular: parte de este lote ya fue vendida o reservada','error');
    if(lot) await update(ref(database,`${V2}/lotes/${lot.id}`),{estado:'anulado',cantidadDisponible:0,anuladoEn:localDateTime()});
    if(p){await setProductStock(p.id,Math.max(0,(Number(p.stock)||0)-Number(c.cant||0))); await inventoryMove({productoId:p.id,loteId:c.loteId||null,tipo:'salida',cantidad:Number(c.cant)||0,motivo:'anulacion_compra',referenciaId:id});}
    const list=state.compras.map(x=>x.id===id?{...x,estado:'anulada',anuladaEn:localDateTime()}:x); await saveLegacyCollection('compras',list); await update(ref(database,`${V2}/compras/${id}`),{estado:'anulada',anuladaEn:localDateTime()}); await audit('compra_anulada',{compraId:id}); toast('Compra anulada correctamente','warn');
  }catch(e){console.error(e);toast('No se pudo anular la compra','error');}
}

async function reservarProducto(p,cant,pedidoId,beneficiario){
  const consumos=await consumeLots(p,cant,{motivo:'reserva_pedido',referenciaId:pedidoId,financial:false,beneficiarioFallback:beneficiario});
  await setProductStock(p.id,(Number(p.stock)||0)-cant); return consumos;
}
async function liberarReserva(p,ped,motivo){
  if(p && ped.reservaLotes?.length){await restoreLots(p,ped.reservaLotes,motivo,ped.id); await setProductStock(p.id,(Number(p.stock)||0)+(Number(p.cantidad)||0));}
}
async function guardarPedV2(){
  try{
    const cli=document.getElementById('ped-cli').value.trim(); if(!cli)return toast('Ingresa el nombre del cliente','error');
    const productoTexto=document.getElementById('ped-prod').value.trim(); if(!productoTexto)return toast('Ingresa el producto','error');
    const eid=document.getElementById('ped-id').value; const old=eid?state.pedidos.find(x=>x.id===eid):null; const id=eid||uid();
    if(old?.productoId){const op=state.productos.find(x=>x.id===old.productoId); await liberarReserva(op,old,'edicion_pedido');}
    const productoId=document.getElementById('ped-prod-id').value||null; const cantidad=Math.max(1,parseInt(document.getElementById('ped-cant').value)||1); const precioVenta=Number(document.getElementById('ped-pv').value)||0; const costoUnitario=Number(document.getElementById('ped-costo').value)||0; const duena=document.getElementById('ped-duena').value;
    let reservaLotes=[]; if(productoId){const p=state.productos.find(x=>x.id===productoId); if(!p) return toast('Producto no encontrado','error'); if((Number(p.stock)||0)<cantidad)return toast(`Stock insuficiente. Disponible: ${p.stock||0}`,'error'); reservaLotes=await reservarProducto(p,cantidad,id,duena);}
    const ped={id,cli,wa:document.getElementById('ped-wa').value,productoId,productoTexto,cantidad,costoUnitario,precioVenta,total:money(cantidad*precioVenta),pagado:money(document.getElementById('ped-pagado').value),duena,entrega:document.getElementById('ped-entrega').value,estado:document.getElementById('ped-estado').value,dir:document.getElementById('ped-dir').value,notas:document.getElementById('ped-notas').value,fecha:old?.fecha||localDate(),reservaLotes,versionLogica:2};
    const list=old?state.pedidos.map(x=>x.id===id?ped:x):[ped,...state.pedidos]; await saveLegacyCollection('pedidos',list); await set(ref(database,`${V2}/pedidos/${id}`),ped); await audit(old?'pedido_editado':'pedido_creado',{pedidoId:id,productoId,cantidad}); window.closeM?.('m-pedido'); toast(old?'Pedido actualizado ✓':'Pedido guardado ✓');
  }catch(e){console.error(e);toast(e.message||'No se pudo guardar el pedido','error');}
}
async function cancelarPedidoV2(id){
  const ped=state.pedidos.find(x=>x.id===id); if(!ped||ped.estado!=='pendiente')return toast('Solo se pueden cancelar pedidos pendientes','warn');
  try{const p=state.productos.find(x=>x.id===ped.productoId); await liberarReserva(p,ped,'cancelacion_pedido'); const list=state.pedidos.map(x=>x.id===id?{...x,estado:'cancelado',canceladoEn:localDateTime()}:x); await saveLegacyCollection('pedidos',list); await update(ref(database,`${V2}/pedidos/${id}`),{estado:'cancelado',canceladoEn:localDateTime()}); await audit('pedido_cancelado',{pedidoId:id}); toast('Pedido cancelado y stock repuesto');}catch(e){console.error(e);toast('No se pudo cancelar','error');}
}
async function entregarPedidoV2(id){
  const ped=state.pedidos.find(x=>x.id===id); if(!ped)return; if(ped.estado==='entregado')return toast('Este pedido ya fue entregado','warn'); if(ped.estado==='cancelado')return toast('No se puede entregar un pedido cancelado','error');
  try{
    let ventaId=null; if(ped.productoId){const p=state.productos.find(x=>x.id===ped.productoId); if(p){ventaId=uid(); const consumos=ped.reservaLotes?.length?ped.reservaLotes:await consumeLots(p,ped.cantidad,{motivo:'venta_pedido',referenciaId:ventaId,financial:true,beneficiarioFallback:ped.duena}); const costo=money(consumos.reduce((s,c)=>s+c.costoUnitario*c.cantidad,0)); const fin=await allocateFinancials({ventaId,total:ped.total,precioUnitario:ped.precioVenta,consumos,cuentaReceptora:'wilson',pedidoId:id}); const v={id:ventaId,pid:p.id,pnom:p.nombre,cant:ped.cantidad,precio:ped.precioVenta,total:ped.total,costo,hermana:ped.duena,notas:`Venta automática del pedido ${id} - ${ped.cli}`,fecha:localDate(),pedidoId:id,estado:'confirmada',cuentaReceptora:'wilson',lotesConsumidos:consumos,capitalRecuperado:fin.capitalRecuperado,utilidad:fin.utilidad,versionLogica:2}; await saveLegacyCollection('ventas',[v,...state.ventas]); await set(ref(database,`${V2}/ventas/${ventaId}`),v);}}
    const list=state.pedidos.map(x=>x.id===id?{...x,estado:'entregado',ventaId,entregadoEn:localDateTime()}:x); await saveLegacyCollection('pedidos',list); await update(ref(database,`${V2}/pedidos/${id}`),{estado:'entregado',ventaId,entregadoEn:localDateTime()}); await audit('pedido_entregado',{pedidoId:id,ventaId}); toast('Pedido entregado y venta vinculada ✓');
  }catch(e){console.error(e);toast(e.message||'No se pudo entregar','error');}
}
async function reabrirPedidoV2(id){
  const ped=state.pedidos.find(x=>x.id===id); if(!ped||ped.estado!=='entregado')return toast('Solo se pueden reabrir pedidos entregados','warn');
  try{if(ped.ventaId){const v=state.ventas.find(x=>x.id===ped.ventaId); if(v){await reverseFinancials(v); const ventas=state.ventas.map(x=>x.id===v.id?{...x,estado:'revertida_por_pedido',totalOriginal:x.total,total:0}:x); await saveLegacyCollection('ventas',ventas); await update(ref(database,`${V2}/ventas/${v.id}`),{estado:'revertida_por_pedido',revertidoEn:localDateTime()});}} const list=state.pedidos.map(x=>x.id===id?{...x,estado:'pendiente',ventaId:null,reabiertoEn:localDateTime()}:x); await saveLegacyCollection('pedidos',list); await update(ref(database,`${V2}/pedidos/${id}`),{estado:'pendiente',ventaId:null,reabiertoEn:localDateTime()}); await audit('pedido_reabierto',{pedidoId:id}); toast('Pedido reabierto; venta y reparto revertidos, stock sigue reservado','warn');}catch(e){console.error(e);toast('No se pudo reabrir','error');}
}
async function delPedV2(id){
  const ped=state.pedidos.find(x=>x.id===id); if(!ped)return; if(!confirm('¿Eliminar pedido? Se revertirá cualquier reserva o venta asociada.'))return;
  try{if(ped.estado==='entregado'&&ped.ventaId){await reabrirPedidoV2(id); await wait(250);} const fresh=state.pedidos.find(x=>x.id===id)||ped; const p=state.productos.find(x=>x.id===fresh.productoId); if(fresh.estado!=='cancelado') await liberarReserva(p,fresh,'eliminacion_pedido'); const list=state.pedidos.filter(x=>x.id!==id); await saveLegacyCollection('pedidos',list); await update(ref(database,`${V2}/pedidos/${id}`),{estado:'eliminado',eliminadoEn:localDateTime()}); await audit('pedido_eliminado',{pedidoId:id}); toast('Pedido eliminado y movimientos revertidos','warn');}catch(e){console.error(e);toast('No se pudo eliminar','error');}
}

async function guardarProdV2(){
  try{
    const nombre=document.getElementById('prod-nom').value.trim(); if(!nombre)return toast('Ingresa nombre del producto','error'); const id=document.getElementById('prod-id').value||uid(); const old=state.productos.find(x=>x.id===id); const codigo=document.getElementById('prod-codigo').value.trim().toUpperCase();
    if(codigo && state.productos.some(x=>x.codigo===codigo&&x.id!==id)) return toast(`El código ${codigo} ya existe`,'error');
    const costo=Number(document.getElementById('prod-costo').value)||0, precio=Number(document.getElementById('prod-precio').value)||0, stock=Math.max(0,parseInt(document.getElementById('prod-stock').value)||0), duena=document.getElementById('prod-duena').value;
    if(precio<costo) return toast('El precio de venta no puede ser menor al costo','error');
    const imageData=document.getElementById('prod-img-data').value||old?.img||''; const img=await uploadProductImage(imageData,id);
    const p={...(old||{}),id,codigo,nombre,cat:document.getElementById('prod-cat').value,duena,costo,precio,stock,notas:document.getElementById('prod-notas').value,img,activo:true,actualizadoEn:localDateTime(),versionLogica:2};
    if(!old && stock>0){const lote=await createLot({producto:p,cantidad:stock,costoUnitario:costo,financiadoPor:duena,beneficiarioUtilidad:duena,origen:'stock_inicial'}); await inventoryMove({productoId:id,loteId:lote.id,tipo:'entrada',cantidad:stock,motivo:'stock_inicial',referenciaId:id});}
    if(old && stock>Number(old.stock||0)){const inc=stock-Number(old.stock||0); const lote=await createLot({producto:p,cantidad:inc,costoUnitario:costo,financiadoPor:duena,beneficiarioUtilidad:duena,origen:'ajuste_alta'}); await inventoryMove({productoId:id,loteId:lote.id,tipo:'entrada',cantidad:inc,motivo:'ajuste_stock',referenciaId:id});}
    if(old && stock<Number(old.stock||0)){const dec=Number(old.stock||0)-stock; await consumeLots(old,dec,{motivo:'ajuste_stock',referenciaId:id});}
    await replaceLegacyProduct(p); await set(ref(database,`${V2}/productos/${id}`),{...p,img:img.startsWith('data:')?'legacy-base64':img}); await audit(old?'producto_editado':'producto_creado',{productoId:id,codigo,stock}); window.closeM?.('m-producto'); toast(old?'Producto actualizado ✓':'Producto agregado ✓');
  }catch(e){console.error(e);toast(e.message||'No se pudo guardar producto','error');}
}
async function delProdV2(id){const p=state.productos.find(x=>x.id===id); if(!p)return; if(Number(p.stock)>0)return toast('No puedes eliminar un producto con stock. Déjalo en 0 o realiza un ajuste.','error'); if(state.ventas.some(v=>v.pid===id)||state.compras.some(c=>c.pid===id))return toast('Este producto tiene historial. Se conservará para auditoría.','warn'); if(!confirm('¿Eliminar producto sin movimientos?'))return; await saveLegacyCollection('productos',state.productos.filter(x=>x.id!==id)); await update(ref(database,`${V2}/productos/${id}`),{activo:false,eliminadoEn:localDateTime()}); await audit('producto_eliminado',{productoId:id}); toast('Producto eliminado','warn');}

async function guardarInvV2(){
  const quien=document.getElementById('inv-quien').value, desc=document.getElementById('inv-desc').value.trim(), monto=money(document.getElementById('inv-monto').value), fecha=document.getElementById('inv-fecha').value||localDate(); if(!desc||monto<=0)return toast('Completa descripción y monto','error'); const item={id:uid(),hermana:quien,desc,monto,fecha,tipo:'aporte_manual',versionLogica:2}; await saveLegacyCollection('inversiones',[item,...state.inversiones]); await moneyMove({tipo:'aporte_capital',cuenta:quien.toLowerCase(),monto,inversionId:item.id,estado:'capital_invertido'}); await set(ref(database,`${V2}/inversiones/${item.id}`),item); await audit('inversion_creada',{inversionId:item.id,monto,quien}); window.closeM?.('m-inversion'); toast('Inversión registrada ✓');
}
async function delInvV2(id){if(!confirm('¿Anular este registro de inversión?'))return; const list=state.inversiones.map(x=>x.id===id?{...x,estado:'anulada',montoOriginal:x.monto,monto:0,anuladaEn:localDateTime()}:x); await saveLegacyCollection('inversiones',list); await update(ref(database,`${V2}/inversiones/${id}`),{estado:'anulada',anuladaEn:localDateTime()}); await audit('inversion_anulada',{inversionId:id}); toast('Inversión anulada','warn');}

async function install(){
  // Esperar a que app.js publique sus funciones globales; luego reemplazar solo operaciones críticas.
  for(let i=0;i<100 && !window.guardarVta;i++) await wait(50);
  if(!window.guardarVta){console.error('Candy V2: no se encontró app.js');return;}
  Object.assign(window,{
    guardarVta:guardarVtaV2,delVta:delVtaV2,
    guardarCompra:guardarCompraV2,delComp:delCompV2,
    guardarPed:guardarPedV2,cancelarPedido:cancelarPedidoV2,entregarPedido:entregarPedidoV2,reabrirPedido:reabrirPedidoV2,delPed:delPedV2,
    guardarProd:guardarProdV2,delProd:delProdV2,
    guardarInv:guardarInvV2,delInv:delInvV2
  });
  await update(ref(database,`${V2}/meta`),{schemaVersion:2,logicVersion:'2.0.0',timezone:'America/La_Paz',installedAt:localDateTime()});
  console.info('Candy Store V2 logic activa');
}
install().catch(e=>console.error('Candy V2 install error',e));
