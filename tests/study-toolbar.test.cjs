const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createInstance } = require('i18next')
const i18n = createInstance()
i18n.init({ lng: 'ja', initImmediate: false, interpolation: { escapeValue: false }, resources: {
    ja: { translation: require('../src/i18n/locales/ja.json') },
    en: { translation: require('../src/i18n/locales/en.json') },
} })

function load(relative, react = React) {
    const exports = {}
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(code, { exports, require: name => {
        if (name === 'react') return react
        if (name === 'react-i18next') return { useTranslation: () => ({ t: i18n.t.bind(i18n) }) }
        if (name.endsWith('.css')) return {}
        // Navigation tests leave the opt-in recorder closed; its event handling is tested in drawing-common.
        if (name === './StrokeInputDiagnostics') return { StrokeInputDiagnostics: () => null }
        return require(name)
    } })
    return exports
}

const { StudyToolbarNavigation } = load('components/study/StudyToolbarNavigation.tsx')
const { StudyEraserTool, StudyTextTool } = load('components/study/StudyToolSettings.tsx')
const { StudyCanvasControls } = load('components/study/StudyCanvasControls.tsx')
const noop = () => {}

function nodes(tree, predicate) {
    return React.Children.toArray(tree).flatMap(node => {
        if (!React.isValidElement(node)) return []
        return [...(predicate(node) ? [node] : []), ...nodes(node.props.children, predicate)]
    })
}

const navigationProps = {
    onBack: noop,
    labels: { home: 'Home' },
    breadcrumbs: [{ label: 'PDF', onClick: noop, isCurrent: true }, { label: 'Answer', onClick: noop }],
}

test('PDF and answer panels retain home and breadcrumb dimensions without view controls in navigation', () => {
        const pdf = StudyToolbarNavigation(navigationProps)
        const answer = StudyToolbarNavigation({ ...navigationProps,
            breadcrumbs: navigationProps.breadcrumbs.map(item => ({ ...item, isCurrent: !item.isCurrent })) })
        const pdfButtons = nodes(pdf, node => node.type === 'button')
        const answerButtons = nodes(answer, node => node.type === 'button')
        assert.equal(pdfButtons.length, 1)
        assert.equal(answerButtons.length, 1)
        assert.equal(pdfButtons[0].props['aria-label'], 'Home')
        assert.deepEqual(answerButtons[0].props.style, pdfButtons[0].props.style)
        const crumbStyles = tree => nodes(tree, node => node.type === 'span' && node.props.style?.borderRadius)
            .map(node => ({ padding: node.props.style.padding, fontWeight: node.props.style.fontWeight,
                fontSize: node.props.style.fontSize, flexShrink: node.props.style.flexShrink }))
        assert.deepEqual(crumbStyles(answer), crumbStyles(pdf))
})

test('navigation delegates actions and renders cover content only when provided by the app', () => {
    const actions = []
    const props = { ...navigationProps, onBack: () => actions.push('home'),
        breadcrumbs: [{ label: 'PDF', content: React.createElement('img', { alt: 'Cover' }),
            onClick: () => actions.push('pdf') }, { label: 'Answer', isCurrent: true, onClick: noop }],
    }
    const tree = StudyToolbarNavigation(props)
    for (const button of nodes(tree, node => node.type === 'button')) button.props.onClick()
    const crumbs = nodes(tree, node => node.type === 'span' && node.props.style?.borderRadius)
    crumbs[0].props.onClick()
    assert.equal(crumbs[1].props.onClick, undefined)
    assert.deepEqual(actions, ['home', 'pdf'])
    assert.equal(crumbs[0].props.style.display, 'inline-flex')
    assert.equal(crumbs[0].props.children.props.alt, 'Cover')
    assert.equal(crumbs[0].props.style.padding, '0 6px')
    const plainHTML = renderToStaticMarkup(StudyToolbarNavigation(navigationProps))
    assert.ok(!plainHTML.includes('settings') && !plainHTML.includes('<img'))
})

const canvasProps = { pageViewControlsEnabled: true, isSplitView: false, activeTab: 'A',
    toggleActiveTab: noop, toggleSplitView: noop, tool: 'pen', penSize: 3, setPenSize: noop,
    eraserSize: 20, setEraserSize: noop }

test('shared canvas controls retain view actions in every tool and disable them outside the PDF', () => {
    const actions = []
    const props = { ...canvasProps, toggleActiveTab: () => actions.push('tab'), toggleSplitView: () => actions.push('split') }
    for (const tool of ['pen', 'eraser', null]) {
        const buttons = nodes(StudyCanvasControls({ ...props, tool }), node => node.type === 'button')
        assert.deepEqual(buttons.map(button => button.props.className), ['tab-switcher-btn', 'split-view-btn'])
        for (const button of buttons) button.props.onClick()
        const disabled = nodes(StudyCanvasControls({ ...props, tool, pageViewControlsEnabled: false }), node => node.type === 'button')
        assert.ok(disabled.every(button => button.props.disabled && button.props['aria-pressed'] === false))
    }
    assert.deepEqual(actions, ['tab', 'split', 'tab', 'split', 'tab', 'split'])
    const splitButtons = nodes(StudyCanvasControls({ ...props, isSplitView: true }), node => node.type === 'button')
    assert.equal(splitButtons[0].props['aria-label'], '単画面に切り替え')
    assert.equal(splitButtons[1].props['aria-label'], 'A/Bを左右で入れ替え')
})

test('eraser sizes use the existing discrete steps in the persistent slider, with no toolbar popup', () => {
    const sizes = []
    const props = { ...canvasProps, tool: 'eraser', setEraserSize: value => sizes.push(value) }
    const slider = nodes(StudyCanvasControls(props), node => node.type === 'input')[0]
    assert.equal(slider.props.value, 2)
    assert.equal(slider.props['aria-valuetext'], '消しゴムの大きさ：20px')
    for (const value of ['0', '1', '10']) slider.props.onChange({ target: { value } })
    assert.deepEqual(sizes, [1, 10, 100])
    assert.equal(nodes(StudyCanvasControls({ ...props, tool: null }), node => node.type === 'input').length, 0)
    const button = StudyEraserTool({ active: true, onClick: noop, title: '消しゴム' })
    assert.equal(nodes(button, node => node.type === 'input').length, 0)
    assert.equal(button.props['aria-pressed'], true)
})

test('pen width and optional opacity use caller-owned values and follow the common language switch', async () => {
    const changes = []
    const props = { ...canvasProps, setPenSize: value => changes.push(value),
        opacity: { value: 65, onChange: value => changes.push(value) } }
    const inputs = nodes(StudyCanvasControls(props), node => node.type === 'input')
    inputs[0].props.onChange({ target: { value: '7' } })
    inputs[1].props.onChange({ target: { value: '80' } })
    assert.deepEqual(changes, [7, 80])
    assert.equal(nodes(StudyCanvasControls({ ...props, opacity: undefined }), node => node.type === 'input').length, 1)
    assert.equal(nodes(StudyCanvasControls({ ...props, tool: 'eraser' }), node => node.type === 'input').length, 1)
    await i18n.changeLanguage('en')
    const english = nodes(StudyCanvasControls(props), node => node.type === 'input')
    assert.equal(english[0].props['aria-label'], 'Pen width')
    assert.equal(english[1].props['aria-valuetext'], 'Opacity: 65%')
    assert.equal(english[0].props.value, 3)
    await i18n.changeLanguage('ja')
})

test('text settings preserve numeric size, direction, color and caller-owned labels/styles', () => {
    const changes = []
    const tree = StudyTextTool({ active: true, popupVisible: true, onClick: noop, title: 'Text settings',
        fontSize: 16, setFontSize: value => changes.push(value), direction: 'horizontal',
        setDirection: value => changes.push(value), color: '#123456', setColor: value => changes.push(value),
        labels: { size: 'Size:', direction: 'Direction:', horizontal: 'Horizontal',
            verticalRight: 'Vertical R→L', verticalLeft: 'Vertical L→R', color: 'Color:' },
        colorInputStyle: { width: '40px', height: '30px' },
    })
    const inputs = nodes(tree, node => node.type === 'input')
    inputs[0].props.onChange({ target: { value: '24' } })
    nodes(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'vertical-rl' } })
    inputs[1].props.onChange({ target: { value: '#abcdef' } })
    assert.deepEqual(changes, [24, 'vertical-rl', '#abcdef'])
    assert.equal(inputs[0].props.min, '10')
    assert.equal(inputs[0].props.max, '32')
    assert.equal(inputs[1].props.style.width, '40px')
    assert.ok(renderToStaticMarkup(tree).includes('Vertical R→L'))
})

test('pen/text taps toggle settings; eraser taps toggle the tool and close popups', () => {
    let state
    const modes = Object.fromEntries(['text', 'pen', 'eraser'].map(tool => [tool, { active: false, toggle() {
        const wasActive = modes[tool].active
        Object.values(modes).forEach(mode => { mode.active = false })
        modes[tool].active = !wasActive
        activations.push(tool)
    } }]))
    const activations = []
    const { useStudyToolPopups } = load('hooks/useStudyToolPopups.ts', {
        useState(initial) {
            state ??= initial
            return [state, next => { state = typeof next === 'function' ? next(state) : next }]
        },
    })
    const render = () => useStudyToolPopups(modes)
    render().handlePenClick()
    assert.equal(render().showPenPopup, false)
    render().handlePenClick()
    assert.equal(render().showPenPopup, true)
    render().handlePenClick()
    assert.equal(render().showPenPopup, false)
    render().handlePenClick()
    render().handleTextClick()
    assert.equal(render().showPenPopup, false)
    assert.equal(render().showTextPopup, false)
    render().handleTextClick()
    assert.equal(render().showTextPopup, true)
    render().handleEraserClick()
    assert.equal(render().showTextPopup, false)
    assert.equal(modes.eraser.active, true)
    render().handleEraserClick()
    assert.equal(modes.eraser.active, false)
    assert.deepEqual(activations, ['pen', 'text', 'eraser', 'eraser'])
})
