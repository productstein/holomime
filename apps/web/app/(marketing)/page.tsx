"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage() {
  return (
    <div className="noise-bg min-h-screen bg-[#09090b] text-zinc-100">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/40 bg-[#09090b]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
              <span className="text-sm font-bold text-white">H</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">holomime</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="#features" className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block">Features</Link>
            <Link href="#pricing" className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block">Pricing</Link>
            <Link href="/discover" className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block">Discover</Link>
            <Link href="/sign-in" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Sign In</Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
          <div className="absolute -top-20 right-1/4 h-[400px] w-[400px] rounded-full bg-fuchsia-600/8 blur-[100px]" />
          <div className="absolute top-60 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-violet-500/5 blur-[80px]" />
        </div>

        <motion.div
          className="relative mx-auto max-w-4xl px-6 pb-20 pt-24 text-center sm:pt-32"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div
            variants={fadeUp}
            custom={0}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
            </span>
            The personality engine for AI agents
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-5xl font-bold leading-[1.08] tracking-tight sm:text-7xl"
          >
            Give your agent
            <br />
            <span className="gradient-text">a soul</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-400"
          >
            Structured, versioned, cross-provider personality infrastructure.
            One identity that compiles to Claude, GPT, Gemini, or local models.
            Not prompts — <span className="text-zinc-200">personality.</span>
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="group relative rounded-xl bg-violet-600 px-7 py-3.5 text-base font-medium text-white transition-all hover:bg-violet-500 hover:shadow-xl hover:shadow-violet-500/25"
            >
              Bring your first agent to life
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </Link>
            <Link
              href="/discover"
              className="rounded-xl border border-zinc-700 px-7 py-3.5 text-base font-medium text-zinc-300 transition-all hover:border-zinc-500 hover:bg-zinc-800/50"
            >
              Explore agents
            </Link>
          </motion.div>

          <motion.p variants={fadeUp} custom={4} className="mt-4 text-sm text-zinc-600">
            Free forever for 3 agents. No credit card required.
          </motion.p>

          {/* Studio preview mockup (hidden on mobile) */}
          <motion.div
            variants={fadeUp}
            custom={5}
            className="mx-auto mt-16 hidden max-w-3xl sm:block"
          >
            <div className="glow-violet rounded-2xl border border-zinc-800 bg-zinc-900 p-1">
              <div className="rounded-xl bg-zinc-900/80">
                {/* Fake window chrome */}
                <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-zinc-700" />
                    <span className="h-3 w-3 rounded-full bg-zinc-700" />
                    <span className="h-3 w-3 rounded-full bg-zinc-700" />
                  </div>
                  <div className="mx-auto rounded-md bg-zinc-800 px-12 py-1 text-xs text-zinc-500">
                    holomime.dev/studio/atlas
                  </div>
                </div>
                {/* Fake Studio UI */}
                <div className="grid grid-cols-12 gap-3 p-4">
                  {/* Sliders column */}
                  <div className="col-span-3 space-y-3 rounded-lg bg-zinc-800/50 p-3">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Traits</div>
                    {["warmth", "directness", "creativity", "humor"].map((trait, i) => (
                      <div key={trait} className="space-y-1">
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span className="capitalize">{trait}</span>
                          <span className="font-mono">{(0.4 + i * 0.15).toFixed(2)}</span>
                        </div>
                        <div className="h-1 rounded-full bg-zinc-700">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
                            style={{ width: `${40 + i * 15}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Chat column */}
                  <div className="col-span-6 rounded-lg bg-zinc-800/50 p-3">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Live Preview</div>
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <div className="rounded-xl bg-violet-600 px-3 py-1.5 text-[10px] text-white">How should I handle objections?</div>
                      </div>
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-xl bg-zinc-700 px-3 py-1.5 text-[10px] text-zinc-200">
                          Great question! I&apos;d recommend leading with empathy, then pivoting to data. Acknowledge the concern first...
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Avatar column */}
                  <div className="col-span-3 flex flex-col items-center justify-center rounded-lg bg-zinc-800/50 p-3">
                    <div className="mb-2 h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 opacity-80" />
                    <div className="text-[10px] font-medium text-zinc-300">Atlas</div>
                    <div className="text-[9px] text-zinc-500">Operator</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="relative border-t border-zinc-800/60 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center"
          >
            <motion.p variants={fadeUp} custom={0} className="text-sm font-medium uppercase tracking-widest text-violet-400">
              How it works
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="mt-3 text-3xl font-bold sm:text-4xl">
              You are Geppetto. They become real.
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="mt-16 grid gap-6 sm:grid-cols-3"
          >
            <StepCard
              number="01"
              title="Shape their identity"
              description="12 personality dimensions, cognitive styles, tone palettes, and behavioral policies. Adjust sliders and watch your agent come alive in real time."
              gradient="from-violet-500 to-fuchsia-500"
              custom={0}
            />
            <StepCard
              number="02"
              title="Send them into the world"
              description="One personality compiles to Claude, GPT, Gemini, or local models. Same soul, every provider. Version-controlled and immutable like code."
              gradient="from-fuchsia-500 to-rose-500"
              custom={1}
            />
            <StepCard
              number="03"
              title="Watch them grow"
              description="Health monitoring, drift detection, performance analytics. Know when your agent strays from who you made them. Fix it before it matters."
              gradient="from-rose-500 to-amber-500"
              custom={2}
            />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-zinc-800/60 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center"
          >
            <motion.p variants={fadeUp} custom={0} className="text-sm font-medium uppercase tracking-widest text-violet-400">
              Features
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="mt-3 text-3xl font-bold sm:text-4xl">
              Everything your agent needs to be real
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <FeatureCard icon="&#9881;" title="Personality Studio" description="12 trait sliders with live chat preview. Shape who your agent is and test them in real time." custom={0} />
            <FeatureCard icon="&#9889;" title="Cross-Provider Compiler" description="Same personality compiles to optimized configs for Claude, GPT, Gemini, and local models." custom={1} />
            <FeatureCard icon="&#128274;" title="Immutable Versioning" description="Every change creates a snapshot. Diff, rollback, branch, fork. Git for personality." custom={2} />
            <FeatureCard icon="&#128200;" title="Health Monitoring" description="Consistency scoring, drift detection, policy violation alerts. Always know if they're on track." custom={3} />
            <FeatureCard icon="&#127760;" title="Public Profiles" description="Publish your agent. Others can fork your personality and make it their own. Build a following." custom={4} />
            <FeatureCard icon="&#128187;" title="SDK & API" description="TypeScript SDK. REST API. Drop in 3 lines of code. Works with any LLM framework." custom={5} />
          </motion.div>
        </div>
      </section>

      {/* Code snippet */}
      <section className="border-t border-zinc-800/60 py-24">
        <div className="mx-auto max-w-3xl px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center"
          >
            <motion.p variants={fadeUp} custom={0} className="text-sm font-medium uppercase tracking-widest text-violet-400">
              Developer experience
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="mt-3 text-3xl font-bold sm:text-4xl">
              Three lines. That&apos;s it.
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={fadeUp}
            custom={2}
            className="mt-12"
          >
            <div className="glow-violet overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3.5">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="ml-3 font-mono text-xs text-zinc-500">index.ts</span>
              </div>
              <pre className="overflow-x-auto p-6 text-sm leading-7">
                <code>{codeSnippet}</code>
              </pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-zinc-800/60 py-24">
        <div className="mx-auto max-w-4xl px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center"
          >
            <motion.p variants={fadeUp} custom={0} className="text-sm font-medium uppercase tracking-widest text-violet-400">
              Pricing
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="mt-3 text-3xl font-bold sm:text-4xl">
              Start free. Scale as they grow.
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="mt-12 grid gap-6 sm:grid-cols-3"
          >
            <PricingCard
              plan="Free"
              price="$0"
              description="For experimenting"
              features={["3 agents", "1,000 compiles/mo", "Public profiles", "7-day telemetry"]}
              custom={0}
            />
            <PricingCard
              plan="Pro"
              price="$29"
              description="For builders"
              features={["Unlimited agents", "50,000 compiles/mo", "Custom eval suites", "90-day telemetry", "A/B testing"]}
              highlighted
              custom={1}
            />
            <PricingCard
              plan="Team"
              price="$99"
              description="For organizations"
              features={["10 seats", "200,000 compiles/mo", "Shared catalog", "1-year telemetry", "Marketplace publishing"]}
              custom={2}
            />
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-zinc-800/60 py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-[120px]" />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
          className="relative mx-auto max-w-2xl px-6 text-center"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-bold sm:text-4xl">
            Ready to give your agent a soul?
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="mt-4 text-zinc-400">
            Join builders who are crafting the next generation of AI agents
            with structured, measurable identity.
          </motion.p>
          <motion.div variants={fadeUp} custom={2}>
            <Link
              href="/sign-up"
              className="mt-8 inline-block rounded-xl bg-violet-600 px-8 py-4 text-base font-medium text-white transition-all hover:bg-violet-500 hover:shadow-xl hover:shadow-violet-500/25"
            >
              Get started for free &rarr;
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-violet-600">
              <span className="text-[10px] font-bold text-white">H</span>
            </div>
            <span className="text-sm text-zinc-500">&copy; 2026 holomime</span>
          </div>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="#pricing" className="transition-colors hover:text-zinc-300">Pricing</Link>
            <Link href="/discover" className="transition-colors hover:text-zinc-300">Discover</Link>
            <a href="https://github.com/holomime" className="transition-colors hover:text-zinc-300">GitHub</a>
            <a href="mailto:hello@holomime.com" className="transition-colors hover:text-zinc-300">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Subcomponents ──────────────────────────────────────────── */

function StepCard({ number, title, description, gradient, custom }: {
  number: string; title: string; description: string; gradient: string; custom: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      custom={custom}
      className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} font-mono text-sm font-bold text-white`}>
        {number}
      </div>
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
    </motion.div>
  );
}

function FeatureCard({ icon, title, description, custom }: {
  icon: string; title: string; description: string; custom: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      custom={custom}
      className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-violet-500/30 hover:bg-zinc-900"
    >
      <div className="mb-3 text-2xl">{icon}</div>
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
    </motion.div>
  );
}

function PricingCard({ plan, price, description, features, highlighted, custom }: {
  plan: string; price: string; description: string; features: string[]; highlighted?: boolean; custom: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      custom={custom}
      className={`relative rounded-2xl border p-6 ${
        highlighted
          ? "border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-500/20"
          : "border-zinc-800 bg-zinc-900/50"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-medium text-white">
          Most popular
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-100">{plan}</h3>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <div className="mt-4">
        <span className="text-4xl font-bold text-zinc-100">{price}</span>
        {price !== "$0" && <span className="text-zinc-500">/mo</span>}
      </div>
      <ul className="mt-6 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-400">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className={`mt-6 block w-full rounded-xl py-2.5 text-center text-sm font-medium transition-all ${
          highlighted
            ? "bg-violet-600 text-white hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20"
            : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
        }`}
      >
        Get started
      </Link>
    </motion.div>
  );
}

/* ─── Code snippet with syntax highlighting ──────────────────── */

const codeSnippet = (
  <>
    <span className="text-violet-400">import</span>
    <span className="text-zinc-300">{" { "}</span>
    <span className="text-amber-300">holomime</span>
    <span className="text-zinc-300">{" } "}</span>
    <span className="text-violet-400">from</span>
    <span className="text-emerald-400">{" '@holomime/sdk'"}</span>
    <span className="text-zinc-500">;</span>
    {"\n\n"}
    <span className="text-violet-400">const</span>
    <span className="text-zinc-300"> holo </span>
    <span className="text-violet-400">= new</span>
    <span className="text-amber-300"> holomime</span>
    <span className="text-zinc-300">{"({ "}</span>
    <span className="text-zinc-300">apiKey</span>
    <span className="text-zinc-500">: </span>
    <span className="text-emerald-400">&apos;mk_...&apos;</span>
    <span className="text-zinc-300">{" })"}</span>
    <span className="text-zinc-500">;</span>
    {"\n\n"}
    <span className="text-zinc-500">{"// Compile personality → provider-ready config"}</span>
    {"\n"}
    <span className="text-violet-400">const</span>
    <span className="text-zinc-300"> config </span>
    <span className="text-violet-400">= await</span>
    <span className="text-zinc-300"> holo.</span>
    <span className="text-sky-300">compile</span>
    <span className="text-zinc-300">{"({"}</span>
    {"\n  "}
    <span className="text-zinc-300">agentId</span>
    <span className="text-zinc-500">: </span>
    <span className="text-emerald-400">&apos;atlas&apos;</span>
    <span className="text-zinc-500">,</span>
    {"\n  "}
    <span className="text-zinc-300">provider</span>
    <span className="text-zinc-500">: </span>
    <span className="text-emerald-400">&apos;anthropic&apos;</span>
    <span className="text-zinc-500">,</span>
    {"\n"}
    <span className="text-zinc-300">{"}"}</span>
    <span className="text-zinc-300">)</span>
    <span className="text-zinc-500">;</span>
    {"\n\n"}
    <span className="text-zinc-500">{"// Use it"}</span>
    {"\n"}
    <span className="text-zinc-300">anthropic.messages.</span>
    <span className="text-sky-300">create</span>
    <span className="text-zinc-300">{"({ "}</span>
    <span className="text-zinc-300">system</span>
    <span className="text-zinc-500">: </span>
    <span className="text-zinc-300">config.system_prompt</span>
    <span className="text-zinc-500">, </span>
    <span className="text-zinc-300">...</span>
    <span className="text-zinc-300">{" })"}</span>
    <span className="text-zinc-500">;</span>
  </>
);
