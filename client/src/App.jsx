import { useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Тестовые данные для мини-этапа 1 (как в плане)
const testLabel = {
  productName: 'Бекон слайс',
  madeAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
}

function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    setStatus(null)
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
        const msg = data.message || data.error || `Ошибка ${res.status}`
        setStatus({ type: 'error', message: msg })
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Сервер недоступен. Запустите сервис (npm start в папке server).' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>DDLabel</h1>
      <p className="subtitle">Печать этикеток по голосу</p>
      <section className="card">
        <p>Тестовая этикетка: <strong>{testLabel.productName}</strong></p>
        <button onClick={handlePrint} disabled={loading}>
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
