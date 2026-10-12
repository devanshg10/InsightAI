import { useState } from "react";
import axios from "axios";
import "./App.css";

import AppShell from "./components/AppShell/AppShell";
import Sidebar from "./components/Sidebar/Sidebar";
import Topbar from "./components/Topbar/Topbar";
import Chat from "./pages/Chat/Chat";
import Home from "./pages/Home/Home";
import Preprocessing from "./pages/Preprocessing/Preprocessing";
import Visualization from "./pages/Visualization/Visualization";
import Workspace from "./pages/Workspace/Workspace";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [explorerColumn, setExplorerColumn] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [activePage, setActivePage] = useState("home");
  const [uploading, setUploading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [showPandas, setShowPandas] = useState(false);
  const [pandasCommand, setPandasCommand] = useState("df.head()");
  const [pandasResult, setPandasResult] = useState(null);
  const [runningPandas, setRunningPandas] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(230);

  const startSidebarResize = (event) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent) => {
      const nextWidth = Math.min(440, Math.max(180, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(nextWidth);
    };

    const stopResizing = () => {
      document.body.classList.remove("resizing-sidebar");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };

    document.body.classList.add("resizing-sidebar");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a CSV file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);

    try {
      const response = await axios.post(`${API_BASE}/upload`, formData);

      setResult(response.data);
      setSelectedColumn(response.data.chart_data[0]?.column || response.data.column_names[0] || "");
      setExplorerColumn(response.data.column_names[0] || "");
      setChatMessages([]);
      setPandasResult(null);
      setActivePage("workspace");
    } catch (error) {
      console.error(error);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openAIChat = () => {
    setActivePage("chat");
  };

  const runPandasCommand = async () => {
    if (!pandasCommand.trim() || runningPandas) return;

    setRunningPandas(true);
    setPandasResult(null);

    try {
      const response = await axios.post(`${API_BASE}/pandas-run`, {
        command: pandasCommand,
      });
      setPandasResult(response.data);
    } catch (error) {
      setPandasResult({
        ok: false,
        output: error.response?.data?.detail || "Pandas command failed.",
      });
    } finally {
      setRunningPandas(false);
    }
  };

  return (
    <AppShell
      sidebarWidth={sidebarWidth}
      sidebar={
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          openAIChat={openAIChat}
          startSidebarResize={startSidebarResize}
        />
      }
    >
        <Topbar
          result={result}
          file={file}
          showPandas={showPandas}
          setShowPandas={setShowPandas}
          setActivePage={setActivePage}
        />

        {activePage === "home" && (
          <Home
            file={file}
            setFile={setFile}
            uploading={uploading}
            handleUpload={handleUpload}
          />
        )}

        {activePage === "workspace" && (
          <Workspace
            result={result}
            selectedColumn={selectedColumn}
            setSelectedColumn={setSelectedColumn}
            explorerColumn={explorerColumn}
            setExplorerColumn={setExplorerColumn}
            chartType={chartType}
            setChartType={setChartType}
            setActivePage={setActivePage}
          />
        )}

        {activePage === "preprocessing" && (
          <Preprocessing
            result={result}
            setResult={setResult}
            setActivePage={setActivePage}
          />
        )}

        {activePage === "visualization" && (
          <Visualization result={result} setActivePage={setActivePage} />
        )}

        {activePage === "chat" && (
          <Chat
            result={result}
            showPandas={showPandas}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            chatDraft={chatDraft}
            setChatDraft={setChatDraft}
            pandasCommand={pandasCommand}
            setPandasCommand={setPandasCommand}
            pandasResult={pandasResult}
            runningPandas={runningPandas}
            runPandasCommand={runPandasCommand}
            setActivePage={setActivePage}
          />
        )}
    </AppShell>
  );
}

export default App;
