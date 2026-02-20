import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { Plugin as importToCDN } from 'vite-plugin-cdn-import'

const isRawBuild = process.env.BUILD_RAW === 'true'

/**
 * 自定义插件：将内联 <script> 的 JS 代码转为 base64，通过 bootstrap 脚本解码执行。
 *
 * 根本问题：SillyTavern 通过 iframe srcdoc 加载 HTML。srcdoc 中的内容
 * 会被 HTML 解析器预处理，<script> 标签内任何看起来像 HTML 标签的文本
 * （无论在字符串、正则、模板中）都会被解析器当作真正的 HTML 标签，截断 JS 代码。
 *
 * 之前尝试过的方案（均不够）：
 * - terser inline_script: true → 只处理 </，不处理开放标签如 <thinking>
 * - 字符串中 < 替换为 \x3c → 正则字面量中的 < 无法这样替换
 *
 * 最终方案：将整个 JS 代码 base64 编码，HTML 解析器只看到纯 ASCII 字母数字，
 * 不可能出现任何 HTML 标签模式。用一小段无 < 的 bootstrap 脚本解码并执行。
 */
function escapeInlineScriptPlugin() {
  return {
    name: 'escape-inline-script',
    enforce: 'post',
    async closeBundle() {
      const fs = await import('fs')
      const path = await import('path')

      const htmlPath = path.resolve('dist/index.html')

      if (!fs.existsSync(htmlPath)) {
        console.warn('[escape-inline-script] index.html not found, skipping')
        return
      }

      let html = fs.readFileSync(htmlPath, 'utf-8')

      // 在 base64 编码前保存一份压缩但未编码的 raw 版本
      const rawPath = path.resolve('dist/index.raw.html')
      fs.writeFileSync(rawPath, html, 'utf-8')
      console.log(`[escape-inline-script] Saved pre-encoding copy to index.raw.html`)

      html = html.replace(
        /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
        (match, openTag, body, closeTag) => {
          // 将 JS 代码转为 base64
          const b64 = Buffer.from(body, 'utf-8').toString('base64')

          // bootstrap 脚本：解码 base64 并通过 Blob + import() 执行 ES module
          // 注意：这段 bootstrap 代码本身不能包含任何 < 字符
          // 用 _bin.length>_i 代替 _i<_bin.length 来避免 < 出现
          const bootstrap = [
            `var _b64="${b64}";`,
            'var _bin=atob(_b64);',
            'var _bytes=new Uint8Array(_bin.length);',
            'for(var _i=0;_bin.length>_i;_i++)_bytes[_i]=_bin.charCodeAt(_i);',
            'var _blob=new Blob([_bytes],{type:"text/javascript"});',
            'var _url=URL.createObjectURL(_blob);',
            'import(_url).finally(function(){URL.revokeObjectURL(_url)});'
          ].join('')

          // 将 type="module" 改为普通 script（import() 本身会以 module 方式执行）
          const newOpenTag = openTag.replace(' type="module"', '').replace(' crossorigin', '')

          return newOpenTag + bootstrap + closeTag
        }
      )

      fs.writeFileSync(htmlPath, html, 'utf-8')

      // 验证 bootstrap 中没有危险的 HTML 标签模式
      const result = fs.readFileSync(htmlPath, 'utf-8')
      const sStart = result.indexOf('<script')
      const sTagEnd = result.indexOf('>', sStart) + 1
      const sEnd = result.indexOf('</script>')
      const sBody = result.substring(sTagEnd, sEnd)

      // 检查 bootstrap 部分（base64 之外）是否有 HTML 标签
      const bootstrapPart = sBody.substring(0, sBody.indexOf('"') + 1) + '...' + sBody.substring(sBody.lastIndexOf('"'))
      let hasHtmlTag = false
      const nonB64 = sBody.replace(/"[A-Za-z0-9+/=]+"/, '""') // 去掉 base64 内容
      for (let i = 0; i < nonB64.length - 1; i++) {
        const cc = nonB64.charCodeAt(i)
        const nc = nonB64.charCodeAt(i + 1)
        if (cc === 60 && ((nc >= 65 && nc <= 90) || (nc >= 97 && nc <= 122))) {
          hasHtmlTag = true
          console.warn(`[escape-inline-script] WARNING: found <tag at pos ${i}: ${nonB64.substring(i, i + 20)}`)
        }
      }

      const b64Size = (sBody.length / 1024).toFixed(0)
      console.log(`[escape-inline-script] JS encoded to base64 (${b64Size} KB). HTML-safe: ${!hasHtmlTag}`)
    }
  }
}

/**
 * 仅在 BUILD_RAW 模式下启用：将 dist/index.html 重命名为 dist/index.raw.html
 */
function rawBuildRenamePlugin() {
  return {
    name: 'raw-build-rename',
    enforce: 'post',
    async closeBundle() {
      const fs = await import('fs')
      const path = await import('path')

      const htmlPath = path.resolve('dist/index.html')
      const rawPath = path.resolve('dist/index.raw.html')

      if (!fs.existsSync(htmlPath)) {
        console.warn('[raw-build-rename] index.html not found, skipping')
        return
      }

      fs.renameSync(htmlPath, rawPath)
      console.log('[raw-build-rename] Renamed index.html → index.raw.html')
    }
  }
}

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
    viteSingleFile(),
    ...isRawBuild ? [rawBuildRenamePlugin()] : [escapeInlineScriptPlugin()],
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
    target: 'esnext', // SillyTavern 运行在现代 Chromium 内核，无需降级
    minify: isRawBuild ? false : 'terser',
    terserOptions: isRawBuild ? undefined : {
      ecma: 2020,
      mangle: {
        reserved: ['$', 'jQuery'] // 避免 $ 作为压缩变量名，防止宏冲突
      },
      format: {
        inline_script: true // 关键：转义 </ 和 <!-- 防止内联脚本被 HTML 解析器破坏
      }
    },
    assetsInlineLimit: 100000000, // 强制内联资源
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false, // 禁用 CSS 分割，合并到 HTML 中
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // 确保所有 JS 合并为一个文件
        format: 'es', // ES 模块格式，每个模块有独立作用域，避免变量冲突
      },
    },
  },
})
