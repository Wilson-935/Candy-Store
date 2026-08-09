const firebaseConfig = {
  apiKey: "AIzaSyA-2D8gZKUsaoniqnGmnowqU3GaWUMi5Ek",
  authDomain: "candy-store-247.firebaseapp.com",
  databaseURL: "https://candy-store-247-default-rtdb.firebaseio.com",
  projectId: "candy-store-247",
  storageBucket: "candy-store-247.firebasestorage.app",
  messagingSenderId: "713005280377",
  appId: "1:713005280377:web:a7d878fe451486dfa5f8a8"
};

// Carga progresiva de la lógica V2 sin modificar la interfaz existente.
queueMicrotask(() => {
  Promise.all([
    import('./v2-engine.js'),
    import('./v2-finance-tools.js')
  ]).catch(err => console.error('No se pudo cargar Candy Store V2:', err));
});

export default firebaseConfig;