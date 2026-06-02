// ─── Card "Come va oggi?" ──────────────────────────────────────────────────
// Si abbona in tempo reale al documento di OGGI su Firestore (onSnapshot).
// Calcola widget e testo riepilogo direttamente dai dati salvati.
import React, { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot }             from 'firebase/firestore'
import { db }                           from '../firebase.js'
import { calcSocialPct, calcWorkoutPct, calcWaterPct } from '../utils/calcWidgets.js'
import styles from './ComeVaOggiCard.module.css'

// ── Frasi motivazionali (quando non ci sono task da fare) ─────────────────
const FRASI_MOTIVAZIONALI = [
  'Ogni giorno è un nuovo inizio. Rendilo speciale. 🌱',
  'Oggi puoi fare qualcosa che il tuo futuro io ringrazierà. ✨',
  'Piccoli passi ogni giorno costruiscono grandi risultati. 🪴',
  'Sei più forte di quanto pensi. Buona giornata! 💪',
  'La costanza batte il talento. Vai avanti! 🔥',
  'Oggi è un buon giorno per essere felice. ☀️',
  'Prenditi cura di te come faresti con qualcuno che ami. 🌸',
  'Un giorno alla volta. Ce la fai. 🍃',
  'Il progresso, non la perfezione. 🎯',
  'Respira. Sorridi. Ricomincia. 🌿',
  'Anche le giornate tranquille contano. 🌙',
  'Sei esattamente dove devi essere. 💫',
]

/** Formatta l'elenco task con grammatica italiana */
function buildTaskSummary(attive) {
  if (attive.length === 0)  return null
  if (attive.length === 1)  return `Oggi hai in programma di ${attive[0].text}`
  if (attive.length === 2)  return `Oggi hai in programma di ${attive[0].text} e ${attive[1].text}`
  const tutteTranneLultima = attive.slice(0, -1).map(t => t.text).join(', ')
  return `Oggi hai in programma di ${tutteTranneLultima} e ${attive[attive.length - 1].text}`
}

// ── Chiave documento di oggi ───────────────────────────────────────────────
function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

// ── Icone SVG lineart ─────────────────────────────────────────────────────
function IconSocial() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none"
      stroke="var(--icon-stroke)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="14" y="5"  width="20" height="36" rx="4" ry="4" />
      <rect x="17" y="10" width="14" height="22" rx="1.5" ry="1.5" />
      <line x1="21" y1="7.5"  x2="27" y2="7.5" />
      <circle cx="24" cy="38" r="1.8" />
      <line x1="20.5" y1="17.5" x2="27.5" y2="24.5" />
      <line x1="27.5" y1="17.5" x2="20.5" y2="24.5" />
    </svg>
  )
}

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

function Widget({ icon, percent }) {
  return (
    <div className={styles.widget}>
      <span className={styles.widgetIcon}>{icon}</span>
      <span className={styles.widgetPct}>{percent}%</span>
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────
export default function ComeVaOggiCard({ onInfoClick }) {
  // Dati live da Firestore (documento di oggi)
  const [social,   setSocial]   = useState(85)
  const [workout,  setWorkout]  = useState(45)
  const [water,    setWater]    = useState(75)
  const [summary,  setSummary]  = useState('Oggi hai in programma di…')

  // Frase motivazionale scelta una volta al mount (non cambia tra snapshot)
  const motivRef = useRef(
    FRASI_MOTIVAZIONALI[Math.floor(Math.random() * FRASI_MOTIVAZIONALI.length)]
  )

  useEffect(() => {
    const ref   = doc(db, 'giorni', todayKey())
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSocial(85); setWorkout(45); setWater(75)
        setSummary(motivRef.current)
        return
      }

      const d  = snap.data()
      const ch = d.challenge ?? {}

      // ── Widget percentuali ────────────────────────────────
      setSocial(calcSocialPct(ch.social))
      setWorkout(calcWorkoutPct(ch.passi, ch.cyclette, ch.yoga))
      setWater(calcWaterPct(ch.acqua))

      // ── Testo riepilogo con grammatica italiana ───────────
      const attive = (d.todos ?? []).filter(t => !t.done).slice(0, 3)
      const built  = buildTaskSummary(attive)
      setSummary(built ?? motivRef.current)
    }, (err) => {
      console.error('onSnapshot ComeVaOggi:', err)
    })

    return () => unsub()
  }, [])

  return (
    <section className={styles.card} aria-label="Come va oggi">
      {/* Pulsante "!" → apre DetailScreen */}
      <button className={styles.alertBtn} aria-label="Apri dettaglio" onClick={onInfoClick}>
        !
      </button>

      <h2 className={styles.cardTitle}>Come va oggi?</h2>

      {/* Testo dinamico: prime 3 task non completate da Firestore */}
      <p className={styles.summaryText}>{summary}</p>

      <div className={styles.widgetsRow}>
        <Widget icon={<IconSocial />}  percent={social}  />
        <Widget icon={<IconWorkout />} percent={workout} />
        <Widget icon={<IconWater />}   percent={water}   />
      </div>
    </section>
  )
}
