// ====================================================================
// >>> ARCHIVO DE CONFIGURACIÓN DE FIREBASE <<<
// ====================================================================
//
// INSTRUCCIONES:
// 1. Copia este archivo y renómbralo a "config.js".
// 2. Reemplaza los valores de marcador de posición con tus propias claves de Firebase.
//
// ¡IMPORTANTE! El archivo "config.js" real NUNCA debe ser compartido
// o subido a un repositorio público, ya que contiene tus claves secretas.
// El archivo .gitignore ya está configurado para ignorarlo.
//
// ====================================================================

const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_AUTH_DOMAIN_AQUI",
  projectId: "TU_PROJECT_ID_AQUI",
  storageBucket: "TU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "TU_MESSAGING_SENDER_ID_AQUI",
  appId: "TU_APP_ID_AQUI",
  measurementId: "TU_MEASUREMENT_ID_AQUI" // Opcional
};

// Correo electrónico del único usuario autorizado para registrarse y usar la app.
const AUTHORIZED_EMAIL = "correo.autorizado@ejemplo.com";