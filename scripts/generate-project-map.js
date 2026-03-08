const fs = require('fs')
const path = require('path')

const root = process.cwd()
const excludeDirs = new Set(['node_modules', '.git', 'dist'])
const excludeFiles = new Set([
  'PROJECT_MAP.md',
  'PROJECT_MAP_COMPONENTS.md',
  'PROJECT_MAP_STORE_UTILS.md',
  'project-map-analysis.json'
])
const codeExtRe = /\.(vue|js|ts|d\.ts)$/

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludeDirs.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    const relative = rel(full)
    if (excludeFiles.has(relative)) continue
    out.push(full)
  }
  return out
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function lineCount(text) {
  return text.split(/\r?\n/).length
}

function parseImports(text) {
  const imports = []
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text))) {
      imports.push(match[1])
    }
  }

  return [...new Set(imports)]
}

function parseFunctions(text) {
  const functionNames = new Set()
  const patterns = [
    /export\s+function\s+([A-Za-z0-9_]+)/g,
    /function\s+([A-Za-z0-9_]+)\s*\(/g,
    /const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /export\s+const\s+([A-Za-z0-9_]+)/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text))) {
      if (match[1]) functionNames.add(match[1])
    }
  }

  return [...functionNames]
}

function resolveImport(fromFile, specifier, fileSet) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null

  let basePath
  if (specifier.startsWith('@/')) {
    basePath = path.join(root, 'school', 'src', specifier.slice(2))
  } else {
    basePath = path.join(path.dirname(path.join(root, fromFile)), specifier)
  }

  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.ts`,
    `${basePath}.vue`,
    `${basePath}.d.ts`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.ts')
  ]

  for (const candidate of candidates) {
    const candidateRel = rel(candidate)
    if (fileSet.has(candidateRel)) return candidateRel
  }

  return null
}

function detectCategory(file) {
  if (file === 'school/src/main.js' || file === 'school/src/App.vue') return 'entry'
  if (file.startsWith('school/src/components/autoSchedule/')) return 'component:autoSchedule'
  if (file.startsWith('school/src/components/game/')) return 'component:game'
  if (file.startsWith('school/src/components/')) return 'component'
  if (file.startsWith('school/src/composables/')) return 'composable'
  if (file.startsWith('school/src/data/')) return 'data'
  if (file.startsWith('school/src/stores/actions/')) return 'store-action'
  if (file.startsWith('school/src/stores/')) return 'store'
  if (file.startsWith('school/src/utils/')) return 'util'
  if (file.startsWith('school/src/styles/')) return 'style'
  if (file.startsWith('school/src/types/')) return 'type'
  if (file.startsWith('school/function/')) return 'sillytavern-function-type'
  if (file.startsWith('school/iframe/')) return 'iframe-type'
  if (file.startsWith('school/public/')) return 'asset'
  if (file.startsWith('school/scripts/')) return 'tool-script'
  if (file.startsWith('school/')) return 'school-meta'
  return 'root-meta'
}

function escapeCell(value = '') {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function codeSpan(value) {
  return `\`${value}\``
}

function formatFunctionList(functions, limit = 5) {
  if (!functions || functions.length === 0) return '—'
  return functions.slice(0, limit).map(name => codeSpan(name)).join('、')
}

function basename(file) {
  return file.split('/').pop()
}

function topItems(items, limit = 10) {
  return [...items].sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)).slice(0, limit)
}

function summarizeDeps(edges, fromFile, limit = 4) {
  const targets = edges.filter(edge => edge.from === fromFile).map(edge => basename(edge.to))
  if (targets.length === 0) return '—'
  return targets.slice(0, limit).map(codeSpan).join('、')
}

function sectionTitle(title) {
  return `## ${title}\n\n`
}

function renderTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |\n`
  const split = `|${headers.map(() => '---').join('|')}|\n`
  const body = rows.map(row => `| ${row.join(' | ')} |`).join('\n')
  return `${head}${split}${body}\n\n`
}

const files = walk(root)
const relativeFiles = files.map(rel).sort()
const fileSet = new Set(relativeFiles)

const parsed = {}
for (const file of relativeFiles) {
  if (!codeExtRe.test(file)) continue
  const absolute = path.join(root, file)
  const text = readText(absolute)
  parsed[file] = {
    lines: lineCount(text),
    imports: parseImports(text),
    functions: parseFunctions(text),
    category: detectCategory(file)
  }
}

const edges = []
const dependents = Object.fromEntries(Object.keys(parsed).map(file => [file, []]))
for (const [file, info] of Object.entries(parsed)) {
  for (const specifier of info.imports) {
    const resolved = resolveImport(file, specifier, fileSet)
    if (!resolved || !parsed[resolved]) continue
    edges.push({ from: file, to: resolved, specifier })
    dependents[resolved].push(file)
  }
}

const fileDetails = Object.fromEntries(
  Object.entries(parsed).map(([file, info]) => [file, {
    ...info,
    outDegree: edges.filter(edge => edge.from === file).length,
    inDegree: dependents[file].length
  }])
)

const counts = {
  totalFiles: relativeFiles.length,
  codeFiles: Object.keys(parsed).length,
  businessFiles: Object.keys(parsed).filter(file => file.startsWith('school/src/')).length,
  edges: edges.length,
  vue: Object.keys(parsed).filter(file => file.endsWith('.vue')).length,
  js: Object.keys(parsed).filter(file => file.endsWith('.js')).length,
  ts: Object.keys(parsed).filter(file => file.endsWith('.ts')).length
}

const topIn = topItems(Object.keys(parsed).map(file => ({ file, count: dependents[file].length })), 20)
const topOut = topItems(Object.keys(parsed).map(file => ({ file, count: fileDetails[file].outDegree })), 20)

const analysis = {
  generatedAt: new Date().toISOString(),
  root,
  counts,
  files: fileDetails,
  edges,
  dependents,
  topIn,
  topOut
}

fs.writeFileSync(path.join(root, 'project-map-analysis.json'), JSON.stringify(analysis, null, 2), 'utf8')

function rootFileRows(filterFn, describeFn) {
  return relativeFiles.filter(filterFn).map(file => [codeSpan(file), escapeCell(describeFn(file))])
}

function describeMeta(file) {
  if (file === 'package.json') return '根工作区清单；现在包含项目地图自动生成命令'
  if (file === 'package-lock.json') return '根工作区锁文件'
  if (file === 'readme.md') return '根级项目说明'
  if (file === 'LICENSE') return '许可证'
  if (file === 'scripts/generate-project-map.js') return '项目地图自动生成脚本；会产出 JSON 分析与 3 份 Markdown 文档'
  if (file.startsWith('.claude/')) return '辅助配置'
  if (file.startsWith('.vscode/')) return 'VS Code 配置'
  if (file === 'school/package.json') return 'School 应用清单：Vue 3、Vite、Pinia 与构建命令'
  if (file === 'school/package-lock.json') return 'School 应用锁文件'
  if (file === 'school/vite.config.js') return 'Vite 配置；含单文件构建与内联脚本安全转换'
  if (file === 'school/index.html') return '前端入口 HTML；挂载 `#app` 并加载 `src/main.js`'
  if (file === 'school/jsconfig.json') return '路径别名配置：`@/* -> src/*`'
  if (file === 'school/README.md') return '应用说明文档'
  if (file === 'school/AI_DATA_FORMAT.md') return 'AI 数据格式约定'
  if (file === 'school/RAG_TUTORIAL.md') return 'RAG 使用说明'
  if (file === 'school/TODO.md') return '待办记录'
  if (file === 'school/think.md') return '设计思考记录'
  if (file === 'school/.gitignore') return '忽略规则'
  if (file.startsWith('school/.claude/')) return '应用目录辅助配置'
  if (file.startsWith('school/.vscode/')) return '应用目录 VS Code 配置'
  if (file === 'school/scripts/build-raw.js') return '原始构建脚本：以 `BUILD_RAW=true` 执行 Vite 打包'
  return '项目元文件'
}

function describeAsset(file) {
  if (file.endsWith('favicon.ico')) return '站点图标'
  if (file.endsWith('logo.png')) return 'Logo 资源'
  if (file.endsWith('bg.jpg')) return '背景图资源'
  if (file.endsWith('stamp.png')) return '装饰图资源'
  if (file.endsWith('~')) return '疑似编辑器备份文件，建议确认是否需要继续保留'
  return '静态资源'
}

function describeType(file) {
  if (file.startsWith('school/function/')) return 'SillyTavern Function API 类型声明'
  if (file.startsWith('school/iframe/')) return 'SillyTavern iframe / helper API 类型声明'
  if (file.startsWith('school/src/types/')) return '项目本地补充类型声明'
  return '类型声明'
}

function renderCodeTable(files) {
  const rows = files.map(file => [
    codeSpan(file),
    String(fileDetails[file].lines),
    String(fileDetails[file].outDegree),
    String(fileDetails[file].inDegree),
    escapeCell(summarizeDeps(edges, file)),
    escapeCell(formatFunctionList(fileDetails[file].functions))
  ])
  return renderTable(['文件', '行数', '出度', '入度', '关键依赖', '函数摘录'], rows)
}

function groupFiles(prefix, predicate = () => true) {
  return Object.keys(fileDetails).filter(file => file.startsWith(prefix)).filter(predicate).sort()
}

const topComponentHubs = topItems(
  groupFiles('school/src/components/').map(file => ({ file, count: fileDetails[file].outDegree })),
  12
)

const topUtilHubs = topItems(
  groupFiles('school/src/utils/').map(file => ({ file, count: dependents[file].length })),
  12
)

const composableRows = groupFiles('school/src/composables/').map(file => {
  const users = dependents[file].slice(0, 6).map(codeSpan).join('、') || '—'
  return [
    codeSpan(file),
    String(fileDetails[file].outDegree),
    String(fileDetails[file].inDegree),
    escapeCell(users),
    escapeCell(formatFunctionList(fileDetails[file].functions))
  ]
})

const actionRows = groupFiles('school/src/stores/actions/').map(file => {
  const deps = edges
    .filter(edge => edge.from === file)
    .map(edge => edge.to)
    .filter(target => target.startsWith('school/src/utils/') || target.startsWith('school/src/data/'))
    .slice(0, 6)
    .map(codeSpan)
    .join('、') || '—'
  return [
    codeSpan(file),
    String(fileDetails[file].lines),
    escapeCell(deps),
    escapeCell(formatFunctionList(fileDetails[file].functions))
  ]
})

const generatedDate = new Date().toISOString().slice(0, 10)

let mainDoc = ''
mainDoc += '# 项目地图（自动生成）\n\n'
mainDoc += `> 生成日期：${generatedDate}  \n`
mainDoc += '> 生成方式：`npm run project-map`  \n'
mainDoc += '> 统计口径：排除 `node_modules/`、`.git/`、`dist/` 与生成产物本身（地图 Markdown / 分析 JSON）。\n\n'
mainDoc += sectionTitle('一眼总览')
mainDoc += `- 当前工作区共扫描 **${counts.totalFiles}** 个项目文件，其中可解析代码文件 **${counts.codeFiles}** 个，业务代码文件（仅 \`school/src\`）**${counts.businessFiles}** 个。\n`
mainDoc += `- 代码类型构成：Vue **${counts.vue}**、JS **${counts.js}**、TS **${counts.ts}**；静态依赖边共 **${counts.edges}** 条。\n`
mainDoc += '- 业务结构为“`school/` 单应用 + 根目录工具与说明”模式；UI 侧的复杂度主要集中在 `GameMain.vue`、`GameStart.vue`、`SchoolRosterFilterPanel.vue` 与 `PhoneSystem.vue`。\n'
mainDoc += '- 领域逻辑重心主要落在 `stores/` 与 `utils/`：Store 组合 action，action 再下沉调用世界书、日程、总结、持久化与 RAG 模块。\n'
mainDoc += '- 专题文档已拆分：组件层看 `PROJECT_MAP_COMPONENTS.md`，Store / Utils / Data 看 `PROJECT_MAP_STORE_UTILS.md`。\n\n'
mainDoc += sectionTitle('使用方式')
mainDoc += '- 重新生成全部地图：`npm run project-map`。\n'
mainDoc += '- 结构化分析数据：`project-map-analysis.json`。\n'
mainDoc += '- 总览地图：`PROJECT_MAP.md`。\n'
mainDoc += '- 组件专题：`PROJECT_MAP_COMPONENTS.md`。\n'
mainDoc += '- Store/Utils 专题：`PROJECT_MAP_STORE_UTILS.md`。\n\n'
mainDoc += sectionTitle('高层依赖图')
mainDoc += '```mermaid\n'
mainDoc += 'graph TD\n'
mainDoc += '  Index[index.html] --> Main[src/main.js]\n'
mainDoc += '  Main --> App[src/App.vue]\n'
mainDoc += '  App --> Home[components/HomeLayout.vue]\n'
mainDoc += '  App --> Splash[components/SplashScreen.vue]\n'
mainDoc += '  App --> Store[stores/gameStore.ts]\n'
mainDoc += '  Home --> Start[components/GameStart.vue]\n'
mainDoc += '  Home --> Save[components/SavePanel.vue]\n'
mainDoc += '  Home --> Settings[components/Settings.vue]\n'
mainDoc += '  Home --> Game[components/GameMain.vue]\n'
mainDoc += '  Start --> Roster[SchoolRosterFilterPanel.vue]\n'
mainDoc += '  Start --> CourseData[data/coursePoolData.js]\n'
mainDoc += '  Start --> ScheduleGen[utils/scheduleGenerator.js]\n'
mainDoc += '  Game --> Phone[components/PhoneSystem.vue]\n'
mainDoc += '  Game --> Summary[utils/summaryManager.js]\n'
mainDoc += '  Game --> MessageParser[utils/messageParser.js]\n'
mainDoc += '  Phone --> Social[components/SocialApp.vue]\n'
mainDoc += '  Phone --> ScheduleApp[components/ScheduleApp.vue]\n'
mainDoc += '  Phone --> WeatherApp[components/WeatherApp.vue]\n'
mainDoc += '  Store --> Actions[stores/actions/*.ts]\n'
mainDoc += '  Actions --> Utils[utils/*.js|ts]\n'
mainDoc += '  Actions --> Data[data/*.js]\n'
mainDoc += '```\n\n'
mainDoc += sectionTitle('依赖中心统计')
mainDoc += '### 入度最高\n\n'
for (const item of topIn.slice(0, 10)) {
  mainDoc += `- ${codeSpan(item.file)}：被依赖 ${item.count} 次。\n`
}
mainDoc += '\n### 出度最高\n\n'
for (const item of topOut.slice(0, 10)) {
  mainDoc += `- ${codeSpan(item.file)}：直接依赖 ${item.count} 个模块。\n`
}
mainDoc += '\n'
mainDoc += sectionTitle('根目录与元文件')
mainDoc += renderTable(
  ['文件', '说明'],
  rootFileRows(file => !file.startsWith('school/') && !file.startsWith('scripts/'), describeMeta)
    .concat(rootFileRows(file => file.startsWith('scripts/'), describeMeta))
)
mainDoc += sectionTitle('school/ 非源码文件')
mainDoc += renderTable(
  ['文件', '说明'],
  rootFileRows(
    file => file.startsWith('school/') && !file.startsWith('school/src/') && !file.startsWith('school/public/') && !file.startsWith('school/function/') && !file.startsWith('school/iframe/'),
    describeMeta
  )
)
mainDoc += sectionTitle('静态资源')
mainDoc += renderTable(['文件', '说明'], rootFileRows(file => file.startsWith('school/public/'), describeAsset))
mainDoc += sectionTitle('类型声明')
mainDoc += '### `school/function`\n\n'
mainDoc += renderTable(['文件', '说明'], rootFileRows(file => file.startsWith('school/function/'), describeType))
mainDoc += '### `school/iframe`\n\n'
mainDoc += renderTable(['文件', '说明'], rootFileRows(file => file.startsWith('school/iframe/'), describeType))
mainDoc += '### `school/src/types`\n\n'
mainDoc += renderTable(['文件', '说明'], rootFileRows(file => file.startsWith('school/src/types/'), describeType))
mainDoc += sectionTitle('维护提示')
mainDoc += '- 继续扩展时，优先关注高耦合模块：`school/src/components/GameMain.vue`、`school/src/components/SchoolRosterFilterPanel.vue`、`school/src/stores/gameStore.ts`、`school/src/utils/worldbookParser.js`、`school/src/utils/npcScheduleSystem.js`。\n'
mainDoc += '- 若后续要做更细粒度维护，建议把当前脚本继续扩展为输出 Graphviz / SVG，或接入 AST 解析替代正则扫描。\n'

let componentDoc = ''
componentDoc += '# 组件地图（自动生成）\n\n'
componentDoc += `> 生成日期：${generatedDate}  \n`
componentDoc += '> 关注范围：`school/src/components` 与 `school/src/composables`。\n\n'
componentDoc += sectionTitle('组件层结构')
componentDoc += '- `HomeLayout.vue` 是页面切换壳层，通过异步组件装配主菜单、开局页、设置页、读档页和主游戏页。\n'
componentDoc += '- `GameStart.vue` 是开局配置中心，向下连接名册、课程、事件、日程、数据导入等重型编辑面板。\n'
componentDoc += '- `GameMain.vue` 是核心交互页，向下聚合地图、装备、存档、手机系统、调试面板与多个 game 子组件。\n'
componentDoc += '- `PhoneSystem.vue` 是游戏内二级容器，承载社交、日程、天气、兼职、名册、校规等 App。\n'
componentDoc += '- `SchoolRosterFilterPanel.vue` 是后台运营面板，集中使用多个 composable 和编辑器组件。\n\n'
componentDoc += sectionTitle('组件高层图')
componentDoc += '```mermaid\n'
componentDoc += 'graph TD\n'
componentDoc += '  Home[HomeLayout.vue] --> Start[GameStart.vue]\n'
componentDoc += '  Home --> Settings[Settings.vue]\n'
componentDoc += '  Home --> Save[SavePanel.vue]\n'
componentDoc += '  Home --> Main[GameMain.vue]\n'
componentDoc += '  Start --> Roster[SchoolRosterFilterPanel.vue]\n'
componentDoc += '  Start --> CourseEditor[CourseEditor.vue]\n'
componentDoc += '  Start --> EventEditor[EventEditorPanel.vue]\n'
componentDoc += '  Start --> ScheduleEditor[NpcScheduleEditorPanel.vue]\n'
componentDoc += '  Main --> Phone[PhoneSystem.vue]\n'
componentDoc += '  Main --> Map[MapPanel.vue]\n'
componentDoc += '  Main --> SavePanel[SavePanel.vue]\n'
componentDoc += '  Main --> GameSub[components/game/*]\n'
componentDoc += '  Phone --> Social[SocialApp.vue]\n'
componentDoc += '  Phone --> Calendar[CalendarApp.vue]\n'
componentDoc += '  Phone --> Schedule[ScheduleApp.vue]\n'
componentDoc += '  Phone --> Weather[WeatherApp.vue]\n'
componentDoc += '  Phone --> RosterApp[RosterApp.vue]\n'
componentDoc += '```\n\n'
componentDoc += sectionTitle('组件出度前十')
for (const item of topComponentHubs.slice(0, 10)) {
  componentDoc += `- ${codeSpan(item.file)}：直接依赖 ${item.count} 个模块。\n`
}
componentDoc += '\n'
componentDoc += sectionTitle('Composables 使用图')
componentDoc += renderTable(['文件', '出度', '入度', '主要使用者', '函数摘录'], composableRows)
componentDoc += '### 根目录组件\n\n'
componentDoc += renderCodeTable(groupFiles('school/src/components/', file => !file.startsWith('school/src/components/autoSchedule/') && !file.startsWith('school/src/components/game/')))
componentDoc += '### `components/autoSchedule`\n\n'
componentDoc += renderCodeTable(groupFiles('school/src/components/autoSchedule/'))
componentDoc += '### `components/game`\n\n'
componentDoc += renderCodeTable(groupFiles('school/src/components/game/'))
componentDoc += '### `composables`\n\n'
componentDoc += renderCodeTable(groupFiles('school/src/composables/'))
componentDoc += sectionTitle('组件维护提示')
componentDoc += '- `GameMain.vue`、`PhoneSystem.vue`、`SchoolRosterFilterPanel.vue` 已经承担明显的“页面协调器”角色；继续增长时建议优先把状态与副作用下沉到 composable 或 store action。\n'
componentDoc += '- `HomeLayout.vue` 的异步组件模式已经很好，新增重量级页面时建议继续 `defineAsyncComponent(() => import(...))`。\n'

let coreDoc = ''
coreDoc += '# Store / Utils / Data 地图（自动生成）\n\n'
coreDoc += `> 生成日期：${generatedDate}  \n`
coreDoc += '> 关注范围：`school/src/stores`、`school/src/utils`、`school/src/data`。\n\n'
coreDoc += sectionTitle('核心结构')
coreDoc += '- `gameStore.ts` 是 Pinia 聚合层，自身很薄，主要职责是装配 state、types 与 15 个 action 模块。\n'
coreDoc += '- action 层按领域拆分为学业、班级社团、选修、事件天气、存档、时间推进、学年推进等模块。\n'
coreDoc += '- `utils/` 是真正的领域服务层；其中世界书、NPC 日程、总结/RAG、关系、消息解析与本地持久化最关键。\n'
coreDoc += '- `data/` 提供课程池、地图、关系规则、学业规则等相对稳定的基础数据。\n\n'
coreDoc += sectionTitle('核心依赖图')
coreDoc += '```mermaid\n'
coreDoc += 'graph LR\n'
coreDoc += '  GS[gameStore.ts] --> GSS[gameStoreState.ts]\n'
coreDoc += '  GS --> GST[gameStoreTypes.ts]\n'
coreDoc += '  GS --> Actions[stores/actions/*.ts]\n'
coreDoc += '  Actions --> WBP[worldbookParser.js]\n'
coreDoc += '  Actions --> NSS[npcScheduleSystem.js]\n'
coreDoc += '  Actions --> SG[scheduleGenerator.js]\n'
coreDoc += '  Actions --> IDB[indexedDB.js]\n'
coreDoc += '  Actions --> SW[socialWorldbook.js]\n'
coreDoc += '  Actions --> AE[academicEngine.js]\n'
coreDoc += '  NSS --> SG\n'
coreDoc += '  SG --> CoursePool[data/coursePoolData.js]\n'
coreDoc += '  SG --> Academic[data/academicData.js]\n'
coreDoc += '  WBP --> WorldbookHelper[worldbookHelper.js]\n'
coreDoc += '  Summary[summaryManager.js] --> AssistantAI[assistantAI.js]\n'
coreDoc += '  Summary --> RAG[ragService.js]\n'
coreDoc += '  MessageParser[messageParser.js] --> Summary\n'
coreDoc += '  IDB --> ERR[errorUtils.ts]\n'
coreDoc += '  WBP --> ERR\n'
coreDoc += '  GS --> ERR\n'
coreDoc += '```\n\n'
coreDoc += sectionTitle('核心被依赖模块')
for (const item of topUtilHubs) {
  coreDoc += `- ${codeSpan(item.file)}：被依赖 ${item.count} 次。\n`
}
coreDoc += '\n'
coreDoc += sectionTitle('Store / Action 索引')
coreDoc += '### `stores`\n\n'
coreDoc += renderCodeTable(groupFiles('school/src/stores/', file => !file.startsWith('school/src/stores/actions/')))
coreDoc += '### `stores/actions`\n\n'
coreDoc += renderCodeTable(groupFiles('school/src/stores/actions/'))
coreDoc += '### Action 到 Utils / Data 的直接依赖\n\n'
coreDoc += renderTable(['Action', '关键 Utils / Data', '函数摘录'], actionRows)
coreDoc += '### `data`\n\n'
coreDoc += renderCodeTable(groupFiles('school/src/data/'))
coreDoc += '### `utils`\n\n'
coreDoc += renderCodeTable(groupFiles('school/src/utils/'))
coreDoc += sectionTitle('维护提示')
coreDoc += '- `errorUtils.ts` 是跨层通用依赖；新增模块时继续统一用它包装错误文案，能明显降低排障成本。\n'
coreDoc += '- `worldbookParser.js` 与 `npcScheduleSystem.js` 都是跨多领域枢纽；修改时建议优先补充脚本级 diff 检查，避免破坏世界书或时间推进链路。\n'
coreDoc += '- 如果后续要做更准确的函数级依赖图，可以在此脚本基础上切换到 Babel / TypeScript AST。\n'

fs.writeFileSync(path.join(root, 'PROJECT_MAP.md'), mainDoc, 'utf8')
fs.writeFileSync(path.join(root, 'PROJECT_MAP_COMPONENTS.md'), componentDoc, 'utf8')
fs.writeFileSync(path.join(root, 'PROJECT_MAP_STORE_UTILS.md'), coreDoc, 'utf8')

console.log('Generated:')
console.log('- project-map-analysis.json')
console.log('- PROJECT_MAP.md')
console.log('- PROJECT_MAP_COMPONENTS.md')
console.log('- PROJECT_MAP_STORE_UTILS.md')
