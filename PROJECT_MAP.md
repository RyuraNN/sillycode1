# 项目地图（自动生成）

> 生成日期：2026-03-06  
> 生成方式：`npm run project-map`  
> 统计口径：排除 `node_modules/`、`.git/`、`dist/` 与生成产物本身（地图 Markdown / 分析 JSON）。

## 一眼总览

- 当前工作区共扫描 **208** 个项目文件，其中可解析代码文件 **182** 个，业务代码文件（仅 `school/src`）**148** 个。
- 代码类型构成：Vue **72**、JS **56**、TS **54**；静态依赖边共 **471** 条。
- 业务结构为“`school/` 单应用 + 根目录工具与说明”模式；UI 侧的复杂度主要集中在 `GameMain.vue`、`GameStart.vue`、`SchoolRosterFilterPanel.vue` 与 `PhoneSystem.vue`。
- 领域逻辑重心主要落在 `stores/` 与 `utils/`：Store 组合 action，action 再下沉调用世界书、日程、总结、持久化与 RAG 模块。
- 专题文档已拆分：组件层看 `PROJECT_MAP_COMPONENTS.md`，Store / Utils / Data 看 `PROJECT_MAP_STORE_UTILS.md`。

## 使用方式

- 重新生成全部地图：`npm run project-map`。
- 结构化分析数据：`project-map-analysis.json`。
- 总览地图：`PROJECT_MAP.md`。
- 组件专题：`PROJECT_MAP_COMPONENTS.md`。
- Store/Utils 专题：`PROJECT_MAP_STORE_UTILS.md`。

## 高层依赖图

```mermaid
graph TD
  Index[index.html] --> Main[src/main.js]
  Main --> App[src/App.vue]
  App --> Home[components/HomeLayout.vue]
  App --> Splash[components/SplashScreen.vue]
  App --> Store[stores/gameStore.ts]
  Home --> Start[components/GameStart.vue]
  Home --> Save[components/SavePanel.vue]
  Home --> Settings[components/Settings.vue]
  Home --> Game[components/GameMain.vue]
  Start --> Roster[SchoolRosterFilterPanel.vue]
  Start --> CourseData[data/coursePoolData.js]
  Start --> ScheduleGen[utils/scheduleGenerator.js]
  Game --> Phone[components/PhoneSystem.vue]
  Game --> Summary[utils/summaryManager.js]
  Game --> MessageParser[utils/messageParser.js]
  Phone --> Social[components/SocialApp.vue]
  Phone --> ScheduleApp[components/ScheduleApp.vue]
  Phone --> WeatherApp[components/WeatherApp.vue]
  Store --> Actions[stores/actions/*.ts]
  Actions --> Utils[utils/*.js|ts]
  Actions --> Data[data/*.js]
```

## 依赖中心统计

### 入度最高

- `school/src/stores/gameStore.ts`：被依赖 57 次。
- `school/src/utils/errorUtils.ts`：被依赖 34 次。
- `school/src/data/coursePoolData.js`：被依赖 21 次。
- `school/src/utils/worldbookHelper.js`：被依赖 20 次。
- `school/src/stores/gameStoreTypes.ts`：被依赖 14 次。
- `school/src/utils/worldbookParser.js`：被依赖 14 次。
- `school/src/data/mapData.js`：被依赖 13 次。
- `school/src/data/relationshipData.js`：被依赖 13 次。
- `school/src/utils/indexedDB.js`：被依赖 13 次。
- `school/src/utils/npcScheduleSystem.js`：被依赖 13 次。

### 出度最高

- `school/src/components/GameMain.vue`：直接依赖 37 个模块。
- `school/src/components/SchoolRosterFilterPanel.vue`：直接依赖 30 个模块。
- `school/src/components/PhoneSystem.vue`：直接依赖 21 个模块。
- `school/src/stores/actions/classClubActions.ts`：直接依赖 17 个模块。
- `school/src/stores/gameStore.ts`：直接依赖 16 个模块。
- `school/src/components/GameStart.vue`：直接依赖 14 个模块。
- `school/src/stores/actions/index.ts`：直接依赖 14 个模块。
- `school/src/components/HomeLayout.vue`：直接依赖 13 个模块。
- `school/src/components/AutoSchedulePanel.vue`：直接依赖 9 个模块。
- `school/src/stores/actions/yearProgressionActions.ts`：直接依赖 9 个模块。

## 根目录与元文件

| 文件 | 说明 |
|---|---|
| `.claude/settings.local.json` | 辅助配置 |
| `.vscode/settings.json` | VS Code 配置 |
| `LICENSE` | 许可证 |
| `package-lock.json` | 根工作区锁文件 |
| `package.json` | 根工作区清单；现在包含项目地图自动生成命令 |
| `readme.md` | 根级项目说明 |
| `scripts/generate-project-map.js` | 项目地图自动生成脚本；会产出 JSON 分析与 3 份 Markdown 文档 |

## school/ 非源码文件

| 文件 | 说明 |
|---|---|
| `school/.claude/settings.local.json` | 应用目录辅助配置 |
| `school/.gitignore` | 忽略规则 |
| `school/.vscode/extensions.json` | 应用目录 VS Code 配置 |
| `school/.vscode/settings.json` | 应用目录 VS Code 配置 |
| `school/AI_DATA_FORMAT.md` | AI 数据格式约定 |
| `school/RAG_TUTORIAL.md` | RAG 使用说明 |
| `school/README.md` | 应用说明文档 |
| `school/TODO.md` | 待办记录 |
| `school/index.html` | 前端入口 HTML；挂载 `#app` 并加载 `src/main.js` |
| `school/jsconfig.json` | 路径别名配置：`@/* -> src/*` |
| `school/package-lock.json` | School 应用锁文件 |
| `school/package.json` | School 应用清单：Vue 3、Vite、Pinia 与构建命令 |
| `school/scripts/build-raw.js` | 原始构建脚本：以 `BUILD_RAW=true` 执行 Vite 打包 |
| `school/think.md` | 设计思考记录 |
| `school/vite.config.js` | Vite 配置；含单文件构建与内联脚本安全转换 |

## 静态资源

| 文件 | 说明 |
|---|---|
| `school/public/bg.jpg` | 背景图资源 |
| `school/public/bg.jpg~` | 疑似编辑器备份文件，建议确认是否需要继续保留 |
| `school/public/favicon.ico` | 站点图标 |
| `school/public/logo.png` | Logo 资源 |
| `school/public/stamp.png` | 装饰图资源 |
| `school/public/stamp.png~` | 疑似编辑器备份文件，建议确认是否需要继续保留 |

## 类型声明

### `school/function`

| 文件 | 说明 |
|---|---|
| `school/function/audio.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/builtin.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/character.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/chat_message.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/displayed_message.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/extension.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/generate.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/global.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/import_raw.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/index.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/inject.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/lorebook.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/lorebook_entry.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/macro_like.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/preset.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/raw_character.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/script.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/slash.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/tavern_regex.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/util.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/variables.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/version.d.ts` | SillyTavern Function API 类型声明 |
| `school/function/worldbook.d.ts` | SillyTavern Function API 类型声明 |

### `school/iframe`

| 文件 | 说明 |
|---|---|
| `school/iframe/event.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/exported.ejstemplate.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/exported.mvu.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/exported.sillytavern.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/exported.tavernhelper.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/script.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/util.d.ts` | SillyTavern iframe / helper API 类型声明 |
| `school/iframe/variables.d.ts` | SillyTavern iframe / helper API 类型声明 |

### `school/src/types`

| 文件 | 说明 |
|---|---|
| `school/src/types/sillytavern.d.ts` | 项目本地补充类型声明 |

## 维护提示

- 继续扩展时，优先关注高耦合模块：`school/src/components/GameMain.vue`、`school/src/components/SchoolRosterFilterPanel.vue`、`school/src/stores/gameStore.ts`、`school/src/utils/worldbookParser.js`、`school/src/utils/npcScheduleSystem.js`。
- 若后续要做更细粒度维护，建议把当前脚本继续扩展为输出 Graphviz / SVG，或接入 AST 解析替代正则扫描。
