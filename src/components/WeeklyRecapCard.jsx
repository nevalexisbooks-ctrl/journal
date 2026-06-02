// ─── Card Weekly Recap ────────────────────────────────────────────────────
// Mostra task settimanali fittizie + striscia giorni con voti
// TODO: collegare Firebase — caricare task e voti reali della settimana
import React, { useEffect, useState } from 'react'
import styles from './WeeklyRecapCard.module.css'

/* Dati fittizi — TODO: sostituire con query Firestore */
const TASK_FITTIZIE = [
  { id: 1, label: 'Meditazione',      done: true  },
  { id: 2, label: 'Corsa 30 min',     done: true  },
  { id: 3, label: 'Leggere 20 pag.',  done: false },
  { id: 4, label: 'No social dopo 22',done: false },
]

const VOTI_FITTIZI = [9, 8, 7, 4, null, null, null]
const GIORNI_LABELS = ['L','M','M','G','V','S','D']

/* Ritorna l'indice del giorno corrente (0=lun … 6=dom) */
function indexGiornoOggi() {
  const js = new Date().getDay() // 0=dom
  return js === 0 ? 6 : js - 1
}

export default function WeeklyRecapCard({ onClick }) {
  const [todayIdx, setTodayIdx] = useState(0)

  useEffect(() => {
    setTodayIdx(indexGiornoOggi())
  }, [])

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
      <p className={styles.sub}>Weekly goal</p>

      {/* Task list — TODO: collegare Firebase */}
      <ul className={styles.taskList}>
        {TASK_FITTIZIE.map((t) => (
          <li key={t.id} className={t.done ? styles.taskDone : ''}>
            <div className={`${styles.checkbox} ${t.done ? styles.checked : ''}`} />
            {t.label}
          </li>
        ))}
      </ul>

      {/* Striscia giorni + voti */}
      <div className={styles.weekStripWrapper}>
        <div className={styles.weekStrip}>
          {GIORNI_LABELS.map((g, i) => (
            <div
              key={i}
              className={`${styles.weekCell} ${i === todayIdx ? styles.today : ''}`}
            >
              <span className={styles.weekLetter}>{g}</span>
              {/* TODO: collegare Firebase — voti reali */}
              <span className={styles.weekScore}>
                {VOTI_FITTIZI[i] !== null ? VOTI_FITTIZI[i] : '·'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
