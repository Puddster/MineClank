self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { payload = {} }
  event.waitUntil(self.registration.showNotification(payload.title || 'MineClank', {
    body: payload.body || 'Bot notification',
    icon: '/app-icon-192.png',
    data: { url: '/' }
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin)
    return existing ? existing.focus() : self.clients.openWindow('/')
  }))
})