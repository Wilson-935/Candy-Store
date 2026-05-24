// ================== app.js ==================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import firebaseConfig from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const DB_REF = ref(database, 'candy-store/data');

// ESTADO GLOBAL
const PINS   = { wilson:'1234', karen:'1111', samantha:'2222', mama:'3333' };
const NAMES  = { wilson:'Wilson', karen:'Karen', samantha:'Samantha', mama:'Mamá' };
const ROLES  = { wilson:'admin', karen:'inversora', samantha:'inversora', mama:'operadora' };
const AUMENTO = 80;

// ✅ Wilson, Karen y Samantha pueden ser dueñas de productos y transacciones
const HERMANAS = ['Wilson', 'Karen', 'Samantha'];

let cu = null, selU = null, pfiltro = 'todos', vtafiltro = 'todas';
let categoriaFiltro = 'todas';
let db = { productos:[], ventas:[], pedidos:[], inversiones:[], compras:[] };
let fbConnected = false;

// UTILS
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const bs    = n  => 'Bs. ' + parseFloat(n||0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const fmtD  = d  => { try{ return new Date(d+'T12:00:00').toLocaleDateString('es-BO',{day:'2-digit',month:'short'}); }catch(e){return d||''} };
const R     = () => ROLES[cu]  || '';
const N     = () => NAMES[cu]  || '';

// TOAST
function toast(msg, type='success'){
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = (type==='success'?'✓ ':type==='error'?'✕ ':'⚠ ') + msg;
  document.getElementById('toast-wrap').appendChild(el);
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>el.classList.add('show')); });
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),400); }, 2800);
}
window.toast = toast;

// INDICADOR CONEXIÓN
function setFbStatus(state){
  const dots = document.querySelectorAll('.fb-dot');
  const txts = [document.getElementById('fb-status-txt'), document.getElementById('sb-fb-txt')];
  dots.forEach(d=>{ d.className='fb-dot'; if(state!=='connecting') d.classList.add(state); });
  const label = state==='online'?'En línea':state==='offline'?'Sin conexión':'Conectando...';
  txts.forEach(t=>{ if(t) t.textContent=label; });
  fbConnected = (state==='online');
}

// FIREBASE LISTENER
function startFirebaseListener(){
  onValue(DB_REF, (snapshot) => {
    const data = snapshot.val();
    setFbStatus('online');
    if(data){
      db.productos   = data.productos   || [];
      db.ventas      = data.ventas      || [];
      let pedidosRaw = data.pedidos || [];
      db.pedidos = pedidosRaw.map(p => {
        if(p.estado === 'listo') p.estado = 'entregado';
        return p;
      });
      db.inversiones = data.inversiones || [];
      db.compras     = data.compras     || [];
    }
    if(cu) render();
    if(document.getElementById('screen-loading').style.display !== 'none'){
      document.getElementById('screen-loading').style.display = 'none';
      document.getElementById('screen-login').style.display   = 'flex';
    }
  }, (error) => {
    console.error('Firebase error:', error);
    setFbStatus('offline');
    toast('⚠️ Error de conexión con Firebase', 'error');
    document.getElementById('screen-loading').style.display = 'none';
    document.getElementById('screen-login').style.display   = 'flex';
  });
}

// GUARDAR
function saveDB(){
  const bar = document.getElementById('sync-bar');
  bar.className = 'sync-bar show syncing';
  bar.textContent = '⟳ Guardando en Firebase...';
  const payload = JSON.parse(JSON.stringify(db));
  set(DB_REF, payload)
    .then(() => {
      bar.className = 'sync-bar show synced';
      bar.textContent = '✓ Guardado en Firebase';
      setTimeout(()=> bar.classList.remove('show'), 2200);
    })
    .catch(err => {
      console.error('Error guardando:', err);
      bar.className = 'sync-bar show error';
      bar.textContent = '✕ Error al guardar';
      setTimeout(()=> bar.classList.remove('show'), 3000);
      toast('Error al guardar en Firebase', 'error');
    });
}
window.saveDB = saveDB;

// LOGIN
function selPerfil(u, ev){
  selU = u;
  const btn = ev.currentTarget;
  document.querySelectorAll('.pfbtn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById('lerr').textContent='';
  ['p0','p1','p2','p3'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('step-perfil').style.display='none';
  document.getElementById('step-pin').style.display='block';
  setTimeout(()=>document.getElementById('p0').focus(),80);
}
function goBack(){
  document.getElementById('step-pin').style.display='none';
  document.getElementById('step-perfil').style.display='block';
  document.getElementById('lerr').textContent='';
  selU=null;
}
function pnext(i){
  const v=document.getElementById('p'+i).value;
  if(/^\d$/.test(v)&&i<3) document.getElementById('p'+(i+1)).focus();
  else if(v&&!/^\d$/.test(v)) document.getElementById('p'+i).value='';
}
function doLogin(){
  if(!selU){ document.getElementById('lerr').textContent='Elige un perfil primero'; return; }
  const pin=['p0','p1','p2','p3'].map(id=>document.getElementById(id).value).join('');
  if(pin.length<4){ document.getElementById('lerr').textContent='Ingresa los 4 dígitos'; return; }
  if(pin===PINS[selU]){ cu=selU; startApp(); }
  else{
    document.getElementById('lerr').textContent='PIN incorrecto, intenta de nuevo';
    ['p0','p1','p2','p3'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('p0').focus();
  }
}
function logout(){
  cu=null; selU=null;
  document.getElementById('screen-app').style.display='none';
  document.getElementById('screen-login').style.display='flex';
  document.getElementById('step-pin').style.display='none';
  document.getElementById('step-perfil').style.display='block';
  document.querySelectorAll('.pfbtn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('lerr').textContent='';
}

// NAV
const NAV_CFG = {
  admin:[
    {id:'inicio',icon:'ti-home',lbl:'Inicio'},
    {id:'pedidos',icon:'ti-clipboard-list',lbl:'Pedidos'},
    {id:'ventas',icon:'ti-shopping-bag',lbl:'Ventas'},
    {id:'inversion',icon:'ti-chart-bar',lbl:'Inversión'},
    {id:'productos',icon:'ti-package',lbl:'Productos'},
    {id:'compras',icon:'ti-shopping-cart',lbl:'Compras'},
  ],
  inversora:[
    {id:'inicio',icon:'ti-home',lbl:'Inicio'},
    {id:'pedidos',icon:'ti-clipboard-list',lbl:'Pedidos'},
    {id:'ventas',icon:'ti-shopping-bag',lbl:'Ventas'},
    {id:'inversion',icon:'ti-chart-bar',lbl:'Inversión'},
    {id:'productos',icon:'ti-package',lbl:'Productos'},
    {id:'compras',icon:'ti-shopping-cart',lbl:'Compras'},
  ],
  operadora:[
    {id:'inicio',icon:'ti-home',lbl:'Inicio'},
    {id:'pedidos',icon:'ti-clipboard-list',lbl:'Pedidos'},
    {id:'ventas',icon:'ti-shopping-bag',lbl:'Ventas'},
    {id:'productos',icon:'ti-package',lbl:'Productos'},
    {id:'compras',icon:'ti-shopping-cart',lbl:'Compras'},
  ]
};

function startApp(){
  document.getElementById('screen-login').style.display='none';
  document.getElementById('screen-app').style.display='flex';
  const n=N();
  ['sb-av','top-av'].forEach(id=>document.getElementById(id).textContent=n[0]);
  ['sb-name','top-name'].forEach(id=>document.getElementById(id).textContent=n);
  document.getElementById('sb-role').textContent=R()==='admin'?'Administrador':R()==='inversora'?'Inversora':'Operadora';
  buildNav();
  nav('inicio');
}
function buildNav(){
  const items=NAV_CFG[R()]||NAV_CFG.operadora;
  document.getElementById('bnav').innerHTML=items.slice(0,5).map(it=>
    `<div class="bni" onclick="nav('${it.id}')" id="bn-${it.id}"><i class="ti ${it.icon}"></i><span>${it.lbl}</span></div>`
  ).join('');
  document.getElementById('sb-nav').innerHTML=items.map(it=>
    `<div class="sni" onclick="nav('${it.id}')" id="sn-${it.id}"><i class="ti ${it.icon}"></i>${it.lbl}</div>`
  ).join('');
}
function nav(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bni,.sni').forEach(b=>b.classList.remove('active'));
  const p=document.getElementById('pg-'+pg); if(p)p.classList.add('active');
  const bn=document.getElementById('bn-'+pg); if(bn)bn.classList.add('active');
  const sn=document.getElementById('sn-'+pg); if(sn)sn.classList.add('active');
  render();
}

// MODALES (con selects que incluyen a Wilson)
function openM(id){
  if(id==='m-venta'){
    document.getElementById('vta-prod').innerHTML='<option value="">— seleccionar —</option>'+
      db.productos.map(p=>`<option value="${p.id}">${p.codigo?'['+p.codigo+'] ':''} ${p.nombre} · Stock:${p.stock}</option>`).join('');
    const selectVta = document.getElementById('vta-hermana');
    selectVta.innerHTML = HERMANAS.map(h => `<option value="${h}">${h}</option>`).join('');
    if(R()==='inversora') selectVta.value = N();
    else if(R()==='admin') selectVta.value = HERMANAS[0];
    document.getElementById('vta-stock-warn').style.display='none';
  }
  if(id==='m-compra'){
    document.getElementById('comp-prod').innerHTML='<option value="">— seleccionar —</option>'+
      db.productos.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
    const selectComp = document.getElementById('comp-herm');
    selectComp.innerHTML = HERMANAS.map(h => `<option value="${h}">${h}</option>`).join('');
    if(R()==='inversora') selectComp.value = N();
    else if(R()==='admin') selectComp.value = HERMANAS[0];
  }
  if(id==='m-inversion'){
    document.getElementById('inv-fecha').value=today();
    const iq = document.getElementById('inv-quien');
    iq.innerHTML = HERMANAS.map(h => `<option value="${h}">${h}</option>`).join('');
    if(R()==='inversora'){ iq.value = N(); iq.disabled = true; }
    else if(R()==='admin'){ iq.value = HERMANAS[0]; iq.disabled = false; }
    else iq.disabled = false;
  }
  if(id==='m-pedido'){
    document.getElementById('ped-m-title').textContent='Nuevo pedido';
    document.getElementById('ped-id').value='';
    document.getElementById('ped-prod-id').value='';
    ['ped-cli','ped-wa','ped-prod','ped-dir','ped-notas'].forEach(i=>document.getElementById(i).value='');
    ['ped-costo','ped-pv','ped-aum','ped-saldo'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('ped-total').value='';
    document.getElementById('ped-cant').value='1';
    document.getElementById('ped-pagado').value='0';
    document.getElementById('ped-estado').value='pendiente';
    document.getElementById('ped-entrega').value='entrega';
    const selectDuena = document.getElementById('ped-duena');
    selectDuena.innerHTML = HERMANAS.map(h => `<option value="${h}">${h}</option>`).join('');
    selectDuena.value = HERMANAS[0];
    const ps = document.getElementById('ped-prod-sel');
    ps.innerHTML='<option value="">— seleccionar del stock —</option>'+
      db.productos.map(p=>`<option value="${p.id}">${p.nombre} (stock:${p.stock}) — ${bs(p.precio)}</option>`).join('');
  }
  if(id==='m-producto'){
    document.getElementById('prod-m-title').textContent='Agregar producto';
    document.getElementById('prod-id').value='';
    ['prod-codigo','prod-nom','prod-notas'].forEach(i=>document.getElementById(i).value='');
    ['prod-costo','prod-precio'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('prod-stock').value='0';
    const selectDuenaProd = document.getElementById('prod-duena');
    selectDuenaProd.innerHTML = HERMANAS.map(h => `<option value="${h}">${h}</option>`).join('');
    if(R()==='inversora') selectDuenaProd.value = N();
    else if(R()==='admin') selectDuenaProd.value = HERMANAS[0];
    else selectDuenaProd.value = HERMANAS[0];
    document.getElementById('prod-img-data').value='';
    document.getElementById('prod-cat').value='CEPILLOS & DEPILADORES';
    const prev=document.getElementById('prod-img-prev');prev.src='';prev.style.display='none';
  }
  document.getElementById(id).classList.add('open');
}
function closeM(id){ document.getElementById(id).classList.remove('open'); }

// RENDER
function render(){
  const pg=document.querySelector('.page.active'); if(!pg) return;
  const id=pg.id.replace('pg-','');
  ({
    inicio:renderInicio,
    pedidos:renderPedidos,
    ventas:renderVentas,
    inversion:renderInversion,
    productos:renderProductos,
    compras:renderCompras
  }[id]||(() => {}))();
}
window.render = render;

// ========== INICIO (CORREGIDO: tabla de pedidos pendientes bien formada) ==========
function renderInicio(){
  const t=today();
  document.getElementById('ini-title').textContent='Hola, '+N()+' ✨';
  document.getElementById('ini-date').textContent=new Date().toLocaleDateString('es-BO',{weekday:'long',day:'numeric',month:'long'});
  const m=document.getElementById('ini-metrics'), ex=document.getElementById('ini-extra');

  if(R()==='admin'){
    const vh=db.ventas.filter(v=>v.fecha===t),ih=vh.reduce((s,v)=>s+v.total,0),gh=vh.reduce((s,v)=>s+(v.total-v.costo),0);
    const pp=db.pedidos.filter(p=>p.estado==='pendiente').length,stk=db.productos.reduce((s,p)=>s+(parseInt(p.stock)||0),0);
    m.innerHTML=`
      <div class="metric"><div class="metric-lbl">💰 Ventas hoy</div><div class="metric-val">${bs(ih)}</div><div class="metric-sub">${vh.length} ventas</div></div>
      <div class="metric"><div class="metric-lbl">📈 Ganancia hoy</div><div class="metric-val" style="color:${gh>=0?'var(--g)':'var(--r)'}">${bs(gh)}</div><div class="metric-sub">estimada</div></div>
      <div class="metric"><div class="metric-lbl">📋 Pedidos pendientes</div><div class="metric-val">${pp}</div><div class="metric-sub">por entregar</div></div>
      <div class="metric"><div class="metric-lbl">📦 Stock total</div><div class="metric-val">${stk}</div><div class="metric-sub">unidades</div></div>`;
    const resumen = HERMANAS.map(h => {
      const ventas = db.ventas.filter(v => v.hermana === h);
      const ingresos = ventas.reduce((s,v)=>s+v.total,0);
      const ganancias = ventas.reduce((s,v)=>s+(v.total-v.costo),0);
      const inversiones = db.inversiones.filter(i => i.hermana === h).reduce((s,i)=>s+i.monto,0);
      const neto = ganancias - inversiones;
      return `<div class="metric" style="margin:0"><div class="metric-lbl">${h}</div><div class="metric-val">${bs(ingresos)}</div><div class="metric-sub">Neto: ${bs(neto)}</div></div>`;
    }).join('');
    
    // --- Tabla de pedidos pendientes (corregida) ---
    const pendientes = db.pedidos.filter(p => p.estado === 'pendiente').slice(0,5);
    let pendientesHtml = '';
    if (pendientes.length === 0) {
      pendientesHtml = '<tr><td colspan="4"><div class="empty" style="padding:20px"><i class="ti ti-check"></i><p>Sin pendientes</p></div></td></tr>';
    } else {
      pendientes.forEach(p => {
        const cliente = (p.cli || '').replace(/[<>]/g, '');
        const producto = ((p.productoTexto || p.prod || '')).slice(0, 30).replace(/[<>]/g, '');
        const duena = (p.duena && HERMANAS.includes(p.duena)) ? p.duena : 'Sin asignar';
        const saldo = (p.total || 0) - (p.pagado || 0);
        const saldoHtml = saldo > 0 ? `<span class="badge ba">${bs(saldo)}</span>` : '<span class="badge bg">✅</span>';
        pendientesHtml += `
          <tr>
            <td style="font-weight:800; white-space: normal; word-break: break-word;">${cliente}</td>
            <td style="font-size:11px; white-space: normal; word-break: break-word;">${producto}</td>
            <td><span class="badge bv">${duena}</span></td>
            <td>${saldoHtml}</td>
          </tr>
        `;
      });
    }
    
    // --- Stock bajo ---
    const productosBajoStock = db.productos.filter(p => (parseInt(p.stock)||0) <= 2);
    let stockBajoHtml = '';
    if (productosBajoStock.length) {
      stockBajoHtml = `
        <div class="table-responsive">
          <table style="min-width: 300px;">
            <thead><tr><th>Producto</th><th>Stock</th><th>Dueña</th></tr></thead>
            <tbody>
              ${productosBajoStock.map(p => `
                <tr>
                  <td style="font-weight:800">${p.nombre}</td>
                  <td><span class="badge br2">${p.stock}</span></td>
                  <td><span class="badge bv">${p.duena}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      stockBajoHtml = '<div class="empty"><p>✅ Todo en buen stock</p></div>';
    }
    
    ex.innerHTML = `
      <div class="card"><div class="card-hdr">📊 Resumen por hermana</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:16px">
        ${resumen}
      </div></div>
      <div class="card">
        <div class="card-hdr">⏳ Pedidos pendientes</div>
        <div class="table-responsive" style="overflow-x: auto;">
          <table style="min-width: 400px; width: 100%;">
            <thead>
              <tr><th>Cliente</th><th>Producto</th><th>Dueña</th><th>Saldo</th></tr>
            </thead>
            <tbody>${pendientesHtml}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr">⚠️ Stock bajo (≤2)</div>
        ${stockBajoHtml}
      </div>
    `;
  }
  else if(R()==='inversora'){
    const vs=db.ventas.filter(v=>v.hermana===N()),ing=vs.reduce((s,v)=>s+v.total,0),gan=vs.reduce((s,v)=>s+(v.total-v.costo),0);
    const inv=db.inversiones.filter(x=>x.hermana===N()).reduce((s,x)=>s+x.monto,0);
    const mis=db.productos.filter(p=>p.duena===N()),stk=mis.reduce((s,p)=>s+(parseInt(p.stock)||0),0);
    m.innerHTML=`
      <div class="metric"><div class="metric-lbl">💰 Mis ventas</div><div class="metric-val">${bs(ing)}</div><div class="metric-sub">${vs.length} registros</div></div>
      <div class="metric"><div class="metric-lbl">📈 Mi ganancia</div><div class="metric-val" style="color:${gan>=0?'var(--g)':'var(--r)'}">${bs(gan)}</div><div class="metric-sub">estimada</div></div>
      <div class="metric"><div class="metric-lbl">💸 Mi inversión</div><div class="metric-val">${bs(inv)}</div><div class="metric-sub">total</div></div>
      <div class="metric"><div class="metric-lbl">📦 Mis productos</div><div class="metric-val">${stk}</div><div class="metric-sub">en stock</div></div>`;
    ex.innerHTML=`<div class="card"><div class="card-hdr">Mis productos en stock</div>
      <div class="table-responsive"><table><thead><tr><th>Producto</th><th>Stock</th><th>Precio</th></tr></thead><tbody>
      ${mis.length?mis.map(p=>`<tr><td style="font-weight:800">${p.nombre}</td><td><span class="badge ${(parseInt(p.stock)||0)<=3?'br2':(parseInt(p.stock)||0)<=10?'ba':'bg'}">${p.stock}</span></td><td style="font-weight:900;color:var(--p)">${bs(p.precio)}</td></tr>`).join(''):`<tr><td colspan="3"><div class="empty" style="padding:20px"><i class="ti ti-package"></i><p>Sin productos</p></div></td></tr>`}
      </tbody></table></div></div>`;
  }
  else {
    const pds=db.pedidos.filter(p=>p.estado==='pendiente'),st=pds.reduce((s,p)=>s+(p.total||0)-(p.pagado||0),0);
    const vtasH=db.ventas.filter(v=>v.fecha===t),ihO=vtasH.reduce((s,v)=>s+v.total,0);
    m.innerHTML=`
      <div class="metric"><div class="metric-lbl">📋 Pendientes</div><div class="metric-val">${pds.length}</div><div class="metric-sub">por entregar</div></div>
      <div class="metric"><div class="metric-lbl">🚚 Envíos</div><div class="metric-val">${pds.filter(p=>p.entrega==='envio').length}</div><div class="metric-sub">pendientes</div></div>
      <div class="metric"><div class="metric-lbl">💵 Por cobrar</div><div class="metric-val">${bs(st)}</div><div class="metric-sub">saldo total</div></div>
      <div class="metric"><div class="metric-lbl">🛍️ Ventas hoy</div><div class="metric-val">${bs(ihO)}</div><div class="metric-sub">${vtasH.length} ventas</div></div>`;
    ex.innerHTML='';
  }
}

// ========== PEDIDOS (sin cambios, todo correcto) ==========
function renderPedidos(){
  const isAdmin = (R()==='admin');
  const bnp = document.getElementById('btn-np'); if(bnp) bnp.style.display='inline-flex';
  let lista = [...db.pedidos];
  if(pfiltro!=='todos') lista = lista.filter(p=>p.estado===pfiltro);
  const cont = document.getElementById('lista-peds');
  if(!lista.length){ cont.innerHTML='<div class="empty"><i class="ti ti-clipboard-list"></i><p>No hay pedidos aquí</p></div>'; return; }
  cont.innerHTML = lista.map(p => {
    const cantidad = p.cantidad || 1;
    const productoMostrar = p.productoTexto || p.prod || 'Producto sin nombre';
    const total = p.total || (p.precioVenta * cantidad);
    const saldo = total - (p.pagado||0);
    const pct = total>0 ? Math.min(100, Math.round(((p.pagado||0)/total)*100)) : 0;
    const etag = p.entrega==='envio' ? `<span class="badge bb">🚚 Envío</span>` : `<span class="badge bg">🤝 En mano</span>`;
    let stag = '';
    if(p.estado==='entregado') stag = `<span class="badge bg">✅ Entregado</span>`;
    else if(p.estado==='cancelado') stag = `<span class="badge br2">❌ Cancelado</span>`;
    else stag = `<span class="badge ba">⏳ Pendiente</span>`;
    const aum = p.precioVenta && p.costoUnitario ? p.precioVenta - p.costoUnitario : null;
    const waBtn = p.wa ? `<a href="https://wa.me/${p.wa.replace(/\D/g,'')}" target="_blank" class="btn btn-sm btn-wa"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>` : '';
    const cancelBtn = (p.estado === 'pendiente' && isAdmin) ? `<button class="btn btn-sm btn-danger" onclick="cancelarPedido('${p.id}')"><i class="ti ti-ban"></i> Cancelar</button>` : '';
    return `<div class="ped-card estado-${p.estado}">
      <div class="ped-top">
        <div style="flex:1;min-width:0">
          <div class="ped-client">${p.cli}</div>
          ${p.wa?`<div class="ped-wa">📱 ${p.wa}</div>`:''}
          <div class="ped-tags">${etag}${stag}<span class="badge bv">👩 ${p.duena||'?'}</span></div>
          <div class="ped-prod">${cantidad} x ${productoMostrar} = ${bs(total)}</div>
          ${(p.costoUnitario||p.precioVenta)?`<div class="ped-precios"><span style="color:var(--mu)">Costo unit: ${bs(p.costoUnitario)}</span><span style="color:var(--p)">Venta unit: ${bs(p.precioVenta)}</span>${aum?`<span style="color:var(--g)">+${bs(aum)}</span>`:''}</div>`:''}
          ${p.dir?`<div class="ped-detail">📍 ${p.dir}</div>`:''}
          ${p.notas?`<div class="ped-detail">📝 ${p.notas}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:900;color:var(--pd)">${bs(total)}</div>
          <div style="font-size:11px;color:var(--mu);font-weight:700">Pagado: ${bs(p.pagado||0)}</div>
          ${saldo>0?`<div style="font-size:12px;color:var(--r);font-weight:900">Falta: ${bs(saldo)}</div>`:`<div style="font-size:12px;color:var(--g);font-weight:900">✅ Pagado</div>`}
        </div>
      </div>
      <div class="pago-bar"><div class="pago-fill" style="width:${pct}%"></div></div>
      <div style="font-size:10px;color:var(--mu);font-weight:700;margin-bottom:2px">${pct}% pagado · ${fmtD(p.fecha)}</div>
      <div class="ped-btns">
        ${waBtn}
        ${isAdmin?`<button class="btn btn-sm btn-amber" onclick="editPed('${p.id}')"><i class="ti ti-edit"></i> Editar</button>`:''}
        ${p.estado==='pendiente' ? `<button class="btn btn-sm btn-green" onclick="entregarPedido('${p.id}')"><i class="ti ti-check"></i> Entregar</button>` : 
          (p.estado==='entregado' ? `<button class="btn btn-sm" onclick="reabrirPedido('${p.id}')"><i class="ti ti-refresh"></i> Reabrir</button>` : '')}
        ${cancelBtn}
        ${isAdmin?`<button class="btn btn-sm btn-danger" onclick="delPed('${p.id}')"><i class="ti ti-trash"></i></button>`:''}
      </div>
    </div>`;
  }).join('');
}

function filtP(f,el){ pfiltro=f; document.querySelectorAll('.filt-btn').forEach(b=>b.classList.remove('active')); el.classList.add('active'); renderPedidos(); }

function pedDesdeStock(){
  const pid=document.getElementById('ped-prod-sel').value; if(!pid) return;
  const p=db.productos.find(x=>x.id===pid); if(!p) return;
  document.getElementById('ped-prod').value = p.nombre + (p.codigo?' ['+p.codigo+']':'');
  document.getElementById('ped-prod-id').value = pid;
  document.getElementById('ped-costo').value = p.costo;
  document.getElementById('ped-pv').value = p.precio;
  document.getElementById('ped-aum').value = bs(p.precio - p.costo);
  if(p.duena) document.getElementById('ped-duena').value = p.duena;
  calcPedTotal();
}

function calcPedPrecio(){
  const c = parseFloat(document.getElementById('ped-costo').value)||0;
  if(c>0){
    document.getElementById('ped-pv').value = (c+AUMENTO).toFixed(2);
    document.getElementById('ped-aum').value = bs(AUMENTO);
    calcPedTotal();
  }
}

function calcPedTotal(){
  const cant = parseInt(document.getElementById('ped-cant').value) || 1;
  const pv = parseFloat(document.getElementById('ped-pv').value) || 0;
  const total = cant * pv;
  document.getElementById('ped-total').value = total.toFixed(2);
  calcPedSaldo();
}

function calcPedSaldo(){
  const total = parseFloat(document.getElementById('ped-total').value) || 0;
  const pagado = parseFloat(document.getElementById('ped-pagado').value) || 0;
  document.getElementById('ped-saldo').value = bs(Math.max(0, total - pagado));
}

function guardarPed(){
  const cli = document.getElementById('ped-cli').value.trim();
  if(!cli) return toast('Ingresa el nombre del cliente','error');
  const prodTexto = document.getElementById('ped-prod').value.trim();
  if(!prodTexto) return toast('Ingresa el producto','error');
  const prodId = document.getElementById('ped-prod-id').value || null;
  const cant = parseInt(document.getElementById('ped-cant').value) || 1;
  const pv = parseFloat(document.getElementById('ped-pv').value) || 0;
  const costoUnit = parseFloat(document.getElementById('ped-costo').value) || 0;
  const total = cant * pv;
  const pagado = parseFloat(document.getElementById('ped-pagado').value) || 0;
  const estado = document.getElementById('ped-estado').value;
  const entrega = document.getElementById('ped-entrega').value;
  const duena = document.getElementById('ped-duena').value;
  const wa = document.getElementById('ped-wa').value;
  const dir = document.getElementById('ped-dir').value;
  const notas = document.getElementById('ped-notas').value;
  const eid = document.getElementById('ped-id').value;

  let pedidoOriginal = null;
  if(eid) pedidoOriginal = db.pedidos.find(p => p.id === eid);

  if(prodId) {
    const producto = db.productos.find(p => p.id === prodId);
    if(!producto) return toast('El producto seleccionado ya no existe', 'error');
    let stockNecesario = cant;
    if(pedidoOriginal && pedidoOriginal.productoId === prodId) {
      const cantOriginal = pedidoOriginal.cantidad || 1;
      if(cant > cantOriginal) {
        stockNecesario = cant - cantOriginal;
        if(producto.stock < stockNecesario) {
          toast(`Stock insuficiente para aumentar la cantidad. Disponible: ${producto.stock}, necesita: ${stockNecesario}`, 'error');
          return;
        }
      } else if(cant < cantOriginal) {
        stockNecesario = 0;
        producto.stock += (cantOriginal - cant);
      } else {
        stockNecesario = 0;
      }
    } else if(pedidoOriginal && pedidoOriginal.productoId !== prodId) {
      const prodAnterior = db.productos.find(p => p.id === pedidoOriginal.productoId);
      if(prodAnterior) {
        prodAnterior.stock += (pedidoOriginal.cantidad || 1);
      }
      if(producto.stock < cant) {
        toast(`Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}, necesita: ${cant}`, 'error');
        if(prodAnterior) prodAnterior.stock -= (pedidoOriginal.cantidad || 1);
        return;
      }
      stockNecesario = cant;
    } else {
      if(producto.stock < cant) {
        toast(`Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}, necesita: ${cant}`, 'error');
        return;
      }
      stockNecesario = cant;
    }
    if(stockNecesario > 0) {
      producto.stock -= stockNecesario;
    }
  }

  const pedido = {
    id: eid || uid(),
    cli,
    wa,
    productoId: prodId,
    productoTexto: prodTexto,
    cantidad: cant,
    costoUnitario: costoUnit,
    precioVenta: pv,
    total: total,
    pagado: pagado,
    duena: duena,
    entrega: entrega,
    estado: estado,
    dir: dir,
    notas: notas,
    fecha: today()
  };

  if(eid) {
    const idx = db.pedidos.findIndex(x => x.id === eid);
    if(idx !== -1) db.pedidos[idx] = pedido;
    else db.pedidos.unshift(pedido);
  } else {
    db.pedidos.unshift(pedido);
  }
  saveDB();
  closeM('m-pedido');
  toast(eid ? 'Pedido actualizado ✓' : 'Pedido guardado ✓');
  render();
}

function cancelarPedido(id){
  const ped = db.pedidos.find(p => p.id === id);
  if(!ped) return;
  if(ped.estado !== 'pendiente') return toast('Solo se pueden cancelar pedidos pendientes', 'warn');
  if(ped.productoId && ped.cantidad) {
    const prod = db.productos.find(p => p.id === ped.productoId);
    if(prod) {
      prod.stock += ped.cantidad;
      toast(`Stock repuesto: +${ped.cantidad} unidad(es) de ${prod.nombre}`, 'success');
    }
  }
  ped.estado = 'cancelado';
  saveDB();
  toast('Pedido cancelado y stock repuesto', 'success');
  render();
}

function editPed(id){
  const p = db.pedidos.find(x=>x.id===id);
  if(!p) return;
  openM('m-pedido');
  setTimeout(()=>{
    document.getElementById('ped-m-title').textContent='Editar pedido';
    document.getElementById('ped-id').value = p.id;
    document.getElementById('ped-prod-id').value = p.productoId || '';
    document.getElementById('ped-cli').value = p.cli;
    document.getElementById('ped-wa').value = p.wa || '';
    document.getElementById('ped-prod').value = p.productoTexto || p.prod || '';
    document.getElementById('ped-duena').value = p.duena || HERMANAS[0];
    document.getElementById('ped-costo').value = p.costoUnitario || 0;
    document.getElementById('ped-pv').value = p.precioVenta || 0;
    document.getElementById('ped-cant').value = p.cantidad || 1;
    document.getElementById('ped-total').value = p.total;
    document.getElementById('ped-pagado').value = p.pagado || 0;
    document.getElementById('ped-saldo').value = bs(Math.max(0, p.total - (p.pagado||0)));
    document.getElementById('ped-entrega').value = p.entrega || 'entrega';
    document.getElementById('ped-estado').value = p.estado;
    document.getElementById('ped-dir').value = p.dir || '';
    document.getElementById('ped-notas').value = p.notas || '';
    const aum = (p.precioVenta || 0) - (p.costoUnitario || 0);
    document.getElementById('ped-aum').value = aum>0 ? bs(aum) : '';
  },50);
}

function entregarPedido(id){
  const ped = db.pedidos.find(p => p.id === id);
  if(!ped) return;
  if(ped.estado === 'entregado') return toast('Este pedido ya fue entregado', 'warn');
  if(ped.estado === 'cancelado') return toast('No se puede entregar un pedido cancelado', 'error');
  if(ped.productoId && ped.cantidad > 0) {
    const prod = db.productos.find(p => p.id === ped.productoId);
    if(prod) {
      const nuevaVenta = {
        id: uid(),
        pid: ped.productoId,
        pnom: prod.nombre,
        cant: ped.cantidad,
        precio: ped.precioVenta,
        total: ped.total,
        costo: ped.costoUnitario * ped.cantidad,
        hermana: ped.duena,
        notas: `Venta automática del pedido ${ped.id} - ${ped.cli}`,
        fecha: today()
      };
      db.ventas.unshift(nuevaVenta);
      toast(`✅ Venta registrada automáticamente.`, 'success');
    } else {
      toast('El producto ya no existe en el catálogo. Solo se entregará el pedido sin venta.', 'warn');
    }
  } else {
    toast('Este pedido no tiene un producto vinculado al stock. Se marcará como entregado sin venta.', 'warn');
  }
  ped.estado = 'entregado';
  saveDB();
  render();
}

function reabrirPedido(id){
  const ped = db.pedidos.find(p => p.id === id);
  if(!ped) return;
  if(ped.estado !== 'entregado') return toast('Solo se pueden reabrir pedidos entregados', 'warn');
  ped.estado = 'pendiente';
  saveDB();
  toast('Pedido reabierto (stock no revertido automáticamente, ajusta manualmente si es necesario)', 'warn');
  render();
}

function delPed(id){
  if(!confirm('¿Eliminar pedido? Si está entregado, también se eliminará la venta asociada y se repondrá el stock.')) return;
  const ped = db.pedidos.find(p => p.id === id);
  if(!ped) return;
  if(ped.productoId && ped.cantidad && ped.estado !== 'entregado') {
    const prod = db.productos.find(p => p.id === ped.productoId);
    if(prod) {
      prod.stock += ped.cantidad;
      toast(`Stock repuesto: +${ped.cantidad} de ${prod.nombre}`, 'success');
    }
  } else if(ped.productoId && ped.cantidad && ped.estado === 'entregado') {
    const ventaAsociada = db.ventas.find(v => v.notas && v.notas.includes(ped.id));
    if(ventaAsociada) {
      const idxV = db.ventas.findIndex(v => v.id === ventaAsociada.id);
      if(idxV !== -1) db.ventas.splice(idxV, 1);
      const prod = db.productos.find(p => p.id === ped.productoId);
      if(prod) prod.stock += ped.cantidad;
      toast(`Venta asociada eliminada y stock repuesto`, 'warn');
    } else {
      const prod = db.productos.find(p => p.id === ped.productoId);
      if(prod) prod.stock += ped.cantidad;
    }
  }
  db.pedidos = db.pedidos.filter(p => p.id !== id);
  saveDB();
  toast('Pedido eliminado', 'warn');
  render();
}

// ========== VENTAS (sin cambios) ==========
function getVtaFiltro(){
  const t=today(),d=new Date();
  if(vtafiltro==='hoy') return v=>v.fecha===t;
  if(vtafiltro==='semana'){
    const ini=new Date(d);ini.setDate(d.getDate()-d.getDay());
    const iniS=ini.toISOString().slice(0,10);
    return v=>v.fecha>=iniS&&v.fecha<=t;
  }
  if(vtafiltro==='mes'){
    const iniM=t.slice(0,7)+'-01';
    return v=>v.fecha>=iniM&&v.fecha<=t;
  }
  return ()=>true;
}
function filtVta(f,el){ vtafiltro=f; document.querySelectorAll('.filt-btn').forEach(b=>b.classList.remove('active')); el.classList.add('active'); renderVentas(); }
function renderVentas(){
  const bnv=document.getElementById('btn-nv'); if(bnv) bnv.style.display='inline-flex';
  const filt=getVtaFiltro();
  const lista=(R()==='inversora'?db.ventas.filter(v=>v.hermana===N()):db.ventas).filter(filt);
  const rc=document.getElementById('res-herm');
  if(R()==='admin'||R()==='operadora'){
    rc.innerHTML=HERMANAS.map((h,i)=>{
      const vs=db.ventas.filter(v=>v.hermana===h&&filt(v));
      const ing=vs.reduce((s,v)=>s+v.total,0),gan=vs.reduce((s,v)=>s+(v.total-v.costo),0);
      const inv=db.inversiones.filter(x=>x.hermana===h).reduce((s,x)=>s+x.monto,0);
      const neto=gan-inv;
      let clase = (h==='Karen')?'hc-a':(h==='Samantha')?'hc-b':'hc-c';
      return `<div class="herm-card ${clase}">
        <div class="herm-name"><i class="ti ti-user-circle" style="font-size:18px"></i>${h}</div>
        <div class="herm-stats">
          <div class="hstat"><div class="hstat-val">${bs(ing)}</div><div class="hstat-lbl">Ventas</div></div>
          <div class="hstat"><div class="hstat-val" style="color:${gan>=0?'var(--g)':'var(--r)'}">${bs(gan)}</div><div class="hstat-lbl">Ganancia</div></div>
          <div class="hstat"><div class="hstat-val" style="color:${neto>=0?'var(--g)':'var(--r)'}">${bs(neto)}</div><div class="hstat-lbl">Neto</div></div>
        </div>
      </div>`;
    }).join('');
  } else {
    const vs=db.ventas.filter(v=>v.hermana===N()&&filt(v));
    const ing=vs.reduce((s,v)=>s+v.total,0),gan=vs.reduce((s,v)=>s+(v.total-v.costo),0);
    const inv=db.inversiones.filter(x=>x.hermana===N()).reduce((s,x)=>s+x.monto,0);
    rc.innerHTML=`<div class="herm-card hc-a">
      <div class="herm-name"><i class="ti ti-user-circle" style="font-size:18px"></i>Mis ventas — ${N()}</div>
      <div class="herm-stats">
        <div class="hstat"><div class="hstat-val">${bs(ing)}</div><div class="hstat-lbl">Ventas</div></div>
        <div class="hstat"><div class="hstat-val" style="color:${gan>=0?'var(--g)':'var(--r)'}">${bs(gan)}</div><div class="hstat-lbl">Ganancia</div></div>
        <div class="hstat"><div class="hstat-val" style="color:${(gan-inv)>=0?'var(--g)':'var(--r)'}">${bs(gan-inv)}</div><div class="hstat-lbl">Neto</div></div>
      </div></div>`;
  }
  const vc=document.getElementById('vta-count'); if(vc) vc.textContent=lista.length+' registros';
  const tb=document.getElementById('tb-ventas');
  if(!lista.length){tb.innerHTML=`<tr><td colspan="7"><div class="empty" style="padding:24px"><i class="ti ti-shopping-bag"></i><p>Sin ventas en este período</p></div></td></tr>`;return;}
  tb.innerHTML=lista.map(v=>`<tr>
    <td style="font-weight:800">${v.pnom}</td>
    <td>${v.cant}</td>
    <td style="font-weight:900">${bs(v.total)}</td>
    <td style="color:${(v.total-v.costo)>=0?'var(--g)':'var(--r)'};font-weight:800">${bs(v.total-v.costo)}</td>
    <td><span class="badge ${v.hermana==='Wilson'?'bgr':(v.hermana==='Karen'?'bv':'bb')}">${v.hermana}</span></td>
    <td>${fmtD(v.fecha)}</td>
    <td>${R()==='admin'?`<button class="btn btn-xs btn-danger" onclick="delVta('${v.id}')"><i class="ti ti-trash"></i></button>`:''}</td>
  </tr>`).join('');
}
function autoVta(){
  const pid=document.getElementById('vta-prod').value,p=db.productos.find(x=>x.id===pid);
  const warn=document.getElementById('vta-stock-warn');
  if(p){
    document.getElementById('vta-precio').value=p.precio;
    if(R()==='admin'||R()==='inversora') document.getElementById('vta-hermana').value=p.duena;
    if((parseInt(p.stock)||0)<=3){warn.style.display='block';warn.textContent=`⚠️ Stock bajo: solo quedan ${p.stock} unidades`;}
    else warn.style.display='none';
    calcVta();
  } else warn.style.display='none';
}
function calcVta(){
  const c=parseInt(document.getElementById('vta-cant').value)||0,pr=parseFloat(document.getElementById('vta-precio').value)||0;
  const pid=document.getElementById('vta-prod').value,prod=db.productos.find(x=>x.id===pid),costo=prod?(prod.costo||0)*c:0;
  document.getElementById('vta-total').value=bs(c*pr);
  document.getElementById('vta-gan').value=bs(c*pr-costo);
}
function guardarVta(){
  const pid=document.getElementById('vta-prod').value; if(!pid) return toast('Selecciona un producto','error');
  const prod=db.productos.find(x=>x.id===pid),cant=parseInt(document.getElementById('vta-cant').value)||1;
  const precio=parseFloat(document.getElementById('vta-precio').value)||0;
  if((parseInt(prod.stock)||0)<cant) return toast('⚠️ Stock insuficiente (quedan '+prod.stock+')','warn');
  db.ventas.unshift({id:uid(),pid,pnom:prod.nombre,cant,precio,total:cant*precio,costo:(prod.costo||0)*cant,hermana:document.getElementById('vta-hermana').value,notas:document.getElementById('vta-notas').value,fecha:today()});
  prod.stock=Math.max(0,(parseInt(prod.stock)||0)-cant);
  saveDB(); closeM('m-venta'); toast('Venta registrada ✓'); render();
}
function delVta(id){
  if(!confirm('¿Eliminar venta? Se repondrá el stock del producto')) return;
  const venta = db.ventas.find(v => v.id === id);
  if(venta && venta.pid) {
    const prod = db.productos.find(p => p.id === venta.pid);
    if(prod) {
      prod.stock = (parseInt(prod.stock) || 0) + venta.cant;
    }
  }
  db.ventas = db.ventas.filter(v => v.id !== id);
  saveDB();
  toast('Venta eliminada y stock repuesto', 'warn');
  render();
}

// ========== INVERSIÓN ==========
function renderInversion(){
  const n=N(),lista=R()==='inversora'?db.inversiones.filter(x=>x.hermana===n):db.inversiones;
  const cards=document.getElementById('inv-cards');
  cards.innerHTML=HERMANAS.map((h,i)=>{
    const inv=db.inversiones.filter(x=>x.hermana===h).reduce((s,x)=>s+x.monto,0);
    const gan=db.ventas.filter(v=>v.hermana===h).reduce((s,v)=>s+(v.total-v.costo),0);
    const comp=db.compras.filter(c=>c.hermana===h).reduce((s,c)=>s+c.total,0);
    const neto=gan-inv;
    if(R()==='inversora'&&h!==n) return '';
    let clase = (h==='Karen')?'hc-a':(h==='Samantha')?'hc-b':'hc-c';
    return `<div class="herm-card ${clase}">
      <div class="herm-name"><i class="ti ti-user-circle" style="font-size:18px"></i>${h}</div>
      <div class="herm-stats">
        <div class="hstat"><div class="hstat-val">${bs(inv)}</div><div class="hstat-lbl">Invertido</div></div>
        <div class="hstat"><div class="hstat-val">${bs(comp)}</div><div class="hstat-lbl">Compras</div></div>
        <div class="hstat"><div class="hstat-val" style="color:${gan>=0?'var(--g)':'var(--r)'}">${bs(gan)}</div><div class="hstat-lbl">Ganancia</div></div>
        <div class="hstat"><div class="hstat-val" style="color:${neto>=0?'var(--g)':'var(--r)'}">${bs(neto)}</div><div class="hstat-lbl">Neto</div></div>
      </div></div>`;
  }).join('');
  const tb=document.getElementById('tb-inv');
  if(!lista.length){tb.innerHTML=`<tr><td colspan="5"><div class="empty" style="padding:24px"><i class="ti ti-chart-bar"></i><p>Sin inversiones registradas</p></div></td></tr>`;return;}
  tb.innerHTML=lista.map(x=>`<tr><td style="font-weight:700">${x.desc}</td><td style="font-weight:900">${bs(x.monto)}</td><td><span class="badge bv">${x.hermana}</span></td><td>${fmtD(x.fecha)}</td><td><button class="btn btn-xs btn-danger" onclick="delInv('${x.id}')"><i class="ti ti-trash"></i></button></td></tr>`).join('');
}
function guardarInv(){
  const desc=document.getElementById('inv-desc').value.trim(); if(!desc) return toast('Ingresa descripción','error');
  db.inversiones.unshift({id:uid(),hermana:document.getElementById('inv-quien').value,desc,monto:parseFloat(document.getElementById('inv-monto').value)||0,fecha:document.getElementById('inv-fecha').value||today()});
  saveDB(); closeM('m-inversion'); toast('Inversión registrada ✓'); render();
}
function delInv(id){ if(!confirm('¿Eliminar?')) return; db.inversiones=db.inversiones.filter(x=>x.id!==id); saveDB(); toast('Eliminado','warn'); render(); }

// ========== PRODUCTOS ==========
function previewImg(input){
  const file=input.files[0]; if(!file) return;
  if(file.size>2*1024*1024){ toast('Imagen muy grande, usa una menor a 2MB','warn'); return; }
  const reader=new FileReader();
  reader.onload=e=>{
    const img=document.getElementById('prod-img-prev');
    img.src=e.target.result; img.style.display='block';
    document.getElementById('prod-img-data').value=e.target.result;
  };
  reader.readAsDataURL(file);
}
function autoPrecio(){
  const c=parseFloat(document.getElementById('prod-costo').value)||0;
  if(c>0) document.getElementById('prod-precio').value=(c+AUMENTO).toFixed(2);
}
function renderProductos(){
  const bap=document.getElementById('btn-ap'); if(bap) bap.style.display='inline-flex';
  const q=(document.getElementById('prod-search')?.value||'').toLowerCase().trim();
  let lista=R()==='inversora'?db.productos.filter(p=>p.duena===N()):db.productos;
  if(categoriaFiltro !== 'todas'){
    lista = lista.filter(p => p.cat === categoriaFiltro);
  }
  if(q){
    lista = lista.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q));
  }
  const grid=document.getElementById('prod-grid');
  if(!lista.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><i class="ti ti-package"></i><p>'+(q?'Sin resultados para "'+q+'"':'No hay productos registrados')+'</p></div>';return;}
  grid.innerHTML=lista.map(p=>{
    const m=p.precio>0?((p.precio-p.costo)/p.precio*100).toFixed(0):0;
    const stk=parseInt(p.stock)||0;
    const sc=stk<=0?'br2':stk<=3?'br2':stk<=10?'ba':'bg';
    return `<div class="prod-card">
      <div class="prod-img-wrap">
        ${p.img?`<img src="${p.img}" alt="${p.nombre}" loading="lazy">`:`<div class="prod-img-ph">📦</div>`}
        ${p.codigo?`<div class="prod-badge-code">${p.codigo}</div>`:''}
        <div class="prod-badge-stock badge ${sc}">${stk<=0?'Agotado':'Stock: '+stk}</div>
      </div>
      <div class="prod-info">
        <div class="prod-name">${p.nombre}</div>
        <div class="prod-category">${p.cat || 'Sin categoría'}</div>
        <div class="prod-prices">${p.costo?`<span class="prod-costo">${bs(p.costo)}</span>`:''}<span class="prod-precio">${bs(p.precio)}</span></div>
        <div class="prod-duena">👩 ${p.duena} · 📈 Margen ${m}%</div>
      </div>
      ${R()==='admin'?`<div class="prod-actions"><button class="btn btn-sm btn-amber" style="flex:1;justify-content:center" onclick="editProd('${p.id}')"><i class="ti ti-edit"></i> Editar</button><button class="btn btn-sm btn-danger" onclick="delProd('${p.id}')"><i class="ti ti-trash"></i></button></div>`:''}
    </div>`;
  }).join('');
}
function filtrarCategoria(cat, el){
  categoriaFiltro = cat;
  document.querySelectorAll('.cat-filt-btn').forEach(btn => btn.classList.remove('active'));
  if(el) el.classList.add('active');
  renderProductos();
}
function guardarProd(){
  const nom=document.getElementById('prod-nom').value.trim(); if(!nom) return toast('Ingresa nombre del producto','error');
  const eid=document.getElementById('prod-id').value;
  const catSeleccionada = document.getElementById('prod-cat').value;
  const duenaSeleccionada = document.getElementById('prod-duena').value;
  const nuevoCosto = parseFloat(document.getElementById('prod-costo').value) || 0;
  const nuevoPrecio = parseFloat(document.getElementById('prod-precio').value) || 0;
  const nuevoStock = parseInt(document.getElementById('prod-stock').value) || 0;
  
  let productoExistente = null;
  if(eid) productoExistente = db.productos.find(x => x.id === eid);
  
  const p = {
    id: eid || uid(),
    codigo: document.getElementById('prod-codigo').value.trim().toUpperCase(),
    nombre: nom,
    cat: catSeleccionada,
    duena: duenaSeleccionada,
    costo: nuevoCosto,
    precio: nuevoPrecio,
    stock: nuevoStock,
    notas: document.getElementById('prod-notas').value,
    img: document.getElementById('prod-img-data').value || ''
  };
  
  const idx = db.productos.findIndex(x => x.id === p.id);
  if(idx >= 0) {
    const viejoStock = productoExistente.stock;
    if(nuevoStock > viejoStock) {
      const incremento = nuevoStock - viejoStock;
      const totalInversion = incremento * nuevoCosto;
      const compraAuto = {
        id: uid(),
        pid: p.id,
        pnom: p.nombre,
        cant: incremento,
        precio: nuevoCosto,
        total: totalInversion,
        hermana: p.duena,
        fecha: today()
      };
      db.compras.unshift(compraAuto);
      const inversionAuto = {
        id: uid(),
        hermana: p.duena,
        desc: `Compra adicional de ${incremento} unidad(es) de ${p.nombre}`,
        monto: totalInversion,
        fecha: today()
      };
      db.inversiones.unshift(inversionAuto);
      toast(`Se registró compra e inversión por el aumento de stock (${incremento} unds, ${bs(totalInversion)})`, 'success');
    }
    db.productos[idx] = p;
  } else {
    db.productos.unshift(p);
    if(p.stock > 0) {
      const totalInversion = p.stock * p.costo;
      const compraAuto = {
        id: uid(),
        pid: p.id,
        pnom: p.nombre,
        cant: p.stock,
        precio: p.costo,
        total: totalInversion,
        hermana: p.duena,
        fecha: today()
      };
      db.compras.unshift(compraAuto);
      const inversionAuto = {
        id: uid(),
        hermana: p.duena,
        desc: `Stock inicial de ${p.nombre} (${p.stock} unds)`,
        monto: totalInversion,
        fecha: today()
      };
      db.inversiones.unshift(inversionAuto);
      toast(`Stock inicial registrado como compra e inversión (${bs(totalInversion)})`, 'success');
    }
  }
  saveDB(); closeM('m-producto'); toast(eid?'Producto actualizado ✓':'Producto agregado ✓'); render();
}
function editProd(id){
  const p=db.productos.find(x=>x.id===id); if(!p) return;
  openM('m-producto');
  setTimeout(()=>{
    document.getElementById('prod-m-title').textContent='Editar producto';
    document.getElementById('prod-id').value=p.id;
    document.getElementById('prod-codigo').value=p.codigo||'';
    document.getElementById('prod-nom').value=p.nombre;
    document.getElementById('prod-cat').value=p.cat || 'CEPILLOS & DEPILADORES';
    document.getElementById('prod-duena').value=p.duena||HERMANAS[0];
    document.getElementById('prod-costo').value=p.costo;
    document.getElementById('prod-precio').value=p.precio;
    document.getElementById('prod-stock').value=p.stock;
    document.getElementById('prod-notas').value=p.notas||'';
    document.getElementById('prod-img-data').value=p.img||'';
    const prev=document.getElementById('prod-img-prev');
    if(p.img){prev.src=p.img;prev.style.display='block';}else{prev.style.display='none';}
  },50);
}
function delProd(id){ if(!confirm('¿Eliminar producto? También se eliminarán compras e inversiones asociadas (solo las automáticas).')) return; 
  db.productos=db.productos.filter(p=>p.id!==id); saveDB(); toast('Producto eliminado','warn'); render(); 
}

// ========== COMPRAS ==========
function renderCompras(){
  const bac=document.getElementById('btn-ac'); if(bac) bac.style.display='inline-flex';
  const tb=document.getElementById('tb-compras');
  if(!db.compras.length){tb.innerHTML=`<tr><td colspan="7"><div class="empty" style="padding:24px"><i class="ti ti-shopping-cart"></i><p>Sin compras registradas</p></div></td></tr>`;return;}
  tb.innerHTML=db.compras.map(c=>`<tr><td style="font-weight:800">${c.pnom}</td><td>${c.cant}</td><td>${bs(c.precio)}</td><td style="font-weight:900">${bs(c.total)}</td><td><span class="badge bv">${c.hermana}</span></td><td>${fmtD(c.fecha)}</td><td><button class="btn btn-xs btn-danger" onclick="delComp('${c.id}')"><i class="ti ti-trash"></i></button></td></tr>`).join('');
}
function guardarCompra(){
  const pid=document.getElementById('comp-prod').value; if(!pid) return toast('Selecciona un producto','error');
  const prod=db.productos.find(x=>x.id===pid);
  const cant=parseInt(document.getElementById('comp-cant').value)||1;
  const precio=parseFloat(document.getElementById('comp-precio').value)||0;
  const total = cant * precio;
  const hermana = document.getElementById('comp-herm').value;
  
  db.compras.unshift({
    id: uid(),
    pid,
    pnom: prod.nombre,
    cant,
    precio,
    total,
    hermana,
    fecha: today()
  });
  prod.stock = (parseInt(prod.stock) || 0) + cant;
  prod.costo = precio;
  db.inversiones.unshift({
    id: uid(),
    hermana: hermana,
    desc: `Compra de ${cant} unidad(es) de ${prod.nombre}`,
    monto: total,
    fecha: today()
  });
  saveDB(); closeM('m-compra'); toast('Compra registrada y stock actualizado ✓', 'success'); render();
}
function delComp(id){ if(!confirm('¿Eliminar compra? También se eliminará la inversión asociada y se revertirá el stock.')) return;
  const compra = db.compras.find(c => c.id === id);
  if(compra) {
    const prod = db.productos.find(p => p.id === compra.pid);
    if(prod) {
      prod.stock = Math.max(0, (parseInt(prod.stock) || 0) - compra.cant);
    }
    const invIndex = db.inversiones.findIndex(i => i.desc === `Compra de ${compra.cant} unidad(es) de ${compra.pnom}`);
    if(invIndex !== -1) db.inversiones.splice(invIndex, 1);
  }
  db.compras = db.compras.filter(c => c.id !== id);
  saveDB(); toast('Compra eliminada y stock revertido', 'warn'); render();
}

// ========== EXPORTAR FUNCIONES GLOBALES ==========
window.selPerfil = selPerfil;
window.goBack = goBack;
window.pnext = pnext;
window.doLogin = doLogin;
window.logout = logout;
window.nav = nav;
window.openM = openM;
window.closeM = closeM;
window.filtP = filtP;
window.pedDesdeStock = pedDesdeStock;
window.calcPedPrecio = calcPedPrecio;
window.calcPedTotal = calcPedTotal;
window.calcPedSaldo = calcPedSaldo;
window.guardarPed = guardarPed;
window.editPed = editPed;
window.entregarPedido = entregarPedido;
window.cancelarPedido = cancelarPedido;
window.reabrirPedido = reabrirPedido;
window.delPed = delPed;
window.filtVta = filtVta;
window.autoVta = autoVta;
window.calcVta = calcVta;
window.guardarVta = guardarVta;
window.delVta = delVta;
window.guardarInv = guardarInv;
window.delInv = delInv;
window.renderProductos = renderProductos;
window.filtrarCategoria = filtrarCategoria;
window.previewImg = previewImg;
window.autoPrecio = autoPrecio;
window.guardarProd = guardarProd;
window.editProd = editProd;
window.delProd = delProd;
window.guardarCompra = guardarCompra;
window.delComp = delComp;

// Iniciar Firebase
setFbStatus('connecting');
startFirebaseListener();
