// ==================== VARIABLES GLOBALES ====================
var bluetoothDeviceGlobal = null;
var bluetoothCharacteristicGlobal = null;
var bluetoothServerGlobal = null;
var impresoraConectadaGlobal = false;
var modoSimulacionGlobal = false;
var heartbeatInterval = null;
var reconectando = false;

// ==================== DETECCIÓN DE ENTORNO ====================
function isLocalhost() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname === '0.0.0.0';
}

function verificarCompatibilidadBluetooth() {
    try {
        if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== 'function') {
            return { disponible: false, razon: 'Web Bluetooth no soportado en este navegador' };
        }
        return { disponible: true };
    } catch (e) {
        return { disponible: false, razon: e.message };
    }
}

// ==================== GUARDAR Y RESTAURAR DISPOSITIVO ====================
function guardarDispositivoBluetooth(device) {
    try {
        const deviceInfo = {
            id: device.id,
            name: device.name || 'Impresora'
        };
        localStorage.setItem('bluetoothDeviceInfo', JSON.stringify(deviceInfo));
        console.log('💾 Dispositivo Bluetooth guardado:', deviceInfo);
    } catch (e) {
        console.warn('No se pudo guardar dispositivo:', e);
    }
}

function obtenerDispositivoGuardado() {
    try {
        const data = localStorage.getItem('bluetoothDeviceInfo');
        if (data) {
            const deviceInfo = JSON.parse(data);
            console.log('📂 Dispositivo guardado encontrado:', deviceInfo);
            return deviceInfo;
        }
    } catch (e) {
        console.warn('Error leyendo dispositivo guardado:', e);
    }
    return null;
}

// ==================== ACTIVAR MODO SIMULACIÓN ====================
function activarModoSimulacion() {
    modoSimulacionGlobal = true;
    impresoraConectadaGlobal = true;
    localStorage.setItem('impresoraConectada', 'true');
    localStorage.setItem('impresoraSimulacion', 'true');
    
    const btn = document.getElementById('btnConectarImpresora');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-code"></i> SIMULACIÓN ACTIVA ✅`;
        btn.className = 'btn btn-warning w-100 mb-2 fw-bold py-2';
    }
    
    mostrarNotificacion('🔧 Modo simulación activado. Tickets se muestran en consola (F12).', 'info');
    console.log('📱 MODO SIMULACIÓN ACTIVADO');
}

// ==================== VERIFICAR CONEXIÓN ====================
function verificarConexionImpresora() {
    const conectada = localStorage.getItem('impresoraConectada') === 'true';
    const nombre = localStorage.getItem('impresoraNombre') || 'Impresora';
    impresoraConectadaGlobal = conectada;
    
    const btn = document.getElementById('btnConectarImpresora');
    if (btn && conectada) {
        btn.innerHTML = `<i class="fas fa-bluetooth"></i> ${nombre} ✅`;
        btn.className = 'btn btn-success w-100 mb-2 fw-bold py-2';
    }
    return conectada;
}

// ==================== HEARTBEAT ====================
function iniciarHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(async () => {
        if (impresoraConectadaGlobal && bluetoothCharacteristicGlobal && bluetoothServerGlobal) {
            try {
                await bluetoothCharacteristicGlobal.readValue();
                console.log('💓 Heartbeat: conexión activa');
            } catch (e) {
                console.log('⚠️ Heartbeat: conexión perdida');
                impresoraConectadaGlobal = false;
                bluetoothCharacteristicGlobal = null;
                bluetoothServerGlobal = null;
            }
        }
    }, 15000);
}

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Inicializando módulo de impresión...');
    
    if (localStorage.getItem('impresoraSimulacion') === 'true') {
        activarModoSimulacion();
        return;
    }
    
    if (isLocalhost()) {
        console.log('⚠️ Entorno localhost detectado - Activando modo simulación automático');
        activarModoSimulacion();
        return;
    }
    
    const compatible = verificarCompatibilidadBluetooth();
    if (!compatible.disponible) {
        console.log('⚠️ Bluetooth no disponible:', compatible.razon);
        activarModoSimulacion();
        return;
    }
    
    verificarConexionImpresora();
    iniciarHeartbeat();
});

// ==================== CONECTAR IMPRESORA ====================
async function conectarImpresora() {
    if (modoSimulacionGlobal || localStorage.getItem('impresoraSimulacion') === 'true') {
        mostrarNotificacion('📱 Modo simulación activo.', 'info');
        return true;
    }
    
    // Si ya hay conexión activa, usarla
    if (bluetoothCharacteristicGlobal && bluetoothServerGlobal) {
        try {
            await bluetoothCharacteristicGlobal.readValue();
            console.log('✅ Conexión existente activa');
            impresoraConectadaGlobal = true;
            return true;
        } catch (e) {
            console.log('⚠️ Conexión existente caducada');
            bluetoothCharacteristicGlobal = null;
            bluetoothServerGlobal = null;
            impresoraConectadaGlobal = false;
        }
    }
    
    // Intentar reconectar a dispositivo guardado
    if (bluetoothDeviceGlobal) {
        try {
            console.log('🔄 Intentando reconectar a dispositivo guardado...');
            bluetoothServerGlobal = await bluetoothDeviceGlobal.gatt.connect();
            const service = await bluetoothServerGlobal.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            bluetoothCharacteristicGlobal = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
            
            impresoraConectadaGlobal = true;
            localStorage.setItem('impresoraConectada', 'true');
            const nombre = localStorage.getItem('impresoraNombre') || 'Impresora';
            
            const btn = document.getElementById('btnConectarImpresora');
            if (btn) {
                btn.innerHTML = `<i class="fas fa-bluetooth"></i> ${nombre} ✅`;
                btn.className = 'btn btn-success w-100 mb-2 fw-bold py-2';
            }
            
            mostrarNotificacion('✅ Impresora reconectada', 'success');
            return true;
        } catch (e) {
            console.log('⚠️ Error reconectando:', e.message);
            bluetoothDeviceGlobal = null;
        }
    }
    
    const compatible = verificarCompatibilidadBluetooth();
    if (!compatible.disponible) {
        mostrarNotificacion('❌ Web Bluetooth no disponible.', 'danger');
        return false;
    }
    
    try {
        mostrarNotificacion('🔍 Buscando impresora Bluetooth...', 'info');
        
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }
            ],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        
        bluetoothDeviceGlobal = device;
        guardarDispositivoBluetooth(device);
        
        mostrarNotificacion('✅ Conectando...', 'info');
        
        const server = await device.gatt.connect();
        bluetoothServerGlobal = server;
        
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        bluetoothCharacteristicGlobal = characteristic;
        
        impresoraConectadaGlobal = true;
        localStorage.setItem('impresoraConectada', 'true');
        localStorage.setItem('impresoraNombre', device.name || 'Impresora');
        
        const btn = document.getElementById('btnConectarImpresora');
        if (btn) {
            btn.innerHTML = `<i class="fas fa-bluetooth"></i> ${device.name || 'Conectada'} ✅`;
            btn.className = 'btn btn-success w-100 mb-2 fw-bold py-2';
        }
        
        mostrarNotificacion(`✅ Impresora "${device.name || 'Conectada'}" lista`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error Bluetooth:', error);
        impresoraConectadaGlobal = false;
        localStorage.removeItem('impresoraConectada');
        
        let mensaje = 'Error al conectar: ';
        if (error.message.includes('cancelled')) {
            mensaje = '⚠️ Conexión cancelada por el usuario';
        } else if (error.message.includes('not found')) {
            mensaje = '⚠️ No se encontraron impresoras cercanas';
        } else {
            mensaje += error.message;
        }
        
        mostrarNotificacion(mensaje, 'warning');
        return false;
    }
}

// ==================== ENVIAR DATOS A IMPRESORA ====================
async function enviarAImpresora(ticket) {
    if (modoSimulacionGlobal || localStorage.getItem('impresoraSimulacion') === 'true') {
        console.log('📄 TICKET (SIMULACIÓN):');
        console.log('='.repeat(40));
        console.log(ticket);
        console.log('='.repeat(40));
        return true;
    }
    
    // Verificar conexión
    if (!bluetoothCharacteristicGlobal || !bluetoothServerGlobal) {
        console.log('🔄 Conexión perdida, intentando reconectar...');
        const conectado = await conectarImpresora();
        if (!conectado) {
            mostrarNotificacion('⚠️ Conecta la impresora manualmente con el botón', 'warning');
            return false;
        }
    }
    
    // Verificar que la conexión sigue activa
    try {
        await bluetoothCharacteristicGlobal.readValue();
    } catch (e) {
        console.log('🔄 Conexión inactiva, reconectando...');
        const conectado = await conectarImpresora();
        if (!conectado) {
            mostrarNotificacion('⚠️ Conecta la impresora manualmente con el botón', 'warning');
            return false;
        }
    }
    
    // Enviar datos en chunks
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(ticket);
        const chunkSize = 480;
        let offset = 0;
        
        while (offset < data.length) {
            const chunk = data.slice(offset, offset + chunkSize);
            await bluetoothCharacteristicGlobal.writeValue(chunk);
            offset += chunkSize;
            if (offset < data.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        return true;
    } catch (error) {
        console.error('❌ Error enviando datos:', error);
        impresoraConectadaGlobal = false;
        bluetoothCharacteristicGlobal = null;
        bluetoothServerGlobal = null;
        throw error;
    }
}

// ==================== CONSTRUIR TICKET ====================
function construirTicket(cliente, metodoPago, total) {
    const fecha = new Date().toLocaleString();
    const items = window.carrito || [];
    let ticket = '';
    
    const LINE_FEED = '\x0A';
    const SEPARATOR = '='.repeat(32) + LINE_FEED;
    
    ticket += '    MATTI\'S B-B-Q' + LINE_FEED;
    ticket += SEPARATOR;
    ticket += `Fecha: ${fecha}` + LINE_FEED;
    ticket += `Cliente: ${cliente}` + LINE_FEED;
    ticket += `Pago: ${metodoPago}` + LINE_FEED;
    ticket += SEPARATOR + LINE_FEED;
    
    items.forEach(item => {
        const nombre = item.nombre.substring(0, 25).padEnd(25);
        const cantidad = `${item.cantidad}x`;
        const precio = `$${(item.precio * item.cantidad).toFixed(2)}`;
        ticket += `${cantidad} ${nombre} ${precio}` + LINE_FEED;
    });
    
    ticket += LINE_FEED;
    ticket += SEPARATOR;
    ticket += `TOTAL: $${total.toFixed(2)}` + LINE_FEED;
    ticket += SEPARATOR + LINE_FEED;
    
    ticket += 'Gracias por su visita' + LINE_FEED;
    ticket += 'Vuelva pronto' + LINE_FEED + LINE_FEED;
    ticket += '\x1B\x64\x03'; // Avanzar 3 líneas
    ticket += '\x1D\x56\x00';
    
    return ticket;
}

// ==================== IMPRIMIR TICKET ====================
async function imprimirTicketAutomatico() {
    if (!window.carrito || window.carrito.length === 0) {
        console.log('⚠️ No hay productos para imprimir');
        return false;
    }
    
    const cliente = document.getElementById('cliente')?.value || 'Cliente';
    const metodoPago = document.getElementById('metodoPago')?.value || 'Efectivo';
    const total = window.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    
    console.log(`📄 Imprimiendo ticket para: ${cliente}, Total: $${total.toFixed(2)}`);
    
    try {
        const ticket = construirTicket(cliente, metodoPago, total);
        await enviarAImpresora(ticket);
        mostrarNotificacion('✅ Ticket impreso', 'success');
        return true;
    } catch (error) {
        console.error('Error imprimiendo:', error);
        mostrarNotificacion('❌ Error al imprimir: ' + error.message, 'danger');
        return false;
    }
}

// ==================== TICKET DE CIERRE ====================
function construirTicketCierre(cierre) {
    const fecha = new Date().toLocaleString();
    let ticket = '';
    
    const LINE_FEED = '\x0A';
    const SEP = '----------------' + LINE_FEED;
    const SEP2 = '================' + LINE_FEED;
    
    ticket += 'MATTI\'S BBQ' + LINE_FEED;
    ticket += '=== CIERRE ===' + LINE_FEED;
    ticket += `F: ${fecha}` + LINE_FEED;
    if (cierre.fechaApertura) {
        ticket += `Ape: ${new Date(cierre.fechaApertura).toLocaleString().slice(0, 14)}` + LINE_FEED;
    }
    ticket += SEP;
    ticket += `Fdo: $${(cierre.fondoInicial || 0).toFixed(2)}` + LINE_FEED;
    ticket += `Efe: $${(cierre.ventasEfectivo || 0).toFixed(2)}` + LINE_FEED;
    ticket += `Tar: $${(cierre.ventasTarjeta || 0).toFixed(2)}` + LINE_FEED;
    ticket += `Tra: $${(cierre.ventasTransferencia || 0).toFixed(2)}` + LINE_FEED;
    if (cierre.ventasDolaresUSD > 0) {
        ticket += `USD: $${(cierre.ventasDolaresUSD || 0).toFixed(2)}` + LINE_FEED;
    }
    ticket += SEP;
    ticket += `TOTAL: $${(cierre.totalVendidoMXN || 0).toFixed(2)}` + LINE_FEED;
    ticket += SEP2;
    ticket += `CAJA: $${(cierre.efectivoEnCajaMXN || 0).toFixed(2)}` + LINE_FEED;
    if (cierre.ventasDolaresUSD > 0) {
        ticket += `USD: $${(cierre.ventasDolaresUSD || 0).toFixed(2)}` + LINE_FEED;
    }
    ticket += SEP2;
    ticket += 'Gracias' + LINE_FEED;
    ticket += '\x1B\x64\x03'; // Avanzar 3 líneas
    ticket += '\x1D\x56\x00';
    
    return ticket;
}

async function imprimirTicketCierre(cierre) {
    console.log('🔄 Imprimiendo ticket de cierre...');
    
    if (!cierre) {
        console.error('❌ No hay datos de cierre');
        mostrarNotificacion('❌ No hay datos de cierre para imprimir', 'danger');
        return false;
    }
    
    if (modoSimulacionGlobal || localStorage.getItem('impresoraSimulacion') === 'true') {
        const ticket = construirTicketCierre(cierre);
        console.log('📄 TICKET DE CIERRE (SIMULACIÓN)');
        console.log('='.repeat(40));
        console.log(ticket);
        console.log('='.repeat(40));
        mostrarNotificacion('🖨️ [SIMULACIÓN] Ticket de cierre mostrado en consola', 'info');
        return true;
    }
    
    try {
        const ticket = construirTicketCierre(cierre);
        await enviarAImpresora(ticket);
        mostrarNotificacion('✅ Ticket de cierre impreso', 'success');
        return true;
    } catch (error) {
        console.error('Error imprimiendo cierre:', error);
        mostrarNotificacion('❌ Error al imprimir cierre: ' + error.message, 'danger');
        return false;
    }
}

// ==================== FUNCIONES PARA PENDING-PAYMENT ====================
function verificarEstadoImpresora() {
    return {
        conectada: impresoraConectadaGlobal || modoSimulacionGlobal,
        modoSimulacion: modoSimulacionGlobal || localStorage.getItem('impresoraSimulacion') === 'true',
        nombre: localStorage.getItem('impresoraNombre') || 'Impresora'
    };
}

function cargarOrdenParaImprimir(order) {
    if (!order) return false;
    
    try {
        window.carrito = [];
        let items = [];
        try { items = JSON.parse(order.items || '[]'); } catch(e) {}
        items.forEach(item => {
            window.carrito.push({
                id: item.product_id || Date.now(),
                nombre: item.nombre,
                precio: item.precio_unitario || item.precio || 0,
                cantidad: item.cantidad
            });
        });
        if (order.cliente) {
            const clienteInput = document.getElementById('cliente');
            if (clienteInput) clienteInput.value = order.cliente;
        }
        return true;
    } catch (error) {
        console.error('Error cargando orden:', error);
        return false;
    }
}

// ==================== ABRIR CAJA ====================
async function abrirCajaDespuesDeCobro() {
    console.log('🔓 Intentando abrir caja registradora...');
    try {
        const response = await fetch('/api/cash/drawer/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            console.log('💰 Caja abierta exitosamente');
            mostrarNotificacion('💰 Caja registradora abierta', 'success');
            return true;
        } else {
            console.log('⚠️ No se pudo abrir caja:', result.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Error abriendo caja:', error);
        return false;
    }
}

async function cobrarConTicket() {
    console.log('🔄 Procesando cobro con ticket...');
    
    const ticketData = {
        carrito: window.carrito ? [...window.carrito] : [],
        cliente: document.getElementById('cliente')?.value || 'Cliente',
        metodoPago: document.getElementById('metodoPago')?.value || 'Efectivo',
        total: window.carrito ? window.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0) : 0
    };
    
    localStorage.setItem('ticketData', JSON.stringify(ticketData));
    
    // Verificar si es una orden pendiente (ordenSeleccionada tiene valor)
    if (window.ordenSeleccionada) {
        console.log(`💰 Cobrando orden pendiente ID: ${window.ordenSeleccionada}`);
        
        // Marcar como pagado en el servidor
        try {
            const metodoPago = document.getElementById('metodoPago')?.value || 'Efectivo';
            let metodoReal = metodoPago;
            let total_usd = 0;
            if (metodoReal === 'USD') {
                total_usd = parseFloat(document.getElementById('input-recibido-usd')?.value) || 0;
                metodoReal = 'Dólares';
            }
            
            const response = await fetch(`/api/orders/${window.ordenSeleccionada}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estado: 'pagado',
                    metodo_pago: metodoReal,
                    total_usd: total_usd
                })
            });
            const data = await response.json();
            
            if (response.ok && data.success) {
                console.log(`✅ Orden ${window.ordenSeleccionada} marcada como pagada`);
                
                // Recargar lista de pendientes si la sección está visible
                if (typeof window.cargarCobrosPendientes === 'function') {
                    setTimeout(() => window.cargarCobrosPendientes(), 500);
                }
                
                // Notificar por socket
                if (typeof window.socket !== 'undefined') {
                    window.socket.emit('estado-actualizado', { 
                        orderId: window.ordenSeleccionada, 
                        estado: 'pagado' 
                    });
                }
            } else {
                console.error('Error al marcar orden como pagada:', data.error);
            }
        } catch (error) {
            console.error('Error al cobrar orden pendiente:', error);
        }
    }
    
    // Ejecutar el cobro normal
    if (typeof window.procesarPago === 'function') {
        await window.procesarPago();
    } else {
        console.error('❌ función procesarPago no encontrada');
        mostrarNotificacion('❌ Error: función de cobro no disponible', 'danger');
        return false;
    }
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const savedTicket = JSON.parse(localStorage.getItem('ticketData') || 'null');
    if (savedTicket) {
        window.carrito = savedTicket.carrito;
        document.getElementById('cliente').value = savedTicket.cliente;
        const metodoSelect = document.getElementById('metodoPago');
        if (metodoSelect) metodoSelect.value = savedTicket.metodoPago;
    }
    
    const impreso = await imprimirTicketAutomatico();
    
    localStorage.removeItem('ticketData');
    
    if (impreso) {
        await abrirCajaDespuesDeCobro();
    }
    
    // Limpiar carrito y orden seleccionada
    window.carrito = [];
    if (window.ordenSeleccionada) {
        // Recargar pendientes nuevamente
        if (typeof window.cargarCobrosPendientes === 'function') {
            setTimeout(() => window.cargarCobrosPendientes(), 1000);
        }
        window.ordenSeleccionada = null;
    }
    
    // Limpiar UI del carrito
    const clienteInput = document.getElementById('cliente');
    if (clienteInput) clienteInput.value = '';
    const cartItems = document.getElementById('cartItems');
    if (cartItems) cartItems.innerHTML = '<p class="text-muted text-center">Carrito vacío</p>';
    const totalSpan = document.getElementById('cartTotal');
    if (totalSpan) totalSpan.innerText = '$0.00';
    
    console.log('🧹 Carrito limpiado después de imprimir');
    return impreso;
}

// ==================== NOTIFICACIONES ====================
function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// ==================== EXPONER FUNCIONES GLOBALES ====================
window.conectarImpresora = conectarImpresora;
window.imprimirTicketAutomatico = imprimirTicketAutomatico;
window.imprimirTicketCierre = imprimirTicketCierre;
window.abrirCajaDespuesDeCobro = abrirCajaDespuesDeCobro;
window.cobrarConTicket = cobrarConTicket;
window.activarModoSimulacion = activarModoSimulacion;
window.verificarConexionImpresora = verificarConexionImpresora;
window.verificarEstadoImpresora = verificarEstadoImpresora;
window.cargarOrdenParaImprimir = cargarOrdenParaImprimir;

console.log('✅ Módulo de impresión cargado correctamente');