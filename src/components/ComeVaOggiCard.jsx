// ─── Card "Come va oggi?" ─────────────────────────────────────────────────
// Mostra i tre widget metriche giornaliere.
// Le percentuali sono dinamiche: vengono calcolate in DetailScreen
// e propagate qui tramite la prop `widgetData`.
// TODO: collegare Firebase — caricare dati reali per ogni metrica
import React from 'react'
import styles from './ComeVaOggiCard.module.css'

/* ── Icona Smartphone (Social) ── */
function IconSocial() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
      stroke="var(--icon-stroke)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="14" y="5" width="20" height="36" rx="4" ry="4" />
      <rect x="17" y="10" width="14" height="22" rx="1.5" ry="1.5" />
      <line x1="21" y1="7.5" x2="27" y2="7.5" />
      <circle cx="24" cy="38" r="1.8" />
      <line x1="20.5" y1="17.5" x2="27.5" y2="24.5" />
      <line x1="27.5" y1="17.5" x2="20.5" y2="24.5" />
    </svg>
  )
}

/* ── Icona Manubrio (Workout) ── */
function IconWorkout() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
      stroke="var(--icon-stroke)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="14" y1="24" x2="34" y2="24" />
      <rect x="4"  y="18" width="7" height="12" rx="2" ry="2" />
      <rect x="11" y="20" width="3" height="8"  rx="1" ry="1" />
      <rect x="34" y="20" width="3" height="8"  rx="1" ry="1" />
      <rect x="37" y="18" width="7" height="12" rx="2" ry="2" />
    </svg>
  )
}

/* ── Icona Bottiglia (Acqua) ── */
function IconWater() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
      stroke="var(--icon-stroke)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="19" y="4" width="10" height="6" rx="2" ry="2" />
      <path d="M19 10 L19 15 L14 18" />
      <path d="M29 10 L29 15 L34 18" />
      <path d="M14 18 L14 40 Q14 44 18 44 L30 44 Q34 44 34 40 L34 18 Z" />
      <line x1="14.5" y1="30" x2="33.5" y2="30" strokeDasharray="2 1.5" />
    </svg>
  )
}

/* ── Widget singolo ── */
function Widget({ icon, percent }) {
  return (
    <div className={styles.widget}>
      <span className={styles.widgetIcon}>{icon}</span>
      <span className={styles.widgetPct}>{percent}%</span>
    </div>
  )
}

/* ── Card principale ─────────────────────────────────────────────────────── */
// widgetData: { social: number, workout: number, water: number }
// onInfoClick: apre DetailScreen
export default function ComeVaOggiCard({ onInfoClick, widgetData = {} }) {
  const { social = 85, workout = 45, water = 75 } = widgetData

  return (
    <section className={styles.card} aria-label="Come va oggi">
      {/* Pulsante "!" → apre DetailScreen */}
      <button className={styles.alertBtn} aria-label="Apri dettaglio" onClick={onInfoClick}>
        !
      </button>

      <h2 className={styles.cardTitle}>Come va oggi?</h2>

      {/* TODO: collegare Firebase — sostituire con riepilogo dinamico del giorno */}
      <p className={styles.summaryText}>Oggi hai in programma di…</p>

      <div className={styles.widgetsRow}>
        {/* Percentuali calcolate in real-time da DetailScreen */}
        <Widget icon={<IconSocial />}  percent={social}  />
        <Widget icon={<IconWorkout />} percent={workout} />
        <Widget icon={<IconWater />}   percent={water}   />
      </div>
    </section>
  )
}
