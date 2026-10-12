import { useEffect, useRef, useState } from "react";
import UploadSection from "../../components/UploadSection/UploadSection";
import "./Home.css";

const CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=<>?".split(
    ""
  );

function scrambleText(original) {
  return original
    .split("")
    .map((char) =>
      char === " "
        ? " "
        : CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
    )
    .join("");
}

const ScrambleHover = ({
  children,
  duration = 600,
  speed = 30,
  className = "",
}) => {
  const [display, setDisplay] = useState(children);
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    setShouldReduceMotion(motionQuery.matches);
    setIsHoverDevice(hoverQuery.matches);

    const handleMotionChange = (e) => {
      setShouldReduceMotion(e.matches);
    };
    const handleHoverChange = (e) => {
      setIsHoverDevice(e.matches);
    };

    motionQuery.addEventListener("change", handleMotionChange);
    hoverQuery.addEventListener("change", handleHoverChange);

    return () => {
      motionQuery.removeEventListener("change", handleMotionChange);
      hoverQuery.removeEventListener("change", handleHoverChange);
    };
  }, []);

  const handleMouseEnter = () => {
    if (shouldReduceMotion || !isHoverDevice) {
      return;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    intervalRef.current = setInterval(() => {
      setDisplay(() => scrambleText(children));
    }, speed);
    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setDisplay(children);
    }, duration);
  };

  const handleMouseLeave = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setDisplay(children);
  };

  return (
    <button
      className={className}
      onBlur={handleMouseLeave}
      onFocus={isHoverDevice ? handleMouseEnter : undefined}
      onMouseEnter={isHoverDevice ? handleMouseEnter : undefined}
      onMouseLeave={handleMouseLeave}
      style={{
        cursor: "pointer",
        display: "inline-block",
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
        textAlign: "inherit",
      }}
      type="button"
    >
      {display}
    </button>
  );
};

// Reveal Element Component with Intersection Observer
const RevealElement = ({ children, delay = 0, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Add delay before marking as visible
          const timer = setTimeout(() => {
            setIsVisible(true);
          }, delay);
          return () => clearTimeout(timer);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      if (elementRef.current) {
        observer.unobserve(elementRef.current);
      }
    };
  }, [delay]);

  return (
    <div
      ref={elementRef}
      className={`reveal-element ${isVisible ? "visible" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

function Home({ file, setFile, uploading, handleUpload }) {
  return (
    <section className="home-page">
      {/* Hero Copy Section */}
      <div className="hero-copy">
        <RevealElement delay={0} className="stagger-1">
          <span className="intro-pill">
            <ScrambleHover>Introducing Next-Gen Predictive Analytics</ScrambleHover>
          </span>
        </RevealElement>

        <RevealElement delay={100} className="stagger-2">
          <h2>
            <ScrambleHover>InsightAI: Your Virtual</ScrambleHover>
            <span>
              <ScrambleHover> Data Analyst</ScrambleHover>
            </span>
          </h2>
        </RevealElement>

        <RevealElement delay={200} className="stagger-3">
          <p>
            <ScrambleHover>
              Transform raw datasets into actionable executive insights in seconds. Upload a
              CSV and let the workspace organize summaries, charts, quality signals, and AI
              explanations.
            </ScrambleHover>
          </p>
        </RevealElement>
      </div>

      {/* Upload Section */}
      <div className="upload-section-wrapper">
        <UploadSection
          file={file}
          setFile={setFile}
          uploading={uploading}
          handleUpload={handleUpload}
        />
      </div>

      {/* Feature Grid */}
      <div className="feature-grid">
        <RevealElement delay={400} className="stagger-1">
          <article>
            <span>✦</span>
            <h3>
              <ScrambleHover>Predictive Modeling</ScrambleHover>
            </h3>
            <p>
              <ScrambleHover>
                Prepare your data for modeling with rapid profile summaries and trends.
              </ScrambleHover>
            </p>
          </article>
        </RevealElement>

        <RevealElement delay={500} className="stagger-2">
          <article>
            <span>⌁</span>
            <h3>
              <ScrambleHover>Anomaly Detection</ScrambleHover>
            </h3>
            <p>
              <ScrambleHover>
                Surface missing values, duplicate rows, and data irregularities early.
              </ScrambleHover>
            </p>
          </article>
        </RevealElement>

        <RevealElement delay={600} className="stagger-3">
          <article>
            <span>▣</span>
            <h3>
              <ScrambleHover>Clean Export</ScrambleHover>
            </h3>
            <p>
              <ScrambleHover>
                Review data quality and cleaning suggestions before deeper analysis.
              </ScrambleHover>
            </p>
          </article>
        </RevealElement>
      </div>
    </section>
  );
}

export default Home;