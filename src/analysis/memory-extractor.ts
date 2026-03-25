/**
 * Memory Extractor — automatically compresses therapy sessions into
 * structured memory at session end. Inspired by OpenViking's
 * session-to-long-term-memory extraction.
 */

import { type MemoryNode, type MemoryOperation, MemoryLevel } from "../core/stack-types.js";

export interface MemoryOperations {
  reasoning: string;
  writeOps: MemoryOperation[];
  editOps: MemoryOperation[];
  deleteOps: string[];
}

export interface ExtractionResult {
  written: number;
  edited: number;
  deleted: number;
  operations: MemoryOperations;
}

export interface SessionLog {
  sessionId: string;
  messages: Array<{ role: string; content: string; timestamp?: string }>;
  patternsDetected?: string[];
  correctionsApplied?: string[];
}

/**
 * Extract behavioral memory from a completed therapy session.
 * Generates structured MemoryOperations (write/edit/delete).
 */
export function extractMemoryFromSession(
  sessionLog: SessionLog,
  existingNodes: MemoryNode[],
): MemoryOperations {
  const writeOps: MemoryOperation[] = [];
  const editOps: MemoryOperation[] = [];
  const deleteOps: string[] = [];

  // Extract new patterns detected in this session
  if (sessionLog.patternsDetected) {
    for (const pattern of sessionLog.patternsDetected) {
      const existing = existingNodes.find(
        (n) => n.category === "patterns" && n.abstract.includes(pattern),
      );

      if (existing) {
        // Edit: increase confidence
        editOps.push({
          type: "edit",
          memoryId: existing.id,
          memoryType: "patterns",
          data: { confidence: Math.min(1, existing.confidence + 0.1) },
          reason: `Pattern "${pattern}" observed again in session ${sessionLog.sessionId}`,
        });
      } else {
        // Write: new pattern
        writeOps.push({
          type: "write",
          memoryType: "patterns",
          data: {
            id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            category: "patterns",
            level: MemoryLevel.DETAIL,
            abstract: `Detected pattern: ${pattern}`,
            confidence: 0.5,
            createdAt: new Date().toISOString(),
          },
          reason: `New pattern detected in session ${sessionLog.sessionId}`,
        });
      }
    }
  }

  // Extract corrections applied
  if (sessionLog.correctionsApplied) {
    for (const correction of sessionLog.correctionsApplied) {
      writeOps.push({
        type: "write",
        memoryType: "corrections",
        data: {
          id: `correction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          category: "corrections",
          level: MemoryLevel.DETAIL,
          abstract: `Correction applied: ${correction}`,
          confidence: 0.7,
          createdAt: new Date().toISOString(),
        },
        reason: `Correction from session ${sessionLog.sessionId}`,
      });
    }
  }

  // Decay old patterns not seen recently (confidence < 0.3 after 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const node of existingNodes) {
    if (
      node.confidence < 0.3 &&
      node.updatedAt &&
      node.updatedAt < thirtyDaysAgo
    ) {
      deleteOps.push(node.id);
    }
  }

  return {
    reasoning: `Session ${sessionLog.sessionId}: ${writeOps.length} new, ${editOps.length} updated, ${deleteOps.length} decayed`,
    writeOps,
    editOps,
    deleteOps,
  };
}

/**
 * Apply memory operations to a list of memory nodes.
 * Returns updated node list and operation counts.
 */
export function applyMemoryOperations(
  nodes: MemoryNode[],
  ops: MemoryOperations,
): { nodes: MemoryNode[]; result: ExtractionResult } {
  let written = 0;
  let edited = 0;
  let deleted = 0;

  const updatedNodes = [...nodes];

  // Apply writes
  for (const op of ops.writeOps) {
    if (op.data) {
      updatedNodes.push(op.data as unknown as MemoryNode);
      written++;
    }
  }

  // Apply edits
  for (const op of ops.editOps) {
    const idx = updatedNodes.findIndex((n) => n.id === op.memoryId);
    if (idx >= 0 && op.data) {
      updatedNodes[idx] = {
        ...updatedNodes[idx],
        ...(op.data as Partial<MemoryNode>),
        updatedAt: new Date().toISOString(),
      };
      edited++;
    }
  }

  // Apply deletes
  const deleteSet = new Set(ops.deleteOps);
  const finalNodes = updatedNodes.filter((n) => !deleteSet.has(n.id));
  deleted = updatedNodes.length - finalNodes.length;

  return {
    nodes: finalNodes,
    result: { written, edited, deleted, operations: ops },
  };
}
