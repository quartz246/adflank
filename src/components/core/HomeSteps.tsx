"use client";
import { useEffect, useState } from "react";

const STEPS = [
  { title: "Read your website", line: "opening yourbrand.com · reading what the homepage sells" },
  { title: "Find your competitors", line: "asking Qloo which brands your fans also like · picking your direct competitors" },
  { title: "Profile their fans", line: "mapping where their fans are · their age skew, tastes, podcasts and shows" },
  { title: "A campaign per segment", line: "writing Meta, TikTok and Google ads for every segment of their fans" },
  { title: "Keep fighting, every day", line: "re-reading their fans on Qloo daily · new segments become new campaigns" },
];
const TICK = 2200;

/** The agency's steps playing on a loop: each goes queued -> working -> done, with the agent's line typing below. */
export default function HomeSteps() {
  const [at, setAt] = useState(0); // 0..STEPS.length (== all done, short pause)
  const [chars, setChars] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setAt((a) => (a + 1) % (STEPS.length + 2)), TICK);
    return () => clearInterval(iv);
  }, []);
  const line = STEPS[Math.min(at, STEPS.length - 1)].line;
  useEffect(() => {
    setChars(0);
    const iv = setInterval(() => setChars((c) => (c >= line.length ? c : c + 2)), 22);
    return () => clearInterval(iv);
  }, [line]);
  const done = at >= STEPS.length;
  return (
    <div className="home-run" aria-hidden>
      <ol className="home-steps">
        {STEPS.map((s, i) => {
          const st = i < at ? "done" : i === at ? "working" : "queued";
          return (
            <li key={s.title} className={st}>
              <span className="ic">{st === "done" ? "✓" : st === "working" ? <i className="spin" /> : i + 1}</span>
              {s.title}
            </li>
          );
        })}
      </ol>
      <p className="home-line">
        <span className="g">{done ? "✓" : ">"}</span>
        {done ? "run complete · every claim cites the Qloo call behind it" : line.slice(0, chars)}
        {!done && <span className="caret" />}
      </p>
    </div>
  );
}
