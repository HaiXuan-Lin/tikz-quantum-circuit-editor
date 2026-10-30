import {useI18n} from './I18n'
import {h, Fragment} from 'preact'
import {useMemo, useState} from 'preact/hooks'
import {gates, elements, wireTypes, annotations, LINE} from '../core/catalog.mjs'
import {templates} from '../core/templates.mjs'
import {layout, bounds, shape} from '../core/layout.mjs'
import {item} from '../core/model.mjs'
import CircuitScene, {ItemShape, horizontal} from './CircuitScene'
import Icon from './Icon'

// An element on a short wire that stops at its edges, drawn in the text colour.
export function ElementPreview({element, width = 64}) {
  const s = shape(element),
    half = Math.max(width, s.width + 16) / 2
  const wire =
    element.kind === 'ground' || element.kind === 'trash'
      ? horizontal('q', -half, -s.left, 0)
      : horizontal('q', -half, -s.left, 0) + horizontal('q', s.right, half, 0)
  const link = element.link && `M0 0V${element.link > 0 ? 26 : -26}`
  return (
    <svg
      class="element-preview"
      viewBox={`${-half} -26 ${2 * half} 52`}
      aria-hidden="true"
      stroke="currentColor"
      fill="none"
      stroke-width={LINE}
    >
      {link && <path d={link} />}
      <path d={wire} />
      <ItemShape item={element} x={0} y={0} paper="none" />
    </svg>
  )
}
export function WirePreview({type}) {
  return (
    <svg
      class="element-preview"
      viewBox="-32 -26 64 52"
      aria-hidden="true"
      stroke="currentColor"
      fill="none"
      stroke-width={LINE}
    >
      {type === 'n' ? (
        <path d="M-26 0H26" stroke-dasharray="2 4" opacity="0.5" />
      ) : (
        <path d={horizontal(type, -26, 26, 0)} />
      )}
    </svg>
  )
}
function AnnotationPreview({id}) {
  return (
    <svg
      class="element-preview"
      viewBox="-32 -26 64 52"
      aria-hidden="true"
      stroke="currentColor"
      fill="none"
      stroke-width={LINE}
    >
      <path d="M-30 -9H30M-30 9H30" opacity="0.6" />
      {id === 'slice' ? (
        <path d="M0 -22V22" stroke-dasharray="5 3" />
      ) : (
        <rect x="-18" y="-19" width="36" height="38" rx="4" stroke-dasharray="4 3" />
      )}
    </svg>
  )
}
function TemplatePreview({template}) {
  const circuit = useMemo(() => template.create(), [template])
  const L = layout(circuit),
    box = bounds(circuit, L, 12)
  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      class="template-preview"
      aria-hidden="true"
    >
      <CircuitScene circuit={circuit} L={L} ink="currentColor" paper="none" />
    </svg>
  )
}

export default function Library({component, tool, onComponent, onTemplate, onClose}) {
  const t = useI18n()
  const [tab, setTab] = useState('components')
  const [query, setQuery] = useState('')
  const active = (id) => tool === 'place' && component === id
  const card = (id, name, preview, description, key) => (
    <button
      class={`component-card ${active(id) ? 'selected' : ''}`}
      aria-label={t(name)}
      aria-pressed={active(id)}
      title={key ? `${t(name)} (${key})` : t(name)}
      onClick={() => onComponent(id)}
    >
      {preview}
      <span>{t(name)}</span>
      {description && <small>{t(description)}</small>}
    </button>
  )
  return (
    <aside class="panel library-panel" aria-label={t('Library')}>
      <div class="panel-heading">
        <span>
          <Icon name="library" />
          {t('Library')}
        </span>
        <button class="icon-button" aria-label={t('Close library')} onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <div class="panel-tabs">
        <button
          class={tab === 'components' ? 'active' : ''}
          onClick={() => setTab('components')}
        >
          {t('Components')}
        </button>
        <button
          class={tab === 'templates' ? 'active' : ''}
          onClick={() => setTab('templates')}
        >
          {t('Templates')}
          <span>{templates.length}</span>
        </button>
      </div>
      <div class="panel-scroll">
        {tab === 'components' ? (
          <>
            <div class="section-label">
              {t('Gates')}
              <span>{t('Drag across wires to span')}</span>
            </div>
            <div class="gate-grid">
              {gates.map((g) => (
                <button
                  class={`gate-card ${active(g.id) ? 'selected' : ''}`}
                  aria-label={t('Gate {0}', g.value)}
                  aria-pressed={active(g.id)}
                  title={g.value}
                  onClick={() => onComponent(g.id)}
                >
                  <ElementPreview
                    element={item('gate', 0, 0, {value: g.value})}
                    width={40}
                  />
                </button>
              ))}
            </div>
            <div class="section-label">
              {t('Elements')}
              <span>{t('Click a cell')}</span>
            </div>
            <div class="component-grid">
              {elements.map((e) =>
                card(
                  e.id,
                  e.name,
                  <ElementPreview element={item(e.id, 0, 0)} />,
                  null,
                  e.key,
                ),
              )}
            </div>
            <div class="section-label">
              {t('Wire types')}
              <span>{t('Paint along a wire')}</span>
            </div>
            <div class="component-grid wires">
              {wireTypes.map((w) =>
                card('wire-' + w.id, w.name, <WirePreview type={w.id} />, null, null),
              )}
            </div>
            <div class="section-label">{t('Annotations')}</div>
            <div class="component-grid annotations">
              {annotations.map((a) =>
                card(a.id, a.name, <AnnotationPreview id={a.id} />, a.description, a.key),
              )}
            </div>
            <div class="library-tip">
              <Icon name="control" />
              <p>
                {t(
                  'Drag from a control to its target to draw a controlled gate. Shift-click paints a wire to its end.',
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <input
              class="search-input"
              placeholder={t('Search templates…')}
              aria-label={t('Search templates')}
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <div class="template-list">
              {templates
                .filter((template) =>
                  `${t(template.name)} ${t(template.category)} ${t(template.subtitle)}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((template) => (
                  <button
                    class="template-card"
                    aria-label={t('Open template {0}', t(template.name))}
                    onClick={() => onTemplate(template)}
                  >
                    <TemplatePreview template={template} />
                    <span class="template-info">
                      <b>{t(template.name)}</b>
                      <small>{t(template.subtitle)}</small>
                    </span>
                    <span class="template-category">{t(template.category)}</span>
                  </button>
                ))}
            </div>
            <p class="fine-print">
              {t('A template replaces the current circuit; undo brings it back.')}
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
