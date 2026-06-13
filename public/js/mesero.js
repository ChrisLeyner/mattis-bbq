let productos = [];
let carrito = [];
let socket = io();

document.addEventListener('DOMContentLoaded', () => {
    cargarProductos();
    const buscarInput = document.getElementById('buscarProducto');
    if (buscarInput) buscarInput.addEventListener('input', renderizarProductos);
});

async function cargarProductos() {
    try {
        const response = await fetch('/api/products');
        productos = await response.json();
        renderizarProductos();
    } catch (error) {
        console.error('Error cargando productos:', error);
        mostrarNotificacion('❌ Error cargando menú', 'danger');
    }
}

function renderizarProductos() {
    const container = document.getElementById('productosMesero');
    if (!container) return;
    const busqueda = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda) && p.stock > 0);
    if (filtrados.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted p-5">No hay productos disponibles</div>';
        return;
    }
    container.innerHTML = filtrados.map(p => `
        <div class="col-6 col-md-4 col-lg-3">
            <div class="product-card" onclick="agregarAlCarrito(${p.id})">
                <div class="fw-bold">${p.nombre}</div>
                <div class="text-danger fw-bold">$${p.precio.toFixed(2)}</div>
                <small class="text-muted">Stock: ${p.stock}</small>
            </div>
        </div>
    `).join('');
}

function agregarProductoExtra() {
    let nombreExtra = prompt("¿Cuál es el artículo extra / complemento?", "");
    if (!nombreExtra || nombreExtra.trim() === "") return;
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

function agregarAlCarrito(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    if (producto.stock <= 0) {
        mostrarNotificacion(`❌ ${producto.nombre} sin stock`, 'danger');
        return;
    }
    const existente = carrito.find(item => item.id == id);
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

function actualizarCarrito() {
    const contenedor = document.getElementById('listaCarrito');
    const totalSpan = document.getElementById('totalPreview');
    if (!contenedor) return;
    if (carrito.length === 0) {
        contenedor.innerHTML = '<p class="text-muted text-center">Vacío</p>';
        totalSpan.innerText = '$0.00';
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
                <button class="btn btn-sm btn-link text-danger" onclick="eliminarDelCarrito('${item.id}')">✖</button>
            </div>
        `;
    }).join('');
    totalSpan.innerText = `$${total.toFixed(2)}`;
}

function eliminarDelCarrito(id) {
    carrito = carrito.filter(item => String(item.id) !== String(id));
    actualizarCarrito();
    mostrarNotificacion('🗑️ Producto eliminado', 'info');
}

function limpiarCarrito() {
    carrito = [];
    actualizarCarrito();
}

async function enviarPedido() {
    const mesa = document.getElementById('mesa').value.trim();
    if (!mesa) {
        mostrarNotificacion('⚠️ Ingrese el número de mesa o cliente', 'warning');
        return;
    }
    if (carrito.length === 0) {
        mostrarNotificacion('⚠️ Agregue productos al pedido', 'warning');
        return;
    }
    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const itemsParaEnviar = carrito.map(item => ({
        id: item.id,
        nombre: item.nombre,
        precio: item.precio,
        cantidad: item.cantidad
    }));
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente: `Mesa ${mesa}`,
                items: itemsParaEnviar,
                total: total,
                metodo_pago: 'Pendiente',
                tipo_orden: 'local',
                estado_inicial: 'pendiente'
            })
        });
        const result = await response.json();
        if (result.success) {
            mostrarNotificacion(`👨‍🍳 Pedido de Mesa ${mesa} enviado a cocina (${result.order.order_number})`, 'success');
            limpiarCarrito();
            document.getElementById('mesa').value = '';
            socket.emit('nueva-orden', {});
            const audio = document.getElementById('notificacion');
            audio.play().catch(e => console.log('Audio no permitido'));
        } else {
            mostrarNotificacion('❌ Error al enviar pedido: ' + (result.error || 'desconocido'), 'danger');
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion('❌ Error de red al enviar pedido', 'danger');
    }
}

function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

socket.on('connect', () => console.log('Socket de mesero conectado'));