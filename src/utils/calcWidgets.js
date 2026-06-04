// ─── Utilities condivise: calcoli widget + date + punteggi ───────────────────

// ════════════════════════════════════════════════════════════════
//  CALCOLI WIDGET HOMEPAGE
// ════════════════════════════════════════════════════════════════

/** Social %: 0-5 min → 100%; ogni 6 min oltre i 5: -5%; min 0% */
export function calcSocialPct(minutes) {
  const m = Number(minutes) || 0
  if (m <= 5) return 100
  return Math.max(0, 100 - Math.floor((m - 5) / 6) * 5)
}

/** Workout %: (passi/500)*3 + (cyclette/3)*4 + (yoga/3)*4; max 100% */
export function calcWorkoutPct(passi, cyclette, yoga) {
  const p = Number(passi)    || 0
  const c = Number(cyclette) || 0
  const y = Number(yoga)     || 0
  return Math.min(100, Math.round((p / 500) * 3 + (c / 3) * 4 + (y / 3) * 4))
}

/** Acqua %: scala a gradini */
export function calcWaterPct(litri) {
  const l = Number(litri) || 0
  if (l < 0.5)   return 0
  if (l < 0.625) return 5
  if (l < 0.875) return 10
  if (l < 1.125) return 20
  if (l < 1.375) return 30
  if (l < 1.625) return 40
  if (l < 1.875) return 50
  if (l < 2.125) return 60
  if (l < 2.375) return 70
  if (l < 2.625) return 80
  if (l < 2.875) return 90
  if (l < 3.0)   return 95
  return 100
}

// ════════════════════════════════════════════════════════════════
//  CALCOLO VOTO GIORNALIERO (max 100 pt → /10 → intero 1-10)
// ════════════════════════════════════════════════════════════════

/**
 * Riceve il documento Firestore di un giorno e restituisce il voto (1-10).
 * Ritorna null se il documento non esiste o non ha dati sufficienti.
 */
export function calcDayScore(dayData) {
  if (!dayData) return null

  const ch     = dayData.challenge ?? {}
  const umore  = dayData.umore     ?? {}
  const sonno  = dayData.sonno     ?? {}
  const todos  = dayData.todos     ?? []
  const habits = dayData.habits    ?? []

  // 1. Social (max 15 pt): pct × 0.15
  const social   = calcSocialPct(ch.social)  * 0.15

  // 2. Workout (max 15 pt): pct × 0.15
  const workout  = calcWorkoutPct(ch.passi, ch.cyclette, ch.yoga) * 0.15

  // 3. Acqua (max 15 pt): pct × 0.15
  const water    = calcWaterPct(ch.acqua) * 0.15

  // 4. Zero Zuccheri (max 15 pt)
  const zuccheri = ch.zeroZuccheri ? 15 : 0

  // 5. Umore (max 15 pt): voto × 1.5
  const umoreScore = (Number(umore.voto) || 0) * 1.5

  // 6. Task To Do (max 15 pt): (completate/totali) × 15
  const totTodo = todos.length
  const doneTodo = todos.filter(t => t.done).length
  const todoScore = totTodo > 0 ? (doneTodo / totTodo) * 15 : 0

  // 7. Qualità Sonno (max 7 pt): qualità × 0.7
  const sonnoScore = (Number(sonno.qualita) || 0) * 0.7

  // 8. Small Habits (max 3 pt): 0=0, 1=1.5, 2+=3
  const doneHabits = habits.filter(h => h.done).length
  const habitsScore = doneHabits === 0 ? 0 : doneHabits === 1 ? 1.5 : 3

  const total = social + workout + water + zuccheri + umoreScore + todoScore + sonnoScore + habitsScore
  const voto  = Math.round(total / 10)

  // Ritorna null se tutti i campi erano a zero/vuoti (giornata non compilata)
  const hasSomeData = (
    Number(ch.social) || Number(ch.passi) || Number(ch.cyclette) ||
    Number(ch.yoga)   || Number(ch.acqua) || ch.zeroZuccheri     ||
    Number(umore.voto) || totTodo > 0    || Number(sonno.qualita)
  )
  return hasSomeData ? Math.max(1, voto) : null
}

// ════════════════════════════════════════════════════════════════
//  UTILITIES DATE
// ════════════════════════════════════════════════════════════════

/** Data → "YYYY-MM-DD" (chiave documento Firestore) */
export function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Restituisce true se la chiave YYYY-MM-DD è strettamente futura rispetto a oggi.
 * Il confronto lessicografico su YYYY-MM-DD è corretto e DST-safe.
 */
export function isFutureKey(key) {
  return key > toDateKey(new Date())
}

/** Restituisce il Lunedì della settimana contenente `date` */
export function getMonday(date) {
  const d   = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=dom … 6=sab
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

/** Restituisce array di 7 Date (lun→dom) dalla settimana di `monday` */
export function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Data → chiave settimana ISO "YYYY-WNN" */
export function toWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dow = d.getUTCDay() || 7          // 1=lun … 7=dom
  d.setUTCDate(d.getUTCDate() + 4 - dow)  // giovedì della stessa settimana ISO
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum   = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

/** "1-7 Giugno 2026" oppure "28 Maggio - 3 Giugno 2026" */
export function formatWeekRange(monday) {
  const sun      = new Date(monday); sun.setDate(sun.getDate() + 6)
  const monMonth = monday.toLocaleDateString('it-IT', { month: 'long' })
  const sunMonth = sun.toLocaleDateString('it-IT', { month: 'long' })
  const year     = sun.getFullYear()
  if (monMonth === sunMonth)
    return `${monday.getDate()}-${sun.getDate()} ${cap(sunMonth)} ${year}`
  return `${monday.getDate()} ${cap(monMonth)} - ${sun.getDate()} ${cap(sunMonth)} ${year}`
}

/** Indice giorno corrente nella settimana: 0=lun … 6=dom */
export function todayWeekIndex() {
  const day = new Date().getDay()
  return day === 0 ? 6 : day - 1
}

// ════════════════════════════════════════════════════════════════
//  CALCOLO FASE CICLO
// ════════════════════════════════════════════════════════════════

/**
 * Calcola la fase del ciclo per una data specifica.
 *
 * Logica boundary (ciclo standard 28gg, flusso 5gg):
 *   Mestruale  → giorno  1 … flusso          (es. 1-5)
 *   Follicolare → giorno flusso+1 … ovul-1   (es. 6-13)
 *   Ovulatoria → giorno ovul … ovul+2        (es. 14-16)
 *   Luteale    → giorno ovul+3 … fine ciclo  (es. 17-28)
 * dove ovulationDay = cycle - 14  (fase luteale standard = 14 gg)
 *
 * TEST: inizio 2026-05-12, ciclo 28, flusso 5, oggi 2026-06-02
 *   → diffDays=21, dayInCycle=22, Luteale ✓
 *
 * @returns {{ phaseIdx, dayInPhase, dayInCycle }}
 *   phaseIdx: 0=mestruale 1=follicolare 2=ovulatoria 3=luteale
 *   dayInCycle: giorno assoluto del ciclo (1-based) — da mostrare in UI
 *   dayInPhase: giorno all'interno della fase corrente
 */
export function calcCyclePhase(dataInizio, durataCiclo, durataflusso, viewDate) {
  const fallback = { phaseIdx: 1, dayInPhase: 1, dayInCycle: 1 }
  if (!dataInizio) return fallback

  // ── Calcolo DST-safe: confronto solo le parti data in UTC ──────────────
  const viewKey = toDateKey(viewDate instanceof Date ? viewDate : new Date(viewDate))
  const [sy, sm, sd] = dataInizio.split('-').map(Number)
  const [vy, vm, vd] = viewKey.split('-').map(Number)
  // Math.round evita errori da DST (±1h → ±0.04 giorni, irrilevante)
  const diffDays = Math.round(
    (Date.UTC(vy, vm - 1, vd) - Date.UTC(sy, sm - 1, sd)) / 86400000
  )
  if (diffDays < 0) return fallback

  const cycle  = Math.max(21, Number(durataCiclo)  || 28)
  const flusso = Math.max(1,  Number(durataflusso) || 5)

  // Giorno del ciclo: 1-based, si azzera ogni `cycle` giorni
  // Formula spec: dayInCycle = oggi − dataInizio + 1
  const dayInCycle = (diffDays % cycle) + 1

  // Boundaries (standard: ovulazione ≈ ciclo − 14 gg)
  const ovulationDay    = Math.max(flusso + 1, cycle - 14)  // es. 14 per ciclo 28gg
  const endFollicolare  = ovulationDay - 1                   // es. 13
  const endOvulatoria   = ovulationDay + 2                   // es. 16

  let phaseIdx, dayInPhase
  if (dayInCycle <= flusso) {
    // Mestruale: giorni 1-flusso
    phaseIdx   = 0
    dayInPhase = dayInCycle
  } else if (dayInCycle <= endFollicolare) {
    // Follicolare: giorni flusso+1 … ovulationDay-1  (es. 6-13)
    phaseIdx   = 1
    dayInPhase = dayInCycle - flusso
  } else if (dayInCycle <= endOvulatoria) {
    // Ovulatoria: ovulationDay … ovulationDay+2  (es. 14-16)
    phaseIdx   = 2
    dayInPhase = dayInCycle - endFollicolare
  } else {
    // Luteale: ovulationDay+3 … fine ciclo  (es. 17-28)
    phaseIdx   = 3
    dayInPhase = dayInCycle - endOvulatoria
  }

  return { phaseIdx, dayInPhase, dayInCycle }
}
