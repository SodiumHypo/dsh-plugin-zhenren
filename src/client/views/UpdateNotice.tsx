/**
 * Update-notice dock pill (D20/D24, F4).
 *
 * Runs the single bounded runtime network exemption on mount: at most one GET of
 * public registry metadata per local day, only when the user has left the check
 * enabled, silent on any failure, uploading nothing. When the registry's latest
 * version is newer than the build-time version, it shows a quiet pill linking to
 * the package page. It only ever prompts — it never downloads, installs, or
 * auto-updates (D24). When there is nothing newer, it renders nothing.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { localDate } from '../daily-state.js'
import {
  readSettings,
  readUpdateCache,
  registryUrl,
  writeUpdateCache,
} from '../settings-state.js'
import { fetchLatestVersion, isNewerVersion, shouldCheckUpdate } from '../update-check.js'
import * as styles from './styles.js'

type UpdateNoticeProps = PropsLocale<'zhenren'>

/** Canonical package page; the pill links here, it never installs anything. */
const NPM_PACKAGE_PAGE = 'https://www.npmjs.com/package/dsh-plugin-zhenren'

/**
 * Render the update notice, or nothing when no newer version is known.
 * @param props - the zhenren locale seat (the dock's other props are unused).
 */
export function UpdateNotice(props: UpdateNoticeProps): ReactElement | null {
  const { t } = props
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    const storage = localStorage
    const settings = readSettings(storage)
    if (!settings.updateCheck) return
    const date = localDate(new Date())
    let cache = readUpdateCache(storage)
    let alive = true

    const resolve = (version: string | null): void => {
      if (!alive) return
      if (version !== null && isNewerVersion(__ZHENREN_VERSION__, version)) setLatest(version)
    }

    if (shouldCheckUpdate(cache, date, settings)) {
      fetchLatestVersion(registryUrl(settings)).then(
        (version) => {
          cache = { checkedAt: date, latest: version }
          writeUpdateCache(storage, cache)
          resolve(version)
        },
        () => resolve(null),
      )
    } else {
      resolve(cache?.latest ?? null)
    }

    return () => {
      alive = false
    }
  }, [])

  if (latest === null) return null

  return (
    <a
      href={NPM_PACKAGE_PAGE}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...styles.dockStyle, textDecoration: 'none', cursor: 'pointer' }}
      data-plugin="zhenren"
      data-update={latest}
      title={t('update.available', { v: latest })}
    >
      <span style={styles.dockLabelStyle}>{t('update.title')}</span>
      <span style={styles.dockNoteStyle}>{t('update.available', { v: latest })}</span>
      <span style={styles.dockProgressStyle}>{t('update.action')} →</span>
    </a>
  )
}