import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, MessageCircle, User, Sparkles } from 'lucide-react'
import { useCouncilConfig } from '../context/CouncilConfig'
import './Chat.css'

const CHAT_API = import.meta.env.VITE_CHAT_API || 'https://chat.aidoge.co.uk'
// Fallback to direct IP if subdomain not yet propagated
const CHAT_API_FALLBACK = 'http://46.202.140.7:8430'

const SUGGESTIONS = [
  'What are the biggest spending categories?',
  'Which councillors have integrity flags?',
  'How much is council tax Band D?',
  'What roadworks are currently overdue?',
  'Who are the top suppliers by spend?',
]

function formatAnswer(text) {
  // Simple markdown-like formatting for chat bubbles
  return text
    .split('\n')
    .map((line, i) => {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={i}>{line.slice(2)}</li>
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i}><strong>{line.slice(2, -2)}</strong></p>
      }
      if (line.trim() === '') return null
      return <p key={i}>{line}</p>
    })
    .filter(Boolean)
}

export default function Chat() {
  const config = useCouncilConfig()
  const councilId = config?.council_id || 'burnley'
  const councilName = config?.council_name || 'Council'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      let apiUrl = CHAT_API
      let resp
      try {
        resp = await fetch(`${CHAT_API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: text.trim(),
            council: councilId,
            session_id: sessionId,
          }),
        })
      } catch {
        // Fallback to direct IP if subdomain fails
        apiUrl = CHAT_API_FALLBACK
      }
      if (!resp) resp = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text.trim(),
          council: councilId,
          session_id: sessionId,
        }),
      })

      if (resp.status === 429) {
        setError('Rate limit reached. Please wait a moment and try again.')
        setLoading(false)
        return
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.detail || `Error ${resp.status}`)
      }

      const data = await resp.json()
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id)
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        provider: data.provider,
        topics: data.topics,
      }])
    } catch (err) {
      setError(err.message || 'Failed to get response. Please try again.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [councilId, sessionId, loading])

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h1>
          <Sparkles size={20} style={{ verticalAlign: 'middle', marginRight: 8, color: '#12B6CF' }} />
          Ask Lancashire
        </h1>
        <p>Ask anything about {councilName} — spending, councillors, budgets, elections, and more</p>
      </div>

      {/* Suggestions (only when no messages) */}
      {messages.length === 0 && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              className="chat-suggestion-btn"
              onClick={() => sendMessage(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message--${msg.role}`}>
            <div className={`chat-avatar chat-avatar--${msg.role}`}>
              {msg.role === 'user' ? <User size={16} /> : <MessageCircle size={16} />}
            </div>
            <div>
              <div className="chat-bubble">
                {msg.role === 'assistant' ? formatAnswer(msg.content) : msg.content}
              </div>
              {msg.provider && (
                <div className="chat-provider">via {msg.provider}</div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="chat-message chat-message--assistant">
            <div className="chat-avatar chat-avatar--assistant">
              <MessageCircle size={16} />
            </div>
            <div className="chat-bubble">
              <div className="chat-typing">
                <div className="chat-typing-dot" />
                <div className="chat-typing-dot" />
                <div className="chat-typing-dot" />
              </div>
            </div>
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <form className="chat-input-form" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Ask about spending, councillors, budgets..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim() || loading}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  )
}
