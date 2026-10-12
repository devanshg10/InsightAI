import "./DataQuality.css";

function DataQuality({ score }) {
    return (
      <div>
        <h2>Data Quality Score</h2>
  
        <h1>{score}/100</h1>
      </div>
    );
  }
  
  export default DataQuality;
