let productos = [];
let carrito = [];
// Hacer carrito accesible globalmente para printing.js
window.carrito = carrito;
let socket = io();
let turnoAbierto = false;
let ordenSeleccionada = null;
let tipoCambioUSD = localStorage.getItem('tipoCambioUSD') ? parseFloat(localStorage.getItem('tipoCambioUSD')) : 17.00;

// Al cargar, verificar conexión de impresora
document.addEventListener('DOMContentLoaded', () => {
    verificarConexionImpresora();
    // ... resto del código existente
});

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
    verificarEstadoTurno();
    mostrarSeccion('ventas');
    
    document.getElementById('metodoPago')?.addEventListener('change', (e) => {
        actualizarPanelEfectivo();
        const panel = document.getElementById('panelCambio');
        if (panel) panel.style.display = (e.target.value === 'Efectivo' || e.target.value === 'USD') ? 'block' : 'none';
    });
    
    document.getElementById('search')?.addEventListener('input', () => renderizarProductos());
});

// ========== SECCIONES ==========
function mostrarSeccion(seccion) {
    document.getElementById('seccionVentas').style.display = seccion === 'ventas' ? 'block' : 'none';
    document.getElementById('seccionOrdenes').style.display = seccion === 'ordenes' ? 'block' : 'none';
    if (seccion === 'ordenes') cargarOrdenesPendientesCobro();
}

// ========== CAJA ==========
async function verificarEstadoTurno() {
    try {
        const response = await fetch('/api/cash/status');
        const turno = await response.json();
        if (turno && turno.estado === 'abierta') {
            tipoCambioUSD = turno.tipo_cambio_usd || 17.00;
            localStorage.setItem('tipoCambioUSD', tipoCambioUSD);
            turnoAbierto = true;
            document.getElementById('modalApertura').style.display = 'none';
            document.getElementById('seccionVentas').style.display = 'block';
            document.getElementById('btnCerrarTurno').style.display = 'block';
            cargarProductos();
            cargarOrdenesPendientesCobro();
            document.getElementById('tipoCambioInfo').innerText = `Tipo de cambio: 1 USD = $${tipoCambioUSD.toFixed(2)} MXN`;
        } else {
            turnoAbierto = false;
            document.getElementById('modalApertura').style.display = 'flex';
            document.getElementById('seccionVentas').style.display = 'none';
            document.getElementById('btnCerrarTurno').style.display = 'none';
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('modalApertura').style.display = 'flex';
    }
}

async function abrirCaja() {
    const fondo = parseFloat(document.getElementById('fondoInicial').value);
    const usuario = document.getElementById('usuario').value || 'Cajera';
    const tipoCambio = parseFloat(document.getElementById('tipoCambio').value) || 17.00;
    if (isNaN(fondo) || fondo < 0) {
        mostrarNotificacion('❌ Ingrese un monto válido', 'danger');
        return;
    }
    try {
        const response = await fetch('/api/cash/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fondo_inicial: fondo, usuario, tipo_cambio_usd: tipoCambio })
        });
        if (response.ok) {
            turnoAbierto = true;
            localStorage.setItem('tipoCambioUSD', tipoCambio);
            document.getElementById('modalApertura').style.display = 'none';
            document.getElementById('seccionVentas').style.display = 'block';
            document.getElementById('btnCerrarTurno').style.display = 'block';
            cargarProductos();
            mostrarNotificacion(`✅ Caja abierta con $${fondo.toFixed(2)} (USD 1 = $${tipoCambio})`, 'success');
        }
    } catch (error) {
        mostrarNotificacion('❌ Error al abrir caja', 'danger');
    }
}

async function cerrarTurno() {
    if (!confirm('¿Está seguro de cerrar el turno? Se generará el reporte PDF.')) return;

    try {
        mostrarNotificacion('⏳ Cerrando turno...', 'info');
        const response = await fetch('/api/cash/close', { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.success) {
            // --- 1. Mostrar PDF ---
            const pdfBase64 = data.pdf;
            const blob = base64ToBlob(pdfBase64, 'application/pdf');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cierre_${Date.now()}.pdf`;
            a.click();

            // --- 2. Imprimir ticket de cierre ---
            const cierre = data.cierre;
            await imprimirTicketCierre(cierre);

            mostrarNotificacion('✅ Turno cerrado. PDF y ticket de cierre generados.', 'success');
            
            setTimeout(() => {
                URL.revokeObjectURL(url);
                window.location.reload(true);
            }, 2000);
        } else {
            mostrarNotificacion('❌ Error: ' + (data.error || 'desconocido'), 'danger');
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion('❌ Error de conexión', 'danger');
    }
}

// Convertir base64 a Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: mimeType });
}

// ========== PRODUCTOS ==========
async function cargarProductos() {
    try {
        const response = await fetch('/api/products');
        productos = await response.json();
        renderizarProductos();
    } catch (error) { console.error('Error:', error); }
}

function renderizarProductos() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const busqueda = document.getElementById('search')?.value.toLowerCase() || '';
    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda) && p.stock > 0);
    if (filtrados.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center text-muted">No hay productos disponibles</div>';
        return;
    }
    grid.innerHTML = filtrados.map(p => `
        <div class="col-6 col-md-4 col-lg-3">
            <div class="product-card" onclick="agregarAlCarrito(${p.id})">
                <img src="${p.imagen || 'https://via.placeholder.com/80'}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">
                <h6 class="mt-1">${p.nombre}</h6>
                <p class="text-danger fw-bold mb-0">$${p.precio.toFixed(2)}</p>
                ${p.stock <= 5 ? `<span class="badge bg-warning">Stock: ${p.stock}</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ========== CARRITO ==========
function agregarAlCarrito(id) {
    if (!turnoAbierto) { mostrarNotificacion('⚠️ Abra el turno primero', 'warning'); return; }
    const producto = productos.find(p => p.id === id);
    if (!producto || producto.stock <= 0) { mostrarNotificacion('❌ Producto sin stock', 'danger'); return; }
    const existente = carrito.find(item => item.id === id);
    if (existente) {
        if (existente.cantidad + 1 > producto.stock) { mostrarNotificacion('❌ Stock insuficiente', 'danger'); return; }
        existente.cantidad++;
    } else {
        carrito.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1 });
    }
    actualizarCarrito();
    mostrarNotificacion(`✓ ${producto.nombre} agregado`, 'success');
    window.carrito = carrito;
}

function actualizarCarrito() {
    const contenedor = document.getElementById('cartItems');
    const totalSpan = document.getElementById('cartTotal');
    if (carrito.length === 0) {
        contenedor.innerHTML = '<p class="text-muted text-center">Carrito vacío</p>';
        totalSpan.innerText = '$0.00';
        document.getElementById('total-usd-info').style.display = 'none';
        actualizarPanelEfectivo();
        return;
    }
    let totalMXN = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    totalSpan.innerText = `$${totalMXN.toFixed(2)}`;
    // Mostrar total en dólares
    const totalUsd = totalMXN / tipoCambioUSD;
    const usdDiv = document.getElementById('total-usd-info');
    if (usdDiv) {
        usdDiv.style.display = 'block';
        usdDiv.innerHTML = `💰 TOTAL EN DÓLARES: $${totalUsd.toFixed(2)} USD<br><small>Tipo de cambio: $${tipoCambioUSD.toFixed(2)} MXN</small>`;
    }
    contenedor.innerHTML = carrito.map(item => {
        const subtotal = item.precio * item.cantidad;
        return `
            <div class="cart-item d-flex justify-content-between align-items-center">
                <span class="fw-bold">${item.cantidad}x</span>
                <span class="flex-grow-1 ms-2">${item.nombre}</span>
                <span>$${subtotal.toFixed(2)}</span>
                <button class="btn btn-sm btn-link text-danger" onclick="eliminarDelCarrito(${item.id})">✖</button>
            </div>
        `;
    }).join('');
    actualizarPanelEfectivo();
}

function eliminarDelCarrito(id) {
    carrito = carrito.filter(item => item.id !== id);
    actualizarCarrito();
    window.carrito = carrito;
}

function limpiarCarrito() {
    carrito = [];
    const clienteInput = document.getElementById('cliente');
    if (clienteInput) clienteInput.value = '';
    actualizarCarrito();
    window.carrito = carrito;
}

// ========== AGREGAR PRODUCTO EXTRA ==========
function agregarProductoExtra() {
    if (!turnoAbierto) { mostrarNotificacion('⚠️ Abra el turno primero', 'warning'); return; }
    let nombreExtra = prompt("¿Cuál es el artículo extra / complemento?", "");
    if (nombreExtra === null || nombreExtra.trim() === "") return;
    let precioExtra = prompt("Ingrese el precio en pesos ($ MXN) para: " + nombreExtra, "");
    if (precioExtra === null) return;
    precioExtra = parseFloat(precioExtra);
    if (isNaN(precioExtra) || precioExtra < 0) {
        alert("Precio no válido");
        return;
    }
    let cantidadExtra = parseInt(prompt("Cantidad:", "1")) || 1;
    let idUnicoExtra = "EX-" + Date.now();
    carrito.push({
        id: idUnicoExtra,
        nombre: "EXTRA: " + nombreExtra.toUpperCase(),
        precio: precioExtra,
        cantidad: cantidadExtra
    });
    actualizarCarrito();
    mostrarNotificacion(`➕ Extra "${nombreExtra}" x${cantidadExtra} agregado`, 'success');
}

// ========== PANEL DE EFECTIVO Y DÓLARES ==========
function actualizarPanelEfectivo() {
    const metodoPago = document.getElementById('metodoPago').value;
    const container = document.getElementById('panelCambio');
    if (!container) return;
    const totalMXN = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const debeMostrar = (metodoPago === 'Efectivo' || metodoPago === 'USD');
    if (debeMostrar) {
        container.style.display = 'block';
        if (metodoPago === 'Efectivo') {
            container.innerHTML = `
                <div class="panel-efectivo">
                    <label class="small fw-bold d-block text-center">💵 PAGA CON (PESOS MXN):</label>
                    <input type="number" id="input-recibido" class="form-control input-efectivo" oninput="calcularCambioEfectivo(${totalMXN})">
                    <div class="d-flex justify-content-between mt-1">
                        <small>CAMBIO (PESOS):</small>
                        <span id="label-cambio" class="fw-bold text-success">$0.00</span>
                    </div>
                </div>
            `;
        } else if (metodoPago === 'USD') {
            container.innerHTML = `
                <div class="panel-efectivo" style="background:#e2f0d9; border-color:#a9d08e;">
                    <label class="small fw-bold d-block text-center">💵 PAGA CON (BILLETE USD):</label>
                    <input type="number" id="input-recibido-usd" class="form-control input-efectivo" style="color:#2e7d32;" oninput="calcularCambioDolares(${totalMXN})">
                    <div class="d-flex justify-content-between mt-1">
                        <small>CAMBIO EN PESOS (MXN):</small>
                        <span id="label-cambio" class="fw-bold text-success">$0.00 MXN</span>
                    </div>
                    <small class="text-muted">Tipo de cambio: 1 USD = $${tipoCambioUSD.toFixed(2)} MXN</small>
                </div>
            `;
        }
    } else {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

function calcularCambioEfectivo(totalMXN) {
    const recibido = parseFloat(document.getElementById('input-recibido')?.value) || 0;
    const cambio = recibido - totalMXN;
    const cambioSpan = document.getElementById('label-cambio');
    if (cambioSpan) {
        if (recibido >= totalMXN) {
            cambioSpan.innerText = `$${cambio.toFixed(2)}`;
            cambioSpan.classList.add('text-success');
            cambioSpan.classList.remove('text-danger');
        } else {
            cambioSpan.innerText = `$${Math.abs(cambio).toFixed(2)} faltante`;
            cambioSpan.classList.add('text-danger');
            cambioSpan.classList.remove('text-success');
        }
    }
}

function calcularCambioDolares(totalMXN) {
    const usdRecibidos = parseFloat(document.getElementById('input-recibido-usd')?.value) || 0;
    const recibidoMXN = usdRecibidos * tipoCambioUSD;
    const cambioMXN = recibidoMXN - totalMXN;
    const cambioSpan = document.getElementById('label-cambio');
    if (cambioSpan) {
        if (recibidoMXN >= totalMXN) {
            cambioSpan.innerText = `$${cambioMXN.toFixed(2)} MXN`;
            cambioSpan.classList.add('text-success');
            cambioSpan.classList.remove('text-danger');
        } else {
            cambioSpan.innerText = `$${Math.abs(cambioMXN).toFixed(2)} MXN faltante`;
            cambioSpan.classList.add('text-danger');
            cambioSpan.classList.remove('text-success');
        }
    }
}

// ========== ÓRDENES PENDIENTES DE COBRO ==========
async function cargarOrdenesPendientesCobro() {
    try {
        const response = await fetch('/api/orders/pending-payment');
        const orders = await response.json();
        renderizarOrdenesPendientes(orders);
    } catch (error) { console.error('Error:', error); }
}

function renderizarOrdenesPendientes(orders) {
    const container = document.getElementById('ordenesPendientes');
    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted p-5">No hay órdenes pendientes de cobro</div>';
        return;
    }
    container.innerHTML = orders.map(order => {
        let items = [];
        try { items = JSON.parse(order.items || '[]'); } catch(e) {}
        const esParaLlevar = order.tipo_orden === 'llevar';
        const badgeColor = esParaLlevar ? 'bg-info' : 'bg-warning';
        const badgeText = esParaLlevar ? 'Para llevar' : 'Local - Entregado';
        return `
            <div class="col-md-6 col-lg-4">
                <div class="order-item ${ordenSeleccionada === order.id ? 'selected' : ''}" onclick="seleccionarOrdenParaCobro(${order.id})">
                    <div class="d-flex justify-content-between">
                        <strong>${escapeHtml(order.cliente)}</strong>
                        <span class="badge ${badgeColor}">${badgeText}</span>
                    </div>
                    <small class="text-muted">Orden: ${order.order_number}</small>
                    <hr class="my-2">
                    <div class="small">
                        ${items.map(item => `<div>${item.cantidad}x ${escapeHtml(item.nombre)}</div>`).join('')}
                    </div>
                    <hr class="my-2">
                    <div class="d-flex justify-content-between">
                        <strong>Total: $${order.total?.toFixed(2)}</strong>
                        <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); cargarOrdenAlCarrito(${order.id})">💰 COBRAR</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function seleccionarOrdenParaCobro(orderId) {
    ordenSeleccionada = orderId;
    cargarOrdenesPendientesCobro();
}

async function cargarOrdenAlCarrito(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`);
        const order = await response.json();
        if (order) {
            limpiarCarrito();
            let items = [];
            try { items = JSON.parse(order.items || '[]'); } catch(e) {}
            items.forEach(item => {
                carrito.push({
                    id: item.product_id || Date.now(),
                    nombre: item.nombre,
                    precio: item.precio_unitario || item.precio,
                    cantidad: item.cantidad
                });
            });
            window.carrito = carrito;
            document.getElementById('cliente').value = order.cliente;
            actualizarCarrito();
            mostrarSeccion('ventas');
            cargarOrdenesPendientesCobro();
            mostrarNotificacion(`📋 Orden de ${order.cliente} cargada para cobro`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error al cargar orden', 'danger');
    }
}

// ========== PROCESAR PAGO (MODIFICADO - SIN limpiarCarrito) ==========
async function procesarPago() {
    console.log('procesarPago iniciado');
    if (!turnoAbierto) {
        mostrarNotificacion('⚠️ Abra el turno primero', 'warning');
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
    const totalMXN = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    
    // Validar monto según método
    if (metodoPago === 'Efectivo') {
        const recibido = parseFloat(document.getElementById('input-recibido')?.value) || 0;
        if (recibido < totalMXN) {
            mostrarNotificacion(`⚠️ Monto insuficiente. Total: $${totalMXN.toFixed(2)}`, 'warning');
            return;
        }
    } else if (metodoPago === 'USD') {
        const usdRecibidos = parseFloat(document.getElementById('input-recibido-usd')?.value) || 0;
        const recibidoMXN = usdRecibidos * tipoCambioUSD;
        if (recibidoMXN < totalMXN) {
            mostrarNotificacion(`⚠️ Monto insuficiente. Total en MXN: $${totalMXN.toFixed(2)}`, 'warning');
            return;
        }
    }

    try {
        if (ordenSeleccionada) {
            // Cobrar orden existente (desde la sección de cobros pendientes)
            console.log(`Cobrando orden existente ${ordenSeleccionada}`);
            let metodoReal = metodoPago;
            let total_usd = 0;
            if (metodoReal === 'USD') {
                total_usd = parseFloat(document.getElementById('input-recibido-usd')?.value) || 0;
                metodoReal = 'Dólares';
            }
            const response = await fetch(`/api/orders/${ordenSeleccionada}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'pagado', metodo_pago: metodoReal, total_usd })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                mostrarNotificacion(`✅ Orden ${ordenSeleccionada} pagada con ${metodoPago}`, 'success');
                // ⚠️ NO LIMPIAMOS EL CARRITO AQUÍ - lo hará cobrarConTicket()
                cargarOrdenesPendientesCobro();
                ordenSeleccionada = null;
                cargarProductos();
                socket.emit('estado-actualizado', { orderId: ordenSeleccionada, estado: 'pagado' });
            } else {
                mostrarNotificacion(`❌ Error: ${data.error || 'desconocido'}`, 'danger');
            }
        } else {
            // Nueva venta directa (para llevar)
            console.log('Nueva venta directa');
            let metodoReal = metodoPago;
            let total_usd = 0;
            if (metodoReal === 'USD') {
                total_usd = parseFloat(document.getElementById('input-recibido-usd')?.value) || 0;
                metodoReal = 'Dólares';
            } else if (metodoReal === 'Efectivo') {
                metodoReal = 'Efectivo';
            }
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente,
                    items: carrito,
                    total: totalMXN,
                    metodo_pago: metodoReal,
                    tipo_orden: 'llevar',
                    estado_inicial: 'pagado',
                    total_usd: total_usd
                })
            });
            const result = await response.json();
            if (result.success) {
                mostrarNotificacion(`✅ Venta para llevar cobrada: ${result.order.order_number}`, 'success');
                // ⚠️ NO LIMPIAMOS EL CARRITO AQUÍ - lo hará cobrarConTicket()
                // limpiarCarrito();  ← ELIMINADO
                cargarProductos();
            } else {
                mostrarNotificacion('❌ Error al crear venta', 'danger');
            }
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion('❌ Error de conexión', 'danger');
    }
}

// ========== ENVIAR A COCINA (Local) ==========
async function enviarACocinaLocal() {
    if (!turnoAbierto) {
        mostrarNotificacion('⚠️ Abra el turno primero', 'warning');
        return;
    }
    const cliente = document.getElementById('cliente').value.trim();
    if (!cliente || carrito.length === 0) {
        mostrarNotificacion('⚠️ Complete la orden', 'warning');
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
                metodo_pago: 'Pendiente',
                tipo_orden: 'local',
                estado_inicial: 'pendiente'
            })
        });
        const result = await response.json();
        if (result.success) {
            mostrarNotificacion(`👨‍🍳 Orden local enviada a cocina: ${result.order.order_number}`, 'success');
            limpiarCarrito();
            socket.emit('nueva-orden', {});
        } else {
            mostrarNotificacion('❌ Error al enviar a cocina', 'danger');
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion('❌ Error de red', 'danger');
    }
}

// ========== NOTIFICACIONES ==========
function mostrarNotificacion(mensaje, tipo = 'success') {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ========== SOCKET EVENTS ==========
socket.on('estado-actualizado', () => {
    if (document.getElementById('seccionOrdenes').style.display === 'block') {
        cargarOrdenesPendientesCobro();
    }
    const audio = document.getElementById('notificacion');
    audio.play().catch(e => console.log('Audio no permitido'));
});