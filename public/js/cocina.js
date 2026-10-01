let socket = io();
let todosLosProductos = [];
let productosNuevos = []; // Productos agregados temporalmente

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    cargarOrdenes();
    cargarProductos();
    setInterval(cargarOrdenes, 5000);
});

// ==================== CARGAR PRODUCTOS ====================
async function cargarProductos() {
    try {
        const response = await fetch('/api/products');
        todosLosProductos = await response.json();
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

// ==================== CARGAR ÓRDENES ====================
async function cargarOrdenes() {
    try {
        const response = await fetch('/api/orders/kitchen');
        const orders = await response.json();
        renderizarOrdenesCocina(orders);
    } catch (error) {
        console.error('Error:', error);
    }
}

// ==================== RENDERIZAR ====================
function renderizarOrdenesCocina(orders) {
    const container = document.getElementById('ordenesCocina');
    if (!container) return;
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-5 text-white-50">🍽️ No hay órdenes pendientes</div>';
        return;
    }
    
    container.innerHTML = orders.map(order => {
        let items = [];
        try { items = JSON.parse(order.items || '[]'); } catch(e) {}
        
        return `
            <div class="col-md-6 col-lg-4">
                <div class="order-card ${order.estado} p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="mb-0">${escapeHtml(order.cliente)}</h5>
                            <small class="timestamp">${order.order_number}</small>
                        </div>
                        <div>
                            <span class="badge ${order.estado === 'preparado' ? 'badge-preparado' : 'badge-pendiente'}">${order.estado.toUpperCase()}</span>
                            <button class="btn btn-sm btn-danger ms-1" onclick="eliminarOrden(${order.id}, '${escapeHtml(order.order_number)}', '${escapeHtml(order.cliente)}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="mt-3">
                        ${items.map(item => `
                            <div class="order-item d-flex justify-content-between">
                                <span><strong>${item.cantidad}x</strong> ${escapeHtml(item.nombre)}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <hr>
                    
                    <div class="row g-2">
                        <div class="col-6">
                            <button onclick="abrirEditarOrden(${order.id}, '${escapeHtml(order.order_number)}')" class="btn btn-editar w-100 btn-sm py-2">
                                ✏️ EDITAR
                            </button>
                        </div>
                        <div class="col-6">
                            ${order.estado === 'pendiente' ? `
                                <button onclick="marcarPreparado(${order.id})" class="btn btn-preparar w-100 btn-sm py-2">
                                    ✅ PREPARADO
                                </button>
                            ` : `
                                <button class="btn btn-secondary w-100 btn-sm py-2" disabled>
                                    ⚙️ LISTO
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== MARCAR PREPARADO ====================
async function marcarPreparado(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'preparado' })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            mostrarNotificacion('✅ Orden preparada', 'success');
            cargarOrdenes();
            const audio = document.getElementById('notificacion');
            audio.play().catch(()=>{});
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion('❌ Error de red', 'danger');
    }
}

// ==================== ELIMINAR ORDEN ====================
async function eliminarOrden(orderId, orderNumber, cliente) {
    if (!confirm(`⚠️ ¿ELIMINAR ORDEN?\n\nOrden: ${orderNumber}\nCliente: ${cliente}`)) return;
    if (!confirm(`¿Estás COMPLETAMENTE seguro?`)) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok && data.success) {
            mostrarNotificacion(`✅ Orden eliminada`, 'success');
            cargarOrdenes();
        }
    } catch (error) {
        mostrarNotificacion('❌ Error', 'danger');
    }
}

// ==================== ABRIR EDITAR ORDEN ====================
async function abrirEditarOrden(orderId, orderNumber) {
    document.getElementById('editOrdenId').value = orderId;
    document.getElementById('editOrdenNumero').innerText = orderNumber;
    document.getElementById('editCantidad').value = 1;
    document.getElementById('editProductoSelect').value = '';
    productosNuevos = [];
    
    // Cargar productos actuales de la orden
    await cargarProductosActualesDeOrden(orderId);
    
    // Cargar select de productos disponibles
    cargarSelectProductos();
    
    // Renderizar lista de nuevos (vacía)
    renderizarProductosNuevos();
    
    const modal = new bootstrap.Modal(document.getElementById('editarOrdenModal'));
    modal.show();
}

async function cargarProductosActualesDeOrden(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`);
        const order = await response.json();
        let items = [];
        try { items = JSON.parse(order.items || '[]'); } catch(e) {}
        
        const container = document.getElementById('editListaActual');
        if (items.length === 0) {
            container.innerHTML = '<div class="text-muted">Sin productos</div>';
            return;
        }
        
        container.innerHTML = items.map(item => `
            <div class="d-flex justify-content-between border-bottom py-1">
                <span><strong>${item.cantidad}x</strong> ${escapeHtml(item.nombre)}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
    }
}

function cargarSelectProductos() {
    const select = document.getElementById('editProductoSelect');
    select.innerHTML = '<option value="">-- Seleccionar producto --</option>' +
        todosLosProductos.filter(p => p.stock > 0).map(p => 
            `<option value="${p.id}" data-nombre="${escapeHtml(p.nombre)}" data-precio="${p.precio}">${p.nombre} - $${p.precio.toFixed(2)} (Stock: ${p.stock})</option>`
        ).join('');
}

// ==================== AGREGAR PRODUCTO A LA LISTA TEMPORAL ====================
function agregarProductoAOrden() {
    const select = document.getElementById('editProductoSelect');
    const productoId = select.value;
    const cantidad = parseInt(document.getElementById('editCantidad').value) || 1;
    
    if (!productoId) {
        mostrarNotificacion('⚠️ Selecciona un producto', 'warning');
        return;
    }
    
    const option = select.options[select.selectedIndex];
    const nombre = option.getAttribute('data-nombre');
    const precio = parseFloat(option.getAttribute('data-precio'));
    
    // Verificar si ya está en la lista de nuevos
    const existente = productosNuevos.find(p => p.id === parseInt(productoId));
    if (existente) {
        existente.cantidad += cantidad;
    } else {
        productosNuevos.push({
            id: parseInt(productoId),
            nombre: nombre,
            precio: precio,
            cantidad: cantidad
        });
    }
    
    // Limpiar select y cantidad
    select.value = '';
    document.getElementById('editCantidad').value = 1;
    
    renderizarProductosNuevos();
    mostrarNotificacion(`➕ ${nombre} x${cantidad} agregado`, 'success');
}

function renderizarProductosNuevos() {
    const container = document.getElementById('editListaNuevos');
    if (productosNuevos.length === 0) {
        container.innerHTML = '<div class="text-muted text-center p-2">Sin productos nuevos</div>';
        document.getElementById('btnGuardarEdicion').disabled = true;
        return;
    }
    
    document.getElementById('btnGuardarEdicion').disabled = false;
    
    container.innerHTML = productosNuevos.map((p, index) => `
        <div class="order-item-nuevo d-flex justify-content-between align-items-center">
            <span><strong>${p.cantidad}x</strong> ${escapeHtml(p.nombre)} - $${(p.precio * p.cantidad).toFixed(2)}</span>
            <button class="btn btn-sm btn-danger" onclick="quitarProductoNuevo(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function quitarProductoNuevo(index) {
    productosNuevos.splice(index, 1);
    renderizarProductosNuevos();
}

// ==================== GUARDAR EDICIÓN ====================
async function guardarEdicionOrden() {
    const orderId = document.getElementById('editOrdenId').value;
    
    if (productosNuevos.length === 0) {
        mostrarNotificacion('⚠️ Agrega al menos un producto', 'warning');
        return;
    }
    
    if (!confirm(`¿Agregar ${productosNuevos.length} producto(s) y reactivar la orden?`)) return;
    
    try {
        document.getElementById('btnGuardarEdicion').disabled = true;
        document.getElementById('btnGuardarEdicion').innerText = '⏳ Guardando...';
        
        const response = await fetch(`/api/orders/${orderId}/add-items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevosItems: productosNuevos })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            mostrarNotificacion(`✅ Orden actualizada. Total: $${data.nuevoTotal.toFixed(2)}`, 'success');
            
            // Cerrar modal
            bootstrap.Modal.getInstance(document.getElementById('editarOrdenModal')).hide();
            
            // Recargar órdenes
            cargarOrdenes();
            cargarProductos(); // Recargar stock
            
            // Reproducir sonido
            const audio = document.getElementById('notificacion');
            audio.play().catch(() => {});
        } else {
            mostrarNotificacion('❌ Error: ' + (data.error || 'desconocido'), 'danger');
            document.getElementById('btnGuardarEdicion').disabled = false;
            document.getElementById('btnGuardarEdicion').innerText = '💾 Guardar y Reactivar';
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error de conexión', 'danger');
        document.getElementById('btnGuardarEdicion').disabled = false;
        document.getElementById('btnGuardarEdicion').innerText = '💾 Guardar y Reactivar';
    }
}

// ==================== UTILIDADES ====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        if (m === "'") return '&#39;';
        return m;
    });
}

function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ==================== SOCKET EVENTS ====================
socket.on('nueva-orden', () => {
    console.log('🔔 Nueva orden recibida');
    cargarOrdenes();
    const audio = document.getElementById('notificacion');
    audio.play().catch(() => {});
});

socket.on('estado-actualizado', () => {
    cargarOrdenes();
});

socket.on('orden-eliminada', (data) => {
    cargarOrdenes();
    mostrarNotificacion(`🗑️ Orden eliminada`, 'info');
});

socket.on('orden-actualizada', (data) => {
    console.log('📨 Orden actualizada:', data);
    cargarOrdenes();
    if (data.reactivada) {
        mostrarNotificacion(`🔔 Orden #${data.orderId} actualizada con nuevos productos`, 'info');
        const audio = document.getElementById('notificacion');
        audio.play().catch(() => {});
    }
});

// ==================== EXPONER FUNCIONES ====================
window.eliminarOrden = eliminarOrden;
window.marcarPreparado = marcarPreparado;
window.cargarOrdenes = cargarOrdenes;
window.abrirEditarOrden = abrirEditarOrden;
window.agregarProductoAOrden = agregarProductoAOrden;
window.quitarProductoNuevo = quitarProductoNuevo;
window.guardarEdicionOrden = guardarEdicionOrden;