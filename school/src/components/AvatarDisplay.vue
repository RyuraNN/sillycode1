<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const fileInput = ref(null)

const avatarSrc = computed(() => gameStore.player.avatar)

const triggerUpload = () => {
  fileInput.value.click()
}

const handleFileChange = (event) => {
  const file = event.target.files[0]
  if (file) {
    // 限制文件大小 (例如 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      // 这里可以添加图片压缩逻辑，目前直接保存 Base64
      gameStore.setAvatar(e.target.result)
    }
    reader.readAsDataURL(file)
  }
}
</script>

<template>
  <div class="avatar-container" @click="triggerUpload">
    <img :src="avatarSrc" alt="Avatar" class="avatar-img" />
    <div class="upload-hint">点击更换</div>
    <input 
      type="file" 
      ref="fileInput" 
      @change="handleFileChange" 
      accept="image/*" 
      style="display: none" 
    />
  </div>
</template>

<style scoped>
.avatar-container {
  width: 100px;
  height: 100px;
  margin: 10px auto;
  position: relative;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #fff;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  transition: transform 0.3s;
}

.avatar-container:hover {
  transform: scale(1.05);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 0.8rem;
  text-align: center;
  padding: 2px 0;
  opacity: 0;
  transition: opacity 0.3s;
}

.avatar-container:hover .upload-hint {
  opacity: 1;
}
</style>
