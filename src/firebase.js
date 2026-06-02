// ─── Firebase configuration & initialization ──────────────────────────────
// TODO: collegare Firebase — aggiungere autenticazione utente se necessario
import { initializeApp } from 'firebase/app'
import { getFirestore }  from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            'AIzaSyAmz7WZ6GD3eNQklNXK8ff8i4haD91lvgQ',
  authDomain:        'journal-4782d.firebaseapp.com',
  projectId:         'journal-4782d',
  storageBucket:     'journal-4782d.firebasestorage.app',
  messagingSenderId: '715599929921',
  appId:             '1:715599929921:web:130bbd72eed67beb3e1cc0',
}

const app = initializeApp(firebaseConfig)

// Istanza Firestore — importa `db` nei componenti che ne hanno bisogno
export const db = getFirestore(app)
