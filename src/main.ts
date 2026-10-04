import { createApp } from 'vue'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/400-italic.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import './style.css'
import App from './App.vue'
import { registerSW } from 'virtual:pwa-register'

createApp(App, { registerUpdates: registerSW }).mount('#app')
