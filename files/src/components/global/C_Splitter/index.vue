<template>
  <div
    ref="containerRef"
    class="my-splitter-container"
    :class="[`is-${direction}`]"
  >
    <template v-for="(item, index) in vnodes" :key="index">
      <div class="splitter-item" :style="getItemStyle(index)">
        <component :is="item" />
      </div>

      <div
        v-if="index < vnodes.length - 1"
        class="splitter-trigger"
        @mousedown="(e) => onMouseDown(e, index)"
      >
        <div class="trigger-line"></div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, useSlots, onUnmounted } from "vue";

const props = defineProps({
  direction: {
    type: String,
    default: "horizontal" // horizontal | vertical
  },
  minSize: {
    type: Number,
    default: 50
  }
});

const slots = useSlots();
const containerRef = ref(null);
const vnodes = ref([]); // 存储虚拟节点
const paneConfigs = ref([]); // 存储每个面板的 minSize 等配置
const sizes = reactive([]);
const isDragging = ref(false);
let currentTriggerIndex = -1;

// 初始化：获取插槽并分配初始平均尺寸
onMounted(() => {
  const defaultSlots = slots.default ? slots.default() : [];
  // 过滤掉注释节点(Symbol(v-cmt))和Fragment，只保留真正的元素
  const children = defaultSlots.filter((v) => {
    // 排除 Symbol 类型（注释节点）和 Fragment
    if (typeof v.type === "symbol") return false;
    // 保留 string（原生HTML元素）和 object（组件）
    return typeof v.type === "string" || typeof v.type === "object";
  });
  vnodes.value = children;

  const rect = containerRef.value.getBoundingClientRect();
  const totalAvailable =
    props.direction === "horizontal" ? rect.width : rect.height;
  // vertical 模式 trigger 高度是 8px，horizontal 模式宽度是 4px
  const triggerSize = props.direction === "horizontal" ? 4 : 8;
  const triggerTotalSize = (children.length - 1) * triggerSize;

  let remainingSize = totalAvailable - triggerTotalSize;
  let autoCount = 0;

  // 1. 第一次遍历：解析 initialSize (支持 200 或 "30%")
  const tempSizes = children.map((vnode) => {
    const initSize = vnode.props?.initialSize;
    if (initSize === undefined || initSize === null) {
      autoCount++;
      return null;
    }
    const sizePx =
      typeof initSize === "string" && initSize.endsWith("%")
        ? (parseFloat(initSize) / 100) * (totalAvailable - triggerTotalSize)
        : parseFloat(initSize);
    remainingSize -= sizePx;
    return sizePx;
  });

  // 2. 第二次遍历：填充 sizes 和 paneConfigs
  tempSizes.forEach((size, idx) => {
    sizes.push(size === null ? remainingSize / autoCount : size);
    paneConfigs.value.push({
      minSize: children[idx].props?.minSize || props.minSize
    });
  });
});

const getItemStyle = (index) => {
  const prop = props.direction === "horizontal" ? "width" : "height";
  return { [prop]: `${sizes[index]}px` };
};

// 拖拽逻辑
const onMouseDown = (e, index) => {
  isDragging.value = true;
  currentTriggerIndex = index;
  document.body.style.userSelect = "none";
  document.body.style.cursor =
    props.direction === "horizontal" ? "col-resize" : "row-resize";

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (e) => {
  if (!isDragging.value) return;
  const i = currentTriggerIndex;
  const movement = props.direction === "horizontal" ? e.movementX : e.movementY;

  const minCurr = paneConfigs.value[i].minSize;
  const minNext = paneConfigs.value[i + 1].minSize;

  if (sizes[i] + movement >= minCurr && sizes[i + 1] - movement >= minNext) {
    sizes[i] += movement;
    sizes[i + 1] -= movement;
  }
};

const onMouseUp = () => {
  isDragging.value = false;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
};

onUnmounted(() => onMouseUp())
</script>

<style scoped src="./index.scss"></style>
