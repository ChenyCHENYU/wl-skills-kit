<template>
  <svg :class="svgClass" aria-hidden="true">
    <use :xlink:href="iconName" :fill="color" />
  </svg>
</template>

<script setup lang="ts">
import { computed, onMounted, onUpdated } from 'vue'
import { addSymbolDelay } from '@jhlc/common-resource/src/svg/register-static-svg'

interface Props {
  iconClass: string
  className?: string
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  className: '',
  color: ''
})

const iconName = computed(() => `#icon-${props.iconClass}`)
const svgClass = computed(() =>
  props.className ? `svg-icon ${props.className}` : 'svg-icon'
)

onMounted(() => addSymbolDelay(props.iconClass))
onUpdated(() => addSymbolDelay(props.iconClass))
</script>

<style scoped lang="scss" src="./index.scss"></style>
