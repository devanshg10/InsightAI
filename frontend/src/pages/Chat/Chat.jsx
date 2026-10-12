import DatasetChat from "../../components/DatasetChat/DatasetChat";
import GlassPanel from "../../components/GlassPanel/GlassPanel";
import "./Chat.css";

function Chat({
  result,
  showPandas,
  chatMessages,
  setChatMessages,
  chatDraft,
  setChatDraft,
  pandasCommand,
  setPandasCommand,
  pandasResult,
  runningPandas,
  runPandasCommand,
  setActivePage,
}) {
  return (
    <section className="chat-page reveal">
      {!result ? (
        <div className="empty-state">
          <h2>Upload a dataset to start the analyst chat</h2>
          <p>The chat page studies the active dataset, so it needs one CSV first.</p>
          <button className="primary-action" onClick={() => setActivePage("home")}>
            Upload Dataset
          </button>
        </div>
      ) : (
        <div className={showPandas ? "chat-layout pandas-open" : "chat-layout"}>
          <GlassPanel title="Ask InsightAI" eyebrow="Dataset Copilot" className="chat-window assistant-window">
            <DatasetChat
              messages={chatMessages}
              setMessages={setChatMessages}
              question={chatDraft}
              setQuestion={setChatDraft}
            />
          </GlassPanel>

          <GlassPanel title="Pandas Cross Check" eyebrow="Python Console" className="chat-window pandas-window">
            
            <div className="pandas-panel">
              <label htmlFor="pandas-command">Try your pandas command:</label>
              <textarea
                id="pandas-command"
                value={pandasCommand}
                onChange={(event) => setPandasCommand(event.target.value)}
                placeholder="Example: df['Age'].mean()"
              />
              <button onClick={runPandasCommand} disabled={runningPandas || !pandasCommand.trim()}>
                {runningPandas ? "Running..." : "Run Command"}
              </button>

              {pandasResult && (
                <pre className={pandasResult.ok ? "pandas-output" : "pandas-output pandas-error"}>
                  {pandasResult.output}
                </pre>
              )}
            </div>
          </GlassPanel>
        </div>
      )}
    </section>
  );
}

export default Chat;
