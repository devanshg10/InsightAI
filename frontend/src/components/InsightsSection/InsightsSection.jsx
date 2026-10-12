import "./InsightsSection.css";

function InsightsSection({ insights }) {
    return (
      <>
        <h2>AI Insights</h2>
  
        <ul>
          {insights.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </>
    );
  }
  
  export default InsightsSection;
