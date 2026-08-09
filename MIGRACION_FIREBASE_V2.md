# Candy Store — Migración de Firebase a lógica V2

## Objetivo
Mantener la interfaz, GitHub, Netlify y Firebase actuales, pero separar la lógica de inventario y dinero para evitar sobrescrituras, duplicados y repartos incorrectos.

## Estado actual
La interfaz sigue leyendo `candy-store/data` para no romper la página publicada. El archivo `v2-engine.js` intercepta las operaciones críticas y además registra la información estructurada en `candy-store/v2`.

## Estructura V2

```text
candy-store/
├── data/                         # compatibilidad temporal con la interfaz actual
└── v2/
    ├── meta/
    ├── productos/
    ├── lotes/
    ├── compras/
    ├── ventas/
    ├── pedidos/
    ├── movimientosInventario/
    ├── movimientosDinero/
    ├── derechosInversionistas/
    ├── inversiones/
    └── auditoria/
```

## Reglas financieras

1. Cada unidad de inventario debe pertenecer a un lote.
2. Cada lote guarda quién financió el costo y quién recibe la utilidad.
3. Una venta consume lotes FIFO.
4. El costo vendido genera `recuperacion_capital` para el financiador.
5. La diferencia entre venta y costo genera `utilidad` para el beneficiario.
6. La ubicación física del dinero se registra aparte en `movimientosDinero`.
7. Anular una venta revierte stock y derechos financieros; nunca borra silenciosamente el historial.
8. Los pedidos reservan inventario. Al entregarlos se genera una venta vinculada mediante `ventaId`.
9. Reabrir un pedido revierte la venta y el reparto, pero conserva la reserva de inventario.
10. Anular una compra solo se permite si el lote todavía no fue consumido.

## Datos que deben confirmarse antes de la migración definitiva

- Stock real de cada producto.
- Cómo interpretar los productos cuya propiedad es `Ambas`.
- Quién financió las unidades que ya estaban en inventario antes de V2.
- Qué cuentas físicas se utilizarán: Wilson, Samantha, Karen/Mamá, efectivo, caja, pool, etc.

## Migración de productos existentes

Los productos antiguos pueden seguir funcionando. Cuando una venta necesita consumir un producto que todavía no tiene lote V2, el motor crea un lote de compatibilidad usando:

- stock actual;
- costo actual;
- dueña actual como financiadora y beneficiaria cuando sea identificable;
- `pendiente` cuando no sea posible asignar responsable con seguridad.

Estos lotes deben revisarse después contra el inventario real.

## Imágenes

El motor intenta subir nuevas imágenes a Firebase Storage y guardar la URL. Si Storage todavía no está habilitado o sus reglas no permiten subir archivos, conserva temporalmente Base64 para no impedir que el producto se guarde.

No eliminar las imágenes Base64 antiguas hasta completar y verificar la migración.

## Seguridad

Los PIN antiguos todavía existen dentro de `app.js` por compatibilidad. La siguiente fase de seguridad debe reemplazarlos por Firebase Authentication. No aplicar reglas cerradas de Realtime Database hasta crear las cuentas de Wilson, Karen, Samantha y Mamá, porque bloquearía la aplicación actual.

## Antes de modificar la base manualmente

1. Exportar un respaldo JSON completo de Realtime Database.
2. Confirmar que `candy-store/v2/meta/schemaVersion` exista y valga `2`.
3. Realizar una venta pequeña de prueba.
4. Verificar que aparezcan simultáneamente:
   - venta en `data/ventas`;
   - venta en `v2/ventas`;
   - salida en `v2/movimientosInventario`;
   - recuperación de capital y utilidad en `v2/derechosInversionistas`;
   - entrada de dinero en `v2/movimientosDinero`.
5. Anular esa venta y comprobar que el stock se reponga y los derechos queden revertidos.

## Respaldo del código

Antes de activar V2 se creó la rama:

`backup-antes-logica-v2-2026-08-08`

La rama `main` contiene la lógica nueva.
