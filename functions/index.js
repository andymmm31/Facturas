const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// La lista de correos autorizados se debe configurar como una variable de entorno en Firebase:
// firebase functions:config:set auth.emails="julian.s.2025.10@example.com,andres.mera@example.com"
const AUTHORIZED_EMAILS = (functions.config().auth?.emails || "").split(',');

exports.calculateReport = functions.https.onCall(async (data, context) => {
    if (!AUTHORIZED_EMAILS || AUTHORIZED_EMAILS.length === 0 || AUTHORIZED_EMAILS[0] === '') {
        throw new functions.https.HttpsError("internal", "La configuración de correos autorizados no está definida.");
    }

    if (!context.auth || !context.auth.token.email) {
        throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión para realizar esta acción.");
    }

    if (!AUTHORIZED_EMAILS.includes(context.auth.token.email)) {
        throw new functions.https.HttpsError("permission-denied", "No tienes permiso para ejecutar este reporte.");
    }

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