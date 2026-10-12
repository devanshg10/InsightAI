import "./ChartsSection.css";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";



  function ChartsSection({ chartData, chartType }) {
    return (
      <>
        <h2>Charts</h2>
  
        {chartData &&
          chartData.map((chart, index) => (
            <div className="chart-card" key={index}>
              <h3>{chart.column}</h3>
  
              <div style={{ width: "100%", height: 300 }}>
              {chartType === "bar" && (
                <ResponsiveContainer>
                  <BarChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === "pie" && (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={chart.data}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={100}
                      label
                    />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {chartType === "doughnut" && (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={chart.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      label
                    />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
              


              {/*Chart insight info */}
              <div className="chart-insights">
                <p>
                  <strong>Most Common:</strong>{" "}
                  {chart.data[0]?.name} ({chart.data[0]?.value})
                </p>

                <p>
                  <strong>Least Common:</strong>{" "}
                  {chart.data[chart.data.length - 1]?.name}
                  {" "}
                  ({chart.data[chart.data.length - 1]?.value})
                </p>

                <p>
                  <strong>Total Categories:</strong>{" "}
                  {chart.data.length}
                </p>
              </div>



            </div>

            </div>
          ))}
      </>
    );
  }
  
  export default ChartsSection;
