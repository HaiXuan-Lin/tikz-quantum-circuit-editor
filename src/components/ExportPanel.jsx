import {useI18n} from './I18n'
import {h} from 'preact'
import {useState} from 'preact/hooks'
import {toTeX, PREAMBLE} from '../core/tex.mjs'
import {bounds} from '../core/layout.mjs'
import {shareURL, encode} from '../core/share'
import {copyText, download, svgDocument} from '../core/files'
import Icon from './Icon'

export default function ExportPanel({
  circuit,
  L,
  sceneRef,
  onClose,
  notify,
  initialTab = 'tex',
}) {
  const t = useI18n()
  const [tab, setTab] = useState(initialTab),
    [standalone, setStandalone] = useState(false),
    [background, setBackground] = useState(true)
  const link = shareURL(circuit)
  const code =
    tab === 'tex'
      ? toTeX(circuit, {
          standalone,
          shareURL: standalone && window.location.protocol !== 'file:' ? link : '',
        })
      : tab === 'json'
        ? JSON.stringify(circuit, null, 2)
        : link
  const filename = circuit.title.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'circuit'
  const copy = async (text = code) => {
    try {
      await copyText(text)
      notify(t('Copied to the clipboard'))
    } catch (error) {
      notify(error.message, true)
    }
  }
  const save = async () => {
    try {
      if (tab === 'svg') {
        if (!window.MathJax?.Hub)
          throw new Error(t('Math labels are still loading; try the SVG again shortly.'))
        await new Promise((resolve) => MathJax.Hub.Queue(resolve))
        const content = svgDocument(
          sceneRef.current,
          bounds(circuit, L, 16),
          circuit.title,
          background,
        )
        download(`${filename}.svg`, content, 'image/svg+xml')
      } else
        download(
          `${filename}.${tab === 'tex' ? 'tex' : 'circuit'}`,
          code,
          tab === 'tex' ? 'text/plain' : 'application/json',
        )
    } catch (error) {
      notify(error.message, true)
    }
  }
  return (
    <div
      class="modal-backdrop"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <section
        class="export-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('Export circuit')}
      >
        <div class="modal-heading">
          <div>
            <h2>{t('Export circuit')}</h2>
            <p>{t('From the canvas to your paper.')}</p>
          </div>
          <button class="icon-button" aria-label={t('Close export')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="export-tabs">
          {[
            ['tex', 'LaTeX'],
            ['svg', 'SVG'],
            ['json', t('Project JSON')],
            ['link', t('Share link')],
          ].map(([id, name]) => (
            <button class={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {name}
            </button>
          ))}
        </div>
        {tab === 'tex' && !standalone && (
          <div class="preamble-bar">
            <span>{t('Preamble')}</span>
            <code>{PREAMBLE.replace('\n', ' ')}</code>
            <button class="secondary-button" onClick={() => copy(PREAMBLE)}>
              <Icon name="copy" size={14} />
              {t('Copy')}
            </button>
          </div>
        )}
        {tab === 'svg' ? (
          <div class="svg-export-info">
            <Icon name="export" size={36} />
            <h3>{t('Scalable vector graphic')}</h3>
            <p>
              {t(
                'Wires, gates and math labels are exported as vectors with embedded glyphs, ready for slides and papers.',
              )}
            </p>
            <label class="check-field">
              <input
                type="checkbox"
                checked={background}
                onChange={(ev) => setBackground(ev.currentTarget.checked)}
              />
              {t('White background')}
            </label>
          </div>
        ) : (
          <textarea
            aria-label={t('Export content')}
            class={`code-editor${tab === 'tex' && !standalone ? ' short' : ''}`}
            value={code}
            readonly
            spellcheck="false"
          />
        )}
        <div class="export-footer">
          <div>
            {tab === 'tex' && (
              <label class="check-field">
                <input
                  type="checkbox"
                  checked={standalone}
                  onChange={(ev) => setStandalone(ev.currentTarget.checked)}
                />
                {t('Complete LaTeX document')}
              </label>
            )}
            {tab === 'link' && (
              <small>
                {window.location.protocol === 'file:'
                  ? t('Paste this into Open on another device to restore the circuit.')
                  : t('Anyone with the link opens this circuit in the editor.')}
              </small>
            )}
          </div>
          <div class="button-row">
            {tab !== 'svg' && (
              <button class="secondary-button" onClick={() => copy()}>
                <Icon name="copy" />
                {t('Copy')}
              </button>
            )}
            {tab !== 'link' && (
              <button class="primary-button" onClick={save}>
                <Icon name="export" />
                {t('Download')}
                {tab === 'svg' ? ' SVG' : ''}
              </button>
            )}
            {tab === 'link' && window.location.protocol !== 'file:' && (
              <button
                class="primary-button"
                onClick={() => {
                  window.history.replaceState(null, '', `#${encode(circuit)}`)
                  notify(t('Circuit saved to the address bar'))
                }}
              >
                {t('Save to URL')}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
