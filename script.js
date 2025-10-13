import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, EmailAuthProvider, linkWithCredential, sendPasswordResetEmail, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, addDoc, serverTimestamp, getDocs, where, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- Variables Globales ---
let app, auth, db, functions;
let currentUserId = null;
let allInvoices = [];
let lastExportedInvoices = [];

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
        <div><label for="company-select" class="block text-sm font-medium text-gray-700">Empresa:</label><select id="company-select" required class="w-full input-style"></select></div>
        <div id="new-company-input-container" class="hidden"><label for="new-company-input" class="block text-sm font-medium text-gray-700">Nombre Nueva Empresa:</label><input type="text" id="new-company-input" class="w-full input-style" placeholder="Nombre completo"></div>
        <div><label for="amount-input" class="block text-sm font-medium text-gray-700">Importe (€):</label><input type="number" step="0.01" id="amount-input" required class="w-full input-style" placeholder="100.00"></div>
        <div><label for="invoice-date-input" class="block text-sm font-medium text-gray-700">Fecha de Factura:</label><input type="date" id="invoice-date-input" required class="w-full input-style"></div>
        <div><label for="due-date-input" class="block text-sm font-medium text-gray-700">Fecha de Vencimiento:</label><input type="date" id="due-date-input" required class="w-full input-style"></div>
        <button type="submit" class="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">Guardar Factura</button>
        <p id="form-message" class="text-center"></p>`;

    // El contenido de report-section ahora está definido estáticamente en index.html
    document.getElementById('report-results').innerHTML = `
        <p id="sum-title" class="text-xl font-medium text-gray-700 mb-2">Resultados del Reporte</p>
        <div id="total-sum-display" class="text-5xl font-extrabold text-green-700">0.00 €</div>
        <p id="report-feedback" class="text-red-500 mt-2 font-medium"></p>
        <button id="export-button" class="hidden mt-4 py-2 px-4 bg-blue-500 text-white rounded-lg">Exportar a Excel</button>`;
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
    document.getElementById('user-id-display').textContent = isAnon ? `ID de sesión: ${user.uid.substring(0, 8)}...` : `Usuario: ${user.email}`;
    document.getElementById('logout-button').classList.toggle('hidden', isAnon);
    document.getElementById('change-password-section').classList.toggle('hidden', isAnon);
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

    setupAdminControlsListeners();
    setupModalListeners();
    setupChangePasswordListeners();
}

function setupChangePasswordListeners() {
    const changePassBtn = document.getElementById('change-password-btn');
    const changePassForm = document.getElementById('change-password-form');
    const feedbackEl = document.getElementById('change-password-feedback');

    changePassBtn.addEventListener('click', () => {
        changePassForm.classList.toggle('hidden');
    });

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
    let reportParams = {
        selectedCompanies: getCheckedValues('company-filter'),
        filterType: filterType,
        selectedInvoiceDates: [],
        selectedDueDates: [],
        startDate: null,
        endDate: null,
        rangeType: null
    };

    if (filterType === 'range') {
        reportParams.startDate = document.getElementById('start-date-filter').value;
        reportParams.endDate = document.getElementById('end-date-filter').value;
        reportParams.rangeType = document.querySelector('input[name="range-type"]:checked').value;
    } else if (filterType === 'invoiceDate') {
        reportParams.selectedInvoiceDates = getCheckedValues('invoice-date-filter');
    } else if (filterType === 'dueDate') {
        reportParams.selectedDueDates = getCheckedValues('due-date-filter');
    }

    try {
        const calculateReportCallable = httpsCallable(functions, 'calculateReport');
        const result = await calculateReportCallable(reportParams);
        const { totalSum, invoiceCount, invoices } = result.data;

        lastExportedInvoices = invoices; // Guardar para exportar
        document.getElementById('total-sum-display').textContent = `${totalSum.toFixed(2)} €`;
        document.getElementById('sum-title').textContent = `Total para la selección (${invoiceCount} facturas):`;
        document.getElementById('report-feedback').textContent = '';
        if (invoiceCount > 0) document.getElementById('export-button').classList.remove('hidden');

    } catch (error) {
        console.error("Error al llamar a la función de reporte:", error);
        document.getElementById('report-feedback').textContent = error.message || "Ocurrió un error.";
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = 'Calcular Total';
    }
}

function getCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
}

function setupFirestoreListeners() {
    const invoicesQuery = query(collection(db, `artifacts/${firebaseConfig.appId}/public/data/invoices`));
    onSnapshot(invoicesQuery, (snapshot) => {
        allInvoices = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        allInvoices.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        const companies = [...new Set(allInvoices.map(inv => inv.company).filter(Boolean))].sort();
        const invoiceDates = [...new Set(allInvoices.map(inv => inv.invoiceDate).filter(Boolean))].sort();
        const dueDates = [...new Set(allInvoices.map(inv => inv.dueDate).filter(Boolean))].sort();

        renderRecentInvoices(allInvoices.slice(0, 10));
        updateCompanyDropdown(companies);
        generateChecklist('report-company-filter-container', 'company-filter', companies);
        generateChecklist('invoice-date-filter-container', 'invoice-date-filter', invoiceDates);
        generateChecklist('due-date-filter-container', 'due-date-filter', dueDates);
    });
}

function updateCompanyDropdown(companies) {
    const select = document.getElementById('company-select');
    select.innerHTML = '<option value="" disabled selected>Selecciona una empresa</option>';
    companies.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
    select.innerHTML += '<option value="__NEW_COMPANY__">--- Agregar Nueva Empresa ---</option>';
}

function generateChecklist(containerId, name, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = items.length ? '' : '<p class="text-xs text-gray-500 italic">No hay datos</p>';
    if (!items.length) return;

    const allId = `${name}-all`;
    container.innerHTML += `<div><input type="checkbox" id="${allId}"><label for="${allId}" class="ml-2 font-bold">Seleccionar Todas</label></div>`;
    items.forEach(item => {
        const itemId = `${name}-${item.replace(/\s+/g, '-')}`;
        container.innerHTML += `<div><input type="checkbox" name="${name}" value="${item}" id="${itemId}"><label for="${itemId}" class="ml-2">${item}</label></div>`;
    });
    document.getElementById(allId).addEventListener('change', (e) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(cb => cb.checked = e.target.checked);
    });
}

function setupAdminControlsListeners() {
    document.getElementById('company-select').addEventListener('change', (e) => {
        document.getElementById('new-company-input-container').classList.toggle('hidden', e.target.value !== '__NEW_COMPANY__');
    });
    document.getElementById('invoice-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const msg = document.getElementById('form-message');
        msg.textContent = 'Guardando...';
        const company = form.elements['company-select'].value === '__NEW_COMPANY__' ? form.elements['new-company-input'].value.trim() : form.elements['company-select'].value;
        const amount = parseFloat(form.elements['amount-input'].value);
        const invoiceDate = form.elements['invoice-date-input'].value;
        const dueDate = form.elements['due-date-input'].value;
        if (!company || !amount || !invoiceDate || !dueDate) { msg.textContent = 'Todos los campos son obligatorios.'; return; }
        try {
            await addDoc(collection(db, `artifacts/${firebaseConfig.appId}/public/data/invoices`), { company, amount, invoiceDate, dueDate, userId: currentUserId, timestamp: serverTimestamp() });
            msg.textContent = '¡Factura registrada!';
            form.reset();
        } catch (error) { msg.textContent = 'Error al guardar.'; }
    });
}

function renderRecentInvoices(invoices) {
    const list = document.getElementById('recent-invoices-list');
    list.innerHTML = invoices.length === 0 ? '<p>No hay facturas.</p>' : '';
    invoices.forEach(inv => {
        const date = inv.timestamp ? new Date(inv.timestamp.seconds * 1000).toLocaleDateString('es-ES') : 'N/A';
        list.innerHTML += `<div class="p-3 bg-white rounded-lg mb-2 flex justify-between items-center card-shadow"><div><span class="font-bold text-indigo-700">${inv.company}</span> | <span class="text-gray-600">${date}</span></div><div class="font-semibold text-lg text-green-600">${inv.amount.toFixed(2)} €</div></div>`;
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
    modal.querySelector('#modal-title').textContent = 'Iniciar Sesión para Reportes';
    modal.querySelector('#modal-confirm-btn').textContent = 'Entrar';
    modal.querySelector('#modal-cancel-btn').textContent = 'Cancelar';

    modal.querySelector('#modal-content').innerHTML = `
        <form id="modal-login-form" class="space-y-4">
            <input type="text" id="modal-login-user" placeholder="Usuario" required class="w-full input-style">
            <input type="password" id="modal-login-password" placeholder="Contraseña" required class="w-full input-style">
            <p id="modal-auth-error" class="text-red-500 text-center"></p>
            <a href="#" id="modal-forgot-password" class="text-sm text-indigo-600 hover:underline">¿Olvidaste tu contraseña?</a>
        </form>`;
    modal.classList.remove('hidden');

    return new Promise(resolve => {
        modalResolve = resolve;
        modal.querySelector('#modal-login-form').onsubmit = async (e) => {
            e.preventDefault();
            const user = modal.querySelector('#modal-login-user').value.trim();
            // Construir un correo electrónico ficticio para la autenticación de Firebase
            const email = `${user}@invoicereports.com`;
            const password = modal.querySelector('#modal-login-password').value;
            const errorDisplay = modal.querySelector('#modal-auth-error');
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
        modal.querySelector('#modal-forgot-password').onclick = (e) => {
            e.preventDefault();
            const errorDisplay = modal.querySelector('#modal-auth-error');
            errorDisplay.textContent = 'Función no disponible para estos usuarios.';
        };
    });
}

function setupModalListeners() {
    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        document.getElementById('generic-modal').classList.add('hidden');
        if(modalResolve) modalResolve(false);
    });

    // El botón de confirmar es manejado por el onsubmit del formulario dentro de showLoginModal
    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
         // No hacer nada aquí, la lógica está en el onsubmit
    });
}