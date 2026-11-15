import { Bell, BellOff, Send, Save } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { defaultNotificationSettings } from '../shared/notification-defaults.js'
import { pushNotificationsAvailable } from './client.js'

const events = [
  ['disconnect', 'Disconnect or kick'],
  ['directMessage', 'Incoming direct message'],
  ['death', 'Death'],
  ['lowHealth', 'Low health', 'healthThreshold', 20, 'HP'],
  ['lowHunger', 'Low hunger', 'hungerThreshold', 20, 'food'],
  ['lowAir', 'Low air', 'airThreshold', 20, 'air'],
  ['nearbyPlayer', 'Nearby player', 'nearbyDistance', 256, 'blocks']
]

function applicationKey(value) {
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)), character => character.charCodeAt(0))
}

function matchesKey(subscription, publicKey) {
  if (!subscription.options.applicationServerKey) return false
  const existing = new Uint8Array(subscription.options.applicationServerKey)
  const expected = applicationKey(publicKey)
  return existing.length === expected.length && existing.every((value, index) => value === expected[index])
}

export default function NotificationsView({ bot, settings, publicKey, connection, sendAction }) {
  const [draft, setDraft] = useState(settings || defaultNotificationSettings)
  const [previousSettings, setPreviousSettings] = useState(settings)
  const [subscription, setSubscription] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const supported = pushNotificationsAvailable()

  if (settings !== previousSettings) {
    setPreviousSettings(settings)
    setDraft(settings || defaultNotificationSettings)
  }
  const syncDevice = useEffectEvent(async () => {
    if (!supported || !publicKey || connection !== 'online') return
    try {
      const registration = await navigator.serviceWorker.register('/push-service-worker.js')
      let current = await registration.pushManager.getSubscription()
      if (current && (Notification.permission !== 'granted' || !matchesKey(current, publicKey))) {
        await sendAction('notifications:unsubscribe', { endpoint: current.endpoint })
        await current.unsubscribe()
        current = null
      }
      if (current && Notification.permission === 'granted') {
        await sendAction('notifications:subscribe', { subscription: current.toJSON() })
        setSubscription(current)
      } else setSubscription(null)
    } catch (failure) { setError(failure.message || 'Unable to check this device') }
  })
  useEffect(() => { void Promise.resolve().then(() => syncDevice()) }, [publicKey, connection])

  async function run(action) {
    setBusy(true)
    setError('')
    setMessage('')
    try { await action() } catch (failure) { setError(failure.message || 'Notification action failed') }
    finally { setBusy(false) }
  }

  async function enableDevice() {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notification permission was not granted')
    const registration = await navigator.serviceWorker.register('/push-service-worker.js')
    let current = await registration.pushManager.getSubscription()
    if (current && !matchesKey(current, publicKey)) {
      await sendAction('notifications:unsubscribe', { endpoint: current.endpoint })
      await current.unsubscribe()
      current = null
    }
    current ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) })
    await sendAction('notifications:subscribe', { subscription: current.toJSON() })
    setSubscription(current)
    setMessage('Notifications enabled on this device')
  }

  async function disableDevice() {
    await sendAction('notifications:unsubscribe', { endpoint: subscription.endpoint })
    await subscription.unsubscribe()
    setSubscription(null)
    setMessage('Notifications disabled on this device')
  }

  return (
    <section className="notifications-view detail-view" id="notifications-panel" role="tabpanel" aria-labelledby="notifications-tab">
      <header className="bot-settings-intro"><span className="panel-kicker">ALERTS / {bot.username}</span><h3>Notifications</h3></header>
      <div className="notifications-device">
        <div><strong>This device</strong><span>{!supported ? 'Browser push is unavailable. Use HTTPS or localhost with a supported browser.' : Notification.permission === 'denied' ? 'Notification permission is blocked in browser settings' : subscription ? 'Subscribed' : 'Not subscribed'}</span></div>
        <div className="bot-profile-actions">
          {subscription ? <button type="button" className="inventory-action-button" disabled={busy || connection !== 'online'} onClick={() => run(disableDevice)}><BellOff size={14} /> Disable</button>
            : <button type="button" className="inventory-action-button" disabled={busy || !supported || Notification.permission === 'denied' || !publicKey || connection !== 'online'} onClick={() => run(enableDevice)}><Bell size={14} /> Enable</button>}
          <button type="button" className="inventory-action-button" disabled={busy || !subscription || connection !== 'online'} onClick={() => run(async () => { await sendAction('notifications:test', { endpoint: subscription.endpoint }); setMessage('Test notification sent') })}><Send size={14} /> Test</button>
        </div>
      </div>
      <form className="notification-form" onSubmit={event => { event.preventDefault(); void run(async () => { await sendAction('notifications:settings', { settings: draft }); setMessage('Notification settings saved') }) }}>
        <div className="notification-form-heading"><strong>Bot alerts</strong><span>Shared across subscribed devices</span></div>
        {events.map(([key, label, threshold, max, unit]) => (
          <div className="notification-row" key={key}>
            <label className="notification-toggle"><input type="checkbox" checked={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>
            {threshold && <label className="notification-threshold"><span>{unit}</span><input aria-label={`${label} threshold`} type="number" min={threshold === 'nearbyDistance' ? 1 : 0} max={max} step="1" value={draft[threshold]} onChange={event => setDraft(current => ({ ...current, [threshold]: Number(event.target.value) }))} /></label>}
          </div>
        ))}
        <button type="submit" className="inventory-action-button" disabled={busy || connection !== 'online'}><Save size={14} /> Save alerts</button>
      </form>
      {error && <p className="saved-message-error" role="alert">{error}</p>}
      {message && <p className="bot-settings-note" role="status">{message}</p>}
    </section>
  )
}