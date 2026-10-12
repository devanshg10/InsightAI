import React from "react";
import "./Topbar.css";

// A self-contained Siri-like orb component using standard CSS animations
const SiriOrbLocal = ({ size = "20px" }) => (
  <div className="siri-orb-container" style={{ width: size, height: size }}>
    <div className="siri-orb-inner" />
    <style dangerouslySetInnerHTML={{ __html: `
      .siri-orb-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .siri-orb-inner {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: conic-gradient(from 0deg, #ff0080, #7928ca, #0070f3, #00dfd8, #ff0080);
        filter: blur(4px);
        animation: spin 4s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}} />
  </div>
);

function Topbar({ result, file, showPandas, setShowPandas, setActivePage }) {
  const handleClick = () => {
    if (result) {
      setActivePage("chat");
      setShowPandas((prev) => !prev);
    }
  };

  return (
    <header className="topbar neo-topbar">
      <div className="topbar-left neo-topbar-left">
        <strong className="neo-topbar-title">
          {result ? file?.name || "Dataset Workspace" : "InsightAI Analytics Workspace"}
        </strong>
        <span className="neo-topbar-subtitle">
          {result ? "CSV" : "Smart upload"}
        </span>
      </div>
      
      <div className="topbar-actions neo-topbar-actions">
        {/* Ask AI Button Trigger - 3D Neumorphic Button */}
        <div
          className={`neo-toggle-switch ${showPandas ? "active" : ""} ${!result ? "disabled" : ""}`}
          onClick={result ? handleClick : undefined}
        >
          <div className="neo-toggle-slider">
            <SiriOrbLocal size="18px" />
          </div>
        </div>
        
        <div className="icon-actions neo-icon-actions">
          <button 
            className="neo-icon-button" 
            aria-label="Notifications"
          >
            ⌁
          </button>
          <button 
            className="neo-icon-button" 
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
        
        <div className="avatar neo-avatar">
          AI
        </div>
      </div>
    </header>
  );
}

export default Topbar;