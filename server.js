const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const db = require('./server/database_server/database.js');

// ==================== CONFIGURACIÓN WHATSAPP ====================
const ADMIN_WHATSAPP = '+5214461179650'; // ⚠️ CAMBIAR
const CALLMEBOT_API_KEY = '8504698'; // ⚠️ CAMBIAR

async function enviarWhatsApp(mensaje) {
    if (ADMIN_WHATSAPP === '+521234567890') {
        console.log('⚠️ WhatsApp no configurado');
        return false;
    }
    try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${ADMIN_WHATSAPP}&text=${encodeURIComponent(mensaje)}&apikey=${CALLMEBOT_API_KEY}`;
        await axios.get(url);
        console.log('✅ WhatsApp enviado');
        return true;
    } catch (error) {
        console.error('❌ Error WhatsApp:', error.message);
        return false;
    }
}

// ==================== CREAR TABLAS ADICIONALES ====================
db.run(`
    CREATE TABLE IF NOT EXISTS order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        metodo_pago TEXT NOT NULL,
        monto REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) console.error('❌ Error order_payments:', err.message);
    else console.log('✅ Tabla order_payments lista');
});

db.run(`
    CREATE TABLE IF NOT EXISTS consumibles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        stock_actual INTEGER DEFAULT 0,
        stock_minimo INTEGER DEFAULT 10,
        unidad TEXT DEFAULT 'pieza',
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) console.error('❌ Error consumibles:', err.message);
    else console.log('✅ Tabla consumibles lista');
});

db.run(`
    CREATE TABLE IF NOT EXISTS recetas_consumibles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        consumible_id INTEGER NOT NULL,
        cantidad INTEGER DEFAULT 1,
        FOREIGN KEY (producto_id) REFERENCES products(id),
        FOREIGN KEY (consumible_id) REFERENCES consumibles(id)
    )
`, (err) => {
    if (err) console.error('❌ Error recetas_consumibles:', err.message);
    else console.log('✅ Tabla recetas_consumibles lista');
});

// Agregar columna tipo_servicio si no existe
db.run(`ALTER TABLE recetas_consumibles ADD COLUMN tipo_servicio TEXT DEFAULT 'local'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Error agregando tipo_servicio:', err.message);
    } else {
        console.log('✅ Columna tipo_servicio lista');
    }
});

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/js', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}, express.static('public/js'));

// ==================== PRODUCTOS ====================
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products WHERE activo = 1 ORDER BY nombre', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { nombre, precio, stock } = req.body;
  if (!nombre || isNaN(precio)) return res.status(400).json({ error: 'Datos inválidos' });
  db.run(
    `INSERT INTO products (nombre, precio, stock, activo) VALUES (?, ?, ?, 1)`,
    [nombre, precio, stock || 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, precio, stock } = req.body;
  db.run(
    `UPDATE products SET nombre = ?, precio = ?, stock = ? WHERE id = ?`,
    [nombre, precio, stock, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.put('/api/products/stock', (req, res) => {
  const { id, stock } = req.body;
  db.run('UPDATE products SET stock = ? WHERE id = ?', [stock, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    db.run("UPDATE products SET activo = 0 WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ==================== ÓRDENES ====================
app.post('/api/orders', (req, res) => {
  const { cliente, items, total, metodo_pago, tipo_orden = 'local', estado_inicial = 'pendiente', total_usd = 0 } = req.body;
  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run(
      `INSERT INTO orders (order_number, cliente, total, metodo_pago, estado, tipo_orden, total_usd, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [orderNumber, cliente, total, metodo_pago, estado_inicial, tipo_orden, total_usd],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          console.error('Error insertando orden:', err.message);
          return res.status(500).json({ error: err.message });
        }
        const orderId = this.lastID;
        let insertados = 0;
        items.forEach(item => {
          db.run(
            `INSERT INTO order_items (order_id, product_id, nombre_producto, cantidad, precio_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, item.id, item.nombre, item.cantidad, item.precio, item.precio * item.cantidad],
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
              }
              
              // Descontar stock del producto
              db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id]);
              
// 🔥 DESCONTAR CONSUMIBLES SEGÚN TIPO DE ORDEN
console.log(`🔍 Buscando recetas: producto_id=${item.id}, tipo_servicio=${tipo_orden}`);
db.all(`
    SELECT r.consumible_id, r.cantidad as cant_por_unidad, c.nombre, c.stock_actual, c.stock_minimo, c.unidad
    FROM recetas_consumibles r
    JOIN consumibles c ON c.id = r.consumible_id
    WHERE r.producto_id = ? AND r.tipo_servicio = ?
`, [item.id, tipo_orden], (errC, recetas) => {
    if (errC) {
        console.error('❌ Error buscando recetas:', errC.message);
        return;
    }
    console.log(`📦 Recetas encontradas: ${recetas ? recetas.length : 0}`);
    if (recetas && recetas.length > 0) {
        console.log('📋 Detalle:', JSON.stringify(recetas));
    }
    if (!errC && recetas && recetas.length > 0) {
        recetas.forEach(receta => {
            const cantidadTotal = receta.cant_por_unidad * item.cantidad;
            console.log(`✅ Descontando: ${receta.nombre} x${cantidadTotal}`);
            db.run(
                'UPDATE consumibles SET stock_actual = stock_actual - ? WHERE id = ?',
                [cantidadTotal, receta.consumible_id]
            );
            
            const nuevoStock = receta.stock_actual - cantidadTotal;
            if (nuevoStock <= receta.stock_minimo) {
                const mensaje = `⚠️ ALERTA CONSUMIBLE BAJO\n\n📦 ${receta.nombre}\n📊 Stock: ${nuevoStock} ${receta.unidad}\n⚠️ Mínimo: ${receta.stock_minimo}\n🕐 ${new Date().toLocaleString()}`;
                io.emit('consumible-alerta', {
                    id: receta.consumible_id,
                    nombre: receta.nombre,
                    stock_actual: nuevoStock,
                    stock_minimo: receta.stock_minimo
                });
                enviarWhatsApp(mensaje);
            }
        });
    }
});
              
              insertados++;
              if (insertados === items.length) {
                db.run('COMMIT');
                if (estado_inicial === 'pendiente') {
                  io.emit('nueva-orden', { id: orderId, order_number: orderNumber });
                }
                res.json({ success: true, order: { id: orderId, order_number: orderNumber, total, cliente, estado: estado_inicial } });
              }
            }
          );
        });
      }
    );
  });
});

app.get('/api/orders/kitchen', (req, res) => {
  db.all(`
    SELECT o.*, 
      (SELECT json_group_array(
        json_object('nombre', nombre_producto, 'cantidad', cantidad, 'subtotal', subtotal)
       ) FROM order_items WHERE order_id = o.id
      ) as items
    FROM orders o
    WHERE o.estado IN ('pendiente', 'preparado')
    ORDER BY created_at ASC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/orders/pending-payment', (req, res) => {
  db.all(`
    SELECT o.*, 
      (SELECT json_group_array(
        json_object('nombre', nombre_producto, 'cantidad', cantidad, 'subtotal', subtotal)
       ) FROM order_items WHERE order_id = o.id
      ) as items
    FROM orders o
    WHERE o.estado IN ('preparado', 'entregado') AND o.metodo_pago = 'Pendiente'
    ORDER BY created_at ASC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  db.get(`
    SELECT o.*, 
      (SELECT json_group_array(
        json_object('nombre', nombre_producto, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'subtotal', subtotal, 'product_id', product_id)
       ) FROM order_items WHERE order_id = o.id
      ) as items
    FROM orders o WHERE o.id = ?
  `, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { estado, metodo_pago, total_usd } = req.body;
  console.log(`[PUT] Orden ${id} -> estado: ${estado}`);
  let sql = 'UPDATE orders SET estado = ?, updated_at = CURRENT_TIMESTAMP';
  let params = [estado];
  if (metodo_pago) { sql += ', metodo_pago = ?'; params.push(metodo_pago); }
  if (total_usd !== undefined) { sql += ', total_usd = ?'; params.push(total_usd); }
  sql += ' WHERE id = ?';
  params.push(id);

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Orden no encontrada' });
    io.emit('estado-actualizado', { orderId: id, estado });
    res.json({ success: true });
  });
});

app.put('/api/orders/:id/add-extra', (req, res) => {
  const { id } = req.params;
  const { nombre, precio, cantidad } = req.body;
  if (!nombre || !precio || !cantidad) return res.status(400).json({ error: 'Faltan datos' });
  const subtotal = precio * cantidad;
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err || !order) return res.status(404).json({ error: 'Orden no encontrada' });
    const nuevoTotal = order.total + subtotal;
    db.run(
      `INSERT INTO order_items (order_id, product_id, nombre_producto, cantidad, precio_unitario, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, null, nombre, cantidad, precio, subtotal],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('UPDATE orders SET total = ? WHERE id = ?', [nuevoTotal, id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          io.emit('orden-actualizada', { orderId: id, nuevoTotal });
          res.json({ success: true, newTotal: nuevoTotal });
        });
      }
    );
  });
});

app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
        if (order.estado === 'pagado') return res.status(403).json({ error: 'No se puede eliminar una orden pagada' });
        db.run('DELETE FROM order_items WHERE order_id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                io.emit('orden-eliminada', { orderId: id, order_number: order.order_number, cliente: order.cliente });
                res.json({ success: true, message: `Orden ${order.order_number} eliminada` });
            });
        });
    });
});

// ==================== CAJA ====================
app.post('/api/cash/open', (req, res) => {
  const { fondo_inicial, usuario, tipo_cambio_usd } = req.body;
  db.run(
    `INSERT INTO cash_register (fecha_apertura, fondo_inicial, usuario, estado, tipo_cambio_usd)
     VALUES (datetime('now', 'localtime'), ?, ?, 'abierta', ?)`,
    [fondo_inicial, usuario || 'Admin', tipo_cambio_usd || 17.00],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get('/api/cash/status', (req, res) => {
  db.get(`SELECT * FROM cash_register WHERE estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1`, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { estado: 'cerrada' });
  });
});

const PDFDocument = require('pdfkit');
const fs = require('fs');

app.post('/api/cash/close', (req, res) => {
  console.log('🔒 Cierre de turno');
  db.get(`SELECT * FROM cash_register WHERE estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1`, (err, turno) => {
    if (err || !turno) return res.status(400).json({ error: 'No hay turno abierto' });

    db.all(`
      SELECT metodo_pago, SUM(monto) as total_mxn, 0 as total_usd
      FROM order_payments WHERE created_at >= ?
      GROUP BY metodo_pago
    `, [turno.fecha_apertura], (err, ventasPorMetodo) => {
      if (err) {
        db.all(`
          SELECT metodo_pago, SUM(total) as total_mxn, SUM(total_usd) as total_usd
          FROM orders WHERE created_at >= ? AND estado = 'pagado'
          GROUP BY metodo_pago
        `, [turno.fecha_apertura], (err2, ventasFallback) => {
          if (err2) return res.status(500).json({ error: err2.message });
          generarPDF(turno, ventasFallback || []);
        });
        return;
      }
      generarPDF(turno, ventasPorMetodo || []);
    });
  });
  
  function generarPDF(turno, ventasPorMetodo) {
    let ventasEfectivo = 0, ventasTarjeta = 0, ventasTransferencia = 0, ventasDolaresMXN = 0, ventasDolaresUSD = 0;
    ventasPorMetodo.forEach(v => {
      if (v.metodo_pago === 'Efectivo') ventasEfectivo = v.total_mxn || 0;
      else if (v.metodo_pago === 'Tarjeta') ventasTarjeta = v.total_mxn || 0;
      else if (v.metodo_pago === 'Transferencia') ventasTransferencia = v.total_mxn || 0;
      else if (v.metodo_pago === 'Dólares') { ventasDolaresMXN = v.total_mxn || 0; ventasDolaresUSD = v.total_usd || 0; }
    });
    
    const totalVendidoMXN = ventasEfectivo + ventasTarjeta + ventasTransferencia + ventasDolaresMXN;
    const efectivoEnCajaMXN = turno.fondo_inicial + ventasEfectivo;

    const datosCierre = {
      fondoInicial: turno.fondo_inicial, ventasEfectivo, ventasTarjeta, ventasTransferencia,
      ventasDolaresUSD, ventasDolaresMXN, totalVendidoMXN, efectivoEnCajaMXN,
      fechaApertura: turno.fecha_apertura, fechaCierre: new Date().toISOString()
    };

    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      db.run(`UPDATE cash_register SET estado = 'cerrada', fecha_cierre = datetime('now', 'localtime'), fondo_final = ? WHERE id = ?`,
        [efectivoEnCajaMXN, turno.id], (err) => {
          if (err) console.error('Error cerrando turno:', err);
        });
      res.json({ success: true, pdf: pdfData.toString('base64'), cierre: datosCierre });
    });

    doc.fontSize(20).text('MATTI\'S B-B-Q', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text('REPORTE DE CIERRE DE CAJA', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Apertura: ${new Date(turno.fecha_apertura).toLocaleString()}`, { align: 'center' });
    doc.text(`Cierre: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Resumen de ventas:', { underline: true });
    doc.text(`Fondo inicial: $${turno.fondo_inicial.toFixed(2)} MXN`);
    doc.text(`Ventas en efectivo: $${ventasEfectivo.toFixed(2)} MXN`);
    doc.text(`Ventas con tarjeta: $${ventasTarjeta.toFixed(2)} MXN`);
    doc.text(`Ventas por transferencia: $${ventasTransferencia.toFixed(2)} MXN`);
    doc.text(`Ventas en dólares: $${ventasDolaresUSD.toFixed(2)} USD`);
    doc.moveDown();
    doc.text(`TOTAL VENDIDO: $${totalVendidoMXN.toFixed(2)}`, { bold: true });
    doc.moveDown();
    doc.fontSize(14).text(`EFECTIVO EN CAJA: $${efectivoEnCajaMXN.toFixed(2)}`, { bold: true });
    doc.end();
  }
});

// ==================== PAGOS DIVIDIDOS ====================
app.post('/api/orders/:id/payments', (req, res) => {
    const { id } = req.params;
    const { metodo_pago, monto } = req.body;
    if (!metodo_pago || !monto || monto <= 0) return res.status(400).json({ error: 'Datos inválidos' });
    
    db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
        
        db.run(
            'INSERT INTO order_payments (order_id, metodo_pago, monto, created_at) VALUES (?, ?, ?, datetime("now", "localtime"))',
            [id, metodo_pago, monto],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                db.get('SELECT SUM(monto) as total_pagado FROM order_payments WHERE order_id = ?', [id], (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const totalPagado = result.total_pagado || 0;
                    if (metodo_pago === 'Dólares') {
                        db.run('UPDATE orders SET total_usd = COALESCE(total_usd, 0) + ? WHERE id = ?', [monto, id]);
                    }
                    res.json({ success: true, payment_id: this.lastID, total_pagado: totalPagado, falta: Math.max(0, order.total - totalPagado) });
                });
            }
        );
    });
});

app.get('/api/orders/:id/payments', (req, res) => {
    const { id } = req.params;
    db.all('SELECT * FROM order_payments WHERE order_id = ? ORDER BY id ASC', [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ==================== CONSUMIBLES ====================
app.get('/api/consumibles', (req, res) => {
    db.all('SELECT * FROM consumibles WHERE activo = 1 ORDER BY nombre', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/consumibles', (req, res) => {
    const { nombre, stock_actual, stock_minimo, unidad } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.run(
        'INSERT INTO consumibles (nombre, stock_actual, stock_minimo, unidad) VALUES (?, ?, ?, ?)',
        [nombre, stock_actual || 0, stock_minimo || 10, unidad || 'pieza'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/consumibles/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, stock_actual, stock_minimo, unidad } = req.body;
    db.run(
        'UPDATE consumibles SET nombre = ?, stock_actual = ?, stock_minimo = ?, unidad = ? WHERE id = ?',
        [nombre, stock_actual, stock_minimo, unidad, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.put('/api/consumibles/:id/agregar-stock', (req, res) => {
    const { id } = req.params;
    const { cantidad } = req.body;
    db.run('UPDATE consumibles SET stock_actual = stock_actual + ? WHERE id = ?', [cantidad, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/consumibles/:id', (req, res) => {
    const { id } = req.params;
    db.run('UPDATE consumibles SET activo = 0 WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/consumibles/alertas', (req, res) => {
    db.all(`SELECT * FROM consumibles WHERE stock_actual <= stock_minimo AND activo = 1 ORDER BY stock_actual ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/recetas', (req, res) => {
    const { producto_id, consumible_id, cantidad, tipo_servicio = 'local' } = req.body;
    db.run(
        'INSERT INTO recetas_consumibles (producto_id, consumible_id, cantidad, tipo_servicio) VALUES (?, ?, ?, ?)',
        [producto_id, consumible_id, cantidad || 1, tipo_servicio],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/api/recetas/:productoId', (req, res) => {
    const { productoId } = req.params;
    const { tipo_servicio } = req.query;
    
    let sql = `
        SELECT r.id, r.cantidad, r.tipo_servicio, c.id as consumible_id, c.nombre, c.stock_actual, c.unidad
        FROM recetas_consumibles r
        JOIN consumibles c ON c.id = r.consumible_id
        WHERE r.producto_id = ?
    `;
    const params = [productoId];
    
    if (tipo_servicio) {
        sql += ' AND r.tipo_servicio = ?';
        params.push(tipo_servicio);
    }
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.delete('/api/recetas/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM recetas_consumibles WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/test-whatsapp', async (req, res) => {
    const { mensaje } = req.body;
    const enviado = await enviarWhatsApp(mensaje || '🧪 Prueba desde Matti\'s BBQ');
    res.json({ success: enviado });
});

// ==================== SERVIDOR ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'caja.html')));
app.get('/cocina.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cocina.html')));
app.get('/stock.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stock.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/consultas.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'consultas.html')));

io.on('connection', (socket) => console.log('📱 Cliente conectado:', socket.id));

const PORT = process.env.PORT || 3000;
const getLocalIp = () => {
  const { networkInterfaces } = require('os');
  for (const name of Object.keys(networkInterfaces()))
    for (const net of networkInterfaces()[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return 'localhost';
};

app.get('/api/init-tipo-servicio', (req, res) => {
    db.run(`ALTER TABLE recetas_consumibles ADD COLUMN tipo_servicio TEXT DEFAULT 'local'`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                return res.json({ success: true, message: 'Ya existía' });
            }
            return res.json({ success: false, error: err.message });
        }
        res.json({ success: true, message: 'Columna agregada' });
    });
});

// Obtener productos disponibles para editar orden
app.get('/api/orders/:id/edit-products', (req, res) => {
    db.all('SELECT id, nombre, precio, stock, imagen FROM products WHERE activo = 1 AND stock > 0 ORDER BY nombre', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Agregar productos a una orden y reactivarla si estaba preparada
app.put('/api/orders/:id/add-items', (req, res) => {
    const { id } = req.params;
    const { nuevosItems } = req.body;
    
    if (!nuevosItems || nuevosItems.length === 0) {
        return res.status(400).json({ error: 'Sin productos para agregar' });
    }
    
    // Obtener la orden actual
    db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
        
        // Calcular nuevo total
        let totalAgregado = 0;
        nuevosItems.forEach(item => {
            totalAgregado += item.precio * item.cantidad;
        });
        const nuevoTotal = order.total + totalAgregado;
        
        // Insertar cada producto nuevo
        let insertados = 0;
        nuevosItems.forEach(item => {
            db.run(
                `INSERT INTO order_items (order_id, product_id, nombre_producto, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, item.id, item.nombre, item.cantidad, item.precio, item.precio * item.cantidad],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    // Descontar stock del producto
                    db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id]);
                    
                    // Descontar consumibles según tipo_orden
                    db.all(`
                        SELECT r.consumible_id, r.cantidad as cant_por_unidad, c.nombre, c.stock_actual, c.stock_minimo, c.unidad
                        FROM recetas_consumibles r
                        JOIN consumibles c ON c.id = r.consumible_id
                        WHERE r.producto_id = ? AND r.tipo_servicio = ?
                    `, [item.id, order.tipo_orden], (errC, recetas) => {
                        if (!errC && recetas && recetas.length > 0) {
                            recetas.forEach(receta => {
                                const cantidadTotal = receta.cant_por_unidad * item.cantidad;
                                db.run(
                                    'UPDATE consumibles SET stock_actual = stock_actual - ? WHERE id = ?',
                                    [cantidadTotal, receta.consumible_id]
                                );
                                
                                const nuevoStock = receta.stock_actual - cantidadTotal;
                                if (nuevoStock <= receta.stock_minimo) {
                                    const mensaje = `⚠️ ALERTA CONSUMIBLE BAJO\n\n📦 ${receta.nombre}\n📊 Stock: ${nuevoStock} ${receta.unidad}\n⚠️ Mínimo: ${receta.stock_minimo}`;
                                    io.emit('consumible-alerta', {
                                        id: receta.consumible_id,
                                        nombre: receta.nombre,
                                        stock_actual: nuevoStock,
                                        stock_minimo: receta.stock_minimo
                                    });
                                    enviarWhatsApp(mensaje);
                                }
                            });
                        }
                    });
                    
                    insertados++;
                    if (insertados === nuevosItems.length) {
                        // Actualizar total y reactivar la orden
                        db.run(
                            `UPDATE orders SET total = ?, estado = 'pendiente', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                            [nuevoTotal, id],
                            function(err) {
                                if (err) return res.status(500).json({ error: err.message });
                                
                                console.log(`✅ Orden ${id} actualizada con ${nuevosItems.length} productos nuevos. Total: $${nuevoTotal}`);
                                
                                // Notificar a cocina por WebSocket
                                io.emit('orden-actualizada', { 
                                    orderId: id, 
                                    nuevoTotal,
                                    reactivada: true 
                                });
                                
                                // Notificar a cocina que hay orden nueva
                                io.emit('nueva-orden', { id: id });
                                
                                res.json({ 
                                    success: true, 
                                    nuevoTotal,
                                    message: `Se agregaron ${nuevosItems.length} productos. La orden vuelve a cocina.`
                                });
                            }
                        );
                    }
                }
            );
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 Servidor en http://${getLocalIp()}:${PORT}`);
});

// ==================== RESPALDO ====================
app.get('/admin/backup-info', (req, res) => {
    try {
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
        const stats = fs.statSync(dbPath);
        res.json({ size: stats.size, size_mb: (stats.size / 1024 / 1024).toFixed(2), modified: stats.mtime, db_path: dbPath });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/backup', (req, res) => {
    try {
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
        const fecha = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        res.download(dbPath, `respaldo_mattis_${fecha}.sqlite`);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/admin/restore', upload.single('backup'), (req, res) => {
    try {
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
        if (!req.file) return res.json({ success: false, message: 'No se recibió archivo' });
        const fileBuffer = fs.readFileSync(req.file.path);
        if (!fileBuffer.slice(0, 15).toString().includes('SQLite')) {
            fs.unlinkSync(req.file.path);
            return res.json({ success: false, message: 'No es SQLite válido' });
        }
        const backupPath = `${dbPath}.backup_${Date.now()}`;
        fs.copyFileSync(dbPath, backupPath);
        fs.copyFileSync(req.file.path, dbPath);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, message: 'Base restaurada' });
    } catch (err) { res.json({ success: false, message: err.message }); }
});

// ==================== CAJA REGISTRADORA ====================
let drawerPort = null;
let drawerConnected = false;

function initDrawer() {
    try {
        const { SerialPort } = require('serialport');
        const ports = ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', '/dev/ttyUSB0', '/dev/ttyS0'];
        for (const portPath of ports) {
            try {
                const testPort = new SerialPort({ path: portPath, baudRate: 9600, autoOpen: false });
                testPort.open((err) => {
                    if (!err) {
                        console.log(`✅ Caja en: ${portPath}`);
                        drawerPort = testPort;
                        drawerConnected = true;
                    }
                });
                if (drawerConnected) break;
            } catch (e) {}
        }
    } catch (error) { console.log('⚠️ serialport no disponible'); }
}

initDrawer();

app.post('/api/cash/drawer/open', (req, res) => {
    if (!drawerConnected || !drawerPort) {
        initDrawer();
        if (!drawerConnected) return res.json({ success: false });
    }
    try {
        drawerPort.write(Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]));
        res.json({ success: true });
    } catch (error) { res.json({ success: false }); }
});

// ==================== ADMINISTRACIÓN ====================
app.get('/api/admin/dashboard', (req, res) => {
    db.get("SELECT COUNT(*) as count FROM orders WHERE estado = 'pagado'", (err, totalVentas) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT SUM(total) as total FROM orders WHERE estado = 'pagado'", (err, totalMonto) => {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT COUNT(*) as count FROM products WHERE activo = 1", (err, totalProductos) => {
                if (err) return res.status(500).json({ error: err.message });
                db.all("SELECT metodo_pago, COUNT(*) as cantidad, SUM(total) as total FROM orders WHERE estado = 'pagado' GROUP BY metodo_pago", (err, ventasPorMetodo) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({
                        totalVentas: totalVentas?.count || 0,
                        totalMonto: totalMonto?.total || 0,
                        totalProductos: totalProductos?.count || 0,
                        totalPedidos: totalVentas?.count || 0,
                        ventasPorMetodo: ventasPorMetodo || []
                    });
                });
            });
        });
    });
});

app.get('/api/admin/sales/:periodo', (req, res) => {
    const { periodo } = req.params;
    let where = '', periodoText = '';
    switch(periodo) {
        case 'dia': where = "WHERE date(created_at) = date('now', 'localtime') AND estado = 'pagado'"; periodoText = 'Hoy'; break;
        case 'semana': where = "WHERE date(created_at) >= date('now', 'localtime', '-7 days') AND estado = 'pagado'"; periodoText = 'Última semana'; break;
        case 'mes': where = "WHERE date(created_at) >= date('now', 'localtime', '-30 days') AND estado = 'pagado'"; periodoText = 'Último mes'; break;
        default: return res.status(400).json({ error: 'Período inválido' });
    }
    db.get(`SELECT COUNT(*) as count FROM orders ${where}`, (err, totalVentas) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT SUM(total) as total FROM orders ${where}`, (err, totalMonto) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all(`SELECT metodo_pago, COUNT(*) as cantidad, SUM(total) as total FROM orders ${where} GROUP BY metodo_pago`, (err, porMetodo) => {
                if (err) return res.status(500).json({ error: err.message });
                db.all(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 50`, (err, ultimasVentas) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({
                        periodo: periodoText,
                        totalVentas: totalVentas?.count || 0,
                        totalMonto: totalMonto?.total || 0,
                        porMetodo: porMetodo || [],
                        ultimasVentas: ultimasVentas || []
                    });
                });
            });
        });
    });
});

// ==================== CONSULTAS SQL ====================
app.post('/api/query', (req, res) => {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'Sin consulta' });
    const sqlTrim = sql.trim().toLowerCase();
    if (!sqlTrim.startsWith('select')) return res.status(403).json({ error: 'Solo SELECT' });
    const forbidden = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate', 'pragma'];
    for (const word of forbidden) {
        if (sqlTrim.includes(word)) return res.status(403).json({ error: `No permitido: ${word}` });
    }
    db.all(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
        res.json({ success: true, columns, rows: rows || [], count: rows ? rows.length : 0 });
    });
});