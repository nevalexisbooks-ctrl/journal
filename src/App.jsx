// ─── App root — gestisce schermata attiva e stato condiviso ──────────────────
import React, { useState } from 'react'
import HomeScreen   from './screens/HomeScreen.jsx'
import DetailScreen from './screens/DetailScreen.jsx'

// ── Enum schermate ────────────────────────────────────────────────────────────
export const SCREENS = {
  HOME:    'home',
  DETAIL:  'detail',   // ← "Nel dettaglio" (pulsante "!" in ComeVaOggi)
  JOURNAL: 'journal',  // TODO: creare JournalScreen
  WEEKLY:  'weekly',   // TODO: creare WeeklyScreen
  MONTHLY: 'monthly',  // TODO: creare MonthlyScreen
}

// ── Valori default widget (mostrati prima che l'utente inserisca dati) ────────
const DEFAULT_WIDGET_DATA = { social: 85, workout: 45, water: 75 }

export default function App() {
  // Schermata attiva
  const [screen, setScreen] = useState(SCREENS.HOME)

  // Dati widget (aggiornati da DetailScreen in tempo reale)
  const [widgetData, setWidgetData] = useState(DEFAULT_WIDGET_DATA)

  // Prime 3 task non completate (aggiornate da DetailScreen)
  const [topTasks, setTopTasks] = useState([])

  const navigate = (target) => setScreen(target)

  return (
    <>
      {screen === SCREENS.HOME && (
        <HomeScreen
          navigate={navigate}
          widgetData={widgetData}
          topTasks={topTasks}
        />
      )}

      {screen === SCREENS.DETAIL && (
        <DetailScreen
          onBack={() => navigate(SCREENS.HOME)}
          onDataUpdate={(data) => setWidgetData(data)}
          onTasksUpdate={(tasks) => setTopTasks(tasks)}
        />
      )}

      {/* TODO: aggiungere le altre schermate man mano che vengono create */}
    </>
  )
}
