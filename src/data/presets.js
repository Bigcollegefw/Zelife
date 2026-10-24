// 内置预设：工作日 + 周末。
// scene 字段：time/title/bgKey/narration/photo(用户照片，持久化)/choices[]。
// delta 是状态值变化：正数回升（更好），负数下滑（更坏）。
// feedback 是选择后的旁白；reflect 是夜记里的追忆句（缺省回退到 feedback）。

export const BUILTIN_PRESETS = [
  {
    id: 'workday',
    name: '工作日',
    scenes: [
      {
        id: 'wake', // 放一张 wake.jpg 到 src/assets/scenes/ 也可作为默认背景
        time: '08:30',
        title: '清晨 · 卧室',
        bgKey: 'dawn',
        narration: '闹钟响到第三遍。窗帘的缝隙里，天已经亮透了。被窝很暖，而接下来的一整天，正等你在这一刻开口。',
        choices: [
          {
            text: '起床，拉开窗帘',
            delta: 8,
            feedback: '光一下子涌了进来。空气有点凉，但你清醒了——今天，是你先动的手。',
            reflect: '那道晨光，后来一直跟着你走了很远。',
          },
          {
            text: '再躺十分钟……',
            delta: -12,
            feedback: '十分钟，又十分钟。被窝越来越暖，有什么东西正从指缝里悄悄漏出去。',
            reflect: '被窝收走了半个上午，也顺手收走了一点底气。',
          },
        ],
      },
      {
        id: 'breakfast',
        time: '09:30',
        title: '早晨 · 街道',
        bgKey: 'street',
        narration: '洗漱完毕，肚子轻轻叫了。楼下的早餐铺，应该正是热气腾腾的时候。',
        choices: [
          {
            text: '出门，去买一份热早餐',
            delta: 8,
            feedback: '豆浆是烫的，风是凉的。你走在晨光里，隐约觉得：这一天听你的。',
            reflect: '一杯热豆浆下肚，你确信这一天是听你的。',
          },
          {
            text: '点份外卖，边等边刷手机',
            delta: -12,
            feedback: '手指往下滑，视频一个接一个。外卖到的时候，已经不太热了。',
            reflect: '指尖划过的热闹，终究填不满清晨的空。',
          },
          {
            text: '冲杯麦片，认真吃完',
            delta: 2,
            feedback: '不算丰盛，但胃是踏实的。你稳稳地接住了这个上午。',
            reflect: '简单的一餐，把上午稳稳地托在了手里。',
          },
        ],
      },
      {
        id: 'afternoon',
        time: '14:00',
        title: '午后 · 房间',
        bgKey: 'noon',
        narration: '午后的光斜斜地落在地板上。你恰好有一段完整的空档——身体和惰性，都在等你的答复。',
        choices: [
          {
            text: '换上运动鞋，去出一身汗',
            delta: 15,
            feedback: '心跳快起来的时候，那些模糊的烦躁也跟着蒸发了。你重新拿回了身体。',
            reflect: '汗水是最诚实的证词，身体替你记住了它。',
          },
          {
            text: '就这样瘫一会儿吧',
            delta: -10,
            feedback: '沙发稳稳地接住了你。很舒服，舒服得让人有点心慌。',
            reflect: '沙发很软，软得让人忘了时间仍在走动。',
          },
          {
            text: '出门散步二十分钟',
            delta: 5,
            feedback: '没有想象中那么难。走了两圈，脑子里的雾像是散开了一些。',
            reflect: '二十分钟的风，吹散了心里积着的一半雾。',
          },
        ],
      },
      {
        id: 'evening',
        time: '19:30',
        title: '傍晚 · 书桌',
        bgKey: 'dusk',
        narration: '天色一点一点暗下来。桌上还摊着那些你想做、却一直没有开始的事。',
        choices: [
          {
            text: '坐下来，做完其中一件',
            delta: 10,
            feedback: '只完成了一件小事。但完成就是完成——它会在夜里替你说话。',
            reflect: '那件完成的小事，在夜里轻轻替你说了话。',
          },
          {
            text: '算了，先躺着刷会儿手机',
            delta: -10,
            feedback: '又一个傍晚，从亮着的屏幕上滑了过去。你安慰自己：明天再说。',
            reflect: '屏幕暗下去的那一刻，心里也跟着沉了一下。',
          },
          {
            text: '花十分钟整理房间',
            delta: 4,
            feedback: '东西归位之后，心里也跟着松了一小块。',
            reflect: '归位的不只是物品，还有一点失序的生活。',
          },
        ],
      },
      {
        id: 'night',
        time: '23:00',
        title: '深夜 · 床边',
        bgKey: 'night',
        narration: '夜很静，手机的光映在你脸上。今天和明天之间，只隔着一个放下的动作。',
        choices: [
          {
            text: '放下手机，去睡',
            delta: 10,
            feedback: '灯黑下来的那一瞬间，今天被妥善地收好了。晚安。',
            reflect: '你把今天妥当地收好，郑重地交给了睡眠。',
          },
          {
            text: '再刷一集，就一集',
            delta: -12,
            feedback: '一集，又一集。夜越来越深，你越来越清醒，也越来越空。',
            reflect: '一集接着一集，夜色与清醒一起被耗到了底。',
          },
        ],
      },
    ],
  },
  {
    id: 'weekend',
    name: '周末',
    scenes: [
      {
        id: 'we_wake',
        time: '09:00',
        title: '早晨 · 被窝',
        bgKey: 'dawn',
        narration: '不用闹钟的早晨，反而醒得不晚。光透过窗帘落在枕头上——今天，完整地属于你。',
        choices: [
          {
            text: '起来，给自己做顿早午餐',
            delta: 8,
            feedback: '煎蛋的滋滋声里，周末有了周末的样子。',
            reflect: '一顿亲手做的早午餐，把周末端端正正地开了头。',
          },
          {
            text: '继续睡，睡到中午',
            delta: -10,
            feedback: '再睁眼已是正午。半天，就这么无声地没了。',
            reflect: '半个白天在枕头上蒸发了，醒来时有点怅然。',
          },
        ],
      },
      {
        id: 'we_out',
        time: '11:30',
        title: '上午 · 门口',
        bgKey: 'street',
        narration: '天气不错。门外的世界和家里的沙发，都在争取你。',
        choices: [
          {
            text: '出门走走，晒晒太阳',
            delta: 8,
            feedback: '阳光落在肩上的重量，比想象中踏实。',
            reflect: '你把好天气用在了自己身上，一点没浪费。',
          },
          {
            text: '宅着，刷手机点外卖',
            delta: -10,
            feedback: '一天没出门，屏幕比窗外更亮。',
            reflect: '窗外的天很蓝，可惜只出现在别人的朋友圈里。',
          },
          {
            text: '约很久没见的朋友',
            delta: 5,
            feedback: '见面的路有点远，但走过去就值。',
            reflect: '那句「最近怎么样」，续上了一段快断掉的线。',
          },
        ],
      },
      {
        id: 'we_hobby',
        time: '16:00',
        title: '下午 · 兴趣角',
        bgKey: 'noon',
        narration: '一段完整的时间。那些「等有空再做」的事，现在有空了。',
        choices: [
          {
            text: '沉浸做一件喜欢的事',
            delta: 10,
            feedback: '心流来的那一刻，时间过得又快又慢。',
            reflect: '那件「等有空」的事，终于等到了你。',
          },
          {
            text: '躺平，随便刷点什么',
            delta: -10,
            feedback: '一下午像水一样流走了，没留下痕迹。',
            reflect: '流水一样的一下午，握不住，也没留下什么。',
          },
        ],
      },
      {
        id: 'we_night',
        time: '22:30',
        title: '夜晚 · 房间',
        bgKey: 'night',
        narration: '周末的尾声。你想到周一，也想到还没安顿好的自己。',
        choices: [
          {
            text: '收拾房间和心情，早点睡',
            delta: 8,
            feedback: '干净的空间里，睡意来得也干净。',
            reflect: '你把周末收了尾，也把周一的自己安顿好了。',
          },
          {
            text: '熬夜，把周末熬到最后一刻',
            delta: -12,
            feedback: '越熬越醒。好像舍不得，又好像不甘心。',
            reflect: '舍不得结束的周末，被熬成了疲惫的开始。',
          },
        ],
      },
    ],
  },
]
