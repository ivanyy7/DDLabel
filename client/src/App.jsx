import { useState, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

const LABEL_TEMPLATES_KEY = 'ddlabel_label_templates'
const LABEL_LAST_TEMPLATE_KEY = 'ddlabel_last_template'

const SpeechRecognitionAPI = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

const TSPL_FONTS = [
  { id: '1', w: 8,  h: 12, name: '1 — 8×12 (мелкий)' },
  { id: '2', w: 12, h: 20, name: '2 — 12×20 (стандартный)' },
  { id: '3', w: 16, h: 24, name: '3 — 16×24 (средний)' },
  { id: '4', w: 24, h: 32, name: '4 — 24×32 (крупный)' },
  { id: '5', w: 32, h: 48, name: '5 — 32×48 (очень крупный)' },
  { id: '8', w: 14, h: 25, name: '8 — 14×25 (жирный)' },
]

const WIDTH_PRESETS = (() => {
  const result = []
  for (const f of TSPL_FONTS) {
    for (let sx = 1; sx <= 4; sx++) {
      const charW = f.w * sx
      if (charW > 40) continue
      result.push({ font: f.id, sx, charW, baseH: f.h, key: `${f.id}_${sx}` })
    }
  }
  result.sort((a, b) => a.charW - b.charW || a.baseH - b.baseH)
  return result
})()

function widthPresetLabel(p) {
  const sxNote = p.sx > 1 ? `, sx=${p.sx}` : ''
  return `${p.charW} точек (шрифт ${p.font}${sxNote}, выс. базовая ${p.baseH})`
}

function findWidthPreset(font, sx) {
  return WIDTH_PRESETS.find((p) => p.font === font && p.sx === sx) || WIDTH_PRESETS[1]
}

const defaultTsplParams = {
  density: 1,
  speed: 4,
  titleText: 'сыр Российский',
  title: { font: '3', sx: 1, sy: 2, x: 20, y: 25 },
  left: { font: '3', sx: 1, sy: 2, x: 18, y: 80 },
  right: { font: '3', sx: 1, sy: 2, x: 145, y: 80 },
  timeLeft: { font: '1', sx: 2, sy: 2, x: 18, y: 135 },
  timeRight: { font: '1', sx: 2, sy: 2, x: 145, y: 135 },
}

const defaultLabelControls = {
  title: { fontSize: 18, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
  dateLeft: { fontSize: 32, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
  dateRight: { fontSize: 32, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
  infinity: { fontSize: 24, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
  timeLeft: { fontSize: 16, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
  timeRight: { fontSize: 16, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
}

const defaultLabelVisibility = {
  title: true,
  dateLeft: true,
  dateRight: true,
  infinity: true,
  timeLeft: true,
  timeRight: true,
}

function loadLabelTemplatesFromStorage() {
  try {
    const raw = localStorage.getItem(LABEL_TEMPLATES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [parsedResult, setParsedResult] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

  // Справочник сроков
  const [shelfItems, setShelfItems] = useState([])
  const [shelfStatus, setShelfStatus] = useState(null)
  const [shelfLoading, setShelfLoading] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDays, setAddDays] = useState('')
  const [addHours, setAddHours] = useState('')
  const [editingKey, setEditingKey] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDays, setEditDays] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editLabelText, setEditLabelText] = useState('')
  const [editAliases, setEditAliases] = useState('')
  const [shelfListOpen, setShelfListOpen] = useState(false)
  const [aliasesModalItem, setAliasesModalItem] = useState(null)
  const [aliasesModalValue, setAliasesModalValue] = useState('')

  // Настройки превью этикетки и шаблоны
  const [selectedElement, setSelectedElement] = useState('title')
  const [labelControls, setLabelControls] = useState(() => {
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(LABEL_LAST_TEMPLATE_KEY) : null
    const all = loadLabelTemplatesFromStorage()
    if (last && all[last]) {
      return all[last].labelControls || defaultLabelControls
    }
    return defaultLabelControls
  })
  const [labelVisibility, setLabelVisibility] = useState(() => {
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(LABEL_LAST_TEMPLATE_KEY) : null
    const all = loadLabelTemplatesFromStorage()
    if (last && all[last]) {
      return all[last].labelVisibility || defaultLabelVisibility
    }
    return defaultLabelVisibility
  })
  const [savedTemplateNames, setSavedTemplateNames] = useState(() => {
    return Object.keys(loadLabelTemplatesFromStorage()).sort()
  })
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [loadTemplateName, setLoadTemplateName] = useState('')
  const [labelTemplateStatus, setLabelTemplateStatus] = useState(null)
  const [useCalibDates, setUseCalibDates] = useState(false)
  const [calibDay, setCalibDay] = useState('9')
  const [calibMonth, setCalibMonth] = useState('3')

  const [tsplParams, setTsplParams] = useState(() => {
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(LABEL_LAST_TEMPLATE_KEY) : null
    const all = loadLabelTemplatesFromStorage()
    if (last && all[last] && all[last].tsplParams) return all[last].tsplParams
    return defaultTsplParams
  })

  const updateTsplSide = (side, field, value) => {
    setTsplParams((prev) => ({
      ...prev,
      [side]: { ...prev[side], [field]: value },
    }))
  }

  const loadShelf = async () => {
    setShelfLoading(true)
    setShelfStatus(null)
    try {
      const res = await fetch(`${API_BASE}/api/shelf`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.items) setShelfItems(data.items)
      else setShelfStatus({ type: 'error', message: 'Не удалось загрузить справочник' })
    } catch (err) {
      setShelfStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setShelfLoading(false)
    }
  }

  useEffect(() => { loadShelf() }, [])

  useEffect(() => {
    const last = localStorage.getItem(LABEL_LAST_TEMPLATE_KEY)
    const all = loadLabelTemplatesFromStorage()
    if (last && all[last] && all[last].selectedElement) {
      setSelectedElement(all[last].selectedElement)
    }
  }, [])

  const saveLabelTemplate = () => {
    const name = (templateNameInput || '').trim().replace(/\s+/g, '_')
    if (!name) {
      setLabelTemplateStatus({ type: 'error', message: 'Введите название шаблона (например 1_1, 1_2).' })
      return
    }
    const all = loadLabelTemplatesFromStorage()
    all[name] = { labelControls, labelVisibility, selectedElement, tsplParams }
    try {
      localStorage.setItem(LABEL_TEMPLATES_KEY, JSON.stringify(all))
      localStorage.setItem(LABEL_LAST_TEMPLATE_KEY, name)
      setSavedTemplateNames(Object.keys(all).sort())
      setLabelTemplateStatus({ type: 'ok', message: `Шаблон «${name}» сохранён.` })
      setTemplateNameInput('')
    } catch (e) {
      setLabelTemplateStatus({ type: 'error', message: 'Не удалось сохранить шаблон.' })
    }
  }

  const loadLabelTemplate = () => {
    const name = (loadTemplateName || '').trim()
    if (!name) {
      setLabelTemplateStatus({ type: 'error', message: 'Выберите шаблон для загрузки.' })
      return
    }
    const all = loadLabelTemplatesFromStorage()
    const t = all[name]
    if (!t) {
      setLabelTemplateStatus({ type: 'error', message: `Шаблон «${name}» не найден.` })
      return
    }
    setLabelControls(t.labelControls || defaultLabelControls)
    setLabelVisibility(t.labelVisibility || defaultLabelVisibility)
    if (t.selectedElement) setSelectedElement(t.selectedElement)
    setTsplParams(t.tsplParams || defaultTsplParams)
    localStorage.setItem(LABEL_LAST_TEMPLATE_KEY, name)
    setLabelTemplateStatus({ type: 'ok', message: `Загружен шаблон «${name}».` })
  }

  // Отображение срока в таблице: 25–36 часов показываем как «1 сутки X часов»
  const formatShelfDisplay = (item) => {
    if (item.unit === 'days') return `${item.value} суток`
    const h = item.value
    if (h > 24 && h <= 36) return `1 сутки ${h - 24} часов`
    return `${h} часов`
  }

  // Нормализация фразы:
  // - "6.03"  → "6 3"
  // - "15:10" / "15.10" → "15 10"
  // - одиночные "с" между словами/числами удаляем (оставляем только "срок").
  const normalizePhrase = (text) => {
    const raw = (text || '').trim()
    if (!raw) return ''
    return raw
      .replace(/(\d{1,2})\.(\d{1,2})/g, '$1 $2')
      .replace(/(\d{1,2}):(\d{1,2})/g, '$1 $2')
      .replace(/\bс\b/gi, ' ')
      .replace(/\s+/g, ' ')
  }

  // Отправка фразы на разбор и печать (общая логика для кнопки и голоса)
  const sendPhraseToPrint = async (text) => {
    const trimmed = normalizePhrase(text)
    if (!trimmed) return
    setStatus(null)
    setParsedResult(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus({ type: 'ok', message: data.message || 'Этикетка отправлена на печать.' })
      } else {
        setStatus({ type: 'error', message: data.message || data.error || `Ошибка ${res.status}` })
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setLoading(false)
    }
  }

  const handleVoiceClick = () => {
    if (!SpeechRecognitionAPI) {
      setStatus({ type: 'error', message: 'Голосовой ввод не поддерживается в этом браузере (нужен Chrome/Edge).' })
      return
    }
    if (isListening || loading) return

    const Recognition = SpeechRecognitionAPI
    const recognition = new Recognition()
    recognition.lang = 'ru-RU'
    // Делаем сессию распознавания более «длинной»,
    // но не чрезмерной: даём ~10–11 секунд на фразу с паузами.
    recognition.continuous = true
    recognition.interimResults = false
    const sessionStart = Date.now()
    const maxDurationMs = 10500
    let hasFinalResult = false
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      const normalized = normalizePhrase(transcript)
      hasFinalResult = true
      setPhrase(normalized)
      sendPhraseToPrint(normalized)
      // После первого финального результата останавливаем распознавание,
      // чтобы не накапливать лишние фразы.
      try {
        recognition.stop()
      } catch {
        // ignore
      }
    }

    recognition.onerror = (event) => {
      const msg = event.error === 'not-allowed' ? 'Доступ к микрофону запрещён.' : `Ошибка распознавания: ${event.error}.`
      setStatus({ type: 'error', message: msg })
      setIsListening(false)
    }

    recognition.onend = () => {
      // Если финального результата ещё не было и общий лимит по времени не превышен,
      // перезапускаем распознавание — так суммарное «окно» приёма фразы становится длиннее.
      if (!hasFinalResult && Date.now() - sessionStart < maxDurationMs) {
        try {
          recognition.start()
          return
        } catch {
          // ignore и завершаем сессию ниже
        }
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    setStatus(null)
    setIsListening(true)
    recognition.start()
  }

  const handleParseAndPrint = () => {
    const text = normalizePhrase(phrase)
    if (!text) {
      setStatus({ type: 'error', message: 'Введите фразу.' })
      return
    }
    sendPhraseToPrint(text)
  }

  const handleClearPhrase = () => {
    setPhrase('')
    setParsedResult(null)
    setStatus(null)
  }

  const handleShelfAdd = async () => {
    const name = (addName || '').trim()
    const d = Number(addDays)
    const h = Number(addHours)
    if (!name) {
      setShelfStatus({ type: 'error', message: 'Введите название продукта.' })
      return
    }
    const hasDays = !Number.isNaN(d) && d > 0
    const hasHours = !Number.isNaN(h) && h > 0
    if (!hasDays && !hasHours) {
      setShelfStatus({ type: 'error', message: 'Введите срок: либо суток, либо часов.' })
      return
    }
    if (hasDays && hasHours) {
      // 1 сутки + X часов → сохраняем как часы
      const payload = { productName: name, value: d * 24 + h, unit: 'hours' }
      return await submitShelfAdd(name, payload)
    }
    if (hasDays) {
      return await submitShelfAdd(name, { productName: name, value: d, unit: 'days' })
    }
    return await submitShelfAdd(name, { productName: name, value: h, unit: 'hours' })
  }

  const submitShelfAdd = async (name, payload) => {
    setShelfStatus(null)
    setShelfLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/shelf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setAddName('')
        setAddDays('')
        setAddHours('')
        setShelfStatus({ type: 'ok', message: 'Запись добавлена.' })
        loadShelf()
      } else {
        setShelfStatus({ type: 'error', message: data.error || `Ошибка добавления (${res.status})` })
      }
    } catch (err) {
      setShelfStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setShelfLoading(false)
    }
  }

  const handleShelfUpdate = async () => {
    if (editingKey == null) return
    const name = (editName || '').trim()
    const d = Number(editDays)
    const h = Number(editHours)
    const hasDays = !Number.isNaN(d) && d > 0
    const hasHours = !Number.isNaN(h) && h > 0
    if (!hasDays && !hasHours) {
      setShelfStatus({ type: 'error', message: 'Введите срок: либо суток, либо часов.' })
      return
    }
    let value, unit
    if (hasDays && hasHours) {
      value = d * 24 + h
      unit = 'hours'
    } else if (hasDays) {
      value = d
      unit = 'days'
    } else {
      value = h
      unit = 'hours'
    }
    setShelfStatus(null)
    setShelfLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/shelf/${encodeURIComponent(editingKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: name || editingKey,
          value,
          unit,
          labelText: (editLabelText || '').trim() || undefined,
          aliases: editAliases.split(',').map((s) => s.trim()).filter(Boolean)
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setEditingKey(null)
        setShelfStatus({ type: 'ok', message: 'Запись обновлена.' })
        loadShelf()
      } else {
        setShelfStatus({ type: 'error', message: data.error || 'Ошибка обновления' })
      }
    } catch (err) {
      setShelfStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setShelfLoading(false)
    }
  }

  const handleShelfDelete = async (productName) => {
    setShelfStatus(null)
    setShelfLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/shelf/${encodeURIComponent(productName)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setShelfStatus({ type: 'ok', message: 'Запись удалена.' })
        if (editingKey === productName) setEditingKey(null)
        loadShelf()
      } else {
        setShelfStatus({ type: 'error', message: data.error || 'Ошибка удаления' })
      }
    } catch (err) {
      setShelfStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setShelfLoading(false)
    }
  }

  const startEdit = (item) => {
    setEditingKey(item.productName)
    setEditName(item.productName)
    setEditLabelText(item.labelText || '')
    setEditAliases((item.aliases || []).join(', '))
    if (item.unit === 'days') {
      setEditDays(String(item.value))
      setEditHours('')
    } else {
      const h = item.value
      if (h > 24 && h <= 36) {
        setEditDays('1')
        setEditHours(String(h - 24))
      } else {
        setEditDays('')
        setEditHours(String(h))
      }
    }
    setShelfStatus(null)
  }

  const openAliasesModal = (item) => {
    setAliasesModalItem(item)
    setAliasesModalValue((item.aliases || []).join(', '))
    setShelfStatus(null)
  }

  const saveAliasesModal = async () => {
    if (!aliasesModalItem) return
    const aliases = aliasesModalValue.split(',').map((s) => s.trim()).filter(Boolean)
    setShelfLoading(true)
    setShelfStatus(null)
    try {
      const res = await fetch(`${API_BASE}/api/shelf/${encodeURIComponent(aliasesModalItem.productName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: aliasesModalItem.productName,
          value: aliasesModalItem.value,
          unit: aliasesModalItem.unit,
          labelText: aliasesModalItem.labelText || undefined,
          aliases
        })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setAliasesModalItem(null)
        setShelfStatus({ type: 'ok', message: 'Варианты названия сохранены.' })
        loadShelf()
      } else {
        setShelfStatus({ type: 'error', message: data.error || 'Ошибка сохранения' })
      }
    } catch (err) {
      setShelfStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setShelfLoading(false)
    }
  }

  const handleParseOnly = async () => {
    const text = (phrase || '').trim()
    if (!text) {
      setStatus({ type: 'error', message: 'Введите фразу.' })
      return
    }
    setStatus(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setParsedResult({ productName: data.productName, madeAt: data.madeAt, expiresAt: data.expiresAt })
        setStatus({ type: 'ok', message: 'Фраза разобрана.' })
      } else {
        setParsedResult(null)
        setStatus({ type: 'error', message: data.error || data.message || 'Ошибка разбора' })
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Сервер недоступен.' })
    } finally {
      setLoading(false)
    }
  }

  const previewProductName = parsedResult?.productName || 'сыр Российский'
  const previewMadeAt = parsedResult?.madeAt ? new Date(parsedResult.madeAt) : new Date()
  const previewExpiresAt = parsedResult?.expiresAt ? new Date(parsedResult.expiresAt) : new Date(previewMadeAt.getTime() + 48 * 60 * 60 * 1000)

  const pad2 = (n) => String(n).padStart(2, '0')
  const numericCalibDay = Number(calibDay)
  const numericCalibMonth = Number(calibMonth)
  const useNumericCalib = useCalibDates && !Number.isNaN(numericCalibDay) && !Number.isNaN(numericCalibMonth)

  const madeDay = pad2(useNumericCalib ? numericCalibDay : previewMadeAt.getDate())
  const madeMonth = pad2(useNumericCalib ? numericCalibMonth : previewMadeAt.getMonth() + 1)
  const madeHours = pad2(previewMadeAt.getHours())
  const madeMinutes = pad2(previewMadeAt.getMinutes())
  const expDay = pad2(useNumericCalib ? numericCalibDay : previewExpiresAt.getDate())
  const expMonth = pad2(useNumericCalib ? numericCalibMonth : previewExpiresAt.getMonth() + 1)
  const expHours = pad2(previewExpiresAt.getHours())
  const expMinutes = pad2(previewExpiresAt.getMinutes())

  const onlyInfinityVisible =
    labelVisibility.infinity &&
    !labelVisibility.title &&
    !labelVisibility.dateLeft &&
    !labelVisibility.dateRight &&
    !labelVisibility.timeLeft &&
    !labelVisibility.timeRight

  const applyControl = (key) => {
    const { fontSize, offsetX, offsetY, weight = 0, stretch = 0 } = labelControls[key]
    // Жирность: влево — тоньше (мин. ~150, на 50% тоньше прежнего минимума), вправо — жирнее
    const fw = Math.max(100, Math.min(900, 400 + weight * 125))
    const ls = `${stretch}px`
    let extraY = 0
    if (key === 'infinity' && onlyInfinityVisible) {
      extraY = -fontSize * 0.25
    }
    return {
      fontFamily: "'Teko', sans-serif",
      fontSize: `${fontSize}px`,
      transform: `translate(${offsetX}px, ${offsetY + extraY}px)`,
      fontWeight: fw,
      letterSpacing: ls,
    }
  }

  const previewStyle = {
    justifyContent: onlyInfinityVisible ? 'center' : 'space-between',
  }

  const datesRowStyle = {
    justifyContent:
      !labelVisibility.dateLeft && !labelVisibility.dateRight
        ? 'center'
        : 'space-between',
  }

  const handleLabelControlChange = (field, value) => {
    setLabelControls((prev) => ({
      ...prev,
      [selectedElement]: {
        ...prev[selectedElement],
        [field]: value,
      },
    }))
  }

  const handleLabelVisibilityToggle = (key) => {
    setLabelVisibility((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  return (
    <div className="app">
      <h1>DDLabel</h1>
      <p className="subtitle">Печать этикеток по голосу</p>

      <section className="card">
        <p>Фраза (продукт и дата/время изготовления):</p>
        <div className="phrase-row">
          <input
            type="text"
            className="phrase-input phrase-input-main"
            placeholder="Бекон слайс срок с 7 ноль третьего с 10 01"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            disabled={loading || isListening}
          />
          <button
            type="button"
            className="phrase-clear-btn"
            onClick={handleClearPhrase}
            disabled={loading || isListening || !phrase}
          >
            Сбросить
          </button>
        </div>
        <div className="card-buttons">
          <button onClick={handleParseOnly} disabled={loading || isListening}>
            {loading ? '…' : 'Только разобрать'}
          </button>
          <button onClick={handleParseAndPrint} disabled={loading || isListening}>
            {loading ? 'Отправка…' : 'Разобрать и напечатать'}
          </button>
          <button onClick={handleVoiceClick} disabled={loading || isListening} className="voice-btn">
            {isListening ? 'Слушаю…' : 'Голос'}
          </button>
        </div>
        {parsedResult && (
          <p className="parsed-info">
            <strong>{parsedResult.productName}</strong> — изготовление: {new Date(parsedResult.madeAt).toLocaleString('ru-RU')}, срок до: {new Date(parsedResult.expiresAt).toLocaleString('ru-RU')}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Превью макета этикетки 30×20 мм</h2>
        <p className="card-desc">Это только визуальный макет (Open Sans), по нему будем подбирать расположение элементов для печати. Настройки можно сохранять как шаблон (1_1, 1_2 и т.д.).</p>
        <div className="label-templates-row">
          <label className="label-control">
            Название шаблона
            <input
              type="text"
              className="phrase-input shelf-input"
              placeholder="1_1, 1_2..."
              value={templateNameInput}
              onChange={(e) => { setTemplateNameInput(e.target.value); setLabelTemplateStatus(null) }}
            />
          </label>
          <button type="button" onClick={saveLabelTemplate} className="card-buttons button-inline">
            Сохранить шаблон
          </button>
        </div>
        <div className="label-templates-row">
          <label className="label-control">
            Загрузить шаблон
            <select
              value={loadTemplateName}
              onChange={(e) => { setLoadTemplateName(e.target.value); setLabelTemplateStatus(null) }}
            >
              <option value="">— выберите —</option>
              {savedTemplateNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={loadLabelTemplate} disabled={!loadTemplateName} className="card-buttons button-inline">
            Загрузить
          </button>
        </div>
        {labelTemplateStatus && (
          <p className={labelTemplateStatus.type === 'ok' ? 'status ok' : 'status error'} style={{ marginTop: '0.5rem' }}>
            {labelTemplateStatus.message}
          </p>
        )}
        <div className="label-templates-row">
          <label className="label-control">
            <span>
              Тестовые даты для калибровки
              <br />
              <label style={{ fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={useCalibDates}
                  onChange={(e) => setUseCalibDates(e.target.checked)}
                />{' '}
                использовать одинаковые ДД.ММ
              </label>
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="number"
                min="1"
                max="31"
                className="phrase-input shelf-input shelf-num"
                placeholder="День"
                value={calibDay}
                onChange={(e) => setCalibDay(e.target.value)}
              />
              <input
                type="number"
                min="1"
                max="12"
                className="phrase-input shelf-input shelf-num"
                placeholder="Месяц"
                value={calibMonth}
                onChange={(e) => setCalibMonth(e.target.value)}
              />
            </div>
          </label>
        </div>
        <div className="label-controls">
          <h3 style={{ margin: '0.5rem 0' }}>Параметры TSPL (прямые значения для принтера)</h3>
          <p className="card-desc">Этикетка 30×20 мм = 240×160 точек (203 dpi). Каждый параметр идёт напрямую в команду принтера без конвертаций.</p>
          <label className="label-control">
            Плотность печати (DENSITY) — нагрев
            <input
              type="range"
              min="0"
              max="15"
              value={tsplParams.density}
              onChange={(e) => setTsplParams((p) => ({ ...p, density: Number(e.target.value) }))}
            />
            <span className="label-control-value">{tsplParams.density} {tsplParams.density === 0 ? '(минимум)' : tsplParams.density <= 5 ? '(светло)' : tsplParams.density <= 10 ? '(норма)' : '(жирно)'}</span>
          </label>
          <label className="label-control">
            Скорость печати (SPEED) — толщина линий
            <input
              type="range"
              min="1"
              max="5"
              value={tsplParams.speed || 4}
              onChange={(e) => setTsplParams((p) => ({ ...p, speed: Number(e.target.value) }))}
            />
            <span className="label-control-value">{tsplParams.speed || 4} {(tsplParams.speed || 4) <= 2 ? '(медленно → жирнее)' : (tsplParams.speed || 4) >= 4 ? '(быстро → тоньше)' : '(средне)'}</span>
          </label>
          {(() => {
            const tp = tsplParams.title || defaultTsplParams.title
            const curPreset = findWidthPreset(tp.font, tp.sx)
            const fi = TSPL_FONTS.find((f) => f.id === tp.font)
            const charW = fi ? fi.w * (tp.sx || 1) : 0
            const charH = fi ? fi.h * (tp.sy || 1) : 0
            return (
            <fieldset className="tspl-side-fieldset">
              <legend>Название продукта (верх)</legend>
              <label className="label-control">
                Текст для печати
                <input
                  type="text"
                  className="phrase-input shelf-input"
                  placeholder="сыр Российский"
                  value={tsplParams.titleText ?? defaultTsplParams.titleText}
                  onChange={(e) => setTsplParams((p) => ({ ...p, titleText: e.target.value }))}
                />
              </label>
              <label className="label-control">
                Ширина символа (шрифт + масштаб)
                <select
                  value={curPreset.key}
                  onChange={(e) => {
                    const p = WIDTH_PRESETS.find((wp) => wp.key === e.target.value)
                    if (p) {
                      setTsplParams((prev) => ({
                        ...prev,
                        title: { ...prev.title, font: p.font, sx: p.sx },
                      }))
                    }
                  }}
                >
                  {WIDTH_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{widthPresetLabel(p)}</option>
                  ))}
                </select>
              </label>
              <div className="tspl-row">
                <label className="label-control tspl-num-label">
                  sy (высота)
                  <input type="number" min="1" max="10" value={tp.sy} onChange={(e) => updateTsplSide('title', 'sy', Number(e.target.value))} className="tspl-num-input" />
                </label>
                <label className="label-control tspl-num-label">
                  x (0–240)
                  <input type="number" min="0" max="240" value={tp.x} onChange={(e) => updateTsplSide('title', 'x', Number(e.target.value))} className="tspl-num-input" />
                </label>
                <label className="label-control tspl-num-label">
                  y (0–160)
                  <input type="number" min="0" max="160" value={tp.y} onChange={(e) => updateTsplSide('title', 'y', Number(e.target.value))} className="tspl-num-input" />
                </label>
              </div>
              <p className="tspl-hint">
                Символ: {charW}×{charH} точек ({(charW / 8).toFixed(1)}×{(charH / 8).toFixed(1)} мм).
                {(tsplParams.titleText ?? defaultTsplParams.titleText).length > 0 &&
                  ` Строка ≈ ${charW * (tsplParams.titleText ?? defaultTsplParams.titleText).length} точек (${(charW * (tsplParams.titleText ?? defaultTsplParams.titleText).length / 8).toFixed(1)} мм).`}
                {charW * (tsplParams.titleText ?? defaultTsplParams.titleText).length > 240 && <strong style={{ color: '#c00' }}> Текст шире этикетки!</strong>}
              </p>
            </fieldset>
            )
          })()}
          {['left', 'right'].map((side) => {
            const curPreset = findWidthPreset(tsplParams[side].font, tsplParams[side].sx)
            const fi = TSPL_FONTS.find((f) => f.id === tsplParams[side].font)
            const charW = fi ? fi.w * (tsplParams[side].sx || 1) : 0
            const charH = fi ? fi.h * (tsplParams[side].sy || 1) : 0
            const dateW = charW * 5
            return (
            <fieldset key={side} className="tspl-side-fieldset">
              <legend>{side === 'left' ? 'Левая дата (начало)' : 'Правая дата (конец)'}</legend>
              <label className="label-control">
                Ширина символа (шрифт + масштаб)
                <select
                  value={curPreset.key}
                  onChange={(e) => {
                    const p = WIDTH_PRESETS.find((wp) => wp.key === e.target.value)
                    if (p) {
                      setTsplParams((prev) => ({
                        ...prev,
                        [side]: { ...prev[side], font: p.font, sx: p.sx },
                      }))
                    }
                  }}
                >
                  {WIDTH_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{widthPresetLabel(p)}</option>
                  ))}
                </select>
              </label>
              <div className="tspl-row">
                <label className="label-control tspl-num-label">
                  sy (высота)
                  <input type="number" min="1" max="10" value={tsplParams[side].sy} onChange={(e) => updateTsplSide(side, 'sy', Number(e.target.value))} className="tspl-num-input" />
                </label>
                <label className="label-control tspl-num-label">
                  x (0–240)
                  <input type="number" min="0" max="240" value={tsplParams[side].x} onChange={(e) => updateTsplSide(side, 'x', Number(e.target.value))} className="tspl-num-input" />
                </label>
                <label className="label-control tspl-num-label">
                  y (0–160)
                  <input type="number" min="0" max="160" value={tsplParams[side].y} onChange={(e) => updateTsplSide(side, 'y', Number(e.target.value))} className="tspl-num-input" />
                </label>
              </div>
              <p className="tspl-hint">
                Символ: {charW}×{charH} точек ({(charW / 8).toFixed(1)}×{(charH / 8).toFixed(1)} мм).
                «10.03» = {dateW}×{charH} точек ({(dateW / 8).toFixed(1)} мм).
                {dateW > 110 && <strong style={{ color: '#c00' }}> Дата шире половины этикетки!</strong>}
              </p>
            </fieldset>
            )
          })}
          {['timeLeft', 'timeRight'].map((side) => {
            const params = tsplParams[side] || defaultTsplParams[side]
            const curPreset = findWidthPreset(params.font, params.sx)
            const fi = TSPL_FONTS.find((f) => f.id === params.font)
            const charW = fi ? fi.w * (params.sx || 1) : 0
            const charH = fi ? fi.h * (params.sy || 1) : 0
            const timeW = charW * 5
            return (
            <fieldset key={side} className="tspl-side-fieldset">
              <legend>{side === 'timeLeft' ? 'Левое время (начало)' : 'Правое время (конец)'}</legend>
              <label className="label-control">
                Ширина символа (шрифт + масштаб)
                <select
                  value={curPreset.key}
                  onChange={(e) => {
                    const p = WIDTH_PRESETS.find((wp) => wp.key === e.target.value)
                    if (p) {
                      setTsplParams((prev) => ({
                        ...prev,
                        [side]: { ...prev[side], font: p.font, sx: p.sx },
                      }))
                    }
                  }}
                >
                  {WIDTH_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{widthPresetLabel(p)}</option>
                  ))}
                </select>
              </label>
              <div className="tspl-row">
                <label className="label-control tspl-num-label">
                  sy (высота)
                  <input type="number" min="1" max="10" value={params.sy} onChange={(e) => updateTsplSide(side, 'sy', Number(e.target.value))} className="tspl-num-input" />
                </label>
                <label className="label-control tspl-num-label">
                  x (0–240)
                  <input type="number" min="0" max="240" value={params.x} onChange={(e) => updateTsplSide(side, 'x', Number(e.target.value))} className="tspl-num-input" />
                </label>
                <label className="label-control tspl-num-label">
                  y (0–160)
                  <input type="number" min="0" max="160" value={params.y} onChange={(e) => updateTsplSide(side, 'y', Number(e.target.value))} className="tspl-num-input" />
                </label>
              </div>
              <p className="tspl-hint">
                Символ: {charW}×{charH} точек ({(charW / 8).toFixed(1)}×{(charH / 8).toFixed(1)} мм).
                «10.00» = {timeW}×{charH} точек ({(timeW / 8).toFixed(1)} мм).
                {timeW > 110 && <strong style={{ color: '#c00' }}> Время шире половины этикетки!</strong>}
              </p>
            </fieldset>
            )
          })}
          <div className="tspl-row" style={{ marginTop: '0.25rem', gap: '0.5rem' }}>
            <button type="button" onClick={() => {
              setTsplParams((p) => ({ ...p, right: { ...p.left }, timeRight: { ...p.timeLeft } }))
            }} className="tspl-copy-btn">Скопировать Left → Right</button>
            <button type="button" onClick={() => setTsplParams(defaultTsplParams)} className="tspl-copy-btn">Сбросить всё</button>
          </div>
        </div>
        <div className="card-buttons" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={async () => {
              setStatus(null)
              setLoading(true)
              try {
                let madeForTest = new Date(previewMadeAt)
                let expiresForTest = new Date(previewExpiresAt)
                if (useNumericCalib) {
                  madeForTest.setMonth(numericCalibMonth - 1)
                  madeForTest.setDate(numericCalibDay)
                  expiresForTest.setMonth(numericCalibMonth - 1)
                  expiresForTest.setDate(numericCalibDay)
                }
                const tl = tsplParams.timeLeft || defaultTsplParams.timeLeft
                const tr = tsplParams.timeRight || defaultTsplParams.timeRight
                const tt = tsplParams.title || defaultTsplParams.title
                const res = await fetch(`${API_BASE}/api/test-print`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    madeAt: madeForTest.toISOString(),
                    expiresAt: expiresForTest.toISOString(),
                    density: tsplParams.density,
                    speed: tsplParams.speed || 4,
                    titleText: tsplParams.titleText ?? defaultTsplParams.titleText,
                    fontTitle: tt.font,
                    sxTitle: tt.sx,
                    syTitle: tt.sy,
                    xTitle: tt.x,
                    yTitle: tt.y,
                    fontLeft: tsplParams.left.font,
                    sxLeft: tsplParams.left.sx,
                    syLeft: tsplParams.left.sy,
                    xLeft: tsplParams.left.x,
                    yLeft: tsplParams.left.y,
                    fontRight: tsplParams.right.font,
                    sxRight: tsplParams.right.sx,
                    syRight: tsplParams.right.sy,
                    xRight: tsplParams.right.x,
                    yRight: tsplParams.right.y,
                    fontTimeLeft: tl.font,
                    sxTimeLeft: tl.sx,
                    syTimeLeft: tl.sy,
                    xTimeLeft: tl.x,
                    yTimeLeft: tl.y,
                    fontTimeRight: tr.font,
                    sxTimeRight: tr.sx,
                    syTimeRight: tr.sy,
                    xTimeRight: tr.x,
                    yTimeRight: tr.y,
                  }),
                })
                const data = await res.json().catch(() => ({}))
                if (res.ok) {
                  setStatus({ type: 'ok', message: data.message || 'Тестовая этикетка отправлена на печать.' })
                } else {
                  setStatus({ type: 'error', message: data.error || data.message || `Ошибка ${res.status}` })
                }
              } catch (e) {
                setStatus({ type: 'error', message: 'Сервер недоступен.' })
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading || isListening}
          >
            Тестовая печать
          </button>
        </div>
        <div className="label-preview">
          <div className="label-preview-grid">
            <span className="label-preview-size">240×160 точек (30×20 мм)</span>
            {(tsplParams.titleText ?? defaultTsplParams.titleText) && (
              <span
                className="label-preview-dot label-preview-dot-title"
                style={{ left: `${((tsplParams.title || defaultTsplParams.title).x / 240) * 100}%`, top: `${((tsplParams.title || defaultTsplParams.title).y / 160) * 100}%`, fontSize: '0.5rem' }}
              >
                {tsplParams.titleText ?? defaultTsplParams.titleText}
              </span>
            )}
            <span
              className="label-preview-dot label-preview-dot-left"
              style={{ left: `${(tsplParams.left.x / 240) * 100}%`, top: `${(tsplParams.left.y / 160) * 100}%` }}
            >
              {madeDay}.{madeMonth}
            </span>
            <span
              className="label-preview-dot label-preview-dot-right"
              style={{ left: `${(tsplParams.right.x / 240) * 100}%`, top: `${(tsplParams.right.y / 160) * 100}%` }}
            >
              {expDay}.{expMonth}
            </span>
            <span
              className="label-preview-dot label-preview-dot-left"
              style={{ left: `${((tsplParams.timeLeft || defaultTsplParams.timeLeft).x / 240) * 100}%`, top: `${((tsplParams.timeLeft || defaultTsplParams.timeLeft).y / 160) * 100}%`, fontSize: '0.55rem' }}
            >
              {madeHours}.{madeMinutes}
            </span>
            <span
              className="label-preview-dot label-preview-dot-right"
              style={{ left: `${((tsplParams.timeRight || defaultTsplParams.timeRight).x / 240) * 100}%`, top: `${((tsplParams.timeRight || defaultTsplParams.timeRight).y / 160) * 100}%`, fontSize: '0.55rem' }}
            >
              {expHours}.{expMinutes}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Справочник сроков</h2>
        <p className="card-desc">Добавляйте продукты и срок хранения (в часах или сутках). Справочник используется при разборе фразы и печати этикетки.</p>
        <div className="shelf-add">
          <input
            type="text"
            className="phrase-input shelf-input"
            placeholder="Название продукта"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            disabled={shelfLoading}
          />
          <label className="shelf-label">
            Суток
            <input
              type="number"
              min="0"
              step="1"
              className="phrase-input shelf-input shelf-num"
              placeholder="0"
              value={addDays}
              onChange={(e) => {
                const v = e.target.value
                setAddDays(v)
                if (v) setAddHours('')
              }}
              disabled={shelfLoading}
            />
          </label>
          <label className="shelf-label">
            Часов
            <input
              type="number"
              min="0"
              step="1"
              className="phrase-input shelf-input shelf-num"
              placeholder="0"
              value={addHours}
              onChange={(e) => {
                const v = e.target.value
                const n = Number(v)
                if (v !== '' && !Number.isNaN(n) && n > 24 && n <= 36) {
                  setAddDays('1')
                  setAddHours(String(n - 24))
                } else {
                  setAddDays('')
                  setAddHours(v)
                }
              }}
              disabled={shelfLoading}
            />
          </label>
          <button onClick={handleShelfAdd} disabled={shelfLoading}>
            {shelfLoading ? '…' : 'Добавить'}
          </button>
          <button type="button" onClick={() => setShelfListOpen(true)} className="shelf-list-btn">
            Список продуктов
          </button>
        </div>
        {shelfStatus && (
          <p className={shelfStatus.type === 'ok' ? 'status ok' : 'status error'}>
            {shelfStatus.message}
          </p>
        )}
      </section>

      {shelfListOpen && (
        <div className="shelf-modal-overlay" onClick={() => setShelfListOpen(false)}>
          <div className="shelf-modal-panel card" onClick={(e) => e.stopPropagation()}>
            <div className="shelf-modal-header">
              <h2 className="card-title">Список продуктов</h2>
              <button type="button" onClick={() => setShelfListOpen(false)} className="shelf-modal-close">Закрыть</button>
            </div>
            {shelfLoading && !shelfItems.length ? (
              <p className="shelf-loading">Загрузка…</p>
            ) : (
              <div className="shelf-table-wrap">
                <table className="shelf-table shelf-table-fixed">
                  <thead>
                    <tr>
                      <th className="shelf-product-col">Продукт</th>
                      <th className="shelf-expiry-col">Срок</th>
                      <th className="shelf-actions-col" />
                    </tr>
                  </thead>
                  <tbody>
                    {shelfItems.map((item) => (
                      <tr key={item.productName}>
                        <td className="shelf-product-cell">{item.productName}</td>
                        <td className="shelf-expiry-cell">{formatShelfDisplay(item)}</td>
                        <td className="shelf-actions-cell">
                          <button type="button" onClick={() => startEdit(item)} disabled={shelfLoading}>Изменить</button>
                          <button type="button" className="shelf-del-btn" onClick={() => handleShelfDelete(item.productName)} disabled={shelfLoading} title="Удалить">DEL</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {shelfItems.length === 0 && !shelfLoading && (
              <p className="shelf-empty">Справочник пуст. Добавьте продукты в форме выше.</p>
            )}
          </div>
        </div>
      )}

      {editingKey && (
        <div className="shelf-modal-overlay" onClick={() => setEditingKey(null)}>
          <div className="shelf-modal-panel card" onClick={(e) => e.stopPropagation()}>
            <div className="shelf-modal-header">
              <h2 className="card-title">Редактировать продукт</h2>
              <button type="button" onClick={() => setEditingKey(null)} className="shelf-modal-close">Закрыть</button>
            </div>
            <div className="shelf-edit-form">
              <label className="shelf-label">
                Продукт
                <input
                  type="text"
                  className="phrase-input shelf-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={shelfLoading}
                />
              </label>
              <label className="shelf-label">
                На этикетке
                <input
                  type="text"
                  className="phrase-input shelf-input"
                  value={editLabelText}
                  onChange={(e) => setEditLabelText(e.target.value)}
                  placeholder="Красн_с/с"
                  disabled={shelfLoading}
                />
              </label>
              <label className="shelf-label">
                Варианты названия (через запятую)
                <input
                  type="text"
                  className="phrase-input shelf-input"
                  value={editAliases}
                  onChange={(e) => setEditAliases(e.target.value)}
                  placeholder="соус красный, Красный для пиццы"
                  disabled={shelfLoading}
                />
              </label>
              <div className="shelf-add">
                <label className="shelf-label">
                  Суток
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="phrase-input shelf-input shelf-num"
                    placeholder="0"
                    value={editDays}
                    onChange={(e) => {
                      const v = e.target.value
                      setEditDays(v)
                      if (v) setEditHours('')
                    }}
                    disabled={shelfLoading}
                  />
                </label>
                <label className="shelf-label">
                  Часов
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="phrase-input shelf-input shelf-num"
                    placeholder="0"
                    value={editHours}
                    onChange={(e) => {
                      const v = e.target.value
                      const n = Number(v)
                      if (v !== '' && !Number.isNaN(n) && n > 24 && n <= 36) {
                        setEditDays('1')
                        setEditHours(String(n - 24))
                      } else {
                        setEditDays('')
                        setEditHours(v)
                      }
                    }}
                    disabled={shelfLoading}
                  />
                </label>
              </div>
            </div>
            <div className="card-buttons" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={handleShelfUpdate} disabled={shelfLoading}>{shelfLoading ? '…' : 'Сохранить'}</button>
              <button type="button" onClick={() => setEditingKey(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {aliasesModalItem && (
        <div className="shelf-modal-overlay" onClick={() => setAliasesModalItem(null)}>
          <div className="shelf-modal-panel card" onClick={(e) => e.stopPropagation()}>
            <div className="shelf-modal-header">
              <h2 className="card-title">Варианты названия: {aliasesModalItem.productName}</h2>
              <button type="button" onClick={() => setAliasesModalItem(null)} className="shelf-modal-close">Закрыть</button>
            </div>
            <p className="card-desc">Дополнительные названия продукта (через запятую). Так можно называть продукт голосом или вводом.</p>
            <input
              type="text"
              className="phrase-input"
              placeholder="соус красный, Красный для пиццы"
              value={aliasesModalValue}
              onChange={(e) => setAliasesModalValue(e.target.value)}
              disabled={shelfLoading}
            />
            <div className="card-buttons" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={saveAliasesModal} disabled={shelfLoading}>{shelfLoading ? '…' : 'Сохранить'}</button>
              <button type="button" onClick={() => setAliasesModalItem(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <p className={status.type === 'ok' ? 'status ok' : 'status error'}>
          {status.message}
        </p>
      )}
    </div>
  )
}

export default App
