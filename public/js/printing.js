// ==================== VARIABLES GLOBALES ====================
let bluetoothDevice = null;
let bluetoothCharacteristic = null;
let impresoraConectada = false;
let modoSimulacion = false;

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

// ==================== ACTIVAR MODO SIMULACIÓN ====================
function activarModoSimulacion() {
    modoSimulacion = true;
    impresoraConectada = true;
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

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Inicializando módulo de impresión...');
    
    // Verificar si ya hay modo simulación guardado
    if (localStorage.getItem('impresoraSimulacion') === 'true') {
        activarModoSimulacion();
        return;
    }
    
    // Verificar si estamos en localhost o entorno sin Bluetooth
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
    
    // Intentar reconectar si había conexión previa
    const conectada = localStorage.getItem('impresoraConectada') === 'true';
    if (conectada) {
        impresoraConectada = true;
        const nombre = localStorage.getItem('impresoraNombre') || 'Impresora';
        const btn = document.getElementById('btnConectarImpresora');
        if (btn) {
            btn.innerHTML = `<i class="fas fa-bluetooth"></i> ${nombre} ✅`;
            btn.className = 'btn btn-success w-100 mb-2 fw-bold py-2';
        }
    }
});

// ==================== CONECTAR IMPRESORA REAL ====================
async function conectarImpresora() {
    // Si ya estamos en modo simulación
    if (modoSimulacion || localStorage.getItem('impresoraSimulacion') === 'true') {
        mostrarNotificacion('📱 Modo simulación activo. No se necesita conectar impresora real.', 'info');
        return true;
    }
    
    // Verificar compatibilidad
    const compatible = verificarCompatibilidadBluetooth();
    if (!compatible.disponible) {
        mostrarNotificacion('❌ Web Bluetooth no disponible. Activa el modo simulación.', 'danger');
        return false;
    }
    
    try {
        mostrarNotificacion('🔍 Buscando impresora Bluetooth...', 'info');
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }
            ],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        
        mostrarNotificacion('✅ Conectando...', 'info');
        
        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        bluetoothCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        
        impresoraConectada = true;
        localStorage.setItem('impresoraConectada', 'true');
        localStorage.setItem('impresoraNombre', bluetoothDevice.name || 'Impresora');
        
        const btn = document.getElementById('btnConectarImpresora');
        if (btn) {
            btn.innerHTML = `<i class="fas fa-bluetooth"></i> ${bluetoothDevice.name || 'Conectada'} ✅`;
            btn.className = 'btn btn-success w-100 mb-2 fw-bold py-2';
        }
        
        mostrarNotificacion(`✅ Impresora "${bluetoothDevice.name || 'Conectada'}" lista`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error Bluetooth:', error);
        impresoraConectada = false;
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

// ==================== CONSTRUIR TICKET ====================
function construirTicket(cliente, metodoPago, total) {
    const fecha = new Date().toLocaleString();
    const items = window.carrito || [];
    let ticket = '';
    
    const LINE_FEED = '\x0A';
    const SEPARATOR = '='.repeat(32) + LINE_FEED;
    
    // Encabezado
    ticket += '    MATTI\'S B-B-Q' + LINE_FEED;
    ticket += SEPARATOR;
    ticket += `Fecha: ${fecha}` + LINE_FEED;
    ticket += `Cliente: ${cliente}` + LINE_FEED;
    ticket += `Pago: ${metodoPago}` + LINE_FEED;
    ticket += SEPARATOR + LINE_FEED;
    
    // Items
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
    
    ticket += '¡Gracias por su visita!' + LINE_FEED;
    ticket += '¡Vuelva pronto!' + LINE_FEED + LINE_FEED;
    
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
    
    // Si estamos en modo simulación
    if (modoSimulacion || localStorage.getItem('impresoraSimulacion') === 'true') {
        const ticket = construirTicket(cliente, metodoPago, total);
        console.log('📄 TICKET IMPRESO (SIMULACIÓN)');
        console.log('='.repeat(40));
        console.log(ticket);
        console.log('='.repeat(40));
        mostrarNotificacion('🖨️ [SIMULACIÓN] Ticket mostrado en consola (F12)', 'info');
        return true;
    }
    
    // Verificar conexión real
    if (!impresoraConectada || !bluetoothCharacteristic) {
        const conectado = await conectarImpresora();
        if (!conectado) {
            mostrarNotificacion('⚠️ Conecta la impresora primero o activa modo simulación', 'warning');
            return false;
        }
    }
    
    try {
        mostrarNotificacion('🖨️ Imprimiendo ticket...', 'info');
        const ticket = construirTicket(cliente, metodoPago, total);
        const encoder = new TextEncoder();
        const data = encoder.encode(ticket);
        await bluetoothCharacteristic.writeValue(data);
        mostrarNotificacion('✅ Ticket impreso', 'success');
        return true;
    } catch (error) {
        console.error('Error imprimiendo:', error);
        mostrarNotificacion('❌ Error al imprimir: ' + error.message, 'danger');
        return false;
    }
}

// ==================== ABRIR CAJA ====================
async function abrirCajaDespuesDeCobro() {
    try {
        const response = await fetch('/api/cash/drawer/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            console.log('💰 Caja abierta');
        } else {
            console.log('⚠️ No se pudo abrir caja:', result.error);
        }
        return result.success;
    } catch (error) {
        console.error('Error abriendo caja:', error);
        return false;
    }
}

// ==================== COBRAR CON TICKET ====================
async function cobrarConTicket() {
    console.log('🔄 Procesando cobro con ticket...');
    
    // Ejecutar el cobro (llama a procesarPago que está en caja.js)
    if (typeof window.procesarPago === 'function') {
        await window.procesarPago();
    } else {
        console.error('❌ función procesarPago no encontrada');
        mostrarNotificacion('❌ Error: función de cobro no disponible', 'danger');
        return false;
    }
    
    // Esperar a que se complete el cobro
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Imprimir ticket
    const impreso = await imprimirTicketAutomatico();
    
    // Abrir caja si se imprimió correctamente
    if (impreso) {
        await abrirCajaDespuesDeCobro();
    }
    
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

// Exponer funciones globales
window.conectarImpresora = conectarImpresora;
window.imprimirTicketAutomatico = imprimirTicketAutomatico;
window.abrirCajaDespuesDeCobro = abrirCajaDespuesDeCobro;
window.cobrarConTicket = cobrarConTicket;
window.activarModoSimulacion = activarModoSimulacion;