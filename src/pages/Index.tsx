import React, { useEffect } from "react";

// Load Material Icons font
const loadMaterialIcons = () => {
  if (!document.getElementById("material-icons-link")) {
    const link = document.createElement("link");
    link.id = "material-icons-link";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/icon?family=Material+Icons+Outlined";
    document.head.appendChild(link);
  }
};

const userName = "[Name]"; // Replace with dynamic user name if available

const Index = () => {
  useEffect(() => {
    loadMaterialIcons();
    // Fade in greeting
    const greeting = document.getElementById("main-greeting");
    if (greeting) {
      setTimeout(() => {
        greeting.style.opacity = "1";
      }, 200);
    }
  }, []);

  return (
    <div id="root" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", background: "#f8fafc" }}>
      <div className="header" style={{ width: "100vw", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2rem 2.5rem 1.5rem 2.5rem", boxSizing: "border-box" }}>
        <button className="header-btn" aria-label="Exit" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "2.5rem", color: "#222", transition: "color 0.2s" }}>
          <span className="material-icons-outlined">logout</span>
        </button>
        <button className="header-btn" aria-label="Help" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "2.5rem", color: "#222", transition: "color 0.2s" }}>
          <span className="material-icons-outlined">help_outline</span>
        </button>
      </div>
      <div className="main-greeting" id="main-greeting" style={{ fontSize: "2.5rem", fontWeight: 700, margin: "2.5rem 0", textAlign: "center", opacity: 0, animation: "fadeInLeft 1.2s forwards" }}>
        Hello, <span id="user-name">{userName}</span> <span aria-label="smile" style={{ fontSize: "2.5rem" }}>😊</span>
      </div>
      <div className="main-row" style={{ display: "flex", flexDirection: "row", gap: "2.5rem", justifyContent: "center", alignItems: "stretch", width: "100%", maxWidth: 900, margin: "0 auto" }}>
        <div className="main-card mod" tabIndex={0} aria-label="Modules" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "2.5rem", boxShadow: "0 2px 16px 0 rgba(0,0,0,0.07)", padding: "2.5rem 1.5rem 1.5rem 1.5rem", minWidth: 180, minHeight: 220, cursor: "pointer", transition: "box-shadow 0.2s, transform 0.2s", userSelect: "none", border: "4px solid #CC79A7" }}>
          <span className="icon material-icons-outlined" style={{ fontSize: "4.5rem", marginBottom: "1.2rem", color: "#CC79A7", filter: "drop-shadow(0 0 0.5rem rgba(0,0,0,0.08))" }}>menu_book</span>
          <div className="label" style={{ fontSize: "1.6rem", fontWeight: 600, color: "#222", marginTop: "0.5rem", letterSpacing: "0.01em" }}>Modules</div>
        </div>
        <div className="main-card ex" tabIndex={0} aria-label="Exercises" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "2.5rem", boxShadow: "0 2px 16px 0 rgba(0,0,0,0.07)", padding: "2.5rem 1.5rem 1.5rem 1.5rem", minWidth: 180, minHeight: 220, cursor: "pointer", transition: "box-shadow 0.2s, transform 0.2s", userSelect: "none", border: "4px solid #0072B2" }}>
          <span className="icon material-icons-outlined" style={{ fontSize: "4.5rem", marginBottom: "1.2rem", color: "#0072B2", filter: "drop-shadow(0 0 0.5rem rgba(0,0,0,0.08))" }}>fitness_center</span>
          <div className="label" style={{ fontSize: "1.6rem", fontWeight: 600, color: "#222", marginTop: "0.5rem", letterSpacing: "0.01em" }}>Exercises</div>
        </div>
        <div className="main-card prog" tabIndex={0} aria-label="Progress" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "2.5rem", boxShadow: "0 2px 16px 0 rgba(0,0,0,0.07)", padding: "2.5rem 1.5rem 1.5rem 1.5rem", minWidth: 180, minHeight: 220, cursor: "pointer", transition: "box-shadow 0.2s, transform 0.2s", userSelect: "none", border: "4px solid #009E5F" }}>
          <span className="icon material-icons-outlined" style={{ fontSize: "4.5rem", marginBottom: "1.2rem", color: "#009E5F", filter: "drop-shadow(0 0 0.5rem rgba(0,0,0,0.08))" }}>show_chart</span>
          <div className="label" style={{ fontSize: "1.6rem", fontWeight: 600, color: "#222", marginTop: "0.5rem", letterSpacing: "0.01em" }}>Progress</div>
        </div>
      </div>
      <style>{`
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (max-width: 900px) {
          .main-row { flex-direction: column; gap: 2rem; }
          .main-card { min-width: 0 !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
};

export default Index;
