import { useState } from 'react'

export function useBotProfileController({ selectedBot, sendAction, setNotice }) {
  const [botProfileDraft, setBotProfileDraft] = useState(null)
  const [botProfileToDelete, setBotProfileToDelete] = useState(null)
  const [botToReauthenticate, setBotToReauthenticate] = useState(null)
  const [botProfileError, setBotProfileError] = useState('')

  function openNewBotProfile() {
    setBotProfileError('')
    setBotProfileDraft({
      mode: 'create', id: '', username: '', host: '', port: '25565',
      auth: 'microsoft', version: '', physicsEnabled: true, onJoinText: '', autoStart: true
    })
  }

  function openEditBotProfile() {
    if (!selectedBot) return
    setBotProfileError('')
    setBotProfileDraft({
      mode: 'edit',
      id: selectedBot.id,
      ...selectedBot.profile,
      port: String(selectedBot.profile.port),
      version: selectedBot.profile.version || '',
      onJoinText: (selectedBot.profile.onJoin || []).join('\n'),
      autoStart: selectedBot.autoStart !== false
    })
  }

  function saveBotProfile(event) {
    event.preventDefault()
    if (!botProfileDraft) return
    const { mode, id, autoStart, onJoinText, version, ...fields } = botProfileDraft
    sendAction(mode === 'edit' ? 'bot:profile-update' : 'bot:profile-create', {
      id,
      profile: {
        ...fields,
        port: Number(fields.port),
        ...(version.trim() ? { version: version.trim() } : {}),
        onJoin: onJoinText.split(/\r?\n/).map(command => command.trim()).filter(Boolean)
      },
      autoStart
    })
  }

  function confirmDeleteBotProfile() {
    if (botProfileToDelete) sendAction('bot:profile-delete', { id: botProfileToDelete.id })
  }

  function confirmMicrosoftReauthentication() {
    if (botToReauthenticate) sendAction('bot:auth-start', { id: botToReauthenticate.id })
  }

  async function copyMicrosoftCode(code) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable')
      await navigator.clipboard.writeText(code)
      setNotice('Microsoft sign-in code copied')
      window.setTimeout(() => setNotice(''), 3500)
    } catch (error) {
      setNotice(error.message || 'Could not copy the Microsoft sign-in code')
    }
  }

  return {
    botProfileDraft,
    setBotProfileDraft,
    botProfileToDelete,
    setBotProfileToDelete,
    botToReauthenticate,
    setBotToReauthenticate,
    botProfileError,
    setBotProfileError,
    openNewBotProfile,
    openEditBotProfile,
    saveBotProfile,
    confirmDeleteBotProfile,
    confirmMicrosoftReauthentication,
    copyMicrosoftCode
  }
}