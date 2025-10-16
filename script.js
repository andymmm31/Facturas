import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, EmailAuthProvider, linkWithCredential, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- Variables Globales ---
let app, auth, db, functions;
let currentUserId = null;
let allInvoices = [];
let allCompanies = [];
let lastExportedInvoices = [];
const AUTHORIZED_USERS_EMAIL = ["julian.s.2025@invoicereports.com", "andres.mera@invoicereports.com"];

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        functions = getFunctions(app);

        mountApp();
        setupEventListeners();
        setupAuthListeners();

    } catch (error) {
        console.error("Error crítico al inicializar Firebase:", error);
        document.body.innerHTML = `<div class="p-8 text-center text-red-600">Error: No se pudo cargar la configuración de Firebase. Asegúrate de que tu archivo <strong>config.js</strong> es correcto.</div>`;
    }
});

function mountApp() {
    document.getElementById('invoice-form').innerHTML = `
        <div><label for="company-select" class="block text-sm font-medium text-slate-600">Empresa</label><select id="company-select" required class="input-style mt-1"></select></div>
        <div><label for="amount-input" class="block text-sm font-medium text-slate-600">Importe (€)</label><input type="number" step="0.01" id="amount-input" required class="input-style mt-1" placeholder="100.00"></div>
        <div><label for="invoice-date-input" class="block text-sm font-medium text-slate-600">Fecha de factura</label><input type="date" id="invoice-date-input" required class="input-style mt-1"></div>
        <div><label for="due-date-input" class="block text-sm font-medium text-slate-600">Fecha de vencimiento</label><input type="date" id="due-date-input" required class="input-style mt-1"></div>
        <button type="submit" class="w-full py-3 px-4 bg-sky-600 text-white hover:bg-sky-700">Guardar factura</button>
        <p id="form-message" class="text-center text-sm h-4 mt-2"></p>`;

    document.getElementById('report-results').innerHTML = `
        <p id="sum-title" class="text-xl font-semibold text-slate-600 mb-2">Resultados del reporte</p>
        <div id="total-sum-display" class="text-5xl font-extrabold text-teal-600">0.00 €</div>
        <p id="report-feedback" class="text-red-500 mt-2 font-medium h-4"></p>
        <button id="export-button" class="hidden mt-6 py-2 px-5 bg-blue-600 text-white hover:bg-blue-700">Exportar a Excel</button>`;

    document.getElementById('date-filter-type').innerHTML = `
        <option value="range">Filtro por rango</option>
        <option value="invoiceDate">Por fecha de factura</option>
        <option value="dueDate">Por fecha de vencimiento</option>`;
}

function setupAuthListeners() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            updateUIForUser(user);
            setupFirestoreListeners();
        } else {
            signInAnonymously(auth).catch(err => console.error(err));
        }
    });
}

function updateUIForUser(user) {
    const isAnon = user.isAnonymous;
    const isAuthorized = user.email && AUTHORIZED_USERS_EMAIL.includes(user.email);
    const userIdDisplay = document.getElementById('user-id-display');

    if (isAuthorized) {
        userIdDisplay.textContent = `Usuario: ${user.email.split('@')[0]}`;
    } else {
        userIdDisplay.textContent = '';
    }

    document.getElementById('logout-button').classList.toggle('hidden', isAnon);
    document.getElementById('change-password-section').classList.toggle('hidden', isAnon || !isAuthorized);
    document.getElementById('company-management-section').classList.toggle('hidden', !isAuthorized);
}

function setupEventListeners() {
    document.getElementById('calculate-sum-button').addEventListener('click', handleCalculateClick);
    document.getElementById('export-button').addEventListener('click', handleExport);
    document.getElementById('logout-button').addEventListener('click', () => signOut(auth));

    document.getElementById('date-filter-type').addEventListener('change', (e) => {
        const selection = e.target.value;
        document.getElementById('range-filter-container').classList.toggle('hidden', selection !== 'range');
        document.getElementById('invoice-date-filter-container').classList.toggle('hidden', selection !== 'invoiceDate');
        document.getElementById('due-date-filter-container').classList.toggle('hidden', selection !== 'dueDate');
    });

    setupInvoiceFormListeners();
    setupCompanyManagementListeners();
    setupModalListeners();
    setupChangePasswordListeners();
}

function setupChangePasswordListeners() {
    const changePassBtn = document.getElementById('change-password-btn');
    const changePassForm = document.getElementById('change-password-form');
    const feedbackEl = document.getElementById('change-password-feedback');

    changePassBtn.addEventListener('click', () => changePassForm.classList.toggle('hidden'));

    changePassForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new-password-input').value;
        feedbackEl.textContent = 'Cambiando...';
        try {
            await updatePassword(auth.currentUser, newPassword);
            feedbackEl.textContent = '¡Contraseña cambiada con éxito!';
            feedbackEl.style.color = 'green';
            changePassForm.reset();
            setTimeout(() => {
                feedbackEl.textContent = '';
                changePassForm.classList.add('hidden');
            }, 3000);
        } catch (error) {
            console.error("Error al cambiar contraseña:", error);
            feedbackEl.textContent = 'Error: ' + error.message;
            feedbackEl.style.color = 'red';
        }
    });
}

async function handleCalculateClick() {
    if (auth.currentUser?.isAnonymous) {
        if (!await showLoginModal()) return;
    }

    const calculateBtn = document.getElementById('calculate-sum-button');
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Calculando...';
    document.getElementById('export-button').classList.add('hidden');

    const filterType = document.getElementById('date-filter-type').value;
    const reportParams = {
        appId: firebaseConfig.appId,
        selectedCompanies: getCheckedValues('company-filter'),
        filterType: filterType,
    };

    if (filterType === 'range') {
        reportParams.startDate = document.getElementById('start-date-filter').value;
        reportParams.endDate = document.getElementById('end-date-filter').value;
        reportParams.rangeType = document.querySelector('input[name="range-type"]:checked').value;
    } else {
        reportParams.selectedDates = getCheckedValues(filterType === 'invoiceDate' ? 'invoice-date-filter' : 'due-date-filter');
    }

    try {
        const calculateReportCallable = httpsCallable(functions, 'calculateReport');
        const result = await calculateReportCallable(reportParams);
        const { totalSum, invoiceCount, invoices } = result.data;

        lastExportedInvoices = invoices;
        document.getElementById('total-sum-display').textContent = `${totalSum.toFixed(2)} €`;
        document.getElementById('sum-title').textContent = `Total para la selección (${invoiceCount} facturas):`;
        document.getElementById('report-feedback').textContent = '';
        if (invoiceCount > 0) document.getElementById('export-button').classList.remove('hidden');

    } catch (error) {
        console.error("Error al llamar a la función de reporte:", error);
        document.getElementById('report-feedback').textContent = error.message || "Ocurrió un error.";
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = 'Calcular total';
    }
}

function getCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
}

function setupFirestoreListeners() {
    const companiesQuery = query(collection(db, `artifacts/${firebaseConfig.appId}/public/data/companies`));
    onSnapshot(companiesQuery, (snapshot) => {
        allCompanies = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => a.name.localeCompare(b.name));
        const companyNames = allCompanies.map(c => c.name);

        renderCompanyList(allCompanies);
        updateCompanyDropdown(companyNames);
        generateChecklist('report-company-filter-container', 'company-filter', companyNames);
    });

    const invoicesQuery = query(collection(db, `artifacts/${firebaseConfig.appId}/public/data/invoices`));
    onSnapshot(invoicesQuery, (snapshot) => {
        allInvoices = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        allInvoices.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        const invoiceDates = [...new Set(allInvoices.map(inv => inv.invoiceDate).filter(Boolean))].sort();
        const dueDates = [...new Set(allInvoices.map(inv => inv.dueDate).filter(Boolean))].sort();

        renderRecentInvoices(allInvoices.slice(0, 10));
        generateChecklist('invoice-date-filter-container', 'invoice-date-filter', invoiceDates);
        generateChecklist('due-date-filter-container', 'due-date-filter', dueDates);
    });
}

function updateCompanyDropdown(companies) {
    const select = document.getElementById('company-select');
    select.innerHTML = '<option value="" disabled selected>Selecciona una empresa</option>';
    companies.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
}

function generateChecklist(containerId, name, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = items.length ? '' : '<p class="text-xs text-slate-500 italic">No hay datos para mostrar</p>';
    if (!items.length) return;

    const allId = `${name}-all`;
    container.innerHTML = `<div class="flex items-center"><input type="checkbox" id="${allId}" class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"><label for="${allId}" class="ml-3 block text-sm font-bold text-slate-800">Seleccionar todas</label></div>`;

    items.forEach(item => {
        const itemId = `${name}-${item.replace(/\s+/g, '-')}`;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'flex items-center';
        itemDiv.innerHTML = `<input type="checkbox" name="${name}" value="${item}" id="${itemId}" class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"><label for="${itemId}" class="ml-3 block text-sm text-slate-700">${item}</label>`;
        container.appendChild(itemDiv);
    });

    document.getElementById(allId).addEventListener('change', (e) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(cb => cb.checked = e.target.checked);
    });
}

function setupInvoiceFormListeners() {
    document.getElementById('invoice-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const msg = document.getElementById('form-message');
        msg.textContent = 'Guardando...';

        const company = form.elements['company-select'].value;
        const amount = parseFloat(form.elements['amount-input'].value);
        const invoiceDate = form.elements['invoice-date-input'].value;
        const dueDate = form.elements['due-date-input'].value;

        if (!company || !amount || !invoiceDate || !dueDate) {
            msg.textContent = 'Todos los campos son obligatorios.';
            return;
        }
        try {
            await addDoc(collection(db, `artifacts/${firebaseConfig.appId}/public/data/invoices`), { company, amount, invoiceDate, dueDate, userId: currentUserId, timestamp: serverTimestamp() });
            msg.textContent = '¡Factura registrada!';
            msg.style.color = 'green';
            form.reset();
        } catch (error) {
            msg.textContent = 'Error al guardar.';
            msg.style.color = 'red';
            console.error(error);
        }
        setTimeout(() => msg.textContent = '', 3000);
    });
}

function renderRecentInvoices(invoices) {
    const list = document.getElementById('recent-invoices-list');
    list.innerHTML = invoices.length === 0 ? '<p class="text-center text-slate-500">No hay movimientos recientes.</p>' : '';
    invoices.forEach(inv => {
        const date = inv.timestamp ? new Date(inv.timestamp.seconds * 1000).toLocaleDateString('es-ES') : 'N/A';
        const div = document.createElement('div');
        div.className = 'p-4 bg-white rounded-xl flex justify-between items-center card-shadow hover:shadow-lg transition-shadow';
        div.innerHTML = `
            <div>
                <span class="font-bold text-sky-700">${inv.company}</span>
                <span class="text-slate-500 text-sm ml-3">${date}</span>
            </div>
            <div class="font-semibold text-xl text-teal-600">${inv.amount.toFixed(2)} €</div>`;
        list.appendChild(div);
    });
}

function handleExport() {
    const headers = ['Empresa', 'Importe', 'Fecha Factura', 'Fecha Vencimiento'];
    const data = lastExportedInvoices.map(inv => ({
        Empresa: inv.company,
        Importe: inv.amount,
        'Fecha Factura': inv.invoiceDate,
        'Fecha Vencimiento': inv.dueDate
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `Reporte_Facturas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

let modalResolve = null;
function showLoginModal() {
    const modal = document.getElementById('generic-modal');
    modal.querySelector('#modal-title').textContent = 'Iniciar sesión para reportes';
    modal.querySelector('#modal-confirm-btn').textContent = 'Entrar';
    modal.querySelector('#modal-cancel-btn').textContent = 'Cancelar';

    modal.querySelector('#modal-content').innerHTML = `
        <form id="modal-login-form" class="space-y-4">
            <input type="text" id="modal-login-user" placeholder="Usuario" required class="input-style">
            <input type="password" id="modal-login-password" placeholder="Contraseña" required class="input-style">
            <p id="modal-auth-error" class="text-red-500 text-center h-4"></p>
            <a href="#" id="modal-forgot-password" class="text-sm text-sky-600 hover:underline block text-center">¿Olvidaste tu contraseña?</a>
        </form>`;
    modal.classList.remove('hidden');

    return new Promise(resolve => {
        modalResolve = resolve;
        document.getElementById('modal-login-form').onsubmit = async (e) => {
            e.preventDefault();
            const user = document.getElementById('modal-login-user').value.trim();
            const password = document.getElementById('modal-login-password').value;
            const errorDisplay = document.getElementById('modal-auth-error');
            const authorizedUsers = ["julian.s.2025", "andres.mera"];

            if (!authorizedUsers.includes(user)) {
                errorDisplay.textContent = 'Usuario no autorizado.';
                return;
            }

            const email = `${user}@invoicereports.com`;
            try {
                const credential = EmailAuthProvider.credential(email, password);
                await linkWithCredential(auth.currentUser, credential);
                modal.classList.add('hidden');
                resolve(true);
            } catch (error) {
                errorDisplay.textContent = 'Error: Credenciales incorrectas.';
                resolve(false);
            }
        };
        document.getElementById('modal-forgot-password').onclick = (e) => {
            e.preventDefault();
            document.getElementById('modal-auth-error').textContent = 'Función no disponible para estos usuarios.';
        };
    });
}

function setupModalListeners() {
    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        document.getElementById('generic-modal').classList.add('hidden');
        if (modalResolve) modalResolve(false);
    });
}

function setupCompanyManagementListeners() {
    const addCompanyForm = document.getElementById('add-company-form');
    const feedbackEl = document.getElementById('company-form-feedback');

    addCompanyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const companyNameInput = document.getElementById('new-company-name');
        const companyName = companyNameInput.value.trim();
        if (!companyName) return;

        feedbackEl.textContent = 'Agregando...';
        feedbackEl.style.color = 'inherit';

        try {
            const addCompanyCallable = httpsCallable(functions, 'addCompany');
            await addCompanyCallable({ companyName, appId: firebaseConfig.appId });
            feedbackEl.textContent = '¡Empresa agregada con éxito!';
            feedbackEl.style.color = 'green';
            companyNameInput.value = '';
        } catch (error) {
            console.error("Error al agregar empresa:", error);
            feedbackEl.textContent = `Error: ${error.message}`;
            feedbackEl.style.color = 'red';
        }
        setTimeout(() => feedbackEl.textContent = '', 3000);
    });

    const listContainer = document.getElementById('company-list');
    listContainer.addEventListener('click', async (e) => {
        const companyItem = e.target.closest('.company-item');
        if (!companyItem) return;

        const oldName = companyItem.dataset.companyName;

        if (e.target.classList.contains('edit-btn')) {
            handleEditCompany(oldName);
        } else if (e.target.classList.contains('delete-btn')) {
            handleDeleteCompany(oldName);
        }
    });
}

async function handleEditCompany(oldName) {
    const feedbackEl = document.getElementById('company-form-feedback');
    const newName = prompt(`Editar nombre de la empresa "${oldName}":`, oldName);

    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
        feedbackEl.textContent = 'Actualizando...';
        try {
            const editCompanyCallable = httpsCallable(functions, 'editCompany');
            await editCompanyCallable({ oldName, newName: newName.trim(), appId: firebaseConfig.appId });
            feedbackEl.textContent = '¡Empresa actualizada!';
            feedbackEl.style.color = 'green';
        } catch (error) {
            console.error("Error al editar empresa:", error);
            feedbackEl.textContent = `Error: ${error.message}`;
            feedbackEl.style.color = 'red';
        }
        setTimeout(() => feedbackEl.textContent = '', 3000);
    }
}

async function handleDeleteCompany(companyName) {
    const feedbackEl = document.getElementById('company-form-feedback');
    if (confirm(`¿Estás seguro de que quieres eliminar la empresa "${companyName}"? Esta acción no se puede deshacer.`)) {
        feedbackEl.textContent = 'Eliminando...';
        try {
            const deleteCompanyCallable = httpsCallable(functions, 'deleteCompany');
            await deleteCompanyCallable({ companyName, appId: firebaseConfig.appId });
            feedbackEl.textContent = '¡Empresa eliminada!';
            feedbackEl.style.color = 'green';
        } catch (error) {
            console.error("Error al eliminar empresa:", error);
            feedbackEl.textContent = `Error: ${error.message}`;
            feedbackEl.style.color = 'red';
        }
        setTimeout(() => feedbackEl.textContent = '', 3000);
    }
}

function renderCompanyList(companies) {
    const listContainer = document.getElementById('company-list');
    listContainer.innerHTML = companies.length ? '' : '<p class="text-xs text-slate-500 italic">No hay empresas registradas.</p>';

    companies.forEach(company => {
        const div = document.createElement('div');
        div.className = 'company-item flex justify-between items-center p-3 bg-white rounded-lg border border-slate-200';
        div.dataset.companyName = company.name;
        div.innerHTML = `
            <span class="company-name font-medium text-slate-800">${company.name}</span>
            <div>
                <button class="edit-btn text-sm text-sky-600 hover:text-sky-800 font-semibold mr-3">Editar</button>
                <button class="delete-btn text-sm text-red-600 hover:text-red-800 font-semibold">Eliminar</button>
            </div>
        `;
        listContainer.appendChild(div);
    });
}