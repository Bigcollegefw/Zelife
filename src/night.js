// 夜记生成器：demo 阶段用本地模板写成一篇三五百字的信。
// 正式版将把当天的决策数据交给 LLM，按同样的文风撰写。
// 优先读做选择时的文案快照（snap），剧本后来被改过也不影响历史。

const OPENINGS = {
  bad: '这一天过得有些沉，像隔着一层起雾的玻璃看世界。',
  sad: '云层压得低了一些，但光还在，你也还在。',
  ok: '有晴有阴，像所有真实的日子一样，起伏而不失序。',
  good: '天光很配合，风也顺。这一天的底色，是你亲手调亮的。',
  great: '一整天都在你手上，连光都顺着你。',
}

const CLOSINGS = {
  bad: '被压得很沉的一天，谁都会遇到。它不定义你，明天的第一个决定才是。先睡吧，把力气留给清晨。',
  sad: '丧气不说明什么，它只是累了。睡一觉，把判断留给清醒的早晨。晚安。',
  ok: '不需要完美，只需要主线还在自己手上，而你已经做到了。好好睡吧，明天见。',
  good: '把这一天走得稳稳的人，是你自己。愿你带着这份踏实入睡——明早，第一个决定还会准时来敲门。',
  great: '值得记住的一天——不是因为结果，是因为你一直在场。把这份痛快收好，明天见。',
}

/** 轮换的作答句式，避免几个时刻一个腔调 */
const VERBS = [
  '你选择了「%s」',
  '你把答案交给了「%s」',
  '「%s」，你如此作答',
  '这一次，你选了「%s」',
  '最后，你决定「%s」',
]

/**
 * @param log       决策日志 [{ sceneId, choiceIndex, missed, snap }]
 * @param scenes    今天使用的时刻表（用于旧存档无快照时的回退查询）
 * @param tierKey   当前状态档位 key（bad/sad/ok/good/great）
 * @param dateLabel 如「10月17日 · 星期五」
 */
export function nightNote(log, scenes, tierKey, dateLabel) {
  const head = `${dateLabel}。${OPENINGS[tierKey] ?? OPENINGS.ok}`

  const lines = []
  let i = 0
  for (const entry of log) {
    const scene = scenes.find((s) => s.id === entry.sceneId)
    const time = entry.snap?.time ?? scene?.time ?? ''
    const title = entry.snap?.title ?? scene?.title ?? ''

    if (entry.missed && !entry.late) {
      lines.push(`${time}，${title}，没有等到你的回答，无声地散在了那天的光线里。`)
      continue
    }

    const choice = scene?.choices?.[entry.choiceIndex]
    const choiceText = entry.snap?.choiceText ?? choice?.text ?? '……'
    // 追忆句去掉收尾标点再统一补句号，避免出现「。。」
    const reflect = (entry.snap?.reflect ?? choice?.reflect ?? choice?.feedback ?? '').replace(
      /[。．.、，,\s]+$/,
      '',
    )
    if (entry.late) {
      // 补做的回答：单独句式，不进轮换池——迟来说的是真话
      lines.push(
        reflect
          ? `${time}，${title}，迟来的回答是「${choiceText}」。${reflect}。`
          : `${time}，${title}，迟来的回答是「${choiceText}」。`,
      )
      i += 1
      continue
    }
    const verb = VERBS[i % VERBS.length].replace('%s', choiceText)
    lines.push(reflect ? `${time}，${title}，${verb}。${reflect}。` : `${time}，${title}，${verb}。`)
    i += 1
  }

  const tail = CLOSINGS[tierKey] ?? CLOSINGS.ok
  // 三段结构：开篇 / 当天经过（逐行）/ 收尾，段落之间空一行
  return [head, lines.join('\n'), tail].filter(Boolean).join('\n\n')
}
