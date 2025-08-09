// src/pages/Index.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./index-landing.css";

export default function Index() {
  const [showGreeting, setShowGreeting] = useState(false);
  const userName = "[Name]"; // TODO: wire to real user state
  const nav = useNavigate();

  useEffect(() => {
    const id = setTimeout(() => setShowGreeting(true), 200);
    return () => clearTimeout(id);
  }, []);

  return (
    <main id="landing-root">
      {/* Header */}
      <header className="header">
        <button
          className="header-btn"
          aria-label="Exit"
          onClick={() => console.log("Exit")}
        >
          <span className="material-icons" style={{ fontSize: 40 }}>
            logout
          </span>
        </button>
        <button
          className="header-btn"
          aria-label="Help"
          onClick={() => console.log("Help")}
        >
          <span className="material-icons" style={{ fontSize: 40 }}>
            help_outline
          </span>
        </button>
      </header>

      {/* Greeting */}
      <h1 className={`main-greeting ${showGreeting ? "show" : ""}`}>
        Hello, <span className="user-name">{userName}</span>{" "}
        <span role="img" aria-label="smile">
          😊
        </span>
      </h1>

      {/* Cards */}
      <section className="main-row">
        <LandingCard
          kind="mod"
          icon="menu_book"
          label="Modules"
          onClick={() => nav("/modules")}
        />
        <LandingCard
          kind="ex"
          icon="fitness_center"
          label="Exercises"
          onClick={() => nav("/exercises")}
        />
        <LandingCard
          kind="prog"
          icon="show_chart"
          label="Progress"
          onClick={() => nav("/progress")}
        />
      </section>
    </main>
  );
}

function LandingCard({
  kind,
  icon,
  label,
  onClick,
}: {
  kind: "mod" | "ex" | "prog";
  icon: string; // Material Icons name
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`main-card ${kind}`}
      onClick={onClick}
      aria-label={label}
    >
      <span className="material-icons" style={{ fontSize: 72 }}>
        {icon}
      </span>
      <span className="label">{label}</span>
    </button>
  );
}
