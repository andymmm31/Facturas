const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inicializar la app de Admin para poder acceder a Firestore
admin.initializeApp();
const db = admin.firestore();

// Esta es una "Callable Function". Es la forma recomendada y segura
// de llamar a funciones de backend desde tu app web.
exports.calculateReport = functions.https.onCall(async (data, context) => {
    // >>> IMPORTANTE: Configuración de Seguridad <<<
    // La contraseña real se debe configurar como una variable de entorno secreta en Firebase.
    // gcloud secrets versions access latest --secret=ADMIN_PASSWORD
    // Por ahora, usamos un valor por defecto para el desarrollo.
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

    // 1. Validar la contraseña que nos envía el cliente
    if (data.password !== ADMIN_PASSWORD) {
        // Si la contraseña es incorrecta, lanzamos un error.
        // El cliente recibirá este mensaje.
        throw new functions.https.HttpsError(
            "unauthenticated",
            "La contraseña proporcionada es incorrecta."
        );
    }

    // 2. Si la contraseña es correcta, procedemos a consultar la base de datos
    try {
        const { appId, selectedCompany, mainDateFilter, startDate, endDate } = data;

        // Construimos la referencia a la colección de facturas
        const invoicesRef = db.collection(`artifacts/${appId}/public/data/invoices`);
        let query = invoicesRef;

        // 3. Aplicamos los filtros a la consulta
        if (selectedCompany) {
            query = query.where("company", "==", selectedCompany);
        }

        // Obtenemos todos los documentos que coinciden con el filtro de empresa
        const snapshot = await query.get();

        if (snapshot.empty) {
            return { totalSum: 0, invoiceCount: 0 };
        }

        // 4. Filtramos por fecha (esto se hace en memoria después de la consulta inicial)
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

        // 5. Calculamos la suma total
        const totalSum = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);

        // 6. Devolvemos el resultado al cliente
        return {
            totalSum: totalSum,
            invoiceCount: filteredInvoices.length,
        };

    } catch (error) {
        console.error("Error al calcular el reporte:", error);
        // Si algo sale mal en el servidor, lanzamos un error genérico.
        throw new functions.https.HttpsError(
            "internal",
            "Ocurrió un error interno al procesar el reporte."
        );
    }
});