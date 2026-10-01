// ==================== VARIABLES ====================
const ADMIN_PASSWORD = 'matti2026'; // CAMBIA ESTA CONTRASEÑA
let productModal = null;
let editMode = false;
let fileToRestore = null;
let confirmModal = null;
let consumibleModal = null;
let compraModal = null;
let consumiblesList = [];
let recetaModal = null;

// ==================== VERIFICAR CONTRASEÑA ====================
function verificarPassword() {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        sessionStorage.setItem('adminAuth', 'true');
        cargarDashboard();
        cargarProductos();
        cargarBackupInfo();
        configurarDropZone();
        cargarHistorial();
        cargarConsumibles();
    } else {
        document.getElementById('passwordError').style.display = 'block';
        document.getElementById('adminPassword').value = '';
        setTimeout(() => {
            document.getElementById('passwordError').style.display = 'none';
        }, 3000);
    }
}

// ==================== DASHBOARD ====================
async function cargarDashboard() {
    try {
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data = await response.json();
        console.log('📊 Datos del dashboard:', data);
        
        const ventasPorMetodo = Array.isArray(data.ventasPorMetodo) ? data.ventasPorMetodo : [];
        
        document.getElementById('dashboardContent').innerHTML = `
            <div class="row g-3">
                <div class="col-md-3 col-6">
                    <div class="stat-card">
                        <div class="number">${data.totalVentas || 0}</div>
                        <div class="label">Ventas Totales</div>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="stat-card">
                        <div class="number">$${(data.totalMonto || 0).toFixed(2)}</div>
                        <div class="label">Total Vendido (MXN)</div>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="stat-card">
                        <div class="number">${data.totalProductos || 0}</div>
                        <div class="label">Productos</div>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="stat-card">
                        <div class="number">${data.totalPedidos || 0}</div>
                        <div class="label">Pedidos</div>
                    </div>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <div class="admin-card">
                        <h6>Ventas por Método de Pago</h6>
                        ${ventasPorMetodo.length > 0 ? ventasPorMetodo.map(m => `
                            <div class="d-flex justify-content-between border-bottom py-1">
                                <span>${m.metodo_pago || 'Sin método'}</span>
                                <span><strong>$${(m.total || 0).toFixed(2)}</strong> (${m.cantidad || 0} ventas)</span>
                            </div>
                        `).join('') : '<p class="text-muted">No hay ventas registradas</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        document.getElementById('dashboardContent').innerHTML = `
            <div class="alert alert-danger">
                ❌ Error al cargar el dashboard: ${error.message}
                <br><button class="btn btn-sm btn-outline-danger mt-2" onclick="cargarDashboard()">Reintentar</button>
            </div>
        `;
    }
}

// ==================== PRODUCTOS ====================
async function cargarProductos() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        const container = document.getElementById('productList');
        if (!products || products.length === 0) {
            container.innerHTML = '<div class="col-12 text-center text-muted p-5">No hay productos registrados</div>';
            return;
        }
        container.innerHTML = products.map(p => `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="product-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${p.nombre}</strong>
                        <div class="text-muted small">$${p.precio.toFixed(2)} | Stock: ${p.stock}</div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-info" onclick="abrirReceta(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')" title="Receta de consumibles">
                            <i class="fas fa-utensils"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="editarProducto(${p.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${p.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function mostrarModalProducto(id = null) {
    editMode = !!id;
    if (id) {
        document.getElementById('productModalTitle').innerText = '✏️ Editar Producto';
        fetch('/api/products')
            .then(r => r.json())
            .then(products => {
                const p = products.find(pr => pr.id === id);
                if (p) {
                    document.getElementById('editProductId').value = p.id;
                    document.getElementById('editProductName').value = p.nombre;
                    document.getElementById('editProductPrice').value = p.precio;
                    document.getElementById('editProductStock').value = p.stock;
                    document.getElementById('editProductImage').value = p.imagen || '';
                }
            });
    } else {
        document.getElementById('productModalTitle').innerText = '➕ Agregar Producto';
        document.getElementById('editProductId').value = '';
        document.getElementById('editProductName').value = '';
        document.getElementById('editProductPrice').value = '';
        document.getElementById('editProductStock').value = '';
        document.getElementById('editProductImage').value = '';
    }
    if (!productModal) {
        productModal = new bootstrap.Modal(document.getElementById('productModal'));
    }
    productModal.show();
}

function editarProducto(id) { mostrarModalProducto(id); }

async function guardarProducto() {
    const id = document.getElementById('editProductId').value;
    const nombre = document.getElementById('editProductName').value.trim();
    const precio = parseFloat(document.getElementById('editProductPrice').value);
    const stock = parseInt(document.getElementById('editProductStock').value) || 0;
    const imagen = document.getElementById('editProductImage').value.trim();

    if (!nombre || isNaN(precio)) {
        mostrarNotificacion('⚠️ Completa todos los campos', 'warning');
        return;
    }

    const metodo = id ? 'PUT' : 'POST';
    const url = id ? `/api/products/${id}` : '/api/products';
    
    try {
        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, precio, stock, imagen })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('✅ Producto guardado', 'success');
            productModal.hide();
            cargarProductos();
            cargarDashboard();
        }
    } catch (error) {
        mostrarNotificacion('❌ Error al guardar', 'danger');
    }
}

async function eliminarProducto(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
        await fetch(`/api/products/${id}`, { method: 'DELETE' });
        mostrarNotificacion('✅ Producto eliminado', 'success');
        cargarProductos();
        cargarDashboard();
    } catch (error) {
        mostrarNotificacion('❌ Error', 'danger');
    }
}

// ==================== RESPALDOS ====================
async function cargarBackupInfo() {
    try {
        const response = await fetch('/admin/backup-info');
        const data = await response.json();
        document.getElementById('dbInfo').innerHTML = `
            <small class="text-muted">
                📦 Tamaño: ${data.size_mb} MB | 
                🕐 Modificado: ${new Date(data.modified).toLocaleString()}
            </small>
        `;
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        if (data.size > 0) {
            indicator.className = 'status-indicator status-online';
            statusText.className = 'badge bg-success';
            statusText.innerText = 'ONLINE';
        }
    } catch (error) { console.error('Error:', error); }
}

function configurarDropZone() {
    const dropZone = document.getElementById('dropZone');
    const restoreInput = document.getElementById('restoreInput');
    if (!dropZone) return;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.sqlite') || file.name.endsWith('.db'))) {
            restaurarRespaldo({ target: { files: [file] } });
        }
    });
    restoreInput.addEventListener('change', (e) => {
        if (e.target.files[0]) restaurarRespaldo(e);
    });
}

function crearRespaldo() {
    const link = document.createElement('a');
    link.href = '/admin/backup';
    link.download = `respaldo_mattis_${new Date().toISOString().slice(0,10)}.sqlite`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarNotificacion('✅ Respaldo generado', 'success');
    agregarAlHistorial('respaldo', new Date().toISOString());
}

async function restaurarRespaldo(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('⚠️ Restaurar borrará TODOS los datos actuales. ¿Continuar?')) return;

    const formData = new FormData();
    formData.append('backup', file);

    try {
        const response = await fetch('/admin/restore', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            mostrarNotificacion('✅ Restaurado. Recargando...', 'success');
            setTimeout(() => location.reload(), 2000);
        }
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

function cargarHistorial() {
    const historial = obtenerHistorial();
    const container = document.getElementById('historialList');
    if (historial.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-3">No hay respaldos</div>';
        return;
    }
    container.innerHTML = historial.map((item, index) => `
        <div class="backup-history-item d-flex justify-content-between align-items-center">
            <div>
                <i class="fas fa-file-archive text-success"></i>
                <span class="fw-bold">${item.tipo}</span>
                <small class="text-muted ms-2">${new Date(item.fecha).toLocaleString()}</small>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-success" onclick="window.open('/admin/backup', '_blank')"><i class="fas fa-download"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarHistorial(${index})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function agregarAlHistorial(tipo, fecha) {
    let historial = obtenerHistorial();
    historial.unshift({ tipo, fecha });
    if (historial.length > 50) historial = historial.slice(0, 50);
    localStorage.setItem('backupHistory', JSON.stringify(historial));
    cargarHistorial();
}

function obtenerHistorial() {
    try { return JSON.parse(localStorage.getItem('backupHistory')) || []; } catch { return []; }
}

function eliminarHistorial(index) {
    if (confirm('¿Eliminar este registro?')) {
        let historial = obtenerHistorial();
        historial.splice(index, 1);
        localStorage.setItem('backupHistory', JSON.stringify(historial));
        cargarHistorial();
    }
}

function vaciarHistorial() {
    if (confirm('¿Vaciar todo el historial?')) {
        localStorage.removeItem('backupHistory');
        cargarHistorial();
    }
}

// ==================== VENTAS ====================
async function cargarVentas(periodo) {
    const contentDiv = document.getElementById('salesContent');
    contentDiv.innerHTML = '<div class="text-center p-5">Cargando ventas...</div>';
    
    try {
        const response = await fetch(`/api/admin/sales/${periodo}`);
        const data = await response.json();
        const porMetodo = Array.isArray(data.porMetodo) ? data.porMetodo : [];
        const ultimasVentas = Array.isArray(data.ultimasVentas) ? data.ultimasVentas : [];
        
        contentDiv.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="admin-card">
                        <h6>📊 Resumen</h6>
                        <p><strong>Total Ventas:</strong> ${data.totalVentas || 0}</p>
                        <p><strong>Monto Total:</strong> $${(data.totalMonto || 0).toFixed(2)}</p>
                        <p><strong>Período:</strong> ${data.periodo || periodo}</p>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="admin-card">
                        <h6>💳 Por Método</h6>
                        ${porMetodo.length > 0 ? porMetodo.map(m => `
                            <div class="d-flex justify-content-between border-bottom py-1">
                                <span>${m.metodo_pago}</span>
                                <span><strong>$${(m.total || 0).toFixed(2)}</strong> (${m.cantidad || 0})</span>
                            </div>
                        `).join('') : '<p class="text-muted">Sin datos</p>'}
                    </div>
                </div>
                <div class="col-12">
                    <div class="admin-card">
                        <h6>📋 Últimas ventas</h6>
                        ${ultimasVentas.length > 0 ? ultimasVentas.map(v => `
                            <div class="d-flex justify-content-between border-bottom py-1 small">
                                <span>${v.order_number || v.id}</span>
                                <span>${v.cliente || 'Cliente'}</span>
                                <span>$${(v.total || 0).toFixed(2)}</span>
                                <span>${v.metodo_pago || 'N/A'}</span>
                                <span class="text-muted">${v.created_at ? new Date(v.created_at).toLocaleDateString() : 'N/A'}</span>
                            </div>
                        `).join('') : '<p class="text-muted">Sin ventas</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        contentDiv.innerHTML = `<div class="alert alert-danger">❌ Error: ${error.message}</div>`;
    }
}

// ==================== CONSUMIBLES ====================
async function cargarConsumibles() {
    try {
        const response = await fetch('/api/consumibles');
        const consumibles = await response.json();
        consumiblesList = consumibles;
        
        const container = document.getElementById('listaConsumibles');
        if (!container) return;
        
        if (!consumibles || consumibles.length === 0) {
            container.innerHTML = '<div class="col-12 text-center text-muted p-5">No hay consumibles registrados.</div>';
            return;
        }
        
        container.innerHTML = consumibles.map(c => {
            const alerta = c.stock_actual <= c.stock_minimo ? 'bg-danger text-white' : '';
            const icono = c.stock_actual <= c.stock_minimo ? '⚠️' : '✅';
            return `
                <div class="col-md-6 col-lg-4 mb-2">
                    <div class="card ${alerta}" style="border-radius: 10px;">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="mb-1">${icono} ${c.nombre}</h6>
                                    <div class="small">
                                        <strong>Stock: ${c.stock_actual}</strong> ${c.unidad}<br>
                                        Mínimo: ${c.stock_minimo}
                                    </div>
                                </div>
                                <div>
                                    <button class="btn btn-sm btn-info" onclick="abrirCompra(${c.id})" title="Agregar stock"><i class="fas fa-plus"></i></button>
                                    <button class="btn btn-sm btn-primary" onclick="editarConsumible(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-danger" onclick="eliminarConsumible(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        cargarAlertasConsumibles();
    } catch (error) { console.error('Error:', error); }
}

async function cargarAlertasConsumibles() {
    try {
        const response = await fetch('/api/consumibles/alertas');
        const alertas = await response.json();
        const container = document.getElementById('alertasConsumibles');
        
        if (!alertas || alertas.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle"></i> ⚠️ Consumibles con stock bajo (${alertas.length})</h6>
                <ul class="mb-0">
                    ${alertas.map(a => `<li><strong>${a.nombre}</strong>: ${a.stock_actual} ${a.unidad} (mínimo: ${a.stock_minimo})</li>`).join('')}
                </ul>
                <button class="btn btn-sm btn-warning mt-2" onclick="notificarWhatsAppAlertas()">
                    <i class="fab fa-whatsapp"></i> Notificar por WhatsApp
                </button>
            </div>
        `;
    } catch (error) { console.error('Error:', error); }
}

function mostrarModalConsumible() {
    document.getElementById('consumibleModalTitle').innerText = '➕ Agregar Consumible';
    document.getElementById('editConsumibleId').value = '';
    document.getElementById('editConsumibleNombre').value = '';
    document.getElementById('editConsumibleUnidad').value = 'pieza';
    document.getElementById('editConsumibleStock').value = '';
    document.getElementById('editConsumibleMinimo').value = '10';
    
    if (!consumibleModal) {
        consumibleModal = new bootstrap.Modal(document.getElementById('consumibleModal'));
    }
    consumibleModal.show();
}

function editarConsumible(id) {
    const c = consumiblesList.find(x => x.id === id);
    if (!c) return;
    document.getElementById('consumibleModalTitle').innerText = '✏️ Editar Consumible';
    document.getElementById('editConsumibleId').value = c.id;
    document.getElementById('editConsumibleNombre').value = c.nombre;
    document.getElementById('editConsumibleUnidad').value = c.unidad || 'pieza';
    document.getElementById('editConsumibleStock').value = c.stock_actual;
    document.getElementById('editConsumibleMinimo').value = c.stock_minimo;
    
    if (!consumibleModal) {
        consumibleModal = new bootstrap.Modal(document.getElementById('consumibleModal'));
    }
    consumibleModal.show();
}

async function guardarConsumible() {
    const id = document.getElementById('editConsumibleId').value;
    const nombre = document.getElementById('editConsumibleNombre').value.trim();
    const unidad = document.getElementById('editConsumibleUnidad').value;
    const stock_actual = parseInt(document.getElementById('editConsumibleStock').value) || 0;
    const stock_minimo = parseInt(document.getElementById('editConsumibleMinimo').value) || 10;
    
    if (!nombre) {
        mostrarNotificacion('⚠️ Ingresa el nombre', 'warning');
        return;
    }
    
    const url = id ? `/api/consumibles/${id}` : '/api/consumibles';
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, unidad, stock_actual, stock_minimo })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('✅ Consumible guardado', 'success');
            consumibleModal.hide();
            cargarConsumibles();
        }
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

function abrirCompra(id) {
    const c = consumiblesList.find(x => x.id === id);
    if (!c) return;
    document.getElementById('compraConsumibleId').value = c.id;
    document.getElementById('compraNombre').innerText = c.nombre;
    document.getElementById('compraStockActual').innerText = `${c.stock_actual} ${c.unidad}`;
    document.getElementById('compraCantidad').value = '';
    
    if (!compraModal) {
        compraModal = new bootstrap.Modal(document.getElementById('compraModal'));
    }
    compraModal.show();
}

async function agregarStockConsumible() {
    const id = document.getElementById('compraConsumibleId').value;
    const cantidad = parseInt(document.getElementById('compraCantidad').value);
    
    if (!cantidad || cantidad <= 0) {
        mostrarNotificacion('⚠️ Cantidad inválida', 'warning');
        return;
    }
    
    try {
        await fetch(`/api/consumibles/${id}/agregar-stock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cantidad })
        });
        mostrarNotificacion(`✅ Stock actualizado (+${cantidad})`, 'success');
        compraModal.hide();
        cargarConsumibles();
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

async function eliminarConsumible(id) {
    if (!confirm('¿Eliminar este consumible?')) return;
    try {
        await fetch(`/api/consumibles/${id}`, { method: 'DELETE' });
        mostrarNotificacion('✅ Eliminado', 'success');
        cargarConsumibles();
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

async function notificarWhatsAppAlertas() {
    try {
        const response = await fetch('/api/consumibles/alertas');
        const alertas = await response.json();
        if (alertas.length === 0) {
            mostrarNotificacion('✅ No hay alertas', 'success');
            return;
        }
        let mensaje = `⚠️ ALERTA DE CONSUMIBLES - Matti's BBQ\n\n`;
        alertas.forEach(a => {
            mensaje += `📦 ${a.nombre}: ${a.stock_actual} ${a.unidad} (mínimo: ${a.stock_minimo})\n`;
        });
        mensaje += `\n🕐 ${new Date().toLocaleString()}`;
        
        await fetch('/api/test-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensaje })
        });
        mostrarNotificacion('📱 Notificación enviada', 'success');
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

// ==================== RECETAS ====================
async function abrirReceta(productoId, productoNombre) {
    document.getElementById('recetaProductoId').value = productoId;
    document.getElementById('recetaProductoNombre').innerText = productoNombre;
    document.getElementById('recetaCantidad').value = 1;
    document.getElementById('recetaTipoServicio').value = 'local';
    
    await cargarSelectConsumibles();
    await cargarRecetaActual(productoId, 'local');
    await cargarRecetaActual(productoId, 'llevar');
    
    if (!recetaModal) {
        recetaModal = new bootstrap.Modal(document.getElementById('recetaModal'));
    }
    recetaModal.show();
}

async function cargarSelectConsumibles() {
    try {
        const response = await fetch('/api/consumibles');
        const consumibles = await response.json();
        const select = document.getElementById('recetaConsumibleSelect');
        select.innerHTML = '<option value="">-- Seleccionar --</option>' +
            consumibles.map(c => `<option value="${c.id}">${c.nombre} (${c.stock_actual} ${c.unidad})</option>`).join('');
    } catch (error) { console.error('Error:', error); }
}

async function cargarRecetaActual(productoId, tipo_servicio) {
    try {
        const response = await fetch(`/api/recetas/${productoId}?tipo_servicio=${tipo_servicio}`);
        const recetas = await response.json();
        
        const containerId = tipo_servicio === 'local' ? 'recetaListaLocal' : 'recetaListaLlevar';
        const container = document.getElementById(containerId);
        
        if (!container) {
            console.error('❌ No existe:', containerId);
            return;
        }
        
        if (!recetas || recetas.length === 0) {
            container.innerHTML = '<div class="text-muted text-center p-3">Sin consumibles asignados</div>';
            return;
        }
        
        container.innerHTML = recetas.map(r => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <strong>${r.nombre}</strong>
                    <span class="badge bg-info ms-2">${r.cantidad} ${r.unidad} por venta</span>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarReceta(${r.id}, ${productoId})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    } catch (error) { console.error('Error:', error); }
}

async function agregarConsumibleAReceta() {
    const productoId = document.getElementById('recetaProductoId').value;
    const consumibleId = document.getElementById('recetaConsumibleSelect').value;
    const cantidad = parseInt(document.getElementById('recetaCantidad').value) || 1;
    const tipo_servicio = document.getElementById('recetaTipoServicio').value;
    
    if (!consumibleId) {
        mostrarNotificacion('⚠️ Selecciona un consumible', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/recetas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                producto_id: parseInt(productoId),
                consumible_id: parseInt(consumibleId),
                cantidad: cantidad,
                tipo_servicio: tipo_servicio
            })
        });
        
        const data = await response.json();
        console.log('✅ Respuesta:', data);
        
        if (data.success) {
            const label = tipo_servicio === 'local' ? '🍽️ Local' : '🥡 Llevar';
            mostrarNotificacion(`✅ Agregado (${label})`, 'success');
            document.getElementById('recetaConsumibleSelect').value = '';
            document.getElementById('recetaCantidad').value = 1;
            cargarRecetaActual(productoId, tipo_servicio);
        }
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

async function eliminarReceta(recetaId, productoId) {
    if (!confirm('¿Quitar este consumible de la receta?')) return;
    try {
        await fetch(`/api/recetas/${recetaId}`, { method: 'DELETE' });
        mostrarNotificacion('✅ Eliminado', 'success');
        cargarRecetaActual(productoId, 'local');
        cargarRecetaActual(productoId, 'llevar');
    } catch (error) { mostrarNotificacion('❌ Error', 'danger'); }
}

// ==================== NOTIFICACIONES ====================
function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    const audio = document.getElementById('notificacion');
    audio.play().catch(() => {});
    setTimeout(() => div.remove(), 4000);
}

// ==================== INICIO ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🛡️ Panel de Administración cargado');
    if (sessionStorage.getItem('adminAuth') === 'true') {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        cargarDashboard();
        cargarProductos();
        cargarBackupInfo();
        configurarDropZone();
        cargarHistorial();
        cargarConsumibles();
    }
});

// ==================== EXPONER FUNCIONES ====================
window.verificarPassword = verificarPassword;
window.cargarDashboard = cargarDashboard;
window.cargarProductos = cargarProductos;
window.mostrarModalProducto = mostrarModalProducto;
window.editarProducto = editarProducto;
window.guardarProducto = guardarProducto;
window.eliminarProducto = eliminarProducto;
window.crearRespaldo = crearRespaldo;
window.restaurarRespaldo = restaurarRespaldo;
window.cargarHistorial = cargarHistorial;
window.eliminarHistorial = eliminarHistorial;
window.vaciarHistorial = vaciarHistorial;
window.cargarVentas = cargarVentas;
window.cargarConsumibles = cargarConsumibles;
window.mostrarModalConsumible = mostrarModalConsumible;
window.editarConsumible = editarConsumible;
window.guardarConsumible = guardarConsumible;
window.abrirCompra = abrirCompra;
window.agregarStockConsumible = agregarStockConsumible;
window.eliminarConsumible = eliminarConsumible;
window.notificarWhatsAppAlertas = notificarWhatsAppAlertas;
window.abrirReceta = abrirReceta;
window.agregarConsumibleAReceta = agregarConsumibleAReceta;
window.eliminarReceta = eliminarReceta;