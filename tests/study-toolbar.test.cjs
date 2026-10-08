const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(relative, react = React) {
    const exports = {}
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : require(name) })
    return exports
}

const { StudyToolbarNavigation } = load('components/study/StudyToolbarNavigation.tsx')
const { StudyEraserTool, StudyTextTool } = load('components/study/StudyToolSettings.tsx')
const noop = () => {}

function nodes(tree, predicate) {
    return React.Children.toArray(tree).flatMap(node => {
        if (!React.isValidElement(node)) return []
        return [...(predicate(node) ? [node] : []), ...nodes(node.props.children, predicate)]
    })
}

const navigationProps = {
    onBack: noop, pageViewControlsEnabled: true, isSplitView: false, activeTab: 'A',
    toggleSplitView: noop, toggleActiveTab: noop,
    labels: { home: 'Home', switchPane: 'Switch A/B', splitView: 'Split view' },
    breadcrumbs: [{ label: 'PDF', onClick: noop, isCurrent: true }, { label: 'Answer', onClick: noop }],
}

test('PDF and answer panels retain navigation order and breadcrumb dimensions while controls become disabled', () => {
    for (const isSplitView of [false, true]) {
        const pdf = StudyToolbarNavigation({ ...navigationProps, isSplitView })
        const answer = StudyToolbarNavigation({ ...navigationProps, isSplitView, pageViewControlsEnabled: false,
            breadcrumbs: navigationProps.breadcrumbs.map(item => ({ ...item, isCurrent: !item.isCurrent })) })
        const pdfButtons = nodes(pdf, node => node.type === 'button')
        const answerButtons = nodes(answer, node => node.type === 'button')
        assert.equal(pdfButtons.length, 3)
        assert.deepEqual(answerButtons.map(node => node.props.className), ['tab-switcher-btn ', 'split-view-btn ', undefined])
        for (let index = 0; index <= 1; index++) {
            assert.equal(pdfButtons[index].props.disabled, false)
            assert.equal(answerButtons[index].props.disabled, true)
            assert.deepEqual(answerButtons[index].props.style, pdfButtons[index].props.style)
        }
        const crumbStyles = tree => nodes(tree, node => node.type === 'span' && node.props.style?.borderRadius)
            .map(node => ({ padding: node.props.style.padding, fontWeight: node.props.style.fontWeight,
                fontSize: node.props.style.fontSize, flexShrink: node.props.style.flexShrink }))
        assert.deepEqual(crumbStyles(answer), crumbStyles(pdf))
    }
})

test('navigation delegates actions and renders cover content only when provided by the app', () => {
    const actions = []
    const props = { ...navigationProps, onBack: () => actions.push('home'),
        toggleActiveTab: () => actions.push('tab'), toggleSplitView: () => actions.push('split'),
        breadcrumbs: [{ label: 'PDF', content: React.createElement('img', { alt: 'Cover' }),
            onClick: () => actions.push('pdf') }, { label: 'Answer', isCurrent: true, onClick: noop }],
    }
    const tree = StudyToolbarNavigation(props)
    for (const button of nodes(tree, node => node.type === 'button')) button.props.onClick()
    const crumbs = nodes(tree, node => node.type === 'span' && node.props.style?.borderRadius)
    crumbs[0].props.onClick()
    assert.equal(crumbs[1].props.onClick, undefined)
    assert.deepEqual(actions, ['tab', 'split', 'home', 'pdf'])
    assert.equal(crumbs[0].props.style.display, 'inline-flex')
    assert.equal(crumbs[0].props.children.props.alt, 'Cover')
    assert.equal(crumbs[0].props.style.padding, '0 6px')
    const plainHTML = renderToStaticMarkup(StudyToolbarNavigation(navigationProps))
    assert.ok(!plainHTML.includes('settings') && !plainHTML.includes('<img'))
})

test('eraser settings retain their discrete sizes and appear only for an active tool', () => {
    const sizes = []
    const props = { active: true, popupVisible: true, onClick: noop, title: '消しゴム',
        size: 20, setSize: value => sizes.push(value), sizeLabel: '大きさ:' }
    const slider = nodes(StudyEraserTool(props), node => node.type === 'input')[0]
    assert.equal(slider.props.value, 2)
    assert.equal(slider.props['aria-valuetext'], '20px')
    for (const value of ['0', '1', '10']) slider.props.onChange({ target: { value } })
    assert.deepEqual(sizes, [1, 10, 100])
    for (const overrides of [{ active: false }, { popupVisible: false }]) {
        assert.equal(nodes(StudyEraserTool({ ...props, ...overrides }), node => node.type === 'input').length, 0)
    }
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

test('the first tap activates a tool, repeated taps toggle settings, and changing tools closes popups', () => {
    let state
    const modes = Object.fromEntries(['text', 'pen', 'eraser'].map(tool => [tool, { active: false, toggle() {
        Object.values(modes).forEach(mode => { mode.active = false })
        modes[tool].active = true
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
    assert.equal(render().showEraserPopup, false)
    render().handleEraserClick()
    assert.equal(render().showEraserPopup, true)
    assert.deepEqual(activations, ['pen', 'text', 'eraser'])
})
