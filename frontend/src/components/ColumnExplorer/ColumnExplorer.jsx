
import "./ColumnExplorer.css";

function ColumnExplorer({
  selectedColumn,
  columnDetails,
  aiExplanation,
  loadingExplanation,
}) {

    if (!selectedColumn) {
        return (
          <div className="column-explorer">
            <h2>Column Explorer</h2>
            <p>Please select a column first.</p>
          </div>
        );
      }
      
      if (!columnDetails[selectedColumn]) {
        return (
          <div className="column-explorer">
            <h2>Column Explorer</h2>
            <p>No details found for {selectedColumn}</p>
          </div>
        );
      }
  
    const details = columnDetails[selectedColumn];
  
    return (
      <div className="column-explorer">
        <h2>Column Explorer</h2>
        <h3>{selectedColumn}</h3>

        {loadingExplanation ? (
          <p className="ai-column-note">Generating column explanation...</p>
        ) : (
          aiExplanation && <p className="ai-column-note">{aiExplanation}</p>
        )}

        <div className="column-facts">
          <p><strong>Column Name:</strong> {details.name || selectedColumn}</p>
          <p><strong>Data Type:</strong> {details.dtype || details.type}</p>
          <p><strong>Missing Values:</strong> {details.missing}</p>
          <p><strong>Unique Values:</strong> {details.unique}</p>
          <p><strong>Most Frequent Value:</strong> {details.most_frequent || "None"}</p>
        </div>
  
        {details.type === "numeric" && (
          <>
            <p><strong>Mean:</strong> {details.mean}</p>
            <p><strong>Minimum:</strong> {details.min}</p>
            <p><strong>Maximum:</strong> {details.max}</p>
          </>
        )}
  
        <h4>Distribution Preview</h4>
        <div className="distribution-list">
          {Object.entries(details.distribution || details.top_values || {}).map(([key, value]) => (
            <p key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </p>
          ))}
        </div>

        <h4>Sample Values</h4>
        <div className="sample-values">
          {(details.sample_values || []).map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
  
      </div>
    );
  }
  
  export default ColumnExplorer;
