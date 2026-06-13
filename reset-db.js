const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');

// Eliminar la base de datos existente
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('🗑️ Base de datos anterior eliminada');
}

console.log('✅ Base de datos limpiada. Al reiniciar el servidor se creará una nueva.');