"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { edgeWidth, layoutCodebase, NODE_HEIGHT, type CodebaseEdge, type CodebaseModule } from "@/lib/client/codebase-view";

interface CodebaseGraphProps {
  modules: readonly CodebaseModule[];
  edges: readonly CodebaseEdge[];
  selected: string | null;
  highlighted: string | null;
  onSelect: (id: string) => void;
}

/**
 * The project's modules grouped by top folder in columns, joined by curves as thick as their import counts. The
 * selected module's edges stand out; a module a search hit points at glows.
 */
export function CodebaseGraph({ modules, edges, selected, highlighted, onSelect }: CodebaseGraphProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (highlighted) frame.current?.querySelector(`[data-module-id="${CSS.escape(highlighted)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlighted]);

  const layout = width > 0 ? layoutCodebase(modules, edges, width) : null;
  const focus = selected ?? highlighted;
  const maxFiles = Math.max(1, ...modules.map((module) => module.files));
  return (
    <div ref={frame} className="codebase-graph">
      {layout ? (
        <svg className="codebase-graph-svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="Modules and their imports">
          <g className="codebase-graph-edges">
            {layout.edges.map((edge) => (
              <path
                key={`${edge.from}>${edge.to}`}
                className="codebase-graph-edge"
                data-active={focus !== null && (edge.from === focus || edge.to === focus) ? "true" : undefined}
                data-dim={focus !== null && edge.from !== focus && edge.to !== focus ? "true" : undefined}
                d={edge.d}
                strokeWidth={edgeWidth(edge.weight)}
              >
                <title>{`${edge.from} imports ${edge.to} (${edge.weight})`}</title>
              </path>
            ))}
          </g>
          {layout.groups.map((group) => (
            <text key={group.name} className="codebase-graph-group" x={group.x + 2} y={group.y}>
              {group.name}
            </text>
          ))}
          {layout.modules.map((module, index) => (
            <g
              key={module.path}
              className="codebase-graph-node"
              data-module-id={module.path}
              data-selected={module.path === selected ? "true" : undefined}
              data-highlighted={module.path === highlighted ? "true" : undefined}
              transform={`translate(${module.x} ${module.y})`}
              style={{ "--codebase-step": Math.min(index, 40) } as CSSProperties}
              role="button"
              tabIndex={0}
              aria-pressed={module.path === selected}
              aria-label={`${module.path}, ${module.files} files`}
              onClick={() => onSelect(module.path)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(module.path);
              }}
            >
              <rect className="codebase-graph-node-box" width={module.width} height={NODE_HEIGHT} rx={6} />
              <rect className="codebase-graph-node-fill" width={Math.max(3, (module.width * module.files) / maxFiles)} height={NODE_HEIGHT} rx={6} />
              <text className="codebase-graph-node-label" x={8} y={NODE_HEIGHT / 2}>
                {module.label}
              </text>
              <text className="codebase-graph-node-count" x={module.width - 8} y={NODE_HEIGHT / 2}>
                {module.files}
              </text>
              <title>{module.path}</title>
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
