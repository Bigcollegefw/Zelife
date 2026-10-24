/* 验证码邮件：走 Resend REST。
   M1 无自有域名 → from 只能是 onboarding@resend.dev，且只能发给 Resend 注册者本人邮箱。
   将来换域名 / 换供应商（如 Brevo）只改本文件。 */

const FROM = 'galplan <onboarding@resend.dev>'

function html(code) {
  const box = (s) => `<div style="font-size:12px;color:#8A857B;line-height:1.8;">${s}</div>`
  return `<div style="margin:0;padding:24px;background:#FAF8F4;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #E7E1D6;border-radius:12px;padding:32px 28px;text-align:center;">
    <div style="font-size:13px;color:#8A857B;letter-spacing:.2em;margin-bottom:18px;">galplan</div>
    <div style="font-size:15px;color:#33302B;margin-bottom:22px;">你的登录验证码</div>
    <div style="font-size:34px;letter-spacing:.35em;text-indent:.35em;font-weight:600;color:#33302B;margin-bottom:22px;">${code}</div>
    ${box('10 分钟内有效。<br>如果不是你在登录，请忽略这封邮件。')}
  </div>
</div>`
}

function text(code) {
  return `你的 galplan 登录验证码：${code}（10 分钟内有效）。如果不是你在登录，请忽略这封邮件。`
}

export async function sendVerificationEmail(env, to, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: `galplan 登录验证码 ${code}`, // 通知栏不点开也能看到码
      html: html(code),
      text: text(code),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[mail]', res.status, body) // 403=发给了非本人邮箱（resend.dev 限制），429=超免费额度
    throw new Error('mail_send_failed')
  }
}
