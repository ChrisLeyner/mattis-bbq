// ==================== VARIABLES ====================
const QUERY_PASSWORD = 'matti2026';

// ==================== VERIFICAR CONTRASEÑA ====================
function verificarPassword() {
    const password = document.getElementById('queryPassword').value;
    if (password === QUERY_PASSWORD) {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('queryContent').style.display = 'block';
        sessionStorage.setItem('queryAuth', 'true');
        // Cargar datos iniciales
        cargarDatosIniciales();
    } else {
        document.getElementById('passwordError').style.display = 'block';
        document.getElementById('queryPassword').value = '';
        setTimeout(() => {
            document.getElementById('passwordError').style.display = 'none';
        }, 3000);
    }
}

// ==================== CARGAR DATOS INICIALES ====================
function cargarDatosIniciales() {
    // Fecha actual
    const hoy = new Date();
    const fechaString = hoy.toISOString().split('T')[0];
    
    // Fecha de hace 7 días
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);
    const fecha7String = hace7Dias.toISOString().split('T')[0];
    
    document.getElementById('fechaDesde').value = fecha7String;
    document.getElementById('fechaHasta').value = fechaString;
    
    buscar();
}

// ==================== BUSCAR ====================
async function buscar() {
    const fechaDesde = document.getElementById('fechaDesde').value;
    const fechaHasta = document.getElementById('fechaHasta').value;
    const numeroOrden = document.getElementById('numeroOrden').value.trim();
    const cliente = document.getElementById('clienteBuscar').value.trim();
    const metodoPago = document.getElementById('metodoPagoFiltro').value;
    const estado = document.getElementById('estadoFiltro').value;

    // Construir filtros
    let filtros = [];
    
    if (fechaDesde && fechaHasta) {
        filtros.push(`date(created_at) BETWEEN '${fechaDesde}' AND '${fechaHasta}'`);
    } else if (fechaDesde) {
        filtros.push(`date(created_at) >= '${fechaDesde}'`);
    } else if (fechaHasta) {
        filtros.push(`date(created_at) <= '${fechaHasta}'`);
    }
    
    if (numeroOrden) {
        filtros.push(`order_number LIKE '%${numeroOrden}%'`);
    }
    
    if (cliente) {
        filtros.push(`cliente LIKE '%${cliente}%'`);
    }
    
    if (metodoPago) {
        filtros.push(`metodo_pago = '${metodoPago}'`);
    }
    
    if (estado) {
        filtros.push(`estado = '${estado}'`);
    }
    
    const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
    
    // Consulta principal
    const sql = `
        SELECT 
            id,
            order_number,
            cliente,
            total,
            metodo_pago,
            estado,
            created_at as fecha
        FROM orders 
        ${whereClause}
        ORDER BY created_at DESC
    `;

    // Consulta de resumen
    const sqlResumen = `
        SELECT 
            COUNT(*) as total_ventas,
            SUM(total) as total_monto,
            COUNT(DISTINCT cliente) as total_clientes
        FROM orders 
        ${whereClause}
    `;

    mostrarNotificacion('⏳ Buscando...', 'info');

    try {
        // Ejecutar consulta principal
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error en la consulta');
        }

        const data = await response.json();
        
        // Ejecutar consulta de resumen
        const resumenResponse = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sqlResumen })
        });
        const resumenData = await resumenResponse.json();

        mostrarResultados(data);
        mostrarResumen(resumenData);
        
        const audio = document.getElementById('notificacion');
        audio.play().catch(() => {});

    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error: ' + error.message, 'danger');
        document.getElementById('resultados').innerHTML = `
            <div class="alert alert-danger">
                <strong>❌ Error al buscar:</strong><br>
                ${error.message}
            </div>
        `;
    }
}

// ==================== MOSTRAR RESUMEN ====================
function mostrarResumen(data) {
    if (!data || !data.rows || data.rows.length === 0) {
        document.getElementById('totalVentas').innerText = '0';
        document.getElementById('totalMonto').innerText = '$0';
        document.getElementById('totalProductos').innerText = '0';
        document.getElementById('totalClientes').innerText = '0';
        return;
    }

    const row = data.rows[0];
    document.getElementById('totalVentas').innerText = row.total_ventas || 0;
    document.getElementById('totalMonto').innerText = `$${parseFloat(row.total_monto || 0).toFixed(2)}`;
    document.getElementById('totalClientes').innerText = row.total_clientes || 0;
    
    // Obtener total de productos (consultar aparte)
    const sqlProductos = `
        SELECT SUM(cantidad) as total_productos 
        FROM order_items 
        WHERE order_id IN (SELECT id FROM orders ${data.where || ''})
    `;
    // Simplificado: contamos productos de las órdenes mostradas
    // Podemos calcular desde los datos existentes
}

// ==================== MOSTRAR RESULTADOS ====================
function mostrarResultados(data) {
    const container = document.getElementById('resultados');
    const countSpan = document.getElementById('resultCount');

    if (!data || !data.rows || data.rows.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4">No se encontraron resultados</div>';
        countSpan.innerText = '0 registros';
        return;
    }

    countSpan.innerText = `${data.rows.length} registros`;

    const columns = data.columns || Object.keys(data.rows[0] || {});
    let html = '<table>';
    
    html += '<thead><tr>';
    columns.forEach(col => {
        const labels = {
            'id': 'ID',
            'order_number': 'Orden',
            'cliente': 'Cliente',
            'total': 'Total',
            'metodo_pago': 'Método Pago',
            'estado': 'Estado',
            'fecha': 'Fecha'
        };
        html += `<th>${labels[col] || col}</th>`;
    });
    html += '</tr></thead>';
    
    html += '<tbody>';
    data.rows.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
            let value = row[col] !== undefined && row[col] !== null ? row[col] : '';
            if (col === 'total' && typeof value === 'number') {
                value = `$${value.toFixed(2)}`;
            }
            if (col === 'fecha' || col === 'created_at') {
                if (value) {
                    const d = new Date(value);
                    value = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
                }
            }
            html += `<td>${value}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    container.innerHTML = html;
}

// ==================== LIMPIAR FILTROS ====================
function limpiarFiltros() {
    document.getElementById('fechaDesde').value = '';
    document.getElementById('fechaHasta').value = '';
    document.getElementById('numeroOrden').value = '';
    document.getElementById('clienteBuscar').value = '';
    document.getElementById('metodoPagoFiltro').value = '';
    document.getElementById('estadoFiltro').value = '';
    buscar();
}

// ==================== EXPORTAR CSV ====================
function exportarCSV() {
    const container = document.getElementById('resultados');
    const table = container.querySelector('table');
    if (!table) {
        mostrarNotificacion('⚠️ No hay datos para exportar', 'warning');
        return;
    }

    let csv = '';
    // Encabezados
    const headers = table.querySelectorAll('thead th');
    const headerTexts = [];
    headers.forEach(th => headerTexts.push(th.textContent));
    csv += headerTexts.join(',') + '\n';
    
    // Datos
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const rowData = [];
        cells.forEach(td => {
            let text = td.textContent.trim();
            // Si contiene comas, envolver en comillas
            if (text.includes(',')) {
                text = `"${text}"`;
            }
            rowData.push(text);
        });
        csv += rowData.join(',') + '\n';
    });

    // Descargar
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    mostrarNotificacion('✅ CSV exportado correctamente', 'success');
}

// ==================== NOTIFICACIONES ====================
function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// ==================== INICIO ====================
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('queryAuth') === 'true') {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('queryContent').style.display = 'block';
        cargarDatosIniciales();
    }
});