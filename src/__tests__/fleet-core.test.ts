import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFleetConfig, discoverAgents, type FleetConfig } from "../analysis/fleet-core.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `holomime-fleet-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("loadFleetConfig", () => {
  it("parses a valid fleet.json", () => {
    const configPath = join(testDir, "fleet.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [
        { name: "agent-alpha", specPath: "/path/to/alpha/.personality.json", logDir: "/path/to/alpha/logs" },
        { name: "agent-beta", specPath: "/path/to/beta/.personality.json", logDir: "/path/to/beta/logs" },
      ],
    }));

    const config = loadFleetConfig(configPath);
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe("agent-alpha");
    expect(config.agents[1].name).toBe("agent-beta");
  });

  it("throws when agents array is missing", () => {
    const configPath = join(testDir, "fleet.json");
    writeFileSync(configPath, JSON.stringify({ version: "1.0" }));

    expect(() => loadFleetConfig(configPath)).toThrow("agents");
  });

  it("throws when an agent is missing required fields", () => {
    const configPath = join(testDir, "fleet.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [{ name: "test" }],
    }));

    expect(() => loadFleetConfig(configPath)).toThrow("specPath");
  });
});

describe("discoverAgents", () => {
  it("discovers agents from subdirectories with .personality.json", () => {
    // Create agent directories
    const alphaDir = join(testDir, "alpha");
    const betaDir = join(testDir, "beta");
    const emptyDir = join(testDir, "empty");

    mkdirSync(alphaDir, { recursive: true });
    mkdirSync(join(alphaDir, "logs"), { recursive: true });
    mkdirSync(betaDir, { recursive: true });
    mkdirSync(emptyDir, { recursive: true });

    writeFileSync(join(alphaDir, ".personality.json"), JSON.stringify({ version: "2.0", name: "Alpha" }));
    writeFileSync(join(betaDir, ".personality.json"), JSON.stringify({ version: "2.0", name: "Beta" }));
    // emptyDir has no .personality.json

    const config = discoverAgents(testDir);
    expect(config.agents).toHaveLength(2);

    const names = config.agents.map(a => a.name).sort();
    expect(names).toEqual(["alpha", "beta"]);

    // Alpha has logs/ subdir, so logDir should point there
    const alpha = config.agents.find(a => a.name === "alpha")!;
    expect(alpha.logDir).toContain("logs");

    // Beta has no logs/ subdir, so logDir falls back to agent dir
    const beta = config.agents.find(a => a.name === "beta")!;
    expect(beta.logDir).toContain("beta");
  });

  it("returns empty config for directory with no agents", () => {
    const config = discoverAgents(testDir);
    expect(config.agents).toHaveLength(0);
  });

  it("throws for non-existent directory", () => {
    expect(() => discoverAgents("/path/that/does/not/exist")).toThrow("not found");
  });
});
