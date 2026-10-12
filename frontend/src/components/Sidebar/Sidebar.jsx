import "./Sidebar.css";

const navItems = [
  { key: "home", label: "New Analysis", icon: "+" },
  { key: "workspace", label: "Datasets", icon: "▣" },
  { key: "preprocessing", label: "Preprocessing", icon: "◫" },
  { key: "visualization", label: "Visualization", icon: "📈" },
  { key: "chat", label: "Analyst Chat", icon: "◎" },
];

function Sidebar({ activePage, setActivePage, openAIChat, startSidebarResize }) {
  return (
    <aside className="sidebar neo-sidebar">
      <div className="brand-lockup neo-brand-lockup">
        <div className="brand-mark neo-brand-mark" />
        <div>
          <h1>InsightAI</h1>
          <p>Enterprise Analytics</p>
        </div>
      </div>

      <nav className="side-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`neo-menu-item ${activePage === item.key ? "active" : ""}`}
            onClick={() => (item.key === "chat" ? openAIChat() : setActivePage(item.key))}
          >
            <span className="neo-icon">{item.icon}</span>
            <span className="neo-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <button
        className="sidebar-resizer neo-resizer"
        type="button"
        aria-label="Resize sidebar"
        onPointerDown={startSidebarResize}
      />
    </aside>
  );
}

export default Sidebar;
