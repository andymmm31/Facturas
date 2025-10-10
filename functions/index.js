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
        const { appId, selectedCompanies, selectedInvoiceDates, selectedDueDates, mainDateFilter, startDate, endDate } = data;
        let query = db.collection(`artifacts/${appId}/public/data/invoices`);

        if (selectedCompanies && selectedCompanies.length > 0) {
            query = query.where("company", "in", selectedCompanies);
        }

        const snapshot = await query.get();
        let filteredInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filtros en memoria
        if (selectedInvoiceDates && selectedInvoiceDates.length > 0) {
            filteredInvoices = filteredInvoices.filter(inv => selectedInvoiceDates.includes(inv.invoiceDate));
        }
        if (selectedDueDates && selectedDueDates.length > 0) {
            filteredInvoices = filteredInvoices.filter(inv => selectedDueDates.includes(inv.dueDate));
        }
        if (mainDateFilter === 'invoiceDateRange' || mainDateFilter === 'dueDateRange') {
            const dateField = mainDateFilter === 'invoiceDateRange' ? 'invoiceDate' : 'dueDate';
            if (startDate) filteredInvoices = filteredInvoices.filter(inv => inv[dateField] && inv[dateField] >= startDate);
            if (endDate) filteredInvoices = filteredInvoices.filter(inv => inv[dateField] && inv[dateField] <= endDate);
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