import { useState, useRef } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

const SpeechRecognitionAPI = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// Тестовые данные для мини-этапа 1
const testLabel = {
  productName: 'Бекон слайс',
  madeAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
}

function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [parsedResult, setParsedResult] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

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

  const handlePrintTest = async () => {
    setStatus(null)
    setParsedResult(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testLabel),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus({ type: 'ok', message: data.message || 'Этикетка отправлена на печать.' })
      } else {
        setStatus({ type: 'error', message: data.message || data.error || `Ошибка ${res.status}` })
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Сервер недоступен. Запустите сервис (npm start в папке server).' })
    } finally {
      setLoading(false)
    }
  }

  const handleParseAndPrint = () => {
    const text = (phrase || '').trim()
    if (!text) {
      setStatus({ type: 'error', message: 'Введите фразу.' })
      return
    }
    sendPhraseToPrint(text)
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
        <p>Тестовая этикетка: <strong>{testLabel.productName}</strong></p>
        <button onClick={handlePrintTest} disabled={loading}>
          {loading ? 'Отправка…' : 'Печать тестовой этикетки'}
        </button>
      </section>

      {status && (
        <p className={status.type === 'ok' ? 'status ok' : 'status error'}>
          {status.message}
        </p>
      )}
    </div>
  )
}

export default App
