import "./AppShell.css";

function AppShell({ sidebarWidth, sidebar, children }) {
  return (
    <div className="app-shell" style={{ "--sidebar-width": `${sidebarWidth}px` }}>
      {sidebar}

      <main className="main-stage">
        {children}
      </main>
    </div>
  );
}

export default AppShell;
