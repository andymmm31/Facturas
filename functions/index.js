const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const AUTHORIZED_EMAILS = [
    "julian.s.2025@invoicereports.com",
    "andres.mera@invoicereports.com"
];

function checkAuth(context) {
    if (!context.auth || !context.auth.token.email) {
        throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión para realizar esta acción.");
    }
    if (!AUTHORIZED_EMAILS.includes(context.auth.token.email)) {
        throw new functions.https.HttpsError("permission-denied", "No tienes permiso para realizar esta acción.");
    }
}

exports.addCompany = functions.https.onCall(async (data, context) => {
    checkAuth(context);
    const { companyName, appId } = data;
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "El nombre de la empresa es inválido.");
    }

    const companiesRef = db.collection(`artifacts/${appId}/public/data/companies`);
    const snapshot = await companiesRef.where("name", "==", companyName.trim()).get();
    if (!snapshot.empty) {
        throw new functions.https.HttpsError("already-exists", "La empresa ya existe.");
    }

    await companiesRef.add({ name: companyName.trim() });
    return { message: "Empresa agregada con éxito." };
});

exports.editCompany = functions.https.onCall(async (data, context) => {
    checkAuth(context);
    const { oldName, newName, appId } = data;
    if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string' || oldName.trim().length === 0 || newName.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Los nombres de empresa son inválidos.");
    }

    const companiesRef = db.collection(`artifacts/${appId}/public/data/companies`);

    const newNameSnapshot = await companiesRef.where("name", "==", newName.trim()).get();
    if (!newNameSnapshot.empty) {
        throw new functions.https.HttpsError("already-exists", `Ya existe una empresa con el nombre "${newName.trim()}".`);
    }

    const oldNameSnapshot = await companiesRef.where("name", "==", oldName).get();
    if (oldNameSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", `No se encontró la empresa "${oldName}".`);
    }

    const companyDoc = oldNameSnapshot.docs[0];
    await companyDoc.ref.update({ name: newName.trim() });

    const invoicesRef = db.collection(`artifacts/${appId}/public/data/invoices`);
    const invoicesSnapshot = await invoicesRef.where("company", "==", oldName).get();

    if (!invoicesSnapshot.empty) {
        const batch = db.batch();
        invoicesSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { company: newName.trim() });
        });
        await batch.commit();
    }

    return { message: "Empresa actualizada y facturas migradas con éxito." };
});

exports.deleteCompany = functions.https.onCall(async (data, context) => {
    checkAuth(context);
    const { companyName, appId } = data;
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "El nombre de la empresa es inválido.");
    }

    const invoicesRef = db.collection(`artifacts/${appId}/public/data/invoices`);
    const invoiceSnapshot = await invoicesRef.where("company", "==", companyName).limit(1).get();
    if (!invoiceSnapshot.empty) {
        throw new functions.https.HttpsError("failed-precondition", "No se puede eliminar la empresa porque tiene facturas asociadas.");
    }

    const companiesRef = db.collection(`artifacts/${appId}/public/data/companies`);
    const companySnapshot = await companiesRef.where("name", "==", companyName).get();
    if (companySnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "La empresa no fue encontrada.");
    }

    const batch = db.batch();
    companySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    return { message: "Empresa eliminada con éxito." };
});


exports.calculateReport = functions.https.onCall(async (data, context) => {
    checkAuth(context);

    try {
        const { appId, selectedCompanies, filterType, selectedInvoiceDates, selectedDueDates, startDate, endDate, rangeType } = data;
        let query = db.collection(`artifacts/${appId}/public/data/invoices`);

        if (selectedCompanies && selectedCompanies.length > 0) {
            query = query.where("company", "in", selectedCompanies);
        }

        const snapshot = await query.get();
        let filteredInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Aplicar filtros de fecha en memoria
        if (filterType === 'invoiceDate') {
            if (selectedInvoiceDates && selectedInvoiceDates.length > 0) {
                filteredInvoices = filteredInvoices.filter(inv => selectedInvoiceDates.includes(inv.invoiceDate));
            }
        } else if (filterType === 'dueDate') {
            if (selectedDueDates && selectedDueDates.length > 0) {
                filteredInvoices = filteredInvoices.filter(inv => selectedDueDates.includes(inv.dueDate));
            }
        } else if (filterType === 'range' && (startDate || endDate)) {
            filteredInvoices = filteredInvoices.filter(inv => {
                const checkInvoiceDate = !inv.invoiceDate || ((!startDate || inv.invoiceDate >= startDate) && (!endDate || inv.invoiceDate <= endDate));
                const checkDueDate = !inv.dueDate || ((!startDate || inv.dueDate >= startDate) && (!endDate || inv.dueDate <= endDate));

                if (rangeType === 'invoiceDate') return checkInvoiceDate;
                if (rangeType === 'dueDate') return checkDueDate;
                if (rangeType === 'both') return checkInvoiceDate || checkDueDate;
                return true;
            });
        }

        const totalSum = filteredInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

        return {
            totalSum: totalSum,
            invoiceCount: filteredInvoices.length,
            invoices: filteredInvoices // Devolver los datos para la exportación
        };

    } catch (error) {
        console.error("Error al calcular el reporte:", error);
        throw new functions.https.HttpsError("internal", "Ocurrió un error interno al procesar el reporte.");
    }
});