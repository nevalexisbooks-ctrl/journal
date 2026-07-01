// ─── MonthlyViewScreen ───────────────────────────────────────────────────────
// Firestore reads:
//   giorni/{YYYY-MM-DD}  → dati giornalieri del mese selezionato
//   settings/ciclo       → colorazione fase mestruale nel calendario
//   mesi/{YYYY-MM}       → note mensili (private, NON passate all'AI)
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  toDateKey, calcCyclePhase, calcDayScore, isFutureKey, getPesiForDate,
} from '../utils/calcWidgets.js'
import styles from './MonthlyViewScreen.module.css'

// ════════════════════════════════════════════════════════════════
//  HELPERS DATE
// ════════════════════════════════════════════════════════════════

function toMonthKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function getMonthDays(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function firstWeekdayOfMonth(year, month) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1  // 0=lun … 6=dom
}

function isToday(year, month, day) {
  const t = new Date()
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
}

function isPastOrToday(year, month, day) {
  const d    = new Date(year, month, day)
  const now  = new Date(); now.setHours(0,0,0,0)
  return d <= now
}

function formatMonthLabel(date) {
  const nome = date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

// ════════════════════════════════════════════════════════════════
//  HELPER SONNO → ore decimali
// ════════════════════════════════════════════════════════════════

function sleepHours(dalle, alle) {
  if (!dalle || !alle) return null
  const [h1, m1] = dalle.split(':').map(Number)
  const [h2, m2] = alle.split(':').map(Number)
  let start = h1 * 60 + m1, end = h2 * 60 + m2
  if (end <= start) end += 1440
  return (end - start) / 60
}

function fmt(n, dec = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toFixed(dec)
}

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

const DAYS_HDR = ['L','M','M','G','V','S','D']

export default function MonthlyViewScreen({ onBack, onOpenDetail }) {
  const today = new Date()

  // ── Mese visualizzato ─────────────────────────────────────────
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // ── Dati Firestore ────────────────────────────────────────────
  const [dayDocs,        setDayDocs]        = useState({})
  const [ciclo,          setCiclo]          = useState(null)
  const [monthNote,      setMonthNote]      = useState('')
  const [recap,          setRecap]          = useState(null)
  const [votoMedio,      setVotoMedio]      = useState(null)
  const [scoreVersions,  setScoreVersions]  = useState([])

  // ── Refs auto-save note ───────────────────────────────────────
  const noteReadyRef  = useRef(false)
  const noteTimerRef  = useRef(null)

  // ════════════════════════════════════════════════════════════
  //  CARICAMENTO al cambio mese
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    noteReadyRef.current = false
    let cancelled = false

    async function loadMonth() {
      const totalDays = getMonthDays(year, month)
      const keys = Array.from({ length: totalDays }, (_, i) =>
        toDateKey(new Date(year, month, i + 1))
      )

      try {
        // Carica tutto in parallelo
        const [daySnaps, cicloSnap, noteSnap, formulasSnap] = await Promise.all([
          Promise.all(keys.map(k => getDoc(doc(db, 'giorni', k)))),
          getDoc(doc(db, 'settings', 'ciclo')),
          getDoc(doc(db, 'mesi', toMonthKey(viewDate))),
          getDoc(doc(db, 'settings', 'scoreFormulas')),
        ])
        if (cancelled) return

        const versions = formulasSnap.exists() ? (formulasSnap.data().versions ?? []) : []
        setScoreVersions(versions)

        // ── Mappa giorni ──────────────────────────────────────
        const docsMap = {}
        keys.forEach((k, i) => {
          docsMap[k] = daySnaps[i].exists() ? daySnaps[i].data() : null
        })
        setDayDocs(docsMap)

        // ── Ciclo ─────────────────────────────────────────────
        setCiclo(cicloSnap.exists() ? cicloSnap.data() : null)

        // ── Note mensile ──────────────────────────────────────
        setMonthNote(noteSnap.exists() ? (noteSnap.data().note ?? '') : '')

        // ── Calcola recap mensile ─────────────────────────────
        calcRecap(docsMap, versions)

      } catch (err) {
        console.error('Errore caricamento mese:', err)
      } finally {
        if (!cancelled) {
          setTimeout(() => { noteReadyRef.current = true }, 50)
        }
      }
    }

    loadMonth()
    return () => { cancelled = true }
  }, [year, month]) // eslint-disable-line

  // ════════════════════════════════════════════════════════════
  //  CALCOLO RECAP
  // ════════════════════════════════════════════════════════════

  function calcRecap(docsMap, versions = []) {
    let passi = 0, acqua = 0, social = 0, cyclette = 0, yoga = 0
    let sonnoTot = 0, zeroZuccheri = 0
    let daysWithData = 0
    const scores = []

    Object.entries(docsMap).forEach(([key, d]) => {
      if (isFutureKey(key)) return   // ignora giorni futuri
      if (!d) return
      const ch = d.challenge ?? {}
      const hasAny = (
        Number(ch.passi) || Number(ch.acqua) || Number(ch.social) ||
        Number(ch.cyclette) || Number(ch.yoga) || ch.zeroZuccheri ||
        Number(d.sonno?.qualita) || Number(d.umore?.voto) || (d.todos?.length > 0)
      )
      if (!hasAny) return
      daysWithData++

      passi    += Number(ch.passi)    || 0
      acqua    += Number(ch.acqua)    || 0
      social   += Number(ch.social)   || 0
      cyclette += Number(ch.cyclette) || 0
      yoga     += Number(ch.yoga)     || 0
      if (ch.zeroZuccheri) zeroZuccheri++

      const sh = sleepHours(d.sonno?.dalle, d.sonno?.alle)
      if (sh !== null) sonnoTot += sh

      const pesi  = getPesiForDate(versions, key)
      const score = calcDayScore(d, pesi)
      if (score !== null) scores.push(score)
    })

    const n = daysWithData || 1
    setRecap({
      passiTot:    passi,          passiMedia:    passi / n,
      acquaTot:    acqua,          acquaMedia:    acqua / n,
      socialTot:   social,         socialMedia:   social / n,
      cycletteTot: cyclette,       cycletteMedia: cyclette / n,
      yogaTot:     yoga,           yogaMedia:     yoga / n,
      sonnoTot,                    sonnoMedia:    sonnoTot / n,
      zeroZuccheri, daysWithData,
    })

    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      setVotoMedio(Math.round(avg))
    } else {
      setVotoMedio(null)
    }
  }

  // ════════════════════════════════════════════════════════════
  //  AUTO-SAVE NOTE MENSILE (debounced 700ms)
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!noteReadyRef.current) return
    clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, 'mesi', toMonthKey(viewDate)),
          { note: monthNote },
          { merge: true }
        )
      } catch (err) { console.error('Errore salvataggio nota mese:', err) }
    }, 700)
    return () => clearTimeout(noteTimerRef.current)
  }, [monthNote]) // eslint-disable-line

  // ════════════════════════════════════════════════════════════
  //  NAVIGAZIONE MESE
  // ════════════════════════════════════════════════════════════

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  // ════════════════════════════════════════════════════════════
  //  COLORI CICLO per ogni giorno
  // ════════════════════════════════════════════════════════════

  function isMestruale(day) {
    if (!ciclo?.dataInizio) return false
    const ph = calcCyclePhase(ciclo.dataInizio, ciclo.durataCiclo, ciclo.durataflusso,
      new Date(year, month, day))
    return ph.phaseIdx === 0
  }

  // ════════════════════════════════════════════════════════════
  //  CLICK SU GIORNO
  // ════════════════════════════════════════════════════════════

  const handleDayClick = (day) => {
    if (!isPastOrToday(year, month, day)) return
    const date = new Date(year, month, day)
    onOpenDetail(date)
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  const totalDays  = getMonthDays(year, month)
  const startOffset = firstWeekdayOfMonth(year, month)

  return (
    <div className={styles.screen}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} aria-label="Torna">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <p className={styles.headerTitle}>Monthly view</p>

        <div className={styles.monthNav}>
          <button className={styles.navArrow} onClick={prevMonth}>‹‹</button>
          <span className={styles.monthLabel}>{formatMonthLabel(viewDate)}</span>
          <button className={styles.navArrow} onClick={nextMonth}>››</button>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── CALENDARIO ───────────────────────────────────────── */}
        <section className={styles.calCard}>
          <div className={styles.calGrid}>
            {/* Intestazioni L M M G V S D */}
            {DAYS_HDR.map((h, i) => (
              <div key={i} className={styles.calHdr}>{h}</div>
            ))}

            {/* Celle vuote per offset */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`e${i}`} className={styles.calEmpty} />
            ))}

            {/* Giorni del mese */}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
              const past    = isPastOrToday(year, month, day)
              const todayD  = isToday(year, month, day)
              const mestr   = isMestruale(day)
              const dateKey = toDateKey(new Date(year, month, day))
              const dayData = dayDocs[dateKey] ?? null
              const hasData = !!dayData
              const score   = hasData && past ? calcDayScore(dayData, getPesiForDate(scoreVersions, dateKey)) : null

              return (
                <div
                  key={day}
                  className={[
                    styles.calDay,
                    todayD  ? styles.calToday   : '',
                    mestr   ? styles.calMestr   : '',
                    past && !todayD ? styles.calPast : '',
                    past    ? styles.calClickable : '',
                    hasData ? styles.calHasData  : '',
                  ].join(' ')}
                  onClick={() => handleDayClick(day)}
                  title={past ? 'Apri dettaglio' : ''}
                >
                  <span className={styles.calDayNum}>{day}</span>
                  {score !== null && (
                    <span className={styles.calDayScore}>{score}</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── SEZIONE INFERIORE: Recap | Note + Voto ───────────── */}
        <div className={styles.bottomSection}>

          {/* Recap mensile */}
          <section className={styles.recapCard}>
            <h2 className={styles.quadTitle}>Recap</h2>

            {recap ? (
              <dl className={styles.recapList}>
                {[
                  { label: 'Passi tot',    val: fmt(recap.passiTot, 0) },
                  { label: 'Passi medi',   val: fmt(recap.passiMedia, 0),    groupEnd: true },
                  { label: 'Acqua tot',    val: `${fmt(recap.acquaTot)} L` },
                  { label: 'Acqua media',  val: `${fmt(recap.acquaMedia)} L`,  groupEnd: true },
                  { label: 'Social tot',   val: `${fmt(recap.socialTot, 0)} min` },
                  { label: 'Social med',   val: `${fmt(recap.socialMedia, 0)} min`, groupEnd: true },
                  { label: 'Cyclette tot', val: `${fmt(recap.cycletteTot, 0)} min` },
                  { label: 'Cyclette med', val: `${fmt(recap.cycletteMedia, 0)} min`, groupEnd: true },
                  { label: 'Yoga tot',     val: `${fmt(recap.yogaTot, 0)} min` },
                  { label: 'Yoga med',     val: `${fmt(recap.yogaMedia, 0)} min`, groupEnd: true },
                  { label: 'Zero zucc',    val: `${recap.zeroZuccheri} gg`,  groupEnd: true },
                  { label: 'Sonno tot',    val: `${fmt(recap.sonnoTot)} h` },
                  { label: 'Sonno med',    val: `${fmt(recap.sonnoMedia)} h` },
                ].map(({ label, val, groupEnd }) => (
                  <div key={label} className={`${styles.recapRow} ${groupEnd ? styles.recapGroupEnd : ''}`}>
                    <dt className={styles.recapLabel}>{label}</dt>
                    <dd className={styles.recapVal}>{val}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={styles.noData}>Nessun dato</p>
            )}
          </section>

          {/* Colonna destra: Note + Voto */}
          <div className={styles.rightCol}>

            {/* Note mensile — privata, NON passata all'AI */}
            <section className={styles.noteCard}>
              <h2 className={styles.quadTitle}>Note</h2>
              {/* TODO: queste note sono private — non passarle alla chat AI */}
              <textarea
                className={styles.noteArea}
                value={monthNote}
                onChange={e => setMonthNote(e.target.value)}
                placeholder="Note del mese…"
                rows={6}
              />
            </section>

            {/* Voto medio mensile */}
            <section className={styles.votoCard}>
              <h2 className={styles.quadTitle}>Voto!</h2>
              <p className={styles.votoNum}>
                {votoMedio !== null ? votoMedio : '—'}
                <span className={styles.votoSu}>/10</span>
              </p>
              <p className={styles.votoSub}>media mensile</p>
            </section>

          </div>
        </div>

      </main>
    </div>
  )
}
