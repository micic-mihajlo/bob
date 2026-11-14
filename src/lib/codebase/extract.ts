import { createHash } from "node:crypto";
import path from "node:path";
import ts from "typescript";

/**
 * A project's structure as a graph: modules, files, exported symbols, tests, theorems, merged pull requests and the
 * decisions that name them. Pure: files and history in, nodes and edges out. Syntax only, no type checker, so a few
 * hundred files take well under a second.
 */

export type CodeKind = "Module" | "File" | "Symbol" | "Test" | "Theorem" | "PR" | "Decision";
export type CodeEdgeType = "IN" | "DEFINES" | "IMPORTS" | "CALLS" | "TESTS" | "PROVES" | "CHANGED" | "DECIDED_IN";
export type CodeProps = Record<string, string | number>;

export interface CodeNode {
  ext_id: string;
  kind: CodeKind;
  hash: string;
  props: CodeProps;
}

export interface CodeEdge {
  type: CodeEdgeType;
  fromKind: CodeKind;
  from: string;
  toKind: CodeKind;
  to: string;
}

export interface SourceFile {
  path: string;
  text: string;
}

export interface MergedPr {
  number: number;
  title: string;
  body: string;
  files: string[];
  sha: string;
  at: string;
  /** Where it came from: git history, the overnight log's table, or Bob's own state. */
  source: "git" | "log" | "bob";
  /** Review findings, one line each, for Bob's own pull requests. */
  findings?: string[];
}

export interface Extraction {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

const CODE = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/;
const TEST = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\/|^formal\/conformance\//;
const DECISION_DOCS = /^(docs\/overnight-log\.md|AGENTS\.md|CLAUDE\.md)$/;
const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", "/index.ts", "/index.tsx", "/index.js"];
const DOC_CHARS = 400;
const TEXT_CHARS = 1_200;

const sha = (text: string) => createHash("sha1").update(text).digest("hex");
export const moduleId = (dir: string) => `module:${dir}`;
export const fileId = (p: string) => `file:${p}`;
export const symbolId = (p: string, name: string) => `symbol:${p}#${name}`;
export const testId = (p: string) => `test:${p}`;
export const theoremId = (name: string) => `theorem:${name}`;
/** Bob's own pull requests are numbered per project, so they get their own prefix next to GitHub's numbers. */
export const prId = (pr: Pick<MergedPr, "number" | "source">) => (pr.source === "bob" ? `bobpr_${pr.number}` : `pr_${pr.number}`);
export const moduleOf = (p: string) => (p.includes("/") ? path.posix.dirname(p) : ".");

/** The file an import names, if it is one of the project's files: relative, or "@/..." for src/... */
export function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? path.posix.join(path.posix.dirname(from), spec) : null;
  if (!base) return null;
  const stems = /\.[cm]?js$/.test(base) ? [base, base.replace(/\.([cm]?)js$/, ".$1ts"), base.replace(/\.js$/, ".tsx")] : [base];
  for (const stem of stems) for (const suffix of RESOLVE_SUFFIXES) if (paths.has(stem + suffix)) return stem + suffix;
  return null;
}

interface Exported {
  name: string;
  kind: string;
  line: number;
  doc: string;
  body: ts.Node | null;
}

interface Parsed {
  path: string;
  exports: Exported[];
  /** Local name to the file and exported name it was imported as; "*" for a namespace import. */
  bindings: Map<string, { file: string; name: string }>;
  imports: Set<string>;
  /** Exported name to where it is re-exported from; "*" collects `export * from`. */
  reexports: Map<string, { file: string; name: string }[]>;
  titles: string[];
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) => ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);

/** The last doc comment before a declaration, without its stars. */
function docOf(text: string, node: ts.Node): string {
  const last = (ts.getLeadingCommentRanges(text, node.pos) ?? []).filter((r) => text.startsWith("/**", r.pos)).at(-1);
  if (!last) return "";
  return text
    .slice(last.pos + 3, last.end - 2)
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, DOC_CHARS);
}

function parse(file: SourceFile, paths: Set<string>): Parsed {
  const scriptKind = /x$/.test(file.path) ? ts.ScriptKind.TSX : /\.[cm]?ts$/.test(file.path) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, scriptKind);
  const jsx = /x$/.test(file.path);
  const out: Parsed = { path: file.path, exports: [], bindings: new Map(), imports: new Set(), reexports: new Map(), titles: [] };
  const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const fnKind = (name: string) => (jsx && /^[A-Z]/.test(name) ? "component" : "function");
  const add = (node: ts.Node, name: string, kind: string, body: ts.Node | null, docNode: ts.Node = node) =>
    out.exports.push({ name, kind, line: line(node), doc: docOf(file.text, docNode), body });

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const target = resolveImport(file.path, st.moduleSpecifier.text, paths);
      if (!target) continue;
      out.imports.add(target);
      const clause = st.importClause;
      if (clause?.name) out.bindings.set(clause.name.text, { file: target, name: "default" });
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) out.bindings.set(named.name.text, { file: target, name: "*" });
      if (named && ts.isNamedImports(named)) for (const el of named.elements) out.bindings.set(el.name.text, { file: target, name: (el.propertyName ?? el.name).text });
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      const target = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? resolveImport(file.path, st.moduleSpecifier.text, paths) : null;
      if (!target) continue;
      out.imports.add(target);
      if (!st.exportClause) out.reexports.set("*", [...(out.reexports.get("*") ?? []), { file: target, name: "*" }]);
      if (st.exportClause && ts.isNamedExports(st.exportClause))
        for (const el of st.exportClause.elements) out.reexports.set(el.name.text, [{ file: target, name: (el.propertyName ?? el.name).text }]);
      continue;
    }
    if (!hasModifier(st, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(st)) add(st, st.name?.text ?? "default", fnKind(st.name?.text ?? ""), st.body ?? null);
    else if (ts.isClassDeclaration(st)) add(st, st.name?.text ?? "default", "class", st);
    else if (ts.isInterfaceDeclaration(st)) add(st, st.name.text, "interface", null);
    else if (ts.isTypeAliasDeclaration(st)) add(st, st.name.text, "type", null);
    else if (ts.isEnumDeclaration(st)) add(st, st.name.text, "enum", null);
    else if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const fn = d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) ? d.initializer : null;
        add(d, d.name.text, fn ? fnKind(d.name.text) : "const", fn ?? d.initializer ?? null, st);
      }
    if (hasModifier(st, ts.SyntaxKind.DefaultKeyword) && (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name)
      out.reexports.set("default", [{ file: file.path, name: st.name.text }]);
  }

  if (!TEST.test(file.path)) return out;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      let callee: ts.Expression = node.expression;
      while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) callee = callee.expression;
      const first = node.arguments[0];
      if (ts.isIdentifier(callee) && /^(describe|it|test)$/.test(callee.text) && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) out.titles.push(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** "a, b (src/x.ts), c" to names, each with the file named after its group, if any. */
export function mirrorsOf(mirrors: string): { name: string; file: string | null }[] {
  const out: { name: string; file: string | null }[] = [];
  let group: string[] = [];
  for (const m of mirrors.matchAll(/\(([^)]+)\)|([^,()]+)/g)) {
    const name = m[2]?.trim();
    if (name && /^[A-Za-z_$][\w$]*$/.test(name)) group.push(name);
    if (!m[1]) continue;
    out.push(...group.map((n) => ({ name: n, file: m[1].trim() })));
    group = [];
  }
  out.push(...group.map((n) => ({ name: n, file: null })));
  return out;
}

/** Top-level bullets and paragraphs of a markdown file, with the heading they sit under. Tables and code are left out. */
function blocksOf(text: string): { section: string; text: string }[] {
  const out: { section: string; text: string }[] = [];
  let section = "";
  let current: string[] = [];
  let fenced = false;
  const flush = () => {
    const joined = current.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length >= 30) out.push({ section, text: joined });
    current = [];
  };
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      fenced = !fenced;
      flush();
      continue;
    }
    if (fenced || trimmed.startsWith("<!--")) continue;
    if (/^#{1,6}\s/.test(raw)) {
      flush();
      section = raw.replace(/^#+\s*/, "").trim();
      continue;
    }
    if (!trimmed || trimmed.startsWith("|")) {
      flush();
      continue;
    }
    if (/^([-*]|\d+\.)\s/.test(raw)) flush();
    current.push(trimmed.replace(/^([-*]|\d+\.)\s+/, ""));
  }
  flush();
  return out;
}

/** The graph of a project's files on main and its merged pull requests. */
export function extractCodebase(files: SourceFile[], prs: MergedPr[]): Extraction {
  const nodes = new Map<string, { kind: CodeKind; props: CodeProps }>();
  const edges = new Map<string, CodeEdge>();
  const node = (kind: CodeKind, id: string, props: CodeProps) => nodes.set(id, { kind, props: { ...nodes.get(id)?.props, ...props } });
  const edge = (type: CodeEdgeType, fromKind: CodeKind, from: string, toKind: CodeKind, to: string) => {
    if (from !== to) edges.set(`${type}|${from}|${to}`, { type, fromKind, from, toKind, to });
  };
  const paths = new Set(files.map((f) => f.path));
  const parsed = new Map(files.filter((f) => CODE.test(f.path)).map((f) => [f.path, parse(f, paths)]));

  const moduleFiles = new Map<string, number>();
  for (const f of files) moduleFiles.set(moduleOf(f.path), (moduleFiles.get(moduleOf(f.path)) ?? 0) + 1);
  for (const [dir, count] of moduleFiles) node("Module", moduleId(dir), { path: dir, name: dir === "." ? "(root)" : path.posix.basename(dir), files: count });

  const symbolsByName = new Map<string, string[]>();
  for (const f of files) {
    const p = parsed.get(f.path);
    const test = TEST.test(f.path);
    node("File", fileId(f.path), { path: f.path, module: moduleOf(f.path), lines: f.text.split("\n").length, symbols: p?.exports.length ?? 0, test: test ? 1 : 0 });
    edge("IN", "File", fileId(f.path), "Module", moduleId(moduleOf(f.path)));
    if (!p) continue;
    for (const target of p.imports) edge("IMPORTS", "File", fileId(f.path), "File", fileId(target));
    for (const s of p.exports) {
      const id = symbolId(f.path, s.name);
      node("Symbol", id, { name: s.name, symbol_kind: s.kind, file: f.path, line: s.line, doc: s.doc });
      edge("DEFINES", "File", fileId(f.path), "Symbol", id);
      if (!test) symbolsByName.set(s.name, [...(symbolsByName.get(s.name) ?? []), id]);
    }
    if (!test) continue;
    node("Test", testId(f.path), { path: f.path, titles: p.titles.join("\n").slice(0, TEXT_CHARS * 2), count: p.titles.length });
    for (const target of p.imports) if (!TEST.test(target)) edge("TESTS", "Test", testId(f.path), "File", fileId(target));
  }

  const definedIn = (file: string, name: string, depth = 0): string | null => {
    const p = parsed.get(file);
    if (!p || depth > 6) return null;
    if (p.exports.some((s) => s.name === name)) return symbolId(file, name);
    for (const r of [...(p.reexports.get(name) ?? []), ...(p.reexports.get("*") ?? [])]) {
      const found = definedIn(r.file, r.name === "*" ? name : r.name, depth + 1);
      if (found) return found;
    }
    return null;
  };
  for (const p of parsed.values()) {
    for (const s of p.exports) {
      if (!s.body) continue;
      const from = symbolId(p.path, s.name);
      const visit = (n: ts.Node): void => {
        const callee = ts.isCallExpression(n) || ts.isNewExpression(n) ? n.expression : ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n) ? n.tagName : null;
        const namespace = callee && ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? p.bindings.get(callee.expression.text) : undefined;
        const target =
          callee && ts.isIdentifier(callee)
            ? p.bindings.get(callee.text)
            : namespace?.name === "*" && ts.isPropertyAccessExpression(callee!)
              ? { file: namespace.file, name: callee.name.text }
              : undefined;
        const to = target && target.name !== "*" ? definedIn(target.file, target.name) : null;
        if (to) edge("CALLS", "Symbol", from, "Symbol", to);
        ts.forEachChild(n, visit);
      };
      visit(s.body);
    }
  }

  for (const f of files.filter((x) => x.path.startsWith("formal/") && x.path.endsWith(".lean"))) {
    const spaces: string[] = [];
    for (const l of f.text.split("\n")) {
      const ns = /^namespace\s+([\w.]+)/.exec(l);
      if (ns) spaces.push(ns[1]);
      if (/^end\s+[\w.]+/.test(l)) spaces.pop();
      const th = /^(?:private\s+)?(?:theorem|lemma)\s+([\w.']+)/.exec(l);
      if (th) node("Theorem", theoremId([...spaces, th[1]].join(".")), { name: [...spaces, th[1]].join("."), file: f.path });
    }
  }
  const theorems = files.find((f) => f.path === "formal/theorems.json");
  let listed: { name?: string; rule?: string; statement?: string; mirrors?: string }[] = [];
  try {
    listed = theorems ? ((JSON.parse(theorems.text) as { theorems?: typeof listed }).theorems ?? []) : [];
  } catch {}
  for (const t of listed) {
    if (!t.name) continue;
    node("Theorem", theoremId(t.name), { name: t.name, rule: t.rule ?? "", statement: t.statement ?? "", mirrors: t.mirrors ?? "" });
    for (const m of mirrorsOf(t.mirrors ?? "")) {
      const inFile = m.file && parsed.get(m.file)?.exports.some((s) => s.name === m.name) ? symbolId(m.file, m.name) : null;
      const to = inFile ?? symbolsByName.get(m.name)?.[0];
      if (to) edge("PROVES", "Theorem", theoremId(t.name), "Symbol", to);
    }
  }

  for (const pr of prs) {
    const id = prId(pr);
    node("PR", id, {
      number: pr.number,
      title: pr.title,
      body: pr.body.slice(0, TEXT_CHARS),
      sha: pr.sha,
      at: pr.at,
      source: pr.source,
      findings: (pr.findings ?? []).join("\n").slice(0, TEXT_CHARS),
    });
    for (const f of pr.files) if (paths.has(f)) edge("CHANGED", "PR", id, "File", fileId(f));
  }

  for (const f of files.filter((x) => DECISION_DOCS.test(x.path))) {
    for (const b of blocksOf(f.text)) {
      const numbers = [...new Set([...b.text.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])))];
      const id = `decision:${sha(`${f.path}\n${b.text}`).slice(0, 16)}`;
      node("Decision", id, { text: b.text.slice(0, TEXT_CHARS), source: f.path, section: b.section, prs: numbers.join(",") });
      for (const n of numbers) edge("DECIDED_IN", "Decision", id, "PR", `pr_${n}`);
    }
  }

  return {
    nodes: [...nodes].map(([ext_id, n]) => ({ ext_id, kind: n.kind, props: n.props, hash: sha(JSON.stringify(n.props)).slice(0, 16) })),
    edges: [...edges.values()].filter((e) => nodes.has(e.from) && nodes.has(e.to)),
  };
}
