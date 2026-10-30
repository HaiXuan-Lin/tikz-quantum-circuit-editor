import {useI18n, useLocale} from './I18n'
import {h} from 'preact'
import {useEffect, useMemo, useRef, useState} from 'preact/hooks'
import Canvas from './Canvas'
import Library from './Library'
import Inspector from './Inspector'
import ExportPanel from './ExportPanel'
import Icon, {ToolButton} from './Icon'
import {gates, labelled, componentName} from '../core/catalog.mjs'
import {
  History,
  emptyCircuit,
  item,
  key,
  splitKey,
  allKeys,
  parseCircuit,
  place,
  updateItem,
  removeSelection,
  moveSelection,
  duplicateSelection,
  uid,
} from '../core/model.mjs'
import {layout} from '../core/layout.mjs'
import {fromTeX} from '../core/tex.mjs'
import {getTemplate} from '../core/templates.mjs'
import {decode, SHARE_PREFIX} from '../core/share'
import {download, pickProject} from '../core/files'

const STORAGE = 'quantum-circuit-editor-v1'
function loadInitial() {
  try {
    if (window.location.hash.length > 1) return decode(window.location.hash.slice(1))
    const saved = localStorage.getItem(STORAGE)
    if (saved) return parseCircuit(saved)
  } catch (error) {
    console.warn('Could not restore the circuit:', error)
  }
  return getTemplate('teleportation').create()
}
const isGate = (id) => gates.some((g) => g.id === id)
const connectorHint = {
  ctrl: 'Drag from the control to its target wire',
  octrl: 'Drag from the control to its target wire',
  swap: 'Drag between the two wires to swap',
}

export default function App() {
  const t = useI18n()
  const {language, setLanguage} = useLocale()

  const initial = useRef(null)
  if (!initial.current) initial.current = loadInitial()
  const [circuit, setCircuit] = useState(initial.current),
    docRef = useRef(circuit)
  const history = useRef(new History(initial.current)),
    sceneRef = useRef()
  const [selection, setSelection] = useState([]),
    [tool, setTool] = useState('select'),
    [component, setComponent] = useState('H'),
    [lastGate, setLastGate] = useState('H'),
    [lastWire, setLastWire] = useState('c')
  const [libraryOpen, setLibraryOpen] = useState(true),
    [showGrid, setGrid] = useState(true),
    [panHeld, setPanHeld] = useState(false)
  const [fitToken, setFit] = useState(0),
    [cancelToken, setCancel] = useState(0),
    [zoom, setZoom] = useState(1),
    [zoomAction, setZoomAction] = useState(null)
  const [modal, setModal] = useState(null),
    [exportTab, setExportTab] = useState('tex'),
    [importText, setImportText] = useState(''),
    [toast, setToast] = useState(null),
    toastTimer = useRef()
  const [mathReady, setMathReady] = useState(Boolean(window.MathJax?.isReady))
  const [labelsVersion, setLabelsVersion] = useState(0)
  const L = useMemo(() => layout(circuit), [circuit, labelsVersion])

  const notify = (message, error = false) => {
    setToast({message: t(message), error})
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }
  const preview = (next) => {
    docRef.current = next
    setCircuit(next)
  }
  const commit = (next, nextSelection) => {
    const document = next || docRef.current
    history.current.push(document)
    preview(document)
    if (nextSelection) setSelection(nextSelection)
  }
  const restore = (next) => {
    preview(next)
    setSelection([])
    setCancel((x) => x + 1)
  }
  const undo = () => restore(history.current.undo()),
    redo = () => restore(history.current.redo())
  const deleteSelected = () => {
    commit(removeSelection(docRef.current, selection))
    setSelection((s) => s.filter((k) => k.startsWith('cell:')))
  }
  const duplicate = () => {
    const result = duplicateSelection(docRef.current, selection)
    commit(result.circuit, result.selection)
  }
  const choose = (id) => {
    setComponent(id)
    setTool('place')
    if (isGate(id)) setLastGate(id)
    if (id.startsWith('wire-')) setLastWire(id.slice(5))
  }
  // Focus at once, so typing straight after a click is never lost; a field
  // still disabled by the previous selection is focused after the next render.
  const editLabel = () => {
    const focus = () => {
      const input = document.getElementById('label-input')
      if (!input || input.disabled) return false
      input.focus()
      input.select()
      return true
    }
    if (!focus()) Promise.resolve().then(() => focus() || requestAnimationFrame(focus))
  }

  // The bottom label field edits whatever single thing is selected. On an
  // empty cell, typing creates a gate there.
  const [selectedKind, selectedID] = selection.length === 1 ? splitKey(selection[0]) : []
  const target = (() => {
    if (!selectedKind) return null
    if (selectedKind === 'item') {
      const i = circuit.items.find((x) => x.id === selectedID)
      return i && {kind: labelled.has(i.kind) ? 'item' : 'fixed', item: i, value: i.value}
    }
    if (selectedKind === 'input' || selectedKind === 'output') {
      const w = circuit.wires[Number(selectedID)]
      return w && {kind: selectedKind, row: Number(selectedID), value: w[selectedKind]}
    }
    if (selectedKind === 'slice') {
      const s = circuit.slices.find((x) => x.id === selectedID)
      return s && {kind: 'slice', value: s.value}
    }
    if (selectedKind === 'group') {
      const g = circuit.groups.find((x) => x.id === selectedID)
      return g && {kind: 'group', value: g.value}
    }
    if (selectedKind === 'cell') {
      const [row, col] = selectedID.split(':').map(Number)
      return {kind: 'cell', row, col, value: ''}
    }
    return null
  })()
  const setLabel = (value) => {
    const c = docRef.current
    if (!target) return
    if (target.kind === 'item') preview(updateItem(c, target.item.id, {value}))
    else if (target.kind === 'input' || target.kind === 'output')
      preview({
        ...c,
        wires: c.wires.map((w, r) =>
          r === target.row ? {...w, [target.kind]: value} : w,
        ),
      })
    else if (target.kind === 'slice')
      preview({
        ...c,
        slices: c.slices.map((s) => (s.id === selectedID ? {...s, value} : s)),
      })
    else if (target.kind === 'group')
      preview({
        ...c,
        groups: c.groups.map((g) => (g.id === selectedID ? {...g, value} : g)),
      })
    else if (target.kind === 'cell' && value.trim()) {
      const gate = item('gate', target.row, target.col, {value})
      preview(place(c, gate))
      setSelection([key('item', gate.id)])
    }
  }

  const insertTemplate = (template) => {
    commit(template.create(), [])
    setFit((x) => x + 1)
    setTool('select')
    notify(t('Opened {0} · undo to go back', t(template.name)))
  }
  const newDocument = () => {
    if (circuit.items.length) setModal('new')
    else {
      commit(emptyCircuit(), [])
      setFit((x) => x + 1)
    }
  }
  const importDocument = (text) => {
    try {
      const value = text.trim()
      let imported,
        warnings = []
      if (/\\begin\{(quantikz|tikzcd)\}/.test(value)) {
        const result = fromTeX(value)
        imported = result.circuit
        warnings = result.warnings
      } else if (value.startsWith('{')) imported = parseCircuit(value)
      else if (value.startsWith(SHARE_PREFIX))
        imported = decode(value.slice(SHARE_PREFIX.length))
      else
        imported = decode(
          value.includes('#') ? value.split('#').slice(1).join('#') : value,
        )
      commit(imported, [])
      setFit((x) => x + 1)
      setModal(null)
      setImportText('')
      if (warnings.length)
        notify(t('Circuit imported; skipped {0}', warnings.join(', ')), true)
      else notify(t('Circuit imported'))
    } catch (error) {
      notify(t('Import failed: {0}', t(error.message)), true)
    }
  }
  const openProject = async () => {
    try {
      const text = await pickProject()
      if (text) importDocument(text)
    } catch (error) {
      notify(error.message, true)
    }
  }
  const saveProject = () =>
    download(
      `${circuit.title.replace(/[\\/:*?"<>|]/g, '-') || 'circuit'}.circuit`,
      JSON.stringify(docRef.current, null, 2),
      'application/json',
    )
  const zoomBy = (factor) => setZoomAction({factor, id: uid('z')})

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(circuit))
      } catch (_) {
        /* project downloads remain available */
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [circuit])
  useEffect(() => {
    const ready = () => setMathReady(true)
    const measured = () => setLabelsVersion((x) => x + 1)
    if (window.MathJax?.isReady) ready()
    window.addEventListener('math-ready', ready)
    window.addEventListener('labels-measured', measured)
    return () => {
      window.removeEventListener('math-ready', ready)
      window.removeEventListener('labels-measured', measured)
    }
  }, [])
  useEffect(() => {
    const open = (event) => importDocument(event.detail)
    const hash = () => {
      if (window.location.hash.length > 1) importDocument(window.location.hash.slice(1))
    }
    window.addEventListener('native-open-project', open)
    window.addEventListener('hashchange', hash)
    return () => {
      window.removeEventListener('native-open-project', open)
      window.removeEventListener('hashchange', hash)
    }
  }, [])
  useEffect(() => {
    const command = (event) => {
      const actions = {
        undo,
        redo,
        save: saveProject,
        open: () => setModal('import'),
        new: newDocument,
        export: () => setModal('export'),
        selectAll: () => setSelection(allKeys(circuit)),
      }
      actions[event.detail]?.()
    }
    window.addEventListener('native-command', command)
    return () => window.removeEventListener('native-command', command)
  }, [circuit, selection])
  useEffect(() => {
    const down = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!modal) {
          setSelection([])
          setTool('select')
        }
        setModal(null)
        setCancel((x) => x + 1)
        return
      }
      const typing = event.target.closest(
        'input,textarea,select,[contenteditable="true"]',
      )
      const command = event.metaKey || event.ctrlKey,
        letter = event.key.toLowerCase()
      if (command && letter === 's') {
        event.preventDefault()
        saveProject()
        return
      }
      if (command && letter === 'e') {
        event.preventDefault()
        setModal('export')
        return
      }
      if (command && letter === 'o') {
        event.preventDefault()
        setModal('import')
        return
      }
      if (typing || modal) return
      if (event.key === ' ') {
        event.preventDefault()
        setPanHeld(true)
        return
      }
      if (command && letter === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      }
      if (command && letter === 'a') {
        event.preventDefault()
        setSelection(allKeys(circuit))
        return
      }
      if (command && letter === 'd') {
        event.preventDefault()
        duplicate()
        return
      }
      if (command || event.altKey) return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelected()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (target) editLabel()
        return
      }
      const directions = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
      }
      if (directions[event.key] && selection.length) {
        event.preventDefault()
        const [dr, dc] = directions[event.key]
        if (target?.kind === 'cell') {
          const row = Math.max(0, Math.min(circuit.rows - 1, target.row + dr)),
            col = Math.max(0, Math.min(circuit.cols - 1, target.col + dc))
          setSelection([key('cell', `${row}:${col}`)])
          return
        }
        const moved = moveSelection(circuit, selection, dr, dc)
        if (moved) commit(moved)
        return
      }
      const tools = {
        v: () => setTool('select'),
        p: () => setTool('pan'),
        g: () => choose(lastGate),
        c: () => choose('ctrl'),
        m: () => choose('meter'),
        w: () => choose('wire-' + lastWire),
        s: () => choose('slice'),
        b: () => choose('group'),
        f: () => setFit((x) => x + 1),
        h: () => setGrid((v) => !v),
      }
      if (tools[letter]) {
        tools[letter]()
        return
      }
      if (event.key === '?') setModal('help')
    }
    const up = (event) => {
      if (event.key === ' ') setPanHeld(false)
    }
    const blur = () => setPanHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [circuit, selection, modal, lastGate, lastWire, target])

  const hint =
    tool === 'pan' || panHeld
      ? t('Drag to pan the canvas')
      : tool === 'select'
        ? t('Click a cell and type a label · drag to select')
        : isGate(component)
          ? t('Click a cell to add the gate · drag across wires to span them')
          : connectorHint[component]
            ? t(connectorHint[component])
            : component.startsWith('wire-')
              ? t('Paint along a wire · Shift-click paints to its end')
              : component === 'slice'
                ? t('Click between two steps')
                : component === 'group'
                  ? t('Drag across the cells to group them')
                  : t('Click a cell · drag to repeat')
  const placeholder = !target
    ? hint
    : target.kind === 'fixed'
      ? t('{0} has no label', t(componentName(target.item.kind)))
      : target.kind === 'cell'
        ? t('Type a gate label, e.g. H, R_z(\\theta), U_f')
        : t('TeX label, e.g. \\ket{0}, \\theta, U^\\dagger')
  const openExport = (tab) => {
    setExportTab(tab)
    setModal('export')
  }
  const insets = {left: libraryOpen ? 296 : 72, right: 320, top: 92, bottom: 110}
  const active = (test) => tool === 'place' && test(component)
  return (
    <div class={`editor-app ${libraryOpen ? '' : 'library-collapsed'}`}>
      <section class="canvas-region">
        <Canvas
          circuit={circuit}
          L={L}
          selection={selection}
          onSelection={setSelection}
          tool={tool}
          component={component}
          panHeld={panHeld}
          showGrid={showGrid}
          insets={insets}
          onPreview={preview}
          onCommit={commit}
          onEditLabel={editLabel}
          fitToken={fitToken}
          zoomAction={zoomAction}
          cancelToken={cancelToken}
          sceneRef={sceneRef}
          onZoom={setZoom}
        />
      </section>
      <header class="brand">
        <div class="brand-name">
          <img src="./img/app-icon.svg" width="30" height="30" alt="" />
          <span>TikZ Quantum Circuit Editor</span>
        </div>
        <div class="document-title">
          <input
            aria-label={t('Circuit name')}
            value={circuit.title}
            onInput={(event) =>
              preview({...docRef.current, title: event.currentTarget.value})
            }
            onBlur={() => commit()}
          />
          <span class="save-indicator" title={t('Saved locally')}>
            <i />
          </span>
        </div>
      </header>
      <div class="global-toolbar toolbar" role="toolbar" aria-label={t('Project tools')}>
        <div class="toolbar-section">
          <ToolButton icon="new" label={t('New')} onClick={newDocument} />
          <ToolButton
            icon="import"
            label={t('Open')}
            shortcut="⌘O"
            onClick={() => setModal('import')}
          />
          <ToolButton icon="save" label={t('Save')} shortcut="⌘S" onClick={saveProject} />
        </div>
        <div class="toolbar-section">
          <ToolButton
            icon="undo"
            label={t('Undo')}
            shortcut="⌘Z"
            disabled={!history.current.canUndo}
            onClick={undo}
          />
          <ToolButton
            icon="redo"
            label={t('Redo')}
            shortcut="⇧⌘Z"
            disabled={!history.current.canRedo}
            onClick={redo}
          />
        </div>
        <div class="toolbar-section" role="group" aria-label={t('Drawing tools')}>
          <ToolButton
            icon="select"
            label={t('Select')}
            shortcut="V"
            active={tool === 'select'}
            onClick={() => setTool('select')}
          />
          <ToolButton
            icon="gate"
            label={t('Gate')}
            shortcut="G"
            active={active(isGate)}
            onClick={() => choose(lastGate)}
          />
          <ToolButton
            icon="control"
            label={t('Control')}
            shortcut="C"
            active={active((id) => id === 'ctrl' || id === 'octrl')}
            onClick={() => choose('ctrl')}
          />
          <ToolButton
            icon="measure"
            label={t('Measure')}
            shortcut="M"
            active={active((id) => id === 'meter')}
            onClick={() => choose('meter')}
          />
          <ToolButton
            icon="wire"
            label={t('Wire')}
            shortcut="W"
            active={active((id) => id.startsWith('wire-'))}
            onClick={() => choose('wire-' + lastWire)}
          />
          <ToolButton
            icon="pan"
            label={t('Pan')}
            shortcut="P"
            active={tool === 'pan'}
            onClick={() => setTool('pan')}
          />
        </div>
        <div class="toolbar-section">
          <ToolButton
            icon="trash"
            label={t('Delete')}
            shortcut="⌫"
            disabled={!selection.some((k) => !k.startsWith('cell:'))}
            onClick={deleteSelected}
          />
          <ToolButton
            icon="fit"
            label={t('Fit')}
            shortcut="F"
            onClick={() => setFit((x) => x + 1)}
          />
          <ToolButton
            icon="grid"
            label={t('Grid')}
            toggle
            shortcut="H"
            active={showGrid}
            onClick={() => setGrid((v) => !v)}
          />
        </div>
        <div class="toolbar-section">
          <ToolButton
            icon="help"
            label={t('Shortcuts')}
            shortcut="?"
            onClick={() => setModal('help')}
          />
        </div>
      </div>
      <button
        class="language-toggle"
        aria-label={t('Language')}
        onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      >
        <span class={language === 'en' ? 'active' : ''}>EN</span>
        <span class={language === 'zh' ? 'active' : ''}>中文</span>
      </button>
      {libraryOpen ? (
        <Library
          component={component}
          tool={tool}
          onComponent={choose}
          onTemplate={insertTemplate}
          onClose={() => setLibraryOpen(false)}
        />
      ) : (
        <button
          class="library-toggle"
          aria-label={t('Open library')}
          title={t('Open library')}
          onClick={() => setLibraryOpen(true)}
        >
          <Icon name="library" />
        </button>
      )}
      <Inspector
        circuit={circuit}
        selection={selection}
        onChange={commit}
        onSelection={setSelection}
        onDelete={deleteSelected}
        onDuplicate={duplicate}
      />
      <div class="label-input-container">
        <input
          id="label-input"
          class="label-input"
          aria-label={t('Math label')}
          spellcheck="false"
          autocomplete="off"
          disabled={!target || target.kind === 'fixed'}
          placeholder={placeholder}
          value={target && target.kind !== 'fixed' ? target.value : ''}
          onInput={(event) => setLabel(event.currentTarget.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.blur()
            }
          }}
        />
        {target && target.kind !== 'fixed' && <span class="label-kind">TeX</span>}
      </div>
      <div class="global export-bar" role="toolbar" aria-label={t('Export')}>
        <span class="export-caption">{t('Export')}</span>
        {[
          ['tex', 'LaTeX'],
          ['svg', 'SVG'],
          ['json', 'JSON'],
          ['link', t('Share link')],
        ].map(([id, name]) => (
          <button onClick={() => openExport(id)}>{name}</button>
        ))}
        <span class="zoom-controls">
          <button aria-label={t('Zoom out')} onClick={() => zoomBy(1 / 1.2)}>
            <Icon name="minus" size={15} />
          </button>
          <button
            class="zoom-number"
            title={t('Fit')}
            onClick={() => setFit((x) => x + 1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button aria-label={t('Zoom in')} onClick={() => zoomBy(1.2)}>
            <Icon name="plus" size={15} />
          </button>
        </span>
      </div>
      <footer class="app-status" aria-live="polite">
        {t('{0} wires · {1} steps', circuit.rows, circuit.cols)}
        {selection.length > 0 && ` · ${t('{0} selected', selection.length)}`}
        {!mathReady && ` · ${t('Loading math labels…')}`}
      </footer>
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          class={`toast ${toast.error ? 'error' : ''}`}
        >
          <Icon name={toast.error ? 'close' : 'check'} size={17} />
          {toast.message}
        </div>
      )}
      {modal === 'export' && (
        <ExportPanel
          initialTab={exportTab}
          circuit={circuit}
          L={L}
          sceneRef={sceneRef}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === 'import' && (
        <div class="modal-backdrop">
          <section
            class="import-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('Open circuit')}
          >
            <div class="modal-heading">
              <div>
                <h2>{t('Open circuit')}</h2>
                <p>
                  {t(
                    'Open a project file, or paste quantikz code, JSON or a share link.',
                  )}
                </p>
              </div>
              <button
                class="icon-button"
                aria-label={t('Close')}
                onClick={() => setModal(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <button class="secondary-button full-width" onClick={openProject}>
              <Icon name="import" />
              {t('Choose a .circuit, .json or .tex file')}
            </button>
            <textarea
              class="code-editor"
              aria-label={t('Circuit data')}
              placeholder={
                '\\begin{quantikz}\n& \\gate{H} & \\ctrl{1} & \\\\\n& & \\targ{} &\n\\end{quantikz}'
              }
              value={importText}
              onInput={(e) => setImportText(e.currentTarget.value)}
            />
            <div class="button-row justify-end">
              <button class="secondary-button" onClick={() => setModal(null)}>
                {t('Cancel')}
              </button>
              <button
                class="primary-button"
                disabled={!importText.trim()}
                onClick={() => importDocument(importText)}
              >
                {t('Open')}
              </button>
            </div>
          </section>
        </div>
      )}
      {modal === 'new' && (
        <div class="modal-backdrop">
          <section
            class="confirm-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('New circuit')}
          >
            <h2>{t('Start an empty circuit?')}</h2>
            <p>
              {t(
                'Save the current project first if you need it. Undo also brings it back.',
              )}
            </p>
            <div class="button-row justify-end">
              <button class="secondary-button" onClick={() => setModal(null)}>
                {t('Cancel')}
              </button>
              <button
                class="primary-button"
                onClick={() => {
                  commit(emptyCircuit(), [])
                  setFit((x) => x + 1)
                  setModal(null)
                  window.history.replaceState(
                    null,
                    '',
                    window.location.href.split('#')[0],
                  )
                }}
              >
                {t('New')}
              </button>
            </div>
          </section>
        </div>
      )}
      {modal === 'help' && (
        <div class="modal-backdrop">
          <section
            class="help-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('Shortcuts')}
          >
            <div class="modal-heading">
              <div>
                <h2>{t('Draw a little faster')}</h2>
                <p>
                  {t('Everything works with the mouse; the keyboard makes it quicker.')}
                </p>
              </div>
              <button
                class="icon-button"
                aria-label={t('Close')}
                onClick={() => setModal(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div class="help-grid">
              {[
                [t('Add a gate'), t('Click a cell, then type its label')],
                [t('Multi-qubit gate'), t('Gate tool: drag across wires')],
                [t('Controlled gate'), t('Control tool: drag to the target')],
                [t('Classical wire'), t('Wire tool: paint along a wire')],
                [t('Select / Pan'), 'V / P'],
                [t('Gate / Control / Measure'), 'G / C / M'],
                [t('Wire / Slice / Group'), 'W / S / B'],
                [t('Temporary pan'), t('Space + drag')],
                [t('Pan / Zoom'), t('Scroll / ⌘ + scroll')],
                [t('Multiselect'), t('Shift + click, or drag')],
                [t('Edit label'), t('Enter, or click again')],
                [t('Move selection'), t('Arrow keys, or drag')],
                [t('Duplicate steps'), '⌘D'],
                [t('Undo / Redo'), '⌘Z / ⇧⌘Z'],
                [t('Save / Open'), '⌘S / ⌘O'],
                [t('Export'), '⌘E'],
                [t('Fit / Grid'), 'F / H'],
                [t('Delete / Cancel'), 'Delete / Esc'],
              ].map(([label, shortcut]) => (
                <div>
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </div>
              ))}
            </div>
            <p class="fine-print">
              {t(
                'Use Ctrl instead of ⌘ on Windows and Linux. Labels are TeX math; \\ket, \\bra and \\braket work as in quantikz.',
              )}
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
