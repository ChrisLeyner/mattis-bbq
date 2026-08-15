// ==================== VARIABLES ====================
const ADMIN_PASSWORD = 'matti2026'; // CAMBIA ESTA CONTRASEÑA
let productModal = null;
let editMode = false;
let fileToRestore = null;
let confirmModal = null;

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
        const data = await response.json();
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
                        ${data.ventasPorMetodo ? data.ventasPorMetodo.map(m => `
                            <div class="d-flex justify-content-between border-bottom py-1">
                                <span>${m.metodo_pago}</span>
                                <span><strong>$${m.total.toFixed(2)}</strong> (${m.cantidad} ventas)</span>
                            </div>
                        `).join('') : '<p class="text-muted">No hay datos</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error cargando dashboard:', error);
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
                        <button class="btn btn-sm btn-outline-primary" onclick="editarProducto(${p.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${p.id})"><i class="fas fa-trash"></i></button>
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
        fetch(`/api/products`)
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

function editarProducto(id) {
    mostrarModalProducto(id);
}

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
    const body = id ? { nombre, precio, stock, imagen } : { nombre, precio, stock, imagen };

    try {
        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('✅ Producto guardado correctamente', 'success');
            productModal.hide();
            cargarProductos();
            cargarDashboard();
        }
    } catch (error) {
        console.error('Error guardando producto:', error);
        mostrarNotificacion('❌ Error al guardar producto', 'danger');
    }
}

async function eliminarProducto(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    try {
        const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('✅ Producto eliminado', 'success');
            cargarProductos();
            cargarDashboard();
        }
    } catch (error) {
        console.error('Error eliminando producto:', error);
        mostrarNotificacion('❌ Error al eliminar', 'danger');
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
        } else {
            indicator.className = 'status-indicator status-warning';
            statusText.className = 'badge bg-warning';
            statusText.innerText = 'VACÍA';
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('dbInfo').innerHTML = `
            <small class="text-danger">❌ Error al conectar con la base de datos</small>
        `;
        const indicator = document.getElementById('statusIndicator');
        indicator.className = 'status-indicator status-offline';
        document.getElementById('statusText').className = 'badge bg-danger';
        document.getElementById('statusText').innerText = 'OFFLINE';
    }
}

function configurarDropZone() {
    const dropZone = document.getElementById('dropZone');
    const restoreInput = document.getElementById('restoreInput');

    if (!dropZone) return;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.sqlite') || file.name.endsWith('.db'))) {
            restaurarRespaldo({ target: { files: [file] } });
        } else {
            mostrarNotificacion('⚠️ Selecciona un archivo .sqlite válido', 'warning');
        }
    });

    restoreInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            restaurarRespaldo(e);
        }
    });
}

function crearRespaldo() {
    mostrarNotificacion('⏳ Generando respaldo...', 'info');
    const link = document.createElement('a');
    link.href = '/admin/backup';
    link.download = `respaldo_mattis_${new Date().toISOString().slice(0,10)}.sqlite`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarNotificacion('✅ Respaldo generado correctamente', 'success');
    agregarAlHistorial('respaldo', new Date().toISOString());
}

async function restaurarRespaldo(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ Restaurar un respaldo borrará TODOS los datos actuales. ¿Continuar?')) return;

    const formData = new FormData();
    formData.append('backup', file);

    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.innerText = 'Subiendo archivo...';
    progressPercent.innerText = '0%';

    try {
        const response = await fetch('/admin/restore', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (result.success) {
            progressBar.style.width = '100%';
            progressText.innerText = '✅ ¡Restauración completada!';
            progressPercent.innerText = '100%';
            mostrarNotificacion('✅ Respaldo restaurado correctamente. Recargando...', 'success');
            setTimeout(() => location.reload(), 2000);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        progressBar.style.width = '0%';
        progressText.innerText = '❌ Error: ' + error.message;
        progressPercent.innerText = 'ERROR';
        mostrarNotificacion('❌ Error al restaurar: ' + error.message, 'danger');
    }
}

// ==================== HISTORIAL DE RESPALDOS ====================
function cargarHistorial() {
    const historial = obtenerHistorial();
    const container = document.getElementById('historialList');
    
    if (historial.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-3">No hay respaldos registrados</div>';
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
                <button class="btn btn-sm btn-outline-success" onclick="descargarHistorial()">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarHistorial(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function agregarAlHistorial(tipo, fecha) {
    let historial = obtenerHistorial();
    historial.unshift({ tipo, fecha });
    if (historial.length > 50) {
        historial = historial.slice(0, 50);
    }
    localStorage.setItem('backupHistory', JSON.stringify(historial));
    cargarHistorial();
}

function obtenerHistorial() {
    try {
        return JSON.parse(localStorage.getItem('backupHistory')) || [];
    } catch {
        return [];
    }
}

function descargarHistorial() {
    window.open('/admin/backup', '_blank');
}

function eliminarHistorial(index) {
    if (confirm('¿Eliminar este registro del historial?')) {
        let historial = obtenerHistorial();
        historial.splice(index, 1);
        localStorage.setItem('backupHistory', JSON.stringify(historial));
        cargarHistorial();
    }
}

function vaciarHistorial() {
    if (confirm('¿Vaciar todo el historial de respaldos?')) {
        localStorage.removeItem('backupHistory');
        cargarHistorial();
        mostrarNotificacion('Historial vaciado', 'info');
    }
}

// ==================== VENTAS ====================
async function cargarVentas(periodo) {
    try {
        const response = await fetch(`/api/admin/sales/${periodo}`);
        const data = await response.json();
        document.getElementById('salesContent').innerHTML = `
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
                        <h6>💳 Por Método de Pago</h6>
                        ${data.porMetodo ? data.porMetodo.map(m => `
                            <div class="d-flex justify-content-between border-bottom py-1">
                                <span>${m.metodo_pago}</span>
                                <span><strong>$${m.total.toFixed(2)}</strong> (${m.cantidad} ventas)</span>
                            </div>
                        `).join('') : '<p class="text-muted">No hay datos</p>'}
                    </div>
                </div>
                <div class="col-12">
                    <div class="admin-card">
                        <h6>📋 Últimas ventas</h6>
                        ${data.ultimasVentas && data.ultimasVentas.length > 0 ? data.ultimasVentas.map(v => `
                            <div class="d-flex justify-content-between border-bottom py-1 small">
                                <span>${v.order_number || v.id}</span>
                                <span>${v.cliente}</span>
                                <span>$${v.total.toFixed(2)}</span>
                                <span>${v.metodo_pago}</span>
                                <span class="text-muted">${new Date(v.created_at).toLocaleDateString()}</span>
                            </div>
                        `).join('') : '<p class="text-muted">No hay ventas recientes</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error cargando ventas:', error);
        document.getElementById('salesContent').innerHTML = '<div class="alert alert-danger">Error al cargar ventas</div>';
    }
}

// ==================== NOTIFICACIONES ====================
function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
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
    }
});