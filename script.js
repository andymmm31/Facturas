import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    EmailAuthProvider,
    linkWithCredential,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, addDoc, serverTimestamp, setLogLevel, getDocs, where, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

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

        document.getElementById('main-content').classList.remove('hidden');

        setupEventListeners();
        setupAuthListeners();

    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        document.body.innerHTML = '<p class="text-red-500 text-center p-8">Error crítico al cargar la configuración de la aplicación.</p>';
    }
});

// --- LÓGICA DE AUTENTICACIÓN Y UI ---
function setupAuthListeners() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            updateUIForUser(user);
            currentUserId = user.uid;
            if (!user.isAnonymous) {
                setupFirestoreListeners();
            }
        } else {
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Error al iniciar sesión anónima:", error);
                document.getElementById('user-id-display').textContent = "Error de conexión.";
            }
        }
    });
}

function updateUIForUser(user) {
    const logoutButton = document.getElementById('logout-button');
    const userIdDisplay = document.getElementById('user-id-display');
    const loadingMessage = document.getElementById('loading-message');

    loadingMessage.classList.add('hidden');

    if (user.isAnonymous) {
        userIdDisplay.textContent = `Tu ID de sesión temporal: ${user.uid}`;
        logoutButton.classList.add('hidden');
    } else {
        userIdDisplay.textContent = `Usuario: ${user.email}`;
        logoutButton.classList.remove('hidden');
    }
}

function setupEventListeners() {
    // Botón de calcular siempre activo
    const calculateButton = document.getElementById('calculate-sum-button');
    calculateButton.addEventListener('click', handleCalculateClick);

    // Otros listeners
    setupAdminControlsListeners();
    setupModalListeners();
}

async function handleCalculateClick() {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
        const loggedIn = await showLoginModal();
        if (!loggedIn) return;
    }

    // Proceder con el cálculo
    const calculateReportCallable = httpsCallable(functions, 'calculateReport');
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
}


// --- LÓGICA DE LA APLICACIÓN (Facturas, etc.) ---
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

function showLoginModal() {
    const modal = document.getElementById('generic-modal');
    const modalContent = document.getElementById('modal-content');
    const titleEl = modal.querySelector('#modal-title');
    const confirmBtn = modal.querySelector('#modal-confirm-btn');
    const cancelBtn = modal.querySelector('#modal-cancel-btn');

    titleEl.textContent = 'Iniciar Sesión para Reportes';
    confirmBtn.textContent = 'Entrar';
    cancelBtn.textContent = 'Cancelar';

    modalContent.innerHTML = `
        <form id="modal-login-form" class="space-y-4">
            <input type="email" id="modal-login-email" placeholder="Correo electrónico" required class="w-full input-style">
            <input type="password" id="modal-login-password" placeholder="Contraseña (inicial: admin)" required class="w-full input-style">
            <p id="modal-auth-error" class="text-red-500 text-center"></p>
            <div class="text-center">
                <a href="#" id="modal-forgot-password" class="text-sm text-indigo-600 hover:underline">¿Olvidaste tu contraseña?</a>
            </div>
        </form>
    `;

    modal.classList.remove('hidden');

    return new Promise(resolve => {
        modalResolve = resolve;

        const loginForm = modal.querySelector('#modal-login-form');
        const forgotPasswordLink = modal.querySelector('#modal-forgot-password');

        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = modal.querySelector('#modal-login-email').value;
            const password = modal.querySelector('#modal-login-password').value;
            const errorDisplay = modal.querySelector('#modal-auth-error');
            errorDisplay.textContent = '';

            try {
                const credential = EmailAuthProvider.credential(email, password);
                await linkWithCredential(auth.currentUser, credential);
                modal.classList.add('hidden');
                resolve(true);
            } catch (error) {
                errorDisplay.textContent = 'Error: Credenciales incorrectas.';
                console.error("Error al vincular credenciales:", error);
                resolve(false);
            }
        };

        forgotPasswordLink.onclick = async (e) => {
            e.preventDefault();
            const email = modal.querySelector('#modal-login-email').value;
            const errorDisplay = modal.querySelector('#modal-auth-error');
            if (!email) {
                errorDisplay.textContent = 'Introduce tu correo para restablecer la contraseña.';
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                errorDisplay.textContent = 'Enlace de restablecimiento enviado.';
                errorDisplay.className = 'text-green-500 text-center';
            } catch (error) {
                errorDisplay.textContent = 'Error al enviar el correo.';
            }
        };
    });
}

function showModal({ title, body, inputLabel = null, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
    const modal = document.getElementById('generic-modal');
    const modalContent = document.getElementById('modal-content');
    const titleEl = modal.querySelector('#modal-title');
    titleEl.textContent = title;

    modalContent.innerHTML = '';

    const bodyP = document.createElement('p');
    bodyP.className = 'text-gray-600 mb-6';
    bodyP.textContent = body;
    modalContent.appendChild(bodyP);

    if (inputLabel) {
        const inputContainer = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = inputLabel;
        label.className = 'block text-sm font-medium text-gray-700';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'modal-input';
        input.className = 'w-full input-style mt-1';
        inputContainer.appendChild(label);
        inputContainer.appendChild(input);
        modalContent.appendChild(inputContainer);
    }

    return new Promise(resolve => {
        modalResolve = resolve;
        const confirmBtn = modal.querySelector('#modal-confirm-btn');
        const cancelBtn = modal.querySelector('#modal-cancel-btn');

        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        cancelBtn.classList.toggle('hidden', !cancelText);

        modal.classList.remove('hidden');
        const inputField = modal.querySelector('#modal-input');
        if (inputField) inputField.focus();
    });
}

function setupModalListeners() {
    document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('generic-modal');
        if (modalResolve) {
            const inputField = modal.querySelector('#modal-input');
            modalResolve(inputField ? inputField.value : true);
        }
        modal.classList.add('hidden');
    });

    document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('generic-modal');
        if (modalResolve) modalResolve(null);
        modal.classList.add('hidden');
    });
}