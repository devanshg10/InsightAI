import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./DatasetChat.css";


function formatInlineText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    return part;
  });
}

function MessageText({ text }) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div className="message-content">
      {lines.map((line, index) => {
        const cleanLine = line
          .replace(/^#{1,6}\s*/, "")
          .replace(/^[-*]\s+/, "")
          .trim();
        const isHeading = /^#{1,6}\s+/.test(line) || /^[A-Z][A-Z\s]{5,}$/.test(cleanLine);
        const isListItem = /^[-*]\s+/.test(line);

        if (isHeading) {
          return <strong className="message-heading" key={index}>{formatInlineText(cleanLine)}</strong>;
        }

        if (isListItem) {
          return <p className="message-list-item" key={index}>{formatInlineText(cleanLine)}</p>;
        }

        return <p key={index}>{formatInlineText(cleanLine)}</p>;
      })}
    </div>
  );
}

function DatasetChat({ messages, setMessages, question, setQuestion }) {
  const [loading, setLoading] = useState(false);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (chatBox) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }, [messages, loading]);

  const askQuestion = async () => {

    if (!question.trim()) return;
    if (loading) return;
  
    const userMessage = {
      sender: "user",
      text: question.trim()
    };

    const nextMessages = [...messages, userMessage];
  
    setMessages(nextMessages);
    setQuestion("");
  
    setLoading(true);
  
    try {
  
      const apiBase = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const response = await axios.post(
        `${apiBase}/chat`,
        {
          question: userMessage.text,
          history: nextMessages.slice(-8)
        }
      );

      const aiMessage = {
        sender: "ai",
        text: response?.data?.answer || "No answer returned",
        source: response?.data?.source
      };
  
      setMessages(prev => [...prev, aiMessage]);
  
    } catch (error) {
  
      console.error(error);
  
      setMessages(prev => [
        ...prev,
        {
          sender: "ai",
          text: "Failed to get AI response."
        }
      ]);
    }

    setLoading(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      askQuestion();
    }
  };

  return (
    <div className="dataset-chat">
      <div className="chat-box" ref={chatBoxRef}>
        {messages.length === 0 ? (
          <div className="chat-start">
            <div className="chat-start-icon">◎</div>
            <strong>Start the conversation</strong>
            <span>Ask about rows, columns, missing values, patterns, or pandas steps.</span>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={`${msg.sender}-${index}`}
              className={msg.sender === "user" ? "message-row user-row" : "message-row ai-row"}
            >
              <div className={msg.sender === "user" ? "chat-bubble user-message" : "chat-bubble ai-message"}>
                <MessageText text={msg.text} />
                {msg.source && <span className="message-source">{msg.source}</span>}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="message-row ai-row">
            <div className="chat-bubble ai-message typing-message">HAHAThinking...</div>
          </div>
        )}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your dataset..."
        />

        <button onClick={askQuestion} disabled={loading || !question.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

export default DatasetChat;