import "./SummaryCards.css";

function SummaryCards({ result }) {
    return (
        <>
        <h2>Dataset Summary</h2>
      
        <div className="summary-grid">
      
          <div className="summary-card">
            <h3>Rows</h3>
            <p>{result.rows}</p>
          </div>
      
          <div className="summary-card">
            <h3>Columns</h3>
            <p>{result.columns}</p>
          </div>
      
          <div className="summary-card">
            <h3>Missing Values</h3>
            <p>{result.missing_values}</p>
          </div>
      
          <div className="summary-card">
            <h3>Duplicates</h3>
            <p>{result.duplicate_rows}</p>
          </div>
      
          <div className="summary-card">
            <h3>Numeric Columns</h3>
            <p>{result.numeric_columns}</p>
          </div>
      
          <div className="summary-card">
            <h3>Categorical Columns</h3>
            <p>{result.categorical_columns}</p>
          </div>
      
        </div>
      </>
    );
  }
  
  export default SummaryCards;