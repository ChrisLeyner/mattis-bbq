// ==================== VARIABLES ====================
let fileToRestore = null;
let confirmModal = null;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    cargarEstadoBD();
    cargarHistorial();
    configurarDropZone();
    confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
});

// ==================== CONFIGURAR DROP ZONE ====================
function configurarDropZone() {
    const dropZone = document.getElementById('dropZone');
    const restoreInput = document.getElementById('restoreInput');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.sqlite') || file.name.endsWith('.db'))) {
            prepararRestauracion(file);
        } else {
            mostrarNotificacion('⚠️ Selecciona un archivo .sqlite válido', 'warning');
        }
    });

    restoreInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            prepararRestauracion(e.target.files[0]);
        }
    });
}

// ==================== ESTADO DE LA BASE DE DATOS ====================
async function cargarEstadoBD() {
    try {
        const response = await fetch('/admin/backup-info');
        const data = await response.json();
        
        document.getElementById('dbSize').innerText = `${data.size_mb} MB`;
        document.getElementById('dbModified').innerText = new Date(data.modified).toLocaleString();
        document.getElementById('dbInfo').innerHTML = `
            <small class="text-muted">
                📦 Tamaño: ${data.size_mb} MB | 
                🕐 Modificado: ${new Date(data.modified).toLocaleString()}
            </small>
        `;
        
        // Actualizar estado
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        if (data.size > 0) {
            indicator.className = 'status-indicator status-online';
            statusText.className = 'badge bg-success';
            statusText.innerText = 'ONLINE';
        } else {
            indicator.className = 'status-indicator status-warning';
            statusText.className = 'badge bg-warning';
            statusText.innerText = 'VACÍA';
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('dbInfo').innerHTML = `
            <small class="text-danger">❌ Error al conectar con la base de datos</small>
        `;
        const indicator = document.getElementById('statusIndicator');
        indicator.className = 'status-indicator status-offline';
        document.getElementById('statusText').className = 'badge bg-danger';
        document.getElementById('statusText').innerText = 'OFFLINE';
    }
}

// ==================== CREAR RESPALDO ====================
function crearRespaldo() {
    mostrarNotificacion('⏳ Generando respaldo...', 'info');
    
    // Abrir en nueva pestaña o descargar directamente
    const link = document.createElement('a');
    link.href = '/admin/backup';
    link.download = `respaldo_mattis_${new Date().toISOString().slice(0,10)}.sqlite`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    mostrarNotificacion('✅ Respaldo generado correctamente', 'success');
    
    // Registrar en historial
    agregarAlHistorial('respaldo', new Date().toISOString());
}

// ==================== PREPARAR RESTAURACIÓN ====================
function prepararRestauracion(file) {
    fileToRestore = file;
    
    document.getElementById('restoreFileName').innerText = file.name;
    document.getElementById('restoreFileSize').innerText = formatFileSize(file.size);
    
    // Mostrar modal de confirmación
    confirmModal.show();
}

// ==================== EJECUTAR RESTAURACIÓN ====================
async function ejecutarRestauracion() {
    const confirmCheck = document.getElementById('confirmCheck');
    if (!confirmCheck.checked) {
        mostrarNotificacion('⚠️ Debes confirmar la restauración', 'warning');
        return;
    }
    
    if (!fileToRestore) {
        mostrarNotificacion('⚠️ No hay archivo seleccionado', 'warning');
        return;
    }
    
    // Cerrar modal
    confirmModal.hide();
    
    // Mostrar progreso
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.innerText = 'Subiendo archivo...';
    progressPercent.innerText = '0%';
    
    try {
        const formData = new FormData();
        formData.append('backup', fileToRestore);
        
        const response = await fetch('/admin/restore', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            progressBar.style.width = '100%';
            progressText.innerText = '✅ ¡Restauración completada!';
            progressPercent.innerText = '100%';
            
            mostrarNotificacion('✅ Respaldo restaurado correctamente. Recargando...', 'success');
            
            // Recargar información
            setTimeout(() => {
                location.reload();
            }, 1500);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        progressBar.style.width = '0%';
        progressText.innerText = '❌ Error: ' + error.message;
        progressPercent.innerText = 'ERROR';
        mostrarNotificacion('❌ Error al restaurar: ' + error.message, 'danger');
    }
}

// ==================== HISTORIAL DE RESPALDOS ====================
function cargarHistorial() {
    const historial = obtenerHistorial();
    const container = document.getElementById('historialList');
    
    if (historial.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-3">No hay respaldos registrados</div>';
        return;
    }
    
    container.innerHTML = historial.map((item, index) => `
        <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
            <div>
                <i class="fas fa-file-archive text-success"></i>
                <span class="fw-bold">${item.tipo}</span>
                <small class="text-muted ms-2">${new Date(item.fecha).toLocaleString()}</small>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-success" onclick="descargarHistorial(${index})">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarHistorial(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function agregarAlHistorial(tipo, fecha) {
    let historial = obtenerHistorial();
    historial.unshift({ tipo, fecha });
    
    // Limitar a 50 registros
    if (historial.length > 50) {
        historial = historial.slice(0, 50);
    }
    
    localStorage.setItem('backupHistory', JSON.stringify(historial));
    cargarHistorial();
}

function obtenerHistorial() {
    try {
        return JSON.parse(localStorage.getItem('backupHistory')) || [];
    } catch {
        return [];
    }
}

function descargarHistorial(index) {
    const historial = obtenerHistorial();
    if (index >= 0 && index < historial.length) {
        const item = historial[index];
        // Descargar respaldo desde el servidor
        window.open('/admin/backup', '_blank');
    }
}

function eliminarHistorial(index) {
    if (confirm('¿Eliminar este registro del historial?')) {
        let historial = obtenerHistorial();
        historial.splice(index, 1);
        localStorage.setItem('backupHistory', JSON.stringify(historial));
        cargarHistorial();
    }
}

function vaciarHistorial() {
    if (confirm('¿Vaciar todo el historial de respaldos?')) {
        localStorage.removeItem('backupHistory');
        cargarHistorial();
        mostrarNotificacion('Historial vaciado', 'info');
    }
}

// ==================== UTILIDADES ====================
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} position-fixed top-0 end-0 m-3 shadow`;
    div.style.zIndex = '9999';
    div.style.minWidth = '300px';
    div.style.maxWidth = '500px';
    div.innerHTML = mensaje;
    document.body.appendChild(div);
    
    const audio = document.getElementById('notificacion');
    audio.play().catch(() => {});
    
    setTimeout(() => div.remove(), 4000);
}

// ==================== EVENTOS DEL MODAL ====================
document.getElementById('confirmCheck')?.addEventListener('change', function() {
    document.getElementById('confirmRestoreBtn').disabled = !this.checked;
});

// ==================== REFRESCO AUTOMÁTICO ====================
// Recargar estado cada 30 segundos
setInterval(cargarEstadoBD, 30000);