<template>
  <div class="spliter-title">
    <div class="title-bar"></div>
    <span class="title-text">{{ title }}</span>
    <el-divider  />
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string;
}

withDefaults(defineProps<Props>(), {
  title: ""
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
