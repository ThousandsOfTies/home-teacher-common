import './PanelForwardButton.css'

interface PanelForwardButtonProps {
    canGoForward: boolean
    disabled?: boolean
    label: string
    onNext: () => void | Promise<void>
}

/** The caller decides whether its current screen has a single next destination. */
export const PanelForwardButton = ({ canGoForward, disabled, label, onNext }: PanelForwardButtonProps) => {
    if (!canGoForward) return null
    return (
        <button
            type="button"
            className="panel-forward-button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onPointerDown={event => event.stopPropagation()}
            onClick={async event => {
                event.stopPropagation()
                try {
                    await onNext()
                } catch (error) {
                    console.error('Panel forward navigation failed:', error)
                }
            }}
        >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true" focusable="false">
                <path d="m9 5 7 7-7 7" />
            </svg>
        </button>
    )
}
