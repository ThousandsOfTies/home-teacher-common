import { useState } from 'react'

// Only the linear view history is shared. Trace restoration, grading and each
// app's mode changes remain outside this hook.
export function useStudyPanelStack<T>(initialPanel: T) {
  const [panelStack, setPanelStack] = useState<T[]>([initialPanel])
  const [activePanelIndex, setActivePanelIndex] = useState(0)
  const pushPanel = (panel: T) => {
    setPanelStack(previous => [...previous.slice(0, activePanelIndex + 1), panel])
    setActivePanelIndex(previous => previous + 1)
  }
  return { panelStack, setPanelStack, activePanelIndex, setActivePanelIndex, pushPanel }
}
