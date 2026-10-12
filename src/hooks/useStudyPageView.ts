import { useCallback, useRef, useState } from 'react'

export type StudyPageTab = 'A' | 'B'
export interface StudyPageView {
  mode: 'single' | 'split'
  activeTab: StudyPageTab
}

interface StudyPageViewOptions {
  initialView: StudyPageView
  /** Keep a preferred tab when entering/leaving split view, or retain the active tab. */
  splitActiveTab?: StudyPageTab
  /** The app owns what swapping means: exchanging pages or moving physical panes. */
  onSwapPanes: () => void
}

type ViewCommand = { type: 'switch' } | { type: 'split-or-swap' } | { type: 'show-tab'; tab: StudyPageTab }

/** All display commands update one view state; raw mode/tab setters stay private. */
export function useStudyPageView({ initialView, splitActiveTab, onSwapPanes }: StudyPageViewOptions) {
  const [view, setView] = useState(initialView)
  const currentView = useRef(view)

  const applyCommand = useCallback((command: ViewCommand) => {
    const previous = currentView.current
    if (command.type === 'split-or-swap' && previous.mode === 'split') {
      onSwapPanes()
      return
    }

    let next: StudyPageView
    switch (command.type) {
      case 'switch':
        next = {
          mode: 'single',
          activeTab: previous.mode === 'split' ? splitActiveTab ?? previous.activeTab
            : previous.activeTab === 'A' ? 'B' : 'A',
        }
        break
      case 'split-or-swap':
        next = { mode: 'split', activeTab: splitActiveTab ?? previous.activeTab }
        break
      case 'show-tab':
        next = { ...previous, activeTab: command.tab }
        break
    }
    currentView.current = next
    setView(next)
  }, [splitActiveTab, onSwapPanes])

  return {
    isSplitView: view.mode === 'split',
    activeTab: view.activeTab,
    toggleActiveTab: () => applyCommand({ type: 'switch' }),
    toggleSplitView: () => applyCommand({ type: 'split-or-swap' }),
    showTab: (tab: StudyPageTab) => applyCommand({ type: 'show-tab', tab }),
  }
}
