import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, addDoc, serverTimestamp, setLogLevel, getDocs, where, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Establecer nivel de log para depuración de Firestore
setLogLevel('Debug');

// ====================================================================
// >>> CONFIGURACIÓN DE FIREBASE PROPORCIONADA POR EL USUARIO <<<
// ====================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAY96YjG0s5V_oXmawNxuB_Cyk3dXafbbk",
  authDomain: "facturas-cbddc.firebaseapp.com",
  projectId: "facturas-cbddc",
  storageBucket: "facturas-cbddc.firebasestorage.app",
  messagingSenderId: "142274543659",
  appId: "1:142274543659:web:f1e969d2f2dc18d7fd2a6e",
  measurementId: "G-R4XDV1FGMV"
};
const appId = firebaseConfig.appId; // Se extrae para compatibilidad con la función de backend
const initialAuthToken = null; // No se necesita para el flujo de autenticación anónima
// ====================================================================

let app, db, auth;
let currentUserId = 'loading';

// Elementos UI
const loadingMessage = document.getElementById('loading-message');
const mainContent = document.getElementById('main-content');
const userIdDisplay = document.getElementById('user-id-display');
const recentInvoicesList = document.getElementById('recent-invoices-list');
const totalSumDisplay = document.getElementById('total-sum-display');

// Estado de la aplicación
let allInvoices = [];
let companies = [];
let invoicesToExport = [];

async function initializeFirebase() {
    try {
        if (!firebaseConfig) {
            loadingMessage.textContent = 'ERROR CRÍTICO: Configuración de Firebase no encontrada.';
            return;
        }

        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        const functions = getFunctions(app); // Inicializar Firebase Functions

        // La función que apunta a nuestro backend seguro
        const calculateReportCallable = httpsCallable(functions, 'calculateReport');

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                     console.error("Error de autenticación:", error);
                     loadingMessage.textContent = 'Error: No se pudo conectar. Verifica las Reglas de Seguridad.';
                     return;
                }
            }
            currentUserId = auth.currentUser?.uid || 'anonymous';
            userIdDisplay.textContent = `Tu ID de usuario: ${currentUserId}`;
            loadingMessage.classList.add('hidden');
            mainContent.classList.remove('hidden');
            setupFirestoreListeners();
            setupReportControlsListeners();
        });

    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        loadingMessage.textContent = 'Error al cargar la aplicación.';
    }
}

function getCollectionRef(collectionName) {
    return collection(db, `artifacts/${appId}/public/data/${collectionName}`);
}

function setupFirestoreListeners() {
    const invoicesQuery = query(getCollectionRef('invoices'));
    onSnapshot(invoicesQuery, (snapshot) => {
        const newInvoices = [];
        const newCompanies = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            const invoice = { id: doc.id, ...data };
            if (invoice.timestamp) {
                newInvoices.push(invoice);
                newCompanies.add(invoice.company);
            }
        });

        newInvoices.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        allInvoices = newInvoices;
        companies = Array.from(newCompanies).sort();

        renderRecentInvoices(allInvoices.slice(0, 10));
        updateCompanyDropdowns();

        const companyAdminListContainer = document.getElementById('company-admin-list-container');
        if (companyAdminListContainer && !companyAdminListContainer.classList.contains('hidden')) {
            renderCompaniesForManagement(companies);
        }
    }, (error) => console.error("Error al escuchar facturas:", error));
}

function renderRecentInvoices(invoices) {
    recentInvoicesList.innerHTML = '';
    if (invoices.length === 0) {
        recentInvoicesList.innerHTML = '<p class="text-gray-500 italic">No hay facturas registradas aún.</p>';
        return;
    }
    invoices.forEach(invoice => {
        const date = new Date(invoice.timestamp.seconds * 1000).toLocaleDateString('es-ES');
        const item = document.createElement('div');
        item.className = 'p-3 bg-white rounded-lg mb-2 flex justify-between items-center card-shadow';
        item.innerHTML = `
            <div class="text-sm">
                <span class="font-bold text-indigo-700">${invoice.company}</span>
                <span class="text-gray-600 ml-3">| Reg: ${date}</span>
            </div>
            <div class="font-semibold text-lg text-green-600">*** €</div>`;
        recentInvoicesList.appendChild(item);
    });
}

function updateCompanyDropdowns() {
    const newInvoiceSelect = document.getElementById('company-select');
    const companyFilter = document.getElementById('report-company-filter');

    const selectedInvoice = newInvoiceSelect.value;
    const selectedFilter = companyFilter.value;

    newInvoiceSelect.innerHTML = '<option value="" disabled>Selecciona una empresa</option>';
    companyFilter.innerHTML = '<option value="">Todas las Empresas</option>';

    companies.forEach(company => {
        newInvoiceSelect.innerHTML += `<option value="${company}">${company}</option>`;
        companyFilter.innerHTML += `<option value="${company}">${company}</option>`;
    });

    newInvoiceSelect.innerHTML += '<option value="__NEW_COMPANY__">--- Agregar Nueva Empresa ---</option>';

    newInvoiceSelect.value = selectedInvoice || "";
    companyFilter.value = selectedFilter || "";
}

const companySelect = document.getElementById('company-select');
const newCompanyInputContainer = document.getElementById('new-company-input-container');
const newCompanyInput = document.getElementById('new-company-input');

companySelect.addEventListener('change', () => {
    const isNew = companySelect.value === '__NEW_COMPANY__';
    newCompanyInputContainer.classList.toggle('hidden', !isNew);
    newCompanyInput.required = isNew;
});

const invoiceForm = document.getElementById('invoice-form');
invoiceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formMessage = document.getElementById('form-message');
    formMessage.textContent = 'Guardando...';
    formMessage.className = 'text-blue-500 mt-2';

    const company = (companySelect.value === '__NEW_COMPANY__') ? newCompanyInput.value.trim() : companySelect.value.trim();
    const amount = parseFloat(document.getElementById('amount-input').value);
    const invoiceDate = document.getElementById('invoice-date-input').value;
    const dueDate = document.getElementById('due-date-input').value;

    if (!company || isNaN(amount) || amount <= 0 || !dueDate || !invoiceDate) {
        formMessage.textContent = 'Por favor, rellena todos los campos correctamente.';
        formMessage.className = 'text-red-500 mt-2';
        return;
    }

    try {
        await addDoc(getCollectionRef('invoices'), { company, amount, dueDate, invoiceDate, userId: currentUserId, timestamp: serverTimestamp() });
        formMessage.textContent = '¡Factura registrada con éxito!';
        formMessage.className = 'text-green-500 mt-2';
        invoiceForm.reset();
        newCompanyInputContainer.classList.add('hidden');
        newCompanyInput.required = false;
        companySelect.value = '';
    } catch (error) {
        console.error("Error al guardar la factura:", error);
        formMessage.textContent = 'Error al guardar. Revisa la consola.';
        formMessage.className = 'text-red-500 mt-2';
    }
});

const calculateButton = document.getElementById('calculate-sum-button');
calculateButton.addEventListener('click', async () => {
    const passwordInput = document.getElementById('report-password');
    const passwordError = document.getElementById('password-error');
    const calculateBtn = document.getElementById('calculate-sum-button');

    // Desactivar botón y mostrar estado de carga
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Calculando...';
    passwordError.textContent = '';
    resetReportDisplay();

    const reportParams = {
        password: passwordInput.value,
        appId: appId,
        selectedCompany: document.getElementById('report-company-filter').value,
        mainDateFilter: document.getElementById('main-date-filter').value,
        startDate: document.getElementById('start-date-filter').value,
        endDate: document.getElementById('end-date-filter').value,
    };

    try {
        const result = await calculateReportCallable(reportParams);

        // La función se ejecutó con éxito
        const { totalSum, invoiceCount } = result.data;
        totalSumDisplay.textContent = `${totalSum.toFixed(2)} €`;

        let title = `Total para ${reportParams.selectedCompany || 'Todas las Empresas'}`;
         if (reportParams.mainDateFilter !== 'none') {
            let filterDesc = reportParams.mainDateFilter === 'invoiceDateRange' ? 'Factura' : 'Vencimiento';
            title += ` (Fecha ${filterDesc}`;
            if (reportParams.startDate || reportParams.endDate) {
                title += `: `;
                if(reportParams.startDate) title += `Desde ${reportParams.startDate} `;
                if(reportParams.endDate) title += `Hasta ${reportParams.endDate}`;
            }
            title += `)`;
        }
        document.getElementById('sum-title').textContent = title + ':';

        // Lógica para exportar a CSV (simplificada, ya que no se devuelve la lista)
        // Podríamos adaptar la función para que también devuelva los datos si es necesario.
        // Por ahora, deshabilitamos la exportación si el cálculo es a través de la función.
        const exportCsvButton = document.getElementById('export-csv-button');
        exportCsvButton.disabled = true;
        exportCsvButton.classList.add('opacity-50', 'cursor-not-allowed');
        document.getElementById('report-feedback').textContent = `${invoiceCount} facturas consideradas en el cálculo.`;


    } catch (error) {
        // La función devolvió un error (ej. contraseña incorrecta)
        console.error("Error al llamar a la función de reporte:", error);
        passwordError.textContent = error.message || "Ocurrió un error desconocido.";
        resetReportDisplay();
    } finally {
        // Reactivar el botón
        calculateBtn.disabled = false;
        calculateBtn.textContent = 'Calcular';
    }
});

function resetReportDisplay() {
    totalSumDisplay.textContent = '0.00 €';
    document.getElementById('sum-title').textContent = 'Total Acumulado Global:';
    document.getElementById('report-feedback').textContent = '';
    const exportBtn = document.getElementById('export-csv-button');
    exportBtn.disabled = true;
    exportBtn.classList.add('opacity-50', 'cursor-not-allowed');
    invoicesToExport = [];
}

function setupReportControlsListeners() {
    const reportControlsIds = ['report-password', 'report-company-filter', 'main-date-filter', 'start-date-filter', 'end-date-filter'];
    reportControlsIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', resetReportDisplay);
            if(element.type === 'password' || element.type === 'date') {
               element.addEventListener('input', resetReportDisplay);
            }
        }
    });

    const mainDateFilterEl = document.getElementById('main-date-filter');
    const dateRangeInputsEl = document.getElementById('date-range-inputs');
    mainDateFilterEl.addEventListener('change', () => {
        if (mainDateFilterEl.value === 'none') {
            dateRangeInputsEl.classList.add('hidden');
            document.getElementById('start-date-filter').value = '';
            document.getElementById('end-date-filter').value = '';
        } else {
            dateRangeInputsEl.classList.remove('hidden');
        }
        resetReportDisplay();
    });
}

document.getElementById('export-csv-button').addEventListener('click', () => {
     const reportFeedback = document.getElementById('report-feedback');
     if (invoicesToExport.length === 0) {
        reportFeedback.textContent = 'No hay datos para exportar con el filtro actual.';
        reportFeedback.className = 'text-orange-500 mt-2 font-medium';
        return;
     }
     reportFeedback.textContent = '';
     const headers = ['Empresa', 'Importe (€)', 'Fecha Factura', 'Fecha Vencimiento', 'Registrado Por (UserID)', 'Fecha de Registro'];
     const csvRows = invoicesToExport.map(inv => [
        `"${inv.company.replace(/"/g, '""')}"`, inv.amount.toFixed(2).replace('.', ','), inv.invoiceDate, inv.dueDate, inv.userId, new Date(inv.timestamp.seconds * 1000).toLocaleString('es-ES')
     ].join(';'));
     const csvContent = [headers.join(';'), ...csvRows].join('\n');
     const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `Reporte_Facturas_${new Date().toISOString().slice(0, 10)}.csv`;
     link.click();
     URL.revokeObjectURL(link.href);
     reportFeedback.textContent = `Informe "${link.download}" descargado.`;
     reportFeedback.className = 'text-green-600 mt-2 font-medium';
});

// --- Lógica de Administración de Empresas ---
const unlockCompanyAdminButton = document.getElementById('unlock-company-admin-button');
const companyAdminControls = document.getElementById('company-admin-controls');
const companyAdminListContainer = document.getElementById('company-admin-list-container');
const companyAdminPasswordInput = document.getElementById('admin-password-company');
const companyAdminError = document.getElementById('company-admin-error');
const companyAdminList = document.getElementById('company-admin-list');

unlockCompanyAdminButton.addEventListener('click', () => {
    // NOTA: La contraseña para esta sección sigue siendo local.
    // Para una seguridad completa, esto también debería moverse a una función de nube.
    // Por ahora, lo dejamos así para centrarnos en el refactor principal.
    if (companyAdminPasswordInput.value === "admin") {
        companyAdminListContainer.classList.remove('hidden');
        companyAdminControls.classList.add('hidden');
        companyAdminError.classList.add('hidden');
        renderCompaniesForManagement(companies);
    } else {
        companyAdminError.textContent = 'Contraseña incorrecta.';
        companyAdminError.classList.remove('hidden');
    }
});

function renderCompaniesForManagement(companyList) {
    companyAdminList.innerHTML = '';
    if (companyList.length === 0) {
        companyAdminList.innerHTML = '<p class="text-gray-500 italic">No hay empresas para administrar.</p>';
        return;
    }
    companyList.forEach(company => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center border';
        item.dataset.companyName = company;
        item.innerHTML = `
            <span class="font-medium text-gray-800">${company}</span>
            <div class="space-x-2">
                <button class="edit-btn text-sm py-1 px-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition">Editar</button>
                <button class="delete-btn text-sm py-1 px-3 bg-red-500 text-white rounded hover:bg-red-600 transition">Eliminar</button>
            </div>`;
        companyAdminList.appendChild(item);
    });
}

companyAdminList.addEventListener('click', async (e) => {
    const companyItem = e.target.closest('div[data-company-name]');
    if (!companyItem) return;
    const oldCompanyName = companyItem.dataset.companyName;

    if (e.target.classList.contains('edit-btn')) {
        handleEditCompany(oldCompanyName);
    }
    if (e.target.classList.contains('delete-btn')) {
        handleDeleteCompany(oldCompanyName);
    }
});

async function handleEditCompany(oldName) {
    const newName = await showModal({ title: `Editar Empresa`, body: `Introduce el nuevo nombre para "${oldName}".`, inputLabel: 'Nuevo nombre:', confirmText: 'Guardar' });
    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
        const confirmation = await showModal({ title: 'Confirmar Cambio', body: `¿Seguro que quieres cambiar "${oldName}" a "${newName.trim()}"? Esto actualizará TODAS las facturas asociadas.`, confirmText: 'Sí, cambiar', cancelText: 'Cancelar' });
        if (confirmation) {
            updateCompanyNameInFirestore(oldName, newName.trim());
        }
    } else if (newName !== null) {
        showModal({ title: "Error", body: "El nuevo nombre no puede estar vacío ni ser igual al anterior.", confirmText: "Entendido", cancelText: null });
    }
}

async function handleDeleteCompany(companyName) {
    if (allInvoices.some(invoice => invoice.company === companyName)) {
        showModal({ title: "Acción no permitida", body: `No se puede eliminar "${companyName}" porque tiene facturas asociadas.`, confirmText: "Entendido", cancelText: null });
        return;
    }
    const confirmation = await showModal({ title: 'Confirmar Eliminación', body: `¿Seguro que quieres eliminar "${companyName}"? Esta acción no se puede deshacer.`, confirmText: 'Sí, eliminar', cancelText: 'Cancelar' });
    if (confirmation) {
        showModal({ title: "Información", body: "Función no implementada, ya que las empresas sin facturas no aparecen en la lista.", confirmText: "OK", cancelText: null });
    }
}

async function updateCompanyNameInFirestore(oldName, newName) {
    companyAdminList.innerHTML = `<p class="text-blue-600 font-semibold p-4 text-center">Actualizando registros, por favor espera...</p>`;
    try {
        const q = query(getCollectionRef('invoices'), where("company", "==", oldName));
        const querySnapshot = await getDocs(q);
        const updatePromises = querySnapshot.docs.map(doc => updateDoc(doc.ref, { company: newName }));
        await Promise.all(updatePromises);
        showModal({ title: "Éxito", body: `Se han actualizado ${querySnapshot.size} facturas. La lista se refrescará.`, confirmText: "Genial", cancelText: null });
    } catch (error) {
        console.error("Error al actualizar en Firestore:", error);
        showModal({ title: "Error", body: "Ocurrió un error durante la actualización. Revisa la consola.", confirmText: "Entendido", cancelText: null });
    }
}

// --- Lógica del Modal Genérico ---
const modal = document.getElementById('generic-modal');
let modalResolve = null;
function showModal({ title, body, inputLabel = null, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
    return new Promise(resolve => {
        modalResolve = resolve;
        modal.querySelector('#modal-title').textContent = title;
        modal.querySelector('#modal-body').textContent = body;
        const confirmBtn = modal.querySelector('#modal-confirm-btn');
        const cancelBtn = modal.querySelector('#modal-cancel-btn');
        const inputContainer = modal.querySelector('#modal-input-container');
        const inputField = modal.querySelector('#modal-input');

        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        cancelBtn.classList.toggle('hidden', !cancelText);

        inputContainer.classList.toggle('hidden', !inputLabel);
        if (inputLabel) {
            inputContainer.querySelector('#modal-input-label').textContent = inputLabel;
            inputField.value = '';
        }
        modal.classList.remove('hidden');
        if (inputLabel) inputField.focus();
    });
}
modal.querySelector('#modal-confirm-btn').addEventListener('click', () => {
    if (modalResolve) {
        const isInputVisible = !modal.querySelector('#modal-input-container').classList.contains('hidden');
        modalResolve(isInputVisible ? modal.querySelector('#modal-input').value : true);
    }
    modal.classList.add('hidden');
});
modal.querySelector('#modal-cancel-btn').addEventListener('click', () => {
    if (modalResolve) modalResolve(null);
    modal.classList.add('hidden');
});

initializeFirebase();