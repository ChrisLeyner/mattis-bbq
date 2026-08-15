// ==================== VARIABLES ====================
const ADMIN_PASSWORD = 'matti2026'; // CAMBIA ESTA CONTRASEÑA
let productModal = null;
let editMode = false;

// ==================== VERIFICAR CONTRASEÑA ====================
function verificarPassword() {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        cargarDashboard();
        cargarProductos();
        cargarBackupInfo();
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
        // Cargar datos del producto
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
        document.getElementById('backupInfo').innerHTML = `
            <div class="alert alert-info mt-3">
                <strong>📊 Información de la base de datos</strong><br>
                Tamaño: ${data.size_mb} MB<br>
                Última modificación: ${new Date(data.modified).toLocaleString()}
            </div>
        `;
    } catch (error) {
        console.error('Error cargando info de backup:', error);
    }
}

async function restaurarRespaldo(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ Restaurar un respaldo borrará TODOS los datos actuales. ¿Continuar?')) return;

    const formData = new FormData();
    formData.append('backup', file);

    try {
        const response = await fetch('/admin/restore', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            mostrarNotificacion('✅ Respaldo restaurado correctamente', 'success');
            setTimeout(() => location.reload(), 2000);
        } else {
            mostrarNotificacion('❌ Error al restaurar: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error restaurando:', error);
        mostrarNotificacion('❌ Error al restaurar', 'danger');
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
    setTimeout(() => div.remove(), 3000);
}

// ==================== INICIO ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🛡️ Panel de Administración cargado');
    // Si ya está autenticado, mostrar contenido
    if (sessionStorage.getItem('adminAuth') === 'true') {
        document.getElementById('passwordOverlay').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        cargarDashboard();
        cargarProductos();
        cargarBackupInfo();
    }
});