const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// El correo autorizado se debe configurar como una variable de entorno en Firebase:
// firebase functions:config:set auth.email="correo.real@ejemplo.com"
const AUTHORIZED_EMAIL = functions.config().auth?.email;

exports.calculateReport = functions.https.onCall(async (data, context) => {
    if (!AUTHORIZED_EMAIL) {
        throw new functions.https.HttpsError(
            "internal",
            "La configuración del correo autorizado no está definida en el servidor."
        );
    }

    // 1. Verificar si el usuario está autenticado.
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para realizar esta acción."
        );
    }

    // 2. Verificar si el usuario autenticado es el autorizado.
    // Obtenemos el UID del usuario que llama a la función.
    const callerUid = context.auth.uid;

    try {
        // Obtenemos el registro de usuario completo a partir de su correo.
        const authorizedUserRecord = await auth.getUserByEmail(AUTHORIZED_EMAIL);

        // Comparamos el UID del que llama con el UID del usuario autorizado.
        if (callerUid !== authorizedUserRecord.uid) {
            throw new functions.https.HttpsError(
                "permission-denied",
                "No tienes permiso para ejecutar este reporte."
            );
        }
    } catch (error) {
        console.error("Error al verificar el usuario autorizado:", error);
        throw new functions.https.HttpsError(
            "internal",
            "No se pudo verificar la autorización del usuario."
        );
    }

    // 3. Si la autorización es correcta, procedemos con la lógica del reporte.
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