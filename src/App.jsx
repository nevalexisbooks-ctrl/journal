// ─── App root ────────────────────────────────────────────────────────────────
import React, { useState } from 'react'
import HomeScreen        from './screens/HomeScreen.jsx'
import DetailScreen      from './screens/DetailScreen.jsx'
import WeeklyRecapScreen from './screens/WeeklyRecapScreen.jsx'

export const SCREENS = {
  HOME:    'home',
  DETAIL:  'detail',
  WEEKLY:  'weekly',
  JOURNAL: 'journal',  // TODO: creare JournalScreen
  MONTHLY: 'monthly',  // TODO: creare MonthlyScreen
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME)
  const navigate = (target) => setScreen(target)

  return (
    <>
      {screen === SCREENS.HOME && (
        <HomeScreen navigate={navigate} />
      )}
      {screen === SCREENS.DETAIL && (
        <DetailScreen onBack={() => navigate(SCREENS.HOME)} />
      )}
      {screen === SCREENS.WEEKLY && (
        <WeeklyRecapScreen onBack={() => navigate(SCREENS.HOME)} />
      )}
    </>
  )
}
