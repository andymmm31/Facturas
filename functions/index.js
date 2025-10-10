const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// La lista de correos autorizados se debe configurar como una variable de entorno en Firebase:
// firebase functions:config:set auth.emails="julian.s.2025.10@example.com,andres.mera@example.com"
const AUTHORIZED_EMAILS = (functions.config().auth?.emails || "").split(',');

exports.calculateReport = functions.https.onCall(async (data, context) => {
    if (!AUTHORIZED_EMAILS || AUTHORIZED_EMAILS.length === 0 || AUTHORIZED_EMAILS[0] === '') {
        throw new functions.https.HttpsError(
            "internal",
            "La configuración de correos autorizados no está definida en el servidor."
        );
    }

    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para realizar esta acción."
        );
    }

    const callerEmail = context.auth.token.email;
    if (!AUTHORIZED_EMAILS.includes(callerEmail)) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "No tienes permiso para ejecutar este reporte."
        );
    }

    try {
        const { appId, selectedCompany, mainDateFilter, startDate, endDate } = data;
        const invoicesRef = db.collection(`artifacts/${appId}/public/data/invoices`);
        let query = invoicesRef;

        if (selectedCompany) {
            query = query.where("company", "==", selectedCompany);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            return { totalSum: 0, invoiceCount: 0 };
        }

        let filteredInvoices = snapshot.docs.map(doc => doc.data());

        if (mainDateFilter === 'invoiceDateRange' || mainDateFilter === 'dueDateRange') {
            const dateField = mainDateFilter === 'invoiceDateRange' ? 'invoiceDate' : 'dueDate';
            if (startDate) {
                filteredInvoices = filteredInvoices.filter(inv => inv[dateField] && inv[dateField] >= startDate);
            }
            if (endDate) {
                filteredInvoices = filteredInvoices.filter(inv => inv[dateField] && inv[dateField] <= endDate);
            }
        }

        const totalSum = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);

        return {
            totalSum: totalSum,
            invoiceCount: filteredInvoices.length,
        };

    } catch (error) {
        console.error("Error al calcular el reporte:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Ocurrió un error interno al procesar el reporte."
        );
    }
});