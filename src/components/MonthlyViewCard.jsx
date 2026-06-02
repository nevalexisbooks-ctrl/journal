// ─── Card Monthly View ────────────────────────────────────────────────────
// Mini calendario mensile con il giorno corrente cerchiato
// TODO: collegare Firebase — colorare giorni con entry reali
import React, { useEffect, useState } from 'react'
import styles from './MonthlyViewCard.module.css'

const GIORNI_HDR = ['L','M','M','G','V','S','D']

function buildCalendar() {
  const oggi      = new Date()
  const anno      = oggi.getFullYear()
  const mese      = oggi.getMonth()
  const giorno    = oggi.getDate()
  const totGiorni = new Date(anno, mese + 1, 0).getDate()

  // Nome mese in italiano, capitalizzato
  const nomeMese = oggi.toLocaleDateString('it-IT', { month: 'long' })
  const label    = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1) + ' ' + anno

  // Offset: primo giorno del mese (0=lun…6=dom)
  const primoJs = new Date(anno, mese, 1).getDay()
  const offset  = primoJs === 0 ? 6 : primoJs - 1

  return { label, offset, totGiorni, giorno }
}

export default function MonthlyViewCard({ onClick }) {
  const [cal, setCal] = useState(null)

  useEffect(() => {
    setCal(buildCalendar())
  }, [])

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label="Monthly view"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <p className={styles.title}>Monthly view</p>

      {/* Etichetta mese/anno */}
      <p className={styles.monthLabel}>{cal?.label ?? ''}</p>

      {/* Griglia calendario */}
      <div className={styles.calGrid}>
        {/* Intestazioni */}
        {GIORNI_HDR.map((h, i) => (
          <div key={i} className={styles.calHeaderCell}>{h}</div>
        ))}

        {/* Celle vuote per offset */}
        {cal && Array.from({ length: cal.offset }).map((_, i) => (
          <div key={`e${i}`} className={styles.calCellEmpty} />
        ))}

        {/* Giorni del mese */}
        {cal && Array.from({ length: cal.totGiorni }, (_, i) => i + 1).map((d) => (
          <div
            key={d}
            className={`${styles.calCell} ${d === cal.giorno ? styles.calToday : ''}`}
          >
            {d}
          </div>
        ))}
      </div>
    </article>
  )
}
