let socket = io();

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    cargarOrdenes();
    setInterval(cargarOrdenes, 5000);
});

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

// ==================== RENDERIZAR ÓRDENES (ÚNICA VERSIÓN) ====================
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
                <div class="order-card p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <h5 class="mb-0">${escapeHtml(order.cliente)}</h5>
                        <div>
                            <span class="badge bg-warning">${order.estado.toUpperCase()}</span>
                            <button class="btn btn-sm btn-danger ms-1" 
                                onclick="eliminarOrden(${order.id}, '${escapeHtml(order.order_number)}', '${escapeHtml(order.cliente)}')" 
                                title="Eliminar orden">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <small>${order.order_number}</small>
                    <hr>
                    ${items.map(item => `<div><strong>${item.cantidad}x</strong> ${escapeHtml(item.nombre)}</div>`).join('')}
                    <hr>
                    ${order.estado === 'pendiente' ? `
                        <button onclick="marcarPreparado(${order.id})" class="btn btn-warning w-100">✅ MARCAR COMO PREPARADO</button>
                    ` : `
                        <button class="btn btn-secondary w-100" disabled>⚙️ PREPARADO (esperando cobro)</button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// ==================== MARCAR COMO PREPARADO ====================
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
        } else {
            mostrarNotificacion('❌ Error: ' + (data.error || 'desconocido'), 'danger');
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion('❌ Error de red', 'danger');
    }
}

// ==================== ELIMINAR ORDEN ====================
async function eliminarOrden(orderId, orderNumber, cliente) {
    const confirmar = confirm(
        `⚠️ ¿ELIMINAR ORDEN?\n\n` +
        `Orden: ${orderNumber}\n` +
        `Cliente: ${cliente}\n\n` +
        `Esta acción NO se puede deshacer.`
    );
    
    if (!confirmar) return;
    
    const confirmar2 = confirm(`¿Estás COMPLETAMENTE seguro de eliminar la orden ${orderNumber}?`);
    if (!confirmar2) return;
    
    try {
        mostrarNotificacion('⏳ Eliminando orden...', 'info');
        
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            mostrarNotificacion(`✅ Orden ${orderNumber} eliminada`, 'success');
            cargarOrdenes();
            const audio = document.getElementById('notificacion');
            audio.play().catch(() => {});
        } else {
            mostrarNotificacion('❌ Error: ' + (data.error || 'desconocido'), 'danger');
        }
    } catch (error) {
        console.error('Error eliminando orden:', error);
        mostrarNotificacion('❌ Error de conexión', 'danger');
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
    console.log('📨 Estado actualizado');
    cargarOrdenes();
});

socket.on('orden-eliminada', (data) => {
    console.log('📨 Orden eliminada:', data);
    cargarOrdenes();
    mostrarNotificacion(`🗑️ Orden ${data.order_number} eliminada`, 'info');
});

// ==================== EXPONER FUNCIONES GLOBALES ====================
window.eliminarOrden = eliminarOrden;
window.marcarPreparado = marcarPreparado;
window.cargarOrdenes = cargarOrdenes;