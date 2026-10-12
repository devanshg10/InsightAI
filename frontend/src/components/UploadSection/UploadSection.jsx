import { useEffect, useRef, useState } from "react";
import "./UploadSection.css";

function UploadSection({ file, setFile, uploading, handleUpload }) {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`upload-wrapper ${isVisible ? "visible" : ""}`}
    >
      {/* Sleek Upload Bar */}
      <div className="upload-bar">
        <label className="upload-input-label">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files[0])}
          />
          <span className="placeholder-text">
            {file ? file.name : "Smart Dataset Upload"}
          </span>
        </label>
        <button className="arrow-btn" onClick={handleUpload} disabled={uploading}>
          {uploading ? "..." : "→"}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <label className="action-btn choose-btn">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files[0])}
          />
          <span className="icon">📁</span>
          Choose File
        </label>
        
        <button 
          className="action-btn analyze-btn" 
          onClick={handleUpload} 
          disabled={uploading}
        >
          <span className="icon">📈</span>
          {uploading ? "Analyzing..." : "Analyse File"}
        </button>
      </div>
    </section>
  );
}

export default UploadSection;