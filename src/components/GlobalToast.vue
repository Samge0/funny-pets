// 全局 toast：底部浮出的轻提示（showToast 从上线起被 17 处调用但从未有 UI 渲染它——补齐）。
<template>
  <Transition name="toast">
    <div v-if="toast.text" class="global-toast">{{ toast.text }}</div>
  </Transition>
</template>

<script setup>
import { toast } from '../store.js';
</script>

<style scoped>
.global-toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%);
  z-index: 300; max-width: min(88vw, 520px);
  background: rgba(42, 48, 64, 0.94); color: #fff;
  border-radius: 12px; padding: 11px 20px;
  font-size: 13.5px; line-height: 1.6; text-align: center;
  box-shadow: 0 10px 30px rgba(20, 24, 40, 0.45);
  pointer-events: none;
  animation: toast-in 0.3s cubic-bezier(0.2, 1.2, 0.4, 1);
}
@keyframes toast-in { from { transform: translate(-50%, 12px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.toast-enter-active, .toast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
