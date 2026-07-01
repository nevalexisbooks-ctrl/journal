// ─── HomeScreen ───────────────────────────────────────────────────────────────
import React from 'react'
import styles from './HomeScreen.module.css'
import { SCREENS } from '../App.jsx'

import Header          from '../components/Header.jsx'
import ComeVaOggiCard  from '../components/ComeVaOggiCard.jsx'
import JournalCard     from '../components/JournalCard.jsx'
import WeeklyRecapCard from '../components/WeeklyRecapCard.jsx'
import MonthlyViewCard from '../components/MonthlyViewCard.jsx'

export default function HomeScreen({ navigate }) {
  return (
    <div className={styles.screen}>

      <Header onSettingsClick={() => navigate(SCREENS.SETTINGS)} />

      <main className={styles.main}>

        <ComeVaOggiCard onInfoClick={() => navigate(SCREENS.DETAIL)} />

        <JournalCard onClick={() => navigate(SCREENS.CHAT)} />

        <MonthlyViewCard onClick={() => navigate(SCREENS.MONTHLY)} />

        <WeeklyRecapCard onClick={() => navigate(SCREENS.WEEKLY)} />

      </main>
    </div>
  )
}
