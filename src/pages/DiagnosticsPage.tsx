import { useEffect, useState } from 'react'
import { Check, Download, Radio, Square } from 'lucide-react'
import { useI18n } from '../i18n'
import { reportTrace } from '../protocol/hero68/reportTrace'
import '../components/RgbSettingsPage.css'
import './DiagnosticsPage.css'

const VI: Record<string, string> = {
  'Diagnostics': 'Chẩn đoán',
  'Record the reports OpenHero68 and the keyboard exchange.': 'Ghi lại các report OpenHero68 và bàn phím trao đổi.',
  'Use it when a key setting or an effect does not behave as expected: start recording, repeat the change, then save the file. The log contains key positions and values, not what you type.': 'Dùng khi một cài đặt phím hoặc hiệu ứng chạy không đúng: bắt đầu ghi, lặp lại thay đổi đó rồi lưu file. Log chỉ chứa vị trí phím và giá trị, không chứa nội dung bạn gõ.',
  'Start recording': 'Bắt đầu ghi',
  'Stop recording': 'Dừng ghi',
  'Save log file': 'Lưu file log',
  'Requirements': 'Điều kiện',
  'Connect the keyboard and change a setting in OpenHero68 while recording. Reports are also recorded through the Windows background service.': 'Kết nối bàn phím và đổi một cài đặt trong OpenHero68 khi đang ghi. Report chạy qua dịch vụ nền cũng được ghi lại.',
  'Reports recorded': 'Số report đã ghi',
  'Dropped': 'Bỏ qua',
  'This log shows what OpenHero68 sends. To compare with the configuration app of another brand, record what that app sends instead.': 'Log này cho thấy OpenHero68 gửi gì. Muốn so với app cấu hình của hãng khác, hãy ghi lại thứ app đó gửi.',
}

export default function DiagnosticsPage() {
  const { language, tr } = useI18n()
  const t = (text: string) => (language === 'vi' ? VI[text] ?? tr(text) : text)
  const [state, setState] = useState(reportTrace.getSnapshot())

  useEffect(() => reportTrace.subscribe(() => setState(reportTrace.getSnapshot())), [])

  const download = () => {
    const doc = reportTrace.export()
    const name = `openhero68-trace-${doc.startedAt.replace(/[:.]/g, '-')}.json`
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div className="page settings-page diagnostics-page page-enter">
      <header className="diagnostics-heading">
        <h1>{t('Diagnostics')}</h1>
        <p>{t('Record the reports OpenHero68 and the keyboard exchange.')}</p>
      </header>
      <section className="settings-card diagnostics-card">
        <p className="diagnostics-copy">{t('Use it when a key setting or an effect does not behave as expected: start recording, repeat the change, then save the file. The log contains key positions and values, not what you type.')}</p>
        <div className="diagnostics-actions">
          {state.recording
            ? <button type="button" className="apply-button is-danger" onClick={() => reportTrace.stop()}><Square size={15} />{t('Stop recording')}</button>
            : <button type="button" className="apply-button" onClick={() => reportTrace.start()}><Radio size={15} />{t('Start recording')}</button>}
          <button type="button" className="secondary-button" onClick={download} disabled={state.recording || state.count === 0}><Download size={15} />{t('Save log file')}</button>
        </div>
        <dl className="diagnostics-counts">
          <div><dt>{t('Reports recorded')}</dt><dd>{state.count}</dd></div>
          <div><dt>{t('Dropped')}</dt><dd>{state.dropped}</dd></div>
        </dl>
        <p className="diagnostics-note"><Check size={14} />{t('Requirements')}</p>
        <p className="diagnostics-copy">{t('Connect the keyboard and change a setting in OpenHero68 while recording. Reports are also recorded through the Windows background service.')}</p>
        <p className="diagnostics-copy diagnostics-hint">{t('This log shows what OpenHero68 sends. To compare with the configuration app of another brand, record what that app sends instead.')}</p>
      </section>
    </div>
  )
}
