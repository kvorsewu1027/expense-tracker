import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)

export const firebaseAuth = isFirebaseConfigured
  ? getAuth(initializeApp(firebaseConfig))
  : null

const allowedUserIds = new Set(
  String(import.meta.env.VITE_FIREBASE_ALLOWED_UIDS || '')
    .split(',')
    .map((userId) => userId.trim())
    .filter(Boolean)
)

const configuredDisplayNames = new Map(
  String(import.meta.env.VITE_FIREBASE_DISPLAY_NAMES || '')
    .split(',')
    .map((profile) => {
      const separatorIndex = profile.indexOf(':')
      if (separatorIndex < 1) {
        return null
      }

      const userId = profile.slice(0, separatorIndex).trim()
      const displayName = profile.slice(separatorIndex + 1).trim()
      return userId && displayName ? [userId, displayName] : null
    })
    .filter(Boolean)
)

export const hasConfiguredAllowedUsers = allowedUserIds.size > 0

export function isAllowedFirebaseUser(user) {
  return Boolean(user && allowedUserIds.has(user.uid))
}

export function getConfiguredDisplayName(user) {
  return user ? configuredDisplayNames.get(user.uid) || '' : ''
}
