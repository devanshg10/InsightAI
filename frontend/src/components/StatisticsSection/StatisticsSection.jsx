import "./StatisticsSection.css";


function StatisticsSection({ stats }) {
  return (
    <div>
      <h2>Numeric Statistics</h2>

      <div className="stats-grid">
        {stats && stats.length > 0 ? stats.map((item) => (
            <div className="stat-card" key={item.column}>
            <h3>{item.column}</h3>

            <p>Mean: {item.mean}</p>
            <p>Median: {item.median}</p>
            <p>Mode: {item.mode}</p>
            <p>Min: {item.min}</p>
            <p>Max: {item.max}</p>
            <p>Std Dev: {item.std}</p>
            <p>Variance: {item.variance}</p>
            <p>Q1: {item.q1}</p>
            <p>Q3: {item.q3}</p>
            <p>IQR: {item.iqr}</p>
            </div>
        )) : <p className="muted-copy">No numeric columns were found.</p>}
        </div>
    </div>
  );
}

export default StatisticsSection;
