"use client";

import { useState, useEffect, useRef } from "react";

const TODAY = () => new Date().toISOString().split("T")[0];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};

const SYSTEM_PROMPT = `You are a nutrition expert who estimates calories from casual, imprecise food descriptions. 
The user will describe what they ate in natural language — no exact measurements needed.
Return ONLY valid JSON with this exact structure:
{
  "items": [
    { "name": "string (short food name)", "calories_min": number, "calories_max": number, "note": "string (brief context)" }
  ],
  "total_min": number,
  "total_max": number,
  "summary": "string (one line friendly summary)"
}
Be generous with ranges to account for size/preparation uncertainty. Common sense portions apply (e.g. "restaurant bread" = ~1 slice or roll).`;

interface FoodItem {
  name: string;
  calories_min: number;
  calories_max: number;
  note: string;
}

interface MealEntry {
  id: number;
  label: string;
  description: string;
  items: FoodItem[];
  total_min: number;
  total_max: number;
  summary: string;
  time: string;
}

interface DaysData {
  [date: string]: MealEntry[];
}

export default function App() {
  const [input, setInput] = useState("");
  const [mealLabel, setMealLabel] = useState("Breakfast");
  const [days, setDays] = useState<DaysData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"today" | "history">("today");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("calorie_days");
      if (saved) setDays(JSON.parse(saved));
    } catch {}
  }, []);

  const saveDays = (updated: DaysData) => {
    setDays(updated);
    try {
      localStorage.setItem("calorie_days", JSON.stringify(updated));
    } catch {}
  };

  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: input }],
        }),
      });
      const data = await res.json();
      const text = data.content?.find((b: { type: string; text?: string }) => b.type === "text")?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const entry: MealEntry = {
        id: Date.now(),
        label: mealLabel,
        description: input,
        items: parsed.items,
        total_min: parsed.total_min,
        total_max: parsed.total_max,
        summary: parsed.summary,
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      };

      const today = TODAY();
      const updated = { ...days };
      if (!updated[today]) updated[today] = [];
      updated[today] = [...updated[today], entry];
      saveDays(updated);
      setInput("");
    } catch {
      setError("Couldn't parse that — try again or rephrase a bit.");
    }
    setLoading(false);
  };

  const removeEntry = (dateKey: string, id: number) => {
    const updated = { ...days };
    updated[dateKey] = updated[dateKey].filter((e) => e.id !== id);
    if (updated[dateKey].length === 0) delete updated[dateKey];
    saveDays(updated);
  };

  const todayEntries = days[TODAY()] || [];
  const todayMin = todayEntries.reduce((s, e) => s + e.total_min, 0);
  const todayMax = todayEntries.reduce((s, e) => s + e.total_max, 0);
  const todayMid = Math.round((todayMin + todayMax) / 2);
  const historyDays = Object.keys(days).filter((d) => d !== TODAY()).sort((a, b) => b.localeCompare(a));
  const pct = Math.min(100, (todayMid / 2000) * 100);

  if (!mounted) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Georgia', 'Times New Roman', serif", color: "#2C1810" }}>
      {/* Header */}
      <div style={{ background: "#2C1810", padding: "28px 24px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(210,140,80,0.15)" }} />
        <div style={{ position: "absolute", bottom: -30, left: "40%", width: 80, height: 80, borderRadius: "50%", background: "rgba(210,140,80,0.1)" }} />
        <div style={{ position: "relative" }}>
          <span style={{ fontSize: 11, letterSpacing: 3, color: "#C4845A", textTransform: "uppercase", fontFamily: "sans-serif" }}>Daily</span>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: "normal", color: "#F5F0E8", letterSpacing: -0.5 }}>Plate & Count</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(245,240,232,0.5)", fontFamily: "sans-serif", fontStyle: "italic" }}>
            Approximate calorie tracking, no scale needed
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #DDD5C8", background: "#EDE8DE" }}>
        {(["today", "history"] as const).map((t) => (
          <button key={t} onClick={() => setView(t)} style={{
            flex: 1, padding: "12px", border: "none",
            background: view === t ? "#F5F0E8" : "transparent",
            color: view === t ? "#2C1810" : "#8B7355",
            fontFamily: "sans-serif", fontSize: 12, fontWeight: 600,
            letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer",
            borderBottom: view === t ? "2px solid #C4845A" : "2px solid transparent",
            marginBottom: -2, transition: "all 0.2s",
          }}>
            {t === "today" ? "Today" : "History"}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 40px" }}>
        {view === "today" && (
          <>
            {/* Daily total */}
            {todayEntries.length > 0 && (
              <div style={{ background: "#2C1810", borderRadius: 16, padding: "20px 24px", marginBottom: 20, color: "#F5F0E8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: 2, color: "#C4845A", fontFamily: "sans-serif", textTransform: "uppercase", marginBottom: 4 }}>Today&apos;s total</div>
                    <div style={{ fontSize: 38, fontWeight: "bold", letterSpacing: -1 }}>{todayMid.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: "rgba(245,240,232,0.6)", fontFamily: "sans-serif" }}>Range: {todayMin.toLocaleString()} – {todayMax.toLocaleString()} kcal</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "rgba(245,240,232,0.5)", fontFamily: "sans-serif", marginBottom: 6 }}>vs 2000 goal</div>
                    <div style={{ fontSize: 18, color: pct > 100 ? "#E88060" : "#90C987" }}>{Math.round(pct)}%</div>
                  </div>
                </div>
                <div style={{ marginTop: 16, background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: `${Math.min(100, pct)}%`, background: pct > 100 ? "#E88060" : "#C4845A", transition: "width 0.6s ease" }} />
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #DDD5C8", marginBottom: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" }}>
              <div style={{ padding: "16px 16px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Breakfast", "Lunch", "Dinner", "Snack"].map((l) => (
                  <button key={l} onClick={() => setMealLabel(l)} style={{
                    padding: "5px 14px", borderRadius: 20, border: "1.5px solid",
                    borderColor: mealLabel === l ? "#C4845A" : "#DDD5C8",
                    background: mealLabel === l ? "#C4845A" : "transparent",
                    color: mealLabel === l ? "#fff" : "#8B7355",
                    fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  }}>{l}</button>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) analyze(); }}
                placeholder={`Describe your ${mealLabel.toLowerCase()}…\n\ne.g. "one egg fried in olive oil, a medium piece of camembert and a restaurant-style bread roll"`}
                style={{ width: "100%", minHeight: 100, padding: "14px 16px", border: "none", outline: "none", resize: "vertical", fontFamily: "Georgia, serif", fontSize: 15, lineHeight: 1.6, color: "#2C1810", background: "transparent", boxSizing: "border-box" }}
              />
              <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                {error && <span style={{ fontSize: 12, color: "#E88060", fontFamily: "sans-serif" }}>{error}</span>}
                <span style={{ fontSize: 11, color: "#C4BAAA", fontFamily: "sans-serif" }}>⌘↵ to submit</span>
                <button onClick={analyze} disabled={loading || !input.trim()} style={{
                  padding: "10px 22px", borderRadius: 10,
                  background: loading || !input.trim() ? "#DDD5C8" : "#C4845A",
                  color: loading || !input.trim() ? "#8B7355" : "#fff",
                  border: "none", fontFamily: "sans-serif", fontSize: 13, fontWeight: 700,
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer", letterSpacing: 0.5, transition: "all 0.2s",
                }}>
                  {loading ? "Analysing…" : "Estimate →"}
                </button>
              </div>
            </div>

            {/* Meals */}
            {todayEntries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#B0A090" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🍽</div>
                <p style={{ fontFamily: "sans-serif", fontSize: 14 }}>No meals logged yet today.<br />Describe what you&apos;ve eaten above.</p>
              </div>
            ) : (
              todayEntries.map((entry) => (
                <MealCard key={entry.id} entry={entry} onDelete={() => removeEntry(TODAY(), entry.id)} compact={false} />
              ))
            )}
          </>
        )}

        {view === "history" && (
          <>
            {historyDays.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#B0A090" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📖</div>
                <p style={{ fontFamily: "sans-serif", fontSize: 14 }}>No history yet.<br />Previous days will appear here.</p>
              </div>
            ) : (
              historyDays.map((dateKey) => {
                const entries = days[dateKey];
                const dMin = entries.reduce((s, e) => s + e.total_min, 0);
                const dMax = entries.reduce((s, e) => s + e.total_max, 0);
                const dMid = Math.round((dMin + dMax) / 2);
                const isOpen = expandedDay === dateKey;
                return (
                  <div key={dateKey} style={{ marginBottom: 12 }}>
                    <button onClick={() => setExpandedDay(isOpen ? null : dateKey)} style={{
                      width: "100%", background: "#fff", border: "1.5px solid #DDD5C8",
                      borderRadius: isOpen ? "12px 12px 0 0" : 12,
                      padding: "16px 20px", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      boxShadow: "0 2px 8px rgba(44,24,16,0.04)",
                    }}>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#8B7355", marginBottom: 2 }}>{formatDate(dateKey)}</div>
                        <div style={{ fontSize: 20, fontWeight: "bold", color: "#2C1810" }}>{dMid.toLocaleString()} <span style={{ fontSize: 12, fontWeight: "normal", color: "#8B7355" }}>kcal</span></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "sans-serif", fontSize: 11, color: "#B0A090" }}>{entries.length} meal{entries.length !== 1 ? "s" : ""}</span>
                        <span style={{ fontSize: 12, color: "#C4845A", transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s", display: "inline-block" }}>▼</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ border: "1.5px solid #DDD5C8", borderTop: "none", borderRadius: "0 0 12px 12px", background: "#FAF7F2", padding: "8px 0" }}>
                        {entries.map((entry) => (
                          <MealCard key={entry.id} entry={entry} onDelete={() => removeEntry(dateKey, entry.id)} compact={true} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MealCard({ entry, onDelete, compact }: { entry: MealEntry; onDelete: () => void; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const mid = Math.round((entry.total_min + entry.total_max) / 2);

  return (
    <div style={{
      background: "#fff", borderRadius: compact ? 0 : 14,
      border: compact ? "none" : "1.5px solid #DDD5C8",
      borderBottom: compact ? "1px solid #EDE8DE" : undefined,
      marginBottom: compact ? 0 : 12, overflow: "hidden",
      boxShadow: compact ? "none" : "0 2px 8px rgba(44,24,16,0.04)",
    }}>
      <div style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12 }} onClick={() => setOpen(!open)}>
        <div style={{ minWidth: 42, height: 42, borderRadius: 10, background: "#FBF3EB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, fontFamily: "sans-serif", color: "#C4845A", letterSpacing: 0.5, textTransform: "uppercase" }}>{entry.label.slice(0, 3)}</span>
          <span style={{ fontSize: 13, fontWeight: "bold", color: "#2C1810" }}>{entry.time}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontFamily: "sans-serif", color: "#2C1810", fontWeight: 600, marginBottom: 2 }}>{entry.label}</div>
          <div style={{ fontSize: 12, color: "#8B7355", fontFamily: "sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.summary}</div>
        </div>
        <div style={{ textAlign: "right", minWidth: 64 }}>
          <div style={{ fontSize: 18, fontWeight: "bold", color: "#C4845A" }}>{mid}</div>
          <div style={{ fontSize: 10, color: "#B0A090", fontFamily: "sans-serif" }}>kcal</div>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 16px 14px", borderTop: "1px solid #F0EBE3" }}>
          <div style={{ marginBottom: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "#C4845A", fontFamily: "sans-serif", textTransform: "uppercase", marginBottom: 6 }}>Description</div>
            <p style={{ margin: 0, fontSize: 13, color: "#5C4030", lineHeight: 1.5, fontStyle: "italic" }}>&ldquo;{entry.description}&rdquo;</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "#C4845A", fontFamily: "sans-serif", textTransform: "uppercase", marginBottom: 8 }}>Breakdown</div>
            {entry.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px dotted #EDE8DE" }}>
                <div>
                  <span style={{ fontSize: 13, color: "#2C1810" }}>{item.name}</span>
                  {item.note && <span style={{ fontSize: 11, color: "#B0A090", fontFamily: "sans-serif", marginLeft: 6 }}>— {item.note}</span>}
                </div>
                <span style={{ fontSize: 13, fontFamily: "sans-serif", color: "#5C4030", whiteSpace: "nowrap", marginLeft: 8 }}>{item.calories_min}–{item.calories_max}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontWeight: "bold" }}>
              <span style={{ fontSize: 13, fontFamily: "sans-serif" }}>Total estimate</span>
              <span style={{ fontSize: 13, fontFamily: "sans-serif", color: "#C4845A" }}>{entry.total_min}–{entry.total_max} kcal</span>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{
            background: "none", border: "1px solid #E8DADA", color: "#C07070",
            padding: "6px 14px", borderRadius: 8, fontFamily: "sans-serif", fontSize: 11, cursor: "pointer",
          }}>Remove entry</button>
        </div>
      )}
    </div>
  );
}