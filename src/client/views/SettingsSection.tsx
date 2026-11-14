/**
 * 甲骨贞人 settings section (CLAUDE.md §4.8, D24, D27, F4).
 *
 * A dedicated `settings.section` page (its own tab in the settings nav rail):
 * the bounded update-check toggle (D20), the registry choice (npmjs /
 * npmmirror / custom), and a two-step 「清除本地配置」 that removes only this
 * plugin's `zhenren.*` localStorage keys — never the cordis profile or another
 * plugin's state. All state lives outside the package, so an overwrite update
 * preserves it (D24).
 *
 * The page inherits the host settings panel's theme and content-column
 * padding (no forced background or palette): it is a form, not a ritual card.
 * The shell owns nav chrome and the close affordance; the section draws its
 * own heading and controls. The runtime `close` prop is intentionally unused.
 */
import { useState, type CSSProperties, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DEFAULT_SETTINGS,
  clearZhenrenStorage,
  readSettings,
  writeSettings,
  type RegistryChoice,
  type ZhenrenSettings,
} from '../settings-state.js'

type SettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'zhenren'>

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '4px 0',
  color: 'inherit',
  fontSize: 13,
  lineHeight: 1.6,
}

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.04em',
}

const lineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

const labelStyle: CSSProperties = {
  flex: '0 0 auto',
  minWidth: 96,
}

const hintStyle: CSSProperties = {
  opacity: 0.66,
  fontSize: 12,
}

const controlStyle: CSSProperties = {
  font: 'inherit',
  color: 'inherit',
  background: 'transparent',
  border: '1px solid currentColor',
  borderColor: 'color-mix(in srgb, currentColor 35%, transparent)',
  borderRadius: 6,
  padding: '4px 8px',
}

const buttonStyle: CSSProperties = {
  ...controlStyle,
  cursor: 'pointer',
  minHeight: 32,
}

const dangerStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: 'color-mix(in srgb, #b3402f 60%, transparent)',
  color: '#b3402f',
}

function storage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

/**
 * Render the 甲骨贞人 settings page.
 * @param props - the section runtime share (unused) plus the zhenren locale seat.
 */
export function SettingsSection(props: SettingsSectionProps): ReactElement {
  const { t } = props
  const [settings, setSettings] = useState<ZhenrenSettings>(() => readSettings(storage()))
  const [confirming, setConfirming] = useState(false)
  const [cleared, setCleared] = useState(false)

  const update = (patch: Partial<ZhenrenSettings>): void => {
    const next = { ...settings, ...patch }
    writeSettings(storage(), next)
    setSettings(next)
    setCleared(false)
  }

  const onClear = (): void => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    clearZhenrenStorage(storage())
    setSettings({ ...DEFAULT_SETTINGS })
    setConfirming(false)
    setCleared(true)
  }

  return (
    <div style={rowStyle} data-plugin="zhenren" data-settings="zhenren">
      <div style={lineStyle}>
        <span style={titleStyle}>{t('settings.title')}</span>
        <span style={hintStyle}>{t('settings.version', { v: __ZHENREN_VERSION__ })}</span>
      </div>

      <div style={lineStyle}>
        <label style={labelStyle} htmlFor="zhenren-update-check">
          {t('settings.updateCheck')}
        </label>
        <input
          id="zhenren-update-check"
          type="checkbox"
          checked={settings.updateCheck}
          onChange={(event) => update({ updateCheck: event.target.checked })}
        />
        <span style={hintStyle}>{t('settings.updateCheckHint')}</span>
      </div>

      <div style={lineStyle}>
        <label style={labelStyle} htmlFor="zhenren-registry">
          {t('settings.registry')}
        </label>
        <select
          id="zhenren-registry"
          style={controlStyle}
          value={settings.registry}
          disabled={!settings.updateCheck}
          onChange={(event) => update({ registry: event.target.value as RegistryChoice })}
        >
          <option value="npmjs">{t('settings.registry.npmjs')}</option>
          <option value="npmmirror">{t('settings.registry.npmmirror')}</option>
          <option value="custom">{t('settings.registry.custom')}</option>
        </select>
        {settings.registry === 'custom' ? (
          <input
            type="url"
            style={{ ...controlStyle, flex: 1, minWidth: 220 }}
            aria-label={t('settings.customRegistry')}
            placeholder={t('settings.customRegistryPlaceholder')}
            value={settings.customRegistry}
            disabled={!settings.updateCheck}
            onChange={(event) => update({ customRegistry: event.target.value })}
          />
        ) : null}
      </div>

      <div style={lineStyle}>
        {confirming ? (
          <>
            <span style={hintStyle}>{t('settings.clearConfirm')}</span>
            <button type="button" style={dangerStyle} onClick={onClear}>
              {t('settings.clearConfirmAction')}
            </button>
            <button type="button" style={buttonStyle} onClick={() => setConfirming(false)}>
              {t('settings.clearCancel')}
            </button>
          </>
        ) : (
          <button type="button" style={buttonStyle} onClick={onClear}>
            {t('settings.clear')}
          </button>
        )}
        {cleared ? <span style={hintStyle}>{t('settings.cleared')}</span> : null}
      </div>
    </div>
  )
}