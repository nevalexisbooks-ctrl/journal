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

      {/* Ramoscello decorativo scandinavo */}
      <svg
        width="120" height="24" viewBox="0 0 120 24"
        fill="none" stroke="#ffffff" strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
        className={styles.branch}
      >
        {/* Stelo centrale */}
        <line x1="10" y1="12" x2="110" y2="12" />

        {/* Foglie lato sinistro — crescono verso il centro */}
        <ellipse cx="28" cy="7"  rx="6" ry="3" transform="rotate(-35 28 7)"  />
        <ellipse cx="44" cy="5"  rx="6" ry="3" transform="rotate(-20 44 5)"  />
        <ellipse cx="28" cy="17" rx="6" ry="3" transform="rotate(35 28 17)"  />
        <ellipse cx="44" cy="19" rx="6" ry="3" transform="rotate(20 44 19)"  />

        {/* Foglia centrale piccola */}
        <ellipse cx="60" cy="5"  rx="5" ry="2.5" transform="rotate(-10 60 5)"  />
        <ellipse cx="60" cy="19" rx="5" ry="2.5" transform="rotate(10 60 19)"  />

        {/* Foglie lato destro — simmetriche */}
        <ellipse cx="76" cy="5"  rx="6" ry="3" transform="rotate(20 76 5)"   />
        <ellipse cx="92" cy="7"  rx="6" ry="3" transform="rotate(35 92 7)"   />
        <ellipse cx="76" cy="19" rx="6" ry="3" transform="rotate(-20 76 19)" />
        <ellipse cx="92" cy="17" rx="6" ry="3" transform="rotate(-35 92 17)" />
      </svg>

      <p className={styles.date}>{dataOggi || 'caricamento…'}</p>
    </header>
  )
}
