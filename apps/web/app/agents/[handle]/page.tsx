import { notFound } from "next/navigation";
import { db, agents, users, personalityVectors, agentAvatars } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { generateAvatar, generateCharacterSheet } from "@holomime/core";
import type { PersonalityTraits } from "@holomime/types";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const agent = await getPublicAgent(handle);
  if (!agent) return { title: "Agent Not Found \u2014 holomime" };

  return {
    title: `${agent.name} \u2014 holomime`,
    description: agent.description ?? `${agent.name} on holomime`,
  };
}

async function getPublicAgent(handle: string) {
  const [result] = await db
    .select({
      id: agents.id,
      name: agents.name,
      handle: agents.handle,
      description: agents.description,
      forkCount: agents.forkCount,
      currentVectorId: agents.currentVectorId,
      createdAt: agents.createdAt,
      creatorUsername: users.username,
      creatorDisplayName: users.displayName,
      creatorAvatarUrl: users.avatarUrl,
    })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(eq(agents.handle, handle), eq(agents.isPublic, true)))
    .limit(1);

  return result ?? null;
}

export default async function PublicAgentPage({ params }: Props) {
  const { handle } = await params;
  const agent = await getPublicAgent(handle);

  if (!agent) notFound();

  // Get the current personality vector
  let traits: PersonalityTraits | null = null;
  let archetype: string | undefined;
  if (agent.currentVectorId) {
    const [vector] = await db
      .select()
      .from(personalityVectors)
      .where(eq(personalityVectors.id, agent.currentVectorId))
      .limit(1);

    if (vector) {
      traits = vector.traits as PersonalityTraits;
      archetype = (vector.signatures as any)?.archetype;
    }
  }

  // Generate avatar SVG
  const avatarSvg = traits ? generateAvatar(traits, { size: 160 }) : null;
  const sheet = traits ? generateCharacterSheet(agent.name, traits, archetype) : null;

  // Map warmth to hue for the glow
  const hue = traits ? Math.round(220 + (traits.warmth * (35 - 220 + 360)) % 360) : 270;

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Nav */}
      <nav className="border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2 text-zinc-100">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-[11px] font-bold text-white">
              H
            </div>
            <span className="text-sm font-semibold tracking-tight">holomime</span>
          </a>
          <a href="/sign-up" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors">
            Get Started
          </a>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          {/* Avatar with glow */}
          {avatarSvg && (
            <div className="relative mb-8">
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-20"
                style={{ background: `hsl(${hue}, 70%, 50%)` }}
              />
              <div
                className="relative rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
                dangerouslySetInnerHTML={{ __html: avatarSvg }}
              />
            </div>
          )}

          <h1 className="text-3xl font-bold text-zinc-100">{agent.name}</h1>
          <p className="mt-1 font-mono text-sm text-zinc-600">@{agent.handle}</p>

          {archetype && (
            <span className="mt-3 inline-block rounded-full bg-violet-500/10 px-4 py-1 text-sm font-medium text-violet-400 capitalize">
              {archetype}
            </span>
          )}

          {agent.description && (
            <p className="mt-4 max-w-lg text-zinc-400 leading-relaxed">{agent.description}</p>
          )}

          {/* Creator */}
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <span>Created by</span>
            <a href={`/@${agent.creatorUsername}`} className="font-medium text-violet-400 hover:text-violet-300 transition-colors">
              @{agent.creatorUsername}
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-10 flex justify-center gap-12">
          <StatCard label="Forks" value={agent.forkCount ?? 0} />
          <StatCard label="Created" value={new Date(agent.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })} />
        </div>

        {/* Fork CTA */}
        <div className="mt-10 flex justify-center">
          <a
            href="/sign-up"
            className="group relative rounded-xl bg-violet-600 px-6 py-3 text-base font-medium text-white transition-all hover:bg-violet-500"
          >
            <span className="absolute inset-0 rounded-xl bg-violet-600 blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
            <span className="relative">Adopt and make them your own</span>
          </a>
        </div>

        {/* Character Sheet */}
        {sheet && (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Character Sheet</h2>

            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-medium text-zinc-500 mb-2 uppercase tracking-wider">Strengths</p>
                <div className="flex flex-wrap gap-1.5">
                  {sheet.dominantTraits.map((trait: string) => (
                    <span key={trait} className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 capitalize">
                      {trait.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Trait bars */}
              {traits && (
                <div className="space-y-2">
                  {Object.entries(traits).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-28 text-[11px] text-zinc-500 capitalize">{key.replace("_", " ")}</span>
                      <div className="flex-1 h-1 rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
                          style={{ width: `${(value as number) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[11px] text-zinc-500">
                        {((value as number) * 100).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-20 text-center">
          <p className="text-xs text-zinc-700">
            Powered by <a href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors">holomime</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold font-mono text-zinc-100">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}
