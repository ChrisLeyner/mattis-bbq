let productos = [];
let carrito = [];
let socket = io();
let turnoAbierto = false;

// ========== FUNCIONES DE CAJA ==========

// Verificar estado del turno al cargar la página
async function verificarEstadoTurno() {
    try {
        const response = await fetch('/api/cash/status');
        const turno = await response.json();
        
        if (turno && turno.estado === 'abierta') {
            // Turno ya está abierto
            turnoAbierto = true;
            document.getElementById('modalApertura').style.display = 'none';
            document.getElementById('btnCerrarTurno').style.display = 'block';
            cargarProductos();
            mostrarNotificacion(`✅ Turno abierto - Fondo: $${turno.fondo_inicial?.toFixed(2)}`, 'success');
        } else {
            // No hay turno abierto, mostrar modal
            turnoAbierto = false;
            document.getElementById('modalApertura').style.display = 'block';
            document.getElementById('btnCerrarTurno').style.display = 'none';
        }
    } catch (error) {
        console.error('Error verificando turno:', error);
        document.getElementById('modalApertura').style.display = 'block';
    }
}

// Abrir caja
async function abrirCaja() {
    const fondo = parseFloat(document.getElementById('fondoInicial').value);
    const usuario = document.getElementById('usuario').value || 'Admin';
    
    if (isNaN(fondo) || fondo < 0) {
        mostrarNotificacion('❌ Ingrese un monto válido', 'danger');
        return;
    }
    
    try {
        const response = await fetch('/api/cash/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fondo_inicial: fondo, usuario })
        });
        
        if (response.ok) {
            turnoAbierto = true;
            document.getElementById('modalApertura').style.display = 'none';
            document.getElementById('btnCerrarTurno').style.display = 'block';
            cargarProductos();
            mostrarNotificacion(`✅ Caja abierta con $${fondo.toFixed(2)}`, 'success');
        } else {
            mostrarNotificacion('❌ Error al abrir caja', 'danger');
        }
    } catch (error) {
        mostrarNotificacion('❌ Error de conexión', 'danger');
    }
}

// Cerrar turno
async function cerrarTurno() {
    if (!confirm('⚠️ ¿Estás seguro de cerrar el turno?\n\nSe generará el reporte y se reiniciará el sistema.')) {
        return;
    }
    
    mostrarNotificacion('⏳ Cerrando turno...', 'info');
    
    try {
        // Obtener datos del turno actual
        const turnoResponse = await fetch('/api/cash/status');
        const turno = await turnoResponse.json();
        
        // Obtener ventas del turno
        const ordersResponse = await fetch('/api/orders');
        const orders = await ordersResponse.json();
        
        // Calcular totales
        let totalVentas = 0;
        let ventasEfectivo = 0;
        let ventasTarjeta = 0;
        let ventasTransferencia = 0;
        
        orders.forEach(order => {
            if (order.estado === 'pagado' || order.estado === 'entregado') {
                totalVentas += order.total;
                if (order.metodo_pago === 'Efectivo') ventasEfectivo += order.total;
                else if (order.metodo_pago === 'Tarjeta') ventasTarjeta += order.total;
                else if (order.metodo_pago === 'Transferencia') ventasTransferencia += order.total;
            }
        });
        
        const efectivoEnCaja = (turno.fondo_inicial || 0) + ventasEfectivo;
        
        // Mostrar resumen antes de cerrar
        const resumen = `
            📊 RESUMEN DEL TURNO
            ─────────────────────
            Fondo inicial: $${(turno.fondo_inicial || 0).toFixed(2)}
            Ventas Efectivo: $${ventasEfectivo.toFixed(2)}
            Ventas Tarjeta: $${ventasTarjeta.toFixed(2)}
            Ventas Transferencia: $${ventasTransferencia.toFixed(2)}
            ─────────────────────
            TOTAL VENDIDO: $${totalVentas.toFixed(2)}
            EFECTIVO EN CAJA: $${efectivoEnCaja.toFixed(2)}
        `;
        
        if (!confirm(resumen + '\n\n¿Confirmar cierre de turno?')) {
            return;
        }
        
        // Actualizar estado del turno a cerrado
        const response = await fetch('/api/cash/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fondo_final: efectivoEnCaja,
                total_vendido: totalVentas
            })
        });
        
        if (response.ok) {
            mostrarNotificacion('✅ Turno cerrado exitosamente', 'success');
            
            // Recargar la página después de 2 segundos
            setTimeout(() => {
                location.reload();
            }, 2000);
        } else {
            mostrarNotificacion('❌ Error al cerrar turno', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error al cerrar turno', 'danger');
    }
}

// ========== FUNCIONES DE PRODUCTOS ==========

// Cargar productos
async function cargarProductos() {
    try {
        const response = await fetch('/api/products');
        productos = await response.json();
        renderizarProductos();
    } catch (error) {
        console.error('Error cargando productos:', error);
        mostrarNotificacion('❌ Error cargando productos', 'danger');
    }
}

// Renderizar productos
function renderizarProductos() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    const busqueda = document.getElementById('search')?.value.toLowerCase() || '';
    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda));
    
    if (filtrados.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center text-muted">No hay productos</div>';
        return;
    }
    
    grid.innerHTML = filtrados.map(p => `
        <div class="col-6 col-md-4 col-lg-3">
            <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" 
                 onclick="agregarAlCarrito(${p.id})">
                <div>
                    <img src="${p.imagen || 'https://via.placeholder.com/80'}" 
                         style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
                </div>
                <h6 class="mt-1">${p.nombre}</h6>
                <p class="text-danger fw-bold mb-0">$${p.precio.toFixed(2)}</p>
                ${p.stock <= 5 ? `<span class="badge bg-warning badge-stock">Stock: ${p.stock}</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ========== FUNCIONES DEL CARRITO ==========

// Agregar al carrito
function agregarAlCarrito(id) {
    if (!turnoAbierto) {
        mostrarNotificacion('⚠️ Debe abrir el turno primero', 'warning');
        return;
    }
    
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    
    if (producto.stock <= 0) {
        mostrarNotificacion(`❌ ${producto.nombre} sin stock`, 'danger');
        return;
    }
    
    const existente = carrito.find(item => item.id === id);
    if (existente) {
        if (existente.cantidad + 1 > producto.stock) {
            mostrarNotificacion(`❌ Stock insuficiente de ${producto.nombre}`, 'danger');
            return;
        }
        existente.cantidad++;
    } else {
        carrito.push({
            id: producto.id,
            nombre: producto.nombre,
            precio: producto.precio,
            cantidad: 1
        });
    }
    
    actualizarCarrito();
    mostrarNotificacion(`✓ ${producto.nombre} agregado`, 'success');
}

// Actualizar carrito
function actualizarCarrito() {
    const contenedor = document.getElementById('cartItems');
    const totalSpan = document.getElementById('cartTotal');
    
    if (!contenedor) return;
    
    if (carrito.length === 0) {
        contenedor.innerHTML = '<p class="text-muted text-center">Carrito vacío</p>';
        if (totalSpan) totalSpan.innerText = '$0.00';
        return;
    }
    
    let total = 0;
    contenedor.innerHTML = carrito.map(item => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        return `
            <div class="cart-item d-flex justify-content-between align-items-center">
                <span class="fw-bold">${item.cantidad}x</span>
                <span class="flex-grow-1 ms-2">${item.nombre}</span>
                <span>$${subtotal.toFixed(2)}</span>
                <button class="btn btn-sm btn-link text-danger" onclick="eliminarDelCarrito(${item.id})">✖</button>
            </div>
        `;
    }).join('');
    
    if (totalSpan) totalSpan.innerText = `$${total.toFixed(2)}`;
}

// Eliminar del carrito
function eliminarDelCarrito(id) {
    carrito = carrito.filter(item => item.id !== id);
    actualizarCarrito();
}

// ========== FUNCIONES DE ÓRDENES ==========

// Procesar pago
async function procesarPago() {
    if (!turnoAbierto) {
        mostrarNotificacion('⚠️ Debe abrir el turno primero', 'warning');
        return;
    }
    
    const cliente = document.getElementById('cliente').value.trim();
    const metodoPago = document.getElementById('metodoPago').value;
    
    if (!cliente) {
        mostrarNotificacion('⚠️ Ingrese nombre del cliente', 'warning');
        return;
    }
    
    if (carrito.length === 0) {
        mostrarNotificacion('⚠️ Carrito vacío', 'warning');
        return;
    }
    
    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    
    if (metodoPago === 'Efectivo') {
        const recibido = parseFloat(document.getElementById('recibido').value);
        if (isNaN(recibido) || recibido < total) {
            mostrarNotificacion('⚠️ Monto insuficiente', 'warning');
            return;
        }
    }
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente,
                items: carrito,
                total,
                metodo_pago: metodoPago
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            const cambio = document.getElementById('recibido').value;
            const mensaje = metodoPago === 'Efectivo' && cambio ? 
                `\nCambio: $${(parseFloat(cambio) - total).toFixed(2)}` : '';
            
            mostrarNotificacion(`✅ Venta exitosa! Orden: ${result.order.order_number}${mensaje}`, 'success');
            limpiarCarrito();
            cargarProductos(); // Recargar stocks
        } else {
            mostrarNotificacion('❌ Error al procesar', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error de conexión', 'danger');
    }
}

// Enviar a cocina
async function enviarACocina() {
    if (!turnoAbierto) {
        mostrarNotificacion('⚠️ Debe abrir el turno primero', 'warning');
        return;
    }
    
    const cliente = document.getElementById('cliente').value.trim();
    
    if (!cliente) {
        mostrarNotificacion('⚠️ Ingrese nombre del cliente', 'warning');
        return;
    }
    
    if (carrito.length === 0) {
        mostrarNotificacion('⚠️ Carrito vacío', 'warning');
        return;
    }
    
    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente,
                items: carrito,
                total,
                metodo_pago: 'Pendiente'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarNotificacion(`👨‍🍳 Orden enviada a cocina: ${result.order.order_number}`, 'success');
            limpiarCarrito();
        }
    } catch (error) {
        mostrarNotificacion('❌ Error al enviar', 'danger');
    }
}

// Limpiar carrito
function limpiarCarrito() {
    carrito = [];
    if (document.getElementById('cliente')) document.getElementById('cliente').value = '';
    if (document.getElementById('recibido')) document.getElementById('recibido').value = '';
    actualizarCarrito();
}

// ========== UTILERÍAS ==========

// Mostrar notificación
function mostrarNotificacion(mensaje, tipo = 'success') {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ========== EVENTOS Y INICIALIZACIÓN ==========

// Configurar eventos cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Verificar estado del turno
    verificarEstadoTurno();
    
    // Evento para mostrar/ocultar panel de cambio
    const metodoPago = document.getElementById('metodoPago');
    if (metodoPago) {
        metodoPago.addEventListener('change', function(e) {
            const panel = document.getElementById('panelCambio');
            if (panel) {
                panel.style.display = e.target.value === 'Efectivo' ? 'block' : 'none';
            }
        });
    }
    
    // Evento para calcular cambio
    const recibido = document.getElementById('recibido');
    if (recibido) {
        recibido.addEventListener('input', function() {
            const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
            const recibidoVal = parseFloat(this.value) || 0;
            const cambio = recibidoVal - total;
            const cambioSpan = document.getElementById('cambio');
            if (cambioSpan) {
                cambioSpan.innerText = cambio > 0 ? `$${cambio.toFixed(2)}` : '$0.00';
            }
        });
    }
    
    // Evento de búsqueda
    const search = document.getElementById('search');
    if (search) {
        search.addEventListener('input', renderizarProductos);
    }
});

// Socket events
socket.on('nueva-orden', () => {
    mostrarNotificacion('🔔 Nueva orden recibida en cocina!', 'info');
    const audio = document.getElementById('notificacion');
    if (audio) audio.play().catch(e => console.log('Audio no permitido'));
});