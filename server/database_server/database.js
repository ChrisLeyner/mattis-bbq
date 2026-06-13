const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Inicializar tablas
db.serialize(() => {
  // Tabla de productos
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      imagen TEXT,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de órdenes
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    cliente TEXT NOT NULL,
    total REAL NOT NULL,
    metodo_pago TEXT DEFAULT 'Pendiente',
    estado TEXT DEFAULT 'pendiente',  /* pendiente, preparado, entregado, pagado, completado */
    tipo_orden TEXT DEFAULT 'local',  /* local, llevar */
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de items de orden
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      nombre_producto TEXT,
      cantidad INTEGER,
      precio_unitario REAL,
      subtotal REAL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  // Tabla de caja
  db.run(`
    CREATE TABLE IF NOT EXISTS cash_register (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_apertura DATETIME NOT NULL,
      fondo_inicial REAL NOT NULL,
      fecha_cierre DATETIME,
      fondo_final REAL,
      usuario TEXT,
      estado TEXT DEFAULT 'abierta'
    )
  `);

  // VERIFICAR si ya hay productos antes de insertar (evita duplicados)
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (err) {
      console.error('Error verificando productos:', err);
      return;
    }
    
    // Solo insertar si no hay productos
    if (row.count === 0) {
      console.log('📦 Insertando productos iniciales...');
      
      const stmt = db.prepare(`
        INSERT INTO products (nombre, precio, stock, imagen) 
        VALUES (?, ?, ?, ?)
      `);
      
      const productos = [
        ['Pechuga de Pollo', 120, 50, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Alitas BBQ', 150, 30, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Costillas', 250, 20, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Papas Fritas', 45, 100, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Refresco', 25, 200, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Ensalada', 60, 40, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Pulled Pork', 180, 15, 'https://i.postimg.cc/tnjjxCzs/logo.png'],
        ['Burger BBQ', 140, 25, 'https://i.postimg.cc/tnjjxCzs/logo.png']
      ];
      
      productos.forEach(p => {
        stmt.run(p, (err) => {
          if (err) console.error('Error insertando:', err);
        });
      });
      
      stmt.finalize();
      console.log('✅ Productos iniciales insertados');
    } else {
      console.log(`✅ Ya existen ${row.count} productos en la base de datos`);
    }
  });

  console.log('✅ Base de datos lista');
});

module.exports = db;