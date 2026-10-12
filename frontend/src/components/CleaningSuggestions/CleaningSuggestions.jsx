import "./CleaningSuggestions.css";

function CleaningSuggestions({ suggestions }) {
    return (
      <div>
        <h2>Cleaning Suggestions</h2>
  
        <ul>
          {suggestions?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }
  
  export default CleaningSuggestions;
