import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, addDoc, serverTimestamp, setLogLevel, getDocs, where, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Se asume que las variables `firebaseConfig` y `AUTHORIZED_EMAIL`
// son cargadas globalmente por el archivo `config.js` antes de que se ejecute este script.
const appId = firebaseConfig.appId;

let app, db, auth, functions;
let currentUserId = 'loading';
let allInvoices = [];
let companies = [];
let invoicesToExport = [];

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        functions = getFunctions(app);

        setupAuthListeners();
        setupEventListeners();
        setupModalListeners();

    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        const authContainer = document.getElementById('auth-container');
        authContainer.innerHTML = '<p class="text-red-500 text-center">Error crítico al cargar la configuración de la aplicación.</p>';
    }
});

// --- LÓGICA DE AUTENTICACIÓN ---
function setupAuthListeners() {
    const calculateReportCallable = httpsCallable(functions, 'calculateReport');

    onAuthStateChanged(auth, (user) => {
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');

        if (user) {
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');

            currentUserId = user.uid;
            document.getElementById('user-id-display').textContent = `Usuario: ${user.email}`;

            document.getElementById('loading-message').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');

            setupFirestoreListeners();
            setupReportControlsListeners(calculateReportCallable);
            setupAdminControlsListeners();
        } else {
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
            currentUserId = null;
        }
    });
}

function setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const logoutButton = document.getElementById('logout-button');
    const loginView = document.getElementById('login-view');
    const forgotPasswordView = document.getElementById('forgot-password-view');
    const showForgotPassword = document.getElementById('show-forgot-password');
    const backToLogin = document.getElementById('back-to-login');

    loginForm.addEventListener('submit', handleLoginOrRegister);
    logoutButton.addEventListener('click', handleLogout);
    forgotPasswordForm.addEventListener('submit', handleForgotPassword);

    showForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        forgotPasswordView.classList.remove('hidden');
    });

    backToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.remove('hidden');
        forgotPasswordView.classList.add('hidden');
    });
}

async function handleLoginOrRegister(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDisplay = document.getElementById('auth-error');
    errorDisplay.textContent = '';

    try {
        // Intenta iniciar sesión primero
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            // Si el usuario no existe, se asume que es un intento de registro.
            // La autorización real ocurre en el backend. El frontend ya no necesita
            // conocer el correo autorizado.
            try {
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (registerError) {
                // Este error se mostrará si el correo no es válido, la contraseña es débil, etc.
                errorDisplay.textContent = `Error en el registro: ${registerError.message}`;
            }
        } else if (error.code === 'auth/wrong-password') {
            errorDisplay.textContent = 'La contraseña es incorrecta.';
        } else {
            errorDisplay.textContent = `Error: ${error.message}`;
        }
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-password-email').value;
    const messageDisplay = document.getElementById('forgot-password-message');
    messageDisplay.textContent = '';

    try {
        await sendPasswordResetEmail(auth, email);
        messageDisplay.textContent = 'Se ha enviado un enlace de restablecimiento a tu correo.';
        messageDisplay.className = 'text-green-500 text-center mt-4';
    } catch (error) {
        messageDisplay.textContent = `Error: ${error.message}`;
        messageDisplay.className = 'text-red-500 text-center mt-4';
    }
}

// --- LÓGICA DE LA APLICACIÓN ---
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
        renderCompaniesForManagement(companies);
    }, (error) => console.error("Error al escuchar facturas:", error));
}

function renderRecentInvoices(invoices) {
    const recentInvoicesList = document.getElementById('recent-invoices-list');
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

function setupAdminControlsListeners() {
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
}

function setupReportControlsListeners(calculateReportCallable) {
    const calculateButton = document.getElementById('calculate-sum-button');
    calculateButton.addEventListener('click', async () => {
        const passwordError = document.getElementById('password-error');
        const calculateBtn = document.getElementById('calculate-sum-button');
        calculateBtn.disabled = true;
        calculateBtn.textContent = 'Calculando...';
        passwordError.textContent = '';
        resetReportDisplay();

        const reportParams = {
            appId: appId,
            selectedCompany: document.getElementById('report-company-filter').value,
            mainDateFilter: document.getElementById('main-date-filter').value,
            startDate: document.getElementById('start-date-filter').value,
            endDate: document.getElementById('end-date-filter').value,
        };

        try {
            const result = await calculateReportCallable(reportParams);
            const { totalSum, invoiceCount } = result.data;
            document.getElementById('total-sum-display').textContent = `${totalSum.toFixed(2)} €`;
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
            document.getElementById('report-feedback').textContent = `${invoiceCount} facturas consideradas en el cálculo.`;
        } catch (error) {
            console.error("Error al llamar a la función de reporte:", error);
            passwordError.textContent = error.message || "Ocurrió un error desconocido.";
            resetReportDisplay();
        } finally {
            calculateBtn.disabled = false;
            calculateBtn.textContent = 'Calcular';
        }
    });

    const reportControlsIds = ['report-company-filter', 'main-date-filter', 'start-date-filter', 'end-date-filter'];
    reportControlsIds.forEach(id => {
        document.getElementById(id)?.addEventListener('change', resetReportDisplay);
    });

    document.getElementById('main-date-filter')?.addEventListener('change', () => {
        const mainDateFilterEl = document.getElementById('main-date-filter');
        const dateRangeInputsEl = document.getElementById('date-range-inputs');
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

function resetReportDisplay() {
    document.getElementById('total-sum-display').textContent = '0.00 €';
    document.getElementById('sum-title').textContent = 'Total Acumulado Global:';
    document.getElementById('report-feedback').textContent = '';
    const exportBtn = document.getElementById('export-csv-button');
    exportBtn.disabled = true;
    exportBtn.classList.add('opacity-50', 'cursor-not-allowed');
    invoicesToExport = [];
}

function renderCompaniesForManagement(companyList) {
    const companyAdminList = document.getElementById('company-admin-list');
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

document.getElementById('company-admin-list')?.addEventListener('click', async (e) => {
    const companyItem = e.target.closest('div[data-company-name]');
    if (!companyItem) return;
    const oldCompanyName = companyItem.dataset.companyName;
    if (e.target.classList.contains('edit-btn')) handleEditCompany(oldCompanyName);
    if (e.target.classList.contains('delete-btn')) handleDeleteCompany(oldCompanyName);
});

async function handleEditCompany(oldName) {
    const newName = await showModal({ title: `Editar Empresa`, body: `Introduce el nuevo nombre para "${oldName}".`, inputLabel: 'Nuevo nombre:', confirmText: 'Guardar' });
    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
        const confirmation = await showModal({ title: 'Confirmar Cambio', body: `¿Seguro que quieres cambiar "${oldName}" a "${newName.trim()}"? Esto actualizará TODAS las facturas asociadas.`, confirmText: 'Sí, cambiar', cancelText: 'Cancelar' });
        if (confirmation) updateCompanyNameInFirestore(oldName, newName.trim());
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
        showModal({ title: "Información", body: "Función no implementada.", confirmText: "OK", cancelText: null });
    }
}

async function updateCompanyNameInFirestore(oldName, newName) {
    const companyAdminList = document.getElementById('company-admin-list');
    companyAdminList.innerHTML = `<p class="text-blue-600 font-semibold p-4 text-center">Actualizando registros, por favor espera...</p>`;
    try {
        const q = query(getCollectionRef('invoices'), where("company", "==", oldName));
        const querySnapshot = await getDocs(q);
        const updatePromises = querySnapshot.docs.map(doc => updateDoc(doc.ref, { company: newName }));
        await Promise.all(updatePromises);
        showModal({ title: "Éxito", body: `Se han actualizado ${querySnapshot.size} facturas.`, confirmText: "Genial", cancelText: null });
    } catch (error) {
        console.error("Error al actualizar en Firestore:", error);
        showModal({ title: "Error", body: "Ocurrió un error durante la actualización.", confirmText: "Entendido", cancelText: null });
    }
}

let modalResolve = null;
function showModal({ title, body, inputLabel = null, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
    const modal = document.getElementById('generic-modal');
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

function setupModalListeners() {
    document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('generic-modal');
        if (modalResolve) {
            const isInputVisible = !modal.querySelector('#modal-input-container').classList.contains('hidden');
            modalResolve(isInputVisible ? modal.querySelector('#modal-input').value : true);
        }
        modal.classList.add('hidden');
    });
    document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('generic-modal');
        if (modalResolve) modalResolve(null);
        modal.classList.add('hidden');
    });
}