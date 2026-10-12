import "./AIExplanation.css";


function AIExplanation({ summary }) {
  return (
    <div className="ai-card">
      <h2>🤖 AI Dataset Analysis</h2>

      <div className="ai-content">
        {summary.split("\n").map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}

export default AIExplanation;