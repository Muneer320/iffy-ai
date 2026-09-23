"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SimulationResponse,
  SimulationNode,
  SectorImpact,
  DebateResponse,
  DurationKey,
} from "../types/simulation";

type Example = {
  id: string;
  category: string;
  title: string;
  scenario: string;
  assumption: string;
  branches: string[];
};
type Entry = {
  simulation_id: string;
  title: string;
  metadata: SimulationResponse["metadata"];
};
type Tab = "graph" | "timeline" | "sectors" | "debate" | "compare";
const horizons: Record<DurationKey, string> = {
  immediate: "Immediate",
  short_term: "Short term",
  long_term: "Long term",
};
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
function Mark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M8 32V8h11v12h13M19 20l12-12M25 8h7v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Graph({
  simulation,
  horizon,
  selected,
  onSelect,
}: {
  simulation: SimulationResponse;
  horizon: DurationKey;
  selected: string;
  onSelect: (id: string) => void;
}) {
  // Breadth-first layers remain finite for cycles and disconnected components.
  const nodes = simulation.nodes;
  const levels = new Map<string, number>();
  const incoming = new Set(simulation.edges.map((e) => e.target));
  const roots = nodes.filter((n) => !incoming.has(n.id));
  const queue = (roots.length ? roots : [nodes[0]]).map((n) => n.id);
  queue.forEach((id) => levels.set(id, 0));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const edge of simulation.edges.filter((e) => e.source === id))
      if (!levels.has(edge.target)) {
        levels.set(edge.target, Math.min((levels.get(id) ?? 0) + 1, 5));
        queue.push(edge.target);
      }
  }
  const columns = new Map<number, number>();
  const positions = new Map(
    nodes.map((n) => {
      const column = levels.get(n.id) ?? 0;
      const row = columns.get(column) ?? 0;
      columns.set(column, row + 1);
      return [n.id, { x: 32 + column * 280, y: 46 + row * 174 }];
    }),
  );
  const width = Math.max(
    800,
    ...Array.from(positions.values()).map((p) => p.x + 270),
  );
  const height = Math.max(
    480,
    ...Array.from(positions.values()).map((p) => p.y + 170),
  );
  return (
    <div
      className="graph-scroll"
      tabIndex={0}
      aria-label="Consequence graph. Scroll horizontally to follow connections; select a node for its details."
    >
      <div className="graph-surface" style={{ width, height }}>
        <svg
          className="connections"
          width={width}
          height={height}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0L7 3.5L0 7" fill="none" stroke="currentColor" />
            </marker>
          </defs>
          {simulation.edges.map((e) => {
            const a = positions.get(e.source),
              b = positions.get(e.target);
            if (!a || !b) return null;
            const x = a.x + 224,
              y = a.y + 60;
            return (
              <path
                key={e.id}
                className={
                  selected === e.source || selected === e.target
                    ? "edge active"
                    : "edge"
                }
                d={`M${x},${y} C${x + 60},${y} ${b.x - 60},${b.y + 60} ${b.x - 5},${b.y + 60}`}
                markerEnd="url(#arrow)"
              />
            );
          })}
        </svg>
        {nodes.map((node, i) => {
          const pos = positions.get(node.id)!;
          const value = node.duration[horizon];
          return (
            <button
              key={node.id}
              className={`graph-node ${selected === node.id ? "selected" : ""}`}
              style={{ left: pos.x, top: pos.y }}
              onClick={() => onSelect(node.id)}
              aria-pressed={selected === node.id}
            >
              <span className="node-top">
                <span className="micro">
                  {String(i + 1).padStart(2, "0")} / {node.tags[0]}
                </span>
                <span
                  className={value >= 0 ? "score positive" : "score negative"}
                >
                  {signed(value)}
                </span>
              </span>
              <strong>{node.label}</strong>
              <span className="node-bottom">
                Explore consequence <span>↗</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Notebook() {
  const [mode, setMode] = useState<"demo" | "live" | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [parent, setParent] = useState<SimulationResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<Tab>("graph");
  const [horizon, setHorizon] = useState<DurationKey>("short_term");
  const [question, setQuestion] = useState("");
  const [branch, setBranch] = useState("");
  const [showBranch, setShowBranch] = useState(false);
  const [sector, setSector] = useState<SectorImpact | null>(null);
  const [debate, setDebate] = useState<DebateResponse | null>(null);
  const [followup, setFollowup] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [passkey, setPasskey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const node =
    simulation?.nodes.find((n) => n.id === selected) ?? simulation?.nodes[0];

  const api = useCallback(
    async <T,>(
      path: string,
      body?: unknown,
      signal?: AbortSignal,
    ): Promise<T> => {
      const response = await fetch(`/api/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(passkey ? { Authorization: `Bearer ${passkey}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
      const envelope = await response.json().catch((error: unknown) => {
        if (signal?.aborted) throw error;
        throw new Error("The workspace is temporarily unavailable. Please try again.");
      });
      if (!response.ok || !envelope.success)
        throw new Error(
          envelope.error?.message ??
            "The server could not complete this request.",
        );
      return envelope.data;
    },
    [passkey],
  );
  const refresh = useCallback(
    async () => setEntries(await api<Entry[]>("saved")),
    [api],
  );
  const display = useCallback((s: SimulationResponse) => {
    setSimulation(s);
    setSelected(s.nodes[0]?.id ?? "");
    setTab("graph");
    setParent(null);
    setSector(null);
    setDebate(null);
    setShowBranch(false);
    setBranch("");
    setError("");
    setNotice("");
  }, []);
  const task = useCallback(
    async (label: string, action: (signal: AbortSignal) => Promise<void>) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(label);
      setError("");
      setNotice("");
      try {
        await action(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Something went wrong. Try again.",
          );
      } finally {
        if (abort.current === controller) setBusy("");
      }
    },
    [],
  );
  const open = useCallback(
    (id: string, push = true) =>
      task("Opening notebook", async (signal) => {
        const s = await api<SimulationResponse>(
          `simulation/${encodeURIComponent(id)}`,
          undefined,
          signal,
        );
        display(s);
        if (push)
          window.history.pushState({}, "", `/?notebook=${s.simulation_id}`);
      }),
    [api, display, task],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api<{ mode: "demo" | "live" }>("health", undefined, controller.signal),
      api<Example[]>("examples", undefined, controller.signal),
    ])
      .then(async ([health, list]) => {
        if (controller.signal.aborted) return;
        setMode(health.mode);
        setExamples(list);
        try {
          const stored: unknown = JSON.parse(
            localStorage.getItem("iffy-pins") ?? "[]",
          );
          if (Array.isArray(stored))
            setPins(
              stored
                .filter((id): id is string => typeof id === "string")
                .slice(0, 250),
            );
        } catch {
          /* local preferences are optional */
        }
        if (health.mode === "live" && !passkey) {
          setShowAccess(true);
          return;
        }
        const saved = await api<Entry[]>("saved", undefined, controller.signal);
        if (controller.signal.aborted) return;
        setEntries(saved);
        const id = new URLSearchParams(window.location.search).get("notebook");
        if (id) {
          const s = await api<SimulationResponse>(
            `simulation/${encodeURIComponent(id)}`,
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) display(s);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [api, display, passkey]);
  useEffect(() => {
    const pop = () => {
      const id = new URLSearchParams(window.location.search).get("notebook");
      if (id) void open(id, false);
      else {
        abort.current?.abort();
        setBusy("");
        setSimulation(null);
        setError("");
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [open]);
  useEffect(() => () => abort.current?.abort(), []);
  const home = () => {
    abort.current?.abort();
    setBusy("");
    setSimulation(null);
    setError("");
    setNotice("");
    window.history.pushState({}, "", "/");
  };
  const generate = (scenario: string) =>
    task("Opening the possibilities", async (signal) => {
      const s = await api<SimulationResponse>(
        "simulate",
        { scenario, duration_focus: "all" },
        signal,
      );
      display(s);
      window.history.pushState({}, "", `/?notebook=${s.simulation_id}`);
      await refresh();
    });
  const mutate = () =>
    simulation &&
    task("Following a different path", async (signal) => {
      const result = await api<{ simulation: SimulationResponse }>(
        "mutate",
        { simulation_id: simulation.simulation_id, mutation_prompt: branch },
        signal,
      );
      display(result.simulation);
      window.history.pushState(
        {},
        "",
        `/?notebook=${result.simulation.simulation_id}`,
      );
      await refresh();
    });
  const compare = () =>
    simulation?.metadata.parent_id &&
    task("Loading the original", async (signal) => {
      setParent(
        await api<SimulationResponse>(
          `simulation/${simulation.metadata.parent_id}`,
          undefined,
          signal,
        ),
      );
      setTab("compare");
    });
  const openDebate = () =>
    simulation &&
    task("Gathering perspectives", async (signal) => {
      setDebate(
        await api<DebateResponse>(
          "debate",
          {
            simulation_id: simulation.simulation_id,
            participants: debate?.participants ?? [],
            existing_messages: debate?.messages ?? [],
            ...(followup ? { continuation_prompt: followup } : {}),
          },
          signal,
        ),
      );
      setFollowup("");
    });
  const pin = () => {
    if (!simulation) return;
    const updated = pins.includes(simulation.simulation_id)
      ? pins.filter((id) => id !== simulation.simulation_id)
      : [simulation.simulation_id, ...pins];
    try {
      localStorage.setItem("iffy-pins", JSON.stringify(updated));
      setPins(updated);
      setNotice(
        updated.includes(simulation.simulation_id)
          ? "Pinned in this browser."
          : "Removed from your pins.",
      );
    } catch {
      setError(
        "Browser storage is unavailable. The notebook is still saved on the server.",
      );
    }
  };
  const exportNotebook = () => {
    if (!simulation) return;
    const blob = new Blob([JSON.stringify(simulation, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iffy-${simulation.simulation_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Notebook exported, including its source and assumptions.");
  };
  const example = examples.find(
    (e) => e.id === simulation?.metadata.example_id,
  );
  const ordered = [...entries].sort(
    (a, b) =>
      Number(pins.includes(b.simulation_id)) -
      Number(pins.includes(a.simulation_id)),
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to notebook
      </a>
      <aside className="sidebar">
        <button className="brand" onClick={home} aria-label="iffy.ai home">
          <Mark />
          <span>
            iffy<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="sidebar-intro">
          A field guide to
          <br />
          possible futures.
        </div>
        <button className="new-notebook" onClick={home}>
          <span>＋</span> New question <span>↗</span>
        </button>
        <p className="sidebar-label">
          YOUR NOTEBOOKS{" "}
          <span>{entries.length.toString().padStart(2, "0")}</span>
        </p>
        <nav className="notebook-list" aria-label="Saved notebooks">
          {ordered.length ? (
            ordered.slice(0, 12).map((entry, i) => (
              <button
                key={entry.simulation_id}
                className={
                  simulation?.simulation_id === entry.simulation_id
                    ? "current"
                    : ""
                }
                onClick={() => void open(entry.simulation_id)}
                disabled={!!busy}
              >
                <span className="entry-index">
                  {pins.includes(entry.simulation_id)
                    ? "✦"
                    : String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  {entry.title}
                  <small>
                    {entry.metadata.parent_id
                      ? "Alternative path"
                      : "Original question"}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="empty-sidebar">
              Your questions will find
              <br />a home here.
            </p>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />{" "}
          {mode === "live"
            ? "Private live workspace"
            : "Authored demo workspace"}
          <p>
            {mode === "live"
              ? "Passkey stays in memory."
              : "Saved locally on this server."}
          </p>
          <a
            href="https://github.com/Muneer320/iffy-ai"
            target="_blank"
            rel="noreferrer"
          >
            About this project ↗
          </a>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <span className="micro">
            THE CONSEQUENCE NOTEBOOK <span className="edition">/ VOL. 01</span>
          </span>
          <div>
            <span className="mode-pill">
              {mode === null
                ? "Connecting"
                : mode === "demo"
                  ? "Demo library"
                  : "Live mode"}
            </span>
            {mode === "live" && (
              <button
                className="text-button"
                onClick={() => setShowAccess(!showAccess)}
              >
                Workspace access
              </button>
            )}
            <a
              href="https://github.com/Muneer320/iffy-ai#try-the-notebook"
              target="_blank"
              rel="noreferrer"
              className="text-button"
            >
              Field notes ↗
            </a>
          </div>
        </header>
        <main id="main">
          {!!entries.length && (
            <details className="mobile-library">
              <summary>Your notebooks ({entries.length})</summary>
              <nav aria-label="Saved notebooks on mobile">
                {ordered.slice(0, 12).map((entry) => (
                  <button
                    key={entry.simulation_id}
                    onClick={() => void open(entry.simulation_id)}
                    disabled={!!busy}
                  >
                    {pins.includes(entry.simulation_id) ? "✦ " : ""}
                    {entry.title}
                    <span>↗</span>
                  </button>
                ))}
              </nav>
            </details>
          )}
          {error && (
            <div
              className="alert error"
              role="alert"
              aria-label="Workspace error"
            >
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <p className="alert" role="status">
              {notice}
            </p>
          )}
          {busy && (
            <div className="working" role="status">
              <span className="spinner" />
              {busy}…{" "}
              <button
                onClick={() => {
                  abort.current?.abort();
                  setBusy("");
                }}
              >
                Cancel waiting
              </button>
            </div>
          )}
          {showAccess && mode === "live" && (
            <form
              className="access-panel"
              onSubmit={(e) => {
                e.preventDefault();
                setPasskey(keyInput);
                setKeyInput("");
                setShowAccess(false);
              }}
            >
              <h2>Open your private workspace</h2>
              <p>
                Use the passkey set by the person running this server. It is
                kept in memory for this visit and sent only to this workspace
                API.
              </p>
              <label htmlFor="passkey">Workspace passkey</label>
              <input
                id="passkey"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                required
                minLength={32}
              />
              <button className="primary" type="submit">
                Unlock workspace ↗
              </button>
            </form>
          )}

          {!simulation ? (
            <>
              <section className="hero">
                <div>
                  <p className="eyebrow">
                    <span /> SMALL QUESTIONS. WIDE CONSEQUENCES.
                  </p>
                  <h1>
                    Nothing happens
                    <br />
                    in <em>isolation.</em>
                    <span className="hero-asterisk" aria-hidden="true">
                      ✳
                    </span>
                  </h1>
                  <p className="hero-copy">
                    Pull on one idea. See what moves.
                    <br />
                    Explore the people, systems and trade-offs
                    <br className="desktop-break" /> on the other side of{" "}
                    <strong>“what if?”</strong>
                  </p>
                </div>
                <div className="hero-note">
                  <span className="micro">ONE CHANGE / MANY POSSIBILITIES</span>
                  <svg viewBox="0 0 300 240" aria-hidden="true">
                    <path
                      d="M55 120H130M130 120V40H250M130 120H250M130 120V200H250"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx="55"
                      cy="120"
                      r="25"
                      fill="#d7ee68"
                      stroke="currentColor"
                    />
                    <text x="55" y="127" textAnchor="middle" fontSize="23">
                      ?
                    </text>
                    {[40, 120, 200].map((y, i) => (
                      <g key={y}>
                        <circle
                          cx="250"
                          cy={y}
                          r="17"
                          fill={i === 1 ? "#e9a88d" : "#f5f4ed"}
                          stroke="currentColor"
                        />
                        <text
                          x="250"
                          y={y + 5}
                          textAnchor="middle"
                          fontSize="14"
                        >
                          {["+", "−", "↗"][i]}
                        </text>
                      </g>
                    ))}
                    <circle cx="130" cy="120" r="5" fill="currentColor" />
                  </svg>
                  <p>
                    A possibility is a starting point.
                    <br />
                    <em>Follow it, question it, branch it.</em>
                  </p>
                </div>
              </section>
              <form
                className="question-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim()) void generate(question.trim());
                }}
              >
                <label htmlFor="question">
                  WHERE DOES YOUR CURIOSITY START?
                </label>
                <div>
                  <input
                    id="question"
                    placeholder={
                      mode === "live"
                        ? "What if…"
                        : "Choose a question below, or paste its exact prompt"
                    }
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    minLength={5}
                    maxLength={1200}
                    required
                  />
                  <button
                    className="primary"
                    type="submit"
                    disabled={!!busy || !mode}
                  >
                    Explore the ripple <span>↗</span>
                  </button>
                </div>
                <p>
                  {mode === "live"
                    ? "A model-generated exploration, not a prediction. Your prompt is sent to Groq and saved in this workspace."
                    : "Demo mode uses three authored examples. No API keys, model calls or invented answers to new prompts."}
                </p>
              </form>
              <section className="example-section">
                <div className="section-line">
                  <h2>A few threads to pull</h2>
                  <span className="micro">
                    {examples.length.toString().padStart(2, "0")} OPEN QUESTIONS
                  </span>
                </div>
                <div className="example-grid">
                  {examples.map((e, i) => (
                    <button
                      className={`example-card example-${i}`}
                      key={e.id}
                      onClick={() => void generate(e.scenario)}
                      disabled={!!busy || !mode}
                    >
                      <span className="example-number">
                        0{i + 1} <span>↗</span>
                      </span>
                      <span className="micro">{e.category}</span>
                      <h3>{e.scenario}</h3>
                      <span className="example-caption">
                        {mode === "demo"
                          ? "Open authored example"
                          : "Explore with the live model"}{" "}
                        <span>→</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <div className="method-strip">
                <span className="micro">HOW TO READ A POSSIBILITY</span>
                <p>
                  <strong>01</strong> Trace the connections
                </p>
                <p>
                  <strong>02</strong> Change the assumptions
                </p>
                <p>
                  <strong>03</strong> Hear another perspective
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="breadcrumb">
                <button onClick={home}>All questions</button>
                <span>/</span>
                <span>
                  {simulation.metadata.parent_id
                    ? "An alternative path"
                    : "Your consequence notebook"}
                </span>
              </div>
              <section className="notebook-heading">
                <div>
                  <p className="eyebrow">
                    {simulation.metadata.mode === "demo"
                      ? "AUTHORED EXAMPLE"
                      : "MODEL-GENERATED EXPLORATION"}{" "}
                    <span className="inline-line" />
                  </p>
                  <h1>{simulation.title}</h1>
                  <p className="summary">{simulation.summary}</p>
                </div>
                <div className="notebook-actions">
                  <button
                    className="secondary"
                    onClick={pin}
                    aria-pressed={pins.includes(simulation.simulation_id)}
                  >
                    {pins.includes(simulation.simulation_id)
                      ? "✦ Pinned"
                      : "＋ Pin notebook"}
                  </button>
                  <button className="secondary" onClick={exportNotebook}>
                    Export JSON ↓
                  </button>
                </div>
              </section>
              <div className="assumption-note">
                <span className="micro">STARTING ASSUMPTION</span>
                <p>
                  {simulation.metadata.mutation_prompt ??
                    simulation.metadata.assumption ??
                    simulation.metadata.scenario}
                </p>
              </div>
              <div className="notebook-toolbar">
                <div className="counts">
                  <strong>{simulation.nodes.length}</strong> consequences{" "}
                  <span>/</span> <strong>{simulation.edges.length}</strong>{" "}
                  connections <span>/</span>{" "}
                  <strong>{simulation.sector_impacts.length}</strong> sectors
                </div>
                <button
                  className="primary compact"
                  onClick={() => setShowBranch(!showBranch)}
                  disabled={
                    !!busy ||
                    !!(mode === "demo" && simulation.metadata.parent_id)
                  }
                >
                  ⑂ Follow another path
                </button>
              </div>
              {simulation.metadata.parent_id && (
                <div className="branch-line">
                  <span>⑂ Branched from an earlier notebook.</span>
                  <button
                    className="text-button"
                    onClick={() => void open(simulation.metadata.parent_id!)}
                    disabled={!!busy}
                  >
                    Open original ↗
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void compare()}
                    disabled={!!busy}
                  >
                    Compare changes →
                  </button>
                </div>
              )}
              {showBranch && (
                <form
                  className="branch-panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate();
                  }}
                >
                  <h2>Change one assumption.</h2>
                  <p>
                    The original stays intact. A branch becomes a separate
                    notebook you can revisit and compare.
                  </p>
                  {mode === "demo" ? (
                    <>
                      <p className="micro">
                        AUTHORED ALTERNATIVE FOR THIS EXAMPLE
                      </p>
                      {example?.branches.map((b) => (
                        <button
                          key={b}
                          type="button"
                          className={`branch-choice ${branch === b ? "chosen" : ""}`}
                          onClick={() => setBranch(b)}
                          aria-pressed={branch === b}
                        >
                          {b} <span>↗</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <label htmlFor="branch">What changes?</label>
                      <textarea
                        id="branch"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        minLength={3}
                        maxLength={600}
                        required
                      />
                    </>
                  )}
                  <button
                    className="primary"
                    type="submit"
                    disabled={!!busy || !branch}
                  >
                    Create alternative ↗
                  </button>
                </form>
              )}

              <div
                className="tab-row"
                role="tablist"
                aria-label="Explore your notebook"
              >
                {(["graph", "timeline", "sectors", "debate"] as Tab[]).map(
                  (t, i) => (
                    <button
                      id={`tab-${t}`}
                      role="tab"
                      aria-selected={tab === t}
                      aria-controls="notebook-panel"
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                    >
                      <span className="tab-index">0{i + 1}</span>
                      {t === "graph"
                        ? "Consequence graph"
                        : t === "debate"
                          ? "Perspectives"
                          : t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ),
                )}
                {parent && (
                  <button
                    role="tab"
                    id="tab-compare"
                    aria-selected={tab === "compare"}
                    aria-controls="notebook-panel"
                    className={tab === "compare" ? "active" : ""}
                    onClick={() => setTab("compare")}
                  >
                    Branch comparison
                  </button>
                )}
              </div>
              <section
                id="notebook-panel"
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                tabIndex={0}
              >
                {tab === "graph" && (
                  <>
                    <div className="graph-toolbar">
                      <span className="micro">
                        SELECT A NODE. FOLLOW ITS CONNECTIONS.
                      </span>
                      <div className="horizon-group" aria-label="Time horizon">
                        {(Object.keys(horizons) as DurationKey[]).map((h) => (
                          <button
                            key={h}
                            aria-pressed={horizon === h}
                            onClick={() => setHorizon(h)}
                          >
                            {horizons[h]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="graph-layout">
                      <Graph
                        simulation={simulation}
                        selected={node?.id ?? ""}
                        onSelect={setSelected}
                        horizon={horizon}
                      />
                      {node && (
                        <NodeDetail
                          node={node}
                          simulation={simulation}
                          horizon={horizon}
                          onSelect={setSelected}
                        />
                      )}
                    </div>
                    <p className="graph-footnote">
                      <span className="legend-dot positive" /> Positive pressure{" "}
                      <span className="legend-dot negative" /> Negative pressure{" "}
                      <span>
                        Scores −100 to +100 are{" "}
                        {mode === "demo"
                          ? "authored illustrations"
                          : "model estimates"}
                        , not measured forecasts. Scroll the graph to explore.
                      </span>
                    </p>
                  </>
                )}
                {tab === "timeline" && (
                  <div className="timeline-grid">
                    {(Object.keys(horizons) as DurationKey[]).map((h, i) => (
                      <article key={h}>
                        <span className="timeline-number">0{i + 1}</span>
                        <h2>{horizons[h]}</h2>
                        <p className="subtle">
                          {
                            [
                              "The first adjustments",
                              "As the system responds",
                              "The effects that may last",
                            ][i]
                          }
                        </p>
                        {simulation.timeline[h].map((event, j) => (
                          <div className="timeline-event" key={j}>
                            <span className="micro">
                              {event.affected_systems.join(" / ")}
                            </span>
                            <h3>{event.title}</h3>
                            <p>{event.description}</p>
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                )}
                {tab === "sectors" && (
                  <>
                    <div className="sector-grid">
                      {simulation.sector_impacts.map((s, i) => (
                        <article className="sector-card" key={s.sector}>
                          <span className="micro">SECTOR / 0{i + 1}</span>
                          <h2>{s.sector}</h2>
                          <p>{s.overview}</p>
                          <div className="sector-procon">
                            <span>OPPORTUNITY</span>
                            <p>{s.positive_effects[0]}</p>
                            <span>TRADE-OFF</span>
                            <p>{s.negative_effects[0]}</p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() =>
                              void task(
                                "Looking more closely",
                                async (signal) =>
                                  setSector(
                                    await api<SectorImpact>(
                                      "sector",
                                      {
                                        simulation_id: simulation.simulation_id,
                                        sector: s.sector,
                                      },
                                      signal,
                                    ),
                                  ),
                              )
                            }
                            disabled={!!busy}
                          >
                            Explore this sector ↗
                          </button>
                        </article>
                      ))}
                    </div>
                    {sector && (
                      <article className="sector-detail">
                        <div className="section-line">
                          <h2>A closer look: {sector.sector}</h2>
                          <button
                            className="text-button"
                            onClick={() => setSector(null)}
                          >
                            Close ×
                          </button>
                        </div>
                        <p>{sector.overview}</p>
                        {sector.sub_sectors?.map((s) => (
                          <p key={s.name}>
                            <strong>{s.name}.</strong> {s.explanation}
                          </p>
                        ))}
                        <h3>Ripple effects</h3>
                        <ul>
                          {sector.ripple_effects.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                        <p className="subtle">
                          {mode === "demo"
                            ? "Authored qualitative example."
                            : "Model-generated analysis; verify assumptions independently."}
                        </p>
                      </article>
                    )}
                  </>
                )}
                {tab === "debate" && (
                  <div className="perspectives">
                    <div className="perspective-heading">
                      <div>
                        <p className="micro">
                          SAME QUESTION. DIFFERENT STAKES.
                        </p>
                        <h2>Who sees it differently?</h2>
                        <p>
                          Fictional voices surface competing priorities. They do
                          not represent real interviews or expert consensus.
                        </p>
                      </div>
                      {!debate && (
                        <button
                          className="primary"
                          disabled={!!busy}
                          onClick={() => void openDebate()}
                        >
                          {mode === "demo"
                            ? "Open authored perspectives"
                            : "Generate perspectives"}{" "}
                          ↗
                        </button>
                      )}
                    </div>
                    <div className="persona-grid">
                      {simulation.debate_participants.map((p) => (
                        <article key={p.id}>
                          <span className="persona-initial">
                            {p.name.slice(0, 1)}
                          </span>
                          <h3>{p.name}</h3>
                          <p>{p.role}</p>
                          <span className="stance">{p.stance}</span>
                        </article>
                      ))}
                    </div>
                    {debate && (
                      <>
                        <div className="debate-messages">
                          {debate.messages.map((message, i) => {
                            const speaker = debate.participants.find(
                              (p) => p.id === message.speaker_id,
                            );
                            return (
                              <article key={i}>
                                <span className="micro">
                                  {speaker?.name} / {speaker?.role}
                                </span>
                                <p>“{message.message}”</p>
                              </article>
                            );
                          })}
                        </div>
                        {mode === "live" && (
                          <form
                            className="followup-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void openDebate();
                            }}
                          >
                            <label htmlFor="followup">
                              Bring another question to the table
                            </label>
                            <input
                              id="followup"
                              value={followup}
                              onChange={(e) => setFollowup(e.target.value)}
                              maxLength={600}
                              required
                            />
                            <button
                              className="primary"
                              disabled={!!busy || debate.messages.length >= 36}
                            >
                              Continue the conversation ↗
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                )}
                {tab === "compare" && parent && (
                  <div className="comparison">
                    <p className="micro">
                      ORIGINAL → ALTERNATIVE / {horizons[horizon].toUpperCase()}
                    </p>
                    <h2>What moved when the assumption changed?</h2>
                    <p>{simulation.metadata.mutation_prompt}</p>
                    <div
                      className="comparison-table"
                      role="table"
                      aria-label="Original and alternative impact scores"
                    >
                      <div role="row" className="comparison-row header">
                        <span role="columnheader">Consequence</span>
                        <span role="columnheader">Original</span>
                        <span role="columnheader">Alternative</span>
                      </div>
                      {simulation.nodes.map((n) => {
                        const before = parent.nodes.find((p) => p.id === n.id);
                        return (
                          <div
                            role="row"
                            key={n.id}
                            className={`comparison-row ${before?.duration[horizon] !== n.duration[horizon] ? "changed" : ""}`}
                          >
                            <strong role="cell">{n.label}</strong>
                            <span role="cell">
                              {before
                                ? signed(before.duration[horizon])
                                : "New"}
                            </span>
                            <span role="cell">
                              {signed(n.duration[horizon])}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="subtle">
                      Differences compare{" "}
                      {mode === "demo"
                        ? "authored illustrations"
                        : "model estimates"}
                      , not measured policy outcomes.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
        <footer className="page-footer">
          <span>
            iffy.ai <span className="footer-cross">✳</span> Stay curious.
            Question the assumptions.
          </span>
          <span>
            {mode === "live"
              ? "Groq + schema validation / private workspace"
              : "Authored demo / illustrative scores / no model calls"}
          </span>
        </footer>
      </div>
    </div>
  );
}

function NodeDetail({
  node,
  simulation,
  horizon,
  onSelect,
}: {
  node: SimulationNode;
  simulation: SimulationResponse;
  horizon: DurationKey;
  onSelect: (id: string) => void;
}) {
  const connections = simulation.edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );
  return (
    <aside className="node-detail" aria-label="Selected consequence">
      <span className="micro">UNDER THE SURFACE</span>
      <h2>{node.label}</h2>
      <p>{node.description}</p>
      <div className="impact-reading">
        <strong
          className={node.duration[horizon] >= 0 ? "positive" : "negative"}
        >
          {signed(node.duration[horizon])}
        </strong>
        <div>
          {horizons[horizon]} pressure
          <small>
            {simulation.metadata.mode === "demo"
              ? "Illustrative, not measured"
              : "Model estimate, not calibrated"}
          </small>
        </div>
      </div>
      <div className="mini-horizons">
        {(Object.keys(horizons) as DurationKey[]).map((h) => (
          <div key={h}>
            <span>{horizons[h]}</span>
            <strong>{signed(node.duration[h])}</strong>
          </div>
        ))}
      </div>
      <p className="micro">CONNECTED THREADS / {connections.length}</p>
      <div className="connected-list">
        {connections.map((e) => {
          const target = e.source === node.id ? e.target : e.source;
          return (
            <button key={e.id} onClick={() => onSelect(target)}>
              <strong>
                {simulation.nodes.find((n) => n.id === target)?.label}
                <span>{e.source === node.id ? "→" : "←"}</span>
              </strong>
              <small>{e.explanation}</small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
