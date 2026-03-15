import { useState, useRef, useEffect } from 'react'
import { sendTsplViaBluetooth, isBluetoothPrintAvailable } from './bluetoothPrint.js'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

const LABEL_TEMPLATES_KEY = 'ddlabel_label_templates'
const LABEL_LAST_TEMPLATE_KEY = 'ddlabel_last_template'
const THEME_STORAGE_KEY = 'ddlabel_theme'
const SHELF_LOCAL_KEY = 'ddlabel_shelf_local'

function getLocalShelf() {
  try {
    const raw = localStorage.getItem(SHELF_LOCAL_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function setLocalShelf(items) {
  try {
    localStorage.setItem(SHELF_LOCAL_KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

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
  timeLeft: { fontSize: 16, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
  timeRight: { fontSize: 16, offsetX: 0, offsetY: 0, weight: 0, stretch: 0 },
}

const defaultLabelVisibility = {
  title: true,
  dateLeft: true,
  dateRight: true,
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
  const [phraseHeight, setPhraseHeight] = useState(36)
  const phraseResizeRef = useRef(null)
  const [parsedResult, setParsedResult] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [pendingVoiceTemplates, setPendingVoiceTemplates] = useState([])
  const recognitionRef = useRef(null)
  const voiceModeRef = useRef(false)
  const voiceErrorRef = useRef(false)
  const autoPrintTimerRef = useRef(null)
  const okPrintTimerRef = useRef(null)
  const pendingVoiceTemplatesRef = useRef([])
  const voiceAccumulatedRef = useRef([]) // накопленные шаблоны между сессиями распознавания
  const voiceCrossSessionRef = useRef([]) // транскрипты между перезапусками recognition (пауза → onend → restart)

  // Справочник сроков (при загрузке показываем локальную копию, затем обновляем с сервера — п. 8.4)
  const [shelfItems, setShelfItems] = useState(() => getLocalShelf())
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
  // #region agent log
  const [_dlDebug, _setDlDebug] = useState('')
  // #endregion

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

  const [labelMode, setLabelMode] = useState('double') // 'double' | 'single'
  const labelModeRef = useRef('double')
  const [activeTab, setActiveTab] = useState('main')
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    voiceModeRef.current = isVoiceMode
  }, [isVoiceMode])

  useEffect(() => {
    labelModeRef.current = labelMode
  }, [labelMode])

  useEffect(() => {
    pendingVoiceTemplatesRef.current = pendingVoiceTemplates
  }, [pendingVoiceTemplates])

  useEffect(() => {
    return () => {
      if (autoPrintTimerRef.current) {
        clearTimeout(autoPrintTimerRef.current)
        autoPrintTimerRef.current = null
      }
      if (okPrintTimerRef.current) {
        clearTimeout(okPrintTimerRef.current)
        okPrintTimerRef.current = null
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }
  }, [])

  const updateTsplSide = (side, field, value) => {
    setTsplParams((prev) => ({
      ...prev,
      [side]: { ...prev[side], [field]: value },
    }))
  }

  const loadShelf = async (showSuccessMessage = false) => {
    setShelfLoading(true)
    setShelfStatus(null)
    try {
      const res = await fetch(`${API_BASE}/api/shelf`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.items)) {
        setShelfItems(data.items)
        setLocalShelf(data.items)
        if (showSuccessMessage) setShelfStatus({ type: 'ok', message: 'Справочник загружен с сервера' })
      } else {
        const local = getLocalShelf()
        if (local.length) setShelfItems(local)
        setShelfStatus({ type: 'error', message: 'Не удалось загрузить справочник' })
      }
    } catch {
      const local = getLocalShelf()
      if (local.length) {
        setShelfItems(local)
        setShelfStatus({ type: 'ok', message: 'Используется локальная копия (сервер недоступен)' })
      } else {
        setShelfStatus({ type: 'error', message: 'Сервер недоступен. Синхронизируйте при появлении сети.' })
      }
    } finally {
      setShelfLoading(false)
    }
  }

  useEffect(() => { loadShelf() }, [])

  // Автообновление локальной копии справочника при появлении сети (п. 8.4)
  useEffect(() => {
    const onOnline = () => loadShelf()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

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
    const visToSave = Object.fromEntries(Object.entries(labelVisibility).filter(([k]) => k !== 'infinity'))
    all[name] = { labelControls, labelVisibility: visToSave, selectedElement, tsplParams }
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
    const loadedVis = t.labelVisibility || {}
    const { infinity: _inf, ...visRest } = loadedVis
    setLabelVisibility({ ...defaultLabelVisibility, ...visRest })
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

  const splitTextTemplates = (text) => {
    const raw = (text || '').replace(/\r\n/g, '\n')
    if (!raw.trim()) return []
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const QUANTITY_WORDS = {
    'два':2,'две':2,'три':3,'четыре':4,'пять':5,'шесть':6,'семь':7,'восемь':8,'девять':9,
    'десять':10,'одиннадцать':11,'двенадцать':12,'тринадцать':13,'четырнадцать':14,'пятнадцать':15,
    'шестнадцать':16,'семнадцать':17,'восемнадцать':18,'девятнадцать':19,'двадцать':20,
    'тридцать':30,'сорок':40,'пятьдесят':50,
  }

  const parseQuantityWord = (word) => {
    if (!word) return NaN
    const w = word.toLowerCase().trim()
    if (/^\d+$/.test(w)) return parseInt(w, 10)
    if (QUANTITY_WORDS[w] != null) return QUANTITY_WORDS[w]
    const parts = w.split(/\s+/)
    if (parts.length === 2 && QUANTITY_WORDS[parts[0]] && QUANTITY_WORDS[parts[1]]) {
      return QUANTITY_WORDS[parts[0]] + QUANTITY_WORDS[parts[1]]
    }
    return NaN
  }

  // «N штук» / «N штуки» в конце шаблона → { phrase, count }. N от 2 до 50. Поддерживает слова.
  const parseTemplateQuantity = (template) => {
    const trimmed = (template || '').trim()
    const m = trimmed.match(/\s+(\S+(?:\s+\S+)?)\s+штук(?:и|а|е)?\s*$/i)
    if (!m) return { phrase: trimmed, count: 1 }
    const n = parseQuantityWord(m[1])
    if (Number.isNaN(n) || n < 2 || n > 50) return { phrase: trimmed, count: 1 }
    return { phrase: trimmed.slice(0, m.index).trim(), count: n }
  }

  const clearAutoPrintTimer = () => {
    if (autoPrintTimerRef.current) {
      clearTimeout(autoPrintTimerRef.current)
      autoPrintTimerRef.current = null
    }
  }

  // Отправка фразы на разбор и печать (общая логика для кнопки и голоса)
  // Возвращает true при успехе, false при ошибке.
  const sendPhraseToPrint = async (text) => {
    const trimmed = normalizePhrase(text)
    if (!trimmed) return false
    const currentMode = labelModeRef.current
    setStatus(null)
    setParsedResult(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: trimmed, singleMode: currentMode === 'single' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus({ type: 'ok', message: data.message || 'Этикетка отправлена на печать.' })
        return true
      }
      const errMsg = data.message || data.error || `Ошибка ${res.status}`
      // #region agent log
      fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:sendPhraseToPrint',message:'503 branch check',data:{status:res.status,errMsg,btAvail:isBluetoothPrintAvailable(),includes:errMsg.includes('локальном запуске')},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      if (res.status === 503 && errMsg.includes('локальном запуске') && isBluetoothPrintAvailable()) {
        setStatus({ type: 'info', message: 'Печать по Bluetooth… Выберите принтер.' })
        try {
          // #region agent log
          const _t0 = Date.now();
          // #endregion
          const tsplRes = await fetch(`${API_BASE}/api/print-tspl`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phrase: trimmed, singleMode: currentMode === 'single' }),
          })
          const tsplData = await tsplRes.json().catch(() => ({}))
          // #region agent log
          fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:sendPhraseToPrint',message:'print-tspl response',data:{ok:tsplRes.ok,status:tsplRes.status,hasBase64:!!tsplData.tsplBase64,base64Len:tsplData.tsplBase64?.length,elapsed:Date.now()-_t0},timestamp:Date.now(),hypothesisId:'H4_H5'})}).catch(()=>{});
          // #endregion
          if (!tsplRes.ok || !tsplData.tsplBase64) {
            setStatus({ type: 'error', message: tsplData.error || 'Не удалось получить данные для печати.' })
            return false
          }
          const bt = await sendTsplViaBluetooth(tsplData.tsplBase64)
          // #region agent log
          fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:sendPhraseToPrint',message:'bluetooth result',data:{btOk:bt.ok,btError:bt.error,totalElapsed:Date.now()-_t0},timestamp:Date.now(),hypothesisId:'H1_H2_H3'})}).catch(()=>{});
          // #endregion
          if (bt.ok) {
            setStatus({ type: 'ok', message: 'Этикетка отправлена на печать по Bluetooth.' })
            return true
          }
          clearAutoPrintTimer()
          setPendingVoiceTemplates([])
          setStatus({ type: 'error', message: bt.error || 'Ошибка печати по Bluetooth.' })
          return false
        } catch (e) {
          // #region agent log
          fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:sendPhraseToPrint',message:'bluetooth catch',data:{name:e?.name,message:e?.message},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
          clearAutoPrintTimer()
          setPendingVoiceTemplates([])
          setStatus({ type: 'error', message: e.message || 'Ошибка печати по Bluetooth.' })
          return false
        }
      }
      if (res.status === 503 && errMsg.includes('локальном запуске')) {
        setStatus({ type: 'error', message: 'Печать по USB доступна только при локальном запуске на ПК с принтером. Для печати с телефона нужен Chrome 117+ (ПК) или Chrome 138+ (Android) и Bluetooth.' })
      } else {
        setStatus({ type: 'error', message: errMsg })
      }
      return false
    } catch (err) {
      setStatus({ type: 'error', message: 'Сервер недоступен.' })
      return false
    } finally {
      setLoading(false)
    }
  }

  // Объединяет строки «N штук» (отдельные или в составе шаблона) с соответствующими шаблонами.
  // Возвращает массив { phrase, count }.
  const resolveTemplatesWithQuantity = (templates) => {
    const result = []
    for (const t of templates) {
      const trimmed = (t || '').trim()
      // Чисто «N штук» без продукта (например «4 штуки», «четыре штуки»)
      const isOnlyQtyWithNum = /^\s*(\S+(?:\s+\S+)?)\s+штук(?:и|а|е)?\s*$/i.test(trimmed)
      if (isOnlyQtyWithNum && result.length) {
        const qtyMatch = trimmed.match(/^(\S+(?:\s+\S+)?)\s+штук/i)
        if (qtyMatch) {
          const n = parseQuantityWord(qtyMatch[1])
          if (!Number.isNaN(n) && n >= 2 && n <= 50) {
            result[result.length - 1].count = n
            continue
          }
        }
      }
      // Просто «штуки» без числа — число может быть в конце предыдущего шаблона
      const isOnlyQtyWord = /^\s*штук(?:и|а|е)?\s*$/i.test(trimmed)
      if (isOnlyQtyWord && result.length) {
        const prevPhrase = result[result.length - 1].phrase
        const trailingNum = prevPhrase.match(/\s+(\d+)\s*$/)
        if (trailingNum) {
          const n = parseInt(trailingNum[1], 10)
          if (n >= 2 && n <= 50) {
            result[result.length - 1].phrase = prevPhrase.slice(0, trailingNum.index).trim()
            result[result.length - 1].count = n
            continue
          }
        }
        continue
      }
      const { phrase, count } = parseTemplateQuantity(t)
      result.push({ phrase, count })
    }
    return result
  }

  const triggerVoiceBatchPrint = (templates) => {
    const list = templates && templates.length ? templates : []
    if (!list.length) return
    clearAutoPrintTimer()
    setPendingVoiceTemplates([])
    ;(async () => {
      let allOk = true
      const resolved = resolveTemplatesWithQuantity(list)
      for (const { phrase, count } of resolved) {
        for (let i = 0; i < count; i++) {
          const ok = await sendPhraseToPrint(phrase)
          if (!ok) allOk = false
        }
      }
      if (allOk) {
        setPhrase('')
        setParsedResult(null)
        voiceAccumulatedRef.current = []
        voiceCrossSessionRef.current = []
      }
    })()
  }

  const scheduleAutoPrint = (templates) => {
    if (!templates.length) return
    clearAutoPrintTimer()
    autoPrintTimerRef.current = setTimeout(() => {
      triggerVoiceBatchPrint(templates)
    }, 7000)
  }

  const addVoiceTemplatesFromTranscript = (transcript) => {
    const raw = (transcript || '').trim()
    if (!raw) return
    const normalizedFull = normalizePhrase(raw)
    if (!normalizedFull) return

    // «ок» / «ok» / «окей» — команда печати, не пишем в поле. Удаляем в любом регистре и раскладке.
    const okRe = /(?:^|[\s.,!?])(окей|ок|ok|oк|okay)(?:[\s.,!?]|$)/i
    const hasOk = okRe.test(normalizedFull)
    const withoutOk = normalizedFull.replace(new RegExp(okRe.source, 'gi'), ' ').replace(/\s+/g, ' ').trim()
    // #region agent log
    const _dlTail = normalizedFull.length > 30 ? '…' + normalizedFull.slice(-30) : normalizedFull
    _setDlDebug(`[D] "${_dlTail}" ok=${hasOk} wo="${withoutOk.slice(-15)}"`)
    fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:addVoice',message:'hasOk-check',data:{normalizedFull,hasOk,withoutOk},timestamp:Date.now(),hypothesisId:'H1-H5'})}).catch(()=>{});
    // #endregion
    // Только «ок» — печать с небольшой задержкой, чтобы успеть принять «грязные фрукты» и т.п., если они приходят отдельным результатом
    if (!withoutOk) {
      if (hasOk) {
        // #region agent log
        _setDlDebug(prev => prev + ' → onlyOk(pending=' + pendingVoiceTemplatesRef.current.length + ')')
        fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:onlyOk',message:'only-ok-branch',data:{pendingLen:pendingVoiceTemplatesRef.current.length},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        if (okPrintTimerRef.current) clearTimeout(okPrintTimerRef.current)
        okPrintTimerRef.current = setTimeout(() => {
          okPrintTimerRef.current = null
          const toPrint = pendingVoiceTemplatesRef.current
          if (toPrint.length) {
            triggerVoiceBatchPrint(toPrint)
            setPendingVoiceTemplates([])
          }
        }, 450)
      }
      return
    }
    // Только соединительное «и» — продлеваем таймер
    if (/^и$/i.test(withoutOk)) {
      if (pendingVoiceTemplates.length) {
        scheduleAutoPrint(pendingVoiceTemplates)
      }
      return
    }

    // Слова-числительные и «штук» — не считаются началом нового шаблона
    const quantityWords = /^(два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|штук|штуки|штука|штуке)\b/i

    const parseToSegments = (text) =>
      text
        .split(/\s+и\s+/i)
        .flatMap((s) => {
          const normalized = normalizePhrase(s.trim())
          if (!normalized) return []
          const parts = normalized.split(/(?<=\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2})\s+(?=[а-яёa-z])/i)
          // Склеиваем обратно фрагменты, начинающиеся с числительных/«штук»
          const merged = []
          for (const p of parts) {
            const clean = normalizePhrase(p.trim())
            if (!clean) continue
            if (merged.length && quantityWords.test(clean)) {
              merged[merged.length - 1] += ' ' + clean
            } else {
              merged.push(clean)
            }
          }
          return merged
        })

    const newSegments = parseToSegments(withoutOk)
    if (!newSegments.length) return

    // Новая сессия распознавания даёт только новый фрагмент — дополняем. Иначе заменяем полным транскриптом.
    const prevJoined = voiceAccumulatedRef.current.join(' ')
    const isNewSession = prevJoined && !withoutOk.startsWith(prevJoined) && withoutOk !== prevJoined
    let updated
    if (isNewSession) {
      const prev = voiceAccumulatedRef.current
      const last = prev[prev.length - 1]
      const firstNew = newSegments[0]
      // Если новый сегмент — количественный суффикс (например «штуки», «4 штуки»), склеиваем с последним
      const allNewText = newSegments.join(' ').trim()
      const isQtySuffix = /^(\S+\s+)?штук(?:и|а|е)?\s*$/i.test(allNewText)
      if (isQtySuffix && prev.length) {
        updated = [...prev.slice(0, -1), last + ' ' + allNewText]
      } else if (last && firstNew && firstNew.startsWith(last)) {
        updated = [...prev.slice(0, -1), ...newSegments]
      } else {
        updated = [...prev, ...newSegments]
      }
    } else {
      updated = newSegments
    }
    voiceAccumulatedRef.current = updated

    if (hasOk) {
      // #region agent log
      _setDlDebug(prev => prev + ' → PRINT!')
      fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'App.jsx:hasOk-triggerPrint',message:'ok-triggered-print',data:{updatedLen:updated.length,updated},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      voiceAccumulatedRef.current = []
      voiceCrossSessionRef.current = []
      triggerVoiceBatchPrint(updated)
      setPendingVoiceTemplates([])
      setPhrase(updated.join('\n'))
      return
    }

    setPendingVoiceTemplates(updated)
    scheduleAutoPrint(updated)
    setPhrase(updated.join('\n'))
  }

  const startVoiceSession = () => {
    if (!SpeechRecognitionAPI) {
      setStatus({ type: 'error', message: 'Голосовой ввод не поддерживается в этом браузере (нужен Chrome/Edge).' })
      return
    }
    if (recognitionRef.current || loading || !voiceModeRef.current || voiceErrorRef.current) return

    const Recognition = SpeechRecognitionAPI
    const recognition = new Recognition()
    recognition.lang = 'ru-RU'
    recognition.continuous = true
    recognition.interimResults = false
    recognitionRef.current = recognition

    voiceCrossSessionRef.current.push('')

    recognition.onresult = (event) => {
      const sessionTranscript = Array.from(event.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
      voiceCrossSessionRef.current[voiceCrossSessionRef.current.length - 1] = sessionTranscript
      const fullTranscript = voiceCrossSessionRef.current.filter(Boolean).join(' ')
      addVoiceTemplatesFromTranscript(fullTranscript)
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setStatus({ type: 'error', message: 'Доступ к микрофону запрещён.' })
        voiceErrorRef.current = true
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onend = () => {
      recognitionRef.current = null
      if (voiceModeRef.current && !voiceErrorRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current && !recognitionRef.current && !voiceErrorRef.current) {
            startVoiceSession()
          }
        }, 150)
      } else {
        setIsListening(false)
      }
    }

    setStatus(null)
    setIsListening(true)
    recognition.start()
  }

  const handleVoiceToggle = () => {
    if (!isVoiceMode) {
      if (!SpeechRecognitionAPI) {
        setStatus({ type: 'error', message: 'Голосовой ввод не поддерживается в этом браузере (нужен Chrome/Edge).' })
        return
      }
      voiceErrorRef.current = false
      voiceCrossSessionRef.current = []
      setIsVoiceMode(true)
      voiceModeRef.current = true
      startVoiceSession()
    } else {
      setIsVoiceMode(false)
      voiceModeRef.current = false
      voiceErrorRef.current = false
      clearAutoPrintTimer()
      setPendingVoiceTemplates([])
      voiceCrossSessionRef.current = []
      setIsListening(false)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }
  }

  const handleParseAndPrint = async () => {
    const templates = splitTextTemplates(phrase)
    if (!templates.length) {
      setStatus({ type: 'error', message: 'Введите фразу.' })
      return
    }
    setStatus(null)
    const resolved = resolveTemplatesWithQuantity(templates)
    let allOk = true
    for (const { phrase: p, count } of resolved) {
      for (let i = 0; i < count; i++) {
        const ok = await sendPhraseToPrint(p)
        if (!ok) allOk = false
      }
    }
    if (allOk) {
      setPhrase('')
      setParsedResult(null)
    }
  }

  const handleClearPhrase = () => {
    setPhrase('')
    setParsedResult(null)
    setStatus(null)
    setPendingVoiceTemplates([])
    voiceAccumulatedRef.current = []
    clearAutoPrintTimer()
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
        body: JSON.stringify({ phrase: text, singleMode: labelModeRef.current === 'single' }),
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

  const applyControl = (key) => {
    const { fontSize, offsetX, offsetY, weight = 0, stretch = 0 } = labelControls[key] || {}
    // Жирность: влево — тоньше (мин. ~150, на 50% тоньше прежнего минимума), вправо — жирнее
    const fw = Math.max(100, Math.min(900, 400 + weight * 125))
    const ls = `${stretch}px`
    return {
      fontFamily: "'Teko', sans-serif",
      fontSize: `${fontSize}px`,
      transform: `translate(${offsetX}px, ${offsetY}px)`,
      fontWeight: fw,
      letterSpacing: ls,
    }
  }

  const previewStyle = {
    justifyContent: 'space-between',
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

      <div className="app-tabs-wrap">
        <nav className="app-tabs">
          <button
            type="button"
            className={`app-tab ${activeTab === 'main' ? 'app-tab-active' : ''}`}
            onClick={() => setActiveTab('main')}
          >
            Главная
          </button>
          <button
            type="button"
            className={`app-tab ${activeTab === 'shelf' ? 'app-tab-active' : ''}`}
            onClick={() => setActiveTab('shelf')}
          >
            Справочник
          </button>
          <button
            type="button"
            className={`app-tab ${activeTab === 'settings' ? 'app-tab-active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Настройки
          </button>
        </nav>
      </div>

      {activeTab === 'main' && (
      <section className="card">
        <p>Фраза (продукт и дата/время изготовления). Для пакетной печати добавьте «N штук» (2–50):</p>
        <div className="phrase-row">
          <div className="phrase-input-wrap">
            <textarea
              className="phrase-input phrase-input-main"
              placeholder="сыр Россия 10 03 11 10"
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value)
              }}
              disabled={loading || isVoiceMode}
              style={{ height: phraseHeight }}
            />
            <div
              className="phrase-resize-handle"
              onMouseDown={(e) => {
                e.preventDefault()
                phraseResizeRef.current = { startY: e.clientY, startHeight: phraseHeight }
                const onMove = (ev) => {
                  if (!phraseResizeRef.current) return
                  const dy = ev.clientY - phraseResizeRef.current.startY
                  setPhraseHeight((h) => Math.min(400, Math.max(36, phraseResizeRef.current.startHeight + dy)))
                }
                const onUp = () => {
                  phraseResizeRef.current = null
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
              onTouchStart={(e) => {
                e.preventDefault()
                const touch = e.touches[0]
                phraseResizeRef.current = { startY: touch.clientY, startHeight: phraseHeight }
                const onMove = (ev) => {
                  if (!phraseResizeRef.current) return
                  const t = ev.touches[0]
                  const dy = t.clientY - phraseResizeRef.current.startY
                  setPhraseHeight(() => Math.min(400, Math.max(36, phraseResizeRef.current.startHeight + dy)))
                }
                const onUp = () => {
                  phraseResizeRef.current = null
                  document.removeEventListener('touchmove', onMove)
                  document.removeEventListener('touchend', onUp)
                }
                document.addEventListener('touchmove', onMove, { passive: false })
                document.addEventListener('touchend', onUp)
              }}
              title="Потяните для изменения высоты"
            />
          </div>
          <button
            type="button"
            className="parse-btn-small"
            style={{ height: phraseHeight + 12 }}
            onClick={handleParseOnly}
            disabled={loading || isVoiceMode}
            title="Разобрать"
          >
            Р
          </button>
        </div>
        <div className="card-buttons phrase-buttons">
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={loading}
            className={isVoiceMode ? 'voice-btn voice-btn-active' : 'voice-btn'}
          >
            Голос
          </button>
          <button type="button" onClick={handleParseAndPrint} disabled={loading}>
            {loading ? 'Отправка…' : 'на Печать'}
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${labelMode === 'single' ? 'mode-toggle-active' : ''}`}
            onClick={() => setLabelMode((m) => (m === 'double' ? 'single' : 'double'))}
            disabled={loading}
            title={labelMode === 'double' ? 'Переключить на одиночный режим' : 'Переключить на двойной режим'}
          >
            {labelMode === 'double' ? 'Двойной' : 'Одиночн'}
          </button>
          <button
            type="button"
            className="phrase-clear-btn"
            onClick={handleClearPhrase}
            disabled={loading || !phrase}
          >
            Сброс
          </button>
        </div>
        {parsedResult && (
          <p className="parsed-info">
            <strong>{parsedResult.productName}</strong>
            {labelMode === 'single'
              ? ` — изготовление: ${new Date(parsedResult.madeAt).toLocaleString('ru-RU')}`
              : ` — изготовление: ${new Date(parsedResult.madeAt).toLocaleString('ru-RU')}, срок до: ${new Date(parsedResult.expiresAt).toLocaleString('ru-RU')}`}
          </p>
        )}
      </section>
      )}

      {activeTab === 'shelf' && (
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
          <button type="button" onClick={() => loadShelf(true)} disabled={shelfLoading} className="shelf-sync-btn" title="Загрузить справочник с сервера и сохранить локальную копию">
            {shelfLoading ? '…' : 'Обновить с сервера'}
          </button>
        </div>
        {shelfStatus && (
          <p className={shelfStatus.type === 'ok' ? 'status ok' : 'status error'}>
            {shelfStatus.message}
          </p>
        )}
      </section>
      )}

      {activeTab === 'settings' && (
      <>
        <section className="card settings-theme-row">
          <h2 className="card-title">Тема</h2>
          <div className="theme-toggle">
            <button
              type="button"
              className={`theme-toggle-btn ${theme === 'light' ? 'theme-toggle-active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Светлая
            </button>
            <button
              type="button"
              className={`theme-toggle-btn ${theme === 'dark' ? 'theme-toggle-active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Тёмная
            </button>
          </div>
        </section>

        <section className="card settings-print-modes">
          <h2 className="card-title">Печать</h2>
          <p className="card-desc">Режимы работы с телефона (приложение или сайт в браузере, печать по Bluetooth на принтер):</p>
          <div className="print-modes-list">
            <div className="print-mode-block">
              <h3 className="print-mode-title">Онлайн</h3>
              <p>Телефон + Bluetooth-принтер, есть интернет. Справочник сроков подгружается и обновляется с сервера. Доступны голосовой и текстовый ввод.</p>
            </div>
            <div className="print-mode-block">
              <h3 className="print-mode-title">Офлайн</h3>
              <p>Телефон + Bluetooth-принтер без интернета. Используется сохранённая на устройстве копия справочника. Ввод только текстом (голос без сети недоступен).</p>
            </div>
          </div>
          <p className="card-desc print-modes-note">Когда нет интернета или сеть нестабильна, приложение может переключиться на локальный режим — тогда расчёт срока идёт по локальной копии справочника.</p>
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
                  const errMsg = data.message || data.error || `Ошибка ${res.status}`
                  if (res.status === 503 && errMsg.includes('локальном запуске')) {
                    setStatus({ type: 'error', message: 'Печать по USB доступна только при локальном запуске на ПК с принтером.' })
                  } else {
                    setStatus({ type: 'error', message: errMsg })
                  }
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
      </>
      )}

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

      <div className="status-wrap">
        {status && (
          <p className={`status ${status.type === 'ok' ? 'ok' : status.type === 'info' ? 'info' : 'error'}`}>
            {status.message}
          </p>
        )}
      </div>
      {/* #region agent log */}
      {(_dlDebug || window._btLog) && <pre style={{position:'fixed',bottom:0,left:0,right:0,background:'#ff0',color:'#000',fontSize:'11px',padding:'4px 8px',zIndex:9999,margin:0,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{_dlDebug}{window._btLog ? '\nBT: ' + window._btLog : ''}</pre>}
      {/* #endregion */}
    </div>
  )
}

export default App
