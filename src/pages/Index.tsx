import React from "react";

const userName = "[Name]"; // Replace with dynamic user name if available

const Index = () => {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4">
        <button aria-label="Exit" className="text-3xl">
          <span role="img" aria-label="exit">⬅️</span>
        </button>
        <button aria-label="Help" className="text-3xl">
          <span role="img" aria-label="help">❓</span>
        </button>
      </header>

      {/* Greeting */}
      <div className="flex-1 flex flex-col justify-center items-center">
        <h1
          className="text-5xl font-bold mb-12 animate-fade-in"
          style={{ animation: "fadeInLeft 1s" }}
        >
          Hello, {userName} <span role="img" aria-label="smile">😊</span>
        </h1>

        {/* Main Buttons Row */}
        <div className="flex gap-8">
          {/* Modules */}
          <button
            className="rounded-2xl bg-[#CC79A7] text-white flex flex-col items-center px-10 py-8 text-2xl shadow-lg hover:scale-105 transition"
            aria-label="Modules"
          >
            <span role="img" aria-label="modules" className="text-6xl mb-2">📖</span>
            Modules
          </button>
          {/* Exercises */}
          <button
            className="rounded-2xl bg-[#0072B2] text-white flex flex-col items-center px-10 py-8 text-2xl shadow-lg hover:scale-105 transition"
            aria-label="Exercises"
          >
            <span role="img" aria-label="exercises" className="text-6xl mb-2">🏋️‍♂️</span>
            Exercises
          </button>
          {/* Progress */}
          <button
            className="rounded-2xl bg-[#009E5F] text-white flex flex-col items-center px-10 py-8 text-2xl shadow-lg hover:scale-105 transition"
            aria-label="Progress"
          >
            <span role="img" aria-label="progress" className="text-6xl mb-2">📈</span>
            Progress
          </button>
        </div>
      </div>
    </main>
  );
};

export default Index;
