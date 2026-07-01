// ─── Card Weekly Recap (Homepage) — banner pulsante ──────────────────────────
import React from 'react'
import styles from './WeeklyRecapCard.module.css'

export default function WeeklyRecapCard({ onClick }) {

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label="Weekly recap"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <p className={styles.title}>Weekly recap</p>
    </article>
  )
}
