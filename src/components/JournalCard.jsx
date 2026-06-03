// ─── Card Journal / Chat ──────────────────────────────────────────────────
// Box sabbia cliccabile che naviga alla schermata Journal + AI
// TODO: navigare a schermata Journal + Chat AI quando creata
import React from 'react'
import styles from './JournalCard.module.css'

export default function JournalCard({ onClick }) {
  return (
    <section
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label="Apri Journal"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <p className={styles.title}>Journal</p>
      <p className={styles.sub}>Il tuo Assistente</p>
    </section>
  )
}
