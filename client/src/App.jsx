import { useState, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

const SpeechRecognitionAPI = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

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

  // Ширины колонок таблицы «Список продуктов» (в rem), можно менять ползунками
  const [shelfColWidths, setShelfColWidths] = useState({ product: 20, expiry: 7, actions: 11 })
  const [shelfResizingCol, setShelfResizingCol] = useState(null)
  const shelfResizeStartRef = useRef({ x: 0, width: 0 })

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

  // Ресайз колонок таблицы «Список продуктов»
  useEffect(() => {
    if (!shelfResizingCol) return
    const minW = { product: 10, expiry: 5, actions: 9 }
    const maxW = { product: 45, expiry: 12, actions: 18 }
    const onMove = (e) => {
      const start = shelfResizeStartRef.current
      if (!start) return
      const deltaRem = (e.clientX - start.x) / 16
      const newWidth = Math.min(maxW[shelfResizingCol], Math.max(minW[shelfResizingCol], start.width + deltaRem))
      setShelfColWidths((prev) => ({ ...prev, [shelfResizingCol]: newWidth }))
    }
    const onUp = () => {
      setShelfResizingCol(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [shelfResizingCol])

  const startShelfResize = (col, e) => {
    e.preventDefault()
    shelfResizeStartRef.current = { x: e.clientX, width: shelfColWidths[col] }
    setShelfResizingCol(col)
  }

  // Отображение срока в таблице: 25–36 часов показываем как «1 сутки X часов»
  const formatShelfDisplay = (item) => {
    if (item.unit === 'days') return `${item.value} суток`
    const h = item.value
    if (h > 24 && h <= 36) return `1 сутки ${h - 24} часов`
    return `${h} часов`
  }

  // Отправка фразы на разбор и печать (общая логика для кнопки и голоса)
  const sendPhraseToPrint = async (text) => {
    const trimmed = (text || '').trim()
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
    recognition.continuous = false
    recognition.interimResults = false
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setPhrase(transcript)
      sendPhraseToPrint(transcript)
    }

    recognition.onerror = (event) => {
      const msg = event.error === 'not-allowed' ? 'Доступ к микрофону запрещён.' : `Ошибка распознавания: ${event.error}.`
      setStatus({ type: 'error', message: msg })
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    setStatus(null)
    setIsListening(true)
    recognition.start()
  }

  const handleParseAndPrint = () => {
    const text = (phrase || '').trim()
    if (!text) {
      setStatus({ type: 'error', message: 'Введите фразу.' })
      return
    }
    sendPhraseToPrint(text)
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

  return (
    <div className="app">
      <h1>DDLabel</h1>
      <p className="subtitle">Печать этикеток по голосу</p>

      <section className="card">
        <p>Фраза (продукт и дата/время изготовления):</p>
        <input
          type="text"
          className="phrase-input"
          placeholder="Бекон слайс, изготовление вчера в 18:10"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          disabled={loading || isListening}
        />
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
                <table className={`shelf-table shelf-table-resizable${shelfResizingCol ? ' shelf-resizing' : ''}`} style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: `${shelfColWidths.product}rem` }} />
                    <col style={{ width: `${shelfColWidths.expiry}rem` }} />
                    <col style={{ width: `${shelfColWidths.actions}rem` }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="shelf-product-col">
                        Продукт
                        <span className="shelf-col-resizer" onMouseDown={(e) => startShelfResize('product', e)} title="Тяните для изменения ширины" />
                      </th>
                      <th className="shelf-expiry-col">
                        Срок
                        <span className="shelf-col-resizer" onMouseDown={(e) => startShelfResize('expiry', e)} title="Тяните для изменения ширины" />
                      </th>
                      <th className="shelf-actions-col">
                        <span className="shelf-col-resizer" onMouseDown={(e) => startShelfResize('actions', e)} title="Тяните для изменения ширины" />
                      </th>
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
