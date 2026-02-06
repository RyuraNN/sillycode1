import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'
import legacy from '@vitejs/plugin-legacy'
import { Plugin as importToCDN } from 'vite-plugin-cdn-import'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 关闭静态提升，直接解决 _hoisted_ 变量重复声明问题
          hoistStatic: false
        }
      }
    }),
    vueDevTools(),
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),
    viteSingleFile(),
    // importToCDN({
    //   modules: [
    //     {
    //       name: 'vue',
    //       var: 'Vue',
    //       path: 'https://unpkg.com/vue@3/dist/vue.global.prod.js'
    //     },
    //     {
    //       name: 'vue-demi', // Pinia dependency (must be before pinia)
    //       var: 'VueDemi',
    //       path: 'https://unpkg.com/vue-demi@0.14.6/lib/index.iife.js'
    //     },
    //     {
    //       name: 'pinia',
    //       var: 'Pinia',
    //       path: 'https://unpkg.com/pinia@2/dist/pinia.iife.prod.js'
    //     }
    //   ]
    // })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    target: 'es2015',
    minify: 'terser', // 尝试使用 terser 压缩，它比 esbuild 更稳健但稍慢
    assetsInlineLimit: 100000000, // 强制内联资源
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false, // 禁用 CSS 分割，合并到 HTML 中
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // 确保所有 JS 合并为一个文件
        // 【核心修复】使用 IIFE 格式，将变量隔离在函数作用域内
        format: 'iife', 
      },
    },
  },
})
