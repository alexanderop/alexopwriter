import { createApp } from 'vue'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/400-italic.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import './style.css'
import App from './App.vue'
import { registerSW } from 'virtual:pwa-register'
import type { RegisterAppUpdate } from './appUpdate'

const registerUpdates: RegisterAppUpdate = (callbacks) => {
  if ('serviceWorker' in navigator) {
    let controller = navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const next = navigator.serviceWorker.controller
      if (!next || next === controller) return
      const replacedController = controller !== null
      controller = next
      // Workbox's isUpdate flag stays false on a page's first installation,
      // even when a later worker replaces it without an intervening reload.
      if (replacedController) callbacks.onNeedReload()
    })
  }
  return registerSW({
    onNeedRefresh: callbacks.onNeedRefresh,
    // The native listener above owns activation; suppress the plugin's reload.
    onNeedReload() {},
  })
}

createApp(App, { registerUpdates }).mount('#app')
