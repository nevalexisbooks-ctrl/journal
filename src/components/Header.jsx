// ─── Header ───────────────────────────────────────────────────────────────
// Fascia verde salvia con "Buongiorno", data corrente e icona impostazioni
import React, { useEffect, useState } from 'react'
import styles from './Header.module.css'

/* Formatta la data corrente in italiano: "Lunedì 2 Giugno 2026" */
function getDataItaliana() {
  const oggi = new Date()
  const str = oggi.toLocaleDateString('it-IT', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export default function Header({ onSettingsClick }) {
  const [dataOggi, setDataOggi] = useState('')

  useEffect(() => {
    setDataOggi(getDataItaliana())
  }, [])

  return (
    <header className={styles.header}>
      {/* Icona ingranaggio SVG lineart — TODO: aprire schermata impostazioni */}
      <button
        className={styles.gearBtn}
        aria-label="Impostazioni"
        onClick={onSettingsClick}
      >
        <svg
          width="24" height="24" viewBox="0 0 24 24"
          fill="none" stroke="#FFFFFF" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="
            M12 2 L13.5 5.3 L16.2 4.2 L16.8 7.2 L19.8 7.8
            L18.7 10.5 L22 12 L18.7 13.5 L19.8 16.2 L16.8 16.8
            L16.2 19.8 L13.5 18.7 L12 22 L10.5 18.7 L7.8 19.8
            L7.2 16.8 L4.2 16.2 L5.3 13.5 L2 12 L5.3 10.5
            L4.2 7.8 L7.2 7.2 L7.8 4.2 L10.5 5.3 Z
          " />
        </svg>
      </button>

      <p className={styles.greeting}>Buongiorno</p>
      <p className={styles.date}>{dataOggi || 'caricamento…'}</p>
    </header>
  )
}
