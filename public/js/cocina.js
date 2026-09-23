let socket = io();

document.addEventListener('DOMContentLoaded', () => {
    cargarOrdenes();
    setInterval(cargarOrdenes, 5000);
});

async function cargarOrdenes() {
    try {
        const response = await fetch('/api/orders/kitchen');
        const orders = await response.json();
        renderizarOrdenesCocina(orders);
    } catch (error) {
        console.error('Error:', error);
    }
}

function renderizarOrdenesCocina(orders) {
    const container = document.getElementById('ordenesCocina');
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
                    <div class="d-flex justify-content-between">
                        <h5>${order.cliente}</h5>
                        <span class="badge bg-warning">${order.estado.toUpperCase()}</span>
                    </div>
                    <small>${order.order_number}</small>
                    <hr>
                    ${items.map(item => `<div><strong>${item.cantidad}x</strong> ${item.nombre}</div>`).join('')}
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

// ==================== RENDERIZAR ÓRDENES ====================
function renderizarOrdenesCocina(orders) {
    const container = document.getElementById('ordenesCocina');
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
                    <div class="d-flex justify-content-between">
                        <h5>${order.cliente}</h5>
                        <div>
                            <span class="badge bg-warning">${order.estado.toUpperCase()}</span>
                            <button class="btn btn-sm btn-danger ms-1" onclick="eliminarOrden(${order.id}, '${order.order_number}', '${order.cliente}')" title="Eliminar orden">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <small>${order.order_number}</small>
                    <hr>
                    ${items.map(item => `<div><strong>${item.cantidad}x</strong> ${item.nombre}</div>`).join('')}
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

// ==================== ELIMINAR ORDEN ====================
async function eliminarOrden(orderId, orderNumber, cliente) {
    const confirmar = confirm(
        `⚠️ ¿ELIMINAR ORDEN?\n\n` +
        `Orden: ${orderNumber}\n` +
        `Cliente: ${cliente}\n\n` +
        `Esta acción NO se puede deshacer.`
    );
    
    if (!confirmar) return;
    
    // Segunda confirmación para evitar errores
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

// ==================== SOCKET - ESCUCHAR ORDEN ELIMINADA ====================
socket.on('orden-eliminada', (data) => {
    console.log('📨 Orden eliminada:', data);
    cargarOrdenes();
    mostrarNotificacion(`🗑️ Orden ${data.order_number} eliminada`, 'info');
});


function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

socket.on('nueva-orden', () => cargarOrdenes());
socket.on('estado-actualizado', () => cargarOrdenes());