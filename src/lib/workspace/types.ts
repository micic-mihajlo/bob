import type { ProjectTemplate } from "../types";

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export type ProjectSource = { kind: "template"; template?: ProjectTemplate } | { kind: "git"; url: string };

export interface WorkspaceOptions {
  /** Directory that holds every project. Defaults to `<cwd>/.data/workspaces`. */
  root?: string;
}

export interface ProjectLayout {
  dir: string;
  /** Bare repository every agent of the project clones, pushes to and fetches from. */
  origin: string;
  /** Empty HOME for git, so the host user's global config never applies. */
  home: string;
  agentsDir: string;
  /** A checkout of main with the project's dependencies installed once, copied into each workspace. */
  deps: string;
}

/** One agent's checkout of a project. `root` is the only directory its file tools can touch. */
export interface Workspace {
  root: string;
  projectId: string;
  agentId: string;
  project: ProjectLayout;
}

export interface Identity {
  name: string;
  email: string;
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PullRequest {
  branch: string;
  title: string;
  body: string;
  files: ChangedFile[];
  patch: string;
  headSha: string;
}
