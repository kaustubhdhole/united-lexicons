import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";
import * as d3 from "d3";
import { Search, Download } from "lucide-react";
import baseWords from "../data/common_words.json";
import additionalWords from "../data/common_words2.json";
import avestanSanskritWords from "../data/avestan_sanskrit_common_words.json";

const words = [...baseWords, ...additionalWords, ...avestanSanskritWords];

// Utility clamp
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Language metadata
const LANGS = ["marathi", "persian", "sanskrit", "punjabi", "hindi", "urdu", "indonesian"];
const LANG_LABEL = {
  marathi: "Marathi",
  persian: "Persian",
  sanskrit: "Sanskrit",
  punjabi: "Punjabi",
  hindi: "Hindi",
  urdu: "Urdu",
  indonesian: "Indonesian",
};

const SCRIPT_OPTIONS = [
  ["latin", "Lat"],
  ["marathi", "MR"],
  ["persian", "FA"],
  ["sanskrit", "SA"],
  ["punjabi", "PA"],
  ["hindi", "HI"],
  ["urdu", "UR"],
  ["indonesian", "ID"],
];

// resize observer
const useMeasure = () => {
  const ref = useRef(null);
  const [rect, setRect] = useState({ width: 800, height: 480 });
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([el]) => {
      const cr = el.contentRect;
      setRect({ width: cr.width, height: cr.height });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, rect];
};

// tooltip
const Tooltip = ({ x, y, show, children }) => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (ref.current) {
      setSize({ width: ref.current.offsetWidth, height: ref.current.offsetHeight });
    }
  }, [children, show]);

  const posX = clamp(x + 14, 8, (typeof window !== "undefined" ? window.innerWidth : 0) - size.width - 8);
  const posY = clamp(y + 14, 8, (typeof window !== "undefined" ? window.innerHeight : 0) - size.height - 8);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className="pointer-events-none fixed z-50 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm shadow-2xl backdrop-blur-md"
          style={{ left: posX, top: posY }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const HoverPanel = ({ info }) => {
  return (
    <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      {info ? (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-widest text-violet-300/90">Shared word</div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(info.langs).map(([lang, word]) => (
              <span key={lang} className="rounded bg-white/5 px-2 py-0.5 text-[13px]">
                {word}
              </span>
            ))}
          </div>
          <div className="text-sm text-slate-100/90"><span className="opacity-70">Latin:</span> {info.latin}</div>
          <div className="text-xs text-slate-300/90"><span className="opacity-70">Meaning:</span> {info.gloss}</div>
          <div className="text-[11px] text-slate-400/90">Languages: {Object.keys(info.langs).length}</div>
        </div>
      ) : (
        <div className="text-sm text-slate-300/80">Hover a bubble to see details here.</div>
      )}
    </div>
  );
};

const randomFloatMeta = () => ({
  angle: Math.random() * Math.PI * 2,
  // Keep bubbles gently drifting instead of racing across the canvas.
  speed: 0.006 + Math.random() * 0.012,
});

const normalizeAngle = (angle) => {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
};

function Bubbles({ data, showScript, selectedLangs, height = 520, onHover, isMoving }) {
  const [containerRef, { width }] = useMeasure();
  const [nodes, setNodes] = useState([]);
  const simRef = useRef(null);
  const [hover, setHover] = useState(null);
  const floatMetaRef = useRef(new Map());
  const isMovingRef = useRef(isMoving);

  useEffect(() => {
    isMovingRef.current = isMoving;
  }, [isMoving]);

  const nodeData = useMemo(() => {
    return data.map((d, i) => ({
      id: i,
      label: d.latin,
      r: clamp(24 + Object.keys(d.langs).length * 6, 24, 72),
      d,
    }));
  }, [data]);

  useEffect(() => {
    if (!width) return;
    const initial = nodeData.map(n => ({ ...n, x: Math.random() * width, y: Math.random() * height }));
    setNodes(initial);

    const floatForce = () => {
      let localNodes = [];
      const ensureMeta = (node) => {
        if (!floatMetaRef.current.has(node.id)) {
          floatMetaRef.current.set(node.id, randomFloatMeta());
        }
        return floatMetaRef.current.get(node.id);
      };

      const force = (alpha) => {
        if (!isMovingRef.current) return;
        for (const node of localNodes) {
          const meta = ensureMeta(node);
          if (Math.random() < 0.01) {
            meta.angle = normalizeAngle(meta.angle + (Math.random() - 0.5) * (Math.PI / 3));
            meta.speed = clamp(meta.speed + (Math.random() - 0.5) * 0.003, 0.004, 0.02);
          }
          node.vx += Math.cos(meta.angle) * meta.speed * alpha;
          node.vy += Math.sin(meta.angle) * meta.speed * alpha;
        }
      };
      force.initialize = (nodesArg) => {
        localNodes = nodesArg;
        floatMetaRef.current = new Map(localNodes.map((node) => [node.id, randomFloatMeta()]));
      };
      return force;
    };

    const sim = d3
      .forceSimulation(initial)
      .alphaDecay(0.05)
      .alphaTarget(0.1)
      .force("charge", d3.forceManyBody().strength(-30))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => d.r + 4))
      .force("float", floatForce())
      .on("tick", () => {
        const simNodes = sim.nodes();
        simNodes.forEach((node) => {
          const meta = floatMetaRef.current.get(node.id);
          if (node.x != null) {
            if (node.x < node.r) {
              node.x = node.r;
              if (meta && isMovingRef.current) meta.angle = normalizeAngle(Math.PI - meta.angle);
            } else if (node.x > width - node.r) {
              node.x = width - node.r;
              if (meta && isMovingRef.current) meta.angle = normalizeAngle(Math.PI - meta.angle);
            }
          }
          if (node.y != null) {
            if (node.y < node.r) {
              node.y = node.r;
              if (meta && isMovingRef.current) meta.angle = normalizeAngle(-meta.angle);
            } else if (node.y > height - node.r) {
              node.y = height - node.r;
              if (meta && isMovingRef.current) meta.angle = normalizeAngle(-meta.angle);
            }
          }
        });
        if (!isMovingRef.current) {
          simNodes.forEach((node) => {
            node.vx = 0;
            node.vy = 0;
          });
        }
        setNodes(simNodes.map((node) => ({ ...node })));
      });
    simRef.current = sim;
    return () => sim.stop();
  }, [width, height, nodeData]);

  // When language selection changes, "reheat" the simulation so bubbles
  // spread out again and avoid overlapping. Also release any nodes that were
  // fixed in place (e.g. due to dragging) so the layout can settle naturally.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.nodes().forEach(n => {
      n.fx = null;
      n.fy = null;
    });
    sim.alpha(0.25).restart();
  }, [selectedLangs]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (isMoving) {
      sim.alpha(0.2).restart();
    } else {
      sim.alphaTarget(0);
      sim.nodes().forEach((node) => {
        node.vx = 0;
        node.vy = 0;
      });
      setNodes(sim.nodes().map((node) => ({ ...node })));
    }
  }, [isMoving]);

  const onDrag = (id) =>
    d3
      .drag()
      .on("start", (event) => {
        const sim = simRef.current;
        if (!event.active) sim.alphaTarget(0.08).restart();
      })
      .on("drag", (event) => {
        const sim = simRef.current;
        if (!sim) return;
        const node = sim.nodes().find((n) => n.id === id);
        if (!node) return;
        const clampedX = clamp(event.x, node.r, width - node.r);
        const clampedY = clamp(event.y, node.r, height - node.r);
        node.fx = clampedX;
        node.fy = clampedY;
        node.x = clampedX;
        node.y = clampedY;
        node.vx = 0;
        node.vy = 0;
        setNodes(sim.nodes().map((n) => ({ ...n })));
      })
      .on("end", (event) => {
        const sim = simRef.current;
        if (!sim) return;
        const node = sim.nodes().find((n) => n.id === id);
        if (node) {
          node.fx = null;
          node.fy = null;
        }
        if (!event.active) sim.alphaTarget(0);
      });

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-2 backdrop-blur">
      <svg width={width} height={height} className="block">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="60%" stopColor="#a78bfa" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        {nodes.map((n) => {
          const active = selectedLangs.every(l => n.d.langs[l]);
          const text = showScript === "latin" ? n.d.latin : n.d.langs[showScript] || n.d.latin;
          return (
            <g key={n.id}
               transform={`translate(${clamp(n.x || 0, n.r, width - n.r)}, ${clamp(n.y || 0, n.r, height - n.r)})`}
               onMouseEnter={(e) => { setHover({ x: e.clientX, y: e.clientY, node: n }); onHover?.(n.d); }}
               onMouseLeave={() => { setHover(null); onHover?.(null); }}
               ref={(el) => { if (!el) return; d3.select(el).call(onDrag(n.id)); }}
            >
              <circle r={n.r} fill="url(#glow)" className={`stroke-white/20 ${active ? '' : 'opacity-30'}`} />
              <circle r={n.r} className={`fill-white/5 ${active ? '' : 'opacity-30'}`} />
              <text textAnchor="middle" dy="0.35em" className={`select-none font-semibold tracking-wide ${active ? '' : 'opacity-30'}`}
                style={{ fontSize: clamp(n.r * 0.32, 10, 22) }}>
                {text}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip x={hover?.x ?? 0} y={hover?.y ?? 0} show={!!hover}>
        {hover && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-widest text-violet-300/90">Shared word</div>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(hover.node.d.langs).map(([lang, word]) => (
                <span key={lang} className="rounded bg-white/5 px-2 py-0.5 text-[13px]">
                  {word}
                </span>
              ))}
            </div>
            <div className="text-sm text-slate-100/90"><span className="opacity-70">Latin:</span> {hover.node.d.latin}</div>
            <div className="text-xs text-slate-300/90"><span className="opacity-70">Meaning:</span> {hover.node.d.gloss}</div>
            <div className="text-[11px] text-slate-400/90">Languages: {Object.keys(hover.node.d.langs).length}</div>
          </div>
        )}
      </Tooltip>
    </div>
  );
}

export default function PolyglotSharedWords() {
  const [query, setQuery] = useState("");
  const [showScript, setShowScript] = useState("latin");
  const [selectedLangs, setSelectedLangs] = useState([]);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [isMoving, setIsMoving] = useState(true);
  const [lang, setLang] = useState(typeof window !== "undefined" ? window.currentLang || "en" : "en");

  useEffect(() => {
    const handler = (e) => setLang(e.detail);
    window.addEventListener("languagechange", handler);
    return () => window.removeEventListener("languagechange", handler);
  }, []);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words.filter(d => {
      const hay = `${d.latin} ${d.gloss} ${Object.values(d.langs).join(" ")}`.toLowerCase();
      return !q || hay.includes(q);
    });
  }, [query]);

  const toggleLang = (lang) => {
    setSelectedLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  };

  const exportJSON = () => {
    const active = data.filter(d => selectedLangs.every(l => d.langs[l]));
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "shared_words.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    return data.map(d => ({ word: d.latin, n: Object.keys(d.langs).length }));
  }, [data]);

  const t = (typeof window !== "undefined" && window.translations && window.translations[lang]) || (window.translations ? window.translations.en : {});

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(1000px_600px_at_20%_-10%,rgba(167,139,250,0.15),transparent),radial-gradient(1200px_700px_at_110%_10%,rgba(125,211,252,0.12),transparent)] from-slate-950 via-slate-950 to-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto mb-8 max-w-6xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wider backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-violet-400"></span>
          Polyglot Lexicon
          <span className="opacity-60">• Shared Words</span>
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl md:text-5xl">{t.subtitleMain} <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">{t.subtitleHighlight}</span></h1>
        <p className="mt-3 max-w-3xl text-slate-300">{t.selectText}</p>
      </div>

      <div className="mx-auto mb-6 grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
            <Search className="h-4 w-4 opacity-70" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or meanings…" className="h-8 w-full bg-transparent outline-none placeholder:opacity-60" />
            {query && (
              <button onClick={() => setQuery("")} className="rounded-lg px-2 py-1 text-xs opacity-80 hover:bg-white/10">Clear</button>
            )}
          </div>
        </div>

        <div className="md:col-span-5 flex flex-wrap items-center gap-2">
          {LANGS.map(l => (
            <button key={l} onClick={() => toggleLang(l)} className={`rounded-2xl border px-3 py-1 text-sm backdrop-blur ${selectedLangs.includes(l) ? 'bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-900 font-semibold border-transparent' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>{LANG_LABEL[l]}</button>
          ))}
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
            <span className="text-sm opacity-80">Script</span>
            <div className="flex items-center gap-1">
              {SCRIPT_OPTIONS.map(([v, label]) => (
                <button key={v} onClick={() => setShowScript(v)} className={`rounded-xl px-3 py-1 text-sm ${showScript === v ? 'bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-900 font-semibold' : 'hover:bg-white/10'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-0 flex items-center justify-end gap-2">
          <button onClick={exportJSON} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg"><Download className="h-4 w-4" />Export</button>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-6">
          <Bubbles
            data={data}
            showScript={showScript}
            selectedLangs={selectedLangs}
            height={540}
            onHover={setHoverInfo}
            isMoving={isMoving}
          />
          <HoverPanel info={hoverInfo} />
        </div>
        <div className="sticky top-4 space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={isMoving}
                onChange={(e) => setIsMoving(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/40 bg-transparent text-violet-400 focus:ring-violet-400"
              />
              <span>
                <span className="block text-sm font-semibold uppercase tracking-wider text-slate-100">Animate bubbles</span>
                <span className="block text-xs text-slate-300/80">Toggle floating motion. Dragging works either way.</span>
              </span>
            </label>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold uppercase tracking-wider opacity-80">Overview</div>
            </div>
            <div className="mb-3 text-2xl font-bold">{data.length} words</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {stats.slice(0, 6).map(s => (
                <div key={s.word} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-xs opacity-70">{s.word}</div>
                  <div className="text-base font-semibold">{s.n} langs</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-80">Glossary</div>
            <div className="max-h-[420px] space-y-2 overflow-auto pr-2">
              {data.map((d, i) => {
                const active = selectedLangs.every(l => d.langs[l]);
                return (
                  <div key={i} className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${active ? 'border-white/10 bg-gradient-to-r from-white/5 to-white/[0.03]' : 'border-white/5 bg-white/5 opacity-60'}`}>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold">
                        {Object.values(d.langs).slice(0,3).map((w,idx) => (
                          <span key={idx} className="mr-2 rounded bg-white/5 px-2 py-0.5">{w}</span>
                        ))}
                      </div>
                      <div className="truncate text-sm text-slate-300/90">{d.latin} <span className="opacity-60">—</span> {d.gloss}</div>
                    </div>
                    <div className="shrink-0 text-xs opacity-70">{Object.keys(d.langs).length}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Automatically mount the visualization when this module is loaded
const container = document.getElementById("viz-root");
if (container) {
  const root = createRoot(container);
  root.render(<PolyglotSharedWords />);
}
