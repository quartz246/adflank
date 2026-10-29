import Link from "next/link";

/** Shared top bar: logo mark plus whatever navigation the page passes in. */
export default function TopBar({ href = "/", children }: { href?: string; children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href={href} aria-label="AdFlank home">
          <span className="mark" aria-hidden>A</span>
          <span>Ad<b>Flank</b></span>
        </Link>
        <nav className="nav">{children}</nav>
      </div>
    </header>
  );
}
