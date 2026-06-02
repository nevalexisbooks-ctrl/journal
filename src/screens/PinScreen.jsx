// ─── PinScreen — Blocco PIN all'avvio ─────────────────────────────────────────
// Modalità: se app_pin non esiste in localStorage → setup (inserisci + conferma).
// Modalità: se app_pin esiste → sblocca inserendo il PIN corretto.
// Una volta sbloccato, rimane sbloccato per tutta la sessione (stato in memoria).
import React, { useState, useEffect } from 'react'
import styles from './PinScreen.module.css'

const PIN_KEY  = 'app_pin'
const PIN_LEN  = 4

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

export default function PinScreen({ onUnlocked }) {

  const savedPin = localStorage.getItem(PIN_KEY)
  const isSetup  = !savedPin   // true = primo accesso, false = sblocco

  // 'enter' | 'confirm'  (solo in fase setup)
  const [phase,   setPhase]   = useState('enter')
  const [digits,  setDigits]  = useState([])
  const [first,   setFirst]   = useState('')   // PIN inserito al primo step (setup)
  const [shake,   setShake]   = useState(false) // animazione errore

  // Azzera i cerchi dopo shake
  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => {
      setShake(false)
      setDigits([])
    }, 500)
    return () => clearTimeout(t)
  }, [shake])

  // ── Logica pressione tasto ──────────────────────────────────────
  const press = (n) => {
    if (shake) return
    const next = [...digits, n]
    setDigits(next)

    if (next.length < PIN_LEN) return

    const code = next.join('')

    if (isSetup) {
      if (phase === 'enter') {
        // Primo inserimento: passa alla conferma
        setFirst(code)
        setPhase('confirm')
        setDigits([])
      } else {
        // Conferma: i due PIN devono coincidere
        if (code === first) {
          localStorage.setItem(PIN_KEY, code)
          onUnlocked()
        } else {
          setShake(true)
          setFirst('')
          setPhase('enter')
        }
      }
    } else {
      // Sblocco
      if (code === savedPin) {
        onUnlocked()
      } else {
        setShake(true)
      }
    }
  }

  const del = () => {
    if (shake) return
    setDigits(prev => prev.slice(0, -1))
  }

  // ── Testi contestuali ───────────────────────────────────────────
  let title, subtitle
  if (isSetup) {
    title    = 'Crea il tuo PIN'
    subtitle = phase === 'enter' ? 'Scegli un PIN a 4 cifre' : 'Conferma il PIN'
  } else {
    title    = 'Bentornata'
    subtitle = 'Inserisci il tuo PIN'
  }

  // ── Tastiera ────────────────────────────────────────────────────
  const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  return (
    <div className={styles.screen}>
      <div className={styles.card}>

        <p className={styles.title}>{title}</p>
        <p className={styles.subtitle}>{subtitle}</p>

        {/* Cerchi indicatori */}
        <div className={styles.dots}>
          {Array.from({ length: PIN_LEN }, (_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i < digits.length ? styles.dotFilled : ''} ${shake ? styles.dotError : ''}`}
            />
          ))}
        </div>

        {/* Tastiera numerica */}
        <div className={styles.keypad}>
          {KEYS.map(n => (
            <button key={n} className={styles.key} onClick={() => press(n)}>
              {n}
            </button>
          ))}

          {/* Riga inferiore: vuoto | 0 | cancella */}
          <div className={styles.keyEmpty} />
          <button className={styles.key} onClick={() => press(0)}>0</button>
          <button className={`${styles.key} ${styles.keyDel}`} onClick={del} aria-label="Cancella">
            ⌫
          </button>
        </div>

      </div>
    </div>
  )
}
