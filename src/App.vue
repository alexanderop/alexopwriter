<script setup lang="ts">
import WriterPage from './app/WriterPage.vue'
import type { WriterServices } from './app/bootstrap'
import type { RegisterAppUpdate } from './app/application/appUpdate'
defineProps<{ services: WriterServices; registerUpdates?: RegisterAppUpdate | undefined }>()
</script>
<template><WriterPage :services="services" :register-updates="registerUpdates" /></template>
