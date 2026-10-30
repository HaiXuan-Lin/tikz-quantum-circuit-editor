import {useI18n} from './I18n'
import {h, Fragment} from 'preact'
import {useEffect, useState} from 'preact/hooks'
import {meterStyles, wireTypes, spans, componentName} from '../core/catalog.mjs'
import {
  splitKey,
  spanOf,
  updateItem,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  setWireFrom,
  resize,
  normalize,
} from '../core/model.mjs'
import {PREAMBLE} from '../core/tex.mjs'
import Icon from './Icon'
import {ElementPreview} from './Library'

function Field({label, children, hint}) {
  return (
    <div class="field" role="group" aria-label={label}>
      <span class="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  )
}
function Stepper({label, value, min = 1, max = 999, onChange}) {
  return (
    <div class="stepper">
      <button
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="minus" size={14} />
      </button>
      <output aria-label={label}>{value}</output>
      <button
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}
function Segmented({options, value, onChange, columns}) {
  return (
    <div
      class={`segmented${columns ? ' grid' : ''}`}
      style={columns ? `--columns:${columns}` : ''}
    >
      {options.map(([id, name]) => (
        <button class={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          {name}
        </button>
      ))}
    </div>
  )
}
// Lengths in centimetres; an empty field keeps the quantikz default.
function LengthField({label, value, placeholder, onChange}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  const apply = () => {
    const text = draft.trim()
    if (!text) return onChange(null)
    const n = Number(text)
    if (Number.isFinite(n) && n >= 0 && n <= 10) onChange(n)
    else setDraft(value == null ? '' : String(value))
  }
  return (
    <Field label={label} hint="cm">
      <input
        aria-label={label}
        type="number"
        min="0"
        max="10"
        step="0.1"
        placeholder={placeholder}
        value={draft}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </Field>
  )
}
function Action({icon, label, onClick, danger, disabled}) {
  return (
    <button
      class={`secondary-button${danger ? ' danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={15} />}
      {label}
    </button>
  )
}

export default function Inspector({
  circuit: c,
  selection,
  onChange,
  onSelection,
  onDelete,
  onDuplicate,
}) {
  const t = useI18n()
  const wireTypeOptions = wireTypes.map((w) => [w.id, t(w.name)])
  const structure = (row, col) => (
    <>
      {row != null && (
        <>
          <div class="section-label">{t('Wire {0}', row + 1)}</div>
          <div class="section-actions">
            <Action
              icon="rowAbove"
              label={t('Insert above')}
              onClick={() => onChange(insertRow(c, row), [])}
            />
            <Action
              icon="rowBelow"
              label={t('Insert below')}
              onClick={() => onChange(insertRow(c, row + 1), [])}
            />
            <Action
              icon="trash"
              label={t('Delete wire')}
              danger
              disabled={c.rows <= 1}
              onClick={() => onChange(deleteRow(c, row), [])}
            />
          </div>
        </>
      )}
      {col != null && (
        <>
          <div class="section-label">{t('Step {0}', col + 1)}</div>
          <div class="section-actions">
            <Action
              icon="colBefore"
              label={t('Insert before')}
              onClick={() => onChange(insertColumn(c, col), [])}
            />
            <Action
              icon="colAfter"
              label={t('Insert after')}
              onClick={() => onChange(insertColumn(c, col + 1), [])}
            />
            <Action
              icon="trash"
              label={t('Delete step')}
              danger
              disabled={c.cols <= 1}
              onClick={() => onChange(deleteColumn(c, col), [])}
            />
          </div>
        </>
      )}
    </>
  )

  let title = t('Circuit'),
    body
  const [kind, id] = selection.length === 1 ? splitKey(selection[0]) : [null, null]
  if (selection.length > 1) {
    title = t('{0} selected', selection.length)
    body = (
      <>
        <p class="fine-print">{t('Drag any of them to move them together.')}</p>
        <div class="inspector-actions">
          <Action icon="duplicate" label={t('Duplicate')} onClick={onDuplicate} />
          <Action icon="trash" label={t('Delete')} danger onClick={onDelete} />
        </div>
      </>
    )
  } else if (kind === 'item' && c.items.find((i) => i.id === id)) {
    const i = c.items.find((x) => x.id === id)
    const update = (changes) => onChange(updateItem(c, i.id, changes))
    title = t(componentName(i.kind === 'gate' ? 'H' : i.kind))
    const otherRows = Array.from({length: c.rows}, (_, r) => r).filter(
      (r) => r < i.row || r >= i.row + spanOf(i),
    )
    body = (
      <>
        <div class="selected-element">
          <ElementPreview element={i} />
          <span>
            {t('Wire {0} · step {1}', i.row + 1, i.col + 1)}
            {i.value && <code>{i.value}</code>}
          </span>
        </div>
        {(i.kind === 'ctrl' || i.kind === 'octrl') && (
          <Field label={t('Control')}>
            <Segmented
              options={[
                ['ctrl', t('Filled dot')],
                ['octrl', t('Open dot')],
              ]}
              value={i.kind}
              onChange={(kind) => update({kind})}
            />
          </Field>
        )}
        {i.kind === 'meter' && (
          <Field label={t('Style')}>
            <Segmented
              columns={3}
              options={meterStyles.map((m) => [m.id, t(m.name)])}
              value={i.variant}
              onChange={(variant) =>
                update({variant, span: spans({...i, variant}) ? i.span : 1})
              }
            />
          </Field>
        )}
        {spans(i) && (
          <Field label={t('Wires covered')}>
            <Stepper
              label={t('Wires covered')}
              value={i.span}
              max={c.rows - i.row}
              onChange={(span) => update({span})}
            />
          </Field>
        )}
        <Field
          label={
            ['ctrl', 'octrl'].includes(i.kind)
              ? t('Target')
              : i.kind === 'swap'
                ? t('Swap with')
                : t('Vertical wire')
          }
          hint={!i.link ? t('or drag the blue handle') : null}
        >
          <select
            aria-label={t('Vertical wire')}
            value={i.link ? String(i.row + i.link) : ''}
            onChange={(e) => {
              const value = e.currentTarget.value
              update({link: value === '' ? 0 : Number(value) - i.row})
            }}
          >
            <option value="">{t('None')}</option>
            {otherRows.map((r) => (
              <option value={String(r)}>{t('Wire {0}', r + 1)}</option>
            ))}
          </select>
        </Field>
        {i.link !== 0 && (
          <Field label={t('Vertical wire type')}>
            <Segmented
              options={[
                ['q', t('Quantum')],
                ['c', t('Classical')],
              ]}
              value={i.linkType}
              onChange={(linkType) => update({linkType})}
            />
          </Field>
        )}
        <div class="inspector-actions">
          <Action icon="duplicate" label={t('Duplicate')} onClick={onDuplicate} />
          <Action icon="trash" label={t('Delete')} danger onClick={onDelete} />
        </div>
        {structure(i.row, i.col)}
      </>
    )
  } else if (kind === 'cell') {
    const [row, col] = id.split(':').map(Number)
    title = t('Empty cell')
    body = (
      <>
        <p class="fine-print">
          {t('Type a label to put a gate here, or pick a component from the library.')}
        </p>
        <Field label={t('Wire from here')}>
          <Segmented
            options={wireTypeOptions}
            value={c.wires[row]?.segments[col]}
            onChange={(type) => onChange(setWireFrom(c, row, col, type))}
          />
        </Field>
        {structure(row, col)}
      </>
    )
  } else if ((kind === 'input' || kind === 'output') && c.wires[Number(id)]) {
    const row = Number(id),
      w = c.wires[row],
      side = kind
    title = side === 'input' ? t('Input label') : t('Output label')
    const segment = side === 'input' ? 0 : c.cols
    body = (
      <>
        <Field label={t('Wires covered')} hint={t('Brace')}>
          <Stepper
            label={t('Wires covered')}
            value={w[side + 'Span']}
            max={c.rows - row}
            onChange={(span) =>
              onChange({
                ...c,
                wires: c.wires.map((x, r) =>
                  r === row ? {...x, [side + 'Span']: span} : x,
                ),
              })
            }
          />
        </Field>
        <Field label={side === 'input' ? t('Wire at the start') : t('Wire at the end')}>
          <Segmented
            options={wireTypeOptions}
            value={w.segments[segment]}
            onChange={(type) =>
              onChange({
                ...c,
                wires: c.wires.map((x, r) =>
                  r === row
                    ? {
                        ...x,
                        segments: x.segments.map((s, k) => (k === segment ? type : s)),
                      }
                    : x,
                ),
              })
            }
          />
        </Field>
        {structure(row, null)}
      </>
    )
  } else if (kind === 'slice' && c.slices.find((s) => s.id === id)) {
    const s = c.slices.find((x) => x.id === id)
    title = t('Slice')
    body = (
      <>
        <Field label={t('After step')}>
          <Stepper
            label={t('After step')}
            value={s.col + 1}
            min={0}
            max={c.cols}
            onChange={(n) => {
              if (c.slices.some((x) => x.col === n - 1)) return
              onChange({
                ...c,
                slices: c.slices.map((x) => (x.id === id ? {...x, col: n - 1} : x)),
              })
            }}
          />
        </Field>
        <div class="inspector-actions">
          <Action icon="trash" label={t('Delete')} danger onClick={onDelete} />
        </div>
      </>
    )
  } else if (kind === 'group' && c.groups.find((g) => g.id === id)) {
    const g = c.groups.find((x) => x.id === id)
    const update = (changes) =>
      onChange(
        normalize({
          ...c,
          groups: c.groups.map((x) => (x.id === id ? {...x, ...changes} : x)),
        }),
      )
    title = t('Group')
    body = (
      <>
        <div class="two-columns">
          <Field label={t('Wires')}>
            <Stepper
              label={t('Wires')}
              value={g.rows}
              max={c.rows - g.row}
              onChange={(rows) => update({rows})}
            />
          </Field>
          <Field label={t('Steps')}>
            <Stepper
              label={t('Steps')}
              value={g.cols}
              max={c.cols - g.col}
              onChange={(cols) => update({cols})}
            />
          </Field>
        </div>
        <Field label={t('Border')}>
          <Segmented
            options={[
              [true, t('Dashed')],
              [false, t('Solid')],
            ]}
            value={g.dashed}
            onChange={(dashed) => update({dashed})}
          />
        </Field>
        <div class="inspector-actions">
          <Action icon="trash" label={t('Delete')} danger onClick={onDelete} />
        </div>
      </>
    )
  } else {
    const count = c.items.length
    body = (
      <>
        <p class="fine-print">
          {t('{0} wires · {1} steps · {2} elements', c.rows, c.cols, count)}
        </p>
        <div class="two-columns">
          <Field label={t('Wires')}>
            <Stepper
              label={t('Wires')}
              value={c.rows}
              max={64}
              onChange={(rows) => onChange(resize(c, rows, c.cols), [])}
            />
          </Field>
          <Field label={t('Steps')}>
            <Stepper
              label={t('Steps')}
              value={c.cols}
              max={200}
              onChange={(cols) => onChange(resize(c, c.rows, cols), [])}
            />
          </Field>
        </div>
        <div class="section-label">{t('Spacing')}</div>
        <div class="two-columns">
          <LengthField
            label={t('Wire spacing')}
            placeholder={t('auto')}
            value={c.options.rowSep}
            onChange={(rowSep) => onChange({...c, options: {...c.options, rowSep}})}
          />
          <LengthField
            label={t('Column gap')}
            placeholder="0.5"
            value={c.options.columnSep}
            onChange={(columnSep) => onChange({...c, options: {...c.options, columnSep}})}
          />
        </div>
        <label class="check-field">
          <input
            type="checkbox"
            checked={c.options.thinLines}
            onChange={(e) =>
              onChange({
                ...c,
                options: {...c.options, thinLines: e.currentTarget.checked},
              })
            }
          />
          {t('Thin lines')}
        </label>
        <div class="section-label">{t('Preamble')}</div>
        <pre class="preamble">{PREAMBLE}</pre>
        <p class="fine-print">
          {t(
            'Select a cell to insert or delete wires and steps. Wire spacing is measured between wires.',
          )}
        </p>
      </>
    )
  }
  return (
    <aside class="panel inspector-panel" aria-label={t('Inspector')}>
      <div class="panel-heading">
        <span>{title}</span>
        <span class="selection-count">
          {selection.length ? t('Selected') : t('Nothing selected')}
        </span>
      </div>
      <div class="panel-scroll">{body}</div>
    </aside>
  )
}
