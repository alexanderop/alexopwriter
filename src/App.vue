<script setup lang="ts">
import WriterPage from './app/WriterPage.vue'
import type { WriterServices } from './app/bootstrap'
defineProps<{ services: WriterServices }>()
</script>
<template><WriterPage :services="services" /></template>
