const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./server/database_server/database.js'); // Ajusta la ruta si es diferente

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Deshabilitar la caché del navegador específicamente para los archivos .js en la carpeta /js/
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

// Agregar nuevo producto
app.post('/api/products', (req, res) => {
  const { nombre, precio, stock } = req.body;
  if (!nombre || isNaN(precio)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  db.run(
    `INSERT INTO products (nombre, precio, stock, activo) VALUES (?, ?, ?, 1)`,
    [nombre, precio, stock || 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Actualizar producto completo (nombre, precio, stock)
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

// ==================== ÓRDENES ====================
// Crear orden (desde caja o cocina)
// Crear orden (desde caja o cocina)
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
              db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id]);
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

// Obtener órdenes para COCINA (solo pendiente y preparado)
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

// Obtener órdenes pendientes de COBRO (preparado o entregado con método 'Pendiente')
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

// Obtener una orden específica (para cargar al carrito)
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

// ACTUALIZAR ESTADO (ÚNICA RUTA PUT)
app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { estado, metodo_pago, total_usd } = req.body;
  console.log(`[PUT] Orden ${id} -> estado: ${estado}, metodo: ${metodo_pago || '---'}, total_usd: ${total_usd || 0}`);

  let sql = 'UPDATE orders SET estado = ?, updated_at = CURRENT_TIMESTAMP';
  let params = [estado];
  if (metodo_pago) {
    sql += ', metodo_pago = ?';
    params.push(metodo_pago);
  }
  if (total_usd !== undefined) {
    sql += ', total_usd = ?';
    params.push(total_usd);
  }
  sql += ' WHERE id = ?';
  params.push(id);

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Orden no encontrada' });
    console.log(`✅ Orden ${id} actualizada a ${estado}`);
    io.emit('estado-actualizado', { orderId: id, estado });
    res.json({ success: true });
  });
});

// Agregar extra a una orden existente
app.put('/api/orders/:id/add-extra', (req, res) => {
  const { id } = req.params;
  const { nombre, precio, cantidad } = req.body;
  if (!nombre || !precio || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos del extra' });
  }
  const subtotal = precio * cantidad;

  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err || !order) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }
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

// ... dentro de app.post('/api/cash/close', ...)

app.post('/api/cash/close', (req, res) => {
  // Obtener turno abierto
  db.get(`SELECT * FROM cash_register WHERE estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1`, (err, turno) => {
    if (err || !turno) {
      return res.status(400).json({ error: 'No hay turno abierto' });
    }

    // Obtener ventas del turno agrupadas por método de pago
    db.all(`
      SELECT metodo_pago, SUM(total) as total_mxn, SUM(total_usd) as total_usd
      FROM orders 
      WHERE created_at >= ? AND estado = 'pagado'
      GROUP BY metodo_pago
    `, [turno.fecha_apertura], (err, ventasPorMetodo) => {
      if (err) return res.status(500).json({ error: err.message });

      // Inicializar valores
      let ventasEfectivo = 0, ventasTarjeta = 0, ventasTransferencia = 0, ventasDolaresMXN = 0, ventasDolaresUSD = 0;
      ventasPorMetodo.forEach(v => {
        if (v.metodo_pago === 'Efectivo') ventasEfectivo = v.total_mxn || 0;
        else if (v.metodo_pago === 'Tarjeta') ventasTarjeta = v.total_mxn || 0;
        else if (v.metodo_pago === 'Transferencia') ventasTransferencia = v.total_mxn || 0;
        else if (v.metodo_pago === 'Dólares') {
          ventasDolaresMXN = v.total_mxn || 0;
          ventasDolaresUSD = v.total_usd || 0;
        }
      });
      const totalVendidoMXN = ventasEfectivo + ventasTarjeta + ventasTransferencia + ventasDolaresMXN;
      const efectivoEnCajaMXN = turno.fondo_inicial + ventasEfectivo;

      // Generar PDF
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=cierre_${Date.now()}.pdf`);
        res.send(pdfData);
      });

      // Estilo y contenido
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
      doc.text(`Ventas en dólares: $${ventasDolaresUSD.toFixed(2)} USD (equivalente a $${ventasDolaresMXN.toFixed(2)} MXN)`);
      doc.moveDown();
      doc.text(`TOTAL VENDIDO EN MXN: $${totalVendidoMXN.toFixed(2)}`, { bold: true });
      doc.moveDown();
      doc.fontSize(14).text(`EFECTIVO EN CAJA (MXN): $${efectivoEnCajaMXN.toFixed(2)}`, { bold: true });
      doc.text(`EFECTIVO EN CAJA (USD): $${ventasDolaresUSD.toFixed(2)}`, { bold: true });
      doc.moveDown();
      doc.fontSize(8).text('Gracias por usar Matti\'s BBQ System', { align: 'center' });

      doc.end();

      // Actualizar el turno como cerrado
      db.run(`
        UPDATE cash_register SET estado = 'cerrada', fecha_cierre = datetime('now', 'localtime'), fondo_final = ?
        WHERE id = ?
      `, [efectivoEnCajaMXN, turno.id], (err) => {
        if (err) console.error('Error al cerrar turno:', err);
      });
    });
  });
});

// Servir frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'caja.html')));
app.get('/cocina.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cocina.html')));
app.get('/pending-payment.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pending-payment.html')));

// WebSocket
io.on('connection', (socket) => console.log('📱 Cliente conectado:', socket.id));

const PORT = process.env.PORT || 3000;
const getLocalIp = () => {
  const { networkInterfaces } = require('os');
  for (const name of Object.keys(networkInterfaces()))
    for (const net of networkInterfaces()[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return 'localhost';
};

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 Servidor en http://${getLocalIp()}:${PORT}`);
});

// ==================== RESPALDO DE BASE DE DATOS ====================
// Información de la base de datos
app.get('/admin/backup-info', (req, res) => {
    try {
        const fs = require('fs');
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
        const stats = fs.statSync(dbPath);
        res.json({
            size: stats.size,
            size_mb: (stats.size / 1024 / 1024).toFixed(2),
            modified: stats.mtime,
            db_path: dbPath
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Descargar respaldo
app.get('/admin/backup', (req, res) => {
    try {
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
        const fecha = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const nombreArchivo = `respaldo_mattis_${fecha}.sqlite`;
        res.download(dbPath, nombreArchivo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restaurar respaldo
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/admin/restore', upload.single('backup'), (req, res) => {
    try {
        const fs = require('fs');
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
        
        if (!req.file) {
            return res.json({ success: false, message: 'No se recibió ningún archivo' });
        }
        
        // Verificar que sea un archivo .sqlite válido
        const fileBuffer = fs.readFileSync(req.file.path);
        if (!fileBuffer.slice(0, 15).toString().includes('SQLite')) {
            fs.unlinkSync(req.file.path);
            return res.json({ success: false, message: 'El archivo no es una base de datos SQLite válida' });
        }
        
        // Hacer respaldo automático antes de restaurar
        const backupPath = `${dbPath}.backup_${Date.now()}`;
        fs.copyFileSync(dbPath, backupPath);
        
        // Restaurar el respaldo
        fs.copyFileSync(req.file.path, dbPath);
        
        // Limpiar archivo temporal
        fs.unlinkSync(req.file.path);
        
        res.json({ success: true, message: 'Base de datos restaurada correctamente' });
    } catch (err) {
        console.error('Error al restaurar:', err);
        res.json({ success: false, message: err.message });
    }
});

// ==================== CAJA REGISTRADORA ====================
const { SerialPort } = require('serialport');

let drawerPort = null;

// Configurar caja
function configurarCaja(portPath) {
    try {
        drawerPort = new SerialPort({
            path: portPath,
            baudRate: 9600,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            autoOpen: false
        });

        drawerPort.on('open', () => {
            console.log('✅ Caja registradora conectada en:', portPath);
        });

        drawerPort.on('error', (err) => {
            console.error('❌ Error en caja:', err.message);
        });

        drawerPort.open((err) => {
            if (err) {
                console.log('⚠️ No se pudo conectar a la caja:', err.message);
            }
        });
        return true;
    } catch (error) {
        console.log('⚠️ Error configurando caja:', error.message);
        return false;
    }
}

// Abrir caja
function abrirCajaRegistradora() {
    if (!drawerPort || !drawerPort.isOpen) {
        const port = process.env.CAJA_PORT || 'COM3';
        configurarCaja(port);
        if (!drawerPort || !drawerPort.isOpen) {
            return false;
        }
    }
    try {
        // Comando ESC/POS para abrir cajón (Epson, muchas marcas lo usan)
        const comando = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
        drawerPort.write(comando);
        console.log('💰 Caja registradora abierta');
        return true;
    } catch (error) {
        console.error('❌ Error abriendo caja:', error.message);
        return false;
    }
}

// Endpoint para abrir caja
app.post('/api/cash/drawer/open', (req, res) => {
    const success = abrirCajaRegistradora();
    res.json({ success });
});