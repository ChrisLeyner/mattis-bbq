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

function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

socket.on('nueva-orden', () => cargarOrdenes());
socket.on('estado-actualizado', () => cargarOrdenes());