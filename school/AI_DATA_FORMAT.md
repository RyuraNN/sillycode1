# AI 数据输出格式规范

为了实现游戏逻辑与 AI 剧情生成的无缝结合，AI 输出的内容中可能包含特定的数据块。这些数据块将用于更新游戏状态（如时间、背包、属性等），而不会直接显示给玩家。

## 格式约定

所有数据块必须包裹在 `[GAME_DATA]` 和 `[/GAME_DATA]` 标记之间。内容必须是合法的 JSON 格式。

```
[GAME_DATA]
{
  "key": "value",
  ...
}
[/GAME_DATA]
```

## 支持的模块

### 1. 时间推进 (`time_delta`)

用于通知系统时间流逝了多少。系统会自动处理日期变更和星期计算。

```json
{
  "time_delta": {
    "hour": 1,   // 推进1小时
    "minute": 30 // 推进30分钟
  }
}
```
> 注：旧的 `"time"` (绝对时间设置) 指令已不推荐使用。

### 2. 经验值获取 (`exp`)

用于增加角色经验值。

```json
{
  "exp": {
    "base": 50, // 基础经验值（用于升级）
    "subjects": {
      "math": 10, // 数学经验 +10
      "english": 5
    },
    "skills": {
      "programming": 20 // 编程经验 +20
    }
  }
}
```

### 3. 位置更新 (`location`)

用于更新玩家当前所在的位置。

```json
{
  "location": "location_id"
}
```

### 4. 变量更新 (`delta` 和 `set`)

用于更新游戏中的各种变量。

*   **`delta` (增量更新)**：用于所有**数值型**变量的变更。系统会自动计算最终结果并进行边界检查。
*   **`set` (状态设置)**：用于**非数值型**状态的变更（如布尔值、字符串）。

**支持的变量路径示例：**
*   `player.money`: 玩家金钱
*   `player.health`: 玩家健康值 (0-100)
*   `player.attributes.mood`: 玩家心境 (0-100)
*   `player.relationships.hasLover`: 是否有恋人 (true/false)
*   `player.currentGoal`: 当前目标 (string)
*   `clubs.basketball.activity`: 篮球部活跃度
*   `worldState.economy`: 世界经济指数 (0-100)
*   `worldState.weather`: 天气 (string)

**示例：**

```json
[GAME_DATA]
{
  "delta": {
    "clubs.basketball.activity": 50,     // 活跃度 +50
    "player.money": -200,                // 金钱 -200
    "worldState.economy": -5,            // 经济指数 -5
    "player.health": -10                 // 健康值 -10
  },
  "set": {
    "player.relationships.hasLover": true, // 确立恋爱关系
    "player.currentGoal": "寻找导师",      // 设置当前目标
    "worldState.weather": "rainy"          // 天气变为下雨
  }
}
[/GAME_DATA]
```

### 5. NPC 记录 (`npcs`)

用于记录或更新与玩家有过互动的 NPC 信息。以 **NPC 姓名** 为主要标识符，`id` 为可选字段。

```json
{
  "npcs": [
    {
      "name": "NPC 姓名",
      "isAlive": true     // (可选) 更新是否存活/在场状态
    }
  ]
}
```
> 注：好感度更新请使用 `npc_relationship` 指令，此处的 `relationship` 字段已弃用。

### 6. NPC 强制移动 (`npc_move`)

用于强制 NPC 移动到指定地点并停留一段时间，此期间将忽略原有的日程安排。

```json
{
  "npc_move": [
    {
      "name": "后藤一里",
      "location": "live_house_starry",
      "duration": 2 // 持续时间（小时）
    }
  ]
}
```

**参数说明：**
- `name`：NPC 姓名（必需）
- `location`：目标地点 ID（必需）
- `duration`：停留时长，单位为小时（必需）

### 7. NPC 心情更新 (`npc_mood`)

用于更新 NPC 的心情状态，这将影响他们的日常行迹和行为模式。

**支持的心情类型：**
- `happy`：开心（倾向于社交场所）
- `sad`：难过（倾向于独处或回家）
- `stressed`：焦虑（倾向于图书馆或工作场所）
- `energetic`：元气（倾向于户外或运动场所）
- `tired`：疲惫（倾向于回家或休息区）
- `angry`：生气（倾向于独处或散步）
- `romantic`：心动（倾向于约会场所）
- `neutral`：平静（无特殊倾向）

```json
{
  "npc_mood": [
    {
      "name": "后藤一里",
      "mood": "stressed",
      "reason": "明天要演出，非常紧张",
      "duration": 3
    },
    {
      "name": "伊地知虹夏",
      "mood": "energetic",
      "reason": "喝了能量饮料",
      "duration": 1
    }
  ]
}
```

**参数说明：**
- `name`：NPC 姓名（必需）
- `mood`：心情类型（必需）
- `reason`：心情变化原因（可选）
- `duration`：持续时间，单位为回合/小时（可选，默认1）

### 8. NPC 关系更新 (`npc_relationship`)

用于更新角色之间的人际关系。所有角色都使用**角色名**作为唯一标识符。

**关系四维轴：**
- `intimacy`：亲密度（-100到100，负值为疏远，正值为亲密）
- `trust`：信赖度（-100到100，负值为猜忌，正值为信赖）
- `passion`：激情度（-100到100，负值为反感，正值为热情/浪漫吸引）
- `hostility`：敌意（0到100，无敌意到死敌）

**分组类型：**
- `classmate`：同学
- `friend`：朋友
- `closeFriend`：密友
- `lover`：恋人
- `family`：家人
- `clubMember`：社团成员
- `senior`：前辈
- `junior`：后辈
- `other`：其他

```json
{
  "npc_relationship": [
    {
      "source": "后藤一里",
      "target": "伊地知虹夏",
      "delta": {
        "intimacy": 5,
        "trust": 3,
        "passion": 0,
        "hostility": 0
      },
      "add_tags": ["可靠的队长"],
      "add_groups": ["closeFriend"],
      "event": {
        "type": "cooperation",
        "description": "一起完成了乐队演出"
      }
    },
    {
      "source": "伊地知虹夏",
      "target": "后藤一里",
      "delta": { "intimacy": 5, "trust": 3 },
      "add_tags": ["有趣的吉他手"]
    }
  ]
}
```

**说明：**
- **支持单个对象或对象数组**：如果只有一个关系变更，可以使用单个对象；如果有多个，请使用数组。
- `source`：关系的来源角色（对目标的看法）
- `target`：关系的目标角色
- `delta`：关系值的变化量（增量更新）
- `add_tags`：添加新的印象标签
- `add_groups`：添加到指定分组
- `event`（可选）：记录导致关系变化的事件

**自动好友规则：**
- **NPC对NPC**：当关系满足条件（亲密/信赖 > 30 且 无敌意）时，自动建立社交好友关系。
- **NPC对玩家**：**不会**自动成为好友。玩家的好友添加必须由AI通过 `<add_friend>` 指令明确执行。

## 社交系统交互协议

社交系统使用独立的 XML 风格标签进行交互，不包含在 `[GAME_DATA]` 中。

### 1. 接收消息 (`social_msg`)

当 AI 扮演的角色向玩家发送手机消息时使用。

```xml
<!-- 方式一：指定 ID 和 名称 (传统) -->
<social_msg from="char_id" name="显示名称">消息内容</social_msg>

<!-- 方式二：仅指定角色名称 (系统自动查找 ID) -->
<social_msg from="角色名称">消息内容</social_msg>
```

### 1.5. 群聊发言 (`group_msg`)

当 AI 扮演的角色在群聊中发言时使用。请务必使用此标签而非 `social_msg`，以避免系统无法识别群组。

```xml
<group_msg group="群组名称" sender="发言人姓名">消息内容</group_msg>
```

**参数说明：**
- `group`: 目标群组的名称。系统会进行模糊匹配。
- `sender`: 发言角色的姓名（用于显示头像和名字）。
- 消息内容: 实际的对话内容。

**示例:**

```xml
<group_msg group="结束乐队" sender="后藤一里">
大家明天有空练习吗？
</group_msg>
```
> 注：如果使用方式二，系统会自动在好友、群组以及所有 NPC 列表中查找该名称对应的 ID。

### 2. 添加好友 (`add_friend`)

当 AI 决定添加玩家为好友时使用。

```xml
<!-- 方式一：带有签名（推荐） -->
<add_friend name="显示名称" avatar="emoji">个性签名</add_friend>

<!-- 方式二：自闭合（无签名，系统将使用默认签名） -->
<add_friend name="显示名称" avatar="emoji" />
```

### 2.1 拒绝好友 (`reject_friend`)

当 AI 决定拒绝玩家的好友申请时使用。

```xml
<reject_friend name="申请人名称" reason="拒绝理由" />
```

### 2.5. 邀请加入群聊 (`join_group`)

当 AI 邀请玩家加入群聊时使用。

```xml
<join_group name="群名称" members="成员1,成员2,成员3" />
```
- `id`: 群组唯一ID（建议使用英文字符）
- `name`: 群组显示名称
- `members`: 初始成员列表（ID 或 姓名，逗号分隔，不需包含 player）

### 2.6. 群聊发言 (`social_msg`)

当 AI 扮演的角色在群聊中发言时，需要使用 `<social_msg>` 标签。为了方便，系统支持自动匹配群名称。

**推荐格式：**

```xml
<social_msg from="群组名称" sender="发言人姓名">消息内容</social_msg>
```

**参数说明：**
- `from`: 目标群组的名称（或ID）。系统会自动忽略全角/半角符号的差异进行匹配。例如填“结束乐队”即可。
- `sender`: 发言角色的姓名（用于显示头像和名字）。
- 消息内容: 实际的对话内容。

**示例:**

```xml
<social_msg from="结束乐队" sender="后藤一里">
大家明天有空练习吗？
</social_msg>
```

> 注：`name` 属性现已成为可选参数，如果 `from` 中已经填写了群名称，则不需要再填写 `name`。

### 3. 朋友圈互动

#### 发布动态 (`moment_post`)

```xml
<!-- 方式一：指定 ID 和 名称 (传统) -->
<moment_post from="char_id" name="显示名称">动态内容</moment_post>

<!-- 方式二：仅指定用户名称 (系统自动查找 ID) -->
<moment_post user="角色名称">动态内容</moment_post>
```

#### 点赞和评论

```xml
<!-- 点赞 -->
<!-- id: 朋友圈动态的 ID -->
<!-- user: 点赞角色的名称 (系统自动查找 ID) -->
<moment_like id="moment_id" user="角色名称" />

<!-- 评论 -->
<!-- id: 朋友圈动态的 ID -->
<!-- user: 评论角色的名称 -->
<moment_comment id="moment_id" user="角色名称">评论内容</moment_comment>
```

### 4. 日历事件添加 (`add_calendar_event`)

```xml
<add_calendar_event date="2024-05-01" name="劳动节活动" />
```

### 5. 交互管理 (`social_status`)

用于通知系统对玩家的消息进行处理（忽略或暂缓）。

```xml
<!-- 方式一：使用 ID -->
<social_status id="char_id">status</social_status>

<!-- 方式二：使用角色名 (推荐) -->
<social_status name="角色名">status</social_status>
```

**Status 状态值：**
*   `pass`: 已读/无视。清除该角色的所有待回复提示。
*   `hold`: 暂缓回复。保留待回复提示（通常不需要显式输出，因为默认即为 hold）。

### 6. 社团管理

```xml
<!-- 批准申请 / 邀请玩家加入社团 -->
<join_club id="club_id" />

<!-- 拒绝社团申请 -->
<reject_club id="club_id" from="拒绝人姓名" reason="拒绝理由" />

<!-- 强制玩家退出社团 -->
<leave_club id="club_id" />

<!-- 接受社团邀请（当玩家邀请NPC时） -->
<club_invite_accept id="club_id" name="角色名" />

<!-- 拒绝社团邀请（当玩家邀请NPC时） -->
<club_invite_reject id="club_id" name="角色名" reason="拒绝理由" />
```

### 7. 物品操作

```xml
<!-- 添加物品 -->
<!-- 必须提供 name, category, description。id 由系统自动生成，无需提供。 -->
<!-- category 支持以下标准分类（推荐使用中文分类以支持装备系统）： -->
<!-- 
  [消耗品] 餐饮, 零食
  [书籍] 学习用具
  [服装] 服饰-帽子, 服饰-外套, 服饰-内搭, 服饰-下装, 服饰-袜子, 服饰-鞋子, 服饰-饰品
  [礼物] 礼物
  [娱乐] 娱乐
  [锻炼] 锻炼
  [日用] 日用品
  [杂项] 杂项
-->
<!-- 注意：对于可装备的物品，必须精确使用上述“服饰-xx”的分类名称，否则无法装备到对应槽位。 -->
<add_item name="物品名称" count="1" category="餐饮" description="物品的详细描述" />

<!-- 移除物品 -->
<!-- 如果知道 id 则使用 id，否则可以使用 name -->
<remove_item id="item_id" count="1" />
<!-- 或者 -->
<remove_item id="物品名称" count="1" />
```

## 事件系统 (Event System)

事件系统负责管理随机事件、节日活动和校园怪谈。

### 1. 事件触发通知（系统 -> AI）

当系统检测到事件触发时，会在提示词中显示：

```text
[突发事件] 台风警报
因台风来袭，学校临时停课。

[怪谈传闻] 旧校舍的幽灵
有传闻说深夜的旧校舍里会出现哭泣的幽灵。
(如果玩家接触到此事件，请使用 <event_involved id="event_haunted_old_building" /> 标记)
```

### 2. 事件卷入确认（AI -> 系统）

当玩家在剧情中接触到怪谈类事件时，AI 应使用此标签通知系统：

```xml
<event_involved id="event_id" />
```

## 总结系统 (Summary System)

总结系统用于在长对话中节省 token 用量。系统会自动生成三层总结，越远的上下文使用越精简的总结来替代原文。

### 1. 小总结 (`minor_summary`)

每轮对话后生成的详细正文总结。

```xml
<minor_summary>本轮正文的详细总结内容，保留关键剧情、对话、情感变化等</minor_summary>
```

**生成时机**：每次 AI 回复后自动生成
**字数建议**：200-400字
**内容要求**：
- 保留关键剧情发展和角色行动
- 保留重要对话要点
- 保留情感变化和关系进展
- 使用第三人称叙述

### 2. 大总结 (`major_summary`)

将多个小总结合并后的精简总结。

```xml
<major_summary>多个小总结合并后的精简内容</major_summary>
```

**生成时机**：当小总结数量达到设定阈值时自动生成
**字数建议**：300字以内
**内容要求**：
- 保留核心剧情脉络
- 合并重复信息
- 删除次要细节

### 3. 超级总结 (`super_summary`)

将多个大总结再次合并的超精简总结。

```xml
<super_summary>多个大总结合并后的超精简内容</super_summary>
```

**生成时机**：当大总结数量达到设定阈值时自动生成
**字数建议**：200字以内
**内容要求**：
- 只保留最关键的剧情转折点
- 高度压缩信息

### 总结替换规则

上下文构建时，根据消息楼层与当前楼层的距离决定使用哪种内容：

| 距离 | 使用内容 |
|------|----------|
| < 小总结起始楼层 | 原文 |
| 小总结起始楼层 ~ 大总结起始楼层 | 小总结 |
| 大总结起始楼层 ~ 超级总结起始楼层 | 大总结 |
| > 超级总结起始楼层 | 超级总结 |

## 建议回复系统 (Suggested Replies)

当玩家开启“建议回复”功能时，AI 需要在回复末尾生成 3-4 个建议玩家回复的内容选项。

```xml
<suggested_replies>
["回复选项1", "回复选项2", "回复选项3", "回复选项4"]
</suggested_replies>
```

**格式要求：**
- 必须使用标准的 JSON 数组格式
- 包裹在 `<suggested_replies>` 标签中
- 每个选项应该是简短的文本字符串
- 数量建议为 4 个

---

### 世界书存储规范 (Event System)

#### 事件库条目
*   **名称**: `[Event] 天华学园随机事件库`
*   **状态**: Disabled (禁用，仅供系统读取)
*   **内容格式**: `id|名称|类型|持续天数|描述|条件`

#### 触发器条目
*   **名称**: `[EventTrigger] 事件触发条件`
*   **状态**: Disabled (禁用)
*   **内容格式**: `类型|条件|事件ID|权重`
