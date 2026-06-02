// ─── App root ────────────────────────────────────────────────────────────────
import React, { useState } from 'react'
import HomeScreen          from './screens/HomeScreen.jsx'
import DetailScreen        from './screens/DetailScreen.jsx'
import WeeklyRecapScreen   from './screens/WeeklyRecapScreen.jsx'
import MonthlyViewScreen   from './screens/MonthlyViewScreen.jsx'
import ChatScreen          from './screens/ChatScreen.jsx'
import SettingsScreen      from './screens/SettingsScreen.jsx'

export const SCREENS = {
  HOME:     'home',
  DETAIL:   'detail',
  WEEKLY:   'weekly',
  MONTHLY:  'monthly',
  CHAT:     'chat',
  SETTINGS: 'settings',
}

export default function App() {
  const [screen,     setScreen]     = useState(SCREENS.HOME)
  // Data opzionale per aprire DetailScreen a una data specifica
  const [detailDate, setDetailDate] = useState(null)

  const navigate = (target) => setScreen(target)

  /** Apre DetailScreen alla data indicata (passata da MonthlyViewScreen) */
  const openDetailAt = (date) => {
    setDetailDate(date)
    setScreen(SCREENS.DETAIL)
  }

  return (
    <>
      {screen === SCREENS.HOME     && <HomeScreen        navigate={navigate} />}
      {screen === SCREENS.DETAIL   && (
        <DetailScreen
          initialDate={detailDate}
          onBack={() => { setDetailDate(null); navigate(SCREENS.HOME) }}
        />
      )}
      {screen === SCREENS.WEEKLY   && <WeeklyRecapScreen onBack={() => navigate(SCREENS.HOME)} />}
      {screen === SCREENS.MONTHLY  && (
        <MonthlyViewScreen
          onBack={() => navigate(SCREENS.HOME)}
          onOpenDetail={openDetailAt}
        />
      )}
      {screen === SCREENS.CHAT     && <ChatScreen        onBack={() => navigate(SCREENS.HOME)} />}
      {screen === SCREENS.SETTINGS && <SettingsScreen    onBack={() => navigate(SCREENS.HOME)} />}
    </>
  )
}
